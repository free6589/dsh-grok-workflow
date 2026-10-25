/**
 * Answer text produced by the gate.
 *
 * The host cannot verify what the main model says, so the gate sends a report it
 * has already validated and asks for a verbatim reproduction between markers
 * (measured to be reproduced exactly in DSH 0.2.1-rc.2, single sample). Failure
 * reports take the same path: a failed workflow must never look like an answer.
 */
import type { WorkflowReport } from './types.js';
/** Message source kind claimed by this plugin on the relay turn. */
export declare const RELAY_SOURCE_KIND = "grok-workflow";
/** Opening marker placed before the report text. */
export declare const REPORT_BEGIN = "<<<GROK-WORKFLOW-REPORT>>>";
/** Closing marker placed after the report text. */
export declare const REPORT_END = "<<<END-GROK-WORKFLOW-REPORT>>>";
/**
 * Build the user-visible relay text for one report.
 *
 * @param report - a validated report, or an explicit failure report.
 * @returns the relay message text, already bounded by {@link renderReport}.
 */
export declare function relayText(report: WorkflowReport): string;
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