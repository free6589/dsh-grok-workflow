/**
 * Report text as it is packaged and relayed.
 *
 * The host cannot verify what the main model says, so the relay text sends a
 * result the run has already validated and tells the model what to do with it
 * between markers. That
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
 * - **the instruction is a rewrite**: answer the user's
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
//# sourceMappingURL=answer.js.map