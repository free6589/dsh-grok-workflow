/**
 * Forced team routing: a keyword in the user's turn buys a hard instruction, and
 * nothing else.
 *
 * One listener on `agent/pre-step` — the only admission point the Host gives this
 * plugin, and the only `agent/*` waterfall a plugin can still register. There is no
 * turn-end hook and no post-step hook in DSH 0.2.1-rc.2: `turn/end` is a session
 * *event* the loop writes, not a dispatch a listener can answer (the only
 * pre-step-shaped dispatch in the installed tree is the one declared at
 * `@deepseek-ai/dsh-agent/lib/types/runtime-types.d.ts:333`).
 *
 * **Injection is the whole feature.** When a user-authored message of the claimed
 * batch asks for a team, the message handed to the model carries the same text plus one
 * fixed instruction block. `next()` already produced the batch — its order, its ids, its
 * runtime-context tail — so this listener maps over that list and changes exactly one
 * thing per matched message: one more text block at the end. Nothing is rewritten,
 * nothing is added to the session, no second message appears, and the user's own words
 * stay a byte-identical prefix. That matters because `enter.messages` is the only writer
 * for a claimed batch: a separate `session.append()` on top of it would be a second copy
 * of the same words in the transcript (the P0-1 defect the old gate was fixed for).
 *
 * **The refusal half is gone, and the deletion is the point (D-169).** Up to 0.13.48 a
 * second half hung on this same waterfall: a turn that matched a keyword and then asked
 * for a later step without having started a team was answered with `reject` — the only
 * decision that reliably produces zero model calls — plus one user-role row carrying the
 * intake's bilingual refusal text. Real-machine rounds showed what that half actually
 * did: `turn/end` with reason `blocked`, a turn that ended with **no answer at all**, and
 * a refusal row the page never renders. A feature whose failure mode is "the user gets
 * nothing" is worse than the single-model answer it was trying to stop, so the brake was
 * deleted rather than retuned. What is left cannot refuse anything: **a model that
 * ignores the instruction still answers the turn normally.**
 *
 * Why the instruction is a command and not a suggestion. A suggestion is a piece of
 * advice competing with everything else in context, and the case this feature exists for
 * is precisely the one where the model has already decided to answer on its own: advice
 * loses that competition by construction, and the user who said "开团" gets a
 * single-model answer anyway. The instruction therefore states a constraint on the
 * *shape* of the turn ("a single answer is not acceptable"), not a preference. What it
 * cannot do is enforce that shape: nothing in this plugin observes the turn after the step
 * it rewrites, so the instruction is a lever, never a gate.
 *
 * Three rules keep this listener from becoming a second authority:
 *
 * - **Off is inert.** No `agent/pre-step` listener is registered when the load-time
 *   switch is off, so the chain a profile with `forceTeamRouting: false` carries is
 *   exactly the pre-feature chain. A switch turned off later (`/grok off`, or a live read
 *   of the same key) leaves the decision untouched — the identical object the loop
 *   proposed, not a copy that happens to match.
 * - **A child's turn is not a user's turn.** A delegated session's "user" message is the
 *   prompt its parent wrote, so a keyword there is the parent's task text and not a person
 *   asking for a team; nothing is injected into it (`isDelegatedSession`).
 * - **Only the loop's own batch, and at most one instruction per message.** Every rewrite
 *   is a shallow copy of a message `next()` already produced: the batch keeps its length
 *   and its order, an unmatched message is handed over as the very same object, and a
 *   matched message gains one text block whatever the step it arrived on.
 */
import type { Session } from '@deepseek-ai/dsh-session';
import type { UserMessage } from '@deepseek-ai/dsh-llm';
import type { ResolvedConfig } from './types.js';
/** Chinese keywords. Matched as substrings: Chinese does not separate words. */
export declare const FORCE_TEAM_KEYWORDS_ZH: readonly ["开团", "组队", "分工"];
/**
 * English keywords. Matched as whole words, case-insensitively.
 *
 * No stemming on purpose: `delegate` matches, and `delegated`, `delegates`,
 * `delegation`, `delegating` do not. The asymmetry is the point. A miss costs one
 * turn that the user can re-ask with the word itself; a false positive forces a team
 * run — several child calls and real quota — on a message that was describing the
 * past ("the delegated work is done"). The word boundary is drawn on ASCII letters,
 * digits and `_`, so `undelegate` and `delegate2` are not hits either.
 */
export declare const FORCE_TEAM_KEYWORDS_EN: readonly ["delegate", "form a team", "split the work"];
/** Language of the instruction: the language of the turn that asked for it. */
export type ForceTeamLang = 'zh' | 'en';
/**
 * The fixed hard instruction, Chinese.
 *
 * One block, three numbered steps, a closing sentence — and the closing sentence is
 * an imperative ("第一步是拆活，现在就做。") rather than a request, so the block reads
 * as the shape this turn must take instead of one voice among several.
 */
export declare const TEAM_INSTRUCTION_ZH: string;
/** The same instruction, English, with the same three steps in the same order. */
export declare const TEAM_INSTRUCTION_EN: string;
/** The instruction for one language. */
export declare function teamInstruction(lang: ForceTeamLang): string;
/**
 * The instruction language for one piece of text.
 *
 * A CJK character means Chinese; otherwise Latin text means English. Text with
 * neither (empty, digits, punctuation) answers `zh`, which is this repository's
 * default language — guessing English from a blank string would put an English
 * command into a Chinese session.
 */
export declare function languageOf(text: string): ForceTeamLang;
/**
 * Whether this text asks for a team.
 *
 * Chinese is a substring test (a keyword may sit inside a longer phrase and still be
 * the request); English is a whole-word test (see {@link FORCE_TEAM_KEYWORDS_EN} for
 * why the two sides are not symmetric).
 * @param text - one message's plain text.
 * @returns true when at least one keyword of either language is present.
 */
export declare function asksForTeam(text: string): boolean;
/** Plain text of one message, blocks joined the way the model reads them. */
export declare function messageText(message: UserMessage): string;
/**
 * The same message with the instruction appended as one more text block.
 *
 * The message keeps its identity (`id`, `role`, `source`) and every existing block
 * byte-for-byte: the returned value is a shallow copy whose only difference is the
 * trailing block. Identity is what makes the injection free of side effects — the
 * loop commits this message instead of the one it claimed, so the transcript gains no
 * second row and the user's own text is never re-serialised.
 * @param message - the claimed user message that matched.
 * @param lang - language of the instruction.
 * @returns the message the step should enter with.
 */
export declare function withTeamInstruction(message: UserMessage, lang: ForceTeamLang): UserMessage;
/**
 * Whether this session is in grok mode, read the way the routing surface reads it.
 *
 * A session that wrote a toggle record answers with it; a session that never did
 * answers with the deployment default, which is the same reading `/grok status` and
 * the settings page report (D-154: the *routing* surface reports the effective value,
 * and this listener decides routing). The block admission keeps its stricter
 * record-only rule — that one is "did this session opt in to taking work", which is a
 * different question (`src/user-source.ts`).
 * @param session - the session whose toggle is read.
 * @param deploymentDefault - `grokDefault === 'on'`.
 * @returns true only when the session is in grok mode.
 */
export declare function grokModeOn(session: Session | undefined, deploymentDefault: boolean): boolean;
/**
 * Whether this session is a delegated child rather than a conversation with a user.
 *
 * A child's "user" message is the prompt its parent wrote, so a keyword there is the
 * parent's task text, not a person asking for a team, and an instruction in it would nest
 * a team under the team that produced the child — the same reason the narrow heartbeat
 * listener never charges a beat to a child (`src/heartbeat-listen.ts`).
 * @param session - the dispatch's session.
 * @returns true for a subagent-origin session or any session at delegation depth > 0.
 */
export declare function isDelegatedSession(session: Session | undefined): boolean;
/** Payload shape of one `agent/pre-step` dispatch (only the fields read here). */
export interface ForceTeamPayload {
    agent?: {
        session?: Session;
    } | undefined;
    messages?: UserMessage[] | undefined;
}
/** Dependencies of the listener. */
export interface ForceTeamInput {
    /**
     * Host context; only `on` is used.
     *
     * Typed as `unknown` on purpose: cordis's `on` is a generic overload over its own
     * event map, so a structural parameter type cannot name it without importing the
     * whole event table. The runtime check below is what actually guards it.
     */
    ctx: {
        on?: unknown;
    };
    logger: {
        warn(message: string): void;
    };
    /** `true` registers the listener; anything else registers nothing at all. */
    enabled: boolean;
    /** Load-time configuration, and the fallback a broken live read degrades to. */
    config: ResolvedConfig;
    /** Live configuration reader; omitted means the load-time snapshot is final. */
    readConfig?: (() => ResolvedConfig) | undefined;
}
/**
 * Install the forced-team listener.
 *
 * @param input - context, logger, the switch and the configuration reader.
 * @returns The disposer cordis already owns; a no-op when the switch is off.
 */
export declare function installForceTeam(input: ForceTeamInput): () => void;
//# sourceMappingURL=force-team.d.ts.map