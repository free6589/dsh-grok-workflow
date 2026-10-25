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
export function relayText(report) {
    const preamble = report.status === 'failed' ? FAILURE_PREAMBLE : SUCCESS_PREAMBLE;
    return [preamble, '', REPORT_BEGIN, renderReport(report), REPORT_END].join('\n');
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