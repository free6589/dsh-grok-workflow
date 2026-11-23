/**
 * Captain foreground (队长前台化): the one confirmation between the front desk and
 * the run.
 *
 * The front desk decides *how much* a message costs (`src/triage.ts`: chat, quick,
 * team, ask). This module owns the next decision: once the front desk routed a
 * message to the team, the captain states the split it intends to use and asks for
 * one confirmation before any work is dispatched.
 *
 * Why a round instead of "just run it":
 * - the split is the expensive decision (how many children, waves and planner calls
 *   a round spends), and a user who disagrees with it currently pays for the whole
 *   run before being able to say so;
 * - the answer to the confirmation is a *plan change*, not a new task, so it has to
 *   reach the planner as an amendment of the original request instead of being
 *   routed as a fresh message that throws that request away.
 *
 * The asymmetry mirrors `src/channel.ts`: an unmistakable approval is the only
 * message that dispatches; an explicit edit amends the plan; anything else voids the
 * confirmation and is routed on its own. Nothing is guessed — a misread approval
 * would spend a whole run, and a misread new task would silently fold two unrelated
 * requests into one objective.
 *
 * The module is pure: no I/O, no clock, no model call. The caller (the gate) owns
 * the pending entry, the preview call and the dispatch.
 */
import type { TriageLang } from './triage.js';
/** Bounds on one confirmation round. */
export declare const CAPTAIN_LIMITS: {
    /** Characters kept from one preview answer. */
    readonly previewChars: 1200;
    /** Characters kept from one amended request (the original plus the user's words). */
    readonly amendChars: 4000;
    /** Longest message still readable as a bare approval ("确认" yes, "确认，再加 X" no). */
    readonly approveMaxChars: 24;
};
/** What one message means for a pending split confirmation. */
export type CaptainAnswerKind = 'approve' | 'amend' | 'other';
/**
 * Read one message against a pending split confirmation.
 *
 * Order matters: an edit marker wins over an approval prefix, because
 * "确认，改成两个任务" agrees with the direction and changes the split — dispatch
 * it as-is and the edit is lost.
 * @param raw - the user's message, verbatim.
 * @returns `approve` to dispatch, `amend` to dispatch with the change, `other` to
 *   void the confirmation and route the message on its own.
 */
export declare function captainAnswer(raw: string): CaptainAnswerKind;
/**
 * The prompt that asks the captain for its split, before any work is dispatched.
 *
 * One short answer, no tools: this is the sentence the user confirms or changes, so
 * it has to be readable on its own and must not spend a plan the run then ignores.
 * @param request - the user's request as the run would receive it.
 * @returns the preview prompt.
 */
export declare function captainPreviewPrompt(request: string): string;
/**
 * The question that carries the preview.
 * @param lang - language of the user's message.
 * @param preview - the captain's split preview, already bounded.
 * @returns the user-visible confirmation question.
 */
export declare function captainAskText(lang: TriageLang, preview: string): string;
/** The preview used when the cheap preview call could not answer. */
export declare function captainPreviewFallback(lang: TriageLang): string;
/** One line stating that the confirmed split is what was dispatched. */
export declare function captainApproveNote(lang: TriageLang): string;
/** One line stating that an unanswered confirmation is void. */
export declare function captainVoidNote(lang: TriageLang, expired: boolean): string;
/**
 * Fold an explicit edit into the request the confirmation asked about.
 *
 * The original request stays whole and the amendment is stated as a change to it:
 * handing the planner only the amendment would lose the work it refers to.
 * @param original - the request the confirmation was asked about.
 * @param amendment - the user's own words.
 * @returns one request, bounded to the amendment budget.
 */
export declare function amendRequest(original: string, amendment: string): string;
/**
 * Fold the split the user approved into the request the run receives.
 *
 * The preview is the only thing the user actually agreed to. Dispatching the bare
 * original request let the planner re-split freely afterwards, so the confirmation
 * was a promise the run did not have to keep: the user approved one split and paid
 * for another. The original request stays whole and the approved split follows it as
 * a bound — it names the tasks, it does not rewrite the request — so a message that
 * *changes* the split still goes through {@link amendRequest} instead.
 * @param original - the request the confirmation was asked about.
 * @param preview - the split the user approved, verbatim (`''` when the preview call
 *   could not answer and the user confirmed the default split).
 * @returns one request, bounded to the amendment budget; the original untouched when
 *   there is no split to keep.
 */
export declare function approvedRequest(original: string, preview: string): string;
//# sourceMappingURL=captain.d.ts.map