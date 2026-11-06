/**
 * Wiring between the workflow engine's events and the durable memory archive.
 *
 * The rule this file exists to enforce: **a round that finished is recorded when
 * it finishes**, from the event that says so, not from a session-end hook and not
 * from an operator remembering to update `STATE.md`. Three seams carry that rule:
 *
 * | seam | when it fires | what it archives |
 * | --- | --- | --- |
 * | `workflow/agent-end` | one `agent()` call settles | that child's own result |
 * | `workflow/end` (folded into the run's `finally`) | the run settles | the round verdict |
 * | `round()` | the caller validated the report | the round's finding, status and evidence |
 *
 * Two properties are deliberate:
 *
 * - **It never affects the run.** Archiving is off the critical path: no throw
 *   escapes this module, and a disk that refuses the write costs a warning.
 * - **It only records runs this recorder adopted.** The engine's events are
 *   process-wide, so a concurrent run (another session, or a nested workflow in a
 *   child) shares the bus. Events for a run this recorder did not adopt are
 *   buffered while the run is still being started (the engine can emit before
 *   `start()` resolves) and dropped otherwise, so one round can never be filed
 *   under another round's identity.
 *
 * @module dsh-grok-workflow/memory/recorder
 */

import type { Context } from '@deepseek-ai/cordis'
import type { WorkflowAgentEndInfo, WorkflowAgentInfo, WorkflowAgentOutcome } from '@deepseek-ai/dsh-workflow'
import { redactError } from '../redact.js'
import type { WorkflowReport } from '../types.js'
import type { ArchiveKind, ArchiveOptions } from './archive.js'
import { appendArchiveEntry } from './archive.js'

/** Warning sink; the recorder never throws, so this is its only channel. */
export interface ArchiveLogger {
  warn(message: string): void
}

/** Member identity as the engine reports it at `agent-start`. */
export interface ArchiveMemberStart {
  seq: number
  label: string
  phase?: string
  childId?: string
}

/** Settlement as the engine reports it at `agent-end`. */
export interface ArchiveMemberEnd {
  seq: number
  outcome: WorkflowAgentOutcome
}

/** One round's verdict, supplied by the caller that validated the report. */
export interface RoundArchiveInput {
  /** Engine run id; also the entry's de-duplication identity. */
  runId: string
  /** Workflow name for the entry label. */
  runName?: string
  /** Session that owned the run. */
  sessionId?: string
  /** Round objective (redacted and bounded by the archive). */
  objective: string
  /** Report status: `completed` / `partial` / `failed`. */
  status?: string
  /** Why the round stopped, when it did not finish cleanly. */
  cause?: string
  /** The finding a later session needs: the answer, or why there is none. */
  summary: string
  /** File/URL locators the finding rested on. */
  evidence?: string[]
  /** Round turn number, when the caller knows it. */
  turn?: number
}

/** The archive seam one run uses. Every method is safe to call and never throws. */
export interface MemoryArchiver {
  /** Adopt a run, flushing events that arrived before `start()` resolved. */
  adopt(runId: string, runName?: string): void
  /** Record one child's identity (kept for its `agent-end`). */
  agentStart(runId: string, member: ArchiveMemberStart): void
  /** Record one child's finished result, at the moment the child settles. */
  agentEnd(runId: string, member: ArchiveMemberEnd): void
  /** Record the round verdict, at the moment the run settles; true when written. */
  round(input: RoundArchiveInput): boolean
  /** Stop recording and drop anything buffered. */
  dispose(): void
}

/** Runs kept in the pre-adoption buffer; foreign runs pass through it. */
const PENDING_RUN_LIMIT = 8
/** Buffered events kept per run, in arrival order. */
const PENDING_EVENT_LIMIT = 32
/** Child labels kept per run (a run starts at most `maxTotalAgents` children). */
const MEMBER_LIMIT = 64

/**
 * The live session store, read without `inject`.
 *
 * Measured: `ctx.sessions` throws `cannot get property "sessions" without inject`
 * on a plugin fiber (the service is provided by `dsh-session`, and this plugin
 * deliberately does not inject it — injecting would make the plugin's *apply*
 * wait for a service the bare unit-test contexts do not provide). `ctx.get(name)`
 * is the documented read-only accessor for exactly this case and returns
 * `undefined` when the service is absent.
 * @param ctx - plugin context.
 * @returns The store, or `undefined` when this composition has none.
 */
function sessionStoreOf(ctx: Context | undefined): { get?: (id: string) => unknown } | undefined {
  if (ctx === undefined) return undefined
  try {
    const read = (ctx as unknown as { get?: (name: string) => unknown }).get
    if (typeof read !== 'function') return undefined
    const store = read.call(ctx, 'sessions') as { get?: (id: string) => unknown } | undefined
    if (store !== undefined && store !== null) return store
  } catch {
    // A context without the accessor, or one that refuses the read, falls through.
  }
  try {
    // Fallback for a context that *does* inject the service (a test double, or a
    // future composition): the ordinary property answers there.
    return (ctx as unknown as { sessions?: { get?: (id: string) => unknown } }).sessions ?? undefined
  } catch {
    return undefined
  }
}

/**
 * Resolve a child's live session from a context, or `undefined`.
 *
 * Captured at `agent-start` and kept for the settlement, because the engine's
 * guest disposes the child (`host.disposeChild`) before the batched
 * `agent-end` reaches the host — measured: at settlement the store no longer
 * answers for that child id, so a lookup-only design archives nothing readable.
 * @param ctx - plugin context (may expose `sessions`).
 * @param childId - child session id from `agent-start`.
 * @returns The live child session object, when reachable.
 */
function sessionOfChild(ctx: Context | undefined, childId: string | undefined): unknown {
  if (ctx === undefined || childId === undefined || childId === '') return undefined
  try {
    const store = sessionStoreOf(ctx)
    if (store === undefined || typeof store.get !== 'function') return undefined
    return store.get(childId) ?? undefined
  } catch {
    return undefined
  }
}

/** What one recorder needs from its host. */
export interface ArchiveRecorderOptions {
  /** Context used to read a settled child's own transcript; absent in bare tests. */
  ctx?: Context
  /** Session that owns the runs this recorder sees. */
  sessionId?: string
  /** Archive directory override (tests, e2e isolation). */
  dir?: string
  logger: ArchiveLogger
  /** Clock injection for deterministic ordering in tests. */
  now?: () => number
}

type PendingArchiveEvent =
  | { type: 'start', member: ArchiveMemberStart }
  | { type: 'end', member: ArchiveMemberEnd }

/**
 * Read the last assistant text a child session produced.
 *
 * A child's result is not part of the `agent-end` payload (the engine reports the
 * identity and the outcome only), so the text is read from the child's own
 * transcript: `ctx.sessions.get(childId)` returns the live session, and the last
 * `assistant/message` event is what the child answered. Everything here is
 * defensive — a runtime without a session store, an unknown child id, a restored
 * event of an unexpected shape all read as "no text", and the entry is then
 * written with the outcome word alone rather than being skipped.
 * @param ctx - plugin context (may expose `sessions`).
 * @param childId - child session id from `agent-start`, when present.
 * @returns The child's final assistant text, or `undefined`.
 */
export function childResultText(ctx: Context | undefined, childId: string | undefined): string | undefined {
  return childFinding(ctx, childId).text
}

/** What one settled child left behind: its prose answer, its submitted result, its locators. */
export interface ChildFinding {
  /** The last assistant text the child produced, when it produced any. */
  text?: string
  /** The child's structured submission, reduced to one readable line. */
  submitted?: string
  /** File/URL locators the child's own submission rested on. */
  evidence: string[]
}

/** Characters kept from one submitted summary or locator, before the archive clamps again. */
const FINDING_CHARS = 2_000
/** Locators kept from one child submission. */
const FINDING_EVIDENCE = 8

/** Flatten one value to the single line the archive stores. */
function oneLine(value: unknown, limit = FINDING_CHARS): string | undefined {
  if (typeof value !== 'string') return undefined
  const flat = value.replace(/\s+/g, ' ').trim()
  if (flat === '') return undefined
  return flat.length <= limit ? flat : `${flat.slice(0, limit)}…`
}

/** Collect string locators from a submission's evidence-shaped arrays. */
function locatorsOf(submission: Record<string, unknown>): string[] {
  const out: string[] = []
  const push = (value: unknown): void => {
    const text = oneLine(value, 300)
    if (text !== undefined && !out.includes(text) && out.length < FINDING_EVIDENCE) out.push(text)
  }
  const arrays: Array<[string, string]> = [
    ['evidence', 'source'],
    ['checkedEvidence', 'locator'],
    ['deliverables', 'locator'],
  ]
  for (const [field, key] of arrays) {
    const list = submission[field]
    if (!Array.isArray(list)) continue
    for (const item of list) {
      const record = item as Record<string, unknown>
      if (record === null || typeof record !== 'object') continue
      push(record[key])
    }
  }
  return out
}

/**
 * Read what a settled child left in its own transcript.
 *
 * Two sources, in this order, because the engine reports a child's identity and
 * outcome at `agent-end` but never its result:
 *
 * 1. **Assistant text** — what the child said, when it answered in prose.
 * 2. **Its structured submission** — a structured child (worker or verifier)
 *    answers by calling a tool whose arguments carry the plugin's own result
 *    schema (`summary` for an execution result, `verdict` + `criteria` for a
 *    verification). Measured on this machine: a real child session's last
 *    `assistant/message` carries only `reasoning` and `tool-call` parts, so
 *    without this second source every child entry would say "no result text was
 *    readable" and a later round could see that a child ran but not what it found.
 *
 * Everything is defensive: a context with no `sessions` service, a missing child,
 * an unparsable argument string all degrade to "nothing read", never to a throw.
 * @param ctx - plugin context (may expose `sessions`).
 * @param childId - child session id from `agent-start`, when present.
 * @returns The readable finding; every field optional.
 */
export function childFinding(
  ctx: Context | undefined,
  childId: string | undefined,
  captured?: unknown,
): ChildFinding {
  const empty: ChildFinding = { evidence: [] }
  if (captured === undefined && (ctx === undefined || childId === undefined || childId === '')) return empty
  let events: readonly unknown[]
  try {
    // Service access is inside the guard on purpose: cordis throws when a service
    // is not provided on this context (`sessions` is not in this plugin's `inject`
    // list), and a memory aid must not be able to raise out of an engine event.
    let session = captured
    if (session === undefined) {
      const store = sessionStoreOf(ctx)
      if (store === undefined || typeof store.get !== 'function') return empty
      session = store.get(childId as string)
    }
    if (session === undefined || session === null) return empty
    const read = (session as { ownEvents?: () => readonly unknown[] }).ownEvents
    events = typeof read === 'function' ? read.call(session) : []
  } catch {
    return empty
  }
  const finding: ChildFinding = { evidence: [] }
  try {
    for (const event of events) {
      const record = event as { type?: unknown, data?: { message?: { content?: unknown } } }
      if (record.type !== 'assistant/message') continue
      const content = record.data?.message?.content
      if (!Array.isArray(content)) continue
      const parts: string[] = []
      for (const part of content) {
        const piece = part as { type?: unknown, text?: unknown, arguments?: unknown }
        if (piece.type === 'text' && typeof piece.text === 'string' && piece.text.trim() !== '') {
          parts.push(piece.text)
          continue
        }
        // A tool call carries its arguments as a JSON *string* (measured).
        if (piece.type !== 'tool-call' || typeof piece.arguments !== 'string') continue
        let parsed: unknown
        try {
          parsed = JSON.parse(piece.arguments)
        } catch {
          continue
        }
        if (parsed === null || typeof parsed !== 'object') continue
        const submission = parsed as Record<string, unknown>
        const summary = oneLine(submission.summary)
        const verdict = oneLine(submission.verdict, 40)
        const criteria = Array.isArray(submission.criteria) ? submission.criteria.length : undefined
        const tasks = Array.isArray(submission.tasks) ? submission.tasks : undefined
        const composed = summary ?? (verdict === undefined
          ? tasks === undefined
            ? undefined
            : `plan: ${tasks.length} task(s)`
          : `verdict ${verdict}${criteria === undefined ? '' : ` · ${criteria} criterion/criteria checked`}`)
        if (composed === undefined) continue
        finding.submitted = composed
        const locators = locatorsOf(submission)
        if (locators.length > 0) finding.evidence = locators
      }
      if (parts.length > 0) finding.text = parts.join('\n')
    }
  } catch {
    return finding
  }
  return finding
}

/** Say why a child's finding is missing, in terms a reader can act on. */
function missingReason(session: unknown, childId: string | undefined): string {
  if (childId === undefined) return 'the engine reported no child session id'
  if (session === undefined) return 'its child session was not reachable from this context'
  return 'its transcript carried neither assistant text nor a structured submission'
}

/**
 * Create the memory archiver for one run.
 * @param options - context, session, archive directory, logger and clock.
 * @returns A recorder whose every method is contained (never throws).
 */
export function createMemoryArchiver(options: ArchiveRecorderOptions): MemoryArchiver {
  /** Runs this recorder owns, with the label their entries carry. */
  const owned = new Map<string, { runName?: string }>()
  /** `seq` → child identity and its captured session, per owned run (bounded). */
  const members = new Map<string, Map<number, { member: ArchiveMemberStart, session?: unknown }>>()
  /** Events that arrived before their run was adopted, in arrival order. */
  const pending = new Map<string, PendingArchiveEvent[]>()
  /** Round entries already written, so a replayed settle is a no-op. */
  const roundsWritten = new Set<string>()
  let disposed = false
  const now = options.now ?? (() => Date.now())
  const archiveOptions = (): ArchiveOptions => ({
    ...options.dir === undefined ? {} : { dir: options.dir },
    logger: options.logger,
    now,
  })

  const memberStore = (runId: string): Map<number, { member: ArchiveMemberStart, session?: unknown }> => {
    const existing = members.get(runId)
    if (existing !== undefined) return existing
    const fresh = new Map<number, { member: ArchiveMemberStart, session?: unknown }>()
    if (members.size >= PENDING_RUN_LIMIT) {
      const oldest = members.keys().next()
      if (!oldest.done) members.delete(oldest.value)
    }
    members.set(runId, fresh)
    return fresh
  }

  const recordStart = (runId: string, member: ArchiveMemberStart): void => {
    const store = memberStore(runId)
    if (store.size >= MEMBER_LIMIT) return
    // Capture the child session now, while the engine still publishes it.
    const captured = sessionOfChild(options.ctx, member.childId)
    store.set(member.seq, {
      member,
      ...captured === undefined ? {} : { session: captured },
    })
  }

  const recordEnd = (runId: string, member: ArchiveMemberEnd): void => {
    try {
      recordEndUnsafe(runId, member)
    } catch (error) {
      // An engine listener must never raise: a failed archive costs a warning line.
      options.logger.warn(`memory archive skipped an agent settlement: ${redactError(error)}`)
    }
  }

  const recordEndUnsafe = (runId: string, member: ArchiveMemberEnd): void => {
    const known = members.get(runId)?.get(member.seq)
    const label = owned.get(runId)?.runName
    const childId = known?.member.childId
    const finding = childFinding(options.ctx, childId, known?.session)
    // The declared result wins: a child that *submits* an execution or verification
    // result has stated its finding, while its prose is usually a preamble
    // ("I'll create the files…"). A child that only talks gets its text.
    const summary = finding.submitted ?? finding.text
    const atMs = now()
    appendArchiveEntry({
      v: 1,
      id: `run:${runId}:agent:${member.seq}`,
      kind: 'agent' as ArchiveKind,
      at: new Date(atMs).toISOString(),
      atMs,
      runId,
      ...options.sessionId === undefined ? {} : { sessionId: options.sessionId },
      seq: member.seq,
      status: member.outcome,
      ...known?.member.phase === undefined ? {} : { phase: known.member.phase },
      label: known?.member.label ?? (label === undefined ? `agent ${member.seq}` : `${label} · agent ${member.seq}`),
      ...summary === undefined
        ? { summary: `child ${member.seq} settled as ${member.outcome}; ${missingReason(known?.session, childId)}` }
        : { summary },
      ...finding.evidence.length === 0 ? {} : { evidence: finding.evidence },
    }, archiveOptions())
  }

  const deliver = (runId: string, event: PendingArchiveEvent): void => {
    if (event.type === 'start') recordStart(runId, event.member)
    else recordEnd(runId, event.member)
  }

  /** Buffer an event for a run that has not been adopted (yet). */
  const buffer = (runId: string, event: PendingArchiveEvent): void => {
    const current = pending.get(runId)
    if (current === undefined) {
      if (pending.size >= PENDING_RUN_LIMIT) {
        const oldest = pending.keys().next()
        if (!oldest.done) pending.delete(oldest.value)
      }
      pending.set(runId, [event])
      return
    }
    if (current.length < PENDING_EVENT_LIMIT) current.push(event)
  }

  return {
    adopt(runId, runName) {
      if (disposed) return
      owned.set(runId, runName === undefined ? {} : { runName })
      const buffered = pending.get(runId)
      if (buffered === undefined) return
      pending.delete(runId)
      for (const event of buffered) deliver(runId, event)
    },
    agentStart(runId, member) {
      if (disposed) return
      if (!owned.has(runId)) {
        buffer(runId, { type: 'start', member })
        return
      }
      recordStart(runId, member)
    },
    agentEnd(runId, member) {
      if (disposed) return
      if (!owned.has(runId)) {
        buffer(runId, { type: 'end', member })
        return
      }
      recordEnd(runId, member)
    },
    round(input) {
      if (disposed) return false
      if (roundsWritten.has(input.runId)) return false
      roundsWritten.add(input.runId)
      const atMs = now()
      return appendArchiveEntry({
        v: 1,
        id: `run:${input.runId}`,
        kind: 'round',
        at: new Date(atMs).toISOString(),
        atMs,
        runId: input.runId,
        ...input.sessionId === undefined ? {} : { sessionId: input.sessionId },
        ...input.turn === undefined ? {} : { turn: input.turn },
        ...input.status === undefined ? {} : { status: input.status },
        ...input.runName === undefined ? {} : { label: input.runName },
        objective: input.objective,
        summary: input.cause === undefined ? input.summary : `${input.summary} (cause: ${input.cause})`,
        ...input.evidence === undefined ? {} : { evidence: input.evidence },
      }, archiveOptions()).written
    },
    dispose() {
      disposed = true
      pending.clear()
      members.clear()
      owned.clear()
      roundsWritten.clear()
    },
  }
}

/** Narrow an engine `agent-start` payload to what the archive keeps. */
export function memberFromStart(info: WorkflowAgentInfo): ArchiveMemberStart {
  return {
    seq: info.seq,
    label: info.label,
    ...info.phase === undefined ? {} : { phase: info.phase },
    ...info.childId === undefined ? {} : { childId: String(info.childId) },
  }
}

/** Narrow an engine `agent-end` payload to what the archive keeps. */
export function memberFromEnd(info: WorkflowAgentEndInfo): ArchiveMemberEnd {
  return { seq: info.seq, outcome: info.outcome }
}

// ---------------------------------------------------------------------------
// Round digest: what a later session needs from one finished round
// ---------------------------------------------------------------------------

/** Characters kept from one excerpt inside a round summary. */
const EXCERPT_CHARS = 900

/** Collapse whitespace and bound one excerpt. */
function excerpt(text: string, limit = EXCERPT_CHARS): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= limit ? flat : `${flat.slice(0, limit)}…`
}

/**
 * Build the one-line-plus-details summary a round entry carries.
 *
 * The archive's job is to answer "what has already been researched?" without the
 * transcript, so the summary is built from the *validated* report this plugin
 * wrote — never from a model paraphrase: the status, the verified-task count, the
 * confirmed criteria count, the answer excerpt when synthesis produced one, and
 * one line per task so a reader can see which part of the goal was actually
 * covered and which was not.
 * @param report - the validated report, when the run produced one.
 * @param cause - why the round stopped, when it did not finish cleanly.
 * @returns A compact multi-part summary (clamped again by the archive on write).
 */
export function roundArchiveSummary(report: WorkflowReport | undefined, cause: string | undefined): string {
  if (report === undefined) {
    return cause === undefined
      ? 'round settled without a report; no finding was archived for it'
      : `round produced no report: ${cause}`
  }
  const verified = report.tasks.filter(task => task.status === 'verified').length
  const parts: string[] = [
    `status ${report.status}`,
    `verified ${verified}/${report.tasks.length} task(s)`,
    `confirmed ${report.confirmed.length} criterion/criteria`,
  ]
  if (report.synthesis.summary !== undefined && report.synthesis.summary.trim() !== '') {
    parts.push(`answer: ${excerpt(report.synthesis.summary)}`)
  }
  for (const task of report.tasks) {
    const reason = task.error ?? report.incomplete.find(item => item.taskId === task.id)?.reason
    parts.push(`task ${task.id} ${task.status}: ${excerpt(task.title, 160)}${reason === undefined ? '' : ` — ${excerpt(reason, 240)}`}`)
  }
  for (const uncertainty of report.uncertainties.slice(0, 4)) {
    parts.push(`uncertain: ${excerpt(uncertainty.text, 240)}`)
  }
  for (const error of report.errors.slice(0, 4)) {
    parts.push(`error ${error.phase}: ${excerpt(error.message, 240)}`)
  }
  if (cause !== undefined) parts.push(`cause: ${cause}`)
  return parts.join(' · ')
}

/**
 * Collect the locators a round's finding rested on.
 * @param report - the validated report, when the run produced one.
 * @returns Confirmed-evidence strings, bounded by the archive on write.
 */
export function roundArchiveEvidence(report: WorkflowReport | undefined): string[] {
  if (report === undefined) return []
  return report.confirmed.map(item => `[${item.taskId}] ${item.criterion}: ${item.evidence}`)
}

/**
 * Archive one settled round on the spot, for callers that own no event stream.
 *
 * The front-desk tier (`runSingleCall`) is one `agent()` call in its own run: it has
 * a result but no planner/verifier fan-out, so there is nothing to watch and the
 * round verdict is the whole record. Passing it through this helper keeps the rule
 * identical to the full path — the entry is written before the caller returns, not
 * at session exit.
 * @param input - the round's verdict.
 * @param options - archive directory, logger and clock.
 * @returns True when this call wrote the entry (false for a duplicate or a failure).
 */
export function archiveRoundNow(
  input: RoundArchiveInput,
  options: ArchiveRecorderOptions,
): boolean {
  const archiver = createMemoryArchiver(options)
  const written = archiver.round(input)
  archiver.dispose()
  return written
}
