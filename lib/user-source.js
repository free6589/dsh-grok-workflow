/**
 * Which message sources are the user's own, and which of them start a turn.
 *
 * Two surfaces ask that question and must answer it identically: the gate
 * (`src/gate.ts`) decides whether a batch runs a workflow, and the block intake
 * (`src/block/tools.ts`) reads the approval quote back out of the session log.
 * The Host logs an answered question card as `source.kind ===
 * 'user-question-reply'`, so both places used to test `kind === 'user'` and
 * both silently lost the card answer — the gate swallowed it as a foreign
 * source, and a block start could never find the quote and refused with
 * `approval-required`. One definition, imported by both, is what keeps them
 * from drifting apart again (D-137).
 *
 * This module has no dependencies on purpose: the gate must not import from
 * `src/block/`, and the block tools must be able to read the same rule.
 */
/** The source kind the Host stamps on an answered question card. */
export const QUESTION_REPLY_SOURCE_KIND = 'user-question-reply';
/**
 * True for text the user authored: a typed turn, or an answered question card.
 *
 * Both are the user's own words, so anything that reports "what the user said"
 * — the block ledger's approval quote is the one caller — has to look at both.
 * A caller that needs to tell them apart asks {@link startsTurn} or
 * {@link isQuestionReplySource} instead.
 * @param source - the `source` of one `user/message` event.
 * @returns true for `user` and for `user-question-reply`.
 */
export function isUserAuthoredSource(source) {
    return source?.kind === 'user' || source?.kind === QUESTION_REPLY_SOURCE_KIND;
}
/**
 * True only for an answered question card.
 *
 * The card answer carries the Host's whole JSON batch, question text included,
 * so a caller that matches text has to know it is looking at a card answer and
 * take only the user's own `selected` / `custom` labels from it (D-137).
 * @param source - the `source` of one `user/message` event.
 * @returns true only for `user-question-reply`.
 */
export function isQuestionReplySource(source) {
    return source?.kind === QUESTION_REPLY_SOURCE_KIND;
}
/**
 * True only for a typed user turn.
 *
 * The product decision behind D-137: **a card answer is a nod, it never starts a
 * turn by itself.** So the gate names a card-only batch as `question-reply`
 * instead of admitting it, and the block intake counts a card answer only when
 * the question it answers was asked after the preview. If that ever changes, it
 * is a product call with its own record, not a code tidy-up.
 * @param source - the `source` of one `user/message` event.
 * @returns true only for `user`.
 */
export function startsTurn(source) {
    return source?.kind === 'user';
}
//# sourceMappingURL=user-source.js.map