/**
 * 人话交付层 / the human-first delivery layer.
 *
 * What a reader gets when a run settles (phase 1 of the output rework):
 *
 * 1. **人类的结论先说** — one plain-language block that stands on its own: what
 *    was done, what was not, what to do next, and the caveats worth knowing. It
 *    is written for a person, so it carries no run/child/task identifiers, no
 *    route bookkeeping, no machine field labels, and none of the machine detail a
 *    report field can quote (`stat -c`, a digest, an absolute path, a relay
 *    marker): those only mean something to whoever debugged the plugin.
 * 2. **机器台账默认收起** — the full machine view (ids, per-task attempts, route
 *    chain, deadline, route switches/overflows, errors) is *not* part of the
 *    default text. It is one explicit switch away ({@link deliverReport} with
 *    `diagnostics`), and that switch is **off** unless someone turns it on.
 *
 * Design constraints that shaped this file:
 *
 * - **Self-contained on purpose.** The only module import is a type import.
 *   Presentation for a human must not drag in the run engine, the config schema
 *   or the model layer, and a delivery text must be composable (and testable)
 *   with nothing but a report value. `src/report.ts` remains the canonical
 *   machine renderer for the tool surface; the ledger here mirrors its field
 *   names so an operator reading either one sees the same labels, not two
 *   dialects.
 * - **Never dress a failure as success.** A `failed` run answers with its own
 *   wording — `statusTail` owns the only verdict sentence a reader sees — because
 *   a failure that reads like an answer is worse than no answer.
 * - **Honest about what is unknown.** `uncertainties` stay in the human block:
 *   they are a truthful caveat a reader needs, not routing bookkeeping. Hiding
 *   them behind a diagnostics switch would be the same class of bug as hiding
 *   the ledger, in reverse.
 */

import type { FinalStatus, WorkflowReport } from '../types.js'

/** Language the human block is written in. */
export type DeliveryLang = 'zh' | 'en'

/**
 * The diagnostics switch as it reaches this module.
 *
 * `boolean` for a resolved setting, or a `{ get }` holder for the live/volatile
 * field the settings surface writes — accepted so a caller can hand over the
 * switch without deciding where the value is stored.
 */
export type DiagnosticsSwitch = boolean | { get: () => unknown }

/** Options for {@link deliverReport}. */
export interface DeliveryOptions {
  /** Show the machine ledger after the human block. Default `false`. */
  diagnostics?: DiagnosticsSwitch
  /** Language of the human block. Default `zh`. */
  lang?: DeliveryLang
  /**
   * Emit the block in both languages: `lang` first, the other one after it.
   *
   * A chat answer can reach a reader whose language the rules guessed wrong (a
   * one-word follow-up carries no language signal), and a summary nobody can read
   * is not a summary. Default `false` so every existing caller keeps one block.
   */
  bilingual?: boolean
}

/** One composed delivery: the human block, and the ledger only on request. */
export interface DeliveryView {
  /** Whether the ledger is present in {@link DeliveryView.text}. */
  diagnostics: boolean
  /** The plain-language block, always present and readable on its own. */
  human: string
  /** The full machine ledger; absent unless the switch was on. */
  ledger?: string
  /** What a relay turn sends: `human`, plus the ledger when it was asked for. */
  text: string
}

/** Default of the diagnostics switch: the machine ledger stays collapsed. */
export const DEFAULT_DIAGNOSTICS = false

/** Separator between the human block and the opt-in ledger. */
const LEDGER_RULE = '---'

/** Human block is clamped so a pathological report cannot flood a chat turn. */
const MAX_HUMAN_CHARS = 2_400

/** Ledger is clamped for the same reason (`report.ts` uses the same budget). */
const MAX_LEDGER_CHARS = 8_000

/**
 * Labels that only the machine ledger produces.
 *
 * Two jobs: the ledger is built *from* this list (so the two views cannot drift
 * apart in wording), and the human block is *scrubbed against* it — a model's
 * own summary is free text and could echo a field name back at the reader, so
 * the guard is applied to every line that reaches the human block.
 *
 * How each entry is matched matters (B10, see {@link tainted}): a field label is
 * a label only where a field label can be — at the start of a line. A raw
 * substring scan dropped *real* content: the reason `src/script.ts` records for a
 * task whose child never started reads `task aborted before any attempt: [ … ]`,
 * and the `attempt:` inside it erased the reader's only explanation.
 */
const LEDGER_LABELS = [
  'Grok workflow:',
  'Objective:',
  'Plan:',
  'Failures:',
  'Plan failure:',
  'Confirmed evidence:',
  'Incomplete:',
  'Final answer:',
  'Model routes:',
  'Deadline:',
  'Route switches:',
  'Route overflows',
  'skipped full',
  'skipped busy',
  'cross-run hint',
  'Errors:',
  'Synthesis:',
  'Synthesis mode:',
  'Uncertainties:',
  '核验通过',
  '进度节点在旁',
] as const

/**
 * Labels the ledger also writes in the middle of a line, matched as whole words.
 *
 * These are phrases no ordinary sentence contains by accident, so the boundary
 * check is enough to keep them out of a summary without risking real prose.
 */
const MIDLINE_LABELS = [
  'Route overflows',
  'skipped full',
  'skipped busy',
  'cross-run hint',
  'per run (enforced by the plugin)',
  '核验通过',
  '进度节点在旁',
  'Model routes',
  'Deadline',
] as const

/**
 * Identifier tokens that must never reach the human block, whatever field they
 * came from. The ledger keeps them: they are how a maintainer finds the run.
 *
 * Matched as whole words: `childId 3 failed` is caught, while `childIdle` or an
 * ordinary word containing the same letters is not. `attempt:` is deliberately
 * not here but in {@link ANCHORED_LABEL}: it never starts a rendered ledger line
 * (`report.ts` writes `(2 attempts)`, `attempt 1 via …`), and as a mid-line token
 * it erased the run's own explanation of a failed task (B10). The one field the
 * guard does not apply to is the failure reason itself — see
 * {@link humanConclusion}.
 */
const ID_TOKENS = ['runId', 'taskId', 'childId', 'chainIndex'] as const

/** A ledger-shaped key that only ever starts a line, never a sentence. */
const ANCHORED_KEYS = ['attempt:'] as const

/** Read a switch that may be a resolved boolean or a live holder. */
export function diagnosticsEnabled(value?: DiagnosticsSwitch): boolean {
  if (value === undefined) return DEFAULT_DIAGNOSTICS
  if (typeof value === 'boolean') return value
  try {
    return value.get() === true
  } catch {
    // A broken settings read degrades to the default: the ledger hides rather
    // than the delivery failing for a reason the reader cannot act on.
    return DEFAULT_DIAGNOSTICS
  }
}

/**
 * Cut `text` to at most `max` UTF-16 code units without splitting a character.
 *
 * `String#slice` counts code units, so a cut that lands between the two halves of
 * an astral character (an emoji in a task title, a rare CJK ideograph) leaves a
 * lone surrogate behind, which renders as a replacement box. Every human-block
 * clamp cuts through here for that reason. The ledger's own {@link MAX_LEDGER_CHARS}
 * clamp does not, and is pooled: reaching 8,000 characters needs a report this
 * validator cannot produce, so there is no measured shape to pin it with yet.
 */
function cutCodeUnits(text: string, max: number): string {
  if (max <= 0) return ''
  if (text.length <= max) return text
  const last = text.charCodeAt(max - 1)
  const end = last >= 0xD800 && last <= 0xDBFF ? max - 1 : max
  return text.slice(0, end)
}

/** Collapse whitespace and clamp one value to a single bounded line. */
function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${cutCodeUnits(flat, Math.max(0, max - 1))}…`
}

/** Characters that end a sentence in either shipped language. */
const SENTENCE_ENDS = '。！？!?'
/** Characters that end a clause: a cut here still leaves a readable fragment. */
const CLAUSE_ENDS = '；;，、：,'

/**
 * Index just past the last sentence end at or before `room`, or -1.
 *
 * An ASCII full stop only counts where a sentence can end: the next character has
 * to be whitespace or the end of the text, so `0.12.19`, `src/answer.ts:106` and
 * `1,234.5` are never mistaken for a sentence and cut in half.
 */
function lastSentenceCut(text: string, room: number): number {
  let best = -1
  for (let index = 0; index < room; index += 1) {
    const char = text[index]!
    if (SENTENCE_ENDS.includes(char)) {
      best = index + 1
      continue
    }
    if (char !== '.') continue
    const next = text[index + 1]
    if (next === undefined || next === ' ' || next === '\n' || next === '\t') best = index + 1
  }
  return best
}

/** Index just past the last clause separator at or before `room`, or -1. */
function lastClauseCut(text: string, room: number): number {
  for (let index = room - 1; index >= 0; index -= 1) {
    if (CLAUSE_ENDS.includes(text[index]!)) return index + 1
  }
  return -1
}

/** Index of the last whitespace run before `room`, or -1: a cut between words. */
function lastWordCut(text: string, room: number): number {
  const match = /\s+\S*$/.exec(text.slice(0, room))
  return match === null ? -1 : match.index
}

/**
 * The longest prefix of `text` within `room` that ends where a reader can stop.
 *
 * Preference order is sentence end, then clause separator, then between words;
 * a boundary that threw away most of the window is rejected in favour of the next
 * one, so a lone full stop early in a long sentence cannot shrink the line to
 * almost nothing. No `…` is appended: every caller here draws its own omission
 * mark, and two of them in a row read as a stutter.
 *
 * This is the Q11 rule at the character level: a relayed report used to hand the
 * model half a sentence (`the RSI heart…`), and a fragment that stops inside a
 * word is unreadable in exactly the way a whole sentence is not.
 *
 * @param text - the text to bound.
 * @param room - maximum length in UTF-16 code units.
 * @returns the prefix, at most `room` characters.
 */
function boundaryPrefix(text: string, room: number): string {
  if (room <= 0) return ''
  if (text.length <= room) return text
  for (const find of [lastSentenceCut, lastClauseCut, lastWordCut]) {
    const cut = find(text, room)
    if (cut > 0 && cut * 4 >= room) return text.slice(0, cut).trimEnd()
  }
  return cutCodeUnits(text, room)
}

/**
 * One bounded line of human prose, cut at a sentence or word boundary.
 *
 * Same job as {@link oneLine} for the free text a reader actually reads — a
 * failure reason, a caveat, the run's own answer — with the Q11 rule applied: when
 * the text has to be cut, it is cut where a sentence ends (or, failing that,
 * between words), never in the middle of one.
 *
 * @param text - the prose to bound.
 * @param max - maximum length in UTF-16 code units, `…` included.
 * @returns the bounded line.
 */
function sentenceLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  const room = Math.max(1, max - 1)
  for (const find of [lastSentenceCut, lastClauseCut, lastWordCut]) {
    const cut = find(flat, room)
    if (cut > 0 && cut * 4 >= room) return `${flat.slice(0, cut).trimEnd()}…`
  }
  return `${cutCodeUnits(flat, room)}…`
}

/** Escape a literal for a regular expression. */
function literal(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** A field label or ledger key, anchored to the start of a line (leading space allowed). */
const ANCHORED_LABEL = new RegExp(`^\\s*(?:${[...LEDGER_LABELS, ...ANCHORED_KEYS].map(literal).join('|')})`)

/** A ledger phrase that also appears mid-line, bounded to a whole word. */
const MIDLINE_TERM = new RegExp(`(?:^|[^\\w])(?:${MIDLINE_LABELS.map(literal).join('|')})(?![\\w])`)

/** An identifier key, bounded to a whole word. */
const ID_TERM = new RegExp(`(?:^|[^\\w])(?:${ID_TOKENS.map(literal).join('|')})(?![\\w])`)

/**
 * True when a line carries a ledger label or an identifier token.
 *
 * Anchored/whole-word, not a substring scan (B10): a line is tainted because it
 * *is* a ledger line — a field label at its start — or because it contains a
 * phrase no human sentence contains by accident. An identifier key inside a
 * sentence is still caught, and a failure reason that merely mentions one is not
 * thrown away with it.
 */
function tainted(line: string): boolean {
  return ANCHORED_LABEL.test(line) || MIDLINE_TERM.test(line) || ID_TERM.test(line)
}

/** Drop any line that carries a ledger label or an identifier token. */
function scrub(text: string): string {
  const kept: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    if (tainted(line)) continue
    kept.push(line)
  }
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Machine detail stripped from every line the human block keeps.
 *
 * {@link LEDGER_LABELS} only catch *field labels*. A child model happily writes
 * `stat -c '%s' /home/u/x` or `sha256 9f2c…` straight into a criterion, and the
 * criterion is quoted into the human block as key evidence — so a label-only
 * guard still hands the reader a shell command. The defect this file exists to
 * end is exactly that, so the strip list covers the classes a report actually
 * quotes: shell commands (with and without flags), digests and hex dumps, file
 * paths, code, and the relay markers.
 */
const MACHINE_DETAIL: readonly (readonly [RegExp, string])[] = [
  // Code is machine material by definition: fenced blocks, then inline spans.
  [/```[\s\S]*?```/g, ' '],
  [/`[^`\n]*`/g, ' '],
  // Relay delimiters, if a child echoed one into a report field.
  [/<{2,}[^\n>]{0,120}>{2,}/g, ' '],
  // Locators: file URIs, URLs, Windows and POSIX paths.
  [/\bfile:\/\/\S+/g, ' '],
  [/\bhttps?:\/\/\S+/g, ' '],
  [/\b[A-Za-z]:\\[^\s"'`]+/g, ' '],
  [/(?:^|[\s(（"'=])(?:~|\.{1,2})?\/[\w.@%+-]+(?:\/[\w.@%+-]+)+/g, ' '],
  // Bare file names: a reader does not open `answer.ts` from a chat message.
  [/\b[\w-]+(?:\.[\w-]+)*\.(?:ts|tsx|js|mjs|cjs|json|jsonl|md|ya?ml|lock|sh|py|log|txt|csv|png|jpe?g|svg|zip|gz)\b/gi, ' '],
  // Digests and the hex dump of a file (`od`, `xxd`), abbreviated commits.
  [/\b(?:sha-?(?:1|256|512)|md5|sha1sum|sha256sum|sha512sum|md5sum)\b/gi, ' '],
  [/\b[0-9a-f]{8,64}\b/gi, ' '],
  // A command with flags (`stat -c`, `od -c`, `npm run build --silent`).
  [/\b[\w.-]+\s+-{1,2}[A-Za-z][\w-]*(?:\s+\S+)*/g, ' '],
  // A bare command head: the tools these reports quote most often.
  [/\b(?:npm|pnpm|npx|yarn|vitest|jest|tsc|oxlint|eslint|curl|wget|docker|kubectl|python3?|pip3?|cargo|mvn|gradle|git|stat|sed|awk|grep|rg|xargs|xxd|hexdump|chmod|chown|base64|jq|systemctl|unzip)\s+[^，。；\n]{0,120}/gi, ' '],
  // Station/serial codes a field report quotes (`站号A12`, `Station No. 5`).
  [/(?:站号|站点|编号)\s*[:：#]?\s*[A-Za-z0-9][A-Za-z0-9-]*/g, ' '],
  [/\bStation\s+(?:No\.?\s*#?|#)\s*[A-Za-z0-9][A-Za-z0-9-]*/gi, ' '],
  // Coordinates: paired 3-decimal readings, lat/lon markers, UTM, labelled pairs.
  [/\b-?\d{1,3}\.\d{3,}\s*[,，;；\s]\s*-?\d{1,3}\.\d{3,}/g, ' '],
  [/\b(?:lat(?:itude)?|lon(?:gitude)?)\s*[:：=]?\s*-?\d+(?:\.\d+)?/gi, ' '],
  [/(?:经度|纬度|经纬度)\s*[:：=]?\s*-?\d+(?:\.\d+)?/g, ' '],
  [/\bUTM\b[^\n，。；;]{0,40}/gi, ' '],
  [/(?:坐标|coordinates?)\s*[:：=]?\s*[^\n，。；;]{1,40}/gi, ' '],
  // Model chains: arrow links, role assignments, provider/model/route markers.
  [/[^，。；;\n]*→[^，。；;\n]*/g, ' '],
  [/\b(?:planner|worker|verifier|supervisor|synthesizer)\s*=\s*[^\s，。；;\n]+/gi, ' '],
  [/\b(?:provider|model|route)\s*[:：=]\s*\S+/gi, ' '],
  // A `provider/model` pair — but never the run's own `[category]` bracket
  // (B10): `[infrastructure/timeout]` is a failure reason's own words, not a
  // route, so a pair wrapped in `[…]` is left alone.
  [/(?<![[])\b(?=[\w.-]*[A-Za-z])[\w.-]+\/[\w.:-]+(?![\]])/g, ' '],
  // Machine assignments a child model quotes back verbatim (`RESUME code=none
  // next_round=42`, Q11). Only this closed list of keys is touched, so ordinary
  // prose that happens to contain `x=1` is never rewritten.
  [/\b(?:verdict|code|class|failureClass|next_round|blocked_streak|round|streak|seq|childId|taskId|runId)\s*=\s*[^\s，。；;]+/g, ' '],
  // Tally phrasing: the run's own count sentences, never an answer.
  [/\b\d[\d,]*\s*ms\s+per\s+run\b/gi, ' '],
  [/\d+\s*项任务(?:全部)?核验通过/g, ' '],
  [/全部\s*\d*\s*项任务核验通过/g, ' '],
  [/任务全部核验通过/g, ' '],
  [/\bverified\s+of\s+\d+\b/gi, ' '],
  [/\b\d+\s+of\s+\d+\s+tasks?\s+(?:passed\s+verification|verified)\b/gi, ' '],
  [/\ball\s+\d+\s+tasks?\s+(?:passed\s+verification|verified)\b/gi, ' '],
]
/**
 * Strip machine detail from one line, then tidy the gap it left.
 *
 * Whitespace is collapsed and an emptied bracket or a doubled separator removed,
 * so `实现 的人话块` reads as a sentence instead of punctuation soup. A line that
 * was nothing but machine detail comes back empty and its caller drops it — a
 * reader losing a bullet is better than a reader being handed a command.
 *
 * @param line - one already line-split piece of the block.
 * @returns the stripped line, possibly empty.
 */
function stripMachineDetail(line: string): string {
  let out = line
  for (const [pattern, replacement] of MACHINE_DETAIL) {
    pattern.lastIndex = 0
    out = out.replace(pattern, replacement)
  }
  return out
    .replace(/（\s*）|\(\s*\)/g, '')
    .replace(/([（(【[])\s+/g, '$1')
    .replace(/\s+([）)】\]])/g, '$1')
    .replace(/\s+/g, ' ')
    .replace(/([，,、；;：:])\s*(?=[，,、；;：:。.])/g, '')
    // A leading dash is a list bullet, so it is deliberately not trimmed here.
    .replace(/^[\s，,、；;：:。.…]+/, '')
    // A trailing `…` survives on purpose (Q11): it is this module's own truncation
    // mark, and stripping it left a cut line reading as if nothing were missing.
    .replace(/[\s，,、；;]+$/, '')
    .trim()
}

/**
 * One line of the human block, and whether the guard applies to it.
 *
 * Everything the run assembled for its own reader is guarded (no ledger label, no
 * identifier key). The failure reasons are not: they are the run's explanation of
 * what went wrong, and a reason the reader cannot see is worse than a reason that
 * mentions a token (B10) — see {@link humanConclusion}.
 */
interface BlockLine {
  text: string
  guard: boolean
}

/** Compose the block in order, applying the guard line by line to guarded entries. */
function composeBlock(lines: readonly BlockLine[]): string {
  const kept: string[] = []
  for (const item of lines) {
    for (const raw of item.text.split('\n')) {
      const line = raw.trimEnd()
      // A guarded line is assembled by this module or by the run, so it may not
      // carry a ledger label or an identifier key. An unguarded line is the
      // failure reason itself (B10) and keeps its wording — but even there a
      // shell command, a digest or a path is not something a reader can use.
      if (item.guard && tainted(line)) continue
      const clean = stripMachineDetail(line)
      if (clean === '' && line.trim() !== '') continue
      kept.push(clean)
    }
  }
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Remove task ids from text a human reads.
 *
 * The report's own prose is generated by children and by the host, and both
 * address work by id (`a: verifier verdict was fail`, `(a)`), because that is
 * how the machine half stays unambiguous. In the human half the same sentence
 * has to read as a sentence, so a leading `<id>:` prefix (ASCII or full-width
 * colon — model prose mixes them) and a parenthesised id are removed. Only ids this report actually carries are touched, so an
 * ordinary word is never rewritten.
 */
function stripIds(text: string, report: WorkflowReport): string {
  // Only real task ids of this report are touched — and a single-character id
  // must not eat the inside of another word (`childId 3` is not `task d`).
  // So one-letter ids match only as a standalone `d:` prefix or `(d)` token,
  // never inside `\w`.
  const ids = [...report.tasks.map(task => task.id), 'workflow'].filter(id => id !== '')
  let out = text
  for (const id of ids) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Single-character ids (t1-style fixtures use `a`/`b`/`c`) are the
    // dangerous ones: `d` matches inside `childId`. They match only with a
    // non-word left boundary; longer ids keep the historical separator class.
    // `$1` keeps the separator when the long-id branch matched one; the
    // single-character branch is a zero-width lookbehind with no group, so it
    // replaces with the empty string (`$1` would leak literally into a title
    // like `Task a：…` → `Task $1…`). Ids never contain `$`, so no
    // replacement-pattern injection is possible either way.
    // eslint-disable-next-line no-div-regex
    const left = id.length === 1 ? String.raw`(?:^|(?<=[^\w\u4E00-\u9FFF]))` : String.raw`(^|[\s　：,，、（(\[])`
    const keep = id.length === 1 ? '' : '$1'
    out = out.replace(new RegExp(`${left}(?:${escaped})[:：][\\s　]*`, 'gu'), keep)
    out = out.replace(new RegExp(`[（(]${escaped}[)）]`, 'gu'), '')
  }
  return out.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

/** Names a task for a human: its title, never its id. */
function titleOf(report: WorkflowReport, taskId: string, index: number): string {
  const task = report.tasks.find(entry => entry.id === taskId)
  const title = (task?.title ?? '').trim()
  return title !== '' ? oneLine(title, 60) : `第 ${index + 1} 项任务`
}

/** One closing sentence per final status — the count lives in the tail, never after the verdict. */
export function statusTail(report: WorkflowReport, verified: number, total: number, lang: DeliveryLang): string {
  const zh = lang === 'zh'
  if (report.status === 'completed') {
    return zh
      ? '以上是结论；明细已记入台账。'
      : 'That is the conclusion; details are in the ledger.'
  }
  if (report.status === 'partial') {
    const unfinished = total - verified
    return zh
      ? `以上是结论（${total} 项里 ${verified} 项可用，${unfinished} 项没做成）；明细已记入台账。`
      : `That is the conclusion (${verified} of ${total} usable, ${unfinished} not done); details are in the ledger.`
  }
  return zh
    ? '这次没做成，没有可交付的结论；明细已记入台账。'
    : 'This run did not finish, so there is no conclusion; details are in the ledger.'
}

/** True when a sentence half reads in `lang`. */
function matchesLang(half: string, lang: DeliveryLang): boolean {
  const cjk = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/
  return lang === 'zh' ? cjk.test(half) : !cjk.test(half)
}

/** A sentence splitter that keeps the terminator on each piece. */
function splitSentences(text: string): string[] {
  const out: string[] = []
  let current = ''
  for (const ch of text) {
    current += ch
    if ('。！？.!?'.includes(ch)) {
      if (current.trim() !== '') out.push(current.trim())
      current = ''
    }
  }
  if (current.trim() !== '') out.push(current.trim())
  return out
}

/** Remove near-duplicate bilingual halves: keep `lang`'s half when it carries the sentence. */
export function dedupeBilingual(text: string, lang: DeliveryLang): string {
  const pieces = splitSentences(text)
  const kept: string[] = []
  let index = 0
  while (index < pieces.length) {
    const half = pieces[index]!
    const next = pieces[index + 1]
    if (next !== undefined && matchesLang(half, lang) !== matchesLang(next, lang)) {
      const preferred = matchesLang(half, lang) ? half : next
      if (!kept.includes(preferred)) kept.push(preferred)
      index += 2
      continue
    }
    if (!kept.includes(half)) kept.push(half)
    index += 1
  }
  return kept.join(' ')
}

/** The run's own answer, first: one plain half-sentence that stands on its own. */
export function answerLead(report: WorkflowReport, lang: DeliveryLang): string {
  const summary = report.synthesis.summary ?? ''
  const pieces = summary
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '' && !tainted(line))
    .flatMap(line => splitSentences(line))
  let tried = 0
  for (const piece of pieces) {
    if (tried >= 3) break
    const stripped = stripMachineDetail(piece)
    if (stripped === '') continue
    const scrubbed = scrub(stripped)
    if (scrubbed === '') continue
    const clean = stripIds(scrubbed, report)
    if (clean === '') continue
    tried += 1
    if (!tainted(clean)) return sentenceLine(dedupeBilingual(clean, lang), 400)
  }
  // Never fall back to the raw ledger: paraphrase the first confirmation instead
  // (no criterion/evidence verbatim), and name the open questions when the run
  // left any. The fallback sentence must not carry a ledger label itself
  // (`核验通过` is a MIDLINE term): it would be dropped by its own guard.
  const first = report.confirmed[0]
  if (first !== undefined) {
    const lead = lang === 'zh' ? '有一项已得出可用结论。' : 'One item passed verification.'
    const open = report.uncertainties.length > 0
      ? (lang === 'zh' ? '还有未确认的细节，见下文。' : 'Open details are listed below.')
      : ''
    return sentenceLine(`${lead}${open}`, 400)
  }
  if (report.uncertainties.length > 0) {
    return lang === 'zh'
      ? '答案里还有没确认的细节，见下文。'
      : 'The answer still has unconfirmed details, listed below.'
  }
  return ''
}

/** Short, category-aware "what now" advice a reader can act on. */
function nextStep(report: WorkflowReport, lang: DeliveryLang): string {
  const category = report.errors[0]?.category
    ?? report.incomplete[0]?.category
    ?? report.plan.failure?.category
    ?? 'unknown'
  const zh: Record<string, string> = {
    infrastructure: '这次卡在外部服务或时限上，不是你的问题；过一会儿把同样的活再发一次通常能过。',
    quality: '方向对了但没达到验收标准；把验收标准说细一点再发一次，我会重跑一遍。',
    configuration: '这是配置层面的问题，不会自己好；先把配置（并发、超时或模型链）调好再重试。',
    cancelled: '这次是被主动停下的，不算失败；要接着做得重新发一次。',
    unknown: '把没做成的部分单独再发一次，我会针对它重跑。',
  }
  const en: Record<string, string> = {
    infrastructure: 'This was an external service or deadline problem, not your request; sending the same work again later usually goes through.',
    quality: 'The direction was right but the acceptance checks were not met; restate them more precisely and I will run it again.',
    configuration: 'This is a configuration problem that will not fix itself; adjust the caps, deadline or model chain first.',
    cancelled: 'This was stopped on purpose, not a failure; send it again to continue.',
    unknown: 'Send the unfinished part as its own request and I will run just that.',
  }
  return (lang === 'zh' ? zh : en)[category] ?? (lang === 'zh' ? zh.unknown! : en.unknown!)
}

/**
 * Compose the block for one language, before the char bound is applied.
 *
 * Order is deliberate: the run's own answer first, then the advice/next step
 * in the run's original wording, then what was and was not achieved, then the
 * caveats, and finally the closing tail. A reader who stops after the first
 * line already has the answer; the count lives only in the tail.
 *
 * @param report - validated report (or an explicit failure report).
 * @param lang - language this pass is written in.
 * @returns the composed block and the verdict tail it ends with.
 */
function composeHumanParts(report: WorkflowReport, lang: DeliveryLang): { block: string, tail: string } {
  const zh = lang === 'zh'
  const verifiedTasks = report.tasks.filter(task => task.status === 'verified')
  const verified = verifiedTasks.length
  const total = report.tasks.length
  const lines: BlockLine[] = []
  // Every line this function assembles is guarded, except the failure reasons,
  // which are the run's own explanation and must reach the reader (B10).
  // Even there a shell command, a digest or a path is stripped by composeBlock —
  // only the ledger labels stay out of the guard.
  const push = (text: string, guard = true): void => { lines.push({ text, guard }) }
  const lead = answerLead(report, lang)
  if (lead !== '') {
    push(zh ? `答案：${lead}` : `Answer: ${lead}`)
  } else if (report.status === 'failed') {
    push(zh ? '答案：这次没能给出可用结论。' : 'Answer: no usable conclusion this time.')
  }

  // The run's own advice/next step, verbatim and moved up: it reads right after
  // the answer and before the folded process detail.
  const advice = report.status === 'completed'
    ? (zh ? '结果可以直接用；哪一项对不上，就把那一项单独再发一次，我会重跑。' : 'The result is usable as it stands; if one item does not match what you expected, send that item again and I will rerun it.')
    : nextStep(report, lang)
  push((zh ? '下一步：' : 'Next: ') + advice)

  // A mid-run replan is a fact about this answer, not diagnostics: the run the
  // reader asked for was changed by a message they sent, so saying which version
  // ran and that finished work was kept belongs here, before the task detail.
  const appliedReplans = (report.plan.replans ?? []).filter(row => row.decision === 'applied')
  if (appliedReplans.length > 0) {
    const version = report.plan.version ?? appliedReplans[appliedReplans.length - 1]!.version
    const added = appliedReplans.reduce((sum, row) => sum + row.addedTaskIds.length, 0)
    push(zh
      ? `过程：计划已更新到第 ${version} 版（并入 ${appliedReplans.length} 次新要求，新增 ${added} 个任务），已经完成的部分没有重跑。`
      : `Process: the plan reached version ${version} (${appliedReplans.length} new demand(s) merged, ${added} task(s) added); work already finished was not rerun.`)
  }

  // What was achieved, named the way a reader knows it (title, never id).
  const doneTitles = verifiedTasks
    .slice(0, 4)
    // Position comes from the report, not from the slice: an untitled task must
    // still be numbered by where it sits in the run, not by where it landed in
    // this filtered list.
    .map(task => titleOf(report, task.id, report.tasks.indexOf(task)))
    .filter(title => title !== '')
  if (report.status !== 'completed' && doneTitles.length > 0) {
    const rest = verifiedTasks.length > doneTitles.length ? (zh ? ' 等' : ' and more') : ''
    push(zh ? `做成的：${doneTitles.join('、')}${rest}。` : `Achieved: ${doneTitles.join(', ')}${rest}.`)
  }

  // What did not get done, with the reason the run actually recorded.
  const undone = report.tasks.filter(task => task.status !== 'verified')
  if (undone.length > 0) {
    push(zh ? '没做成的：' : 'Not done:')
    undone.slice(0, 5).forEach((task) => {
      const item = report.incomplete.find(entry => entry.taskId === task.id)
      // Not scrubbed against ledger labels either: `incomplete[].reason` and
      // `task.error` are the run's own account of what went wrong, and this is
      // the only place a reader sees it (B10). Machine detail (commands, paths,
      // digests, coordinates, routes) is still stripped, because a reader cannot
      // use it — but the line itself is never dropped for mentioning a token.
      const reason = sentenceLine(stripMachineDetail(item?.reason ?? task.error ?? ''), 240)
      const name = titleOf(report, task.id, report.tasks.indexOf(task))
      // The separator follows the block's language, like every other row above:
      // a full-width colon inside an English sentence reads as a typo.
      push(reason === '' ? `- ${name}` : `- ${name}${zh ? '：' : ': '}${reason}`, false)
    })
    if (undone.length > 5) push(zh ? `- 另有 ${undone.length - 5} 项没做成` : `- ${undone.length - 5} more did not finish`)
  }

  // A failure with no task rows (deadline, engine error) still needs its reason.
  // When task rows exist the reason is already above, so it is not repeated here.
  if (report.status === 'failed' && undone.length === 0 && report.errors.length > 0) {
    const reason = sentenceLine(stripMachineDetail(report.errors[0]!.message), 300)
    if (reason !== '') push(zh ? `原因：${reason}` : `Reason: ${reason}`, false)
  }

  // Caveats stay visible at every status: they are content, not diagnostics.
  const caveats = report.uncertainties.slice(0, 4)
  if (caveats.length > 0) {
    push(zh ? '需要你知道的：' : 'Worth knowing:')
    for (const item of caveats) {
      push(`- ${sentenceLine(scrub(item.text), 240)}`)
    }
  }

  const tail = statusTail(report, verified, total, lang)
  push(tail)

  return { block: stripIds(composeBlock(lines), report), tail }
}

/**
 * Bound one composed block to `cap` characters, keeping both ends a reader needs.
 *
 * The head line is the answer and the tail is the verdict, and the count appears
 * nowhere else in the delivery — so both are kept and the middle is what gets
 * cut (round 36). Three details decide the shape of that cut (round 37):
 *
 * - The tail is reserved first. The verdict is unrecoverable from anywhere else,
 *   so when the cap cannot hold it beside the head, the head is what shrinks.
 * - The middle ends on a line break when its window carries one, so no line is
 *   handed over half-written. Every line this block is built from is bounded by
 *   {@link oneLine}, so reaching a break costs at most one bounded line.
 * - `…` marks the junction, so a reader can tell text is missing instead of
 *   reading a stitched-together sentence.
 *
 * @param block - composed block, possibly over `cap`.
 * @param tail - the verdict tail the block ends with.
 * @param cap - maximum length in UTF-16 code units.
 * @returns the block, at most `cap` characters.
 */
function clampHumanBlock(block: string, tail: string, cap: number): string {
  if (block.length <= cap) return block
  const keepTail = `…\n${tail}`
  // A cap too small for the whole verdict still gets as much of it as fits:
  // dropping it would leave a summary with no conclusion at all.
  if (keepTail.length >= cap) return `${cutCodeUnits(tail, cap - 1)}…`
  const head = block.split('\n')[0] ?? ''
  const room = cap - keepTail.length
  const headKeep = cutCodeUnits(head, room)
  const rest = room - headKeep.length
  if (rest <= 0) return `${headKeep}${keepTail}`
  const window = block.slice(head.length, head.length + rest)
  const brk = window.lastIndexOf('\n')
  // No line break inside the window means the cut lands inside one line, so it is
  // taken at a sentence or word boundary instead of at an arbitrary character.
  const middle = brk >= 0 ? window.slice(0, brk + 1) : boundaryPrefix(window, rest)
  return `${headKeep}${middle}${keepTail}`
}

/**
 * Split one bilingual pair's character budget between its two blocks.
 *
 * Round 36 bounded the pair as `both.length <= cap ? both : slice(0, cap - 1) +
 * '…'` — a blind cut of the concatenation. One block at the single-pass cap plus
 * one at `cap - 1` plus the two-character separator is 4801, one over the 4800
 * cap, and that cut ate the last characters of the *second* language's verdict
 * (`明细已记入台…`) — the language the mirror exists to serve. Both blocks are
 * whole deliveries: each carries a head and a verdict, and the verdict appears
 * nowhere else. So the budget is halved and then topped up from whatever the
 * shorter block does not need, and no block can be left with nothing.
 *
 * Exported because the arithmetic is what failed and it is worth pinning with
 * the incident's own numbers; {@link humanConclusion} is the only caller.
 *
 * @param firstLen - composed length of the first block.
 * @param secondLen - composed length of the second block.
 * @param budget - characters available to both blocks, separator excluded.
 * @returns the caps, in call order; they never sum past `budget`.
 */
export function pairCaps(firstLen: number, secondLen: number, budget: number): [number, number] {
  const room = Math.max(0, budget)
  let first = Math.min(firstLen, Math.floor(room / 2))
  let second = Math.min(secondLen, room - first)
  const slack = room - first - second
  const toFirst = Math.min(slack, firstLen - first)
  first += toFirst
  second += Math.min(slack - toFirst, secondLen - second)
  return [first, second]
}

/**
 * Build the plain-language block for one settled run.
 *
 * One pass per language, in the order the reader is most likely to read: `lang`
 * first. `bilingual` composes both, because a chat answer can reach a reader whose
 * language the rules guessed wrong (a one-word follow-up carries no language
 * signal) and a summary nobody can read is not a summary.
 *
 * @param report - validated report (or an explicit failure report).
 * @param opts - `lang` (default `zh`) and the `bilingual` mirror switch.
 * @returns the human block, bounded (twice the single-pass bound when bilingual).
 */
export function humanConclusion(
  report: WorkflowReport,
  opts: { lang?: DeliveryLang, bilingual?: boolean } = {},
): string {
  const lang: DeliveryLang = opts.lang ?? 'zh'
  const first = composeHumanParts(report, lang)
  const firstBlock = clampHumanBlock(first.block, first.tail, MAX_HUMAN_CHARS)
  if (opts.bilingual !== true) return firstBlock
  const second = composeHumanParts(report, lang === 'zh' ? 'en' : 'zh')
  const secondBlock = clampHumanBlock(second.block, second.tail, MAX_HUMAN_CHARS)
  if (secondBlock === '') return firstBlock
  const separator = '\n\n'
  // Round 37: the pair is bounded by splitting the budget between the two blocks
  // ({@link pairCaps}) instead of cutting the concatenation, so only middle text
  // can go and every block keeps its head and its verdict. {@link clampHumanBlock}
  // already keeps a single block inside the single-pass cap, so a block is only
  // cut twice when the two of them together genuinely overflow.
  const budget = MAX_HUMAN_CHARS * 2 - separator.length
  const [firstCap, secondCap] = pairCaps(firstBlock.length, secondBlock.length, budget)
  const left = clampHumanBlock(firstBlock, first.tail, firstCap)
  const right = clampHumanBlock(secondBlock, second.tail, secondCap)
  return `${left}${separator}${right}`
}

/** The five routed roles, in the order `src/report.ts` renders them. */
const ROUTE_ROLES = ['planner', 'worker', 'verifier', 'supervisor', 'synthesizer'] as const

/**
 * Name a value's shape for a refusal.
 *
 * `typeof` is enough for everything except the two shapes it misnames: `null` is
 * `object`, and an array is `object` too — neither tells an operator what to fix.
 */
function gotType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

/**
 * Read the per-role chains the ledger prints, refusing anything but `provider/model` labels.
 *
 * The routing map is report data, and the ledger used to hand it straight to
 * `Array#join`: a number, a boolean or a `null` in a chain was coerced into the
 * line (`worker=a/m1 → 7 → `), and a chain that was not an array at all threw a
 * bare `TypeError: chain.join is not a function` out of the ledger, naming neither
 * the role nor the position. Both are the same defect as a truncated block: the
 * reader is handed text that describes something other than what ran. The route
 * line is the one place a *configuration* is restated, and an operator debugging a
 * fallback reads it as the truth about which chain was in force, so every entry is
 * checked and the refusal carries its path (`roles.worker[1]`) and the shape found.
 *
 * An absent or `null` chain means "inherit", matching `routeLabels` in
 * `src/report.ts`; roles are read in report order so the line cannot drift.
 *
 * @param routing - the report's `routing` map, as data.
 * @returns role and chain pairs, in report order.
 * @throws Error when the map, a chain or a route label is not the expected shape.
 */
function routeChains(routing: unknown): [string, string[]][] {
  if (typeof routing !== 'object' || routing === null || Array.isArray(routing)) {
    throw new Error(`delivery: roles must be a record of per-role chains, got ${gotType(routing)}`)
  }
  const map = routing as Record<string, unknown>
  return ROUTE_ROLES.map((role): [string, string[]] => {
    const path = `roles.${role}`
    const chain = map[role]
    if (chain === undefined || chain === null) return [role, []]
    if (!Array.isArray(chain)) {
      throw new Error(`delivery: ${path} must be an array of "provider/model" strings, got ${gotType(chain)}`)
    }
    return [role, chain.map((entry, index) => {
      if (typeof entry !== 'string') {
        throw new Error(`delivery: ${path}[${index}] must be a "provider/model" string, got ${gotType(entry)}`)
      }
      return entry
    })]
  })
}

/** Count failures per category, so the ledger separates "provider down" from "work short". */
function failureCounts(report: WorkflowReport): { category: string, count: number }[] {
  const counts = new Map<string, number>()
  const add = (category: string | undefined): void => {
    if (category === undefined) return
    counts.set(category, (counts.get(category) ?? 0) + 1)
  }
  for (const task of report.tasks) {
    const classified = task.attempts.filter(attempt => attempt.failure?.category !== undefined)
    if (classified.length === 0) {
      add(report.incomplete.find(item => item.taskId === task.id)?.category)
      continue
    }
    // Same rule as `failureSummary` in `src/report.ts`: a verified task's failed
    // attempts were recovered, and the ledger's `Failures:` line has to say the
    // same thing as the report's (round 26).
    if (task.status === 'verified') continue
    for (const attempt of classified) add(attempt.failure?.category)
  }
  if (counts.size === 0) for (const entry of report.errors) add(entry.category)
  const order = ['infrastructure', 'quality', 'configuration', 'cancelled', 'unknown']
  return order.filter(category => counts.has(category)).map(category => ({ category, count: counts.get(category) ?? 0 }))
}

/**
 * Build the full machine ledger.
 *
 * Only ever reached through an explicit diagnostics switch. It keeps every id,
 * route and attempt a maintainer needs, under the same field labels
 * `src/report.ts` renders, so the two views describe one report in one dialect.
 *
 * @param report - validated report.
 * @returns the ledger text, bounded by {@link MAX_LEDGER_CHARS}.
 */
export function machineLedger(report: WorkflowReport): string {
  const verified = report.tasks.filter(task => task.status === 'verified').length
  const lines: string[] = [
    `Grok workflow: ${report.status.toUpperCase()}`,
    `Objective: ${oneLine(report.objective, 300)}`,
    `Plan: ${report.plan.source}; ${report.tasks.length} task(s); ${verified} verified`,
  ]
  const failures = failureCounts(report)
  if (failures.length > 0) {
    lines.push(`Failures: ${failures.map(entry => `${entry.count} ${entry.category}`).join(', ')}`)
  }
  if (report.plan.failure !== undefined && report.plan.failure !== null && report.plan.failure.category !== undefined) {
    lines.push(`Plan failure: ${report.plan.failure.class} (${report.plan.failure.category})`)
  }
  for (const task of report.tasks) {
    const attempts = task.attempts.length
    lines.push(`- ${task.id}: ${task.status} (${attempts} attempt${attempts === 1 ? '' : 's'}) — ${oneLine(task.title, 160)}`)
    if (task.status === 'failed') {
      const category = report.incomplete.find(item => item.taskId === task.id)?.category
      lines.push(`  incomplete${category === undefined ? '' : ` (${category})`}: ${oneLine(task.error || task.expectedOutput, 500)}`)
    }
  }
  if (report.confirmed.length > 0) {
    lines.push('Confirmed evidence:')
    for (const item of report.confirmed.slice(0, 12)) {
      lines.push(`- ${item.taskId}: ${oneLine(item.criterion, 200)} → ${oneLine(item.evidence, 400)}`)
    }
  }
  if (report.incomplete.length > 0) {
    lines.push('Incomplete:')
    for (const item of report.incomplete.slice(0, 12)) {
      lines.push(`- ${item.taskId}${item.category === undefined ? '' : ` (${item.category})`}: ${oneLine(item.reason, 500)}`)
    }
  }
  if (report.uncertainties.length > 0) {
    lines.push('Uncertainties:')
    for (const item of report.uncertainties.slice(0, 12)) {
      lines.push(`- ${item.taskId}: ${oneLine(item.text, 400)}`)
    }
  }
  if (report.synthesis.summary !== undefined) {
    lines.push('Final answer:')
    lines.push(oneLine(report.synthesis.summary, 2_000))
  }
  if (report.synthesis.error !== undefined) {
    lines.push(`Synthesis: model narrative unavailable (${oneLine(report.synthesis.error, 300)}); the report above is complete`)
  }
  // R8: the mode line owns its own label. It used to be a second `Synthesis:`
  // line, so one label carried two facts (the failure note and the mode) and a
  // reader or parser had to guess which it was looking at.
  lines.push(`Synthesis mode: ${report.synthesis.mode}`)
  // Five routed roles, in report order (`src/report.ts` `ROLE_NAMES`): a run
  // configured with a supervisor chain must name it the same way `renderReport`
  // does, or the ledger reads "no supervision" for a supervised run (R8-ledger).
  // The chains are checked first (round 40): a coerced route reads as a chain that
  // was never configured, and a non-array chain used to escape as a bare TypeError.
  const configured = routeChains(report.routing)
  lines.push(`Model routes: ${configured.map(([role, chain]) => `${role}=${chain.length === 0 ? 'inherit' : chain.join(' → ')}`).join('; ')}`)
  if (report.limits.timeoutMs !== undefined) {
    lines.push(`Deadline: ${report.limits.timeoutMs} ms per run (enforced by the plugin)`)
  }
  const routeFailures = report.routes.filter(entry => entry.outcome === 'failed')
  if (routeFailures.length > 0) {
    lines.push('Route switches:')
    for (const entry of routeFailures.slice(0, 12)) {
      lines.push(`- ${entry.role} attempt ${entry.attempt} via ${entry.route}: ${entry.failureClass ?? 'unknown'} — ${oneLine(entry.reason ?? '', 200)}`)
    }
  }
  const overflows = report.routes.filter(entry => (entry.skippedBusy?.length ?? 0) > 0 || (entry.queuedMs ?? 0) > 0)
  if (overflows.length > 0) {
    lines.push('Route overflows (a lane was full when the call was placed; not a failure):')
    for (const entry of overflows.slice(0, 12)) {
      const skipped = entry.skippedBusy ?? []
      const full = skipped.length === 0 ? 'no lane named' : `${skipped.join(', ')} skipped full`
      const waited = entry.queuedMs === undefined ? '' : `; queued ${entry.queuedMs} ms`
      lines.push(`- ${entry.role} attempt ${entry.attempt} via ${entry.route}: ${full}${waited}`)
    }
  }
  if (report.errors.length > 0) {
    lines.push('Errors:')
    for (const entry of report.errors.slice(0, 12)) {
      lines.push(`- ${entry.phase}${entry.category === undefined ? '' : ` (${entry.category})`}: ${oneLine(entry.message, 300)}`)
    }
  }
  const text = lines.join('\n')
  return text.length <= MAX_LEDGER_CHARS ? text : `${text.slice(0, MAX_LEDGER_CHARS - 1)}…`
}

/**
 * Compose one delivery: human conclusion first, machine ledger only on request.
 *
 * The default view is the human block alone. `diagnostics` adds the ledger after
 * a horizontal rule, which is the only way any of the machine identifiers reach
 * a reader — so "the summary said it, the ledger proves it" stays true without
 * the second half being mandatory.
 *
 * @param report - validated report, or an explicit failure report.
 * @param opts - `diagnostics` switch (default off) and `lang`.
 * @returns the composed view; `ledger` is absent when the switch is off.
 */
export function deliverReport(report: WorkflowReport, opts: DeliveryOptions = {}): DeliveryView {
  const diagnostics = diagnosticsEnabled(opts.diagnostics)
  // `DeliveryOptions` is a superset of what the block composer reads, so it is
  // handed over as is rather than rebuilt into a second options object.
  const human = humanConclusion(report, opts)
  // The ledger is diagnostics: a report whose routing cannot be rendered must still
  // deliver the answer, so a refused chain drops the ledger here instead of escaping
  // as a thrown delivery. `src/answer.ts` `foldedLedger` makes the same call on the
  // relay path; this is the layer a direct caller of `deliverReport` sees.
  let ledger: string | undefined
  if (diagnostics) {
    try {
      ledger = machineLedger(report)
    } catch {
      ledger = undefined
    }
  }
  const text = ledger === undefined ? human : `${human}\n\n${LEDGER_RULE}\n\n${ledger}`
  return {
    diagnostics,
    human,
    ...ledger === undefined ? {} : { ledger },
    text,
  }
}

/** Status word for a one-line description of a delivery, used by logs and tests. */
export function deliveryHeadline(status: FinalStatus): string {
  return status === 'completed' ? '做完了' : status === 'partial' ? '做了一部分' : '这次没做成'
}