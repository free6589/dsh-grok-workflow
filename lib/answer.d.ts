/**
 * Report text as it is packaged and relayed.
 *
 * The host cannot verify what the main model says, so {@link relayText} (and its
 * in-turn alias {@link reportEnterText}) sends a result the run has already
 * validated and tells the model what to do with it between markers. That
 * instruction is not the same for every report: a failure must be reproduced
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
    /** Reader's language: the block is written in it, and only in it. Default `zh`. */
    lang?: string;
}
/**
 * Build the user-visible relay text for one report.
 *
 * @param report - a validated report, or an explicit failure report.
 * @param header - optional lines shown above the human block; they are
 *   user-visible content and ride inside the markers.
 * @param opts - what to show (see {@link RelayOptions}).
 * @returns the relay message text.
 */
export declare function relayText(report: WorkflowReport, header?: string, opts?: RelayOptions): string;
/**
 * Build the message text for in-turn delivery (strategy `in-turn`).
 *
 * Wording is deliberately identical to {@link relayText}: the contract with the
 * main model (answer the request from the validated material, add no claim the
 * material does not carry) does not depend on *when* the message arrives, only on
 * the fact that the model composes the final reply.
 *
 * @param report - a validated report, or an explicit failure report.
 * @param header - optional lines shown above the human block.
 * @param opts - what to show (see {@link RelayOptions}).
 * @returns the message text entered into the open step.
 */
export declare function reportEnterText(report: WorkflowReport, header?: string, opts?: RelayOptions): string;
//# sourceMappingURL=answer.d.ts.map