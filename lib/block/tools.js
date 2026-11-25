/**
 * The five block tools, registered only when `blockIntake` is on.
 *
 * The shape of the surface is the shape of the work: a user previews a split, says
 * yes in their own words, one block is claimed by a foreman, the foreman reports a
 * four-line handoff, and an independent judge decides. Every tool here is one step of
 * that loop, and none of them is a place where the plugin makes a judgement of its own
 * except `grok_close_block`, which defers to `src/supervisor/`.
 *
 * Two rules run through all of them:
 *
 * - **The ledger is the truth.** Every tool re-reads the row it is about; none of them
 *   caches a status, because a second process (or a second session) may have appended a
 *   version in between.
 * - **The caller gets plain words, not internals.** A refusal names the code and the
 *   next step; the supervisor's prompt, its raw output and the routing are never
 *   returned. What comes back is a verdict, its reasons, and where the record is.
 */
import { randomUUID } from 'node:crypto';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { BlockIntakeError, appendBlockRow, blockLedgerDir, blocksFile, getBlockRow, isApproveAnswer, previewBlocks, previewById, readBlockRows, startBlock, verdictsFile, verdictsFor, } from './index.js';
import { heartbeatsFile, readHeartbeatObservations } from './brakes.js';
import { runBlockSupervisor } from '../supervisor/index.js';
import { canAcceptBlock, isQuestionReplySource, isUserAuthoredSource, startsTurn } from '../user-source.js';
import { steeringForSession } from '../steering.js';
/** Tool names, exported so the flag test and the docs can name them once. */
export const BLOCK_TOOL_NAMES = {
    open: 'grok_open_block',
    accept: 'grok_accept_block',
    close: 'grok_close_block',
    status: 'grok_block_status',
    steer: 'grok_steer',
    stop: 'grok_stop',
};
/**
 * What a caller is told to do next for each failure code.
 *
 * Kept next to the error so a refusal is always "what happened + what to do"; the
 * ledger's own message says what happened, this table says what to do about it.
 */
const NEXT_STEP = {
    'approval-required': '让用户先回一句逐字包含预览里那句话的确认，再提交一次',
    'not-found': '先调 grok_open_block 的 preview 模式重新出单，拿到新的 preview_id',
    'not-approval': '这次提交没有明确点头；请用户回「确认」或「开始」，再提交',
    'split-changed': '切分在预览之后改过；用新的 split_hash 重新出单，不要沿用旧的',
    'preview-expired': '预览已经过期；重新出单，再让用户点头',
    'version-limit': '这一块已经写满版本上限；换一个新的切分（新的 preview），不要继续追加',
    'mode-off': '这个会话没有打开 grok 模式；先让用户打开模式，再调接单台的工具',
    'invalid': '按提示改掉不合法的字段，再提交一次',
};
/** A refusal a caller can act on: the code, the ledger's own words, and the next step. */
export class BlockToolError extends Error {
    code;
    constructor(code, detail) {
        const next = NEXT_STEP[code] ?? '按提示修正后重试';
        super(`${code}: ${detail}。下一步：${next}`);
        this.name = 'BlockToolError';
        this.code = code;
    }
}
/** Map the ledger's own error onto a tool refusal, leaving anything else alone. */
function refuse(error) {
    if (error instanceof BlockIntakeError)
        throw new BlockToolError(error.code, error.message);
    throw error instanceof Error ? error : new Error(String(error));
}
/** The calling agent, or a refusal that names the missing surface. */
function agentOf(exec) {
    const agent = exec.agent;
    if (!agent) {
        throw new BlockToolError('invalid', '这几个工具需要一个调用方 agent（exec.agent 为空）');
    }
    return agent;
}
/** The session id spelled exactly like the gate's own id. */
function sessionIdOf(agent) {
    const id = agent.session?.id;
    const text = id === undefined ? '' : String(id);
    if (text === '')
        throw new BlockToolError('invalid', '这个 agent 没有会话 id，账本无法归属');
    return text;
}
/**
 * The one admission check every block tool runs before it touches the ledger.
 *
 * It is live: the six tools read the session's own mode record, so a session that never
 * turned grok mode on — or turned it off again — is refused here with a named `mode-off`
 * refusal (`BlockToolError`) instead of reaching the ledger. `accept` and `stop` call it
 * before they parse their arguments, so "this session may not use the intake at all"
 * outranks "this call is malformed": the caller learns the one fact that makes fixing
 * the arguments pointless.
 */
function admit(agent) {
    if (canAcceptBlock(agent.session))
        return;
    throw new BlockToolError('mode-off', '这个会话的 grok 模式没打开，接单台不接单');
}
/** Text of one message, as the user typed it. */
function textOf(message) {
    const content = message.content;
    if (!Array.isArray(content))
        return '';
    return content
        .map(part => part.type === 'text' ? part.text ?? '' : '')
        .join('');
}
/** The tool whose call id a question-card answer names. */
const ASK_USER_QUESTION_TOOL = 'ask_user_question';
/**
 * The call ids of the `ask_user_question` calls logged after the preview.
 *
 * A card answer only counts for a question that was asked *after* the preview:
 * a reply to an older question says nothing about this split. The call event's
 * own `time` is the proof, so a call without a numeric stamp is left out rather
 * than assumed to be recent.
 * @param events - the session's events, in log order.
 * @param sinceMs - the preview's creation time (epoch ms).
 */
function askedCallIdsSince(events, sinceMs) {
    const ids = new Set();
    for (const event of events) {
        if (event.type !== 'tool/call')
            continue;
        if (typeof event.time !== 'number' || event.time <= sinceMs)
            continue;
        const data = event.data;
        if (data?.name !== ASK_USER_QUESTION_TOOL)
            continue;
        const callId = typeof data.callId === 'string' ? data.callId.trim() : '';
        if (callId !== '')
            ids.add(callId);
    }
    return ids;
}
/**
 * What the user picked in one card answer, without the Host's JSON batch.
 *
 * The payload carries the model's own question text as well, so returning it
 * whole would let a question like 「用户说了「确认」吗？」 satisfy the verbatim
 * quote rule by itself. Only `selected` labels and `custom` text are the user's
 * words; a payload that does not parse or holds no answers falls back to the
 * raw text.
 * @param raw - the message's text.
 */
function cardAnswerText(raw) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return raw;
    }
    const answers = parsed?.answers;
    if (!Array.isArray(answers))
        return raw;
    const picked = [];
    for (const entry of answers) {
        const item = entry;
        if (Array.isArray(item.selected)) {
            for (const label of item.selected) {
                if (typeof label === 'string' && label.trim() !== '')
                    picked.push(label.trim());
            }
        }
        if (typeof item.custom === 'string' && item.custom.trim() !== '')
            picked.push(item.custom.trim());
    }
    return picked.length === 0 ? raw : picked.join(' ');
}
/**
 * The user-authored messages this session received after a preview was created.
 *
 * `startBlock` matches the approval quote against these, so they must be the
 * user's own words, in order, from the session's real log — not from a caller's
 * memory of them. Two kinds count, under two restrictions:
 *
 * - a typed turn (`source.kind === 'user'`) counts as it always has;
 * - a question-card answer counts **only** when the `ask_user_question` call it
 *   names was logged after `sinceMs` — answering an older question, or naming a
 *   call that was never asked, approves nothing — and then only its selected /
 *   custom labels are returned, never the Host's JSON batch with the model's
 *   question text in it (D-137).
 * @param session - the calling session.
 * @param sinceMs - the preview's creation time (epoch ms).
 */
function userMessagesSince(session, sinceMs) {
    if (session === undefined || typeof session.ownEvents !== 'function')
        return [];
    const events = session.ownEvents();
    const askedAfter = askedCallIdsSince(events, sinceMs);
    const out = [];
    for (const event of events) {
        if (event.type !== 'user/message')
            continue;
        if (typeof event.time === 'number' && event.time <= sinceMs)
            continue;
        const message = event.data;
        const source = message?.source;
        // Both kinds are the user's own words; the card answer then has to pass its two
        // extra restrictions, and anything else in the log is not the user talking.
        if (!isUserAuthoredSource(source))
            continue;
        let text;
        if (startsTurn(source)) {
            text = textOf(message).trim();
        }
        else if (isQuestionReplySource(source)) {
            const callId = typeof source?.callId === 'string' ? source.callId.trim() : '';
            if (callId === '' || !askedAfter.has(callId))
                continue;
            text = cardAnswerText(textOf(message)).trim();
        }
        else {
            continue;
        }
        if (text !== '')
            out.push(text);
    }
    return out;
}
/**
 * The block a caller means.
 *
 * `block_id` names the *row* (that is what `startBlock` hands back and what
 * `getBlockRow` looks up), and one approved split may carry up to three blocks. So a
 * tool that acts on one block takes an optional selector — the block-local id
 * (`blk-2`) or its title — and defaults to the first block still `open`, which is the
 * one a caller who did not name one almost always means.
 * @param row - the row the id named.
 * @param selector - `blk-2` or a block title; omitted means "the first open block".
 */
function blockOf(row, selector) {
    if (row.blocks.length === 0)
        throw new BlockToolError('invalid', `账本行 ${row.id} 里没有块`);
    const wanted = selector?.trim() ?? '';
    if (wanted !== '') {
        const named = row.blocks.find(block => block.id === wanted || block.title === wanted);
        if (named === undefined) {
            throw new BlockToolError('not-found', `账本行 ${row.id} 里没有块「${wanted}」（有 ${row.blocks.map(block => block.id).join('、')}）`);
        }
        return named;
    }
    return row.blocks.find(block => block.status === 'open') ?? row.blocks[0];
}
/**
 * A new row version with exactly one block replaced.
 *
 * The siblings are carried through untouched: a split is one row holding several
 * blocks, so replacing the array would delete the blocks this call is not about.
 */
function withBlock(row, replaced, nowMs) {
    return versionOf(row, row.blocks.map(block => block.id === replaced.id ? replaced : block), nowMs);
}
/** A fresh row version with one block replaced. */
function versionOf(row, blocks, nowMs) {
    return {
        ...row,
        blocks,
        version: row.version + 1,
        updatedAt: new Date(nowMs).toISOString(),
        rowHash: '',
    };
}
/** Normalize the reported split into ledger task rows. */
function tasksOf(input, block) {
    if (input === undefined || input.length === 0)
        return block.tasks;
    return input.map((task, index) => ({
        id: task.id?.trim() === undefined || task.id?.trim() === '' ? `${block.id}-t${index + 1}` : task.id.trim(),
        title: task.title,
        // The ledger requires a non-empty objective on every task row; a caller that only
        // names the task gets its title, which is the one text it definitely wrote.
        objective: task.objective?.trim() === undefined || task.objective.trim() === '' ? task.title : task.objective,
        acceptanceCriteria: [...task.acceptanceCriteria],
        writesPaths: [...task.writesPaths ?? []],
    }));
}
/** The optional block selector every per-block tool accepts (`blk-2` or a title). */
function selectorOf(args) {
    const value = args['block'];
    return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}
/** The plain-text render used for every tool answer. */
function textResult(value) {
    return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }];
}
/** Progress of one row, counted from its blocks. */
function progressOf(row) {
    const counts = { total: row.blocks.length, open: 0, accepted: 0, vetoed: 0 };
    for (const block of row.blocks)
        counts[block.status] += 1;
    return counts;
}
/**
 * The supervisor's verdict as a caller sees it: outcome, reasons, where the record is.
 *
 * Deliberately not the routing, not the prompt and not the judge's raw answer: the
 * caller asked whether the work passed, and the route belongs to the ledger, not to the
 * answer (it is in `verdicts.jsonl` for whoever investigates).
 */
function verdictView(row, ledgerPath) {
    return {
        outcome: row.outcome,
        reasons: row.reasons.map(reason => ({ criterion: reason.criterion, evidence: reason.evidence, why: reason.why })),
        criteria: row.criteria.map(criterion => ({ text: criterion.text, met: criterion.met, evidence: criterion.evidence })),
        attempt: row.attempt,
        at: row.at,
        verdict_path: ledgerPath,
        ...row.override === undefined ? {} : { override: row.override },
    };
}
/**
 * Register the block tools.
 *
 * Called from `apply()` only when `readConfig().blockIntake === true`, so an off profile
 * has none of these names in its tool list.
 * @param deps - context, logger, configuration reader and the live-run set.
 */
export function registerBlockTools(deps) {
    const { ctx, logger, readConfig } = deps;
    const nowMs = () => deps.now?.() ?? Date.now();
    const dir = () => blockLedgerDir();
    const config = () => readConfig();
    /** Fail loudly if the plugin has been unloaded under a live call. */
    const alive = () => {
        if (deps.state?.disposed === true) {
            throw new BlockToolError('invalid', '插件已经卸载，接单台暂时不可用');
        }
    };
    const openTool = defineTool({
        name: BLOCK_TOOL_NAMES.open,
        description: [
            'Open a block intake: preview a split of the objective into blocks, or start one the user approved.',
            '`preview` writes nothing and returns the preview_id and split_hash the start call must quote back; `start` needs those two plus the user\'s own approving words. It never waits for work to run.',
        ].join(' '),
        parameters: {
            mode: { type: 'string', required: true, description: '"preview" to show the split, "start" to record the approved one.' },
            preview_id: { type: 'string', description: 'Start only: the id `preview` returned.' },
            split_hash: { type: 'string', description: 'Start only: the hash `preview` returned. A different hash is refused.' },
            objective: { type: 'string', description: 'Preview only: the whole objective the blocks serve.' },
            blocks: {
                type: 'array',
                description: 'Preview only: 1-3 blocks. Each needs title, objective, deliverable and acceptance.',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        title: { type: 'string', required: true, description: 'Short block title; also the name a sibling depends on.' },
                        objective: { type: 'string', required: true, description: 'Outcome this block achieves.' },
                        deliverable: { type: 'string', required: true, description: 'What exists when the block is done.' },
                        acceptance: { type: 'array', required: true, description: 'Testable acceptance checks; the supervisor judges each one.', items: { type: 'string' } },
                        writesPaths: { type: 'array', description: 'The scope this block may write. Nothing outside it passes the supervisor.', items: { type: 'string' } },
                        dependsOn: { type: 'array', description: 'Titles of sibling blocks that must be accepted first.', items: { type: 'string' } },
                        execution: { type: 'string', description: '"foreman" (a foreman dispatches it) or "workflow" (a workflow script runs it).' },
                        owner: { type: 'string', description: 'Subagent name for a workflow block.' },
                    },
                },
            },
            constraints: { type: 'array', description: 'Preview only: constraints the split must respect.', items: { type: 'string' } },
            nonGoals: { type: 'array', description: 'Preview only: what this intake explicitly does not do.', items: { type: 'string' } },
            verify: {
                type: 'object',
                additionalProperties: false,
                description: 'Preview only: verification switches. `blockSupervisor: false` skips the judge (the verdict then says so).',
                properties: { blockSupervisor: { type: 'boolean', description: 'Default true.' } },
            },
            approval: {
                type: 'object',
                additionalProperties: false,
                description: 'Start only: where the approval came from and the user\'s exact words.',
                properties: {
                    kind: { type: 'string', required: true, description: 'preview | user | request | operator | policy.' },
                    quote: { type: 'string', required: true, description: 'The user\'s approving words, verbatim; they must appear in a message sent after the preview.' },
                    sourceMessageId: { type: 'string', description: 'Optional id of the message the quote came from.' },
                },
            },
        },
        output: { schema: { type: 'json' }, render: (_args, value) => textResult(value) },
        isConcurrencySafe: () => false,
        async execute(args, exec) {
            alive();
            const agent = agentOf(exec);
            admit(agent);
            const sessionId = sessionIdOf(agent);
            const mode = String(args.mode ?? '');
            if (mode === 'preview') {
                const objective = String(args.objective ?? '').trim();
                if (objective === '')
                    throw new BlockToolError('invalid', 'preview 需要 objective');
                const blocks = Array.isArray(args.blocks) ? args.blocks : [];
                if (blocks.length === 0)
                    throw new BlockToolError('invalid', 'preview 至少需要一个块');
                try {
                    const preview = previewBlocks({
                        sessionId,
                        objective,
                        blocks,
                        ...Array.isArray(args.constraints) ? { constraints: args.constraints } : {},
                        ...Array.isArray(args.nonGoals) ? { nonGoals: args.nonGoals } : {},
                        ...args.verify === undefined ? {} : { verify: args.verify },
                        now: nowMs(),
                    });
                    return {
                        preview_id: preview.previewId,
                        split_hash: preview.splitHash,
                        render: preview.render,
                        warnings: preview.warnings,
                        requires_user_approval: true,
                        expires_at: preview.expiresAt,
                    };
                }
                catch (error) {
                    refuse(error);
                }
            }
            if (mode !== 'start')
                throw new BlockToolError('invalid', `mode 只能是 preview 或 start，收到「${mode}」`);
            const previewId = String(args.preview_id ?? '').trim();
            const splitHash = String(args.split_hash ?? '').trim();
            if (previewId === '')
                throw new BlockToolError('invalid', 'start 需要 preview_id');
            if (splitHash === '')
                throw new BlockToolError('invalid', 'start 需要 split_hash');
            const approval = args.approval;
            if (approval === undefined || approval === null) {
                throw new BlockToolError('approval-required', 'start 需要 approval：用户点头的原话与来源');
            }
            const quote = typeof approval.quote === 'string' ? approval.quote : '';
            const preview = previewById(previewId);
            const since = preview?.createdAtMs ?? 0;
            const messagesAfterPreview = userMessagesSince(agent.session, since);
            // Repeated here on purpose: this is the branch that commissions work (it writes
            // the approved split and hands back the dispatch envelope), so M3.2 will read the
            // rule at the moment work is ordered, not only when the tool was entered.
            admit(agent);
            try {
                const started = await startBlock({
                    sessionId,
                    previewId,
                    splitHash,
                    approval: {
                        kind: String(approval.kind ?? 'user'),
                        quote,
                        ...typeof approval.sourceMessageId === 'string' ? { sourceMessageId: approval.sourceMessageId } : {},
                    },
                    messagesAfterPreview,
                    // The approval is the user's own words, read the same way everywhere: a bare
                    // "确认"/"开始"/"yes" is a yes; "先别" is not, however it is phrased around it.
                    approved: isApproveAnswer(quote),
                    now: nowMs(),
                });
                return {
                    block_id: started.blockId,
                    status: started.status,
                    ledger_path: started.ledgerPath,
                    dispatch_envelope: started.dispatchEnvelope,
                    reused: started.reused,
                    // Stated so a caller cannot read this as "the work is done": nothing runs here.
                    waited_for_run: false,
                };
            }
            catch (error) {
                refuse(error);
            }
        },
    });
    const acceptTool = defineTool({
        name: BLOCK_TOOL_NAMES.accept,
        description: [
            'Claim one approved block: keep it open, give it a plan id if it has none, and return the split, the write scope and the progress.',
            'A claim is not a start of work — it is the record that a foreman owns this block.',
        ].join(' '),
        parameters: {
            block_id: { type: 'string', required: true, description: 'The id `grok_open_block` returned.' },
            block: {
                type: 'string',
                description: 'Optional: which block inside the row (`blk-2` or its title). Defaults to the first block still open.',
            },
        },
        output: { schema: { type: 'json' }, render: (_args, value) => textResult(value) },
        isConcurrencySafe: () => false,
        async execute(args, exec) {
            alive();
            admit(agentOf(exec));
            const blockId = String(args.block_id ?? '').trim();
            if (blockId === '')
                throw new BlockToolError('invalid', 'accept 需要 block_id');
            const row = await getBlockRow(blockId).catch(refuse);
            if (row === undefined)
                throw new BlockToolError('not-found', `账本里没有块 ${blockId}`);
            const block = blockOf(row, selectorOf(args));
            const planId = block.planId ?? `plan-${randomUUID().slice(0, 8)}`;
            const at = nowMs();
            const claimed = { ...block, planId };
            try {
                await appendBlockRow(withBlock(row, claimed, at));
            }
            catch (error) {
                refuse(error);
            }
            return {
                block_id: row.id,
                plan_id: planId,
                status: claimed.status,
                title: claimed.title,
                execution: claimed.execution,
                ...claimed.owner === undefined ? {} : { owner: claimed.owner },
                writes_paths: claimed.writesPaths,
                acceptance: claimed.acceptance,
                depends_on: claimed.dependsOn,
                tasks: claimed.tasks.map(task => ({ id: task.id, title: task.title, writes_paths: task.writesPaths })),
                progress: progressOf(row),
                ledger_path: blocksFile(),
            };
        },
    });
    const closeTool = defineTool({
        name: BLOCK_TOOL_NAMES.close,
        description: [
            'Hand a block in: run the six deterministic checks, then (unless told not to) ask the independent supervisor once.',
            'Returns pass or veto with the named reasons and where the verdict is recorded. A veto changes nothing except the verdict record.',
        ].join(' '),
        parameters: {
            block_id: { type: 'string', required: true, description: 'The block being handed in.' },
            block: {
                type: 'string',
                description: 'Optional: which block inside the row (`blk-2` or its title). Defaults to the first block still open.',
            },
            handoff: {
                type: 'string',
                required: true,
                description: 'Exactly four non-empty lines: 做了什么 / 证据 / 没做 / 下一步.',
            },
            tasks: {
                type: 'array',
                description: 'The task split actually used. Omit to judge the split the block was opened with.',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        id: { type: 'string', description: 'Task id; generated when omitted.' },
                        title: { type: 'string', required: true, description: 'Short task title.' },
                        objective: { type: 'string', description: 'What this task had to achieve.' },
                        acceptanceCriteria: { type: 'array', required: true, description: 'The block acceptance criteria this task answers.', items: { type: 'string' } },
                        writesPaths: { type: 'array', description: 'Paths this task wrote; each must be inside the approved scope.', items: { type: 'string' } },
                    },
                },
            },
            verify: {
                type: 'object',
                additionalProperties: false,
                description: 'Verification switches. `blockSupervisor: false` skips the judge and says so in the answer. Omit to use the switch the block was ordered with.',
                properties: { blockSupervisor: { type: 'boolean', description: 'Default true.' } },
            },
            override: {
                type: 'object',
                additionalProperties: false,
                description: 'A human overruling the SCOPE veto only. Recorded in the verdict.',
                properties: {
                    who: { type: 'string', required: true, description: 'Who overruled it.' },
                    why: { type: 'string', required: true, description: 'Why, in their words.' },
                },
            },
        },
        output: { schema: { type: 'json' }, render: (_args, value) => textResult(value) },
        isConcurrencySafe: () => false,
        async execute(args, exec) {
            alive();
            const agent = agentOf(exec);
            admit(agent);
            const blockId = String(args.block_id ?? '').trim();
            if (blockId === '')
                throw new BlockToolError('invalid', 'close 需要 block_id');
            const handoff = String(args.handoff ?? '');
            if (handoff.trim() === '')
                throw new BlockToolError('invalid', 'close 需要四行交接（handoff）');
            const row = await getBlockRow(blockId).catch(refuse);
            if (row === undefined)
                throw new BlockToolError('not-found', `账本里没有块 ${blockId}`);
            const block = blockOf(row, selectorOf(args));
            const tasks = tasksOf(Array.isArray(args.tasks) ? args.tasks : undefined, block);
            const verify = args.verify;
            // The judge default was fixed at order time, not at hand-off: the switch the
            // caller set on `grok_open_block` rides on the row (`BlockRow.verify`), so a
            // resume after a restart cannot re-declare it. A row written before that field
            // existed has no `verify` key, and an absent key means on — the pre-existing
            // behaviour. The tool argument still wins when it is given.
            const wanted = row.verify?.blockSupervisor !== false;
            const judge = verify?.blockSupervisor ?? wanted;
            if (!judge)
                logger.warn(`block ${blockId}: 本次未过监工（verify.blockSupervisor=false），只跑了确定性检查`);
            const outcome = await runBlockSupervisor({
                ctx,
                config: config(),
                logger,
                agent,
                row,
                block,
                handoff,
                tasks,
                ...args.override === undefined ? {} : { override: args.override },
                judge,
                ...deps.now === undefined ? {} : { now: deps.now() },
            });
            const view = verdictView(outcome.verdict, outcome.ledgerPath);
            if (outcome.outcome === 'veto') {
                return {
                    block_id: row.id,
                    ...view,
                    evidence_unchanged: outcome.evidenceUnchanged,
                    judged: outcome.judged,
                    ...judge ? {} : { not_judged: '本次未过监工（verify.blockSupervisor=false）' },
                    warnings: outcome.warnings,
                    // A veto writes nothing but the verdict line; the block stays exactly as it was.
                    block_status: block.status,
                };
            }
            // Pass: the block becomes `accepted` in a new row version, carrying the split it
            // was judged on. Nothing is rewritten — the earlier versions stay readable.
            const accepted = { ...block, status: 'accepted', tasks };
            try {
                await appendBlockRow(withBlock(row, accepted, nowMs()));
            }
            catch (error) {
                refuse(error);
            }
            return {
                block_id: row.id,
                ...view,
                evidence_unchanged: outcome.evidenceUnchanged,
                judged: outcome.judged,
                ...judge ? {} : { not_judged: '本次未过监工（verify.blockSupervisor=false）' },
                warnings: outcome.warnings,
                block_status: 'accepted',
                ledger_path: blocksFile(),
            };
        },
    });
    const statusTool = defineTool({
        name: BLOCK_TOOL_NAMES.status,
        description: [
            'Read a block back: its status, tasks, verdicts, vetoes, checkpoint and where its records live.',
            'Without block_id it lists this session\'s blocks, one line each.',
        ].join(' '),
        parameters: {
            block_id: { type: 'string', description: 'Omit to list this session\'s blocks.' },
            block: {
                type: 'string',
                description: 'Optional: which block inside the row (`blk-2` or its title). Defaults to the first block still open.',
            },
        },
        output: { schema: { type: 'json' }, render: (_args, value) => textResult(value) },
        isConcurrencySafe: () => true,
        async execute(args, exec) {
            alive();
            const agent = agentOf(exec);
            admit(agent);
            const blockId = String(args.block_id ?? '').trim();
            const options = { dir: dir() };
            const read = await readBlockRows(options).catch(refuse);
            const latest = new Map();
            for (const row of read) {
                const seen = latest.get(row.id);
                if (seen === undefined || row.version > seen.version)
                    latest.set(row.id, row);
            }
            if (blockId === '') {
                const sessionId = sessionIdOf(agent);
                const mine = [...latest.values()].filter(row => row.sessionId === sessionId);
                return {
                    blocks: mine.flatMap(row => row.blocks.map(block => ({
                        block_id: row.id,
                        block: block.id,
                        title: block.title,
                        status: block.status,
                        execution: block.execution,
                        plan_id: block.planId ?? null,
                        version: row.version,
                        updated_at: row.updatedAt,
                        depends_on: block.dependsOn,
                        progress: progressOf(row),
                    }))),
                    ledger_path: blocksFile(options),
                    verdicts_path: verdictsFile(options),
                    heartbeats_path: heartbeatsFile(options),
                    heartbeats: readHeartbeatObservations(options).filter(entry => entry.sessionId === sessionId).length,
                    skipped_lines: read.skipped.length,
                };
            }
            const row = latest.get(blockId) ?? await getBlockRow(blockId, options).catch(refuse);
            if (row === undefined)
                throw new BlockToolError('not-found', `账本里没有块 ${blockId}`);
            const block = blockOf(row, selectorOf(args));
            const verdicts = await verdictsFor(row.id, options).catch(refuse);
            return {
                block_id: row.id,
                title: block.title,
                objective: block.objective,
                deliverable: block.deliverable,
                status: block.status,
                execution: block.execution,
                ...block.owner === undefined ? {} : { owner: block.owner },
                plan_id: block.planId ?? null,
                acceptance: block.acceptance,
                writes_paths: block.writesPaths,
                depends_on: block.dependsOn,
                tasks: block.tasks,
                progress: progressOf(row),
                version: row.version,
                approval: { kind: row.approval.kind, quote: row.approval.quote, at: row.approval.at },
                verdicts: verdicts.map(verdict => verdictView(verdict, verdictsFile(options))),
                vetoes: verdicts.filter(verdict => verdict.outcome === 'veto').length,
                checkpoint: block.checkpoint ?? null,
                report: {
                    run_id: block.runId ?? null,
                    checkpoint: block.checkpoint ?? null,
                    verdicts_path: verdictsFile(options),
                    ledger_path: blocksFile(options),
                },
                heartbeats: readHeartbeatObservations(options).filter(entry => entry.blockIds.includes(row.id)),
                ledger_path: blocksFile(options),
                verdicts_path: verdictsFile(options),
            };
        },
    });
    const steerTool = defineTool({
        name: BLOCK_TOOL_NAMES.steer,
        description: [
            'Steer a block that a workflow is running: queue one demand for its next wave boundary.',
            'A block a foreman owns is steered with send_message to the foreman instead; this tool says so and queues nothing.',
        ].join(' '),
        parameters: {
            block_id: { type: 'string', required: true, description: 'The block to steer.' },
            block: {
                type: 'string',
                description: 'Optional: which block inside the row (`blk-2` or its title). Defaults to the first block still open.',
            },
            text: { type: 'string', required: true, description: 'What the user wants changed.' },
        },
        output: { schema: { type: 'json' }, render: (_args, value) => textResult(value) },
        isConcurrencySafe: () => false,
        async execute(args, exec) {
            alive();
            const agent = agentOf(exec);
            admit(agent);
            const blockId = String(args.block_id ?? '').trim();
            const text = String(args.text ?? '').trim();
            if (blockId === '')
                throw new BlockToolError('invalid', 'steer 需要 block_id');
            if (text === '')
                throw new BlockToolError('invalid', 'steer 需要 text');
            const row = await getBlockRow(blockId).catch(refuse);
            if (row === undefined)
                throw new BlockToolError('not-found', `账本里没有块 ${blockId}`);
            const block = blockOf(row, selectorOf(args));
            if (block.execution !== 'workflow') {
                throw new BlockToolError('invalid', `这一块是包工头执行的（execution: ${block.execution}），用 send_message 找包工头，不入 steering 队列`);
            }
            const queue = steeringForSession(sessionIdOf(agent));
            if (queue === undefined) {
                throw new BlockToolError('invalid', '这一块现在没有在跑的 workflow，没有可投递的边界；等它跑起来再发，或者直接改要求');
            }
            const queued = queue.push(text, nowMs());
            return { block_id: row.id, queued, pending: queue.size, dropped: queue.dropped };
        },
    });
    const stopTool = defineTool({
        name: BLOCK_TOOL_NAMES.stop,
        description: [
            'Stop the workflow a block is running in.',
            'A foreman-owned block is stopped by messaging the foreman; this tool says so and cancels nothing.',
        ].join(' '),
        parameters: {
            block_id: { type: 'string', required: true, description: 'The block to stop.' },
            block: {
                type: 'string',
                description: 'Optional: which block inside the row (`blk-2` or its title). Defaults to the first block still open.',
            },
        },
        output: { schema: { type: 'json' }, render: (_args, value) => textResult(value) },
        isConcurrencySafe: () => false,
        async execute(args, exec) {
            alive();
            admit(agentOf(exec));
            const blockId = String(args.block_id ?? '').trim();
            if (blockId === '')
                throw new BlockToolError('invalid', 'stop 需要 block_id');
            const row = await getBlockRow(blockId).catch(refuse);
            if (row === undefined)
                throw new BlockToolError('not-found', `账本里没有块 ${blockId}`);
            const block = blockOf(row, selectorOf(args));
            if (block.execution !== 'workflow') {
                throw new BlockToolError('invalid', `这一块是包工头执行的（execution: ${block.execution}），用 send_message 找包工头叫停，这里不取消任何东西`);
            }
            if (block.runId === undefined || block.runId === '') {
                return { block_id: row.id, stopped: false, reason: '这一块还没有记下 run_id，没有可停的运行' };
            }
            const runs = deps.state?.runs ?? new Set();
            for (const run of runs) {
                if (String(run.id) !== block.runId)
                    continue;
                await Promise.resolve(run.cancel(`block ${row.id} stopped by the operator`));
                return { block_id: row.id, stopped: true, run_id: block.runId };
            }
            return { block_id: row.id, stopped: false, run_id: block.runId, reason: '这个 run 已经不在跑（可能已经结束）' };
        },
    });
    for (const tool of [openTool, acceptTool, closeTool, statusTool, steerTool, stopTool]) {
        ctx.tools.register(tool);
    }
    logger.info?.(`block intake: registered ${Object.values(BLOCK_TOOL_NAMES).length} tools (ledger ${blockLedgerDir()})`);
}
//# sourceMappingURL=tools.js.map