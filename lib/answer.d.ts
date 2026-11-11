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
import type { WorkflowReport } from './types.js';
import type { DeliveryLang } from './delivery.js';
/** Message source kind claimed by this plugin on the relay turn. */
export declare const RELAY_SOURCE_KIND = "grok-workflow";
/** Opening marker placed before the answer text. */
export declare const REPORT_BEGIN = "<<<GROK-WORKFLOW-REPORT>>>";
/** Closing marker placed after the answer text. */
export declare const REPORT_END = "<<<END-GROK-WORKFLOW-REPORT>>>";
/** Options of the relay text. */
export interface RelayTextOptions {
    /** Passed through to the machine rendering of the internal record. */
    showDiagnostics?: boolean;
    /**
     * `false` restores the machine ledger between the markers (the
     * `humanSummary: false` setting). Default: the user-delivery text.
     */
    delivery?: boolean;
    /** The user's language; defaults to the report objective's language. */
    lang?: DeliveryLang;
}
/**
 * Build the user-visible relay text for one report.
 *
 * @param report - a validated report, or an explicit failure report.
 * @param header - front-desk tier line and greeting, rendered first (t52).
 * @param opts - delivery toggles; default is the user-delivery text.
 * @returns the relay message text: preamble, markers around the answer, then
 *   the machine record the next round's carry-over reads.
 */
export declare function relayText(report: WorkflowReport, header?: string, opts?: RelayTextOptions): string;
/**
 * Build the message text for a front-desk answer (chat/fast/ask tiers).
 * @param body - the answer or question the front desk produced.
 * @returns the enter/relay text, bounded by markers.
 */
export declare function frontDeskText(body: string): string;
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
export declare function reportEnterText(report: WorkflowReport, opts?: RelayTextOptions): string;
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