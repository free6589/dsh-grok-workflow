/**
 * Answer text produced by the gate.
 *
 * The host cannot verify what the main model says, so the gate sends a message
 * it has already validated and asks for a verbatim reproduction between markers
 * (measured to be reproduced exactly in DSH 0.2.1-rc.2, single sample). What
 * changed with the delivery layer is *what* sits between the markers: by
 * default it is no longer the machine ledger but the user-delivery text
 * (src/delivery.ts) — result-first, in the user's language, scenario-worded,
 * built only from verified report facts. The machine rendering still rides in
 * the same message, after the closing marker, as an internal record: the
 * cross-round carry-over compiles earlier rounds from exactly that durable text
 * (src/carryover.ts parses it), so hiding it would silently drop the context
 * every follow-up round builds on.
 *
 * Failure reports take the same path with failure wording: a failed workflow
 * must never look like an answer. `delivery: false` (the `humanSummary: false`
 * setting) restores the old contract — the machine ledger between the markers.
 */

import type { WorkflowReport } from './types.js'
import type { DeliveryLang } from './delivery.js'
import { deliveryForReport } from './delivery.js'
import { detectLanguage } from './triage.js'
import { renderReport } from './report.js'

/** Message source kind claimed by this plugin on the relay turn. */
export const RELAY_SOURCE_KIND = 'grok-workflow'

/** Opening marker placed before the answer text. */
export const REPORT_BEGIN = '<<<GROK-WORKFLOW-REPORT>>>'

/** Closing marker placed after the answer text. */
export const REPORT_END = '<<<END-GROK-WORKFLOW-REPORT>>>'

/** Instruction preamble for a successful or partial report (machine mode). */
const SUCCESS_PREAMBLE = [
  'The mandatory workflow gate finished and the workflow produced the report below.',
  'You may first state the outcome in at most 3 plain sentences in the user\'s language,',
  'then reply with the text between the markers exactly as given: keep every line, order and character,',
  'add nothing else before, between, or after those parts, and do not call any tool.',
].join(' ')

/** Instruction preamble for a failure report (machine mode). */
const FAILURE_PREAMBLE = [
  'The mandatory workflow gate could not complete the workflow, so no workflow result exists.',
  'Reply with the text between the markers exactly as given and do not describe it as success:',
  'state the failure faithfully, add nothing before or after it, and do not call any tool.',
].join(' ')

/**
 * Instruction preamble for a delivered answer (delivery mode, the default).
 *
 * The text between the markers *is* the final message for the user, already
 * written in their language by the delivery layer; the main model's only job is
 * to hand it over unchanged. The machine record after the closing marker is
 * background for later turns (carry-over compiles it), never part of the reply.
 */
const DELIVERY_PREAMBLE = [
  'The mandatory workflow finished; what was achieved, what was delivered and what is still missing is stated between the markers.',
  'Reply with that text exactly as given: keep every line, order and character,',
  'add nothing before, between or after it, and do not call any tool.',
  'The text after the closing marker is an internal record for later turns; never reproduce or describe it.',
].join(' ')

/** Instruction preamble for a delivered failure (delivery mode). */
const DELIVERY_FAILURE_PREAMBLE = [
  'The mandatory workflow gate could not complete the workflow, so no workflow result exists.',
  'Reply with the text between the markers exactly as given: state the failure faithfully,',
  'add nothing before or after it, and do not call any tool.',
  'The text after the closing marker is an internal record for later turns; never reproduce or describe it.',
].join(' ')

/** Options of the relay text. */
export interface RelayTextOptions {
  /** Passed through to the machine rendering of the internal record. */
  showDiagnostics?: boolean
  /**
   * `false` restores the machine ledger between the markers (the
   * `humanSummary: false` setting). Default: the user-delivery text.
   */
  delivery?: boolean
  /** The user's language; defaults to the report objective's language. */
  lang?: DeliveryLang
}

/** One line separating the reply from the internal machine record. */
const RECORD_NOTE = '(Internal record for later turns — not part of the reply.)'

/**
 * Build the user-visible relay text for one report.
 *
 * @param report - a validated report, or an explicit failure report.
 * @param header - front-desk tier line and greeting, rendered first (t52).
 * @param opts - delivery toggles; default is the user-delivery text.
 * @returns the relay message text: preamble, markers around the answer, then
 *   the machine record the next round's carry-over reads.
 */
export function relayText(report: WorkflowReport, header?: string, opts?: RelayTextOptions): string {
  const machine = renderReport(report, opts)
  // The header rides *inside* the markers (t52): the front desk's tier line and
  // work-start greeting are user-visible content, and a line before the opening
  // marker would be counted as commentary the model is told not to add.
  const body = header === undefined || header === ''
    ? machine
    : `${header}\n\n${machine}`
  if (opts?.delivery === false) {
    const preamble = report.status === 'failed' ? FAILURE_PREAMBLE : SUCCESS_PREAMBLE
    return [preamble, '', REPORT_BEGIN, body, REPORT_END].join('\n')
  }
  const lang = opts?.lang ?? detectLanguage(report.objective)
  const delivery = deliveryForReport(report, lang)
  const delivered = header === undefined || header === '' ? delivery : `${header}\n\n${delivery}`
  const preamble = report.status === 'failed' ? DELIVERY_FAILURE_PREAMBLE : DELIVERY_PREAMBLE
  return [preamble, '', REPORT_BEGIN, delivered, REPORT_END, '', RECORD_NOTE, '', machine].join('\n')
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
  'Reply with the text between the markers exactly as given: keep every line, add nothing before or',
  'after it, do not answer the request yourself, and do not call any tool.',
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
 * Instruction preamble for an in-turn notice.
 *
 * The notice is entered into the *open* step, so the main model still produces
 * the user-visible message; without an explicit contract it would answer the
 * request itself, which is exactly what the gate exists to prevent.
 */
const NOTICE_PREAMBLE = [
  'The mandatory workflow gate refused this message, so no workflow result exists.',
  'Reply with the text between the markers exactly as given: add nothing before or after it,',
  'do not attempt the request yourself, and do not call any tool.',
].join(' ')

/**
 * Build the message text for in-turn delivery (strategy `in-turn`).
 *
 * Wording is deliberately identical to {@link relayText}: the contract with the
 * main model (reproduce the validated answer, add no claims) does not depend on
 * *when* the message arrives, only on the fact that the model composes the final
 * reply. Keeping one wording keeps the t24 measurement applicable.
 *
 * @param report - a validated report, or an explicit failure report.
 * @param opts - delivery toggles; default is the user-delivery text.
 * @returns the message text entered into the open step.
 */
export function reportEnterText(report: WorkflowReport, opts?: RelayTextOptions): string {
  return relayText(report, undefined, opts)
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
