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
 * - **Never dress a failure as success.** A `failed` run opens with its own
 *   wording; it never borrows the "done" sentence, because a failure that reads
 *   like an answer is worse than no answer.
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
  'Uncertainties:',
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

/** Collapse whitespace and clamp one value to a single bounded line. */
function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, Math.max(0, max - 1))}…`
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
    .replace(/([（(【\[])\s+/g, '$1')
    .replace(/\s+([）)】\]])/g, '$1')
    .replace(/\s+/g, ' ')
    .replace(/([，,、；;：:])\s*(?=[，,、；;：:。.])/g, '')
    // A leading dash is a list bullet, so it is deliberately not trimmed here.
    .replace(/^[\s，,、；;：:。.…]+/, '')
    .replace(/[\s，,、；;…]+$/, '')
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
  const ids = [...report.tasks.map(task => task.id), 'workflow'].filter(id => id !== '')
  let out = text
  for (const id of ids) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(new RegExp(`(^|[\\s\u3000：,，、（(\\[])(?:${escaped})[:：][\\s\u3000]*`, 'gu'), '$1')
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

/** The first clean line(s) of the run's own answer, bounded for a human block. */
function conclusionOf(report: WorkflowReport): string {
  // Tainted lines are dropped *before* the slice, so a summary whose second line
  // happens to quote a ledger label still yields its first line instead of an
  // empty result.
  const summary = (report.synthesis.summary ?? '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '' && !tainted(line))
    .slice(0, 2)
    .join(' / ')
  return oneLine(scrub(summary), 400)
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

/** One opening sentence per final status — never the success wording for a stop. */
function headline(report: WorkflowReport, verified: number, total: number, lang: DeliveryLang): string {
  const unfinished = report.tasks.filter(task => task.status !== 'verified').length
  if (report.status === 'completed') {
    return lang === 'zh'
      ? `做完了：${total} 项任务全部核验通过。`
      : `Done: all ${total} tasks passed verification.`
  }
  if (report.status === 'partial') {
    return lang === 'zh'
      ? `做了一部分：${total} 项任务里 ${verified} 项核验通过，${unfinished} 项没做成。`
      : `Partly done: ${verified} of ${total} tasks passed verification and ${unfinished} did not.`
  }
  return lang === 'zh'
    ? '这次没做成，没有可交付的结果。'
    : 'This run did not finish, so there is no deliverable.'
}

/**
 * Build the plain-language block for one settled run.
 *
 * Order is deliberate: verdict, then the run's own conclusion, then what was and
 * was not achieved, then what to do next, then the caveats. A reader who stops
 * after the first two lines already knows whether to trust the rest.
 *
 * @param report - validated report (or an explicit failure report).
 * @param lang - language this pass is written in.
 * @returns the human block, bounded by {@link MAX_HUMAN_CHARS}.
 */
function composeHuman(report: WorkflowReport, lang: DeliveryLang): string {
  const zh = lang === 'zh'
  const verifiedTasks = report.tasks.filter(task => task.status === 'verified')
  const verified = verifiedTasks.length
  const total = report.tasks.length
  const lines: BlockLine[] = []
  // Every line this function assembles is guarded, except the failure reasons,
  // which are the run's own explanation and must reach the reader (B10).
  const push = (text: string, guard = true): void => { lines.push({ text, guard }) }
  push(headline(report, verified, total, lang))

  const conclusion = conclusionOf(report)
  if (conclusion !== '') push(zh ? `结果：${conclusion}` : `Result: ${conclusion}`)

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
      // Not scrubbed: `incomplete[].reason` and `task.error` are the run's own
      // account of what went wrong, and this is the only place a reader sees it (B10).
      const reason = oneLine(item?.reason ?? task.error ?? '', 240)
      const name = titleOf(report, task.id, report.tasks.indexOf(task))
      push(reason === '' ? `- ${name}` : `- ${name}：${reason}`, false)
    })
    if (undone.length > 5) push(zh ? `- 另有 ${undone.length - 5} 项没做成` : `- ${undone.length - 5} more did not finish`)
  }

  // A failure with no task rows (deadline, engine error) still needs its reason.
  // When task rows exist the reason is already above, so it is not repeated here.
  if (report.status === 'failed' && undone.length === 0 && report.errors.length > 0) {
    const reason = oneLine(scrub(report.errors[0]!.message), 300)
    if (reason !== '') push(zh ? `原因：${reason}` : `Reason: ${reason}`)
  }

  // Key evidence, so a "done" claim is checkable without opening the ledger.
  if (report.status === 'completed' && report.confirmed.length > 0) {
    push(zh ? '关键证据：' : 'Key evidence:')
    for (const item of report.confirmed.slice(0, 3)) {
      const criterion = oneLine(scrub(item.criterion), 120)
      const evidence = oneLine(scrub(item.evidence), 160)
      push(evidence === '' ? `- ${criterion}` : `- ${criterion}（${evidence}）`)
    }
  }

  // A finished run does not need "do the unfinished part again": its advice is
  // about the result it just produced, not about work that never happened.
  const advice = report.status === 'completed'
    ? (zh ? '结果可以直接用；哪一项对不上，就把那一项单独再发一次，我会重跑。' : 'The result is usable as it stands; if one item does not match what you expected, send that item again and I will rerun it.')
    : nextStep(report, lang)
  push((zh ? '下一步：' : 'Next: ') + advice)

  // Caveats stay visible at every status: they are content, not diagnostics.
  const caveats = report.uncertainties.slice(0, 4)
  if (caveats.length > 0) {
    push(zh ? '需要你知道的：' : 'Worth knowing:')
    for (const item of caveats) {
      push(`- ${oneLine(scrub(item.text), 240)}`)
    }
  }

  const block = stripIds(composeBlock(lines), report)
  return block.length <= MAX_HUMAN_CHARS ? block : `${block.slice(0, MAX_HUMAN_CHARS - 1)}…`
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
  if (opts.bilingual !== true) return composeHuman(report, lang)
  const first = composeHuman(report, lang)
  const second = composeHuman(report, lang === 'zh' ? 'en' : 'zh')
  const both = second === '' ? first : `${first}\n\n${second}`
  const cap = MAX_HUMAN_CHARS * 2
  return both.length <= cap ? both : `${both.slice(0, cap - 1)}…`
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
  lines.push(`Synthesis: ${report.synthesis.mode}`)
  const configured = (['planner', 'worker', 'verifier', 'synthesizer'] as const)
    .map(role => [role, report.routing[role]] as const)
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
  const ledger = diagnostics ? machineLedger(report) : undefined
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