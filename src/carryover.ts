/**
 * Bounded cross-round context carry-over.
 *
 * Every workflow round is a fresh set of child agents: the planner, the workers,
 * the verifiers and the synthesizer of round N have no memory of round N-1. The
 * durable transcript does keep something — the validated report this plugin
 * itself wrote for every earlier round — but a fresh child never sees it, and a
 * child that is told nothing invents the worst possible answer: "I cannot see the
 * earlier research, please repeat it" (observed in
 * `session-7e079b80-1a57-451b-aca4-795d24a14c4d`).
 *
 * This module compiles the earlier rounds into one bounded, structured digest:
 *
 * | kept | why |
 * | --- | --- |
 * | round objective and status | what was asked and how far it got |
 * | confirmed criteria and evidence | the research results a follow-up must build on |
 * | incomplete rows (open questions) | what is still missing, so the next round can continue it |
 * | uncertainties | doubts that must not be silently dropped |
 * | final-answer excerpt | the user-facing conclusion of the round |
 * | locators quoted by the evidence | the files a new round can open for full detail |
 *
 * Two properties are non-negotiable and are pinned by `test/carryover.spec.ts`:
 *
 * 1. **Bounded.** The rendered digest never exceeds the caller's budget, and the
 *    caller's budget is itself clamped to {@link CARRYOVER_LIMITS}. A session with
 *    hundreds of rounds therefore cannot grow the prompt without limit. When the
 *    budget runs out the *newest* round survives in full detail and the oldest
 *    rounds are dropped first, with an explicit marker instead of a silent cut.
 * 2. **Honest.** Nothing is invented. A round is compiled only from the report
 *    text this plugin wrote into the session; a transcript with no such report
 *    yields an empty digest, and the prompts then stay exactly as they were
 *    before this module existed.
 *
 * Only *reading* happens here: the reports are already durable session events,
 * so no new record type, archive or storage layout is introduced (memory
 * archiving is a separate task).
 */

import type { Message } from '@deepseek-ai/dsh-llm'
import type { Session } from '@deepseek-ai/dsh-session'
import { redactSecrets } from './redact.js'
import { RELAY_SOURCE_KIND } from './answer.js'

/**
 * Hard ceilings for the digest.
 *
 * `chars` is the absolute maximum a rendered digest may occupy. `rounds` is the
 * absolute maximum number of earlier rounds compiled into one digest. Both are
 * clamp targets, not defaults: a caller may ask for less, never for more.
 */
export const CARRYOVER_LIMITS = {
  /** Maximum earlier rounds compiled into one digest. */
  rounds: 24,
  /** Maximum characters in one rendered digest. */
  chars: 12_000,
  /** Maximum characters of one round objective. */
  objectiveChars: 300,
  /** Maximum characters of one confirmed/incomplete/uncertainty row. */
  itemChars: 240,
  /** Maximum characters of the final-answer excerpt. */
  summaryChars: 400,
  /** Maximum rows per section, so one noisy round cannot crowd out the others. */
  itemsPerSection: 6,
  /** Maximum locators listed per round. */
  locators: 6,
  /** Maximum characters of one locator. */
  locatorChars: 200,
  /** Maximum task rows read out of one round. */
  tasks: 32,
} as const

/**
 * Budget for the L1 inheritance summary (Q2), kept physically separate from the
 * conversation digest above: the two never compete for characters, so a long
 * conversation cannot squeeze out the "what is already done" list that a steering
 * round depends on.
 */
export const INHERITANCE_LIMITS = {
  /** Maximum characters of one rendered inheritance summary. */
  chars: 8_000,
  /** Maximum characters of one task's carried conclusion. */
  taskChars: 2_000,
} as const

/** Budget for one digest; both fields are clamped to {@link CARRYOVER_LIMITS}. */
export interface CarryoverBounds {
  /** Earlier rounds to compile, newest first. */
  rounds: number
  /** Characters the rendered digest may occupy. */
  chars: number
}

/**
 * One earlier round, compiled from its report.
 *
 * Strings here are already one-line, redacted and bounded; the type carries no
 * structured report because the source is the rendered report text the plugin
 * wrote into the session (the only durable, model-independent copy).
 */
export interface CarryoverRound {
  /** Final status of that round, or `unknown` when the report did not name one. */
  status: string
  /** What the round was asked to do. */
  objective: string
  /** Verified criteria with their evidence: the round's research results. */
  confirmed: string[]
  /** Unfinished rows: the round's open questions. */
  incomplete: string[]
  /** What the round was unsure about. */
  uncertainties: string[]
  /** Final-answer excerpt, when the round produced one. */
  summary?: string
  /** Files and URLs quoted by the evidence, for on-demand reading. */
  locators: string[]
  /**
   * Per-task rows of that round's report (v0.13). This is what an inheritance
   * decision is made from: a task that verified must not be redone, and a task
   * that failed must not be silently dropped. Absent on a round whose report
   * carried no task rows (an older report, or a hand-built fixture).
   */
  tasks?: CarryoverTaskRow[]
}

/** One task row as an earlier round's rendered report names it. */
export interface CarryoverTaskRow {
  id: string
  /** `verified` / `failed` / `blocked`, exactly as the report worded it. */
  status: string
  title: string
  /** The row's own one-line reason, when the report carried one. */
  conclusion?: string
}

/** Marker placed in front of a digest when older rounds were dropped. */
const TRUNCATION_NOTE = 'truncated'

/** Report signature this plugin's own `renderReport` writes (src/report.ts). */
const STATUS_LINE = /^Grok workflow: (COMPLETED|PARTIAL|FAILED)$/

/** Section headers of the rendered report, in the order they may appear. */
const SECTION_HEADERS = new Map<string, keyof Pick<CarryoverRound, 'confirmed' | 'incomplete' | 'uncertainties'>>([
  ['Confirmed evidence:', 'confirmed'],
  ['Incomplete:', 'incomplete'],
  ['Uncertainties:', 'uncertainties'],
])

/** One task row of a rendered report: `- id: status (N attempts) — title`. */
const TASK_ROW = /^- (\S+): (verified|failed|blocked) \(\d+ attempts?\) — (.*)$/

/** The indented reason line under a task row. */
const TASK_ROW_REASON = /^\s+incomplete(?: \([a-z]+\))?: (.*)$/

/** Absolute-path locators (`/tmp/x`, `/home/u/a.ts`) and URLs, bounded below. */
const LOCATOR_PATTERNS: readonly RegExp[] = [
  /file:\/\/[^\s,;()]+/g,
  /https?:\/\/[^\s,;()]+/g,
  /\/[\w.@-]+(?:\/[\w.@-]+)+/g,
]

/** Collapse whitespace, redact, and bound one line of compiled text. */
function line(value: string, max: number): string {
  const compact = redactSecrets(value).replace(/\s+/g, ' ').trim()
  return compact.length <= max ? compact : `${compact.slice(0, Math.max(0, max - 1))}…`
}

/** Plain text of one message, or an empty string when it carries none. */
function textOf(message: Message): string {
  const parts: string[] = []
  for (const block of message.content) {
    if (typeof block !== 'object' || block === null) continue
    const candidate = block as { type?: unknown; text?: unknown }
    if (candidate.type !== 'text' || typeof candidate.text !== 'string') continue
    parts.push(candidate.text)
  }
  return parts.join('\n').trim()
}

/**
 * True when this plugin authored the message.
 *
 * The gate writes the validated report into a message with the `grok-workflow`
 * source kind under every answer strategy (`in-turn` enter message, `relay`
 * follow-up, `append` surface write), so this is the one durable copy that was
 * never paraphrased by a model.
 */
function isPluginReport(message: Message): boolean {
  const source = message.source as { kind?: unknown } | undefined
  return typeof source?.kind === 'string' && source.kind === RELAY_SOURCE_KIND
}

/** Collect the bounded locators quoted by one round's rows. */
function locatorsOf(texts: readonly string[]): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  for (const text of texts) {
    for (const pattern of LOCATOR_PATTERNS) {
      pattern.lastIndex = 0
      for (const match of text.matchAll(pattern)) {
        const value = match[0].replace(/[.)\]]+$/, '')
        if (value.length < 4 || value.length > CARRYOVER_LIMITS.locatorChars) continue
        if (seen.has(value)) continue
        seen.add(value)
        found.push(value)
        if (found.length >= CARRYOVER_LIMITS.locators) return found
      }
    }
  }
  return found
}

/**
 * Compile one rendered report into a round.
 *
 * @param text - report text, with or without the relay preamble and markers.
 * @returns the compiled round, or `null` when the text carries no report signature.
 */
export function parseReportRound(text: string): CarryoverRound | null {
  const lines = text.split('\n')
  let status = ''
  let objective = ''
  const sections: Record<'confirmed' | 'incomplete' | 'uncertainties', string[]> = {
    confirmed: [],
    incomplete: [],
    uncertainties: [],
  }
  let mode: 'confirmed' | 'incomplete' | 'uncertainties' | 'answer' | null = null
  let summary = ''
  const tasks: CarryoverTaskRow[] = []
  for (const raw of lines) {
    const current = raw.trim()
    if (status === '') {
      const match = STATUS_LINE.exec(current)
      if (match !== null) {
        status = match[1]!.toLowerCase()
        continue
      }
      // Anything before the signature is the relay preamble: not report content.
      if (!current.startsWith('Objective:')) continue
    }
    if (current.startsWith('Objective:')) {
      objective = current.slice('Objective:'.length).trim()
      mode = null
      continue
    }
    const header = SECTION_HEADERS.get(current)
    if (header !== undefined) {
      mode = header
      continue
    }
    if (current === 'Final answer:') {
      mode = 'answer'
      continue
    }
    if (current === '') continue
    // A task row (`- id: status (N attempts) — title`) is the inheritance key, so
    // it is read before the generic bullet handling below.
    const taskRow = TASK_ROW.exec(current)
    if (taskRow !== null) {
      mode = null
      if (tasks.length < CARRYOVER_LIMITS.tasks) {
        tasks.push({
          id: line(taskRow[1]!, 64),
          status: taskRow[2]!,
          title: line(taskRow[3]!, CARRYOVER_LIMITS.itemChars),
        })
      }
      continue
    }
    // The indented `incomplete: …` line belongs to the task row above it.
    const rowReason = TASK_ROW_REASON.exec(raw)
    if (rowReason !== null && tasks.length > 0) {
      const last = tasks[tasks.length - 1]!
      if (last.conclusion === undefined) last.conclusion = line(rowReason[1]!, CARRYOVER_LIMITS.itemChars)
      continue
    }
    if (current.startsWith('- ')) {
      const item = current.slice(2).trim()
      if (mode === 'confirmed' || mode === 'incomplete' || mode === 'uncertainties') {
        if (sections[mode].length < CARRYOVER_LIMITS.itemsPerSection) {
          sections[mode].push(line(item, CARRYOVER_LIMITS.itemChars))
        }
        continue
      }
      // A `- id: status …` task line: it names no result of its own, and the
      // confirmed/incomplete sections restate the parts that matter.
      continue
    }
    if (mode === 'answer' && summary === '') {
      summary = line(current, CARRYOVER_LIMITS.summaryChars)
      mode = null
      continue
    }
    // Any other line ends the current section (routing, deadline, route switches…).
    mode = null
  }
  if (status === '') return null
  const rows = [...sections.confirmed, ...sections.incomplete, ...sections.uncertainties]
  return {
    status,
    objective: line(objective, CARRYOVER_LIMITS.objectiveChars),
    confirmed: sections.confirmed,
    incomplete: sections.incomplete,
    uncertainties: sections.uncertainties,
    ...summary === '' ? {} : { summary },
    locators: locatorsOf(rows),
    tasks,
  }
}

/** Clamp caller bounds to the hard ceilings. Zero means "carry nothing over". */
export function clampBounds(bounds: Partial<CarryoverBounds> | undefined): CarryoverBounds {
  const rounds = Math.min(Math.max(0, Math.trunc(Number(bounds?.rounds ?? CARRYOVER_LIMITS.rounds) || 0)), CARRYOVER_LIMITS.rounds)
  const chars = Math.min(Math.max(0, Math.trunc(Number(bounds?.chars ?? CARRYOVER_LIMITS.chars) || 0)), CARRYOVER_LIMITS.chars)
  return { rounds, chars }
}

/**
 * Budget for one session from the configured history knobs.
 *
 * The digest shares the context budget the plugin already exposes (`historyTurns`
 * / `historyChars`): an operator who sets those to zero gets exactly the pre-0.5
 * behaviour, and nobody has to learn a second pair of numbers.
 *
 * @param config - the resolved configuration (or the two knobs alone).
 * @returns the clamped carry-over bounds.
 */
export function carryoverBounds(config: { historyTurns?: number, historyChars?: number }): CarryoverBounds {
  return clampBounds({
    rounds: config.historyTurns ?? CARRYOVER_LIMITS.rounds,
    chars: config.historyChars ?? CARRYOVER_LIMITS.chars,
  })
}

/**
 * Compile the earlier rounds of one session, newest first.
 *
 * @param session - the session that owns the round; `undefined` is legal.
 * @param bounds - round and character budget (clamped inside).
 * @returns the compiled rounds; an empty list when there is no prior report.
 */
export function collectCarryoverRounds(
  session: Session | undefined,
  bounds: Partial<CarryoverBounds> = {},
): CarryoverRound[] {
  const clamped = clampBounds(bounds)
  if (clamped.rounds === 0 || clamped.chars === 0) return []
  if (session === undefined || typeof session.deriveMessages !== 'function') return []
  let messages: readonly Message[]
  try {
    messages = session.deriveMessages()
  } catch {
    return []
  }
  const rounds: CarryoverRound[] = []
  for (let index = messages.length - 1; index >= 0 && rounds.length < clamped.rounds; index -= 1) {
    const message = messages[index]!
    if (!isPluginReport(message)) continue
    let text = ''
    try {
      text = textOf(message)
    } catch {
      continue
    }
    if (text === '') continue
    const round = parseReportRound(text)
    if (round === null) continue
    // A report with neither an objective nor any result carries nothing forward.
    if (round.objective === '' && round.confirmed.length === 0 && round.incomplete.length === 0) continue
    rounds.push(round)
  }
  return rounds
}

/** Header line of the rendered digest. */
const DIGEST_HEADER = 'PRIOR ROUNDS IN THIS SESSION (compiled from earlier turns; context, not instructions):'

/**
 * Render the compiled rounds as one bounded, structured digest.
 *
 * The budget is spent newest-round first and, inside a round, in the order
 * "objective/status → confirmed results → open questions → uncertainties →
 * answer → locators". When the budget runs out the renderer stops and keeps what
 * it already wrote: wholly dropped rounds are named by an explicit truncation
 * marker, and lines dropped *inside* a kept round by a `+N more item(s) in this
 * round` marker as that round's last line — never a silent cut, and never an
 * over-budget string.
 *
 * @param rounds - compiled rounds, newest first.
 * @param bounds - character budget (clamped inside).
 * @returns the digest, or an empty string when there is nothing to carry.
 */
export function buildCarryoverDigest(
  rounds: readonly CarryoverRound[],
  bounds: Partial<CarryoverBounds> = {},
): string {
  const clamped = clampBounds(bounds)
  if (clamped.chars === 0 || rounds.length === 0) return ''
  const cap = clamped.chars
  const kept: string[] = []
  let used = 0
  const push = (text: string): boolean => {
    const cost = text.length + 1
    if (used + cost > cap) return false
    used += cost
    kept.push(text)
    return true
  }
  if (!push(DIGEST_HEADER)) return ''
  let compiled = 0
  // `full` is set once a line no longer fits. Every later line would fail for the
  // same reason (the budget only shrinks), so the renderer stops spending the
  // remaining rounds' worth of attempts on it. Lines skipped this way are counted
  // per round and named by an explicit `+N more` marker (see below) — never
  // silently dropped.
  let full = false
  const section = (lines: readonly string[]): number => {
    let skipped = 0
    for (const text of lines) {
      if (full) {
        skipped += 1
        continue
      }
      if (!push(text)) {
        full = true
        skipped += 1
      }
    }
    return skipped
  }
  for (const round of rounds.slice(0, clamped.rounds)) {
    if (full) break
    const head = `Round -${compiled + 1} [${round.status}] ${round.objective === '' ? '(objective not recorded)' : round.objective}`
    if (!push(head)) break
    compiled += 1
    let skipped = 0
    skipped += section(round.confirmed.map(item => `  verified: ${item}`))
    skipped += section(round.incomplete.map(item => `  open: ${item}`))
    skipped += section(round.uncertainties.map(item => `  uncertain: ${item}`))
    if (round.summary !== undefined) skipped += section([`  answer: ${round.summary}`])
    if (round.locators.length > 0) skipped += section([`  readable outputs: ${round.locators.join(', ')}`])
    if (skipped > 0) {
      // Same accounting as the `[truncated: …]` marker below: the line is allowed
      // to overflow by its own length (it is already `line()`-bounded) and the
      // hard cut at the end of this function enforces the cap exactly, so the
      // marker survives in preference to silence even when the budget is gone.
      kept.push(line(`  … +${skipped} more item(s) in this round (see the session transcript)`, CARRYOVER_LIMITS.itemChars))
    }
  }
  const dropped = rounds.length - compiled
  if (dropped > 0) {
    // The marker is allowed to overflow by its own length only when the budget is
    // already exhausted; it is appended as the last line and the whole string is
    // cut to the hard cap below, so the caller's bound still holds exactly.
    kept.push(`[${TRUNCATION_NOTE}: ${dropped} earlier round(s) omitted to keep this digest within ${cap} characters]`)
  }
  let text = kept.join('\n')
  if (text.length > cap) {
    // Surrogate-safe cut: never leave half of a code point at the boundary.
    let cut = cap
    const code = text.charCodeAt(cut - 1)
    if (cut > 0 && code >= 0xd800 && code <= 0xdbff) cut -= 1
    text = text.slice(0, cut)
  }
  return text
}

/**
 * One session's carry-over digest plus the counts a log line needs.
 *
 * @param session - the session that owns the round; `undefined` is legal.
 * @param bounds - round and character budget (clamped inside).
 * @returns the digest (empty when there is no prior round) and the round count.
 */
export function carryoverForSession(
  session: Session | undefined,
  bounds: Partial<CarryoverBounds> = {},
): { digest: string, rounds: number } {
  const rounds = collectCarryoverRounds(session, bounds)
  const digest = buildCarryoverDigest(rounds, bounds)
  return { digest, rounds: rounds.length }
}

/**
 * One inheritance decision for one task (L1 / Q2).
 *
 * `retain` — verified before and still wanted, so the work is not redone.
 * `redrive` — did not verify (failed or blocked), so a new generation runs it.
 * `reverify` — verified before, but this round changed something it depends on, so
 * the verifier runs again without redoing the work.
 * `replan` — the requirement itself changed, so the planner re-arranges it.
 */
export type ResumeKind = 'retain' | 'redrive' | 'reverify' | 'replan'

/** One decision, with the reason a reader (and the report) can audit. */
export interface ResumeDecision {
  taskId: string
  decision: ResumeKind
  /**
   * Evidence generation. The newest round is 1; a redriven task is one generation
   * further, which is what keeps an older round's late verdict from being read as
   * this round's result.
   */
  generation: number
  reason: string
  /**
   * Requirement fields this round changed, named on a `replan` decision (S6: the
   * planner gets a reason *and* the fields it must re-arrange around). Empty on
   * every other decision: retain/redrive/reverify are auditable from the task row
   * alone, and inventing a field list there would claim a change nobody made.
   */
  changedFields: string[]
}

/** Bound on the changed-field list one replan decision may quote. */
const CHANGED_FIELDS_MAX = 8

/** Bound on one changed field name, in characters. */
const CHANGED_FIELD_CHARS = 48

/**
 * Sanitize a caller's changed-field list into a bounded, de-duplicated one.
 * @param value - field names as the caller knows them (untrusted).
 * @returns at most {@link CHANGED_FIELDS_MAX} one-line names, in caller order.
 */
function changedFieldList(value: readonly string[] | undefined): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const entry of value ?? []) {
    if (typeof entry !== 'string') continue
    const field = entry.trim().replace(/\s+/g, ' ').slice(0, CHANGED_FIELD_CHARS)
    if (field === '' || seen.has(field)) continue
    seen.add(field)
    out.push(field)
    if (out.length >= CHANGED_FIELDS_MAX) break
  }
  return out
}

/** Options for {@link resumeDecisions}. */
export interface ResumeOptions {
  /** The requirement changed: every inherited task is re-planned. */
  replan?: boolean
  /** Task ids whose inputs this round changed: verify them again. */
  reverify?: readonly string[]
  /** Requirement fields this round changed, quoted on every `replan` decision. */
  changedFields?: readonly string[]
}

/**
 * Decide what a new round inherits from earlier rounds.
 *
 * Only the newest round that names a task decides its fate: an older round's row for
 * the same id is dropped, which is the generation guard in its simplest form — a
 * stale "verified" can never outvote a newer "failed", and vice versa. Tasks are
 * bounded and de-duplicated, so a session with many rounds still yields one row per
 * task.
 * @param rounds - compiled rounds, newest first.
 * @param options - replan / reverify inputs from the caller.
 * @returns one decision per inherited task, newest round first.
 */
export function resumeDecisions(
  rounds: readonly CarryoverRound[],
  options: ResumeOptions = {},
): ResumeDecision[] {
  const reverify = new Set(options.reverify ?? [])
  const changedFields = changedFieldList(options.changedFields)
  const replanReason = changedFields.length === 0
    ? 'the requirement changed, so this task is re-planned instead of reused'
    : `the requirement changed (${changedFields.join(', ')}), so this task is re-planned instead of reused`
  const seen = new Set<string>()
  const decisions: ResumeDecision[] = []
  for (let index = 0; index < rounds.length; index += 1) {
    const generation = index + 1
    for (const row of rounds[index]!.tasks ?? []) {
      if (row.id === '' || seen.has(row.id)) continue
      seen.add(row.id)
      if (options.replan === true) {
        decisions.push({
          taskId: row.id,
          decision: 'replan',
          generation,
          reason: replanReason,
          changedFields: [...changedFields],
        })
        continue
      }
      if (row.status === 'verified') {
        if (reverify.has(row.id)) {
          decisions.push({
            taskId: row.id,
            decision: 'reverify',
            generation,
            reason: 'verified in an earlier round, but this round changed something it rests on: check it again without redoing the work',
            changedFields: [],
          })
          continue
        }
        decisions.push({
          taskId: row.id,
          decision: 'retain',
          generation,
          reason: 'verified in an earlier round, so its work and evidence are carried forward instead of redone',
          changedFields: [],
        })
        continue
      }
      decisions.push({
        taskId: row.id,
        decision: 'redrive',
        generation: generation + 1,
        reason: row.status === 'blocked'
          ? 'blocked in an earlier round (an upstream task did not verify), so it runs again from the start'
          : 'did not verify in an earlier round, so it runs again as a new generation',
        changedFields: [],
      })
    }
  }
  return decisions
}

/** Header of the rendered inheritance summary. */
export const INHERITANCE_HEADER = 'INHERITED WORK FROM EARLIER ROUNDS (verified work is carried forward, not redone):'

/**
 * Stable opening words of {@link INHERITANCE_HEADER}.
 *
 * The generated script and `src/history.ts` both ask "does this objective already
 * carry the inherited-work block?" by searching for this prefix, so it is exported
 * and pinned by test instead of being retyped in two places.
 */
export const INHERITANCE_PREFIX = 'INHERITED WORK FROM EARLIER ROUNDS'

/** Characters of one decision reason kept in the compact rendering. */
const COMPACT_REASON_CHARS = 40

/**
 * Whether a decision describes work that already verified.
 * @param decision - one inherited task's decision.
 * @returns true for `retain` / `reverify`.
 */
function decidedVerified(decision: ResumeDecision): boolean {
  return decision.decision === 'retain' || decision.decision === 'reverify'
}

/** Shorten one reason for the compact rendering, on a code-point boundary. */
function compactReason(reason: string): string {
  const one = reason.replace(/\s+/g, ' ').trim()
  if (one.length <= COMPACT_REASON_CHARS) return one
  let cut = COMPACT_REASON_CHARS - 1
  const code = one.charCodeAt(cut - 1)
  if (code >= 0xd800 && code <= 0xdbff) cut -= 1
  return `${one.slice(0, cut)}…`
}

/**
 * The `[truncated: …]` line, or `''` when nothing was dropped.
 *
 * The line states exactly what is missing and what a reader must do about it, so a
 * bounded digest never pretends to be complete.
 * @param droppedLines - decision lines left out.
 * @param total - decision lines the round produced.
 * @param detailsDropped - whether per-task details were left out too.
 * @param cap - the budget the details overflowed (quoted to the reader).
 * @returns the marker line (never partially rendered: it is reserved before packing).
 */
function truncationMarker(droppedLines: number, total: number, detailsDropped: boolean, cap: number): string {
  const parts: string[] = []
  if (droppedLines > 0) {
    parts.push(`the oldest ${droppedLines} of ${total} decision line(s) did not fit and were dropped (oldest first); re-read the earlier round before assuming those are done`)
  }
  if (detailsDropped) {
    parts.push(droppedLines > 0
      ? `details over ${cap} characters were dropped`
      : `details over ${cap} characters were dropped, every decision line above is complete`)
  }
  return parts.length === 0 ? '' : `[truncated: ${parts.join('; ')}]`
}

/**
 * Render the L1 inheritance summary within its own budget (Q2).
 *
 * Three rules, all pinned by tests:
 *
 * 1. **The verified list survives.** Decision lines are written oldest round first,
 *    and the whole list is what the 8K budget is sized for: the engine's task cap is
 *    100, and the compact rendering fits all 100 verified lines inside
 *    {@link INHERITANCE_LIMITS.chars}. So at the real maximum nothing is dropped.
 * 2. **Compress before you drop.** A full line (`Round -1 retain (generation 1): …`)
 *    is tried first; when the full form overflows, every line is re-rendered in the
 *    compact form (`R-1 retain g1 …`) before a single line is given up. Dropping is
 *    the last resort, and when it happens it is strictly oldest-first — the order the
 *    reader needs, since the newest decisions are the ones this round acts on.
 * 3. **Never over budget, never a sliced marker.** The `[truncated: …]` line is
 *    reserved *before* lines are packed, so the result either states its own gap in
 *    full sentences or is under budget with nothing dropped — no silent gap and no
 *    half-written marker.
 *
 * @param rounds - compiled rounds, newest first.
 * @param bounds - character budget (defaults to {@link INHERITANCE_LIMITS.chars}).
 * @param options - replan / reverify inputs, forwarded to {@link resumeDecisions}.
 * @returns the summary, or an empty string when there is nothing to inherit.
 */
export function buildInheritanceDigest(
  rounds: readonly CarryoverRound[],
  bounds: { chars?: number } = {},
  options: ResumeOptions = {},
): string {
  const cap = Math.min(
    Math.max(0, Math.trunc(Number(bounds.chars ?? INHERITANCE_LIMITS.chars) || 0)),
    INHERITANCE_LIMITS.chars,
  )
  if (cap === 0 || rounds.length === 0) return ''
  if (cap <= INHERITANCE_HEADER.length) return ''
  const decisions = resumeDecisions(rounds, options)
  if (decisions.length === 0) return ''
  const roundOf = new Map<string, number>()
  rounds.forEach((round, index) => {
    for (const row of round.tasks ?? []) {
      if (!roundOf.has(row.id)) roundOf.set(row.id, index + 1)
    }
  })
  // Oldest round first: the reading order a new round needs ("what is done" before
  // "what is open"), and the order the budget is spent in. Ordering is by the round
  // a task came from, not by generation (`redrive` advances the generation, so a
  // redriven task can sit in the oldest round with a higher number) and not by
  // reversing the array (`resumeDecisions` returns the newest round first, so a
  // reverse would also scramble the order inside one round). The sort is stable, so
  // every round keeps the order its own report listed.
  const ordered = [...decisions].sort(
    (left, right) => (roundOf.get(right.taskId) ?? 1) - (roundOf.get(left.taskId) ?? 1),
  )
  const lineFor = (decision: ResumeDecision, compact: boolean): string => {
    const round = roundOf.get(decision.taskId) ?? 1
    const head = compact
      ? `R-${round} ${decision.decision} g${decision.generation} ${decision.taskId}`
      : `Round -${round} ${decision.decision} (generation ${decision.generation}): ${decision.taskId}`
    return `${head} — ${compact ? compactReason(decision.reason) : decision.reason}`
  }
  const detailFor = (decision: ResumeDecision): string => {
    const round = rounds[(roundOf.get(decision.taskId) ?? 1) - 1]
    const row = (round?.tasks ?? []).find(candidate => candidate.id === decision.taskId)
    const conclusion = row?.conclusion ?? row?.title ?? ''
    return conclusion === '' ? '' : `  detail ${decision.taskId}: ${line(conclusion, INHERITANCE_LIMITS.taskChars)}`
  }
  const detailDecisions = decisions.filter(decidedVerified)
  // Worst-case marker reserved up front, so a marker line is never cut in half.
  const markerReserve = truncationMarker(ordered.length, ordered.length, true, cap).length + 2
  const pack = (compact: boolean, dropIds: ReadonlySet<string>, budget: number): { text: string, skipped: number, detailsDropped: boolean } | undefined => {
    const kept: string[] = [INHERITANCE_HEADER]
    const placed = new Set<string>()
    let used = INHERITANCE_HEADER.length
    if (used > budget) return undefined
    // Budget exhaustion stops at the first line that does not fit: the lines after
    // it are newer than it, and dropping the *newest* to make room for the oldest
    // is the one order this digest must never use. Shrinking the list is
    // `dropOrder`'s job, where the oldest line is the first to go.
    let full = false
    for (const decision of ordered) {
      if (dropIds.has(decision.taskId) || full) continue
      const text = lineFor(decision, compact)
      if (used + 1 + text.length > budget) {
        full = true
        continue
      }
      used += 1 + text.length
      kept.push(text)
      placed.add(decision.taskId)
    }
    // Details belong to lines that are actually shown: a detail for a dropped
    // decision would describe work the reader was never told about.
    let detailsDropped = false
    for (const decision of detailDecisions) {
      if (!placed.has(decision.taskId)) continue
      const text = detailFor(decision)
      if (text === '') continue
      if (used + 1 + text.length > budget) {
        detailsDropped = true
        continue
      }
      used += 1 + text.length
      kept.push(text)
    }
    return { text: kept.join('\n'), skipped: ordered.length - dropIds.size - placed.size, detailsDropped }
  }
  /**
   * One rendering attempt.
   *
   * `allowDrops` false means the attempt must keep every decision line (details may
   * still be dropped); `allowDrops` true walks the fixed drop order until the text
   * plus its marker fits.
   */
  const attempt = (compact: boolean, allowDrops: boolean): string | undefined => {
    const maxDrop = allowDrops ? ordered.length : 0
    for (let drop = 0; drop <= maxDrop; drop += 1) {
      // Strictly oldest-first: the list is rendered oldest round first, so the first
      // `drop` entries are the oldest decisions in the digest.
      const dropIds = new Set(ordered.slice(0, drop).map(decision => decision.taskId))
      const packed = pack(compact, dropIds, Math.max(0, cap - markerReserve))
      if (packed === undefined) continue
      // An attempt only counts when every line it was given is actually shown; a
      // partial pack would drop the newest lines while keeping older ones.
      if (packed.skipped > 0) continue
      const dropped = drop + packed.skipped
      const marker = truncationMarker(dropped, ordered.length, packed.detailsDropped, cap)
      const text = marker === '' ? packed.text : `${packed.text}\n${marker}`
      if (text.length <= cap) return text
    }
    return undefined
  }
  // Full prose first; the compact form before any line is dropped (rule 2 above).
  return attempt(false, false) ?? attempt(true, false) ?? attempt(true, true) ?? attempt(false, true) ?? ''
}

/**
 * The inheritance summary for one session.
 * @param session - the session that owns the earlier rounds; `undefined` is legal.
 * @param bounds - character budget.
 * @param options - replan / reverify inputs.
 * @returns the summary (empty when there is no prior task row).
 */
export function inheritanceForSession(
  session: Session | undefined,
  bounds: { chars?: number } = {},
  options: ResumeOptions = {},
): string {
  const rounds = collectCarryoverRounds(session, { rounds: CARRYOVER_LIMITS.rounds, chars: CARRYOVER_LIMITS.chars })
  return buildInheritanceDigest(rounds, bounds, options)
}
