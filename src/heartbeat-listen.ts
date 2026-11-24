/**
 * The intake's own listener on `agent/pre-step`.
 *
 * Why a second listener at all: the old front desk (`src/gate.ts`) owns both the
 * admission decision and the loop's brakes, and a block's work outlives the turn that
 * started it. The only clock the Host gives this plugin is a scheduled delivery, so the
 * intake needs its own view of that delivery on its own registration — one that
 * survives the front desk being switched off (`legacyGate: false`).
 *
 * Why it coexists instead of taking over: every existing profile runs the old chain,
 * and "the beat reached a session that still owes work" is an observation, not a
 * decision. With `ownsRouting: false` the handler computes nothing, changes nothing and
 * appends one line. Only `ownsRouting: true` — the shape where `installGate` is not
 * registered at all — reviews the brakes itself, and then it is the single owner of a
 * heartbeat's fate. `src/index.ts` never installs both shapes in one load.
 *
 * Why its own file: `src/block/brakes.ts` already records a heartbeat, into
 * `heartbeats.jsonl`. Writing to the same name would put two lines under one beat and
 * make "how many beats arrived" unanswerable, so this listener owns
 * `heartbeats-listen.jsonl` and never touches the intake's ledger, its verdicts or the
 * brakes' file.
 *
 * One beat, one line: the outcome says what the beat did (`observed` when this
 * listener only watched, `continued`/`stopped` when it routed), never two lines for one
 * delivery.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Session } from '@deepseek-ai/dsh-session'
import { blockLedgerDir, canonicalJson } from './block/index.js'
import type { BlockLedgerOptions } from './block/index.js'
import { openBlockIds } from './block/brakes.js'
import { isLoopHeartbeat } from './loop.js'
import type { LoopBrakeCode, LoopBrakeInput, LoopBrakePort } from './loop-brakes.js'
import { redactError } from './redact.js'
import type { ResolvedConfig } from './types.js'

/** File name of this listener's observations, one line per heartbeat. */
export const HEARTBEATS_LISTEN_FILE = 'heartbeats-listen.jsonl' as const

/**
 * Observations kept in one file.
 *
 * Same cap and same reason as the intake's own observer: a broken Schedule row must not
 * grow the file without bound. Past it the listener warns once and stops writing.
 */
export const HEARTBEAT_LISTEN_LIMIT = 200

/** What one beat did, as far as this listener is concerned. */
export type HeartbeatListenOutcome = 'observed' | 'continued' | 'stopped'

/** One recorded heartbeat. */
export interface HeartbeatListenObservation {
  v: 1
  kind: 'heartbeat-listen'
  sessionId: string
  outcome: HeartbeatListenOutcome
  /** Brake code, present only when the beat was stopped. */
  code?: string
  /** ISO timestamp of the observation. */
  at: string
}

/** Path of the observations: `<ledgerDir>/heartbeats-listen.jsonl`. */
export function heartbeatsListenFile(options: BlockLedgerOptions = {}): string {
  return join(blockLedgerDir(options), HEARTBEATS_LISTEN_FILE)
}

/** One of the three outcomes, or `undefined` for anything else a line may carry. */
function outcomeOf(value: unknown): HeartbeatListenOutcome | undefined {
  return value === 'observed' || value === 'continued' || value === 'stopped' ? value : undefined
}

/**
 * Read the observations back.
 *
 * Lenient like the ledger's own readers: a line that does not parse is skipped, because
 * an observation is evidence, not a gate. A missing file reads as "no observation yet".
 * @param options - ledger directory.
 * @returns The observations in file order.
 */
export function readHeartbeatListenObservations(options: BlockLedgerOptions = {}): HeartbeatListenObservation[] {
  let text: string
  try {
    text = readFileSync(heartbeatsListenFile(options), 'utf8')
  } catch {
    return []
  }
  const out: HeartbeatListenObservation[] = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    try {
      const parsed = JSON.parse(line) as Partial<HeartbeatListenObservation>
      if (parsed.v !== 1 || parsed.kind !== 'heartbeat-listen') continue
      if (typeof parsed.sessionId !== 'string' || typeof parsed.at !== 'string') continue
      const outcome = outcomeOf(parsed.outcome)
      if (outcome === undefined) continue
      out.push({
        v: 1,
        kind: 'heartbeat-listen',
        sessionId: parsed.sessionId,
        outcome,
        ...typeof parsed.code === 'string' ? { code: parsed.code } : {},
        at: parsed.at,
      })
    } catch {
      continue
    }
  }
  return out
}

/** Append one observation, creating the ledger directory on the first write. */
function appendObservation(observation: HeartbeatListenObservation, options: BlockLedgerOptions): void {
  const file = heartbeatsListenFile(options)
  mkdirSync(dirname(file), { recursive: true })
  const existing = (() => {
    try {
      return readFileSync(file, 'utf8')
    } catch {
      return ''
    }
  })()
  const line = canonicalJson(observation)
  const body = existing === '' || existing.endsWith('\n') ? `${existing}${line}\n` : `${existing}\n${line}\n`
  writeFileSync(file, body, 'utf8')
}

/** Payload shape of one `agent/pre-step` dispatch (only the fields read here). */
export interface HeartbeatPayload {
  agent?: { session?: Session } | undefined
  messages?: unknown[] | undefined
}

/** Plain text of one message: the parts the heartbeat marker can appear in. */
function messageText(message: { content?: unknown }): string {
  const content = message.content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const part of content) {
    const block = part as { type?: unknown, text?: unknown }
    if (block?.type === 'text' && typeof block.text === 'string') parts.push(block.text)
  }
  return parts.join('\n').trim()
}

/**
 * True when this message is a loop heartbeat delivered by the Host.
 *
 * Two facts have to agree: the delivery source (`schedule`) and the ownership marker
 * this plugin writes into every prompt it creates. Either alone is spoofable — a user
 * can paste the marker, and a scheduled reminder can carry arbitrary text — so the pair
 * is what identifies the heartbeat. Moved here from `src/gate.ts` so the two listeners
 * that can see a beat read one definition; the gate imports this one.
 *
 * It runs on **every** pre-step batch now, not only inside the gate's heartbeat branch,
 * so a malformed element has to read as "not a heartbeat" instead of throwing: a null in
 * the array must not take a turn down.
 * @param message - one message of the batch; null and undefined are tolerated.
 * @returns true only for a scheduled delivery carrying this plugin's marker.
 */
export function isHeartbeatMessage(message: HeartbeatMessageLike | null | undefined): boolean {
  if (message === null || message === undefined) return false
  const source = (message as { source?: unknown }).source as { kind?: unknown } | undefined
  if (source?.kind !== 'schedule') return false
  return isLoopHeartbeat(messageText(message))
}

/** The session id a dispatch belongs to, spelled exactly like the gate's own id. */
function sessionIdOf(payload: HeartbeatPayload): string {
  const id = payload.agent?.session?.id
  const text = id === undefined ? '' : String(id)
  return text === '' ? 'unknown-agent' : text
}

/** The shape this module reads off one message; everything else is opaque. */
interface HeartbeatMessageLike {
  content?: unknown
  source?: unknown
}

/** The first heartbeat in the batch, or `undefined` when this is no beat at all. */
function heartbeatOf(payload: HeartbeatPayload): HeartbeatMessageLike | undefined {
  const messages = payload.messages
  if (!Array.isArray(messages)) return undefined
  return messages.find(message => isHeartbeatMessage(message as HeartbeatMessageLike | null | undefined)) as
    HeartbeatMessageLike | undefined
}

/** What one heartbeat's brakes decided, in the shape a caller routes on. */
export type HeartbeatReview =
  | { kind: 'pass', reason: 'subagent' | 'loop-continuation' }
  | { kind: 'stop', agentId: string, code: LoopBrakeCode, detail: string }

/** Dependencies of one review. */
export interface HeartbeatReviewInput {
  /** The brake port, or `undefined` when no driver is wired. */
  loop?: LoopBrakePort | undefined
  payload: HeartbeatPayload
  /**
   * The configuration slice the brakes read.
   *
   * A thunk, not a value: with no port the review returns before it needs one, exactly
   * like the gate code this replaced — a load without a driver must not start reading
   * live configuration it will not use.
   */
  config: () => LoopBrakeInput['config']
}

/**
 * Review one heartbeat's brakes.
 *
 * The order is the contract and is copied from the gate's heartbeat branch: a delegated
 * child never owns a loop, a load without a driver can only continue, and a tripped
 * brake stops before anything is charged. The caller maps the answer onto its own
 * decision type, so this stays a pure function with no listener and no I/O.
 * @param input - the port, the payload and the configuration reader.
 * @returns `pass` with the gate's own reason label, or `stop` with the brake's code.
 */
export function reviewHeartbeat(input: HeartbeatReviewInput): HeartbeatReview {
  const session = input.payload.agent?.session
  const header = session?.header
  // A Schedule targets the session the user opened; a beat inside a child is a
  // mis-targeted delivery, and charging it would put the parent's accounting in the
  // child's log.
  if (header?.origin === 'subagent' || (header?.delegationDepth ?? 0) > 0) return { kind: 'pass', reason: 'subagent' }
  const agentId = sessionIdOf(input.payload)
  const loop = input.loop
  if (loop === undefined) return { kind: 'pass', reason: 'loop-continuation' }
  const round: LoopBrakeInput = { sessionId: agentId, session, config: input.config() }
  const verdict = loop.review(round)
  if (verdict.kind === 'stop') return { kind: 'stop', agentId, code: verdict.code, detail: verdict.detail }
  // Charged before the turn runs: an admitted round consumes a slot and may already have
  // spent quota even if the turn then crashes.
  loop.admit(round)
  return { kind: 'pass', reason: 'loop-continuation' }
}

/** Dependencies of the listener. */
export interface HeartbeatListenInput {
  /**
   * Host context; only `on` is used.
   *
   * Typed as `unknown` on purpose: cordis's `on` is a generic overload over its own
   * event map, so a structural parameter type cannot name it without importing the
   * whole event table. The runtime check below is what actually guards it.
   */
  ctx: { on?: unknown }
  logger: { warn(message: string): void }
  /** `true` installs the listener; anything else installs nothing at all. */
  enabled: boolean
  /**
   * `true` when the old front desk is not registered, so this listener owns the brakes.
   *
   * It is not a preference: with the gate gone there is no other place a heartbeat can
   * be stopped, and with the gate present a second review would charge a round twice.
   */
  ownsRouting: boolean
  /** The brake port; required in the owning shape, unused otherwise. */
  loop?: LoopBrakePort | undefined
  /** Load-time configuration, and the live reader the brakes fall back to. */
  config: ResolvedConfig
  readConfig?: (() => ResolvedConfig) | undefined
  options?: {
    /** Ledger directory; defaults to the environment-aware block ledger dir. */
    dir?: string
    /** Clock override, for tests. */
    now?: () => number
    /** Observation cap, for tests. */
    limit?: number
  }
}

/**
 * Install the intake's heartbeat listener.
 *
 * @param input - context, logger, the two switches and optional test seams.
 * @returns The disposer cordis already owns; a no-op when the switch is off.
 */
export function installHeartbeatListen(input: HeartbeatListenInput): () => void {
  const { ctx, logger, enabled, ownsRouting } = input
  // Off is inert: not a listener that returns early, but no listener at all, so the
  // registered chain is exactly the pre-feature one.
  if (enabled !== true) return () => {}
  const on = ctx.on as ((event: string, handler: unknown) => unknown) | undefined
  if (typeof on !== 'function') return () => {}
  const options: BlockLedgerOptions = input.options?.dir === undefined ? {} : { dir: input.options.dir }
  const now = input.options?.now ?? (() => Date.now())
  const limit = input.options?.limit ?? HEARTBEAT_LISTEN_LIMIT
  let warnedFull = false

  /** The live configuration, degrading to the load-time snapshot like the gate does. */
  const scope = (): LoopBrakeInput['config'] => {
    if (input.readConfig === undefined) return input.config
    try {
      return input.readConfig()
    } catch {
      return input.config
    }
  }

  /** Append one line, or stop at the cap with a single warning. */
  const record = (sessionId: string, outcome: HeartbeatListenOutcome, code?: string): void => {
    if (readHeartbeatListenObservations(options).length >= limit) {
      if (!warnedFull) {
        warnedFull = true
        logger.warn(`heartbeat listener: observations reached the ${limit}-line cap; no more are recorded`)
      }
      return
    }
    appendObservation({
      v: 1,
      kind: 'heartbeat-listen',
      sessionId,
      outcome,
      ...code === undefined ? {} : { code },
      at: new Date(now()).toISOString(),
    }, options)
  }

  /** Never let evidence-keeping decide a turn: a failed write is warned about and dropped. */
  const tryRecord = (sessionId: string, outcome: HeartbeatListenOutcome, code?: string): void => {
    try {
      record(sessionId, outcome, code)
    } catch (error) {
      logger.warn(`heartbeat listener: could not record the observation: ${redactError(error)}`)
    }
  }

  /**
   * Whether this batch is a heartbeat, with an unreadable batch counted as "no".
   *
   * The predicate runs on every pre-step now, and this listener must never be the reason
   * a turn fails: a batch it cannot read is warned about and then treated as ordinary,
   * which is the same "warn and continue" rule the rest of the handler follows.
   */
  const isBeat = (payload: HeartbeatPayload): boolean => {
    try {
      return heartbeatOf(payload) !== undefined
    } catch (error) {
      logger.warn(`heartbeat listener: could not tell whether this batch is a heartbeat: ${redactError(error)}`)
      return false
    }
  }

  /**
   * The observing shape: decide nothing, note the beat, pass the decision through.
   *
   * The open-block read is the intake's own rule for "this session still owes work";
   * with nothing owed the file stays empty, so its line count answers "how many beats
   * reached work that was still owed" rather than "how many beats arrived".
   */
  const observeOnly = async (payload: HeartbeatPayload, next: () => Promise<unknown>): Promise<unknown> => {
    const decision = await next()
    if (!isBeat(payload)) return decision
    try {
      const sessionId = sessionIdOf(payload)
      if ((await openBlockIds(sessionId, options)).length > 0) tryRecord(sessionId, 'observed')
    } catch (error) {
      logger.warn(`heartbeat listener: could not read the open blocks: ${redactError(error)}`)
    }
    return decision
  }

  /**
   * The owning shape: review the brakes, then route.
   *
   * A failure while reviewing continues the turn (a listener must not veto on its own
   * bug), but a failure *after* a stop verdict still refuses it: the one thing this
   * branch may never do is run a beat the brakes already stopped.
   */
  const ownsRoutingHandler = async (payload: HeartbeatPayload, next: () => Promise<unknown>): Promise<unknown> => {
    if (!isBeat(payload)) return next()
    let review: HeartbeatReview
    try {
      review = reviewHeartbeat({ loop: input.loop, payload, config: scope })
    } catch (error) {
      logger.warn(`heartbeat listener: the brake review failed, continuing the turn: ${redactError(error)}`)
      return next()
    }
    const sessionId = sessionIdOf(payload)
    if (review.kind === 'stop') {
      tryRecord(sessionId, 'stopped', review.code)
      try {
        await input.loop?.stop({ sessionId, code: review.code, detail: review.detail })
      } catch (error) {
        logger.warn(`heartbeat listener: could not delete the stopped loop's schedule: ${redactError(error)}`)
      }
      return { kind: 'reject' }
    }
    tryRecord(sessionId, 'continued')
    return next()
  }

  const dispose = on('agent/pre-step', ownsRouting ? ownsRoutingHandler : observeOnly)
  return typeof dispose === 'function' ? dispose as () => void : () => {}
}
