/**
 * Forced team routing: a keyword in the user's turn buys a hard instruction, and a
 * turn that then answers alone gets one refusal.
 *
 * Two halves, one listener on `agent/pre-step` — the only admission point the Host
 * gives this plugin, and the only `agent/*` waterfall a plugin can still register.
 * There is no turn-end hook and no post-step hook in DSH 0.2.1-rc.2: `turn/end` is a
 * session *event* the loop writes, not a dispatch a listener can answer (the only
 * pre-step-shaped dispatch in the installed tree is the one declared at
 * `@deepseek-ai/dsh-agent/lib/types/runtime-types.d.ts:333`). So both halves hang on
 * the same waterfall, and the difference between them is what they do to the
 * decision:
 *
 * 1. **Injection (rewrites `enter`).** When a user-authored message of the claimed
 *    batch asks for a team, the message handed to the model carries the same text
 *    plus one fixed instruction block. `next()` already produced the batch — its
 *    order, its ids, its runtime-context tail — so this listener maps over that
 *    list and changes exactly one thing per matched message: one more text block at
 *    the end. Nothing is rewritten, nothing is added to the session, no second
 *    message appears, and the user's own words stay a byte-identical prefix. That
 *    matters because `enter.messages` is the only writer for a claimed batch: a
 *    separate `session.append()` on top of it would be a second copy of the same
 *    words in the transcript (the P0-1 defect the old gate was fixed for).
 * 2. **The turn gate (replaces `enter` with `reject`).** A turn that matched and then
 *    asked for a second step without writing a single `tool-workflow/*` event was
 *    about to be worked alone. That step is refused once — `reject` is the only
 *    decision that reliably produces zero model calls — and the session gets one
 *    user-role row carrying the intake's bilingual refusal text, because a bare
 *    `reject` is invisible: the reader would see an empty turn and no reason
 *    (`src/intake.ts` is the one place that owns that wording).
 *
 * Why the instruction is a command and not a suggestion. A suggestion is a piece of
 * advice competing with everything else in context, and the case this feature exists
 * for is precisely the one where the model has already decided to answer on its own:
 * advice loses that competition by construction, and the user who said "开团" gets a
 * single-model answer anyway. The instruction therefore states a constraint on the
 * *shape* of the turn ("a single answer is not acceptable"), not a preference — and
 * the turn gate is what enforces it when the model ignores the constraint.
 *
 * Three rules keep this listener from becoming a second authority:
 *
 * - **Off is inert.** No `agent/pre-step` listener is registered when the load-time
 *   switch is off, so the chain a profile with `forceTeamRouting: false` carries is
 *   exactly the pre-feature chain. A switch turned off later (`/grok off`, or a live
 *   read of the same key) leaves the decision untouched — the identical object the
 *   loop proposed, not a copy that happens to match.
 * - **A brake never fires on evidence it cannot read.** An unreadable log is a
 *   warning and a pass, never a refusal: a gate that refuses a turn for a reason it
 *   cannot state is worse than the answer it was trying to stop.
 * - **One refusal per turn, and the turn is the whole scope.** The flag is in memory,
 *   keyed by session, and it is dropped the moment a turn shows a team or a turn
 *   boundary shows the flag has gone stale. Nothing here is durable state: a plugin
 *   reload loses a pending flag, which costs at most the one refusal it would have
 *   spent.
 */
import type { Session } from '@deepseek-ai/dsh-session';
import type { UserMessage } from '@deepseek-ai/dsh-llm';
import type { ResolvedConfig } from './types.js';
declare module '@deepseek-ai/dsh-llm' {
    interface MessageSourceMap {
        /** The row this plugin writes when it refuses a turn for answering alone. */
        'grok-workflow-force-team': {
            kind: 'grok-workflow-force-team';
        };
    }
}
/** Source kind of the refusal row, so a transcript shows who wrote it. */
export declare const FORCE_TEAM_SOURCE_KIND = "grok-workflow-force-team";
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
 * parent's task text, not a person asking for a team. Forcing a team inside a child
 * would nest teams and could refuse a child's own continuation step — the same reason
 * the narrow heartbeat listener never charges a beat to a child (`src/heartbeat-listen.ts`).
 * @param session - the dispatch's session.
 * @returns true for a subagent-origin session or any session at delegation depth > 0.
 */
export declare function isDelegatedSession(session: Session | undefined): boolean;
/**
 * Whether the given turn wrote any `tool-workflow/*` event since it opened.
 *
 * The progress family (`run-start` and friends) is written while a run is alive, so
 * its presence in the turn's own log is the only evidence a team was started —
 * nothing here trusts a flag or a timer. `undefined` means the log could not be read,
 * which a caller must never turn into a refusal.
 * @param session - the session whose log is read.
 * @param turn - the turn the question is about.
 * @returns true when a team event followed this turn's `turn/start`, false when it
 * did not (or when this log never opened the turn), `undefined` when unreadable.
 */
export declare function teamStartedInTurn(session: Session | undefined, turn: number): boolean | undefined;
/** A turn that matched a keyword and has not shown a team yet. */
export interface TeamFlag {
    /** Turn that matched. */
    turn: number;
    /** Step of that turn in which the match was seen. */
    step: number;
    /** Characters measured in the matched message, for the refusal's own count. */
    chars: number;
}
/** What the turn gate decided about one dispatch. */
export type TeamGateVerdict = 'none' | 'refuse' | 'stale';
/**
 * The turn gate, as a pure function of the flag and the evidence.
 *
 * - `refuse` — the flagged turn asked for another step and its log shows no team:
 *   the one case this gate exists for.
 * - `stale` — the flag belongs to an earlier turn. The runtime offered no pre-step
 *   inside that turn (the model answered in one step and the turn closed), so the
 *   only remaining opportunity would be to refuse a *different, newer* message for
 *   what an older turn did. That refuses the wrong turn and eats a message, so the
 *   flag is dropped instead; the injection was that turn's only lever.
 * - `none` — no flag, a team was found, the flag was set by this very step, or the
 *   evidence could not be read.
 * @param input - the pending flag, the dispatch's position, and the evidence.
 * @returns the verdict, without side effects.
 */
export declare function teamGateVerdict(input: {
    flag: TeamFlag | undefined;
    turn: number;
    step: number;
    teamStarted: boolean | undefined;
}): TeamGateVerdict;
/** Payload shape of one `agent/pre-step` dispatch (only the fields read here). */
export interface ForceTeamPayload {
    agent?: {
        session?: Session;
    } | undefined;
    messages?: UserMessage[] | undefined;
    turn?: number | undefined;
    step?: number | undefined;
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