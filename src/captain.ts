/**
 * Captain foreground (队长前台化): the one confirmation between the front desk and
 * the run.
 *
 * The front desk decides *how much* a message costs (`src/triage.ts`: chat, quick,
 * team, ask). This module owns the next decision: once the front desk routed a
 * message to the team, the captain states the split it intends to use and asks for
 * one confirmation before any work is dispatched.
 *
 * Why a round instead of "just run it":
 * - the split is the expensive decision (how many children, waves and planner calls
 *   a round spends), and a user who disagrees with it currently pays for the whole
 *   run before being able to say so;
 * - the answer to the confirmation is a *plan change*, not a new task, so it has to
 *   reach the planner as an amendment of the original request instead of being
 *   routed as a fresh message that throws that request away.
 *
 * The asymmetry mirrors `src/channel.ts`: an unmistakable approval is the only
 * message that dispatches; an explicit edit amends the plan; anything else voids the
 * confirmation and is routed on its own. Nothing is guessed — a misread approval
 * would spend a whole run, and a misread new task would silently fold two unrelated
 * requests into one objective.
 *
 * The module is pure: no I/O, no clock, no model call. The caller (the gate) owns
 * the pending entry, the preview call and the dispatch.
 */

import { redactSecrets } from './redact.js'
import type { TriageLang } from './triage.js'

/** Bounds on one confirmation round. */
export const CAPTAIN_LIMITS = {
  /** Characters kept from one preview answer. */
  previewChars: 1200,
  /** Characters kept from one amended request (the original plus the user's words). */
  amendChars: 4000,
  /** Longest message still readable as a bare approval ("确认" yes, "确认，再加 X" no). */
  approveMaxChars: 24,
} as const

/** What one message means for a pending split confirmation. */
export type CaptainAnswerKind = 'approve' | 'amend' | 'other'

/**
 * Whole-message approvals.
 *
 * Whole-message matching is what keeps "确认一下这个文件是什么" (a question) and
 * "确认，再加一个任务" (an edit) from dispatching a plan the user did not agree to.
 * Politeness and trailing punctuation are stripped before the comparison.
 */
const APPROVE_EXACT: readonly string[] = [
  // zh
  '确认', '确认吧', '确认了', '确认过', '同意', '同意吧', '可以', '可以吧', '行', '行吧',
  '好', '好的', '好吧', '开干', '开工', '开始', '开始吧', '派活', '派吧', '按这个来',
  '就这样', '没问题', '没问题吧', '对', '对的', '嗯', '干吧', '来吧',
  // en
  'ok', 'okay', 'yes', 'y', 'yep', 'yeah', 'go', 'go ahead', 'proceed', 'approve',
  'approved', 'confirm', 'confirmed', 'lgtm', 'ship it', 'do it', 'yes please',
]

/**
 * Approvals that may carry a short tail ("开干。", "确认！").
 *
 * Only these dispatch a message longer than the exact list; a tail that carries
 * an edit still reaches the marker check first, so "开干，改成两个任务" is an edit.
 */
const APPROVE_PREFIX: readonly string[] = [
  '确认', '同意', '可以', '开干', '开工', '开始', '派活', '按这个来', '就这样', '没问题',
  'ok', 'okay', 'yes', 'go ahead', 'proceed', 'approve', 'confirm', 'lgtm',
]

/** Edits that mean "change the split", never "start a new task". */
const AMEND_MARKERS: readonly string[] = [
  '改成', '改为', '换成', '换掉', '不要做', '别做', '去掉', '删掉', '加上', '再加', '补充',
  '先做', '后做', '调整', '重排', '分成', '拆成', '合并', '不拆', '别拆', '不要拆', '只做',
  'instead', 'change', 'add', 'remove', 'drop', 'skip', 'reorder', 'merge', 'split into',
]

const FILLER = /[。．.!！,，~～、\s吧了的好啊呀哦嘛呢的]/gu
const POLITE_PREFIX = /^(?:请|麻烦|帮我|please|pls)\s*/u
const TRAILING_PUNCT = /[。．.!！,，~～、；;：:\s]+$/u

/** Lower-case, collapse whitespace, keep CJK as-is. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/gu, ' ').trim()
}

/** The comparison form: `请确认。` → `确认`. */
function answerForm(text: string): string {
  return text.replace(POLITE_PREFIX, '').replace(TRAILING_PUNCT, '').trim()
}

/**
 * Read one message against a pending split confirmation.
 *
 * Order matters: an edit marker wins over an approval prefix, because
 * "确认，改成两个任务" agrees with the direction and changes the split — dispatch
 * it as-is and the edit is lost.
 * @param raw - the user's message, verbatim.
 * @returns `approve` to dispatch, `amend` to dispatch with the change, `other` to
 *   void the confirmation and route the message on its own.
 */
export function captainAnswer(raw: string): CaptainAnswerKind {
  const text = answerForm(normalize(typeof raw === 'string' ? raw : ''))
  if (text === '') return 'other'
  if (APPROVE_EXACT.includes(text)) return 'approve'
  if (AMEND_MARKERS.some(marker => text.includes(marker))) return 'amend'
  if (text.length <= CAPTAIN_LIMITS.approveMaxChars) {
    for (const prefix of APPROVE_PREFIX) {
      if (!text.startsWith(prefix)) continue
      // A prefix only approves when the tail is filler ("开干吧。") — never when it
      // carries content ("确认一下这个文件是什么" is a question, not an approval).
      const tail = text.slice(prefix.length).replace(FILLER, '')
      if (tail === '') return 'approve'
    }
  }
  return 'other'
}

/** Clip one text field to a bound, redacted so a pasted secret cannot travel. */
function bounded(value: string, limit: number): string {
  const redacted = redactSecrets(String(value ?? ''))
  return redacted.length <= limit ? redacted : `${redacted.slice(0, limit - 1)}…`
}

/**
 * The prompt that asks the captain for its split, before any work is dispatched.
 *
 * One short answer, no tools: this is the sentence the user confirms or changes, so
 * it has to be readable on its own and must not spend a plan the run then ignores.
 * @param request - the user's request as the run would receive it.
 * @returns the preview prompt.
 */
export function captainPreviewPrompt(request: string): string {
  return [
    'CAPTAIN SPLIT PREVIEW: no work is dispatched yet.',
    'The front desk routed this request to the team. State the split you would use, in the language of the request, as at most five short lines:',
    '- one line per task: what it delivers (not how);',
    '- then one line saying whether you would press on or stop when a task fails verification.',
    'No preamble, no headings, no tool calls, no work of any kind: this is one reply the user confirms or changes.',
    '',
    'REQUEST:',
    bounded(request, CAPTAIN_LIMITS.amendChars),
  ].join('\n')
}

/**
 * The question that carries the preview.
 * @param lang - language of the user's message.
 * @param preview - the captain's split preview, already bounded.
 * @returns the user-visible confirmation question.
 */
export function captainAskText(lang: TriageLang, preview: string): string {
  const body = bounded(preview, CAPTAIN_LIMITS.previewChars).trim()
  return lang === 'zh'
    ? [
        '队长先报拆法，确认后才派活：',
        body,
        '',
        '确认就回「确认」或「开干」；要改拆法直接说（例如「改成两个任务」「先做验证部分」）。',
      ].join('\n')
    : [
        'The captain states the split before any work is dispatched:',
        body,
        '',
        'Reply "confirm" to dispatch, or say what to change (for example "make it two tasks" or "do the verification part first").',
      ].join('\n')
}

/** The preview used when the cheap preview call could not answer. */
export function captainPreviewFallback(lang: TriageLang): string {
  return lang === 'zh'
    ? '这次没能先报出具体拆法。我会先读目标，按能独立验收的边界拆任务，逐项派工、逐项验收，最后汇总；某项没过验收时我会停下来说明，不拿没验过的结果充数。'
    : 'The concrete split could not be previewed this time. I will read the objective, split it on boundaries that can be verified independently, dispatch each item, verify each one, and summarise; if an item fails verification I will stop and say so instead of passing unverified work along.'
}

/** One line stating that the confirmed split is what was dispatched. */
export function captainApproveNote(lang: TriageLang): string {
  return lang === 'zh'
    ? '队长确认：按上面报的拆法派活。'
    : 'Captain confirmed: dispatching the split stated above.'
}

/** One line stating that an unanswered confirmation is void. */
export function captainVoidNote(lang: TriageLang, expired: boolean): string {
  if (lang === 'zh') {
    return expired
      ? '上一个拆法确认已过期（超过 10 分钟没回答），已作废；这条消息按新任务单独分流。'
      : '上一个拆法确认没有回答（既不是确认，也不是改法），已作废；这条消息按新任务单独分流。'
  }
  return expired
    ? 'The previous split confirmation expired (more than 10 minutes ago), so it is void; this message is routed on its own.'
    : 'The previous split confirmation was not answered (neither an approval nor an edit), so it is void; this message is routed on its own.'
}

/**
 * Fold an explicit edit into the request the confirmation asked about.
 *
 * The original request stays whole and the amendment is stated as a change to it:
 * handing the planner only the amendment would lose the work it refers to.
 * @param original - the request the confirmation was asked about.
 * @param amendment - the user's own words.
 * @returns one request, bounded to the amendment budget.
 */
export function amendRequest(original: string, amendment: string): string {
  const head = bounded(original, CAPTAIN_LIMITS.amendChars).trim()
  const tail = bounded(amendment, CAPTAIN_LIMITS.amendChars).trim()
  const joined = `${head}\n\nUSER AMENDMENT (the user changed the confirmed split; the original request above still stands):\n${tail}`
  return bounded(joined, CAPTAIN_LIMITS.amendChars)
}
