/**
 * Mandatory-entry gate.
 *
 * Requirement: every top-level user message goes through the full workflow and
 * the main model cannot answer on its own.
 *
 * Mechanism, verified against DSH 0.2.1-rc.2:
 * - `agent/pre-step` is dispatched before every model request, including
 *   tool-continuation steps, so it is the only unavoidable admission point.
 * - `{kind:'reject'}` is the only decision that reliably produces zero model
 *   calls; `{kind:'enter', messages: []}` still issues a request because other
 *   listeners inject context into any `enter` decision.
 * - A rejected batch never becomes a `user/message` event. P0-1: `preStep()` takes
 *   the admitted batch out of the inbox (`inbox.claim`), and `step()` commits
 *   exactly `decision.messages` — so a decision that lists only this plugin's
 *   report deletes what the user typed, and no `session.append()` can be added on
 *   top of `enter.messages` without writing the same words twice. The two
 *   strategies therefore need two different writers: `in-turn` returns the claimed
 *   messages plus the report (the loop writes them), while `relay`/`append` reject
 *   the step, so the plugin commits the claimed message itself before delivering.
 *
 * The gate fails closed: when it cannot run the workflow it still refuses the
 * step and states the reason, because passing the message through would let the
 * main model answer directly.
 *
 * Three answer strategies, all fail-closed:
 * - `in-turn` (**default**): await the run inside this listener, then `enter`
 *   the step with the report, so the main model finalises it while the turn is
 *   still open. The only strategy that survives a one-shot app: with `relay`
 *   and `append` the run continues after the turn closes `blocked`, and a
 *   one-shot process tears the agent tree down at that moment (G-18/F9), which
 *   loses the answer and breaks R-001. Measured end to end with this plugin's own
 *   strategy (t25: exit 0 with the report vs exit 1 and no output for `relay`).
 * - `relay`: return `reject`, run in the background, deliver in a new turn.
 *   Needs a long-lived app to keep the tree alive; not measurable in headless
 *   one-shot mode (NR-1).
 * - `append`: like `relay`, but writes into the closed turn (`surfaceOp:'append'`);
 *   degraded, no stream and no usage accounting (NR-3).
 *
 * Only `relay`/`append` use the per-agent queue, because only they can have several
 * runs in flight for one agent. `in-turn` is already serialized by the loop (one step
 * at a time) and keeps its own bound through `maxActiveRuns`.
 */
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { readdirSync, readFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { acceptedEnterText, frontDeskText, noticeEnterText, noticeText, relayText, RELAY_SOURCE_KIND } from './answer.js';
import { carryoverBounds, carryoverForSession, inheritanceForSession } from './carryover.js';
import { CHANNEL_OUTCOMES, classifyChannelMessage, composeCarriedRequest, composeIntentText, idleStopNote, steerReceipt, stopNote, STEER_CANCEL_REASON, } from './channel.js';
import { humanConclusion } from './delivery/index.js';
import { collectHistory, composeObjective, renderHistory } from './history.js';
import { TASK_LIMITS } from './input.js';
import { inspectPrompt, refuseOversizePrompt } from './intake.js';
import { isModeEnabled, readModeRecord } from './mode.js';
import { alreadyRouted, appendAssistantInStep, appendInstantReceipt, deliveryKey, openStepOf, recordDelivery, recordTerminal, } from './records.js';
import { redactError, redactSecrets } from './redact.js';
import { STEERING_LIMITS, closeSteering, openSteering, steeringForSession } from './steering.js';
import { amendRequest, approvedRequest, captainAnswer, captainApproveNote, captainAskText, captainPreviewFallback, captainPreviewPrompt, captainVoidNote, CAPTAIN_LIMITS, } from './captain.js';
import { captainBrief, readCaptainMemory } from './captain-memory.js';
import { runSingleCall, runWorkflow } from './run.js';
import { isLoopHeartbeat, scheduleServiceOf } from './loop.js';
import { createLoopBrakes } from './loop-brakes.js';
import { FIXED_HISTORY_CHARS, FIXED_HISTORY_TURNS, FIXED_INSTANT_RECEIPT, FIXED_MAX_QUEUED_MESSAGES, FIXED_SHOW_DIAGNOSTICS, FIXED_TRIAGE_ASK, FIXED_TRIAGE_FOLLOWUP_AS_FAST, } from './config.js';
import { askLine, chatReply, classifyTriage, detectLanguage, expiredAskNote, firstAnswerFallback, firstAnswerPrompt, missingNote, recallFromPrior, recallPrompt, recalledNote, resolvePending, resumedRequest, sanitizeFirstAnswer, singleCallPrompt, tierNote, triageLine, unusedAskNote, RECALL_LIMITS, } from './triage.js';
/** Plain text of one message, whatever wrote it. */
function textOfBlock(message) {
    const parts = [];
    for (const block of message.content ?? []) {
        if (typeof block !== 'object' || block === null)
            continue;
        const candidate = block;
        if (candidate.type !== 'text' || typeof candidate.text !== 'string')
            continue;
        parts.push(candidate.text);
    }
    return parts.join('\n').trim();
}
/** Plain text of one user message. */
function textOf(message) {
    return textOfBlock(message);
}
/** Durable messages of one session, tolerating a runtime that cannot list them. */
function messagesOf(session) {
    if (session === undefined || typeof session.deriveMessages !== 'function')
        return [];
    try {
        return session.deriveMessages();
    }
    catch {
        return [];
    }
}
/** Session of an agent, when the runtime exposes one. */
function sessionOf(agent) {
    return agent.session;
}
/**
 * True when this run can answer live and deliver the team result later (B: 边聊边干).
 *
 * All-or-nothing: any failure here is a silent `false`, so the caller falls back
 * to `answerInTurn` and always produces a final answer.
 *
 * A one-shot run has no followup turn to deliver into: probing
 * `agent.whenIdle`/`followup` keeps this to genuinely interactive runs, so
 * @param agent - the agent that would deliver in the background.
 * @returns true only when `whenIdle` and `followup` are both functions and the
 *   session is present. Anything else (one-shot, followup unavailable) is a
 *   silent `false` and the caller falls back to `answerInTurn`.
 */
export function canBackgroundDeliver(agent) {
    try {
        const candidate = agent;
        if (typeof candidate.whenIdle !== 'function')
            return false;
        if (typeof candidate.followup !== 'function')
            return false;
        return sessionOf(agent) !== undefined;
    }
    catch {
        return false;
    }
}
/**
 * Bounded context snapshot the live first answer may read (history / carry-over /
 * memory, 2 000 characters; possibly empty).
 *
 * Failure-tolerant: any read error yields a shorter context (or an empty one)
 * rather than losing the first answer.
 */
function firstAnswerContext(session, history) {
    try {
        const carryover = carryoverForSession(session, {
            rounds: FIXED_HISTORY_TURNS,
            chars: FIXED_HISTORY_CHARS,
        }).digest;
        let memory = '';
        try {
            memory = readMemoryDocs(memoryDocRoots(), RECALL_LIMITS)
                .map(doc => `${doc.path}: ${doc.text}`)
                .join('\n');
        }
        catch {
            memory = '';
        }
        return [history, carryover, memory]
            .map(part => part.trim())
            .filter(part => part !== '')
            .join('\n\n')
            .slice(0, 2_000);
    }
    catch {
        return '';
    }
}
/**
 * One live first answer for a team message.
 *
 * The call is intentionally decoupled from the background start: a slow or
 * failed first answer never blocks the workflow run — the failure path still
 * enters a plainly-labelled template fallback, so the first visible line always
 * says what it is. The live text is scrubbed the way the delivery side scrubs
 * its human block (drop ledger lines, strip machine detail).
 *
 * `call` is injected so the module stays testable without an engine; production
 * wires it to one `runSingleCall` (`label: 'first-answer'`, `triageModel` route).
 *
 * @param agent - owning agent (kept for call-site symmetry; unused by the helper itself).
 * @param request - the user original.
 * @param history - bounded context snapshot, possibly empty.
 * @param tier - the team verdict (language only; never the tier sentence itself).
 * @param call - the one first-answer call; absent means "no live text".
 * @returns the first-answer text (live or template fallback, never empty).
 */
export async function produceFirstAnswer(agent, request, history, tier, call) {
    void agent;
    let raw = '';
    try {
        const outcome = call === undefined
            ? undefined
            : await call(firstAnswerPrompt(request, history ?? '', tier.lang));
        if (outcome !== undefined && outcome.ok)
            raw = sanitizeFirstAnswer(outcome.text);
    }
    catch {
        raw = '';
    }
    if (raw.trim() !== '')
        return raw;
    return firstAnswerFallback(tier.lang, request);
}
/* ------------------------------------------------- look up, then ask ------ */
/**
 * Directories the look-up pass reads memory files from.
 *
 * The default is the workspace's own `docs/knowledge` — the directory this
 * plugin's `AGENTS.md` defines as durable memory — so an installation that keeps
 * that convention gets the behaviour with no configuration at all.
 * `GROK_WORKFLOW_KNOWLEDGE_DIRS` (path-delimiter separated) replaces it for
 * installations that keep memory somewhere else.
 *
 * @param env - process environment (injected for tests).
 * @param cwd - working directory the default root is resolved against.
 * @returns absolute or cwd-relative roots, in the order they are read.
 */
export function memoryDocRoots(env = process.env, cwd = process.cwd()) {
    const configured = (env.GROK_WORKFLOW_KNOWLEDGE_DIRS ?? '').trim();
    if (configured !== '') {
        return configured.split(delimiter).map(entry => entry.trim()).filter(entry => entry !== '');
    }
    return [join(cwd, 'docs', 'knowledge')];
}
/**
 * Read the markdown memory files under the given roots.
 *
 * Read-only, bounded, and never fatal: a missing directory, an unreadable file
 * or a permissions error skips that entry, because a look-up that cannot read is
 * a look-up that found nothing — not a failed turn. Files are sorted by name so
 * the same directory always yields the same material, and every body passes
 * `redactSecrets` before it can reach a prompt or an answer.
 *
 * @param roots - directories to read (see {@link memoryDocRoots}).
 * @param bounds - file count and character bounds.
 * @returns the files that could be read, in deterministic order.
 */
export function readMemoryDocs(roots, bounds = RECALL_LIMITS) {
    const docs = [];
    let spent = 0;
    for (const root of roots) {
        let names;
        try {
            names = readdirSync(root, { withFileTypes: true })
                .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
                .map(entry => entry.name)
                .sort();
        }
        catch {
            continue;
        }
        for (const name of names) {
            if (docs.length >= bounds.files || spent >= bounds.totalChars)
                return docs;
            let raw = '';
            try {
                raw = readFileSync(join(root, name), 'utf8');
            }
            catch {
                continue;
            }
            const body = redactSecrets(raw);
            const kept = body.length > bounds.fileChars ? `${body.slice(0, bounds.fileChars)}…` : body;
            if (kept.trim() === '')
                continue;
            docs.push({ path: join(root, name), text: kept });
            spent += kept.length;
        }
    }
    return docs;
}
/**
 * Everything one look-up pass may answer from, in the order it is trusted.
 *
 * Only existing material is read — the durable conversation, the validated
 * reports this plugin already wrote into it, and the memory files already on
 * disk. Nothing is created, archived or written here: this is a read of what the
 * session has, which is exactly what makes "answer from history" honest.
 *
 * The message being answered is excluded: both answer strategies publish the
 * claimed batch before the answer is produced (P0-5), so the session already
 * contains the very words being classified — and a look-up that matched them
 * would "find" the message in itself and answer every question with the question.
 *
 * @param session - the session that owns the message; `undefined` is legal.
 * @param roots - memory directories to read.
 * @param exclude - text of the message being answered, dropped from the material.
 * @returns bounded sources; empty when nothing exists yet.
 */
export function collectRecallSources(session, roots, exclude = '') {
    const sources = [];
    const wanted = exclude.trim();
    const messages = messagesOf(session);
    const prior = wanted === '' ? messages : messages.filter(message => textOfBlock(message).trim() !== wanted);
    const history = renderHistory(prior, { turns: RECALL_LIMITS.turns, chars: RECALL_LIMITS.historyChars });
    if (history.trim() !== '')
        sources.push({ kind: 'history', locator: 'conversation so far', text: history });
    // The reports this plugin wrote for earlier rounds are excluded from
    // `collectHistory` (they are plugin messages, not user speech) — and they are
    // precisely where a round's research results live. The same compiled digest the
    // run already uses is read here, read-only and bounded, so a follow-up about an
    // earlier round is answerable from it.
    const carryover = carryoverForSession(session, { rounds: RECALL_LIMITS.rounds, chars: RECALL_LIMITS.digestChars });
    if (carryover.digest.trim() !== '') {
        sources.push({ kind: 'history', locator: `earlier rounds in this session (${carryover.rounds})`, text: carryover.digest });
    }
    for (const doc of readMemoryDocs(roots))
        sources.push({ kind: 'memory', locator: doc.path, text: doc.text });
    return sources.slice(0, RECALL_LIMITS.sources);
}
/**
 * The messages an `enter` decision still owes after the batch was published.
 *
 * P0-5: `in-turn` writes the claimed batch itself before the run, so the decision
 * must not carry it again — `AgentLoop.step()` appends every non-runtime-context
 * entry of `decision.messages` as a `user/message` event, and the session has no
 * id-based dedupe, so keeping the batch here would render the user's words twice.
 * Runtime context (and anything else a downstream listener added) stays.
 */
function withoutClaimed(base, claimed) {
    const claimedIds = new Set(claimed.map(message => message.id));
    return base.filter(message => !claimedIds.has(message.id));
}
/** Stable identity used in delivery keys and queue keys. */
function agentIdOf(agent) {
    const session = sessionOf(agent);
    const id = session === undefined ? undefined : String(session.id);
    return id === undefined || id === '' ? 'unknown-agent' : id;
}
/**
 * Read the configuration for one classification, degrading to the load-time
 * snapshot when the live values do not validate.
 */
function readScope(deps) {
    if (deps.readConfig === undefined)
        return deps.config;
    try {
        return deps.readConfig();
    }
    catch {
        return deps.config;
    }
}
/**
 * Decide what to do with one claimed batch.
 *
 * Classification reads `payload.messages` only: `decision.messages` is appended
 * to by other listeners, so it cannot identify a new user message.
 */
export function classifyPreStep(deps, payload) {
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    // Tool continuation or wake: nothing was claimed, so no run may start.
    if (messages.length === 0)
        return { kind: 'pass', reason: 'empty-batch' };
    // A Host heartbeat is the one non-user message this gate knows how to route: it
    // continues the session's own work and must never be read as a request, and it is
    // the only place the loop's brakes can run — the delivery is the driver's whole
    // clock. Placed before the source filter, which would otherwise swallow it as
    // `non-user-source` and let the turn run with no stop condition at all.
    const heartbeat = messages.find(message => isHeartbeatMessage(message));
    if (heartbeat !== undefined)
        return classifyHeartbeat(deps, payload);
    const userMessages = messages.filter(message => {
        const source = message.source;
        return source?.kind === 'user';
    });
    // Context, notices and this plugin's own relay report: never a user request.
    if (userMessages.length === 0)
        return { kind: 'pass', reason: 'non-user-source' };
    const agent = payload.agent;
    const session = sessionOf(agent);
    const header = session?.header;
    const depth = header?.delegationDepth ?? 0;
    if (header?.origin === 'subagent' || depth > 0)
        return { kind: 'pass', reason: 'subagent' };
    // T4: the gate is always on for every session (gateScope/gatePreset removed).
    // The config default comes from the same live scope an edit updates, so a
    // settings edit is honored; placed here so the more specific pass reasons
    // above keep their labels.
    if (!isModeEnabled(session, readScope(deps).grokDefault === 'on')) {
        return { kind: 'pass', reason: 'mode-off' };
    }
    const agentId = agentIdOf(agent);
    const key = deliveryKey(agentId, userMessages);
    // One user message must start at most one workflow, across restarts and forks.
    if (alreadyRouted(session, key))
        return { kind: 'pass', reason: 'already-routed' };
    const request = userMessages.map(textOf).filter(text => text !== '').join('\n\n');
    return { kind: 'admit', agent, agentId, key, request, turn: payload.turn };
}
/**
 * True when this message is a loop heartbeat delivered by the Host.
 *
 * Two facts have to agree: the delivery source (`schedule`) and the ownership marker
 * this plugin writes into every prompt it creates. Either alone is spoofable — a user
 * can paste the marker, and a scheduled reminder can carry arbitrary text — so the pair
 * is what identifies the heartbeat.
 */
function isHeartbeatMessage(message) {
    const source = message.source;
    if (source?.kind !== 'schedule')
        return false;
    return isLoopHeartbeat(textOf(message));
}
/**
 * Route one heartbeat: continuation, or a stop that spends nothing.
 *
 * The continuation branch starts **no** run — the heartbeat turn is the session's own
 * ordinary turn — so `maxConcurrency` and `maxRetries` are untouched by construction;
 * this path can never add a second in-flight workflow. A tripped brake is answered with
 * `reject`, the one decision that produces zero model calls, and the stored Schedule row
 * is deleted by the caller so the heartbeat cannot arrive again.
 */
function classifyHeartbeat(deps, payload) {
    const session = sessionOf(payload.agent);
    // A delegated child never owns a loop: Schedule targets the session the user opened,
    // so a heartbeat here is a mis-targeted delivery, and charging it would put the
    // parent's accounting into the child's log.
    const header = session?.header;
    if (header?.origin === 'subagent' || (header?.delegationDepth ?? 0) > 0)
        return { kind: 'pass', reason: 'subagent' };
    const agentId = agentIdOf(payload.agent);
    if (deps.loop === undefined)
        return { kind: 'pass', reason: 'loop-continuation' };
    const input = {
        sessionId: agentId,
        session,
        config: readScope(deps),
    };
    const verdict = deps.loop.review(input);
    if (verdict.kind === 'stop') {
        return { kind: 'loop-stop', agentId, code: verdict.code, detail: verdict.detail };
    }
    // Charged before the turn runs: an admitted round consumes a slot and may already
    // have spent quota even if the turn then crashes.
    deps.loop.admit(input);
    return { kind: 'pass', reason: 'loop-continuation' };
}
/**
 * The receipt a `full`-mode turn shows beside the first answer.
 *
 * The turn is not only a receipt any more: the one or two sentences above it are
 * the answer, so this line must not read as if nothing had been said yet. It says
 * what those sentences are (a first answer), that the team is verifying them in the
 * background, that the conclusion comes as its own message and may correct them,
 * and that sending more meanwhile is expected rather than lost.
 *
 * @param lang - the message's language.
 * @returns one short paragraph, never empty.
 */
export function acceptedReceipt(lang) {
    if (lang === 'en') {
        return [
            'Accepted. The sentences above are a first answer; the team is now verifying them behind this turn (plan → execute → verify).',
            'Its conclusion arrives as its own message and may correct that first answer; you can keep sending meanwhile, and a new message starts its own run behind this one.',
        ].join(' ');
    }
    return [
        '已接单：上面这一两句是先答，团队正在后台按拆解 → 执行 → 核验核实它。',
        '核验结论稍后单独发一条给你，可能纠正上面的说法；期间可以继续发消息，新消息会排在这次之后各自开工。',
    ].join('');
}
/**
 * User-visible terminal for a cancelled turn (P0-4).
 *
 * A cancellation that ends silently is indistinguishable from a hang, and the two
 * used to be exactly that. The text names the state, keeps the completed/partial
 * split honest, and never reads as success.
 *
 * The kept report is stated as a human conclusion (`humanConclusion`), never
 * relayed: `relayText` would wrap it in the success preamble, the
 * `REPORT_BEGIN/END` markers and the folded machine ledger, and a cancelled
 * turn must never wear the packaging of a finished run.
 *
 * @param reason - Optional measured reason; empty when there is none to state.
 * @param report - Report the run produced before it was stopped, when there is one.
 * @param opts - the user's language (T4: human block always on, diagnostics always off).
 */
export function cancelledText(reason, report, opts = {}) {
    const verified = report?.tasks.filter(task => task.status === 'verified').length ?? 0;
    const total = report?.tasks.length ?? 0;
    const lines = report === undefined
        ? [
            '运行已取消（cancelled）：这条消息没有完成，也没有可交付的结果。',
            '没有可保留的核验报告；未完成的部分不再继续，要接着做请把任务重新发一次。',
        ]
        : [
            '运行已取消（cancelled）：工作流在全部任务完成前停止。',
            // R11: no task row means the run stopped before planning produced work
            // (a plan or deadline failure), so the honest count is "nothing started",
            // not `0/0` — a reader cannot parse that, and it reads as "nothing was
            // verified" rather than "nothing was ever started".
            total === 0
                ? '取消前还没有任何一项任务开工，所以没有核验结果；下方保留当时的结论，技术细节在进度节点里。总体状态仍为取消，不代表完成了什么。'
                : '取消前已有 ' + verified + '/' + total + ' 项任务核验通过；下方保留人话结论，技术细节在进度节点里。总体状态仍为取消，不代表全部完成。',
        ];
    const trimmed = reason.trim();
    if (trimmed !== '')
        lines.push('原因：' + trimmed);
    if (report !== undefined) {
        // Round 28: the kept report is stated as a human conclusion, not relayed.
        // `relayText` wraps the human block in the success preamble, the
        // `REPORT_BEGIN/END` markers and the folded machine ledger — that packaging
        // says "the workflow finished", which a cancelled turn must never claim.
        // The verified rows survive inside the conclusion text; the ledger stays in
        // the progress node, where it was already recorded.
        lines.push('', '取消前保留的工作流报告：', humanConclusion(report, {
            ...opts.lang === undefined ? {} : { lang: opts.lang },
        }));
    }
    return lines.join('\n');
}
/**
 * Plain-language head for a finished run (B plan, widened here).
 *
 * Kept as a named export so existing callers keep working; the composition itself
 * lives in `src/delivery/index.ts` (`humanConclusion`), which is the one module
 * that decides what a reader is told. This wrapper exists so the gate never grows
 * a second wording of its own — the drift that produced a PARTIAL answer opening
 * at `Grok workflow: PARTIAL` (session-4c562307).
 *
 * Deterministic on purpose: no model call, so engine call counts and the one-shot
 * budget are unchanged.
 *
 * T4: the human block is always on — `enabled` stays as a parameter so existing
 * callers keep compiling, but it is ignored.
 *
 * @param report - validated report.
 * @param lang - language of the user's request; picks which block leads.
 * @param enabled - ignored (always on).
 * @returns the head block.
 */
export function humanHead(report, lang, enabled) {
    void enabled;
    return humanConclusion(report, { lang: lang === 'en' ? 'en' : 'zh' });
}
/**
 * Deliver the answer in a new turn owned by the plugin (strategy `relay`).
 *
 * The message carries this plugin's source kind, so the gate recognises its own
 * answer on the next turn and never routes it again.
 */
async function deliverRelay(agent, text) {
    try {
        await agent.whenIdle();
    }
    catch {
        // A disposed agent cannot accept delivery; the failure is recorded by the caller.
    }
    try {
        const message = createUserMessage({
            content: [{ type: 'text', text }],
            source: { kind: RELAY_SOURCE_KIND },
        });
        agent.followup(message);
        return true;
    }
    catch {
        return false;
    }
}
/** Install the gate; throws when the runtime cannot host agent/pre-step (fail closed, round-54). */
export function installGate(deps) {
    const { ctx, config, state, logger } = deps;
    // Live configuration (DD-9 1-2): a settings edit is picked up by the next
    // admission, and never by work that already started. A broken edit refuses the
    // next message with its reason instead of half-applying, and delivery decisions
    // fall back to the last good snapshot so an in-flight answer still lands.
    let warnedLiveFailure = false;
    const live = () => deps.readConfig === undefined ? config : deps.readConfig();
    const fallback = () => deps.lastGoodConfig === undefined ? config : deps.lastGoodConfig();
    const safe = () => {
        try {
            return live();
        }
        catch (error) {
            // Not the load-time snapshot: an edit that already took effect must survive a
            // later invalid edit, so delivery falls back to the last good one (F1).
            if (!warnedLiveFailure) {
                warnedLiveFailure = true;
                logger.warn(`configuration is invalid, keeping the last good snapshot: ${redactError(error)}`);
            }
            return fallback();
        }
    };
    const host = ctx;
    const on = host.on;
    if (typeof on !== 'function') {
        // T4: no gateRequired switch anymore — a runtime without the hook fails the
        // load loudly, never a warning with the main model answering directly.
        throw new Error('agent/pre-step is unavailable: mandatory entry cannot be enforced in this runtime');
    }
    const queues = new Map();
    const record = (agent, entry, phase, outcome) => {
        recordDelivery(sessionOf(agent), {
            v: 1,
            key: entry.key,
            agentId: entry.agentId,
            messageIds: entry.messageIds,
            phase,
            turn: entry.turn,
            outcome,
        }, logger);
    };
    const entryOf = (verdict, payload) => ({
        key: verdict.key,
        agentId: verdict.agentId,
        messageIds: payload.messages.map(message => String(message.id)).sort(),
        turn: verdict.turn,
        step: payload.step,
    });
    /**
     * Refusals that need no run at all.
     *
     * Both are stated to the user instead of letting the model answer, and neither
     * claims the batch (`failed`, not `delivered`), so a corrected message can
     * still be routed later.
     */
    const refusalOf = (verdict) => {
        const refusal = inspectPrompt(verdict.request);
        if (refusal === undefined)
            return undefined;
        // Empty and oversize are the two boundaries the intake pass owns: refuse
        // explicitly, with the measured count and the action that fixes it, instead of
        // letting the model answer a prompt the workflow was never given (P0-3).
        return { reason: refusal.text, outcome: refusal.code === 'empty' ? 'empty-request' : 'objective-too-long' };
    };
    /**
     * Sessions whose last message was the front desk's question (t52).
     *
     * Process-local and short-lived by design: the question is answered in the next
     * message of the same conversation, so a Map is the right lifetime. The TTL
     * stops a stale question from swallowing an unrelated message an hour later.
     *
     * P0-2: the entry keeps the request the question was about, not just a clock
     * reading. "简单" answered from a bare timestamp left the quick worker with one
     * word as its whole task, and nothing could tell it what to do. Persisting this
     * to disk is deliberately not done here: the in-memory Map is the same trust
     * boundary the session history already has, and a lost entry is recoverable by
     * asking the user (see {@link takePending}).
     */
    const pendingAsks = new Map();
    /**
     * The captain's split confirmation (round-071): the request the split was about,
     * the split itself (`preview`, exactly the text the user read), the language to
     * answer in, and when it was asked. The preview is kept because the approval is
     * about *that* split: without it the run could re-split freely and the user would
     * pay for a plan they never agreed to. Same shape and lifetime as the front-desk
     * question above — one answer per question, ten minutes — because the user
     * experienced both as one kind of question ("确认").
     */
    const pendingCaptains = new Map();
    const PENDING_TTL_MS = 10 * 60_000;
    /**
     * Consume the pending question for one agent.
     *
     * The entry is removed either way: a question may be answered once, and an
     * expired one must not be re-consumed by the message after that.
     */
    const takePending = (agentId) => {
        const ask = pendingAsks.get(agentId);
        if (ask === undefined)
            return undefined;
        pendingAsks.delete(agentId);
        return Date.now() - ask.askedAt <= PENDING_TTL_MS ? { kind: 'live', ask } : { kind: 'expired', ask };
    };
    /**
     * Consume the captain's pending split confirmation for one agent.
     *
     * Same contract as {@link takePending}: the entry is removed either way, so an
     * expired confirmation is reported once and is never reused by the message after
     * that. The dispatch itself is the caller's: this only says what the message
     * means.
     */
    const takeCaptainPending = (agentId) => {
        const ask = pendingCaptains.get(agentId);
        if (ask === undefined)
            return undefined;
        pendingCaptains.delete(agentId);
        return Date.now() - ask.askedAt <= PENDING_TTL_MS ? { kind: 'live', ask } : { kind: 'expired', ask };
    };
    /**
     * What the front desk remembers when a second question arrives unanswered (B04).
     *
     * The entry is overwritten by every question, so keeping only the newest request
     * threw the earlier one away: the user then answered "简单/团队" about two
     * requests and the run was handed one of them. Both are carried, joined line by
     * line, within the workflow objective budget the pair is later composed against.
     * The newest message is kept whole — it is what the user just typed — and the
     * earlier one is cut, with an ellipsis marking the cut, when the two together
     * would not fit.
     *
     * @param older - request the previous question asked about.
     * @param newer - request this question asks about.
     * @returns one request text for the shared pending entry.
     */
    const carriedPendingRequest = (older, newer) => {
        const joined = `${older}\n${newer}`;
        if (joined.length <= TASK_LIMITS.objectiveChars)
            return joined;
        const room = TASK_LIMITS.objectiveChars - newer.length - '…\n'.length;
        // `room <= 0` means the newest message alone already fills the budget; it is
        // the one that must survive, and it is admitted only at or below the limit.
        return room <= 0 ? newer : `${older.slice(0, room)}…\n${newer}`;
    };
    /**
     * Ask the split question, keeping a previous one that is still unanswered.
     *
     * The same rule the front desk follows (B04): if a question set by an earlier
     * batch is still live — that batch was refused before it could consume the entry,
     * so the answer never came — the request it asked about is carried into the new
     * entry instead of being overwritten. An approval that finally arrives then
     * dispatches both, which is what the user meant by confirming a question that
     * covered both. Never overwrites a request with a shorter one, never resurrects an
     * expired entry: the caller only reaches here with a fresh question.
     *
     * @param agentId - session the question belongs to.
     * @param request - request this question asks about.
     * @param lang - language to word the answer in.
     */
    const askCaptain = (agentId, request, lang, preview) => {
        const previous = pendingCaptains.get(agentId);
        pendingCaptains.set(agentId, {
            request: previous === undefined ? request : carriedPendingRequest(previous.request, request),
            lang,
            askedAt: Date.now(),
            // Only the split this question asked about is bound to the approval. A carried
            // earlier request keeps its own words (nothing is lost by binding one split),
            // and the preview shown to the user is the one thing they actually agreed to.
            preview,
        });
    };
    /**
     * The request a worker is given after a confirmation answer, inside the budget (B08).
     *
     * {@link resumedRequest} quotes the original request verbatim and appends the
     * confirmation wording, so a request at (or near) the objective limit composed
     * one line over it: {@link composeObjective} then refused the run outright —
     * "longer than the 32000-character workflow objective limit" — after the pending
     * entry had already been consumed, which lost the task instead of running it.
     * The quote of the original request is cut to fit and the cut is marked; the
     * confirmation sentence itself is never dropped.
     *
     * @param verdict - the tier the answer selected (its language picks the wording).
     * @param originalRequest - the request the front-desk question was about.
     * @param answer - the user's confirmation message.
     * @returns the resumed request, never longer than `TASK_LIMITS.objectiveChars`.
     */
    const resumedTarget = (verdict, originalRequest, answer) => {
        const limit = TASK_LIMITS.objectiveChars;
        const composed = resumedRequest(verdict, originalRequest, answer);
        if (composed.length <= limit)
            return composed;
        const marker = '…';
        // Measure the fixed wording of *this* verdict and confirmation, then give the
        // quote of the original request what is left.
        const room = limit - resumedRequest(verdict, '', answer).length - marker.length;
        if (room >= 0)
            return resumedRequest(verdict, `${originalRequest.slice(0, room)}${marker}`, answer);
        // The confirmation message alone fills the budget (a padded message at the
        // limit): cut the quoted answer too, keeping the choice sentence intact.
        const answerRoom = Math.max(0, limit - resumedRequest(verdict, marker, '').length - marker.length);
        return resumedRequest(verdict, marker, `${answer.slice(0, answerRoom)}${marker}`);
    };
    /**
     * The front desk the `full` shape does not have (escape hatch).
     *
     * `full` means "every message gets the whole workflow", and the gate honoured that
     * literally: a greeting paid for a planner, a worker and a verifier, and the user
     * read a receipt instead of an answer. This helper makes one decision the shape is
     * allowed to make — should this message run at all? — and returns `undefined` for
     * "yes, run it", so the caller's existing path stays the one that runs.
     *
     * - `chat` — the template answers; no run.
     * - `fast` — one `quick-worker` call answers; no workflow run, and a failed call
     *   is stated as a notice instead of being upgraded into the team.
     * - `team` — only where a later turn exists to read the confirmation: the captain
     *   states its split and nothing runs until the user agrees.
     *
     * Only the session record (`/grok on`) takes this path. A deployment-level
     * `mode: 'full'` is the documented contract "every message runs", with no `/grok on`
     * to switch it off and the gate tests pinned to it: it stays byte for byte, and so
     * does an agent with no later turn, where the split question would swallow the task
     * nobody is left to answer.
     *
     * The caller that already consumed the captain's pending confirmation must not ask
     * again: this helper never reads that map, and `captainConsumed` short-circuits it.
     *
     * @param agent - owning agent (session record, background delivery, engine route).
     * @param request - the user original.
     * @param history - bounded history snapshot; `undefined` reads it here.
     * @param signal - the step's cancellation signal.
     * @param captainConsumed - the caller already took the captain's pending answer.
     * @returns the whole answer, or `undefined` when the existing path owns the message.
     */
    const fullFrontDeskEscape = async (agent, request, history, signal, captainConsumed = false) => {
        try {
            if (captainConsumed)
                return undefined;
            const limits = safe();
            // The session record is the whole condition: `/grok on` writes
            // `workflowMode: 'full'`, and that record only exists where the user asked for
            // the shape by hand. `limits.mode` — the deployment default — deliberately does
            // not reach here: "every message runs" is that shape's contract, and it is not
            // the shape this escape is for.
            if (readModeRecord(agent.session)?.workflowMode !== 'full')
                return undefined;
            const snapshot = history
                ?? collectHistory(sessionOf(agent), { turns: FIXED_HISTORY_TURNS, chars: FIXED_HISTORY_CHARS });
            const tier = classifyTriage({
                text: request,
                mode: 'full',
                escape: true,
                ask: false,
                pending: false,
                historyNonEmpty: snapshot.trim() !== '',
                followupAsFast: FIXED_TRIAGE_FOLLOWUP_AS_FAST,
            });
            if (tier.tier === 'chat') {
                // No tier line: `full` never showed one, and the escape does not add it.
                return {
                    kind: 'direct',
                    text: [chatReply(tier, request), '', tierNote(tier)].filter(line => line !== '').join('\n'),
                    outcome: 'full-escape-chat',
                };
            }
            if (tier.tier === 'fast') {
                const call = await runSingleCall({
                    ctx, config: limits, state, logger, agent,
                    prompt: singleCallPrompt(tier, request, false, firstAnswerContext(sessionOf(agent), snapshot)),
                    label: 'quick-worker',
                    ...signal === undefined ? {} : { signals: [signal] },
                });
                if (!call.ok) {
                    // State the failure; the tier's promise is one call, so a failure may not
                    // become the ten-minute team run the user did not ask for.
                    return {
                        kind: 'notice',
                        reason: `this looked like a single question, so one quick worker was asked: the quick tier could not answer: ${call.reason}`,
                        outcome: 'full-escape-failed',
                    };
                }
                return {
                    kind: 'direct',
                    text: [call.text, '', tierNote(tier)].filter(line => line !== '').join('\n'),
                    outcome: 'full-escape-fast',
                };
            }
            // `team`: the run is what this message really wants, but on `/grok on` the split
            // is stated first — the promise the shape made is the workflow, not a plan the
            // user never saw. Without a later turn there is nobody to read the confirmation,
            // so that agent keeps its run.
            if (!canBackgroundDeliver(agent))
                return undefined;
            const preview = await runSingleCall({
                ctx, config: limits, state, logger, agent,
                prompt: captainPreviewPrompt(request),
                label: 'captain-preview',
                ...signal === undefined ? {} : { signals: [signal] },
            });
            const previewText = preview.ok ? sanitizeFirstAnswer(preview.text) : '';
            askCaptain(agentIdOf(agent), request, tier.lang, previewText);
            return {
                kind: 'direct',
                text: captainAskText(tier.lang, previewText === '' ? captainPreviewFallback(tier.lang) : previewText),
                outcome: preview.ok ? 'full-escape-ask' : 'full-escape-ask-fallback',
            };
        }
        catch (error) {
            logger.warn(`the full-shape front desk declined, keeping the full path: ${redactError(error)}`);
            return undefined;
        }
    };
    /**
     * Run the workflow for one admitted batch and produce its answer.
     *
     * Composes the objective here, not at admission: a queued follow-up must see
     * the answer the previous run just delivered, so history is read as late as
     * possible. `history` overrides that read for `in-turn`, which publishes the
     * batch first and must not see it as prior conversation (P0-5). Never throws —
     * a run that cannot start becomes a notice.
     */
    const produceAnswer = async (agent, request, signal, history, captainPending) => {
        const limits = safe();
        // A session-level `/grok` record selects the workflow shape explicitly; the
        // deployment's `mode` only decides what a config-level default does. Without
        // this, `/grok` would promise the full workflow while the front desk quietly
        // answered from a template (t59 finding).
        const sessionShape = readModeRecord(agent.session)?.workflowMode;
        const effectiveMode = sessionShape ?? limits.mode;
        // The front desk the `/grok on` shape did not have (escape hatch): a greeting
        // answers from a template and a single fact costs one quick worker, instead of
        // every message paying for plan, execution and verification. The condition is the
        // session record alone — a deployment-level `mode: 'full'` keeps its own contract
        // ("the run happens inside the turn") byte for byte. `captainPending` means the
        // caller already consumed a confirmation for this message: that one is an answer
        // to a question, not a message to classify, and the `full` branch below dispatches
        // it; the escape must not ask a second question about it.
        if (sessionShape === 'full' && captainPending === undefined) {
            const escaped = await fullFrontDeskEscape(agent, request, history, signal);
            if (escaped !== undefined)
                return escaped;
        }
        // Front desk (t52, plan C): the tier is decided per message, before any run
        // starts, and the decision is part of the answer text. `full` keeps the
        // pre-t52 behaviour byte for byte: no tier line, no greeting, no cheap call.
        if (effectiveMode !== 'full') {
            const agentId = agentIdOf(agent);
            // Captain confirmation (round-071): the answer to the captain's split
            // question is consumed before the front desk classifies it, because "确认" is
            // not a message to route — it is the answer that dispatches the plan it named.
            // Same consumption rule as the front-desk question below: one message, one
            // answer, and a non-answer voids it instead of guessing. `captainPending` is
            // the value the caller already consumed (round-072): re-reading the map here
            // was the second consumer of one entry.
            let captainNote = '';
            if (captainPending !== undefined) {
                if (captainPending.kind === 'expired') {
                    captainNote = captainVoidNote(captainPending.ask.lang, true);
                }
                else {
                    const meaning = captainAnswer(request);
                    if (meaning === 'approve' || meaning === 'amend') {
                        const forRun = meaning === 'amend'
                            ? amendRequest(captainPending.ask.request, request)
                            : approvedRequest(captainPending.ask.request, captainPending.ask.preview);
                        const dispatched = await runTeam(agent, forRun, signal, history, captainPending.ask.lang);
                        // The approval a user just gave is part of the answer: a report that
                        // silently appeared would leave them wondering whether it used the
                        // split they confirmed.
                        return dispatched.kind === 'report'
                            ? { ...dispatched, header: captainApproveNote(captainPending.ask.lang) }
                            : dispatched;
                    }
                    captainNote = captainVoidNote(captainPending.ask.lang, false);
                }
            }
            // Consumed before classification: at most one message answers a question,
            // and an expired entry has to be stated rather than silently reused (P0-2).
            const pending = takePending(agentId);
            const live = pending?.kind === 'live' ? pending.ask : undefined;
            // History-aware follow-up: reuse the in-turn snapshot when present; only
            // the relay/append path (history === undefined) reads it here.
            const histForTriage = history ?? collectHistory(sessionOf(agent), { turns: FIXED_HISTORY_TURNS, chars: FIXED_HISTORY_CHARS });
            const historyNonEmpty = histForTriage.trim() !== '';
            const tier0 = classifyTriage({
                text: request,
                mode: effectiveMode,
                ask: FIXED_TRIAGE_ASK,
                pending: live !== undefined,
                historyNonEmpty,
                followupAsFast: FIXED_TRIAGE_FOLLOWUP_AS_FAST,
            });
            // T4: classifier is always `rules` (hybrid model-call fallback removed).
            let tier = tier0;
            // Look it up before asking (v0.5, `history_first_no_reask`).
            //
            // The failing session asked the user to repeat research results the
            // conversation already held. So the last step before a clarification
            // question goes out is a read: the conversation so far, the validated
            // reports of earlier rounds, and the memory files already on disk. A hit
            // re-decides the tier (still deterministic, still rules) and the material
            // answers; a miss leaves the question untouched and adds one line naming
            // what is missing. No source at all (a brand-new session) changes nothing,
            // so the first message of a fresh conversation is byte-identical.
            let recalled;
            let missing;
            if (tier.tier === 'ask') {
                const roots = deps.memoryDocRoots ?? memoryDocRoots();
                const sources = collectRecallSources(sessionOf(agent), roots, request);
                const lookup = recallFromPrior({ text: request, sources });
                if (lookup.kind === 'hit') {
                    recalled = lookup;
                    tier = classifyTriage({
                        text: request,
                        mode: effectiveMode,
                        ask: FIXED_TRIAGE_ASK,
                        pending: live !== undefined,
                        historyNonEmpty,
                        followupAsFast: FIXED_TRIAGE_FOLLOWUP_AS_FAST,
                        prior: lookup,
                    });
                }
                else if (sources.some(source => source.kind === 'history')) {
                    // A session where the user has already said something: the question says
                    // where the look-up went and what is missing. A session where nothing has
                    // been said yet keeps the pre-existing question byte for byte — there is no
                    // earlier wording to point at, so the original sentence is already honest.
                    missing = lookup;
                }
            }
            // A confirmation question that is gone must be visible: the front desk may
            // not guess what the user meant, and the user must know why nothing ran.
            const expired = pending?.kind === 'expired' ? expiredAskNote(tier.lang) : '';
            // A live question the user did not answer (they changed subject instead) is
            // void as well, and saying so is cheaper than a wrong guess.
            const unused = live !== undefined && resolvePending(request) === undefined && tier.reason !== 'pending-fast' && tier.reason !== 'pending-team'
                ? unusedAskNote(tier.lang)
                : '';
            const notes = [captainNote, expired, unused].filter(entry => entry !== '');
            const lead = notes.length === 0 ? [] : [notes.join(' '), ''];
            // The request a worker is given: the user's words, resumed against the
            // request the question was about (P0-2). Without this the quick tier would
            // be handed "简单" and nothing else. Bounded by the objective limit, because
            // the resumed text is what the run is composed from (B08).
            const target = live === undefined || (tier.reason !== 'pending-fast' && tier.reason !== 'pending-team')
                ? request
                : resumedTarget(tier, live.originalRequest, request);
            if (tier.tier === 'ask') {
                // No run and no answer: the front desk asks, and the next message from
                // this session is read as the answer (takePending above). The question is
                // asked once, and it says where the look-up went and what is missing —
                // never "repeat what you said".
                pendingAsks.set(agentId, {
                    // A question that replaces an unanswered one keeps both requests (B04):
                    // the answer that finally arrives is the answer to both.
                    originalRequest: live === undefined ? request : carriedPendingRequest(live.originalRequest, request),
                    askedAt: Date.now(),
                });
                return {
                    kind: 'direct',
                    text: [...lead, triageLine(tier), '', askLine(tier.lang), ...missing === undefined ? [] : [missingNote(tier.lang, missing)]].join('\n'),
                    outcome: 'triaged-ask',
                };
            }
            if (tier.tier === 'chat') {
                // Instant by construction: a template, not a call (see chatReply).
                return {
                    kind: 'direct',
                    text: [...lead, triageLine(tier), '', chatReply(tier, request), '', tierNote(tier)].join('\n'),
                    outcome: 'triaged-chat',
                };
            }
            if (tier.tier === 'fast') {
                // Fast-path context (v0.5.1): a follow-up like "用人话告诉我刚才…" is
                // classified from history but the single worker used to receive only the
                // bare request — so it answered blind ("I am a single turn, I cannot
                // see the research above"). Hand it the same bounded conversation /
                // digest the recall pass already read: empty on a first message (prompt
                // stays byte-identical), bounded and redacted otherwise.
                const fastContext = recalled !== undefined
                    ? [recalled.excerpt, `(${recalled.locators.join(' | ')})`].filter(part => part !== '').join('\n')
                    : [histForTriage, carryoverForSession(sessionOf(agent), { rounds: FIXED_HISTORY_TURNS, chars: FIXED_HISTORY_CHARS }).digest]
                        .map(part => part.trim()).filter(part => part !== '').join('\n\n').slice(0, 4000);
                const call = await runSingleCall({
                    ctx, config: limits, state, logger, agent,
                    prompt: recalled === undefined ? singleCallPrompt(tier, target, false, fastContext) : recallPrompt(tier, target, recalled),
                    label: 'quick-worker',
                    ...signal === undefined ? {} : { signals: [signal] },
                });
                if (!call.ok) {
                    // State the failure; never upgrade a "quick" answer into a team run,
                    // which would make the tier line a lie.
                    return {
                        kind: 'notice',
                        reason: `${triageLine(tier)} — the ${tier.tier} tier could not answer: ${call.reason}`,
                        outcome: 'front-desk-failed',
                    };
                }
                return {
                    kind: 'direct',
                    text: [
                        ...lead, triageLine(tier), '', call.text, '',
                        ...recalled === undefined ? [] : [recalledNote(tier.lang, recalled)],
                        tierNote(tier),
                    ].join('\n'),
                    outcome: recalled === undefined ? 'triaged-fast' : 'triaged-recalled',
                };
            }
            // Captain confirmation (round-071): before the team dispatches, the captain
            // states the split it intends to use and the user gets one round to approve or
            // change it. This is the one place the front desk "退居分流": routing decided
            // the cost, the captain now owns the shape of the work.
            //
            // Two paths skip the round on purpose: a session that forced the full shape
            // (`/grok` promised the whole workflow, including its own planning), and a
            // message that just answered the front desk's "quick or team?" question —
            // asking a second question immediately would be two questions for one
            // intention.
            if (sessionShape !== 'full' && tier.reason !== 'pending-team') {
                const preview = await runSingleCall({
                    ctx, config: limits, state, logger, agent,
                    prompt: captainPreviewPrompt(target),
                    label: 'captain-preview',
                    ...signal === undefined ? {} : { signals: [signal] },
                });
                const previewText = preview.ok ? sanitizeFirstAnswer(preview.text) : '';
                askCaptain(agentId, target, tier.lang, previewText);
                return {
                    kind: 'direct',
                    text: [
                        ...lead,
                        triageLine(tier),
                        '',
                        captainAskText(tier.lang, previewText === '' ? captainPreviewFallback(tier.lang) : previewText),
                    ].join('\n'),
                    outcome: preview.ok ? 'triaged-captain-confirm' : 'triaged-captain-confirm-fallback',
                };
            }
            // Team tier, in-turn fallback: live receipt first so the run never looks
            // blank while in flight (pure addition; a failed append only costs the
            // receipt, never the run). The receipt is the live first answer (C: 现场写),
            // never the fixed template sentence.
            //
            // The row may only be attached to an open step (`openStepOf`): DSH's token
            // meter pairs every `assistant/message` with a `step/start`, and one unpaired
            // row makes every later replay throw, which is what stalls compaction and
            // breaks `/compact` for the rest of the session. `agent/pre-step` is
            // dispatched *before* the step opens, so on this runtime the row is refused —
            // and the model call that composes its text is then paid for nothing. Both
            // are skipped together, and the run's live progress reaches the user through
            // the `tool-workflow/*` node instead (`src/records.ts`, progress records).
            const receiptSession = sessionOf(agent);
            if (FIXED_INSTANT_RECEIPT && receiptSession !== undefined && openStepOf(receiptSession) !== undefined) {
                const context = firstAnswerContext(receiptSession, histForTriage);
                const fallback = await produceFirstAnswer(agent, target, context, tier, async (prompt) => runSingleCall({
                    ctx, config: limits, state, logger, agent,
                    prompt, label: 'first-answer',
                }));
                const receipt = [...lead, triageLine(tier), fallback].filter(line => line !== '').join('\n');
                try {
                    appendInstantReceipt(receiptSession, receipt, logger);
                }
                catch {
                    // Receipt is best-effort by design.
                }
            }
            const answer = await runTeam(agent, target, signal, history, tier.lang);
            // The plain-language summary is no longer composed here: `relayText` calls
            // `renderHumanReport` for it, so this header carries only the front-desk
            // lines (tier, greeting, notes). Two composers printed the same conclusion
            // twice, and a status the header got wrong could not be corrected by the
            // body it sat above.
            const header = [...lead, triageLine(tier)].filter(line => line !== '').join('\n');
            return answer.kind === 'report' ? { ...answer, header, lang: tier.lang } : answer;
        }
        // `full` has no front desk, so the split question would never be read here —
        // and the word that answered it ("确认") became the objective of a whole run
        // while the plan it named was dropped (round-072). The confirmation decides the
        // objective of this one run: an approval or an edit dispatches what it named, an
        // expired or unrelated message is void (stated, never guessed), and a bare
        // confirmation with nothing live to confirm is answered instead of run.
        if (captainPending !== undefined) {
            const ask = captainPending.ask;
            const meaning = captainAnswer(request);
            if (captainPending.kind === 'live' && (meaning === 'approve' || meaning === 'amend')) {
                const forRun = meaning === 'amend'
                    ? amendRequest(ask.request, request)
                    : approvedRequest(ask.request, ask.preview);
                const dispatched = await runTeam(agent, forRun, signal, history, ask.lang);
                return dispatched.kind === 'report'
                    ? { ...dispatched, header: captainApproveNote(ask.lang) }
                    : dispatched;
            }
            const note = captainVoidNote(ask.lang, captainPending.kind === 'expired');
            if (meaning !== 'other')
                return { kind: 'direct', text: note, outcome: 'captain-confirm-void' };
            // A message that is not an answer is routed on its own; the note above it says
            // why the confirmation it interrupted is void.
            const routed = await runTeam(agent, request, signal, history);
            return routed.kind === 'report' ? { ...routed, header: note } : routed;
        }
        return runTeam(agent, request, signal, history);
    };
    /**
     * The team tier: the pre-t52 workflow run, unchanged.
     *
     * Kept as its own function so the triage path above cannot accidentally change
     * what a full run does: it composes the objective as late as possible and turns
     * every failure into a report.
     */
    const runTeam = async (agent, request, signal, history, lang, steeringToken) => {
        // P0-5: `in-turn` publishes the claimed message before the run, so the caller
        // snapshots the history first and passes it here — otherwise the message the
        // user just typed would also appear as "conversation so far" and the objective
        // would carry it twice.
        // L1 inheritance (Q2, v0.13): the tasks an earlier round of this session already
        // verified are part of the objective itself, under their own 8K budget
        // (`INHERITANCE_LIMITS.chars`), so every child prompt that shows the objective —
        // planner, verifier, supervisor, synthesizer — reads the same "do not redo this"
        // decision instead of re-deriving it. `composeObjective` drops the oldest block
        // first when the objective budget is tight, so the inherited list survives a
        // long forwarded transcript.
        const objective = composeObjective(history ?? collectHistory(sessionOf(agent), { turns: FIXED_HISTORY_TURNS, chars: FIXED_HISTORY_CHARS }), request, TASK_LIMITS.objectiveChars, inheritanceForSession(sessionOf(agent)));
        if (objective === undefined) {
            // Reached only after a message passed admission (a queued follow-up re-reads
            // the history late, which can push the composed objective over the budget).
            // Same refusal as the admission path, so the reader gets one rule, one
            // count and one next step in both languages.
            return {
                kind: 'notice',
                reason: refuseOversizePrompt(request.length).text,
                outcome: 'objective-too-long',
            };
        }
        let outcome;
        // The captain reads its three sheets before planning (round-071). Best-effort
        // by construction: `readCaptainMemory` never throws, so an unreadable directory
        // costs the brief, never the run.
        let brief = '';
        try {
            const readBrief = deps.captainBrief ?? (() => captainBrief(readCaptainMemory()));
            brief = readBrief();
        }
        catch {
            brief = '';
        }
        // Cross-round carry-over (v0.5). Every child agent of this round is fresh, so
        // the earlier rounds of this session are compiled into one bounded digest and
        // handed to the run: a follow-up is then answered from the earlier research
        // instead of asking the user to repeat what they already said. The digest is
        // read from the durable transcript (the validated reports this plugin wrote),
        // shares the configured history budget, and is empty on a first round.
        const carryover = carryoverForSession(sessionOf(agent), carryoverBounds({ historyTurns: FIXED_HISTORY_TURNS, historyChars: FIXED_HISTORY_CHARS }));
        if (carryover.digest !== '') {
            logger.info?.(`grok-workflow carry-over: ${carryover.rounds} earlier round(s), ${carryover.digest.length} chars`);
        }
        try {
            // The gate owns the user-visible answer, so failures become reports here;
            // only conditions that prevent starting at all reach the catch below.
            outcome = await runWorkflow({
                ctx, config: safe(), state, logger, agent, objective, failureMode: 'report',
                ...carryover.digest === '' ? {} : { carryover: carryover.digest },
                ...signal === undefined ? {} : { signals: [signal] },
                // Mid-run replan (L2): the run token a boundary planner child quotes when it
                // pulls the demands queued while this round works. Omitted unless the channel
                // opened one, so a round with no channel stays byte-identical to before.
                ...steeringToken === undefined ? {} : { steeringToken },
                // The captain's three sheets, omitted when nothing is remembered so a first
                // round stays byte-identical to the pre-memory payload.
                ...brief === '' ? {} : { captainBrief: brief },
            });
        }
        catch (error) {
            // Busy instance, unloaded plugin or an unbuildable request: state it, do not bypass.
            const reason = redactError(error);
            logger.warn(`gate could not start the workflow: ${reason}`);
            return { kind: 'notice', reason, outcome: 'start-failed' };
        }
        // B plan: `full` mode gets the same human block the front desk does —
        // `relayText` composes it from the report, so this path cannot hand the user
        // the machine ledger and nothing else (the user's own words for that were
        // "全是机器语言"). The language comes from the caller when a triage verdict
        // already measured it, and from the request otherwise.
        return {
            kind: 'report',
            report: outcome.report,
            outcome: outcome.ok ? outcome.report.status : (outcome.cause ?? 'failed'),
            lang: lang ?? detectLanguage(request),
        };
    };
    /**
     * User-visible text for one answer under one strategy.
     *
     * The `showDiagnostics` switch has to be passed here too: it was only wired into
     * the PTC `render` tool, so turning it on in the settings changed nothing about
     * the result the user actually receives. Default off, exactly as before — and
     * `humanSummary` rides along, because the plain-language block is composed
     * inside `relayText` and an opt-out has to reach it.
     */
    const answerText = (answer, inTurn) => {
        if (answer.kind === 'report') {
            return relayText(answer.report, answer.header, {
                ...answer.lang === undefined ? {} : { lang: answer.lang },
                // Q11(c): the switch that decides whether the machine ledger rides inside
                // the relay or stays folded below it. Fixed off (T4), but consulted here —
                // this is the one place that composes the text the user actually receives.
                showDiagnostics: FIXED_SHOW_DIAGNOSTICS,
            });
        }
        if (answer.kind === 'direct')
            return frontDeskText(answer.text);
        return inTurn ? noticeEnterText(answer.reason) : noticeText(answer.reason);
    };
    /**
     * Deliver one answer in a later turn and record the outcome; never throws.
     *
     * Only a real workflow report may mark the batch `delivered`: a notice means no
     * run happened, so the batch must stay routable (phase `failed`).
     */
    const deliverAndRecord = async (agent, entry, answer) => {
        const text = answerText(answer, false);
        // T4: only `in-turn` survives (`relay`/`append` removed): the turn that
        // admitted the batch also delivers it, via the plugin's own source message.
        const delivered = await deliverRelay(agent, text);
        // A `report` and a front-desk answer both settle the batch: the user has the
        // answer. Only a notice leaves it routable, because nothing was produced.
        if ((answer.kind === 'report' || answer.kind === 'direct') && delivered) {
            record(agent, entry, 'delivered', answer.outcome);
            return;
        }
        record(agent, entry, 'failed', delivered ? answer.outcome : 'delivery-failed');
        if (!delivered)
            logger.warn(`gate could not deliver the workflow answer for ${entry.key}`);
    };
    /**
     * Write a claimed user message into the transcript (P0-1, P0-5).
     *
     * Two situations need this plugin as the writer:
     * - `relay` and `append` answer in a later turn, so they must return `reject`:
     *   the claimed batch is then never committed by the loop and the user's own
     *   words would disappear from the transcript.
     * - `in-turn` keeps the step open for the whole workflow, and the loop commits a
     *   claimed batch only when the step begins (`AgentLoop.step()`). Publishing
     *   before the wait is what makes the first message visible while the team runs;
     *   otherwise the transcript holds no `user/message` for the entire run (P0-5).
     *
     * The two writers must never touch the same message: `in-turn` excludes the
     * published batch from `enter.messages` (`withoutClaimed`), `relay`/`append`
     * reject the step. The message object is written unchanged — same id, same
     * source, same text and attachments — because a re-created "looks the same"
     * message would lose its identity and could be routed a second time.
     *
     * Surface-head rule: the session's first surface event must be the host's
     * `system/message` (DSH `relationships.ts`: any `system/message` that arrives
     * after a non-empty surface without an established protected head throws
     * `SessionFormatError`, and the stored log can never be reopened afterwards
     * — this is the `stored session … is corrupt: system/message requires a
     * protected first surface head` failure). The loop writes that head inside
     * `step()` — strictly *after* this pre-step listener runs — so appending a
     * claimed batch while the surface is still empty lands `user/message` at
     * surface position 0 on a fresh session and corrupts it permanently. Once
     * the head exists (any later step — the surface fold is monotonic and
     * survives `turn/end`), appending ahead of the next `system/message` is
     * safe: that message either appends to a protected surface or rewrites node
     * 0 through the exact `[head, head]` replace the validator allows. The gate
     * therefore publishes only when the session either already surfaces at
     * least one node (`session.surface.nodes`, the live view the host maintains
     * on the session in DSH ≥ 0.2.1) or is past the first turn (where turn 1 must
     * have committed a head through the loop); otherwise it leaves the write to
     * the loop's own commit of `enter.messages` (the `surfaced=false` decision
     * path carries the batch, so no words are lost — only the mid-run early
     * echo is deferred to the entered step).
     *
     * @returns true when the message is in the session surface.
     */
    const commitClaimed = (agent, claimed, turn) => {
        const session = sessionOf(agent);
        if (session === undefined || claimed.length === 0)
            return false;
        try {
            // No surface yet on turn 1 means the host head is not established (fresh
            // or restored session before its first step): writing now would poison
            // position 0 and corrupt the stored log. Returning false routes the batch
            // through `enter.messages`, which the loop commits after the head.
            if (!surfaceHasHead(session, turn))
                return false;
            for (const message of claimed)
                session.append('user/message', message, { surfaceOp: 'append' });
            return true;
        }
        catch (error) {
            // A session that refuses the write still gets the answer: losing the echo of
            // the question is bad, losing the answer as well would be worse.
            logger.warn(`gate could not keep the user message in the transcript: ${redactError(error)}`);
            return false;
        }
    };
    /**
     * True when publishing a claimed batch cannot take surface position 0.
     *
     * Read-only: reads the live surface view the host maintains on the session
     * (`session.surface.nodes`, present in DSH ≥ 0.2.1). A test or runtime double
     * without that accessor falls through to the turn rule: only turn 1 on an
     * empty surface suppresses the publish, which is exactly the corrupting case
     * (turn 2+ implies turn 1 already committed the head through the loop, and
     * the surface fold is monotonic across `turn/end`). Any read failure is a
     * closed gate: `false` keeps the batch on the `enter.messages` path, which
     * the loop commits safely.
     *
     * @param session - session whose surface is inspected.
     * @param turn - the claiming turn (payload.turn); turn 1 may be the head.
     * @returns true when an append cannot poison position 0.
     */
    function surfaceHasHead(session, turn) {
        try {
            if (session.surface.nodes.length > 0)
                return true;
        }
        catch {
            // No live surface on this double: fall through to the turn rule below.
        }
        return typeof turn === 'number' && turn > 1;
    }
    /**
     * True only when the live surface is readable *and* still empty.
     *
     * Stricter than `!surfaceHasHead`: a session whose surface cannot be read (an old
     * runtime, a test double) answers `false`, so the caller keeps the path that was
     * already proven safe instead of guessing. An empty readable surface is the one
     * case where the host head is certainly not written yet — publishing a claimed
     * batch there would take surface position 0 and brick the stored log (0.13.14).
     *
     * @param session - session whose surface is inspected.
     * @returns true when the surface is readable and holds no node.
     */
    function surfaceHasNoHead(session) {
        if (session === undefined)
            return false;
        try {
            return session.surface.nodes.length === 0;
        }
        catch {
            return false;
        }
    }
    /**
     * State a cancelled turn's terminal and keep what the user wrote (P0-1 + P0-4).
     *
     * A cancelled turn cannot be answered inside itself — the step is already gone,
     * so the decision has to be `reject`. That made cancellation lose the batch twice
     * over, which a real GUI session shows plainly: the message the user typed never
     * became a `user/message` event, and the stopped run left no reason in the
     * transcript. Because the step is rejected here, this plugin is the only writer,
     * so committing the claimed message cannot duplicate it: the original message
     * object is appended unchanged, then one assistant message carries the terminal.
     *
     * @param agent - Agent whose transcript keeps the batch.
     * @param payload - Rejected step whose batch is being committed.
     * @param text - User-visible terminal text; never a success sentence.
     * @param alreadySurfaced - The batch is already in the surface (P0-5 `in-turn`
     *   publishes it before the wait), so it must not be written a second time.
     * @returns true when the batch reached the session surface.
     */
    const commitCancelled = (agent, payload, text, alreadySurfaced = false) => {
        // A cancelled turn never enters a step, so the loop will never commit the
        // batch: the plugin must write it here or the user's words vanish — but a
        // headless turn-1 write takes surface position 0, and if the session later
        // continues (turn 2 with a system head), the reopen replay throws
        // `system/message requires a protected first surface head` and bricks the
        // session (measured: cancel-then-continue replays exactly this way). So a
        // cancelled batch is appended ONLY onto an established surface (turn 2+,
        // or a session that already surfaces a node); on a headless turn 1 the
        // words are NOT appended — the terminal record states the reason, and the
        // delivery record keeps the batch routable for the retry.
        const owner = sessionOf(agent);
        const kept = alreadySurfaced
            ? true
            : owner !== undefined && surfaceHasHead(owner, payload.turn)
                ? commitClaimed(agent, payload.messages)
                : false;
        const session = sessionOf(agent);
        if (session === undefined)
            return kept;
        const options = agent.options ?? {};
        // `payload.step` is the step this pre-step *refused*, so it never opens: the
        // terminal cannot be attached to it without leaving an `assistant/message`
        // outside every `step/start`, which the token meter replays as a hard error and
        // which then stalls compaction and `/compact` for the rest of the session
        // (`openStepOf` in src/records.ts). The row is written only if some step is
        // open; otherwise the terminal survives as a durable record, so the reason and
        // any verified partial work are still readable from the session log.
        const written = appendAssistantInStep(session, text, {
            provider: options.provider ?? 'grok-workflow',
            model: options.model ?? 'workflow-report',
        }, logger, 'cancelled terminal');
        if (!written)
            recordTerminal(session, text, logger);
        return kept;
    };
    /**
     * Stop every live workflow run of one session (the one channel action that stops work).
     *
     * Only an explicit stop reaches here: `classifyChannelMessage` returns `stop` for a
     * bare "停" / "stop" / "取消" and nothing else, because cancelling costs the user
     * everything that was in flight. The cancel goes through the run's own
     * `cancel(reason)`, so the settlement is the ordinary one (`keepCancelledWork()`):
     * verified work is kept, unfinished tasks are marked, and the cancellation report
     * lands in this conversation rather than a silent gap.
     *
     * A cancel that throws is reported, never swallowed: the run may still be live, and
     * the next message would otherwise join a plan nobody is executing.
     *
     * @param sessionId - session/agent key the runs are registered under.
     * @returns how many live runs were asked to stop.
     */
    const cancelLiveRuns = async (sessionId) => {
        const live = [];
        for (const [run, info] of state.active) {
            if (info.sessionId !== sessionId)
                continue;
            live.push({ runId: String(info.runId), cancel: reason => run.cancel(reason) });
        }
        for (const target of live) {
            try {
                await target.cancel(STEER_CANCEL_REASON);
            }
            catch (error) {
                logger.warn(`steering could not cancel ${target.runId}: ${redactError(error)}`);
            }
        }
        return live.length;
    };
    /**
     * Answer one message on the main-session channel, or decline it.
     *
     * This is the whole of the session-side behaviour the user asked for, in one
     * place, so it cannot drift between the triage and `full` admissions:
     *
     * - a **bare stop** while this session has a run working cancels that run (the
     *   only message that may) and states the terminal; the same word with nothing
     *   running is answered instead of being admitted as a task;
     * - anything else, while a run is working, joins that run's plan through
     *   `src/steering.ts` — with the conversation snapshot attached — and gets an
     *   immediate receipt naming the merge point and how to stop. Nothing already
     *   running is interrupted, and the decision returns before the run settles, so
     *   the main session never waits for a workflow.
     *
     * A run that never opened a channel (a tool call, `replan` off, or no live run)
     * declines here and the caller takes its pre-existing path.
     *
     * @param agent - agent the batch belongs to.
     * @param verdict - the admitted classification (its request is what was typed).
     * @param entry - delivery entry the decision is recorded against.
     * @param base - messages the step will enter.
     * @param history - conversation snapshot taken before this batch was published.
     * @param opts - the admission's own `enterAfter` (so the answer is entered the
     *   same way the blocking path enters one).
     * @returns the decision when the channel answered, `undefined` when it declines.
     */
    const answerOnChannel = async (agent, verdict, entry, base, history, opts) => {
        const lang = detectLanguage(verdict.request);
        const queue = steeringForSession(verdict.agentId);
        const intent = classifyChannelMessage(verdict.request);
        if (queue === undefined) {
            // Nothing was running (or nothing opened a channel). A bare stop must still
            // not be admitted: the word "停" would spend a planner, a worker and a
            // verifier on itself. Every other message takes the normal path.
            if (intent.kind !== 'stop')
                return undefined;
            record(agent, entry, 'delivered', CHANNEL_OUTCOMES.idleStop);
            return opts.enterAfter(base, idleStopNote(lang), opts.surfaced);
        }
        // A channel exists, so a run of this session is working. Without a later turn
        // there is nowhere to deliver the receipt or the report — keep the blocking path.
        if (!canBackgroundDeliver(agent))
            return undefined;
        // A split confirmation is not a demand for the live plan: it can only be
        // answered by dispatching the plan it names, and joining the live plan instead
        // would both lose the confirmation and spend a run on the word "确认"
        // (round-072). The channel steps aside so the normal path consumes it.
        if (opts.captainPending !== undefined && captainAnswer(verdict.request) !== 'other')
            return undefined;
        if (intent.kind === 'stop') {
            await cancelLiveRuns(verdict.agentId);
            record(agent, entry, 'delivered', CHANNEL_OUTCOMES.stop);
            return opts.enterAfter(base, stopNote(lang), opts.surfaced);
        }
        const pushed = queue.push(composeIntentText(firstAnswerContext(sessionOf(agent), history), verdict.request, STEERING_LIMITS.intentChars));
        if (!pushed)
            return undefined;
        record(agent, entry, 'delivered', CHANNEL_OUTCOMES.steered);
        return opts.enterAfter(base, steerReceipt(lang, queue.size), opts.surfaced);
    };
    /**
     * Run one admitted round with the mid-run channel open for exactly its lifetime.
     *
     * Opening the channel here (not inside `runWorkflow`) is what keeps the channel
     * honest: the run's own early returns cannot leak a queue that would then swallow
     * the next message, and the `finally` below sees every outcome — a report, a
     * kept cancellation, a deadline, an engine error.
     *
     * Two things happen at the end, and both are required for "no wasted work":
     * - the run's verification report is delivered into this conversation
     *   (`deliverAndRecord`), so progress and conclusion appear where the user is;
     * - a demand still queued when the run settles opens the next round from
     *   `previous objective + demand` (`composeCarriedRequest`), because the run's end
     *   is not a decision about the user's message and dropping it would be the
     *   silent loss the channel exists to prevent.
     *
     * @param agent - agent that owns the round.
     * @param entry - delivery entry the round's answer is recorded against.
     * @param request - the request this round runs (already composed).
     * @param lang - language of the user's message.
     * @param history - conversation snapshot taken *before* the batch was published.
     */
    const runChannelRound = async (agent, entry, request, lang, history) => {
        let steering;
        try {
            steering = safe().replan ? openSteering(entry.agentId) : undefined;
        }
        catch (error) {
            // A channel that cannot open must not cost the round: it runs unsteered.
            logger.warn(`steering channel could not open for ${entry.key}: ${redactError(error)}`);
            steering = undefined;
        }
        try {
            await deliverAndRecord(agent, entry, await runTeam(agent, request, undefined, history, lang, steering?.token));
        }
        finally {
            if (steering !== undefined) {
                // Consume before closing: a boundary planner that already pulled gets an
                // empty take, so a demand is either merged into the run or carried into the
                // next round — never both, never neither.
                const queue = steeringForSession(entry.agentId);
                const leftover = queue !== undefined && queue.token === steering.token
                    ? queue.take()
                    : { intents: [], dropped: 0 };
                closeSteering(steering.token);
                const carried = leftover.intents.map(intent => intent.text);
                if (carried.length > 0 && !state.disposed) {
                    try {
                        const next = composeCarriedRequest(request, carried, TASK_LIMITS.objectiveChars);
                        const accepted = enqueue(entry.agentId, async () => {
                            const lateHistory = collectHistory(sessionOf(agent), { turns: FIXED_HISTORY_TURNS, chars: FIXED_HISTORY_CHARS }, entry.messageIds);
                            await runChannelRound(agent, entry, next, lang, lateHistory);
                        });
                        if (accepted)
                            record(agent, entry, 'started', CHANNEL_OUTCOMES.carried);
                        else
                            logger.warn(`steering carried ${carried.length} demand(s) for ${entry.key} into a full queue`);
                    }
                    catch (error) {
                        logger.warn(`steering could not carry the late demand for ${entry.key}: ${redactError(error)}`);
                    }
                }
            }
        }
    };
    /**
     * Team tier on an interactive run (B: 边聊边干).
     *
     * triage-team + effectiveMode `triage` + background-deliverable agent: one
     * live first-answer call (label 'first-answer', `triageModel` route, history
     * snapshot taken before the first answer so the receipt cannot echo back as
     * history), entered into this turn (stepBase + withoutClaimed, P0-1/P0-5
     * semantics); the workflow is admitted behind it by reusing admitInBackground
     * (commitClaimed + enqueue + produceAnswer -> deliverAndRecord), whose
     * pre-step returns immediately with the first answer instead of awaiting the
     * workflow.
     *
     * Returns the `enter` decision with the first answer, or `undefined` when the
     * caller must keep the blocking path (full mode, one-shot/followup
     * unavailable, failed first answer with no downgrade, queue full): the
     * caller then falls back to answerInTurn's awaited run, which always produces
     * a final answer. Never throws: any internal failure is `undefined`
     * (fallback), never a lost answer.
     *
     * Cancellation / redirect reuse the existing machinery, no new bus: a new
     * message in the same session while a run is in flight cancels that run via
     * ActiveState.active/starting + run.cancel(reason) + dispose, then
     * commitCancelled + cancelledText lands the terminal; the narrowed rerun is
     * composed with carriedPendingRequest / resumedTarget (whole-round cancel +
     * narrow restart). V1 does no subtask-level directed cancel; alreadyRouted
     * stays the double-run guard; the per-agent enqueue path is reused as-is
     * (cancel/reject stays whole-queue: no task-level remove in V1).
     */
    const answerTeamInteractive = async (agent, admit, payload, base, history, opts) => {
        try {
            const limits = safe();
            const sessionShape = readModeRecord(agent.session)?.workflowMode;
            if ((sessionShape ?? limits.mode) !== 'triage')
                return undefined;
            if (!canBackgroundDeliver(agent))
                return undefined;
            // Captain confirmation (round-071) on the interactive surface. An approval
            // or an explicit edit answers the captain's split question, and it is not a
            // message to classify: it dispatches the plan it names, behind a receipt, so
            // the user keeps chatting while the confirmed work runs.
            //
            // round-072: the entry arrives already consumed (one consumer, TTL applied by
            // `takeCaptainPending`). The peek this replaces ignored the TTL — an expired
            // question could still dispatch its plan — and left the entry live for the
            // blocking path to consume a second time. Everything that is not a live
            // approval declines *with* the value still in hand, so the blocking path
            // states one void note and routes the message on its own (no silent loss).
            const captainPending = opts.captainPending;
            if (captainPending !== undefined) {
                if (captainPending.kind === 'expired')
                    return undefined;
                const meaning = captainAnswer(admit.request);
                if (meaning === 'approve' || meaning === 'amend') {
                    const forRun = meaning === 'amend'
                        ? amendRequest(captainPending.ask.request, admit.request)
                        : approvedRequest(captainPending.ask.request, captainPending.ask.preview);
                    const entry = entryOf(admit, payload);
                    const accepted = enqueue(admit.agentId, async () => {
                        const lateHistory = collectHistory(sessionOf(agent), { turns: FIXED_HISTORY_TURNS, chars: FIXED_HISTORY_CHARS }, entry.messageIds);
                        await runChannelRound(agent, entry, forRun, captainPending.ask.lang, lateHistory);
                    });
                    // `started` only once the batch is actually queued (round-072): a full
                    // queue must not leave a delivery record claiming a background run that
                    // never happened. Declining here costs nothing — the taken confirmation
                    // travels to the blocking path below, which dispatches the same plan
                    // in-turn, so the approval is neither faked nor lost.
                    if (!accepted)
                        return undefined;
                    record(agent, entry, 'started', 'admitted-team-background');
                    const approved = {
                        kind: 'direct',
                        text: captainApproveNote(captainPending.ask.lang),
                        outcome: 'captain-confirmed',
                    };
                    return opts.enterAfter(base, answerText(approved, true), opts.surfaced);
                }
                return undefined;
            }
            // The tier must actually be team: classify here from the same history
            // snapshot (cheap, deterministic); anything else is not this function's job.
            // Pending answers count: a bare '团队' reply to the front-desk question is
            // team only with pending:true (without it the same word is stale-choice
            // chat). takePending is consumed here (once), so the queued background run
            // below must NOT go through produceAnswer (which would take it again and
            // miss); it calls runTeam directly with the already-resumed target.
            const pending = takePending(admit.agentId);
            const live = pending?.kind === 'live' ? pending.ask : undefined;
            const tier = classifyTriage({
                text: admit.request,
                mode: 'triage',
                ask: FIXED_TRIAGE_ASK,
                pending: live !== undefined,
                historyNonEmpty: history.trim() !== '',
                followupAsFast: FIXED_TRIAGE_FOLLOWUP_AS_FAST,
            });
            if (tier.tier !== 'team') {
                // Not ours: put the pending question back so the blocking path still
                // answers it (takePending consumed it above).
                if (pending !== undefined)
                    pendingAsks.set(admit.agentId, pending.ask);
                return undefined;
            }
            const target = live === undefined || (tier.reason !== 'pending-fast' && tier.reason !== 'pending-team')
                ? admit.request
                : resumedTarget(tier, live.originalRequest, admit.request);
            // Captain confirmation (round-071): before a team dispatch, the captain
            // states the split and the user gets one round to approve or change it. The
            // front-desk question was already answered on the `pending-team` path, so
            // that one dispatches without a second question.
            if (tier.reason !== 'pending-team') {
                const preview = await runSingleCall({
                    ctx, config: limits, state, logger, agent,
                    prompt: captainPreviewPrompt(target),
                    label: 'captain-preview',
                    ...opts.signal === undefined ? {} : { signals: [opts.signal] },
                });
                const previewText = preview.ok ? sanitizeFirstAnswer(preview.text) : '';
                askCaptain(admit.agentId, target, tier.lang, previewText);
                const question = {
                    kind: 'direct',
                    text: [
                        triageLine(tier),
                        '',
                        captainAskText(tier.lang, previewText === '' ? captainPreviewFallback(tier.lang) : previewText),
                    ].join('\n'),
                    outcome: preview.ok ? 'triaged-captain-confirm' : 'triaged-captain-confirm-fallback',
                };
                // The confirmation is this batch's answer: nothing was dispatched, and the
                // question is delivered (not left routable) so the next message is read as
                // its answer by the same pending entry.
                record(agent, entryOf(admit, payload), 'delivered', question.outcome);
                return opts.enterAfter(base, answerText(question, true), opts.surfaced);
            }
            const context = firstAnswerContext(sessionOf(agent), history);
            let firstText = '';
            try {
                const call = await runSingleCall({
                    ctx, config: safe(), state, logger, agent,
                    prompt: firstAnswerPrompt(target, context, tier.lang),
                    label: 'first-answer',
                });
                if (call.ok)
                    firstText = sanitizeFirstAnswer(call.text);
            }
            catch {
                firstText = '';
            }
            const fellBack = firstText.trim() === '';
            const firstLine = fellBack ? firstAnswerFallback(tier.lang, target) : firstText;
            const firstAnswer = {
                kind: 'direct',
                text: [triageLine(tier), '', firstLine].join('\n'),
                outcome: fellBack ? 'triaged-team-first-fallback' : 'triaged-team-first',
            };
            // Batch lifecycle: claim for good (started/admitted-team-background), then
            // the same background admission relay/append uses. enqueue is per-agent
            // serialized, so a newer message cancels/redirects through the same queue.
            const entry = entryOf(admit, payload);
            // Redirect-on-new-message (existing machinery, no new bus): if a newer
            // message for the same session arrives while this run is queued/running,
            // it cancels the in-flight run via the shared ActiveState (active run's
            // cancel + dispose, then commitCancelled + cancelledText lands the
            // terminal), and the narrowed rerun is composed with
            // carriedPendingRequest / resumedTarget (whole-round cancel + narrow
            // restart; V1 does no subtask-level directed cancel). alreadyRouted
            // stays the double-run guard. See handle()/answerInTurn abort paths and
            // run.ts disposeActiveState for the cancel side.
            record(agent, entry, 'started', 'admitted-team-background');
            const accepted = enqueue(admit.agentId, async () => {
                const lateHistory = collectHistory(sessionOf(agent), { turns: FIXED_HISTORY_TURNS, chars: FIXED_HISTORY_CHARS }, entry.messageIds);
                await runChannelRound(agent, entry, target, tier.lang, lateHistory);
            });
            if (!accepted)
                return undefined;
            return opts.enterAfter(base, answerText(firstAnswer, true), opts.surfaced);
        }
        catch (error) {
            logger.warn(`interactive team admission failed, falling back to in-turn: ${redactError(error)}`);
            return undefined;
        }
    };
    /**
     * `full` mode on an interactive run: accept the message now, work behind it.
     *
     * `/grok on` writes `workflowMode: 'full'` (src/command.ts), which is the one
     * shape that skipped the interactive admission above and went straight to the
     * awaited run. `in-turn` keeps the step open for the whole run, and the loop
     * dispatches `agent/pre-step` for the next batch only after the current step
     * settles — so for the entire run (default deadline 0 = unlimited) every message
     * the user typed was accepted by the app and then never dispatched: the
     * transcript stayed silent and the composer looked broken. `/grok off` passed
     * messages through, which is exactly the reported contrast.
     *
     * This is the same admission the triage team path uses, minus the tier: `full`
     * has no front desk and no tier line, but it spends the same one cheap call, so
     * the turn answers the message in one or two sentences instead of only stating
     * that it was accepted — the team then verifies that answer behind the turn and
     * its report follows as its own message. The run keeps its
     * own bounds (`maxConcurrency`, `maxActiveRuns`, `maxRetries`) because it is the
     * same `runTeam`/`runWorkflow`; only the turn stops waiting for it.
     *
     * Only the *session* record (`/grok on`) takes this path. A deployment-level
     * `mode: 'full'` keeps T4 `in-turn` byte for byte: that shape is the documented
     * contract for a run that must finish inside its turn (and the 17 gate tests that
     * pin it), and changing it is its own decision, not a side effect of this fix.
     *
     * @returns the `enter` decision carrying the receipt, or `undefined` when the
     *   caller must keep the blocking path (config-level `full`, `triage` shape, a
     *   one-shot agent with no `followup`/`whenIdle`, or a full per-agent queue).
     *   Never throws.
     */
    const answerFullBehind = async (agent, admit, payload, base, opts) => {
        try {
            // The session record is the whole condition: `/grok on` writes
            // `workflowMode: 'full'`, and that record only exists where a `commands`
            // service is composed (an interactive UI). `limits.mode` — the deployment
            // default — deliberately does not reach here.
            if (readModeRecord(agent.session)?.workflowMode !== 'full')
                return undefined;
            // A one-shot run has no later turn to deliver into: keep the blocking path.
            if (!canBackgroundDeliver(agent))
                return undefined;
            const entry = entryOf(admit, payload);
            const lang = detectLanguage(admit.request);
            // Captain confirmation on the full shape (round-072): `full` has no front desk,
            // so nothing on this path ever read the split question — the word "确认" became
            // the objective of a whole run while the plan it answered was dropped. The
            // confirmation that arrived with this batch decides the objective here.
            let objective = admit.request;
            let runLang = lang;
            let note = '';
            if (opts.captainPending !== undefined) {
                const ask = opts.captainPending.ask;
                const meaning = captainAnswer(admit.request);
                if (opts.captainPending.kind === 'live' && (meaning === 'approve' || meaning === 'amend')) {
                    objective = meaning === 'amend'
                        ? amendRequest(ask.request, admit.request)
                        : approvedRequest(ask.request, ask.preview);
                    runLang = ask.lang;
                    note = captainApproveNote(ask.lang);
                }
                else {
                    note = captainVoidNote(ask.lang, opts.captainPending.kind === 'expired');
                    // A bare confirmation with nothing live to confirm is not a task: the void
                    // note is the whole answer and the word never becomes an objective.
                    if (meaning !== 'other') {
                        const voided = { kind: 'direct', text: note, outcome: 'captain-confirm-void' };
                        record(agent, entry, 'delivered', voided.outcome);
                        return opts.enterAfter(base, answerText(voided, true), opts.surfaced);
                    }
                }
            }
            // The first answer, on the shape that used to spend no cheap call at all: the
            // only thing this turn could say was the receipt, a muted "accepted, running
            // the plan" template the model read back verbatim. It is written live from the
            // approved objective and the message language — never from `admit.request`, so
            // a captain-approved rewrite answers the plan that actually runs — and from the
            // same bounded context the front desk reads. The snapshot is taken here and
            // without this batch, so the answer cannot read itself back; the queued closure
            // below still reads its own later one.
            //
            // The call is decoupled from the run on purpose: a slow, failed or empty call
            // never holds the run back and never pushes it into the turn — the entered line
            // is then the template fallback, which says plainly that it is one.
            const firstHistory = collectHistory(sessionOf(agent), { turns: FIXED_HISTORY_TURNS, chars: FIXED_HISTORY_CHARS }, entry.messageIds);
            const context = firstAnswerContext(sessionOf(agent), firstHistory);
            let firstText = '';
            try {
                const call = await runSingleCall({
                    ctx, config: safe(), state, logger, agent,
                    prompt: firstAnswerPrompt(objective, context, runLang),
                    label: 'first-answer',
                });
                if (call.ok)
                    firstText = sanitizeFirstAnswer(call.text);
            }
            catch {
                firstText = '';
            }
            const firstLine = firstText.trim() === '' ? firstAnswerFallback(runLang, objective) : firstText;
            const accepted = enqueue(admit.agentId, async () => {
                // Read history late and without this batch: a queued message must see the
                // answer the previous run just delivered, and must not read itself back.
                const lateHistory = collectHistory(sessionOf(agent), { turns: FIXED_HISTORY_TURNS, chars: FIXED_HISTORY_CHARS }, entry.messageIds);
                await runChannelRound(agent, entry, objective, runLang, lateHistory);
            });
            // `started` only once the batch is actually queued: `enqueue` schedules the task
            // on a later microtask, so this still lands before the run executes tool effects,
            // and a full queue — which falls back to the blocking path below — leaves no
            // record behind claiming a background run that never happened.
            if (!accepted)
                return undefined;
            record(agent, entry, 'started', 'admitted-full-background');
            const receipt = [note, firstLine, acceptedReceipt(runLang)].filter(part => part !== '').join('\n\n');
            return opts.enterAfter(base, acceptedEnterText(receipt), opts.surfaced);
        }
        catch (error) {
            logger.warn(`full-mode admission failed, falling back to in-turn: ${redactError(error)}`);
            return undefined;
        }
    };
    /** The step message that carries the report into the open turn. */
    const enterMessage = (text) => createUserMessage({
        content: [{ type: 'text', text }],
        source: { kind: RELAY_SOURCE_KIND },
    });
    /**
     * The messages one `enter` decision must carry (P0-1).
     *
     * `AgentLoop.preStep()` takes the admitted batch out of the inbox
     * (`inbox.claim`) and `step()` commits exactly `decision.messages` as
     * `user/message` events (`dsh-agent-loop/lib/index.js`, `step()`: every message
     * whose source is not `runtime-context` is appended). A decision that lists only
     * this plugin's report therefore *replaces* what the user typed: the batch was
     * already claimed, so the original message is never written and never appears in
     * `deriveMessages()` or in the GUI transcript. P0-1 is that defect.
     *
     * Calling `next()` yields the default decision (`[...claimed, runtimeContext]`),
     * so appending to it keeps the original message object — id, source, text and
     * attachments untouched — and cannot duplicate it either: `enter.messages` is the
     * only writer for a claimed batch, so a `session.append('user/message', …)` on top
     * of it would be a second copy of the same words.
     */
    const stepBase = async (payload, next) => {
        try {
            const base = await next();
            // `undefined` means a downstream listener refused the step; the caller must
            // not enter a step that was refused, and the batch stays routable.
            if (base.kind === 'reject')
                return undefined;
            // A listener that emptied the decision would drop the claimed message again,
            // so the claimed batch is the floor: what the user typed is never deleted.
            return base.messages.length > 0 ? [...base.messages] : [...payload.messages];
        }
        catch (error) {
            // A foreign listener's failure must not cost the user their own message.
            logger.warn(`gate kept the claimed messages after a pre-step failure: ${redactError(error)}`);
            return [...payload.messages];
        }
    };
    /**
     * Enter the batch now and run the team behind it (first-turn visibility, 0.13.24).
     *
     * The defect this closes: on a session whose surface has no head yet, `in-turn`
     * could not publish the claimed batch (`commitClaimed` refuses — see the
     * surface-head rule there), the loop commits `enter.messages` only when the step
     * *opens*, and the step opens only after the run settles. Measured on a live
     * session (`mode: full`, unlimited deadline): the whole round carried no
     * `step/start` and no `user/message`, so the user watched an empty turn for
     * hours and the app looked broken.
     *
     * The fix keeps the 0.13.14 safety rule intact — nothing is appended while the
     * surface is empty, so `user/message` still never takes position 0 — and uses the
     * loop instead: the decision carries only the claimed batch, the loop opens the
     * step, writes the host head and then commits the words. The report is delivered
     * in the next turn through the same relay path every other deferred answer uses.
     *
     * Narrow on purpose: only the `full` shape is taken (it has no front desk whose
     * question or cheap answer is worth holding the turn for), only when a later turn
     * exists to deliver into, and only when the surface is readable and empty — on a
     * surface that cannot be read the caller keeps the blocking path it always had.
     *
     * @returns the `enter` decision carrying the words alone, or `undefined` when the
     *   caller must keep the blocking path. Never throws.
     */
    const answerBehindUnpublished = async (agent, admit, payload, base, opts) => {
        try {
            if (opts.surfaced)
                return undefined;
            if (!canBackgroundDeliver(agent))
                return undefined;
            const shape = readModeRecord(agent.session)?.workflowMode ?? safe().mode;
            if (shape !== 'full')
                return undefined;
            if (!surfaceHasNoHead(sessionOf(agent)))
                return undefined;
            const entry = entryOf(admit, payload);
            const lang = detectLanguage(admit.request);
            const accepted = enqueue(admit.agentId, async () => {
                // Same late, self-excluding history every background round reads: the batch
                // the loop is about to commit must not come back as prior conversation.
                const lateHistory = collectHistory(sessionOf(agent), { turns: FIXED_HISTORY_TURNS, chars: FIXED_HISTORY_CHARS }, entry.messageIds);
                await runChannelRound(agent, entry, admit.request, lang, lateHistory);
            });
            if (!accepted)
                return undefined;
            record(agent, entry, 'started', 'admitted-visible-first');
            // The claimed batch and nothing else: the plugin's own message would be
            // committed into the same step and read as the answer to a run that has not
            // produced one yet.
            return { kind: 'enter', messages: [...base] };
        }
        catch (error) {
            logger.warn(`could not free the first turn from the run, keeping the blocking path: ${redactError(error)}`);
            return undefined;
        }
    };
    /**
     * Answer inside the open step (`in-turn`).
     *
     * The turn stays open for the whole run, so the report is entered as the step's
     * message and the main model finalises it in the same turn. Cancellation stays
     * honest: the turn's own signal is passed into the run, and an aborted turn
     * returns `reject` instead of entering a step nobody will read. This path never
     * waits for `whenIdle()` — the turn is the thing that would go idle.
     */
    const answerInTurn = async (verdict, payload, next) => {
        const { agent } = verdict;
        const entry = entryOf(verdict, payload);
        const signal = payload.signal;
        const aborted = () => signal?.aborted === true;
        /**
         * Enter the answer after the batch, never instead of it (P0-1).
         *
         * `surfaced` says this plugin already published the claimed batch to the
         * session surface (`publishClaimed` below), so the decision carries only what
         * is left — the report and any runtime context — and the user's words exist
         * exactly once. Without it the loop is the only writer and the batch must
         * stay in `messages`.
         */
        const enterAfter = (base, text, surfaced = false) => ({
            kind: 'enter',
            messages: surfaced
                ? [...withoutClaimed(base, payload.messages), enterMessage(text)]
                : [...base, enterMessage(text)],
        });
        if (aborted()) {
            // Already cancelled when the message arrived: nothing ran, but the batch must
            // still survive the rejection and say why (P0-1 + P0-4).
            record(agent, entry, 'failed', 'aborted');
            commitCancelled(agent, payload, cancelledText('这条消息还没派工就被取消了，没有启动任何工人。'));
            return { kind: 'reject' };
        }
        const base = await stepBase(payload, next);
        if (base === undefined) {
            // Downstream refused this step: nothing will be committed, so the batch must
            // stay routable rather than be claimed by an answer nobody will read.
            record(agent, entry, 'failed', 'pre-step-refused');
            return { kind: 'reject' };
        }
        const refusal = refusalOf(verdict);
        if (refusal !== undefined) {
            record(agent, entry, 'failed', refusal.outcome);
            return enterAfter(base, answerText({ kind: 'notice', reason: refusal.reason, outcome: refusal.outcome }, true));
        }
        // `started` before the wait: a crash inside the run must not leave the batch
        // routable, because the workflow may already have executed tool effects.
        record(agent, entry, 'started', 'admitted');
        // P0-5: publish the batch *before* waiting for the run. `in-turn` holds the
        // step open for the whole workflow and the loop writes a claimed batch only
        // when the step begins, so an `enter`-only design left the transcript with no
        // `user/message` at all for the entire run: the GUI showed an empty turn with
        // nothing but the running status, and a reload lost the message completely.
        // The history snapshot is taken first, so the published message is not also
        // read back as prior conversation.
        const history = collectHistory(sessionOf(agent), { turns: FIXED_HISTORY_TURNS, chars: FIXED_HISTORY_CHARS });
        const surfaced = commitClaimed(agent, payload.messages, payload.turn);
        // Captain confirmation (round-071, round-072): the split question is consumed
        // exactly once per batch — here — and the consumed value is handed to every path
        // below, so the interactive peek (no TTL, entry left live) and the blocking
        // re-take cannot disagree about what this message means. An expired entry never
        // dispatches; an unanswered one is voided with a note by whichever path routes
        // the message. A bare stop answers here instead of routing, so the confirmation
        // it interrupted is dropped without a note: the user just cancelled the round
        // that question was about, and a note about a cancelled plan would be noise.
        const captainPending = takeCaptainPending(verdict.agentId);
        // The main-session channel (src/channel.ts, `replan` on): one decision point,
        // placed before either admission, because a message that arrives while this
        // session's run is still working is not a new request whatever its own shape
        // would classify as. It answers the stop and forward cases and returns
        // `undefined` for everything else, so the rest of this function is unchanged.
        if (safe().replan) {
            const channel = await answerOnChannel(agent, verdict, entry, base, history, {
                enterAfter, surfaced, ...captainPending === undefined ? {} : { captainPending },
            });
            if (channel !== undefined)
                return channel;
        }
        // B (边聊边干): triage-team on a background-deliverable agent answers the
        // live first answer in this turn and admits the workflow behind it.
        // answerStrategy is NOT consulted: the config default stays `in-turn`; this
        // branch changes only what triage-team does when the run is interactive.
        const interactive = await answerTeamInteractive(agent, verdict, payload, base, history, {
            enterAfter, surfaced, signal, ...captainPending === undefined ? {} : { captainPending },
        });
        if (interactive !== undefined)
            return interactive;
        // The `/grok on` shape's front desk (escape hatch): `chat` and single facts answer
        // here instead of paying for a plan, and a real task gets one split question
        // before anything runs. The condition is the session record alone, so a
        // deployment-level `mode: 'full'` keeps its own path byte for byte. A confirmation
        // already consumed above means this message is the answer to that question, so the
        // escape stands aside and `answerFullBehind` below dispatches what it named.
        if (readModeRecord(agent.session)?.workflowMode === 'full') {
            const frontDesk = await fullFrontDeskEscape(agent, verdict.request, history, signal, captainPending !== undefined);
            if (frontDesk !== undefined) {
                record(agent, entry, frontDesk.kind === 'notice' ? 'failed' : 'delivered', frontDesk.outcome);
                return enterAfter(base, answerText(frontDesk, true), surfaced);
            }
        }
        // `full` (what `/grok on` selects) on the same kind of agent: accept the
        // message, run the team behind it, deliver the report as its own message.
        // Everything else (agent without followup/whenIdle — one-shot, headless)
        // keeps the blocking path, which always produces a final answer.
        const accepted = await answerFullBehind(agent, verdict, payload, base, {
            enterAfter, surfaced, ...captainPending === undefined ? {} : { captainPending },
        });
        if (accepted !== undefined)
            return accepted;
        // First-turn visibility (0.13.24): the batch cannot be published ahead of a run
        // on a surface with no head, so the blocking path below would keep it invisible
        // for the whole round. The words go in now, the report follows in the next turn.
        const published = await answerBehindUnpublished(agent, verdict, payload, base, { surfaced });
        if (published !== undefined)
            return published;
        const answer = await produceAnswer(agent, verdict.request, signal, history, captainPending);
        if (aborted()) {
            // The turn was cancelled while the run was in flight: nobody can read an
            // entered step, and the run already stopped on the same signal — so the
            // transcript gets the batch and the cancelled terminal instead (P0-1 + P0-4).
            record(agent, entry, 'failed', 'aborted');
            const reason = answer.kind === 'notice' ? answer.reason : '';
            const partialReport = answer.kind === 'report' ? answer.report : undefined;
            commitCancelled(agent, payload, cancelledText(reason, partialReport, {
                lang: detectLanguage(verdict.request),
            }), surfaced);
            return { kind: 'reject' };
        }
        record(agent, entry, answer.kind === 'notice' ? 'failed' : 'delivered', answer.outcome);
        return enterAfter(base, answerText(answer, true), surfaced);
    };
    /**
     * Enter a user-visible refusal instead of a silent `reject` (P0-3).
     *
     * A bare rejection is invisible: the app shows an empty turn and the user has no
     * way to tell an internal fault from a policy decision. The claimed message still
     * comes first, so the transcript keeps what they wrote (P0-1).
     */
    const enterRefusal = (payload, text) => {
        try {
            const claimed = Array.isArray(payload.messages) ? payload.messages : [];
            if (claimed.length === 0)
                return { kind: 'reject' };
            return { kind: 'enter', messages: [...claimed, enterMessage(text)] };
        }
        catch (error) {
            logger.warn(`gate could not state the failure: ${redactError(error)}`);
            return { kind: 'reject' };
        }
    };
    /**
     * Classification threw: still answer, with the reason (P0-3).
     *
     * Only a batch that carries a claimed user message is answered this way; a tool
     * continuation or a runtime-context batch has nothing to refuse, and entering a
     * notice there would answer a step the user never took.
     */
    const classificationFailure = (payload, reason) => {
        let userClaimed = false;
        try {
            userClaimed = (Array.isArray(payload.messages) ? payload.messages : [])
                .some(message => message.source?.kind === 'user');
        }
        catch {
            userClaimed = false;
        }
        if (!userClaimed)
            return { kind: 'reject' };
        return enterRefusal(payload, noticeEnterText(`the mandatory workflow gate failed while reading this message: ${reason}`));
    };
    /** Serialize one agent's batches and bound the queue. */
    const enqueue = (agentId, task) => {
        const current = queues.get(agentId);
        if (current !== undefined && current.queued >= FIXED_MAX_QUEUED_MESSAGES)
            return false;
        const queue = current ?? { tail: Promise.resolve(), queued: 0 };
        queue.queued += 1;
        queues.set(agentId, queue);
        queue.tail = queue.tail
            .then(task)
            .catch((error) => {
            logger.warn(`gate task failed: ${redactError(error)}`);
        })
            .finally(() => {
            queue.queued -= 1;
            if (queue.queued === 0 && queues.get(agentId) === queue)
                queues.delete(agentId);
        });
        return true;
    };
    /**
     * The loop driver's brakes.
     *
     * Built here rather than injected by the composition: a profile that composes
     * Schedule gets them without a second wiring point, and a profile without it gets a
     * port that can still stop on the operator marker and the session's own records but
     * has no row to delete. The Schedule lookup is lazy because the gate may be installed
     * before that service is mounted.
     */
    const loop = deps.loop ?? createLoopBrakes({
        schedule: () => scheduleServiceOf(ctx),
        logger,
        disposed: () => state.disposed,
    });
    const classifyDeps = {
        config,
        loop,
        ...deps.readConfig === undefined ? {} : { readConfig: deps.readConfig },
    };
    const handle = async (payload, next) => {
        let verdict;
        try {
            verdict = classifyPreStep(classifyDeps, payload);
        }
        catch (error) {
            // Fail closed (never a direct model answer) *and* visible (P0-3): the user
            // learns that the gate failed, instead of watching an empty turn.
            const reason = redactError(error);
            logger.warn(`gate classification failed: ${reason}`);
            return classificationFailure(payload, reason);
        }
        // A tripped brake is the one refusal that also has to remove the driver: the
        // heartbeat is refused (zero model calls) and its Schedule row is deleted, so the
        // loop cannot come back on the next occurrence.
        if (verdict.kind === 'loop-stop') {
            await loop.stop({ sessionId: verdict.agentId, code: verdict.code, detail: verdict.detail });
            return { kind: 'reject' };
        }
        // Pass-through calls the next listener untouched: a foreign failure must
        // surface as that listener's failure, not as this gate's refusal.
        if (verdict.kind === 'pass')
            return next();
        // T4: only `in-turn` survives — the turn that admitted the batch answers it.
        try {
            return await answerInTurn(verdict, payload, next);
        }
        catch (error) {
            // Totality with an answer: an internal failure is still stated, because a
            // plain refusal would leave a one-shot app with no user-visible output.
            // The claimed message is kept in front of the notice (P0-1).
            const reason = redactError(error);
            logger.warn(`gate could not answer in-turn: ${reason}`);
            return enterRefusal(payload, noticeEnterText(reason));
        }
    };
    // Call through the context: cordis event registration is receiver-bound.
    host.on?.('agent/pre-step', handle);
    return true;
}
//# sourceMappingURL=gate.js.map