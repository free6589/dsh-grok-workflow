/**
 * "Did the user actually say yes?"
 *
 * This is a narrow question with a narrow answer. The intake desk must not read
 * a nod into "再等等", a question, or an empty message: a wrong `true` here
 * starts work the user did not approve, and a wrong `false` only costs one more
 * message. So the rule is exact-match against a short list of explicit
 * approvals, after normalizing only what cannot change the meaning:
 *
 * - NFKC (so full-width letters read as letters), lower-cased;
 * - punctuation and the ideographic space become spaces, runs collapse, edges trim
 *   (`确认！`, `好的，开工`, `OK.` all reduce cleanly);
 * - a spacing-insensitive second pass, so `好的，开工` and `好的开工` agree;
 * - one leading 「我」 is dropped, because 「我确认」 is the same nod with a
 *   subject on it — while 「我不确认」 stays a refusal, since the negation is
 *   what is left after the 「我」 comes off.
 *
 * Nothing else is forgiven. A hedge, a question, a negation, a "why", or a
 * trailing 「吧」 makes it not an approval: 「没问题吧？」 is a question, and
 * 「为什么不能开工」 contains 「开工」 but is not a yes. The caller is expected to
 * combine this with the recorded quote (`startBlock`'s fourth check), not to
 * use it as the only gate.
 */
/**
 * Whether a message is an explicit yes.
 * @param text - the user's message, verbatim.
 * @returns True only for a clear approval; a refusal, a hedge, a question, or
 *   an empty message is false.
 */
export declare function isApproveAnswer(text: string): boolean;
//# sourceMappingURL=approval.d.ts.map