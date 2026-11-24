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
 * `src/block/`, and the block tools must be able to read the same rule. The one
 * import it has, `src/mode.ts`, is the same leaf rule (a plugin record read off
 * the session) and keeps that property: nothing here reaches into the gate or the
 * intake.
 */
import type { Session } from '@deepseek-ai/dsh-session';
/** The source kind the Host stamps on an answered question card. */
export declare const QUESTION_REPLY_SOURCE_KIND = "user-question-reply";
/** What both callers hold: `message.source` on a `user/message` event. */
type Source = {
    kind?: unknown;
} | undefined;
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
export declare function isUserAuthoredSource(source: Source): boolean;
/**
 * True only for an answered question card.
 *
 * The card answer carries the Host's whole JSON batch, question text included,
 * so a caller that matches text has to know it is looking at a card answer and
 * take only the user's own `selected` / `custom` labels from it (D-137).
 * @param source - the `source` of one `user/message` event.
 * @returns true only for `user-question-reply`.
 */
export declare function isQuestionReplySource(source: Source): boolean;
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
export declare function startsTurn(source: Source): boolean;
/**
 * Whether this build enforces the block intake's admission rule.
 *
 * It is on. All six block tools call {@link canAcceptBlock} at their entry (and the
 * two that commission work call it again where the work is ordered), so a session
 * that never turned grok mode on — or turned it off again — is refused with a named
 * `mode-off` refusal before any tool reads the ledger. The answer is a constant here
 * rather than six inline checks for the reason D-138 gives: a rule written once cannot
 * be half-applied when one call site is forgotten, and a deployment that needs the
 * pre-M3.2 behaviour turns it off in one place instead of in six.
 */
export declare const BLOCK_ADMISSION_ENFORCED = true;
/**
 * Whether a session may use the block tools at all.
 *
 * The rule is "the session opted into grok mode": a block is work the user approved,
 * so a session that never turned the mode on (or turned it off again) must not be able
 * to open one through a stale tool call. The record is read from the session log, not
 * from the deployment default, because the toggle is per-session durable state
 * (`src/mode.ts`) — a deployment-wide `grokDefault: 'on'` is not a session's own
 * decision to take on block work.
 * @param session - the calling session, when the tool call carries one.
 * @returns true only for a session whose own record admits it; a build that turns
 * {@link BLOCK_ADMISSION_ENFORCED} off answers true for every session.
 */
export declare function canAcceptBlock(session: Session | undefined): boolean;
/**
 * The admission rule itself, exported so it can be pinned apart from the phase switch.
 *
 * {@link canAcceptBlock} is the switch and this is the rule; keeping them separable is
 * what lets a test assert the rule's exact boundaries without depending on the switch,
 * and what lets the switch be turned off without also deleting the rule.
 *
 * `workflowMode` is narrowed to `string` before the comparison because the record's
 * union does not carry `'off'` yet: a build that ever writes one is dropped by
 * `isModeRecord` today, and this guard is what keeps the answer `false` either way
 * — an explicit "off" is never an admission.
 * @param session - the calling session, when the tool call carries one.
 * @returns true only for a record that is enabled and not explicitly off.
 */
export declare function canAcceptBlockWhenEnforced(session: Session | undefined): boolean;
export {};
//# sourceMappingURL=user-source.d.ts.map