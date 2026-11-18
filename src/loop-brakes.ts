/**
 * Finite brakes for the Host-scheduled loop.
 *
 * Why this module exists: `src/loop.ts` arms one durable Schedule `rrule` task and
 * nothing else, so the only thing that can continue a loop is a Host heartbeat
 * delivery. Until now a delivery reached `agent/pre-step` as `source.kind: 'schedule'`
 * and took the `non-user-source` pass — the turn then did whatever the prompt asked,
 * for as long as the Schedule row existed. Nothing in the plugin could stop it early,
 * and nothing counted what it had already spent.
 *
 * This module is that stop. It answers one question per heartbeat — continue or stop —
 * from facts the plugin can observe without a timer, a thread, or a background task:
 *
 * | brake | fact | where it comes from |
 * | --- | --- | --- |
 * | operator stop | the stop marker exists | the filesystem, read per heartbeat |
 * | unload | the plugin was disposed | `ActiveState.disposed` |
 * | fail streak | consecutive rounds that produced no assistant message | this session's own round records |
 * | daily cap | rounds already admitted today | the same records, bucketed by local day |
 * | token budget | rounds admitted × a per-round reservation | the same records |
 * | time budget | elapsed since the day's first round | the same records |
 *
 * Every fact is derived from state that already exists, so the driver owns no timer
 * and no queue: when the process dies, the records are still in the session log and
 * the next heartbeat reads them back. That is the whole reason the accounting is a
 * session record rather than a module-level counter.
 *
 * Two limits are stated here rather than implied:
 *
 * - **The token brake is a budget, not a meter.** No usage record reaches a `pre-step`
 *   listener without the deprecated synchronous session reads, so the driver charges a
 *   fixed reservation per admitted round and stops when the reservation budget is
 *   exhausted. The number bounds what the loop may spend; it does not claim to equal
 *   what the provider billed.
 * - **A round's outcome is read as "did it write an assistant message".** A round that
 *   wrote none is counted as failed. A round that wrote an error report is not — it
 *   produced output, and this brake exists for silent stalls, not for disagreements
 *   about what the output should say.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Session } from '@deepseek-ai/dsh-session'
import { appendPluginRecord, pluginRecordOf } from '@deepseek-ai/dsh-session'
import { deleteSessionHeartbeats, loopPolicyFromConfig } from './loop.js'
import type { LoopPolicy, LoopScheduleLike } from './loop.js'
import { redactError } from './redact.js'
import type { WorkflowLogger } from './run.js'
import type { ResolvedConfig } from './types.js'

/** Stop marker relative to the workspace root; the operator's own switch. */
export const LOOP_STOP_MARKER = join('.rsi', 'STOP')

/** Environment variable that moves the stop marker, for a deployment that keeps it elsewhere. */
export const LOOP_STOP_ENV = 'GROK_WORKFLOW_STOP_FILE'

/** Most rounds one loop may admit in a single local day. */
export const MAX_LOOP_ROUNDS_PER_DAY = 24

/**
 * Tokens charged against the loop's budget for one admitted round.
 *
 * A reservation, not a measurement: see the module note. It is deliberately generous
 * (a full round of tools, context and output) because an under-charged budget would
 * stop a healthy loop early, which is the worse error for a brake to make.
 */
export const LOOP_TOKEN_ALLOWANCE_PER_ROUND = 200_000

/** Tokens one loop may be charged before the token brake stops it. */
export const MAX_LOOP_TOKENS = 2_000_000

/** Stable brake identities; a UI or a log reader branches on these, not on the prose. */
export type LoopBrakeCode =
  | 'loop/stop-file'
  | 'loop/disposed'
  | 'loop/fail-streak'
  | 'loop/daily-cap'
  | 'loop/token-cap'
  | 'loop/time-cap'

/** Everything one brake decision reads. All fields are observed, none are inferred. */
export interface LoopBrakeFacts {
  /** The operator stop marker exists at {@link loopStopFile}. */
  readonly stopFile: boolean
  /** The plugin has been unloaded or disposed. */
  readonly disposed: boolean
  /** Consecutive rounds, ending with the previous one, that produced no assistant message. */
  readonly consecutiveFailures: number
  /** Configured stop point (`loopFailStreak`), already clamped by the policy. */
  readonly failStreak: number
  /** Rounds admitted on the current local day. */
  readonly roundsToday: number
  /** Rounds the driver allows per local day, derived from the interval. */
  readonly dailyCap: number
  /** Tokens charged to the loop so far (reservations, not meter readings). */
  readonly tokensSpent: number
  /** Tokens the loop may be charged before it stops. */
  readonly tokenCap: number
  /** Milliseconds since the first round admitted on the current local day. */
  readonly elapsedMs: number
  /** Milliseconds the day's rounds may span (`rounds × interval`). */
  readonly timeCapMs: number
}

/** One brake decision. `stop` always names a code and a stated reason. */
export type LoopBrakeVerdict =
  | { readonly kind: 'continue' }
  | { readonly kind: 'stop'; readonly code: LoopBrakeCode; readonly detail: string }

/**
 * Decide whether a heartbeat may continue the loop.
 *
 * Order is the contract: the operator's own switch outranks every automatic brake, an
 * unloaded plugin outranks a live loop, and the cheap per-loop counters follow. First
 * match wins, so a loop that is both out of rounds and out of budget reports the round
 * brake — the one a reader can act on.
 * @param facts - observed facts; see {@link LoopBrakeFacts}.
 * @returns `continue`, or the first brake that holds.
 */
export function evaluateLoopBrakes(facts: LoopBrakeFacts): LoopBrakeVerdict {
  if (facts.stopFile) {
    return { kind: 'stop', code: 'loop/stop-file', detail: `the operator stop marker exists (${loopStopFile()})` }
  }
  if (facts.disposed) {
    return { kind: 'stop', code: 'loop/disposed', detail: 'the plugin was unloaded, so its loop has no owner' }
  }
  const failStreak = positive(facts.failStreak)
  if (failStreak !== undefined && facts.consecutiveFailures >= failStreak) {
    return {
      kind: 'stop',
      code: 'loop/fail-streak',
      detail: `${facts.consecutiveFailures} consecutive rounds produced no output (limit ${failStreak})`,
    }
  }
  const dailyCap = positive(facts.dailyCap)
  if (dailyCap !== undefined && facts.roundsToday >= dailyCap) {
    return {
      kind: 'stop',
      code: 'loop/daily-cap',
      detail: `${facts.roundsToday} rounds already ran today (limit ${dailyCap})`,
    }
  }
  const tokenCap = positive(facts.tokenCap)
  if (tokenCap !== undefined && facts.tokensSpent >= tokenCap) {
    return {
      kind: 'stop',
      code: 'loop/token-cap',
      detail: `${facts.tokensSpent} reserved tokens spent (budget ${tokenCap})`,
    }
  }
  const timeCapMs = positive(facts.timeCapMs)
  if (timeCapMs !== undefined && facts.elapsedMs >= timeCapMs) {
    return {
      kind: 'stop',
      code: 'loop/time-cap',
      detail: `${facts.elapsedMs} ms elapsed (envelope ${timeCapMs} ms)`,
    }
  }
  return { kind: 'continue' }
}

/**
 * Rounds one loop may admit in a local day.
 *
 * The interval is itself a daily bound (1440 minutes ÷ interval), so the cap can only
 * bind when rounds are admitted faster than the heartbeat: a re-opened loop, or a
 * deployment whose interval floor was lowered below this build's default. Deriving it
 * keeps the two numbers from disagreeing — a hard 24 would be a lie for a 10-minute loop.
 * @param intervalMinutes - effective minutes between heartbeats.
 * @returns at least 1, at most {@link MAX_LOOP_ROUNDS_PER_DAY}.
 */
export function dailyRoundCap(intervalMinutes: number): number {
  const interval = positive(intervalMinutes) ?? 1
  return Math.min(MAX_LOOP_ROUNDS_PER_DAY, Math.max(1, Math.floor((24 * 60) / interval)))
}

/**
 * Wall-clock span the day's rounds may occupy: every round may take one interval.
 *
 * Paired with the daily round cap — the same day, the same runaway — but measured in
 * time, so a loop whose rounds arrive faster than its own interval is stopped by
 * whichever bound it crosses first.
 * @param rounds - the rule's `COUNT`.
 * @param intervalMinutes - effective minutes between heartbeats.
 * @returns the span in milliseconds, never zero.
 */
export function loopTimeCapMs(rounds: number, intervalMinutes: number): number {
  const bound = positive(rounds) ?? 1
  const interval = positive(intervalMinutes) ?? 1
  return bound * interval * 60_000
}

/**
 * Where the operator stop marker lives.
 *
 * The default is this repository's documented switch, `.rsi/STOP`, because that is the
 * switch an operator of this deployment already knows; {@link LOOP_STOP_ENV} moves it
 * for a workspace that keeps its controls elsewhere.
 * @param root - workspace root; defaults to the process working directory.
 * @param env - environment to read the override from.
 * @returns an absolute path (or the override verbatim).
 */
export function loopStopFile(root: string = process.cwd(), env: NodeJS.ProcessEnv = process.env): string {
  const override = env[LOOP_STOP_ENV]
  if (typeof override === 'string' && override.trim() !== '') return override.trim()
  return join(root, LOOP_STOP_MARKER)
}

/** Record type owned by this plugin: one admitted heartbeat continuation. */
export const LOOP_ROUND_RECORD = 'plugin:grok-workflow/loop-round'

declare module '@deepseek-ai/dsh-session' {
  interface PluginRecordMap {
    /** One admitted loop round, written by the driver before the turn continues. */
    'plugin:grok-workflow/loop-round': LoopRoundRecord
  }
}

/**
 * One admitted round, as stored on the session.
 *
 * Written *before* the continuation turn runs: a round that is admitted and then
 * crashes still consumed a slot and possibly quota, so it must still count. The
 * outcome is therefore not in the record — it is read at the next heartbeat from
 * whether the session gained an assistant message.
 */
export interface LoopRoundRecord {
  /** Record schema version owned by this plugin. */
  readonly v: 1
  readonly sessionId: string
  /** 1-based ordinal within the loop. */
  readonly round: number
  /** Local calendar day (`YYYY-MM-DD`) the round was admitted on. */
  readonly day: string
  /** Admission time, epoch milliseconds. */
  readonly at: number
  /** Tokens charged for this round. */
  readonly tokens: number
  /** Assistant messages the session held at admission; the next beat compares against it. */
  readonly assistantCount: number
  /** Consecutive silent rounds *before* this one, as computed at admission. */
  readonly failureStreak: number
}

/** The configuration slice the brakes read. */
export interface LoopBrakeInput {
  readonly sessionId: string
  readonly session: Session | undefined
  readonly config: Pick<ResolvedConfig, 'timeoutMs' | 'loopIntervalMin' | 'loopMaxRounds' | 'loopFailStreak'>
  /** Clock reading; defaults to `Date.now()` in the port. */
  readonly now?: number
}

/** What the gate calls. Kept narrow so a test can supply a stub port. */
export interface LoopBrakePort {
  /** Decide whether this heartbeat may continue; writes nothing. */
  review(input: LoopBrakeInput): LoopBrakeVerdict
  /** Charge the round the gate is about to let continue. */
  admit(input: LoopBrakeInput): void
  /** Stop the stored loop: delete its Schedule rows so no further heartbeat arrives. */
  stop(input: { readonly sessionId: string; readonly code: LoopBrakeCode; readonly detail: string }): Promise<void>
}

/** Dependencies of the port. */
export interface LoopBrakesOptions {
  /** Lazy Schedule lookup: the gate may be installed before Schedule is composed. */
  readonly schedule?: () => LoopScheduleLike | undefined
  readonly logger: WorkflowLogger
  /** Whether the plugin is disposed; read per heartbeat. */
  readonly disposed?: () => boolean
  /** Stop marker path; read per heartbeat. */
  readonly stopFile?: () => string
  /** Clock seam. */
  readonly now?: () => number
}

/** Every round record this session holds, oldest first. */
export function readLoopRounds(session: Session | undefined): LoopRoundRecord[] {
  if (session === undefined || typeof session.ownEvents !== 'function') return []
  const rounds: LoopRoundRecord[] = []
  for (const event of session.ownEvents()) {
    const record = pluginRecordOf(event)
    if (record === undefined || record.type !== LOOP_ROUND_RECORD) continue
    const data = (record as { data?: unknown }).data
    if (isLoopRoundRecord(data)) rounds.push(data)
  }
  return rounds
}

/**
 * Charge one round to the session's log.
 *
 * A record is durable plugin state, not a correctness dependency for this turn: when the
 * session refuses the write the heartbeat still continues (the brake then under-counts,
 * which is the safe direction for a stop that must not fire on a transient write error).
 */
export function appendLoopRound(session: Session | undefined, record: LoopRoundRecord, logger: WorkflowLogger): void {
  if (session === undefined || typeof session.append !== 'function') return
  try {
    appendPluginRecord(session, LOOP_ROUND_RECORD, record)
  } catch (error) {
    logger.warn(`loop round record not persisted (${record.sessionId} round ${record.round}): ${redactError(error)}`)
  }
}

/**
 * Facts for one brake decision, computed from the session's own records.
 *
 * Pure apart from the two injected readers, so a test can pin each brake without a
 * filesystem, a clock or a Host.
 * @param input - session, configuration and clock reading.
 * @param observed - the two facts that do not live in the session log.
 * @returns the facts {@link evaluateLoopBrakes} consumes.
 */
export function loopBrakeFacts(
  input: LoopBrakeInput & { readonly policy: LoopPolicy },
  observed: { readonly stopFile: boolean; readonly disposed: boolean; readonly now: number },
): LoopBrakeFacts {
  const rounds = readLoopRounds(input.session)
  const today = localDay(observed.now)
  const todayRounds = rounds.filter(round => round.day === today)
  const last = rounds[rounds.length - 1]
  const assistantNow = assistantCountOf(input.session)
  const previousFailed = last !== undefined && assistantNow <= last.assistantCount
  const consecutiveFailures = last === undefined ? 0 : previousFailed ? last.failureStreak + 1 : 0
  // Scoped to the day, like the round cap it pairs with: a loop opened in a session that
  // ran one last month must not inherit that history and stop on its first beat.
  const first = todayRounds[0]
  return {
    stopFile: observed.stopFile,
    disposed: observed.disposed,
    consecutiveFailures,
    failStreak: input.policy.failStreak,
    roundsToday: todayRounds.length,
    dailyCap: dailyRoundCap(input.policy.intervalMinutes),
    tokensSpent: rounds.length * LOOP_TOKEN_ALLOWANCE_PER_ROUND,
    tokenCap: MAX_LOOP_TOKENS,
    elapsedMs: first === undefined ? 0 : Math.max(0, observed.now - first.at),
    timeCapMs: loopTimeCapMs(input.policy.rounds, input.policy.intervalMinutes),
  }
}

/**
 * Create the port the gate calls.
 *
 * The Schedule lookup is lazy and the stop-file path is re-read per heartbeat, so a
 * deployment that mounts Schedule later, or an operator who creates the marker while a
 * loop is running, is honoured without a restart.
 * @param options - lazy lookups and the logger.
 * @returns the port; `review` never writes and never throws.
 */
export function createLoopBrakes(options: LoopBrakesOptions): LoopBrakePort {
  const now = options.now ?? Date.now
  const stopFile = options.stopFile ?? (() => loopStopFile())
  const disposed = options.disposed ?? (() => false)

  const assess = (input: LoopBrakeInput): { facts: LoopBrakeFacts; at: number; rounds: LoopRoundRecord[]; policy: LoopPolicy } => {
    const at = input.now ?? now()
    const policy = loopPolicyFromConfig(
      input.config.timeoutMs,
      input.config.loopIntervalMin,
      input.config.loopMaxRounds,
      input.config.loopFailStreak,
    )
    const facts = loopBrakeFacts({ ...input, policy }, { stopFile: readStopMarker(stopFile()), disposed: disposed(), now: at })
    return { facts, at, rounds: readLoopRounds(input.session), policy }
  }

  return {
    review: (input) => evaluateLoopBrakes(assess(input).facts),
    admit: (input) => {
      const { facts, at, rounds } = assess(input)
      appendLoopRound(input.session, {
        v: 1,
        sessionId: input.sessionId,
        round: rounds.length + 1,
        day: localDay(at),
        at,
        tokens: LOOP_TOKEN_ALLOWANCE_PER_ROUND,
        assistantCount: assistantCountOf(input.session),
        failureStreak: facts.consecutiveFailures,
      }, options.logger)
    },
    stop: async ({ sessionId, code, detail }) => {
      const service = options.schedule?.()
      options.logger.warn(`loop stopped for session ${sessionId}: ${code} — ${detail}`)
      if (service === undefined) return
      try {
        const deleted = await deleteSessionHeartbeats(service, sessionId, options.logger)
        if (deleted > 0) options.logger.info?.(`loop stop deleted ${deleted} heartbeat${deleted === 1 ? '' : 's'} for session ${sessionId}`)
      } catch (error) {
        options.logger.warn(`loop stop for session ${sessionId} could not delete its heartbeat: ${redactError(error)}`)
      }
    },
  }
}

/** Read the marker without trusting the path to be readable. */
function readStopMarker(path: string): boolean {
  try {
    return existsSync(path)
  } catch {
    return false
  }
}

/** Assistant messages this session currently holds; `0` when it cannot be read. */
function assistantCountOf(session: Session | undefined): number {
  if (session === undefined || typeof session.deriveMessages !== 'function') return 0
  try {
    return session.deriveMessages().filter(message => (message as { role?: unknown }).role === 'assistant').length
  } catch {
    return 0
  }
}

/** Local calendar day of one clock reading, as `YYYY-MM-DD`. */
function localDay(at: number): string {
  const date = new Date(at)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** A finite, strictly positive number, or `undefined` (0 means "no cap" everywhere here). */
function positive(value: number): number | undefined {
  return Number.isFinite(value) && value > 0 ? value : undefined
}

/** True when a stored payload is a record this build can trust. */
function isLoopRoundRecord(value: unknown): value is LoopRoundRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Partial<LoopRoundRecord>
  return record.v === 1
    && typeof record.sessionId === 'string'
    && typeof record.round === 'number'
    && typeof record.day === 'string'
    && typeof record.at === 'number'
    && typeof record.tokens === 'number'
    && typeof record.assistantCount === 'number'
    && typeof record.failureStreak === 'number'
}
