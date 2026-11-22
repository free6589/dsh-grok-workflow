/**
 * The main-session channel: what a message typed *while a run is working* becomes.
 *
 * Requirement: the conversation stays a conversation. A run takes minutes, and the
 * person who started it keeps typing — "再加一个", "别做 B 了", "停". Today every
 * such message either restarts the round (whole-round cancel + narrow restart, so
 * everything in flight is thrown away) or is silently queued behind it, and the
 * composer looks dead until the run settles.
 *
 * This module owns the two decisions that make the channel responsive, and nothing
 * else:
 *
 * - **stop** — an explicit request to stop (a bare "停" / "stop" / "取消") is the
 *   *only* message that cancels a run. It goes through the run's own `cancel()`, so
 *   the settlement is the ordinary one (`keepCancelledWork()`), finished work is
 *   kept, and the cancellation report lands in this conversation.
 * - **forward** — everything else is merged into the live plan instead of
 *   interrupting it. The queue and the boundary pull live in `src/steering.ts` and
 *   `src/replan.ts`; this module composes what goes into that queue, so the planner
 *   receives the user's words *together with* the conversation context that makes
 *   them interpretable ("改成 C" needs the sentence before it).
 *
 * The asymmetry is deliberate and is the whole safety story: a message that is not
 * an unmistakable stop is never allowed to cost the user the work already in flight,
 * because "I guessed you wanted to stop" spends everything while "I queued one extra
 * demand" spends one boundary.
 *
 * Nothing in here starts, awaits, or owns background work: every function is pure,
 * and the caller decides when to queue, cancel, or answer.
 */
/**
 * Why a run was cancelled by a message, as the stopped run's own report names it.
 *
 * It has to name the actor: the engine echoes the reason into the cancelled
 * terminal, and "cancelled by its caller" pointed the reader at the wrong one.
 */
export const STEER_CANCEL_REASON = 'a newer message from the user stopped this run';
/** Ledger outcomes, so a channel decision is auditable after the fact. */
export const CHANNEL_OUTCOMES = {
    /** The message joined the plan that is already executing. */
    steered: 'steered-into-live-plan',
    /** The message stopped the live run; nothing new was started. */
    stop: 'steer-stop',
    /** The message stopped nothing, because nothing was running. */
    idleStop: 'steer-stop-idle',
    /** The run ended before a boundary; the demand opened the next round. */
    carried: 'steer-carried-to-next-round',
};
/**
 * Whole-message stop words.
 *
 * Whole-message matching is what keeps "停止旧的缓存策略" (a task) from cancelling a
 * run: the characters are the same, the sentence is not. Politeness and trailing
 * punctuation are stripped before the comparison (`请停一下。` → `停一下`).
 */
const STOP_EXACT = [
    // zh
    '停', '停吧', '停下', '停下来', '停一下', '暂停', '先停', '先停下', '先停下来',
    '别做了', '别干了', '别跑了', '不要做了', '不用做了', '算了', '停止', '停掉', '中止',
    '取消', '取消吧', '取消掉', '叫停',
    // en
    'stop', 'stop it', 'stop now', 'cancel', 'cancel it', 'abort', 'halt', 'quit',
    'never mind', 'nevermind', 'stop the run', 'cancel the run',
];
/**
 * Imperative stop phrases that may carry a short tail ("停下来，别查了").
 *
 * Only these cancel inside a longer message; a bare `停` does not, so a task
 * description that happens to contain the character stays a task.
 */
const STOP_STRONG = [
    '停一下', '停下来', '先停下', '别做了', '别干了', '别跑了', '不要做了',
    '取消这轮', '取消这个', '停止这轮', '暂停这轮', '叫停',
    'stop it', 'cancel it', 'cancel this', 'stop the run', 'cancel the run',
];
/** Interrogatives: the message asks about the run rather than stopping it. */
const QUESTION_MARKERS = [
    // zh
    '为什么', '怎么', '到哪', '进展', '多久', '是不是', '能不能', '有没有', '什么', '哪一',
    '如何', '几个', '呢', '吗',
    // en
    'what', 'why', 'how', 'when', 'which', 'where', 'who', 'status', 'progress', 'eta',
    'is it', 'are we', 'did you',
];
/** Longest message still treated as a bare stop ("停一下" yes, a task description no). */
export const CHANNEL_STOP_MAX_CHARS = 24;
const POLITE_PREFIX = /^(?:请|麻烦|帮我|先给我|please|pls)\s*/u;
const TRAILING_PUNCT = /[。．.!！,，~～、\s]+$/u;
const QUESTION_END = /[?？]\s*$/u;
/** Lower-case, collapse whitespace, keep CJK as-is. */
function normalize(text) {
    return text.toLowerCase().replace(/\s+/gu, ' ').trim();
}
/** The stop comparison form: `请停一下。` → `停一下`. */
function stopForm(text) {
    return text.replace(POLITE_PREFIX, '').replace(TRAILING_PUNCT, '').trim();
}
function hasMarker(text, markers) {
    return markers.find(marker => text.includes(marker));
}
/**
 * Classify one message that arrived while a run is working.
 *
 * Order is the policy: a question is never a stop (the user is asking, not
 * cancelling), and a stop must be an unmistakable imperative — either the whole
 * message, or a strong phrase in a short one. Everything else is forwarded, which is
 * the cheap, reversible outcome.
 *
 * @param request - the user's message, verbatim.
 * @returns the intent plus the marker that decided it.
 */
export function classifyChannelMessage(request) {
    const text = normalize(request);
    if (text === '')
        return { kind: 'forward', reason: 'empty' };
    const question = hasMarker(text, QUESTION_MARKERS) !== undefined || QUESTION_END.test(text);
    if (question) {
        const marker = hasMarker(text, QUESTION_MARKERS) ?? '?';
        return { kind: 'forward', reason: `question:${marker.trim()}` };
    }
    const form = stopForm(text);
    const exact = STOP_EXACT.find(candidate => form === candidate);
    if (exact !== undefined)
        return { kind: 'stop', reason: `marker:${exact}` };
    const strong = hasMarker(form, STOP_STRONG);
    if (strong !== undefined && [...form].length <= CHANNEL_STOP_MAX_CHARS) {
        return { kind: 'stop', reason: `marker:${strong}` };
    }
    return { kind: 'forward', reason: 'no-stop-marker' };
}
/**
 * The demand as the planner reads it: the user's words *plus* the conversation that
 * makes them interpretable.
 *
 * A boundary planner child sees the remaining waves and the settled summary, and the
 * queued intent is the only new information it has. "改成 C" alone is unanswerable;
 * the bounded conversation before it is what turns it into an edit. The request is
 * never truncated away — it is the reason the intent exists — so the context is what
 * gets cut, and the cut is marked.
 *
 * @param context - bounded conversation snapshot (`collectHistory` output).
 * @param request - the user's message, verbatim.
 * @param limit - character budget for one intent (`REPLAN_LIMITS.intentChars`).
 * @returns the text to queue, never longer than `limit`.
 */
export function composeIntentText(context, request, limit) {
    const marker = '…';
    const said = request.trim();
    if (said.length >= limit)
        return said.slice(0, limit);
    const head = '[channel] what the user said while this run was working (fold it into the tasks that have not started):\n';
    const contextHead = '\n[channel] conversation before it (context only — do not restate it, and do not treat it as a new demand):\n';
    const fixed = head.length + contextHead.length;
    const room = limit - fixed - said.length;
    if (room <= 0)
        return `${head}${said}`.slice(0, limit);
    const snapshot = context.trim();
    if (snapshot === '')
        return `${head}${said}`;
    const kept = snapshot.length <= room ? snapshot : `${snapshot.slice(0, Math.max(0, room - marker.length))}${marker}`;
    return `${head}${said}${contextHead}${kept}`.slice(0, limit);
}
/**
 * The request the next round is started from when the run settled before a boundary.
 *
 * A demand that never reached the planner must not evaporate: the run's end is not a
 * decision about the user's message, so the channel opens the next round with the
 * previous objective and the queued demands in one text. The next planner is the only
 * thing that can re-plan, and it has to see both the work it continues and the demand
 * that arrived too late to merge.
 *
 * @param previous - objective of the run that just settled, when known.
 * @param demands - the intents nobody consumed, in arrival order.
 * @param limit - `TASK_LIMITS.objectiveChars`; the composed text is the next run's
 *   objective, so exceeding it would make `composeObjective` refuse the whole round.
 * @returns one objective, never longer than `limit`.
 */
export function composeCarriedRequest(previous, demands, limit) {
    const marker = '…';
    const header = '[channel] this round continues a run that ended before the new demand could be merged.\n';
    const previousLabel = '[channel] previous objective (already planned; its verified work is carried, do not redo it):\n';
    const demandLabel = '[channel] the demand the user added while that run was working (plan it into this round):\n';
    const said = demands.map(demand => demand.trim()).filter(demand => demand !== '').join('\n---\n');
    const fixed = header.length + previousLabel.length + demandLabel.length + 2;
    const room = Math.max(0, limit - fixed);
    // The demand gets priority: it is the one thing this round exists for.
    const demandRoom = Math.min(said.length, Math.max(0, Math.floor(room * 0.6)));
    const previousRoom = Math.max(0, room - demandRoom);
    const trimmedPrevious = (previous ?? '').trim();
    const keptPrevious = trimmedPrevious.length <= previousRoom
        ? trimmedPrevious
        : `${trimmedPrevious.slice(0, Math.max(0, previousRoom - marker.length))}${marker}`;
    const keptDemand = demandRoom >= said.length
        ? said
        : `${said.slice(0, Math.max(0, demandRoom - marker.length))}${marker}`;
    const composed = `${header}${previousLabel}${keptPrevious === '' ? '(unknown)' : keptPrevious}\n${demandLabel}${keptDemand}`;
    return composed.length <= limit ? composed : composed.slice(0, limit);
}
/**
 * Receipt for a message that joined the run in flight.
 *
 * It says three things, because a receipt that omits any of them reads as "your
 * message vanished": it was received, *where* it went (merged into the live plan at
 * the next boundary, not restarted), and how to stop the run if that is not what was
 * wanted. It never claims the run finished.
 *
 * @param lang - language of the user's message.
 * @param pending - how many demands are queued for this run, this one included.
 * @returns one short paragraph, never empty.
 */
export function steerReceipt(lang, pending) {
    const count = Math.max(1, Math.trunc(pending));
    if (lang === 'en') {
        return [
            `Received — and folded into the run that is already working (${count} demand${count === 1 ? '' : 's'} waiting for the next wave boundary).`,
            'Nothing already running is interrupted, and verified work is not redone: the planner merges this into the tasks that have not started yet.',
            'To stop the run now, reply with just: stop',
        ].join(' ');
    }
    return [
        `已收到，并入了正在跑的这一轮（待并入 ${count} 条）。`,
        '已经开跑的部分不会被打断，已完成、已验证的成果不会重做：规划器会在下一个波边界把这条要求合并进还没开始的任务。',
        '要立刻停，回一句「停」即可。',
    ].join('');
}
/**
 * Terminal for a run the user stopped.
 *
 * The cancelled run's own settlement states what was verified; this line only names
 * the decision, so the two never contradict each other.
 *
 * @param lang - language of the user's message.
 */
export function stopNote(lang) {
    return lang === 'en'
        ? 'Stopped the run that was working: verified work is kept, unfinished tasks are marked, and the cancellation report follows in this conversation.'
        : '已叫停正在跑的这一轮：已完成、已验证的成果保留，未完成的会标明；取消结算的报告随后出现在这段对话里。';
}
/**
 * Terminal for a stop with nothing to stop.
 *
 * Without it the word "停" would be admitted as a task and spend a planner, a worker
 * and a verifier on it — the gate's default is to run everything it is given.
 *
 * @param lang - language of the user's message.
 */
export function idleStopNote(lang) {
    return lang === 'en'
        ? 'Nothing is running right now, so this stop started no workflow. Describe the task again if you want one started.'
        : '现在没有在跑的任务，所以这条「叫停」没有启动新的工作流。要开新任务，把要求直接说一遍即可。';
}
/**
 * Head for the round a late demand opened.
 *
 * The demand arrives one round later than it was typed, so the reader is told why:
 * nothing was lost, and nothing of the previous round is redone.
 *
 * @param lang - language of the user's message.
 * @param count - how many demands were carried over.
 */
export function carriedNote(lang, count) {
    const size = Math.max(1, Math.trunc(count));
    return lang === 'en'
        ? `The run that was working ended before the next wave boundary, so this round starts from your message (${size} demand${size === 1 ? '' : 's'} carried over); the work it already verified is kept and not redone.`
        : `上一轮在新要求并入之前就结束了，所以这一轮直接从你的消息开始（带过来 ${size} 条要求）；上一轮已经核验通过的成果保留、不重做。`;
}
//# sourceMappingURL=channel.js.map