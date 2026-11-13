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
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm';
import { readdirSync, readFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { frontDeskText, noticeEnterText, noticeText, relayText, RELAY_SOURCE_KIND } from './answer.js';
import { carryoverBounds, carryoverForSession } from './carryover.js';
import { collectHistory, composeObjective, renderHistory } from './history.js';
import { TASK_LIMITS } from './input.js';
import { isModeEnabled, readModeRecord } from './mode.js';
import { alreadyRouted, appendInstantReceipt, deliveryKey, recordDelivery } from './records.js';
import { redactError, redactSecrets } from './redact.js';
import { runSingleCall, runWorkflow } from './run.js';
import { askLine, chatReply, classifyTriage, detectLanguage, expiredAskNote, greetingLine, missingNote, recallFromPrior, recallPrompt, recalledNote, resolvePending, resumedRequest, singleCallPrompt, tierNote, triageLine, unusedAskNote, RECALL_LIMITS, } from './triage.js';
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
    // U-7: an external plugin cannot register into a preset, so `preset` scope is
    // expressed as an allow-list on the session header. Sessions outside the named
    // preset keep their ordinary behaviour.
    // Live scope check: an edit that widens or narrows the gate applies to the next
    // claimed message. A broken edit degrades to the load-time snapshot instead of
    // throwing here: classification runs outside the gate's error handling, and a
    // throw would replace the workflow answer with an opaque rejection.
    const scoped = readScope(deps);
    if (scoped.gateScope === 'preset' && header?.agentPreset !== scoped.gatePreset) {
        return { kind: 'pass', reason: 'out-of-scope' };
    }
    // Grok mode is a per-session, runtime toggle (default off). When it is not
    // enabled this batch passes to the model untouched (normal chat); only
    // toggle-admitted batches run the workflow. The config default comes from the
    // same live scope the out-of-scope check reads, so a settings edit is honored;
    // placed here so the more specific pass reasons above keep their labels.
    if (!isModeEnabled(session, scoped.grokDefault === 'on')) {
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
 * User-visible terminal for a cancelled turn (P0-4).
 *
 * A cancellation that ends silently is indistinguishable from a hang, and the two
 * used to be exactly that. The text names the state, keeps the completed/partial
 * split honest, and never reads as success.
 *
 * The kept report is relayed with the same plain-language head every other path
 * uses, so a cancelled PARTIAL does not open with the raw ledger either.
 *
 * @param reason - Optional measured reason; empty when there is none to state.
 * @param report - Report the run produced before it was stopped, when there is one.
 * @param opts - `showDiagnostics` / `humanSummary` switches and the user's language.
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
            '取消前已有 ' + verified + '/' + total + ' 项任务核验通过；下方保留核验结果、未完成项和证据。总体状态仍为取消，不代表全部完成。',
        ];
    const trimmed = reason.trim();
    if (trimmed !== '')
        lines.push('原因：' + trimmed);
    if (report !== undefined) {
        const head = humanHead(report, opts.lang ?? 'zh', opts.humanSummary ?? true);
        const relayOpts = opts.showDiagnostics === undefined ? {} : { showDiagnostics: opts.showDiagnostics };
        lines.push('', '取消前保留的工作流报告：', relayText(report, head, relayOpts));
    }
    return lines.join('\n');
}
/**
 * Deterministic plain-language head for a finished run (B plan, widened here).
 *
 * One composer for all three final statuses. The head used to be built twice (the
 * front desk's team branch and `runTeam`), so any path that composed its own
 * answer — a cancelled turn, a PARTIAL arriving through the front desk — could
 * hand the user the raw ledger and nothing else. That is exactly what
 * session-4c562307 saw: a PARTIAL answer that began at `Grok workflow: PARTIAL`.
 *
 * Deterministic on purpose: no model call, so engine call counts and the one-shot
 * budget are unchanged. Bounded to two summary lines and short next steps.
 *
 * - `completed`: the 0.7.0 wording, byte for byte (no regression).
 * - `partial`: same marker, plus what did not get done and what to do next.
 * - `failed`: its own marker (`【人话结论·未完成】` / `【Plain summary · not completed】`)
 *   and never the success sentence: a failed run must not read as success.
 *
 * @param report - validated report.
 * @param lang - language of the user's request.
 * @param enabled - the `humanSummary` switch; off means no head at all.
 * @returns the head block, or undefined when the switch is off.
 */
export function humanHead(report, lang, enabled) {
    if (!enabled)
        return undefined;
    const zh = lang === 'zh';
    const verified = report.tasks.filter(task => task.status === 'verified').length;
    const total = report.tasks.length;
    const summary = (report.synthesis.summary ?? '')
        .split('\n').map(line => line.trim()).filter(line => line !== '').slice(0, 2).join(' / ').slice(0, 400);
    if (report.status === 'completed') {
        return zh
            ? `【人话结论】任务 ${verified}/${total} 项已核验通过。${summary !== '' ? summary : '详见下方原文报告。'}\n\n（原文报告附后）`
            : `【Plain summary】${verified}/${total} tasks verified. ${summary !== '' ? summary : 'See the full report below.'}\n\n(Full machine report follows)`;
    }
    if (report.status === 'partial') {
        const undone = report.tasks
            .filter(task => task.status !== 'verified')
            .map(task => headTitle(task.title, task.id));
        const named = undone.slice(0, 3).join(zh ? '、' : ', ');
        const rest = undone.length > 3 ? (zh ? ` 等 ${undone.length} 项` : ` and ${undone.length - 3} more`) : '';
        const lead = zh
            ? `【人话结论】任务 ${verified}/${total} 项已核验通过，${undone.length} 项没做成${named === '' ? '' : `（${named}${rest}）`}。`
            : `【Plain summary】${verified}/${total} tasks verified; ${undone.length} did not get done${named === '' ? '' : ` (${named}${rest})`}.`;
        const next = zh
            ? `下一步：先看下方「Incomplete」里那一项的原因；要接着做，把没做成的部分再发一次（例如「重做 ${undone[0] ?? '那一项'}」），我会重新跑一遍。已完成项的核验证据在下方原文报告里。`
            : `Next: read the reason under "Incomplete" below; to continue, send the unfinished part again (for example "redo ${undone[0] ?? 'that item'}") and I will run it once more. Verified evidence for the finished part is in the full report below.`;
        return [lead + summary, next, '', zh ? '（原文报告附后）' : '(Full machine report follows)'].join('\n');
    }
    // failed: state it plainly, never in the success wording.
    const error = report.errors[0];
    const incomplete = report.incomplete[0];
    const category = error?.category ?? incomplete?.category ?? report.plan.failure?.category;
    const reason = oneHeadLine(error?.message ?? incomplete?.reason ?? report.plan.failure?.reason ?? '');
    const counted = total === 0
        ? ''
        : zh
            ? `（其中 ${verified}/${total} 项已核验通过，但整体不算完成）`
            : ` (${verified}/${total} verified, but the run is not complete)`;
    const lead = zh
        ? `【人话结论·未完成】这次没有做成，没有可交付的结果${counted}。${reason === '' ? '' : `原因：${reason}。`}`
        : `【Plain summary · not completed】This run did not finish, so there is no deliverable${counted}.${reason === '' ? '' : ` Reason: ${reason}.`}`;
    return [lead, `下一步：${failureAdvice(category, zh)}`, '', zh ? '（原文报告附后）' : '(Full machine report follows)'].join('\n');
}
/** Short label for one unfinished task inside the head (bounded, never blank). */
function headTitle(title, id) {
    const text = title.trim() !== '' ? title.trim() : id;
    return text.length <= 40 ? text : `${text.slice(0, 39)}…`;
}
/** Collapse a reason to one bounded line, so the head cannot swallow the answer. */
function oneHeadLine(value) {
    const compact = value.replace(/\s+/g, ' ').trim();
    return compact.length <= 200 ? compact : `${compact.slice(0, 199)}…`;
}
/**
 * What the reader can do next, by failure kind.
 *
 * Kept as a table so the advice matches the measured category instead of guessing:
 * an infrastructure fault is not the user's task to fix, a quality failure is.
 */
function failureAdvice(category, zh) {
    const table = {
        infrastructure: zh
            ? '看起来是模型或网络一侧的问题：稍后把同样的请求再发一次；连续失败就去设置里检查模型链路。'
            : 'This looks like a model or network problem: send the same request again in a moment; if it keeps failing, check the model chain in the settings.',
        configuration: zh
            ? '这是配置问题：先到设置里检查模型链路与权限，再发一次。'
            : 'This is a configuration problem: check the model chain and permissions in the settings, then send the request again.',
        quality: zh
            ? '工作没达到验收标准：把任务拆小一点、把验收条件写清楚，再发一次。'
            : 'The work did not meet its acceptance criteria: split it smaller, state the acceptance criteria, and send it again.',
        cancelled: zh
            ? '这次是被取消的：还需要的话，把同样的请求重新发一次。'
            : 'The run was cancelled: send the same request again if you still want it.',
        unknown: zh
            ? '把同样的请求再发一次；如果仍然失败，请把任务拆成更小的一步。'
            : 'Send the same request again; if it fails again, split it into a smaller step.',
    };
    return table[category ?? 'unknown'];
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
/**
 * Deliver the answer by writing it into the closed turn (strategy `append`).
 *
 * Degraded and experimental: no stream, no usage accounting, and the turn still
 * ends `blocked`, so a one-shot app reports a non-zero exit. The write happens
 * only after the turn closed, because a write during the turn races the loop's
 * own step messages and loses. The turn-order case is not measured yet (NR-3).
 */
async function deliverAppend(agent, text, turn, step) {
    try {
        await agent.whenIdle();
    }
    catch {
        // See deliverRelay: a disposed agent cannot accept delivery.
    }
    const session = sessionOf(agent);
    if (session === undefined)
        return false;
    try {
        // The user message is committed by this plugin: a rejected batch never
        // becomes a user/message event, so the report would otherwise be orphaned.
        session.append('user/message', createUserMessage({
            content: [{ type: 'text', text }],
            source: { kind: RELAY_SOURCE_KIND },
        }), { surfaceOp: 'append' });
        const options = agent.options ?? {};
        session.append('assistant/message', {
            turn,
            step,
            message: createAssistantMessage({
                content: [{ type: 'text', text }],
                source: {
                    provider: options.provider ?? 'grok-workflow',
                    model: options.model ?? 'workflow-report',
                },
            }),
            stream: [],
        }, { surfaceOp: 'append' });
        return true;
    }
    catch {
        return false;
    }
}
/** Install the gate; returns false when the runtime cannot host `agent/pre-step`. */
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
        // Fail-open by default (a runtime without the hook cannot be policed), but a
        // deployment that promises mandatory entry sets gateRequired to turn this
        // silent degradation into a load-time error.
        if (config.gateRequired === true) {
            throw new Error('enforceGate requires the agent/pre-step hook, which this runtime does not expose (gateRequired is true)');
        }
        logger.warn('agent/pre-step is unavailable: mandatory entry is disabled in this runtime; set gateRequired to fail instead');
        return false;
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
        if (verdict.request.trim() === '') {
            // An attachment-only or empty message has nothing to route: refuse it
            // explicitly instead of spending a full workflow run on an empty objective.
            return { reason: 'the message contains no text to route', outcome: 'empty-request' };
        }
        if (verdict.request.length > TASK_LIMITS.objectiveChars) {
            // Too large to route: refuse and say so instead of letting the model answer.
            return {
                reason: `the message is longer than the ${TASK_LIMITS.objectiveChars}-character workflow objective limit`,
                outcome: 'objective-too-long',
            };
        }
        return undefined;
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
     * Run the workflow for one admitted batch and produce its answer.
     *
     * Composes the objective here, not at admission: a queued follow-up must see
     * the answer the previous run just delivered, so history is read as late as
     * possible. `history` overrides that read for `in-turn`, which publishes the
     * batch first and must not see it as prior conversation (P0-5). Never throws —
     * a run that cannot start becomes a notice.
     */
    const produceAnswer = async (agent, request, signal, history) => {
        const limits = safe();
        // A session-level `/grok` record selects the workflow shape explicitly; the
        // deployment's `mode` only decides what a config-level default does. Without
        // this, `/grok` would promise the full workflow while the front desk quietly
        // answered from a template (t59 finding).
        const sessionShape = readModeRecord(agent.session)?.workflowMode;
        const effectiveMode = sessionShape ?? limits.mode;
        // Front desk (t52, plan C): the tier is decided per message, before any run
        // starts, and the decision is part of the answer text. `full` keeps the
        // pre-t52 behaviour byte for byte: no tier line, no greeting, no cheap call.
        if (effectiveMode !== 'full') {
            const agentId = agentIdOf(agent);
            // Consumed before classification: at most one message answers a question,
            // and an expired entry has to be stated rather than silently reused (P0-2).
            const pending = takePending(agentId);
            const live = pending?.kind === 'live' ? pending.ask : undefined;
            // History-aware follow-up: reuse the in-turn snapshot when present; only
            // the relay/append path (history === undefined) reads it here.
            const histForTriage = history ?? collectHistory(sessionOf(agent), { turns: limits.historyTurns, chars: limits.historyChars });
            const historyNonEmpty = histForTriage.trim() !== '';
            const tier0 = classifyTriage({
                text: request,
                mode: effectiveMode,
                ask: limits.triageAsk,
                pending: live !== undefined,
                historyNonEmpty,
                followupAsFast: limits.triageFollowupAsFast,
            });
            // Hybrid classifier (opt-in): one model call only for unclear cases.
            // Rules stay the default path byte-for-byte; hybrid only re-decides
            // ask/ambiguous-escalate, or chat when history exists to consult.
            let tier = tier0;
            if (limits.triageClassifier === 'hybrid'
                && (tier0.reason === 'ambiguous' || tier0.reason === 'ambiguous-escalate'
                    || (tier0.tier === 'chat' && historyNonEmpty))) {
                const hybridPrompt = [
                    // First line = the child's durable display label (src/team-engine.ts).
                    tier0.lang === 'zh' ? '任务分类' : 'Triage classifier',
                    'You are the front-desk classifier of a coding assistant.',
                    'Decide one tier for the current message: chat (small talk only), fast (one worker), team (multi-step).',
                    'Reply only JSON: {"tier":"chat|fast|team"}.',
                    '',
                    `History: ${histForTriage.slice(0, 2000)}`,
                    `Message: ${request.slice(0, 2000)}`,
                ].join('\n');
                try {
                    const call = await runSingleCall({
                        ctx, config: limits, state, logger, agent,
                        prompt: hybridPrompt,
                        label: 'triage-classifier',
                        ...signal === undefined ? {} : { signals: [signal] },
                    });
                    if (call.ok) {
                        const m = /"tier"\s*:\s*"(chat|fast|team)"/.exec(call.text);
                        const t = m?.[1];
                        if (t === 'chat' || t === 'fast' || t === 'team') {
                            tier = {
                                tier: t,
                                reason: t === 'team' ? 'multi-step' : t === 'fast' ? 'single-step' : 'small-talk',
                                detail: tier0.detail,
                                lang: tier0.lang,
                                greeting: t === 'team',
                            };
                        }
                    }
                }
                catch {
                    // Fall through to the rules verdict on any hybrid failure.
                }
            }
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
                        ask: limits.triageAsk,
                        pending: live !== undefined,
                        historyNonEmpty,
                        followupAsFast: limits.triageFollowupAsFast,
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
            const note = expired !== '' ? expired : unused;
            const lead = note === '' ? [] : [note, ''];
            // The request a worker is given: the user's words, resumed against the
            // request the question was about (P0-2). Without this the quick tier would
            // be handed "简单" and nothing else.
            const target = live === undefined || (tier.reason !== 'pending-fast' && tier.reason !== 'pending-team')
                ? request
                : resumedRequest(tier, live.originalRequest, request);
            if (tier.tier === 'ask') {
                // No run and no answer: the front desk asks, and the next message from
                // this session is read as the answer (takePending above). The question is
                // asked once, and it says where the look-up went and what is missing —
                // never "repeat what you said".
                pendingAsks.set(agentId, { originalRequest: request, askedAt: Date.now() });
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
                    : [histForTriage, carryoverForSession(sessionOf(agent), { rounds: limits.historyTurns, chars: limits.historyChars }).digest]
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
            // Team tier: instant receipt first so the run never looks blank while in
            // flight (pure addition; a failed append only costs the receipt, never the run).
            if (limits.instantReceipt) {
                const receipt = [...lead, triageLine(tier), tier.greeting ? greetingLine(tier.lang) : '', tier.lang === 'zh' ? '正在执行，进度节点在旁。' : 'Running now; the live progress board sits beside this message.'].filter(line => line !== '').join('\n');
                try {
                    appendInstantReceipt(sessionOf(agent), receipt, logger);
                }
                catch {
                    // Receipt is best-effort by design.
                }
            }
            const answer = await runTeam(agent, target, signal, history);
            // Human-readable summary: deterministic plain-language lead-in in front
            // of the machine report (opt-out via humanSummary:false). Deterministic
            // on purpose: zero extra model calls, so engine-call-count assertions and
            // the one-shot budget stay exactly as before. One composer for every
            // status (`humanHead`), so a PARTIAL or FAILED answer cannot reach a path
            // that renders the raw ledger alone (session-4c562307).
            const summaryBlock = answer.kind === 'report'
                ? humanHead(answer.report, tier.lang, limits.humanSummary) ?? ''
                : '';
            const header = [...lead, triageLine(tier), tier.greeting ? greetingLine(tier.lang) : '', summaryBlock].filter(line => line !== '').join('\n');
            return answer.kind === 'report' ? { ...answer, header } : answer;
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
    const runTeam = async (agent, request, signal, history) => {
        const limits = safe();
        // P0-5: `in-turn` publishes the claimed message before the run, so the caller
        // snapshots the history first and passes it here — otherwise the message the
        // user just typed would also appear as "conversation so far" and the objective
        // would carry it twice.
        const objective = composeObjective(history ?? collectHistory(sessionOf(agent), { turns: limits.historyTurns, chars: limits.historyChars }), request, TASK_LIMITS.objectiveChars);
        if (objective === undefined) {
            return {
                kind: 'notice',
                reason: `the message is longer than the ${TASK_LIMITS.objectiveChars}-character workflow objective limit`,
                outcome: 'objective-too-long',
            };
        }
        let outcome;
        // Cross-round carry-over (v0.5). Every child agent of this round is fresh, so
        // the earlier rounds of this session are compiled into one bounded digest and
        // handed to the run: a follow-up is then answered from the earlier research
        // instead of asking the user to repeat what they already said. The digest is
        // read from the durable transcript (the validated reports this plugin wrote),
        // shares the configured history budget, and is empty on a first round.
        const carryover = carryoverForSession(sessionOf(agent), carryoverBounds(limits));
        if (carryover.digest !== '') {
            logger.info?.(`grok-workflow carry-over: ${carryover.rounds} earlier round(s), ${carryover.digest.length} chars`);
        }
        try {
            // The gate owns the user-visible answer, so failures become reports here;
            // only conditions that prevent starting at all reach the catch below.
            outcome = await runWorkflow({
                ctx, config: limits, state, logger, agent, objective, failureMode: 'report',
                ...carryover.digest === '' ? {} : { carryover: carryover.digest },
                ...signal === undefined ? {} : { signals: [signal] },
            });
        }
        catch (error) {
            // Busy instance, unloaded plugin or an unbuildable request: state it, do not bypass.
            const reason = redactError(error);
            logger.warn(`gate could not start the workflow: ${reason}`);
            return { kind: 'notice', reason, outcome: 'start-failed' };
        }
        // B plan: `full` mode gets the same deterministic plain-language header the
        // front desk already writes. Before this, `/grok on` produced the machine
        // ledger and nothing else — the user's own words for it were "全是机器语言".
        // One composer for every status: a PARTIAL or FAILED run also opens with a
        // sentence a reader can act on, and a failed run keeps its own marker so it
        // never opens with a success-styled sentence. The report body is untouched.
        const fullHeader = humanHead(outcome.report, detectLanguage(request), limits.humanSummary);
        return {
            kind: 'report',
            report: outcome.report,
            outcome: outcome.ok ? outcome.report.status : (outcome.cause ?? 'failed'),
            ...fullHeader === undefined ? {} : { header: fullHeader },
        };
    };
    /**
     * User-visible text for one answer under one strategy.
     *
     * The `showDiagnostics` switch has to be passed here too: it was only wired into
     * the PTC `render` tool, so turning it on in the settings changed nothing about
     * the report the user actually receives. Default off, exactly as before.
     */
    const answerText = (answer, inTurn) => {
        if (answer.kind === 'report') {
            return relayText(answer.report, answer.header, { showDiagnostics: safe().showDiagnostics });
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
        const delivered = safe().answerStrategy === 'append'
            ? await deliverAppend(agent, text, entry.turn, entry.step ?? 0)
            : await deliverRelay(agent, text);
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
     * @returns true when the message is in the session surface.
     */
    const commitClaimed = (agent, claimed) => {
        const session = sessionOf(agent);
        if (session === undefined || claimed.length === 0)
            return false;
        try {
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
        const kept = alreadySurfaced ? true : commitClaimed(agent, payload.messages);
        const session = sessionOf(agent);
        if (session === undefined)
            return kept;
        try {
            const options = agent.options ?? {};
            session.append('assistant/message', {
                turn: payload.turn,
                step: payload.step,
                message: createAssistantMessage({
                    content: [{ type: 'text', text }],
                    source: {
                        provider: options.provider ?? 'grok-workflow',
                        model: options.model ?? 'workflow-report',
                    },
                }),
                stream: [],
            }, { surfaceOp: 'append' });
        }
        catch (error) {
            logger.warn(`gate could not state the cancelled terminal: ${redactError(error)}`);
        }
        return kept;
    };
    /**
     * Admit one batch and answer it after the turn closes (`relay`/`append`).
     *
     * Kept separate so the listener itself stays total: this function may throw,
     * the listener turns any throw into a refusal (never a silent pass).
     */
    const admitInBackground = (verdict, payload) => {
        const { agent } = verdict;
        const entry = entryOf(verdict, payload);
        // Every path below rejects the step, so nothing else will commit this batch.
        commitClaimed(agent, payload.messages);
        const refusal = refusalOf(verdict);
        if (refusal !== undefined) {
            record(agent, entry, 'failed', refusal.outcome);
            void deliverAndRecord(agent, entry, { kind: 'notice', reason: refusal.reason, outcome: refusal.outcome });
            return;
        }
        const accepted = enqueue(verdict.agentId, async () => {
            await deliverAndRecord(agent, entry, await produceAnswer(agent, verdict.request));
        });
        if (accepted) {
            // Recorded only once the run is really queued: a refused batch must stay
            // routable, while an accepted one is claimed for good.
            record(agent, entry, 'started', 'admitted');
            return;
        }
        logger.warn(`gate queue is full for ${verdict.agentId}: refusing ${verdict.key}`);
        record(agent, entry, 'failed', 'queue-full');
        // Never await delivery here: this listener runs inside the step driver and
        // `whenIdle()` cannot resolve until it returns.
        void deliverAndRecord(agent, entry, {
            kind: 'notice',
            reason: `this agent already has ${safe().maxQueuedMessages} queued message(s) waiting for the workflow`,
            outcome: 'queue-full',
        });
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
        const limits = safe();
        const history = collectHistory(sessionOf(agent), { turns: limits.historyTurns, chars: limits.historyChars });
        const surfaced = commitClaimed(agent, payload.messages);
        const answer = await produceAnswer(agent, verdict.request, signal, history);
        if (aborted()) {
            // The turn was cancelled while the run was in flight: nobody can read an
            // entered step, and the run already stopped on the same signal — so the
            // transcript gets the batch and the cancelled terminal instead (P0-1 + P0-4).
            record(agent, entry, 'failed', 'aborted');
            const reason = answer.kind === 'notice' ? answer.reason : '';
            const partialReport = answer.kind === 'report' ? answer.report : undefined;
            commitCancelled(agent, payload, cancelledText(reason, partialReport, {
                showDiagnostics: limits.showDiagnostics,
                humanSummary: limits.humanSummary,
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
        if (current !== undefined && current.queued >= safe().maxQueuedMessages)
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
    const handle = async (payload, next) => {
        let verdict;
        try {
            verdict = classifyPreStep(deps, payload);
        }
        catch (error) {
            // Fail closed (never a direct model answer) *and* visible (P0-3): the user
            // learns that the gate failed, instead of watching an empty turn.
            const reason = redactError(error);
            logger.warn(`gate classification failed: ${reason}`);
            return classificationFailure(payload, reason);
        }
        // Pass-through calls the next listener untouched: a foreign failure must
        // surface as that listener's failure, not as this gate's refusal.
        if (verdict.kind === 'pass')
            return next();
        if (safe().answerStrategy === 'in-turn') {
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
        }
        try {
            admitInBackground(verdict, payload);
        }
        catch (error) {
            // Totality: a throw here would end the turn with an error and no answer.
            logger.warn(`gate could not admit the message: ${redactError(error)}`);
        }
        return { kind: 'reject' };
    };
    // Call through the context: cordis event registration is receiver-bound.
    host.on?.('agent/pre-step', handle);
    return true;
}
//# sourceMappingURL=gate.js.map