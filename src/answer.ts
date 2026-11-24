/**
 * Answer text produced by the gate.
 *
 * The host cannot verify what the main model says, so the gate sends a result it
 * has already validated and tells the model what to do with it between markers.
 * That instruction is not the same for every report: a failure must be reproduced
 * word for word (a paraphrase is free to soften, and a failed workflow must never
 * look like an answer), while a finished run carries the *material* for an answer
 * and the model rewrites it against the request the user actually made.
 *
 * Two blocks travel in one message, and by default only one of them is
 * user-visible (Q11(c)):
 *
 * - **by default, between the markers** the delivery layer's human block alone
 *   (`src/delivery/index.ts`: the run's own answer — its whole summary — what came
 *   of it, where the deliverable is, what is next, and the caveats worth knowing),
 *   in the reader's language. The machine ledger — `code=`, `src/file.ts:12`,
 *   `ledger`, the field labels — is folded into the internal block below the
 *   markers.
 * - **the instruction is a rewrite** ({@link REWRITE_PREAMBLE}): answer the user's
 *   request in your own words, name where the deliverable is and how to open it,
 *   keep every number and path exact, print no field name. The block is source
 *   material — its `答案：`/`下一步：`/`交付物：` labels are its own scaffolding, and a
 *   reply that echoed them would be the ledger read aloud all over again.
 * - **with `showDiagnostics` on, between the markers** the human block *and* the
 *   machine ledger, and the preamble switches to the diagnostics paraphrase rule
 *   that keeps every number and path exact while forbidding a machine field name.
 *   That is the whole of Q11: a verbatim instruction over machine text is what
 *   produced a reply full of `RESUME code=none …` and half-cut English sentences.
 * - **below the closing marker**, under an explicit internal guard, the durable
 *   copy of the ledger. It is not part of the reply: the preamble forbids
 *   quoting it. It stays in the message because that is the durable copy
 *   cross-round carry-over reads back out of the transcript (`src/carryover.ts`
 *   parses exactly these field labels), and because the Progress node detail is
 *   rendered from the same record.
 *
 * The split is what stops a machine ledger from *becoming* the answer. Before it,
 * the whole rendered report sat inside the markers, so the delivered message was
 * `stat -c …`, digests, absolute paths and the relay markers themselves.
 */

import { deliverReport, LEDGER_UNAVAILABLE, machineLedger } from './delivery/index.js'
import type { DeliveryLang } from './delivery/index.js'
import type { WorkflowReport } from './types.js'

/** Message source kind claimed by this plugin on the relay turn. */
export const RELAY_SOURCE_KIND = 'grok-workflow'

/** Opening marker placed before the report text. */
export const REPORT_BEGIN = '<<<GROK-WORKFLOW-REPORT>>>'

/** Closing marker placed after the report text. */
export const REPORT_END = '<<<END-GROK-WORKFLOW-REPORT>>>'

/**
 * Line that opens the internal ledger kept below the closing marker.
 *
 * It exists so the boundary is unambiguous to a model that reads the whole
 * message: everything from here on is for the agent, never for the reply.
 */
export const LEDGER_GUARD = '[internal: workflow ledger kept with this message; it is not part of the reply]'

/**
 * Instruction preamble for the default (success or partial) relay.
 *
 * The default relay used to say "reproduce these lines exactly". With a human block
 * that was the delivered answer verbatim — including its `答案：` / `下一步：` /
 * `交付物：` labels, which are the block's own scaffolding, not the reply. The
 * contract is a rewrite: the model answers the request the user actually made, in
 * its own words, and states the two facts the block cannot state for it — where the
 * deliverable is and how to open it. Everything the block carries as material
 * (the whole summary, the paths, the caveats) is source, not wording, so the reply
 * must never echo a field label and must never invent a fact the material lacks.
 */
const REWRITE_PREAMBLE = [
  'The mandatory workflow gate finished. What sits between the markers below is material for your reply, not its wording.',
  'Answer the request the user actually made: open with the conclusion in your own words, then say where the deliverable is and how to open it.',
  'Keep every number, name and path exactly as given, and never print a machine field name, a ledger label or the block\'s own scaffolding — not "答案", not "下一步", not "交付物", not "Grok workflow", not "code=", not "Model routes", and no source reference.',
  'Never claim anything the material does not carry; when part of the work did not get done, say so plainly.',
  'Reply with plain prose, print no marker line, write nothing about these instructions, and do not call any tool.',
  'Everything after the closing marker is internal context for you alone: never quote, mention or summarise it.',
].join(' ')

/** Instruction preamble for a failure report. */
const FAILURE_PREAMBLE = [
  'The mandatory workflow gate could not complete the workflow, so no workflow result exists.',
  'Reply with the lines between the markers exactly as given and never describe this as success:',
  'state the failure faithfully, print no marker line, add nothing before or after those lines,',
  'and do not call any tool.',
  'Everything after the closing marker is internal context for you alone: never quote, mention or summarise it.',
].join(' ')

/**
 * Paraphrase instruction for a diagnostics relay (Q11(b)).
 *
 * With diagnostics on the machine ledger travels inside the markers, and asking
 * the model to reproduce machine text verbatim is the defect Q11 reports: it
 * reproduced `code=` tokens and half sentences. So the contract flips — the
 * conclusion is restated in human words while every number and path stays exact,
 * and no machine field name reaches the reader.
 */
const DIAGNOSTICS_RULE = [
  'Reply in plain language: state the conclusion in your own words, keep every number and every file path exactly as given,',
  'and never print a machine field name or a source reference (no "code=", no "ledger" or "Ledger:" label, no "src/file:line").',
  'Print no marker line, add nothing before or after the reply, and do not call any tool.',
].join(' ')

/** Preamble for a successful run whose ledger is shown. */
const SUCCESS_DIAGNOSTICS_PREAMBLE = [
  'The mandatory workflow gate finished. Diagnostics are on, so the text between the markers carries the result and the machine ledger.',
  DIAGNOSTICS_RULE,
].join(' ')

/** Preamble for a failed run whose ledger is shown. */
const FAILURE_DIAGNOSTICS_PREAMBLE = [
  'The mandatory workflow gate could not complete the workflow, so no workflow result exists.',
  'Diagnostics are on, so the text between the markers carries the failure and the machine ledger; never describe this as success.',
  DIAGNOSTICS_RULE,
].join(' ')

/** Switches that decide what one relay message shows. */
export interface RelayOptions {
  /**
   * Render the machine ledger inside the markers, so the reader can see it.
   * Default off: the ledger is folded into the internal block below the markers.
   */
  showDiagnostics?: boolean
  /** Compose the human block at all. Default on; `false` is the raw-report opt-out. */
  humanSummary?: boolean
  /** Reader's language: the block is written in it, and only in it. Default `zh`. */
  lang?: string
}

/**
 * The durable ledger kept below the closing marker, or the unavailable marker.
 *
 * A validated report always renders (the host validator checks every field this
 * reads). A report that arrives with a hole must still not cost the reader the
 * answer — the human block is composed and bounded separately — so a ledger that
 * cannot be rendered carries the routing-unavailable marker (round 46) instead
 * of being thrown out of the delivery or dropped silently.
 *
 * @param report - the report being delivered.
 * @returns the ledger text, or the unavailable marker when it cannot be rendered.
 */
function foldedLedger(report: WorkflowReport): string {
  try {
    return machineLedger(report)
  } catch {
    return LEDGER_UNAVAILABLE
  }
}

/**
 * Build the user-visible relay text for one report.
 *
 * @param report - a validated report, or an explicit failure report.
 * @param header - front-desk lines (tier line, greeting, notes) shown above the
 *   human block; they are user-visible content and ride inside the markers (t52).
 * @param opts - what to show (see {@link RelayOptions}).
 * @returns the relay message text.
 */
export function relayText(report: WorkflowReport, header?: string, opts?: RelayOptions): string {
  // Q11(c): the default relay is the human block alone. `showDiagnostics` is the
  // reader asking for the machine view, so it is honoured here — both by putting
  // the ledger inside the markers and by switching the instruction to paraphrase.
  const diagnostics = opts?.showDiagnostics === true
  // A failure keeps the verbatim contract: a paraphrase is free to soften, and a
  // failure report that reads like an answer is worse than no answer at all.
  const preamble = report.status === 'failed'
    ? (diagnostics ? FAILURE_DIAGNOSTICS_PREAMBLE : FAILURE_PREAMBLE)
    : (diagnostics ? SUCCESS_DIAGNOSTICS_PREAMBLE : REWRITE_PREAMBLE)
  const lang: DeliveryLang = opts?.lang === 'en' ? 'en' : 'zh'
  // One composer for both halves, so the rule between them and the folded case
  // cannot drift apart.
  const view = deliverReport(report, {
    lang,
    // One language, the reader's. The mirror existed because a one-word follow-up
    // carries no language signal, and it cost the reader a second block in a
    // language they may not read: every answer arrived twice. `lang` is the
    // language the request itself was detected in, so the block follows the
    // request instead of hedging.
    bilingual: false,
    diagnostics,
  })
  // What the markers carry: the human block, plus the ledger only when the reader
  // asked for diagnostics. An untouched page therefore relays human text only.
  const asked = view.text
  const visible = [header ?? '', asked].filter(part => part !== '').join('\n\n')
  // The ledger that stays with the message even when it is not shown: the durable
  // copy carry-over reads back out of the transcript.
  const durable = view.ledger ?? foldedLedger(report)
  // A header-only message would leave the markers empty, which reads as a broken
  // answer. That path falls back to the ledger itself, which is what the
  // pre-0.7.0 delivery did.
  const body = visible === '' && durable !== '' ? durable : visible
  // A ledger already inside the markers must not be repeated below them. The
  // folded copy is always present now (round 46): when the report itself has no
  // ledger to fold, `durable` is the unavailable marker, never an empty string.
  const folded = visible === '' || view.ledger !== undefined
    ? []
    : ['', LEDGER_GUARD, durable]
  return [preamble, '', REPORT_BEGIN, body, REPORT_END, ...folded].join('\n')
}

/**
 * Instruction preamble for the front desk's own answer (t52).
 *
 * A chat or fast tier has already produced the answer, and the ask tier has
 * already produced the question: the main model's only job is to hand it over.
 * The wording therefore forbids re-answering and forbids tools, and it does not
 * claim a workflow ran (none did).
 */
const FRONT_DESK_PREAMBLE = [
  'The front desk of the mandatory workflow gate handled this message without starting the team.',
  'Reply with the text between the markers exactly as given: keep every line, print no marker line,',
  'add nothing before or after it, do not answer the request yourself, and do not call any tool.',
].join(' ')

/**
 * Build the message text for a front-desk answer (chat/fast/ask tiers).
 * @param body - the answer or question the front desk produced.
 * @returns the enter/relay text, bounded by markers.
 */
export function frontDeskText(body: string): string {
  return [FRONT_DESK_PREAMBLE, '', REPORT_BEGIN, body, REPORT_END].join('\n')
}

/**
 * Instruction preamble for an accepted message the gate already answered first.
 *
 * It keeps the contract of {@link FRONT_DESK_PREAMBLE} — hand the text over, do not
 * re-answer, no tools — but the reason is different: the gate has already answered
 * this message itself, in one or two sentences, so the main model must not produce a
 * second answer on top of it. The team is verifying that first answer behind the
 * turn, and its report arrives later as its own message and may correct it; nothing
 * here claims the verification already happened.
 */
const ACCEPTED_PREAMBLE = [
  'The mandatory workflow gate answered this message itself first, in one or two sentences, and started the team workflow in the background.',
  'The team is verifying that first answer behind this turn. The report arrives as its own message and may correct what that first answer said.',
  'Reply with the text between the markers exactly as given: keep every line, print no marker line,',
  'add nothing before or after it, do not answer the request yourself, and do not call any tool.',
].join(' ')

/**
 * Build the message text for a turn the gate answered first (`full` mode, interactive run).
 *
 * `full` used to hold the open step for the whole run, which made every message
 * typed meanwhile invisible until the run ended. The turn now shows the first answer
 * and its receipt, so the debt is stated rather than hidden.
 *
 * @param body - the receipt: the first answer, then what happens next.
 * @returns the enter text, bounded by markers.
 */
export function acceptedEnterText(body: string): string {
  return [ACCEPTED_PREAMBLE, '', REPORT_BEGIN, body, REPORT_END].join('\n')
}

/**
 * Instruction preamble for an in-turn notice.
 *
 * The notice is entered into the *open* step, so the main model still produces
 * the user-visible message; without an explicit contract it would answer the
 * request itself, which is exactly what the gate exists to prevent.
 */
const NOTICE_PREAMBLE = [
  'The mandatory workflow gate refused this message, so no workflow result exists.',
  'Reply with the text between the markers exactly as given: print no marker line,',
  'add nothing before or after it, do not attempt the request yourself, and do not call any tool.',
].join(' ')

/**
 * Build the message text for in-turn delivery (strategy `in-turn`).
 *
 * Wording is deliberately identical to {@link relayText}: the contract with the
 * main model (answer the request from the validated material, add no claim the
 * material does not carry) does not depend on *when* the message arrives, only on
 * the fact that the model composes the final reply.
 *
 * @param report - a validated report, or an explicit failure report.
 * @param header - front-desk lines shown above the human block.
 * @param opts - what to show (see {@link RelayOptions}).
 * @returns the message text entered into the open step.
 */
export function reportEnterText(report: WorkflowReport, header?: string, opts?: RelayOptions): string {
  return relayText(report, header, opts)
}

/**
 * Build the message text for an in-turn notice (no run happened).
 *
 * @param reason - human-readable cause.
 * @returns the message text entered into the open step.
 */
export function noticeEnterText(reason: string): string {
  return [NOTICE_PREAMBLE, '', REPORT_BEGIN, noticeText(reason), REPORT_END].join('\n')
}

/**
 * Build a short notice delivered when the workflow cannot even be started
 * (busy instance, queue full, unreadable request). The notice keeps the failure
 * explicit instead of letting the model answer on its own.
 *
 * @param reason - human-readable cause.
 * @returns the notice text.
 */
export function noticeText(reason: string): string {
  return [
    'The mandatory workflow gate refused this message and no workflow result exists.',
    `Reason: ${reason}`,
    'Nothing was executed and no direct answer is available by design.',
  ].join('\n')
}
