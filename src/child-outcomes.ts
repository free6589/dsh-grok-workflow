/**
 * What each child run actually ended as, and the one report repair it enables.
 *
 * Why this module exists (T1, the null-semantics collapse): the published PTC
 * engine's guest returns `null` for *every* child that did not finish normally —
 * a dead provider, a timed-out child, a cancelled child and a child that merely
 * never submitted its structured result are one value there
 * (`WorkflowExecution.agent()`), and the host's `childResult()` forwards only
 * `{output, stopReason, structured}`, so the child's own failure detail never
 * reaches the script. The generated script therefore has one shape to describe
 * both cases, and it describes both as `format-error`.
 *
 * Measured (agent-99, 3691 child calls over 21 runs): 530 transport, auth and
 * timeout deaths were filed as format errors against 25 real ones.
 *
 * The engine stays untouched. What the plugin *can* see is the other side of the
 * same seam: `subagents.startActivation` hands back the child's run handle, whose
 * `result` settles with the real `stopReason` and provider `diagnostic`
 * (`src/team-engine.ts` records those into a bounded ledger). With that evidence
 * the host rewrites the null-collapse rows of the report it assembled, so the
 * report, the answer and the memory archive name the cause the child died of.
 *
 * Two limits are deliberate, and both are honest rather than convenient:
 *
 * - The repair is *reporting only*. The script's own routing decision was already
 *   taken on a null it could not explain, so this module never claims to have
 *   changed which route answered, how many attempts ran or whether a resubmit
 *   fired. Telling the script the cause needs a channel it does not have yet
 *   (`docs/knowledge/DECISIONS.md`, T1 step 2).
 * - A row is rewritten only when the evidence for it is unambiguous: every child
 *   of that role in the run must have died of the same class, and no child of that
 *   role may have *completed* without a structured result. A mixed run keeps the
 *   script's own wording, because a guess here would be the same defect in a new
 *   place.
 *
 * @module dsh-grok-workflow/child-outcomes
 */

import { parseMemberLabel } from './naming.js'
import type { AttemptFailure, FailureCategory, FailureClass, RoleName, WorkflowReport } from './types.js'

/** Child outcomes kept per context; older entries are dropped (bounded memory). */
export const CHILD_OUTCOME_LIMIT = 512
/** Longest cause line this module writes into a report. */
export const CHILD_CAUSE_CHARS = 200
/** The guest's null-collapse reason, as `src/script.ts` writes it. */
export const NULL_COLLAPSE_REASON = 'no valid structured result'

/** The terminal facts one child run settled with. */
export interface ChildTerminal {
  /** The child's `SubagentResult.stopReason` (`completed`/`aborted`/`error`/…). */
  stopReason: string
  /** The provider's own failure detail, when it gave one. */
  diagnostic?: string
}

/** One recorded child settlement, with the identity a report row can be matched to. */
export interface ChildOutcome extends ChildTerminal {
  /** Monotonic per log; `mark()`/`since()` slice the log per run. */
  seq: number
  /** The child's session id, as the activation receipt reported it. */
  childId?: string
  /** The activation label the engine asked for (before the twin rewrote it). */
  label?: string
  /** Role read from the child prompt's title line, when it names one. */
  role?: RoleName
  /** 1-based attempt the title line names, when it names one. */
  attempt?: number
  /** Route label the child asked for (`provider/model`, or `inherit`). */
  route?: string
}

/** The bounded, per-context child-outcome log. */
export interface ChildOutcomeLog {
  /** Current position; take this before a run starts. */
  mark(): number
  /** Every outcome recorded after `mark`, oldest first. */
  since(mark: number): ChildOutcome[]
  /** The newest outcome for one child session id. */
  of(childId: string): ChildOutcome | undefined
  /** Record one settlement (oldest entries are dropped past the cap). */
  add(outcome: Omit<ChildOutcome, 'seq'>): void
}

/** A log that records nothing, for a context with no observed engine. */
const EMPTY_LOG: ChildOutcomeLog = {
  mark: () => 0,
  since: () => [],
  of: () => undefined,
  add: () => {},
}

/**
 * Create a bounded child-outcome log.
 * @returns The log; all operations are synchronous and never throw.
 */
export function createChildOutcomeLog(): ChildOutcomeLog {
  const entries: ChildOutcome[] = []
  let seq = 0
  let base = 0
  return {
    mark: () => base + entries.length,
    since(mark) {
      const from = Math.max(0, mark - base)
      return entries.slice(from)
    },
    of(childId) {
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        if (entries[index]!.childId === childId) return entries[index]
      }
      return undefined
    },
    add(outcome) {
      seq += 1
      entries.push({ ...outcome, seq })
      if (entries.length > CHILD_OUTCOME_LIMIT) {
        const drop = entries.length - CHILD_OUTCOME_LIMIT
        entries.splice(0, drop)
        base += drop
      }
    },
  }
}

/** The log used when nothing observed the engine (non-PTC engine, bare tests). */
export function emptyChildOutcomeLog(): ChildOutcomeLog {
  return EMPTY_LOG
}

/**
 * The failure class a child's terminal state means.
 *
 * `completed` is the only state that belongs to the format-error family: the
 * child finished and simply never submitted a structured result. Every other
 * state is a death, classified from the provider's own words with the same table
 * the script uses for a thrown failure (`classifyChildFailureText`, pinned equal
 * by `test/null-collapse.spec.ts`).
 * @param outcome - the child's terminal state.
 * @returns The class that state belongs to.
 */
export function childFailureClass(outcome: ChildTerminal): FailureClass {
  const stop = outcome.stopReason
  if (stop === 'completed') return 'format-error'
  if (stop === 'aborted' || stop === 'cancelled') return 'cancelled'
  if (stop === 'max-tokens' || stop === 'refusal') return 'unknown'
  return classifyChildFailureText(outcome.diagnostic)
}

/**
 * Mirror of the generated script's `classifyFailureText` (src/script.ts).
 *
 * Mirrored rather than shared because the script is source text evaluated in the
 * engine's own realm; the two tables are pinned equal by a test that extracts the
 * guest function and compares verdicts on every message below. Keep the order and
 * the patterns identical: a class that changes on one side only would make the
 * pre-call and post-call wordings disagree.
 * @param value - failure text (a diagnostic, an error message, or anything).
 * @returns The class that text names, or `unknown`.
 */
export function classifyChildFailureText(value: unknown): FailureClass {
  const message = String(value ?? '')
  if (/rate.?limit|too many requests|\b429\b|quota exceeded|resource[_ ]exhausted/i.test(message)) return 'rate-limit'
  if (/\b5\d{2}\b|internal server error|bad gateway|service unavailable|gateway time|overloaded/i.test(message)) return 'server-error'
  if (/ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|network error|fetch failed|connection (reset|refused|closed|dropped)/i.test(message)) return 'connection'
  if (/timed? ?out|timeout|deadline exceeded|aborted/i.test(message)) return 'timeout'
  if (/model .*(not found|not available|does not exist|is unavailable)|unknown model|no adapter|NO_ADAPTER|unsupported model|model_not_found/i.test(message)) return 'model-unavailable'
  // Credential and permission refusals are the same conclusion for a reader: this
  // route cannot answer, so another model or route may. Without this arm a 403
  // lands in `unknown`, which reads as "we do not know what happened".
  if (/\b40[13]\b|unauthorized|forbidden|invalid api key|invalid_api_key|permission denied/i.test(message)) return 'model-unavailable'
  if (/structured[_ ]output|schema (violation|mismatch|mismatched)|invalid (json|output|response)|could not parse|format error|expected ','|expected '}'|expected ':'|expected double-quoted property name|unexpected (end of json|token)/i.test(message)) return 'format-error'
  return 'unknown'
}

/** Who has to fix a failure of this class (mirrors `failureCategory` in the script). */
export function categoryForFailureClass(failureClass: FailureClass): FailureCategory {
  if (failureClass === 'cancelled') return 'cancelled'
  if (failureClass === 'task-failed' || failureClass === 'verification-failed') return 'quality'
  if (failureClass === 'budget-exhausted') return 'configuration'
  if (failureClass === 'unknown') return 'unknown'
  return 'infrastructure'
}

/** Collapse any text to one bounded line, without inventing content. */
function oneLine(value: unknown, limit: number = CHILD_CAUSE_CHARS): string {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= limit) return text
  return `${text.slice(0, Math.max(0, limit - 1))}…`
}

/**
 * The plain-language cause of one child's death, for a report reason or a memory
 * entry. The stop reason leads (it is the engine's own word); the provider's
 * diagnostic follows when there is one.
 * @param outcome - the child's terminal state.
 * @returns One bounded line naming the cause.
 */
export function childStopPhrase(outcome: ChildTerminal): string {
  const stop = outcome.stopReason
  const detail = oneLine(outcome.diagnostic, CHILD_CAUSE_CHARS - 40)
  let cause: string
  if (stop === 'aborted' || stop === 'cancelled') cause = 'the child run was cancelled'
  else if (stop === 'max-tokens') cause = 'the child hit its own token ceiling'
  else if (stop === 'refusal') cause = 'the child declined the task'
  else if (stop === 'completed') cause = 'the child finished without submitting a structured result'
  else if (/timed? ?out|timeout|deadline exceeded/i.test(detail)) cause = 'the child run timed out'
  else cause = `the child run ended \`${stop}\``
  return detail === '' ? cause : `${cause} (${detail})`
}

/**
 * The reason line this module writes over a null-collapse row.
 * @param role - the role the row belongs to.
 * @param outcome - the child's terminal state.
 * @returns One bounded, redaction-friendly line.
 */
export function childFailureReason(role: string, outcome: ChildTerminal): string {
  return oneLine(`${role} call produced no result: ${childStopPhrase(outcome)}`)
}

/** Whether a report row is the guest's null-collapse wording. */
function isCollapse(failureClass: FailureClass | undefined, reason: string | undefined): boolean {
  return failureClass === 'format-error' && typeof reason === 'string' && reason.includes(NULL_COLLAPSE_REASON)
}

/** The role the guest's own reason line starts with, when it names one. */
function roleFromReason(reason: string): RoleName | undefined {
  const match = /^(planner|worker|verifier|supervisor|synthesizer)\b/.exec(reason.trim())
  return match === null ? undefined : match[1] as RoleName
}

/** Normalize an attempt number to the 1-based numbering both sides use. */
function attemptKey(value: number | undefined): number {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 1) return 1
  return Math.trunc(number)
}

interface Groups {
  /** Keyed `role|attempt`. */
  attempt: Map<string, ChildOutcome[]>
  /** Keyed `role`, every attempt. */
  role: Map<string, ChildOutcome[]>
}

function groupOutcomes(outcomes: readonly ChildOutcome[]): Groups {
  const attempt = new Map<string, ChildOutcome[]>()
  const role = new Map<string, ChildOutcome[]>()
  for (const outcome of outcomes) {
    if (outcome.role === undefined) continue
    for (const [map, key] of [
      [attempt, `${outcome.role}|${attemptKey(outcome.attempt)}`],
      [role, outcome.role],
    ] as [Map<string, ChildOutcome[]>, string][]) {
      const bucket = map.get(key)
      if (bucket === undefined) map.set(key, [outcome])
      else bucket.push(outcome)
    }
  }
  return { attempt, role }
}

/**
 * The replacement a group of outcomes justifies, or `undefined` when the evidence
 * is not unanimous (see the module note: a guess is the defect this repairs).
 * @param role - the role being resolved, for the reason line.
 * @param entries - every outcome of that role (or of that role and attempt).
 * @returns The failure to write, or `undefined` to leave the row alone.
 */
function resolveGroup(role: RoleName, entries: readonly ChildOutcome[]): AttemptFailure | undefined {
  if (entries.length === 0) return undefined
  // A child that finished without submitting is a real format gap: the resubmit
  // path exists for exactly that case, so the group keeps its original wording.
  if (entries.some(entry => entry.stopReason === 'completed')) return undefined
  const classes = new Set(entries.map(entry => childFailureClass(entry)))
  if (classes.size !== 1) return undefined
  const failureClass = [...classes][0]!
  // Prefer the entry that actually said something for the wording.
  const spoken = entries.find(entry => typeof entry.diagnostic === 'string' && entry.diagnostic.trim() !== '') ?? entries[0]!
  return {
    class: failureClass,
    reason: childFailureReason(role, spoken),
    category: categoryForFailureClass(failureClass),
  }
}

/** Resolve one (role, attempt) pair against the group maps. */
function resolveOutcome(groups: Groups, role: RoleName, attempt: number): AttemptFailure | undefined {
  const exact = groups.attempt.get(`${role}|${attemptKey(attempt)}`)
  if (exact !== undefined) return resolveGroup(role, exact)
  const byRole = groups.role.get(role)
  return byRole === undefined ? undefined : resolveGroup(role, byRole)
}

interface Repair {
  before: string
  after: string
  class: FailureClass
  category: FailureCategory
}

/**
 * Rewrite every occurrence of a repaired reason — and the `[format-error]` class
 * marker the guest puts beside it — in one prose line.
 * @param value - the prose to repair, if the report has one.
 * @param repairs - the repairs already applied to the structured rows.
 * @returns The repaired prose, and the category to stamp when the line changed.
 */
function repairText(
  value: string | undefined,
  repairs: readonly Repair[],
): { text: string | undefined, category?: FailureCategory } {
  if (value === undefined || repairs.length === 0) return { text: value }
  let text = value
  let category: FailureCategory | undefined
  for (const repair of repairs) {
    if (!text.includes(repair.before)) continue
    text = text.split(repair.before).join(repair.after).split('[format-error]').join(`[${repair.class}]`)
    category = repair.category
  }
  return category === undefined ? { text } : { text, category }
}

/**
 * Rewrite the null-collapse rows of an assembled report with the cause each child
 * actually died of.
 *
 * The report is repaired in place (its rows, its prose and the category a reader
 * uses to tell "the service failed" from "the work fell short"); the return value
 * is how many rows changed, so a caller can log the fact instead of trusting it.
 * @param report - the validated report to repair.
 * @param outcomes - the child settlements recorded during this run.
 * @returns How many structured rows were rewritten.
 */
export function reclassifyNullCollapses(report: WorkflowReport, outcomes: readonly ChildOutcome[]): number {
  const groups = groupOutcomes(outcomes)
  if (groups.attempt.size === 0) return 0
  const repairs: Repair[] = []
  let rewritten = 0

  for (const entry of report.routes) {
    if (!isCollapse(entry.failureClass, entry.reason)) continue
    const next = resolveOutcome(groups, entry.role, entry.attempt)
    if (next === undefined) continue
    repairs.push({ before: entry.reason!, after: next.reason, class: next.class, category: next.category ?? 'unknown' })
    entry.failureClass = next.class
    entry.reason = next.reason
    rewritten += 1
  }

  for (const task of report.tasks) {
    for (const attempt of task.attempts) {
      const failure = attempt.failure
      if (failure === undefined || !isCollapse(failure.class, failure.reason)) continue
      const role = roleFromReason(failure.reason) ?? 'worker'
      const next = resolveOutcome(groups, role, attempt.attempt)
      if (next === undefined) continue
      repairs.push({ before: failure.reason, after: next.reason, class: next.class, category: next.category ?? 'unknown' })
      attempt.failure = next
      rewritten += 1
    }
  }

  const planFailure = report.plan.failure
  if (planFailure !== undefined && planFailure !== null && isCollapse(planFailure.class, planFailure.reason)) {
    const next = resolveOutcome(groups, 'planner', 1)
    if (next !== undefined) {
      repairs.push({ before: planFailure.reason, after: next.reason, class: next.class, category: next.category ?? 'unknown' })
      report.plan.failure = next
      rewritten += 1
    }
  }
  if (rewritten === 0) return 0

  // The prose a reader actually sees. The guest composed these lines from the
  // failure it saw, so they carry the very wording just repaired.
  for (const item of report.incomplete) {
    const repaired = repairText(item.reason, repairs)
    item.reason = repaired.text ?? item.reason
    if (repaired.category !== undefined) item.category = repaired.category
  }
  for (const item of report.errors) {
    const repaired = repairText(item.message, repairs)
    item.message = repaired.text ?? item.message
    if (repaired.category !== undefined) item.category = repaired.category
  }
  for (const task of report.tasks) {
    const taskText = repairText(task.error, repairs).text
    if (taskText !== undefined) task.error = taskText
    for (const attempt of task.attempts) {
      const attemptText = repairText(attempt.error, repairs).text
      if (attemptText !== undefined) attempt.error = attemptText
    }
  }
  const planText = repairText(report.plan.error, repairs).text
  if (planText !== undefined) report.plan.error = planText
  const synthesisText = repairText(report.synthesis.error, repairs).text
  if (synthesisText !== undefined) report.synthesis.error = synthesisText
  return rewritten
}

/** Re-exported so a caller can name the role of a title line the same way here. */
export function roleOfChildTitle(title: string): { role: RoleName, attempt: number } | undefined {
  const head = title.split('·')[0]?.trim() ?? ''
  return parseMemberLabel(head, 'zh') ?? parseMemberLabel(head, 'en')
}
