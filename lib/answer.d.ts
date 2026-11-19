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
import type { WorkflowReport } from './types.js';
/** Message source kind claimed by this plugin on the relay turn. */
export declare const RELAY_SOURCE_KIND = "grok-workflow";
/** Opening marker placed before the report text. */
export declare const REPORT_BEGIN = "<<<GROK-WORKFLOW-REPORT>>>";
/** Closing marker placed after the report text. */
export declare const REPORT_END = "<<<END-GROK-WORKFLOW-REPORT>>>";
/**
 * Line that opens the internal ledger kept below the closing marker.
 *
 * It exists so the boundary is unambiguous to a model that reads the whole
 * message: everything from here on is for the agent, never for the reply.
 */
export declare const LEDGER_GUARD = "[internal: workflow ledger kept with this message; it is not part of the reply]";
/** Switches that decide what one relay message shows. */
export interface RelayOptions {
    /**
     * Render the machine ledger inside the markers, so the reader can see it.
     * Default off: the ledger is folded into the internal block below the markers.
     */
    showDiagnostics?: boolean;
    /** Compose the human block at all. Default on; `false` is the raw-report opt-out. */
    humanSummary?: boolean;
    /** Reader's language; picks which block comes first. Default `zh`. */
    lang?: string;
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
export declare function relayText(report: WorkflowReport, header?: string, opts?: RelayOptions): string;
/**
 * Build the message text for a front-desk answer (chat/fast/ask tiers).
 * @param body - the answer or question the front desk produced.
 * @returns the enter/relay text, bounded by markers.
 */
export declare function frontDeskText(body: string): string;
/**
 * Build the message text for an acceptance receipt (`full` mode, interactive run).
 *
 * `full` used to hold the open step for the whole run, which made every message
 * typed meanwhile invisible until the run ended. The receipt is what the turn
 * shows instead, so the debt is stated rather than hidden.
 *
 * @param body - the receipt line: what was accepted and what happens next.
 * @returns the enter text, bounded by markers.
 */
export declare function acceptedEnterText(body: string): string;
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
export declare function reportEnterText(report: WorkflowReport, header?: string, opts?: RelayOptions): string;
/**
 * Build the message text for an in-turn notice (no run happened).
 *
 * @param reason - human-readable cause.
 * @returns the message text entered into the open step.
 */
export declare function noticeEnterText(reason: string): string;
/**
 * Build a short notice delivered when the workflow cannot even be started
 * (busy instance, queue full, unreadable request). The notice keeps the failure
 * explicit instead of letting the model answer on its own.
 *
 * @param reason - human-readable cause.
 * @returns the notice text.
 */
export declare function noticeText(reason: string): string;
//# sourceMappingURL=answer.d.ts.map