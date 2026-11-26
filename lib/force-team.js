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
import { readModeRecord } from './mode.js';
import { redactError } from './redact.js';
import { isUserAuthoredSource } from './user-source.js';
/** Chinese keywords. Matched as substrings: Chinese does not separate words. */
export const FORCE_TEAM_KEYWORDS_ZH = ['开团', '组队', '分工'];
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
export const FORCE_TEAM_KEYWORDS_EN = ['delegate', 'form a team', 'split the work'];
/**
 * The fixed hard instruction, Chinese.
 *
 * One block, three numbered steps, a closing sentence — and the closing sentence is
 * an imperative ("第一步是拆活，现在就做。") rather than a request, so the block reads
 * as the shape this turn must take instead of one voice among several.
 */
export const TEAM_INSTRUCTION_ZH = [
    '【强制：这一轮走团队模式】',
    '这一轮不许单条作答。按顺序做完这三步：',
    '1. 先拆活——把要做的事拆成可以并行的任务，每个任务写清产出和验收标准；',
    '2. 再并发执行——用工作流/团队工具把这些任务并发派给子代理，不要自己一个个做完；',
    '3. 最后汇总——所有任务回来后按验收标准逐条核对，再给结论，没通过的必须写明没过。',
    '第一步是拆活，现在就做。',
].join('\n');
/** The same instruction, English, with the same three steps in the same order. */
export const TEAM_INSTRUCTION_EN = [
    '[Mandatory: this turn runs as a team]',
    'A single answer is not acceptable this turn. Do these three in order:',
    '1. split the work: break it into tasks that can run in parallel, each with its output and its acceptance check;',
    '2. run them concurrently: dispatch those tasks to subagents through the workflow or team tool instead of working through them yourself;',
    '3. summarise: when every task is back, check each against its acceptance criteria and then answer; anything that failed must be reported as failed.',
    'Start by splitting the work, now.',
].join('\n');
/** The instruction for one language. */
export function teamInstruction(lang) {
    return lang === 'zh' ? TEAM_INSTRUCTION_ZH : TEAM_INSTRUCTION_EN;
}
/** A CJK character; the one signal that decides the instruction's language. */
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]/;
/**
 * The instruction language for one piece of text.
 *
 * A CJK character means Chinese; otherwise Latin text means English. Text with
 * neither (empty, digits, punctuation) answers `zh`, which is this repository's
 * default language — guessing English from a blank string would put an English
 * command into a Chinese session.
 */
export function languageOf(text) {
    if (CJK.test(text))
        return 'zh';
    return /[A-Za-z]/.test(text) ? 'en' : 'zh';
}
/** One English keyword as a whole-word pattern, whitespace runs included. */
function englishPattern(keyword) {
    const body = keyword.trim().split(/\s+/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
    return new RegExp(`(?<![A-Za-z0-9_])${body}(?![A-Za-z0-9_])`, 'i');
}
const ENGLISH_PATTERNS = FORCE_TEAM_KEYWORDS_EN.map(englishPattern);
/**
 * Whether this text asks for a team.
 *
 * Chinese is a substring test (a keyword may sit inside a longer phrase and still be
 * the request); English is a whole-word test (see {@link FORCE_TEAM_KEYWORDS_EN} for
 * why the two sides are not symmetric).
 * @param text - one message's plain text.
 * @returns true when at least one keyword of either language is present.
 */
export function asksForTeam(text) {
    if (text === '')
        return false;
    if (FORCE_TEAM_KEYWORDS_ZH.some(keyword => text.includes(keyword)))
        return true;
    return ENGLISH_PATTERNS.some(pattern => pattern.test(text));
}
/**
 * Whatever a batch element really is, read as a message or as nothing.
 *
 * The listener runs on **every** pre-step, including batches a caller or another
 * plugin built badly, so a `null` in the array has to read as "not a user message"
 * rather than take the turn down (the same rule the narrow heartbeat listener
 * follows). Everything below goes through here.
 */
function asMessage(value) {
    if (value === null || typeof value !== 'object')
        return undefined;
    const candidate = value;
    if (!Array.isArray(candidate.content))
        return undefined;
    return value;
}
/** Plain text of one message, blocks joined the way the model reads them. */
export function messageText(message) {
    const parts = [];
    for (const block of Array.isArray(message.content) ? message.content : []) {
        const candidate = block;
        if (candidate.type === 'text' && typeof candidate.text === 'string')
            parts.push(candidate.text);
    }
    return parts.join('\n');
}
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
export function withTeamInstruction(message, lang) {
    return {
        ...message,
        content: [...message.content, { type: 'text', text: teamInstruction(lang) }],
    };
}
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
export function grokModeOn(session, deploymentDefault) {
    return readModeRecord(session)?.enabled ?? deploymentDefault;
}
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
export function isDelegatedSession(session) {
    try {
        const header = session?.header;
        if (header === undefined || header === null)
            return false;
        if (header.origin === 'subagent')
            return true;
        return typeof header.delegationDepth === 'number' && header.delegationDepth > 0;
    }
    catch {
        // An unreadable header must not read as "this is a user's session": injecting an
        // instruction into someone else's child is the one mistake this listener cannot
        // see and cannot undo, so the safe answer is "not mine".
        return true;
    }
}
/**
 * Install the forced-team listener.
 *
 * @param input - context, logger, the switch and the configuration reader.
 * @returns The disposer cordis already owns; a no-op when the switch is off.
 */
export function installForceTeam(input) {
    const { ctx, logger, enabled } = input;
    // Off is inert: not a listener that returns early, but no listener at all, so the
    // registered chain is exactly the pre-feature one.
    if (enabled !== true)
        return () => { };
    if (typeof ctx.on !== 'function')
        return () => { };
    const host = ctx;
    /** The live configuration, degrading to the load-time snapshot. */
    const scope = () => {
        if (input.readConfig === undefined)
            return input.config;
        try {
            return input.readConfig();
        }
        catch {
            return input.config;
        }
    };
    /**
     * Rewrite the batch the loop proposed: one instruction on each matched message.
     *
     * The only change this listener can make. Whatever `next()` returned is final in
     * every other respect — a downstream `reject` is handed back untouched, and so is a
     * batch with no keyword in it.
     */
    const handle = async (payload, next) => {
        const decision = await next();
        // Only an `enter` carries a batch to instruct. A downstream listener's `reject` is
        // that listener's decision and is returned as the same object.
        if (decision === null || decision === undefined || decision.kind !== 'enter')
            return decision;
        const live = scope();
        if (live.forceTeamRouting !== true)
            return decision;
        const session = payload.agent?.session;
        // A delegated child is not a user's turn: its prompt belongs to its parent.
        if (isDelegatedSession(session))
            return decision;
        // The toggle is this listener's own condition: a session that is not in grok mode
        // is ordinary chat, and nothing here may touch it.
        let modeOn;
        try {
            modeOn = grokModeOn(session, live.grokDefault === 'on');
        }
        catch (error) {
            logger.warn(`force-team: could not read this session's mode toggle, passing the turn through: ${redactError(error)}`);
            return decision;
        }
        if (!modeOn)
            return decision;
        const messages = Array.isArray(decision.messages) ? decision.messages : [];
        const matched = messages.filter((raw) => {
            const message = asMessage(raw);
            return message !== undefined && isUserAuthoredSource(message.source) && asksForTeam(messageText(message));
        });
        if (matched.length === 0)
            return decision;
        const rewritten = messages.map((message) => {
            if (!matched.includes(message))
                return message;
            return withTeamInstruction(message, languageOf(messageText(message)));
        });
        return { ...decision, messages: rewritten };
    };
    const dispose = host.on('agent/pre-step', handle);
    return typeof dispose === 'function' ? dispose : () => { };
}
//# sourceMappingURL=force-team.js.map