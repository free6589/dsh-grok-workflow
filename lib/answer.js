/**
 * Answer text produced by the gate.
 *
 * The host cannot verify what the main model says, so the gate sends a report it
 * has already validated and asks for a verbatim reproduction between markers
 * (measured to be reproduced exactly in DSH 0.2.1-rc.2, single sample). Failure
 * reports take the same path: a failed workflow must never look like an answer.
 */
import { renderReport } from './report.js';
/** Message source kind claimed by this plugin on the relay turn. */
export const RELAY_SOURCE_KIND = 'grok-workflow';
/** Opening marker placed before the report text. */
export const REPORT_BEGIN = '<<<GROK-WORKFLOW-REPORT>>>';
/** Closing marker placed after the report text. */
export const REPORT_END = '<<<END-GROK-WORKFLOW-REPORT>>>';
/** Instruction preamble for a successful or partial report. */
const SUCCESS_PREAMBLE = [
    'The mandatory workflow gate finished and the workflow produced the report below.',
    'Reply with the text between the markers exactly as given: keep every line, order and character,',
    'add no commentary before or after it, and do not summarise it. Do not call any tool.',
].join(' ');
/** Instruction preamble for a failure report. */
const FAILURE_PREAMBLE = [
    'The mandatory workflow gate could not complete the workflow, so no workflow result exists.',
    'Reply with the text between the markers exactly as given and do not describe it as success:',
    'state the failure faithfully, add nothing before or after it, and do not call any tool.',
].join(' ');
/**
 * Build the user-visible relay text for one report.
 *
 * @param report - a validated report, or an explicit failure report.
 * @returns the relay message text, already bounded by {@link renderReport}.
 */
export function relayText(report, header) {
    const preamble = report.status === 'failed' ? FAILURE_PREAMBLE : SUCCESS_PREAMBLE;
    // The header rides *inside* the markers (t52): the front desk's tier line and
    // work-start greeting are user-visible content, and a line before the opening
    // marker would be counted as commentary the model is told not to add.
    const body = header === undefined || header === '' ? renderReport(report) : `${header}\n\n${renderReport(report)}`;
    return [preamble, '', REPORT_BEGIN, body, REPORT_END].join('\n');
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
].join(' ');
/**
 * Build the message text for a front-desk answer (chat/fast/ask tiers).
 * @param body - the answer or question the front desk produced.
 * @returns the enter/relay text, bounded by markers.
 */
export function frontDeskText(body) {
    return [FRONT_DESK_PREAMBLE, '', REPORT_BEGIN, body, REPORT_END].join('\n');
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
].join(' ');
/**
 * Build the message text for in-turn delivery (strategy `in-turn`).
 *
 * Wording is deliberately identical to {@link relayText}: the contract with the
 * main model (reproduce the validated report, add no claims) does not depend on
 * *when* the message arrives, only on the fact that the model composes the final
 * reply. Keeping one wording keeps the t24 measurement applicable.
 *
 * @param report - a validated report, or an explicit failure report.
 * @returns the message text entered into the open step.
 */
export function reportEnterText(report) {
    return relayText(report);
}
/**
 * Build the message text for an in-turn notice (no run happened).
 *
 * @param reason - human-readable cause.
 * @returns the message text entered into the open step.
 */
export function noticeEnterText(reason) {
    return [NOTICE_PREAMBLE, '', REPORT_BEGIN, noticeText(reason), REPORT_END].join('\n');
}
/**
 * Build a short notice delivered when the workflow cannot even be started
 * (busy instance, queue full, unreadable request). The notice keeps the failure
 * explicit instead of letting the model answer on its own.
 *
 * @param reason - human-readable cause.
 * @returns the notice text.
 */
export function noticeText(reason) {
    return [
        'The mandatory workflow gate refused this message and no workflow result exists.',
        `Reason: ${reason}`,
        'Nothing was executed and no direct answer is available by design.',
    ].join('\n');
}
//# sourceMappingURL=answer.js.map