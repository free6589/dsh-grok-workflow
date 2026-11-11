/**
 * User-delivery layer: the default user-facing rendering of a validated report.
 *
 * The `WorkflowReport` is a machine contract — task ids, status enums, route
 * trails and counters — and `renderReport` (src/report.ts) is its ledger view.
 * Neither is what a user should read. This module renders the *delivery
 * message*: result-first, in the user's language, with wording that follows the
 * scenario (code fix, research, pure answer, partial, failed), built strictly
 * from verified report facts.
 *
 * The rules this module is written against:
 *
 * 1. **Result first.** The first line states what was achieved, not that a
 *    workflow ran. A reader who stops after one line has the outcome.
 * 2. **Verified facts only.** Titles, files, commands, evidence, reasons,
 *    uncertainties and the final answer are quoted from the report; nothing is
 *    invented, estimated or upgraded. A `partial` never reads as `completed`,
 *    and a `failed` never wears success wording.
 * 3. **No internals.** No task ids, no status enums, no route or attempt
 *    counters, no deadlines, no limits — none of the ledger vocabulary leaks
 *    into the delivery text.
 * 4. **Doubts survive.** Uncertainties are rendered in every scenario that has
 *    them; dropping them would turn a caveat into a claim.
 * 5. **Bounded.** Every field is one-lined and capped, and the whole text is
 *    capped at {@link DELIVERY_LIMITS.totalChars} with a surrogate-safe cut.
 *
 * Language follows the user's message (D-022): the caller passes the language
 * it already detected; when absent, the report objective is the fallback
 * signal — a CJK objective means Chinese, anything else English.
 */
import type { WorkflowReport } from './types.js';
/** Language of the delivery text. */
export type DeliveryLang = 'zh' | 'en';
/** Bounds of one delivery text. Every field is clamped here, in one place. */
export declare const DELIVERY_LIMITS: {
    /** Task titles listed at most. */
    readonly tasks: 6;
    /** Characters kept of one task title. */
    readonly titleChars: 140;
    /** Changed files listed at most. */
    readonly files: 4;
    /** Characters kept of one file path. */
    readonly fileChars: 120;
    /** Verification commands listed at most. */
    readonly commands: 3;
    /** Characters kept of one command. */
    readonly commandChars: 160;
    /** Evidence items listed at most. */
    readonly evidence: 4;
    /** Characters kept of one rendered evidence item. */
    readonly evidenceChars: 220;
    /** Failed-task reasons listed at most. */
    readonly reasons: 4;
    /** Characters kept of one reason. */
    readonly reasonChars: 260;
    /** Uncertainties listed at most. */
    readonly uncertainties: 6;
    /** Characters kept of one uncertainty. */
    readonly uncertaintyChars: 300;
    /** Characters kept of the final-answer excerpt. */
    readonly summaryChars: 800;
    /** Hard cap of the whole delivery text. */
    readonly totalChars: 2800;
};
/** The delivery scenario of one report; decides the wording, never the facts. */
export type DeliveryScenario = 'code' | 'research' | 'answer' | 'partial' | 'failed';
/**
 * Scenario of one report, decided by its status first and its verified
 * artifacts second. The status is never re-interpreted: `failed` stays failed
 * even when attempts left artifacts behind, and `partial` stays partial even
 * when every surviving task verified.
 *
 * - `code` — verified tasks changed files or ran passing commands.
 * - `research` — verified tasks carry deliverables or evidence but no file
 *   change and no passing command.
 * - `answer` — a pure question answered in text: nothing but a summary.
 */
export declare function deliveryScenario(report: WorkflowReport): DeliveryScenario;
/**
 * The verified results one delivery keeps, as ready-to-render lines.
 *
 * Shared by {@link deliveryForReport} and the gate's cancelled terminal: after
 * a cancellation the same facts must survive, prefixed by the cancelled state
 * instead of a success lead.
 */
export declare function preservedFacts(report: WorkflowReport, lang: DeliveryLang): string[];
/**
 * Render the user-facing delivery text of one validated report.
 *
 * @param report - a validated report, or an explicit failure report.
 * @param lang - the user's language; defaults to the report objective's language.
 * @returns the delivery text: result-first, scenario-worded, bounded.
 */
export declare function deliveryForReport(report: WorkflowReport, lang?: DeliveryLang): string;
//# sourceMappingURL=delivery.d.ts.map