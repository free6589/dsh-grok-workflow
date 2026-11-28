/**
 * Truncation detection for a child run that was cut off mid-stream.
 *
 * Why this module exists (subagent resume): a child can die in three ways the
 * restore policy cannot see — the turn closed with `reason.kind=error` (or the
 * stream's `finish` chunk carried `reason.kind=error`), the reasoning stream's
 * own indexes repeat or reverse (the transcript was assembled from a cut
 * stream), or the engine said `completed` while the payload is visibly
 * incomplete (a `stop`-false-normal: missing structured result, unclosed code
 * fence or JSON container, or an explicit truncation marker at the tail).
 *
 * This module is pure, synchronous and offline: it folds one child's terminal
 * facts into a `TruncationVerdict`. A verdict of `truncated: true` names one
 * of the three classes and the evidence that decided it; `truncated: false`
 * carries a one-line reason, never an empty evidence list. The continuation
 * planner (`./continuation.js`) turns the verdict into `interrupted` +
 * `redrive` — a cut task is re-driven, never replanned.
 *
 * Two limits are deliberate, and both are honest rather than convenient:
 *
 * - Bounded reads only. The payload tail window (`TRUNCATION_LIMITS.scanChars`)
 *   and the event tail window (`TRUNCATION_LIMITS.scanEvents`) cap every scan,
 *   so a very long answer stays cheap and deterministic. A cut outside the
 *   window is not named — the detector says what it proved, not what it
 *   guessed.
 * - One cause per verdict. The engine's own word about the turn (`turn-error`)
 *   outranks a structural symptom inside the stream, and both outrank the
 *   payload heuristics, because a payload rule can only guess at intent while
 *   a `turn/end` reason is a recorded fact. The first class that fires wins.
 *
 * @module dsh-grok-workflow/resume-truncation
 */

import type { ResumeEvidence } from './validator.js'

/** The three truncation classes, in detection priority order. */
export const TRUNCATION_KINDS = [
  'turn-error',
  'reasoning-index-anomaly',
  'stop-false-normal',
] as const

/** One of the three ways a child run is cut off. */
export type TruncationKind = (typeof TRUNCATION_KINDS)[number]

/** Bounded-scan limits: every read stays inside these windows. */
export const TRUNCATION_LIMITS = {
  /** Payload tail characters inspected by the payload rules. */
  scanChars: 4000,
  /** Child-log events folded into the log facts, oldest first. */
  scanEvents: 400,
  /** Longest one-line detail a verdict carries. */
  detailChars: 200,
} as const

/** A provider failure the turn (or its stream) named. */
export interface TruncationFailure {
  message?: string
  code?: string
}

/** The terminal facts of one child run, plus its own committed log. */
export interface TruncationSignal {
  /** The engine's stop word for the child (`completed`, `error`, …). */
  stopReason?: string
  /** The child's text payload, when it produced one. */
  output?: string
  /** The child's structured result, when the caller required one. */
  structured?: unknown
  /**
   * Whether this child was supposed to submit a structured result. Defaults to
   * `false`: a caller that never asked for one must not have its plain-text
   * answer read as a missing form.
   */
  requireStructured?: boolean
  /** The provider failure recorded for the turn, when the log named one. */
  failure?: TruncationFailure
  /** The child's committed events (`turn/end`, `assistant/attempt`, …). */
  events?: readonly unknown[]
}

/** What detection concluded, with the evidence that decided it. */
export interface TruncationVerdict {
  truncated: boolean
  /** Present exactly when `truncated` is true. */
  kind?: TruncationKind
  /** One bounded line a report or a log can print verbatim. */
  detail: string
  /** The facts the verdict rests on; empty when nothing was truncated. */
  evidence: ResumeEvidence[]
}

/** Every truncation class is re-driven, never replanned: the work was cut, not wrong. */
export const TRUNCATION_STATUS = 'interrupted'

/** Whether a value is one of the three truncation classes. */
export function isTruncationKind(value: unknown): value is TruncationKind {
  return typeof value === 'string' && (TRUNCATION_KINDS as readonly string[]).includes(value)
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined
}

function readString(value: unknown, key: string): string | undefined {
  const read = asRecord(value)?.[key]
  return typeof read === 'string' && read !== '' ? read : undefined
}

function readIndex(value: unknown): number | undefined {
  const record = asRecord(value)
  if (record === undefined) return undefined
  for (const key of ['index', 'partIndex']) {
    const read = record[key]
    if (typeof read === 'number' && Number.isFinite(read)) return read
  }
  return undefined
}

/** Collapse to one bounded line without inventing content. */
function oneLine(value: unknown): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (text.length <= TRUNCATION_LIMITS.detailChars) return text
  return `${text.slice(0, TRUNCATION_LIMITS.detailChars - 1)}…`
}

/** Whether the child produced anything worth keeping. */
function hasPartialWork(signal: TruncationSignal): boolean {
  const output = signal.output?.trim() ?? ''
  return output !== '' || (signal.structured !== undefined && signal.structured !== null)
}

/** The tail window the payload rules inspect. */
function tailOf(output: string | undefined): string {
  const text = output ?? ''
  return text.length <= TRUNCATION_LIMITS.scanChars ? text : text.slice(-TRUNCATION_LIMITS.scanChars)
}

/** The last N events of a child log, oldest first. */
function tailEvents(events: readonly unknown[] | undefined): readonly unknown[] {
  if (events === undefined) return []
  return events.length <= TRUNCATION_LIMITS.scanEvents ? events : events.slice(-TRUNCATION_LIMITS.scanEvents)
}

/** The `kind` a `turn/end` reason (or a `finish` chunk reason) names. */
function reasonKind(value: unknown): string | undefined {
  return readString(asRecord(value)?.['reason'], 'kind') ?? readString(value, 'kind')
}

/** The failure a reason carries, in either shape the log uses. */
function failureOf(value: unknown): TruncationFailure | undefined {
  const reason = asRecord(value)
  const source = asRecord(reason?.['error']) ?? asRecord(reason?.['failure'])
  const message = readString(source, 'message')
  const code = readString(source, 'code')
  if (message === undefined && code === undefined) return undefined
  return {
    ...message === undefined ? {} : { message },
    ...code === undefined ? {} : { code },
  }
}

interface LogFacts {
  /** `turn/end` reason kind of the last turn, when the log carried one. */
  turnKind?: string
  /** Failure the last turn (or its stream) carried. */
  failure?: TruncationFailure
  /** `finish` chunk reason kind of the last attempt, when it carried one. */
  finishKind?: string
  /** Reasoning chunk indexes in stream order, across every attempt in the window. */
  reasoningIndexes: number[]
  /** 1-based index of the attempt event that carried the last reasoning chunk. */
  lastReasoningEvent?: number
}

/** Fold the child's committed events into the facts truncation detection needs. */
function readLog(events: readonly unknown[]): LogFacts {
  const facts: LogFacts = { reasoningIndexes: [] }
  let eventIndex = 0
  for (const event of tailEvents(events)) {
    eventIndex += 1
    const record = asRecord(event)
    if (record === undefined) continue
    const type = record['type']
    if (type === 'turn/end') {
      const reason = asRecord(record['data'])?.['reason']
      const kind = reasonKind(reason)
      if (kind !== undefined) {
        facts.turnKind = kind
        const failure = failureOf(reason)
        if (failure !== undefined) facts.failure = failure
        else delete facts.failure
      }
      continue
    }
    if (type !== 'assistant/attempt') continue
    const stream = asRecord(record['data'])?.['stream']
    if (!Array.isArray(stream)) continue
    for (const entry of stream) {
      const entryRecord = asRecord(entry)
      // A `block-start` with a negative index is the exact shape the
      // `reasoning-delta index must be a non-negative safe integer` death
      // leaves behind: the provider re-sent a part it had already emitted
      // with a slot number that can never be valid. It is collected here so
      // the anomaly is named by the layer that proves it, not merely folded
      // into the turn-error that follows it.
      if (entryRecord?.['type'] === 'block-start') {
        const index = readIndex(entryRecord)
        if (index !== undefined && index < 0) {
          facts.reasoningIndexes.push(index)
          facts.lastReasoningEvent = eventIndex
        }
        continue
      }
      const chunk = asRecord(entryRecord?.['chunk'])
      if (chunk === undefined) continue
      if (chunk['type'] === 'finish') {
        const kind = reasonKind(chunk['reason'])
        if (kind !== undefined) {
          facts.finishKind = kind
          const failure = failureOf(chunk['reason'])
          if (failure !== undefined) facts.failure = failure
        }
        continue
      }
      const chunkType = typeof chunk['type'] === 'string' ? chunk['type'] : ''
      if (!chunkType.startsWith('reasoning')) continue
      const index = readIndex(chunk)
      if (index === undefined) continue
      facts.reasoningIndexes.push(index)
      facts.lastReasoningEvent = eventIndex
    }
  }
  return facts
}

/**
 * The first broken reasoning index, when the stream's indexes are not a strictly
 * increasing sequence.
 *
 * A reasoning stream that repeats an index, or returns to an earlier one, is the
 * signature of a transcript assembled from a cut stream: the provider re-sent a
 * part it had already emitted, or the tail it needed was never written. A missing
 * index is *not* reported — legitimately sparse numbering exists — but a repeat or
 * a backwards step is.
 */
function brokenReasoningIndex(indexes: readonly number[]): { previous: number, current: number } | undefined {
  if (indexes.length < 2) return undefined
  const seen = new Set<number>()
  let previous = indexes[0]!
  seen.add(previous)
  for (let i = 1; i < indexes.length; i += 1) {
    const current = indexes[i]!
    if (current <= previous || seen.has(current)) return { previous, current }
    seen.add(current)
    previous = current
  }
  return undefined
}

/** Count code-fence delimiters in the tail window. */
function fenceCount(text: string): number {
  const matches = text.match(/```/g)
  return matches === null ? 0 : matches.length
}

/**
 * Whether the tail leaves a JSON container open.
 *
 * Only consulted when the payload itself looks like JSON (its first non-space
 * character opens a container), so prose that happens to contain `{` is never
 * read as a broken document. String literals and escapes are skipped, which is
 * what makes the counter usable on real payloads.
 */
function jsonContainerOpen(text: string): boolean {
  const trimmed = text.trimStart()
  const opener = trimmed[0]
  if (opener !== '{' && opener !== '[') return false
  const closers: Record<string, string> = { '{': '}', '[': ']' }
  const stack: string[] = []
  let inString = false
  let escaped = false
  for (const char of trimmed) {
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{' || char === '[') {
      stack.push(closers[char]!)
      continue
    }
    if (char === '}' || char === ']') {
      if (stack.pop() !== char) return false
    }
  }
  return stack.length > 0 || inString
}

/** The explicit truncation markers a producer writes into a payload. */
const TRUNCATION_MARKERS = ['[truncated', '<truncated>', '内容被截断', '输出被截断']

/** Whether the payload ends with a producer's own truncation marker. */
function endsWithTruncationMarker(text: string): boolean {
  const tail = text.trimEnd().slice(-40).toLowerCase()
  return TRUNCATION_MARKERS.some((marker) => tail.includes(marker.toLowerCase()))
}

function verdict(kind: TruncationKind, detail: string, evidence: ResumeEvidence[]): TruncationVerdict {
  return { truncated: true, kind, detail: oneLine(detail), evidence }
}

function clean(detail: string): TruncationVerdict {
  return { truncated: false, detail: oneLine(detail), evidence: [] }
}

/**
 * Decide whether one child run was cut off, and in which of the three known ways.
 *
 * The order is deliberate: the engine's own word about the turn (`turn-error`)
 * outranks a structural symptom inside the stream, and both outrank the payload
 * heuristics, because a payload rule can only guess at intent while a `turn/end`
 * reason is a recorded fact. The first class that fires wins and the remaining
 * ones are not consulted — a verdict names one cause, not a pile.
 * @param signal - the terminal facts and the child's own log.
 * @returns The verdict; `truncated: false` with a one-line reason when nothing was cut.
 */
export function detectTruncation(signal: TruncationSignal): TruncationVerdict {
  const log = readLog(signal.events ?? [])
  const failure = signal.failure ?? log.failure
  const partial = hasPartialWork(signal)
  const stop = signal.stopReason

  // 1. The turn closed with an error. Only a truncation when work existed: a death
  //    before the first token cut nothing off, so the caller's death class stands.
  const turnErrored = log.turnKind === 'error' || log.finishKind === 'error' || stop === 'error'
  if (turnErrored) {
    if (!partial) {
      return clean('the turn ended with an error before any work was produced; nothing was cut off')
    }
    const cause = failure?.message ?? failure?.code ?? (log.turnKind ?? log.finishKind ?? stop ?? 'error')
    const evidence: ResumeEvidence[] = [{
      kind: 'other',
      ref: log.turnKind === 'error' ? 'turn/end' : log.finishKind === 'error' ? 'assistant/attempt:finish' : 'stopReason',
      note: oneLine(`reason.kind=error (${cause})`),
    }]
    return verdict('turn-error', `the turn ended with an error after producing partial work (${cause}); the work is kept and re-driven`, evidence)
  }

  // 2. The reasoning stream's own indexes break. Read before the payload rules so a
  //    stream that repeats an index is named by the layer that proves it.
  const broken = brokenReasoningIndex(log.reasoningIndexes)
  if (broken !== undefined) {
    return verdict(
      'reasoning-index-anomaly',
      `the reasoning stream repeated or reversed its index (${broken.previous} → ${broken.current}), so the transcript was cut mid-stream`,
      [{
        kind: 'other',
        ref: `assistant/attempt#${log.lastReasoningEvent ?? 0}.stream`,
        note: oneLine(`reasoning index ${broken.previous} → ${broken.current} after ${log.reasoningIndexes.length} chunk(s)`),
      }],
    )
  }

  // 3. The engine said `completed` while the payload is visibly incomplete.
  if (stop === 'completed' || stop === undefined) {
    if (signal.requireStructured === true && (signal.structured === undefined || signal.structured === null)) {
      return verdict(
        'stop-false-normal',
        'the child reported completion but never submitted its structured result, so the payload was cut',
        [{ kind: 'other', ref: 'structured', note: 'required result is missing while the stop word says completed' }],
      )
    }
    const tail = tailOf(signal.output)
    if (tail !== '') {
      if (endsWithTruncationMarker(tail)) {
        return verdict(
          'stop-false-normal',
          'the payload ends with a truncation marker while the stop word says completed',
          [{ kind: 'other', ref: 'output.tail', note: 'explicit truncation marker in the last 40 characters' }],
        )
      }
      if (fenceCount(tail) % 2 === 1) {
        return verdict(
          'stop-false-normal',
          'the payload leaves a code fence open while the stop word says completed, so the answer was cut',
          [{ kind: 'other', ref: 'output.tail', note: 'odd number of ``` delimiters' }],
        )
      }
      if (jsonContainerOpen(tail)) {
        return verdict(
          'stop-false-normal',
          'the payload leaves a JSON container open while the stop word says completed, so the answer was cut',
          [{ kind: 'other', ref: 'output.tail', note: 'unbalanced JSON container at the tail' }],
        )
      }
    }
    return clean('the child ended normally and its payload shows no cut')
  }

  // Any other stop word (`aborted`, `max-tokens`, `refusal`) is a deliberate end or
  // a bound the caller set, not a stream truncation this module can prove.
  return clean(`the stop word ${stop} is not a stream cut this detector can prove`)
}
