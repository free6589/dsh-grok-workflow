/**
 * Answer text produced by the gate.
 *
 * The host cannot verify what the main model says, so the gate sends a result it
 * has already validated and asks for a verbatim reproduction between markers
 * (measured to be reproduced exactly in DSH 0.2.1-rc.2, single sample). Failure
 * reports take the same path: a failed workflow must never look like an answer.
 *
 * Two blocks travel in one message, and only one of them is user-visible:
 *
 * - **between the markers** the delivery layer's human block
 *   (`src/delivery/index.ts`: what was done, what came of it, what is next, in
 *   both languages). `showDiagnostics` adds the machine ledger there too, because
 *   a reader who asked for it wants it.
 * - **below the closing marker** the machine ledger, under an explicit internal
 *   guard, when it is hidden. It is not part of the reply: the preamble forbids
 *   quoting it. It stays in the message because that is the durable copy
 *   cross-round carry-over reads back out of the transcript (`src/carryover.ts`
 *   parses exactly these field labels), and because the Progress node detail is
 *   rendered from the same record.
 *
 * The split is what stops a machine ledger from *becoming* the answer. Before it,
 * the whole rendered report sat inside the markers, so the delivered message was
 * `stat -c …`, digests, absolute paths and the relay markers themselves.
 */
import { deliverReport, machineLedger } from './delivery/index.js';
/** Message source kind claimed by this plugin on the relay turn. */
export const RELAY_SOURCE_KIND = 'grok-workflow';
/** Opening marker placed before the report text. */
export const REPORT_BEGIN = '<<<GROK-WORKFLOW-REPORT>>>';
/** Closing marker placed after the report text. */
export const REPORT_END = '<<<END-GROK-WORKFLOW-REPORT>>>';
/**
 * Line that opens the internal ledger kept below the closing marker.
 *
 * It exists so the boundary is unambiguous to a model that reads the whole
 * message: everything from here on is for the agent, never for the reply.
 */
export const LEDGER_GUARD = '[internal: workflow ledger kept with this message; it is not part of the reply]';
/** Instruction preamble for a successful or partial report. */
const SUCCESS_PREAMBLE = [
    'The mandatory workflow gate finished and produced the result between the markers below.',
    'Reply with those lines exactly as given: keep every line and their order, print no marker line,',
    'add nothing before, between or after them, and do not call any tool.',
    'Everything after the closing marker is internal context for you alone: never quote, mention or summarise it.',
].join(' ');
/** Instruction preamble for a failure report. */
const FAILURE_PREAMBLE = [
    'The mandatory workflow gate could not complete the workflow, so no workflow result exists.',
    'Reply with the lines between the markers exactly as given and never describe this as success:',
    'state the failure faithfully, print no marker line, add nothing before or after those lines,',
    'and do not call any tool.',
    'Everything after the closing marker is internal context for you alone: never quote, mention or summarise it.',
].join(' ');
/**
 * The durable ledger kept below the closing marker, or an empty string.
 *
 * A validated report always renders (the host validator checks every field this
 * reads). A report that arrives with a hole must still not cost the reader the
 * answer — the human block is composed and bounded separately — so a ledger that
 * cannot be rendered is dropped instead of thrown out of the delivery.
 *
 * @param report - the report being delivered.
 * @returns the ledger text, or `''` when it cannot be rendered.
 */
function foldedLedger(report) {
    try {
        return machineLedger(report);
    }
    catch {
        return '';
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
export function relayText(report, header, opts) {
    const preamble = report.status === 'failed' ? FAILURE_PREAMBLE : SUCCESS_PREAMBLE;
    const lang = opts?.lang === 'en' ? 'en' : 'zh';
    // One composer for both halves, so the rule between them and the folded case
    // cannot drift apart.
    const view = deliverReport(report, {
        lang,
        bilingual: true,
    });
    // What the markers carry: the human block alone (T4: output is fixed —
    // human block always on, machine ledger never inside the markers). Ignored
    // legacy opts still compile but change nothing.
    void opts;
    const asked = view.text;
    const visible = [header ?? '', asked].filter(part => part !== '').join('\n\n');
    // The ledger that stays with the message even when it is not shown: the durable
    // copy carry-over reads back out of the transcript.
    const durable = view.ledger ?? foldedLedger(report);
    // A header-only message would leave the markers empty, which reads as a broken
    // answer. That path falls back to the ledger itself, which is what the
    // pre-0.7.0 delivery did.
    const body = visible === '' && durable !== '' ? durable : visible;
    const folded = durable === '' || visible === '' || view.ledger !== undefined
        ? []
        : ['', LEDGER_GUARD, durable];
    return [preamble, '', REPORT_BEGIN, body, REPORT_END, ...folded].join('\n');
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
    'Reply with the text between the markers exactly as given: print no marker line,',
    'add nothing before or after it, do not attempt the request yourself, and do not call any tool.',
].join(' ');
/**
 * Build the message text for in-turn delivery (strategy `in-turn`).
 *
 * Wording is deliberately identical to {@link relayText}: the contract with the
 * main model (reproduce the validated result, add no claims) does not depend on
 * *when* the message arrives, only on the fact that the model composes the final
 * reply. Keeping one wording keeps the t24 measurement applicable.
 *
 * @param report - a validated report, or an explicit failure report.
 * @param header - front-desk lines shown above the human block.
 * @param opts - what to show (see {@link RelayOptions}).
 * @returns the message text entered into the open step.
 */
export function reportEnterText(report, header, opts) {
    return relayText(report, header, opts);
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