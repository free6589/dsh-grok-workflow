/**
 * The one model call behind a block's verdict, and the parser for its answer.
 *
 * The supervisor is a judge, so the call is shaped like a judge's question and
 * nothing else: one child, one schema, one answer per acceptance criterion. Two
 * properties are load-bearing:
 *
 * - **Bounded.** One `agent()` call, `maxTotalAgents: 1`, no parallel fan-out. The
 *   verdict is worth one child; it is not worth a second plan.
 * - **Retried once, in the same attempt.** A transport death or an unparseable
 *   answer is not a verdict — it is the absence of one. Following D-123's rule for
 *   judge legs, the leg is re-fired once before it is allowed to become a veto, and a
 *   second failure is reported as `监工调用失败` rather than as a judgement about the
 *   work.
 *
 * The route comes from `roles.supervisor`: the chain's head on the first try, the next
 * route on the retry when one is configured (so a dead route is not asked twice).
 * An empty chain means "inherit the session's route", exactly like every other role.
 */
import { sha256Hex } from '../block/index.js';
import { canonicalJson } from '../block/index.js';
import { teamWorkflowEngine } from '../team-engine.js';
import { redactError } from '../redact.js';
/** Run name shown in the progress panel for a block verdict. */
export const SUPERVISOR_RUN_NAME = 'Block supervisor';
/** Child label inside the run. */
export const SUPERVISOR_LABEL = 'block-supervisor';
/** Why the supervisor could not produce a verdict at all. */
export const SUPERVISOR_FAILED = '监工调用失败';
/**
 * The note a skipped close leaves as the evidence of every criterion.
 *
 * A criterion has only `met: true/false`, so a close that never asked the judge cannot
 * say "unknown" per criterion. It says this instead, and the row's `outcome: 'skipped'`
 * is what makes the record honest: the `met: true` here is not a judgement, it is the
 * absence of one, and a reader that shows it as a pass is reading the record wrong.
 */
export const SKIPPED_JUDGE_NOTE = '未过监工：按调用方要求跳过（verify.blockSupervisor=false），这一条没有判过';
/** The structured answer the child is asked for. */
const ANSWER_SCHEMA = {
    type: 'object',
    required: ['criteria'],
    properties: {
        criteria: {
            type: 'array',
            items: {
                type: 'object',
                required: ['text', 'met', 'evidence'],
                properties: {
                    text: { type: 'string' },
                    met: { type: 'boolean' },
                    evidence: { type: 'array', items: { type: 'string' } },
                },
            },
        },
    },
};
/**
 * The guest script: one `agent()` call, one object back.
 *
 * Written as a string because the engine runs it in its own realm; a string answer and
 * a structured answer are both accepted so the host reads one field either way.
 * @param prompt - the whole prompt handed to the child.
 * @param route - optional provider/model override.
 * @returns the script body.
 */
export function supervisorScript(prompt, route) {
    const call = { label: SUPERVISOR_LABEL, phase: 'Verdict', schema: ANSWER_SCHEMA };
    if (route.provider !== undefined)
        call['provider'] = route.provider;
    if (route.model !== undefined)
        call['model'] = route.model;
    return `const value = await agent(${JSON.stringify(prompt)}, ${JSON.stringify(call)})
if (typeof value === 'string') return { answer: value }
if (value && typeof value === 'object') return { answer: value }
return { answer: null }
`;
}
/**
 * The question: every acceptance criterion, what was claimed, and what evidence says.
 *
 * The prompt states the two rules the verdict must obey — `met` needs evidence from the
 * handoff, and a criterion the handoff never mentions is `met: false` — because a judge
 * that invents evidence is worse than no judge.
 * @param block - the block being closed.
 * @param tasks - the task split reported at close.
 * @param handoff - the four-line handoff.
 * @returns the prompt.
 */
export function supervisorPrompt(block, tasks, handoff) {
    const criteria = block.acceptance.map((text, index) => `${index + 1}. ${text}`).join('\n');
    const split = tasks.length === 0
        ? '（这次交工没有报任务拆法）'
        : tasks.map(task => `- ${task.title}：${task.acceptanceCriteria.join('；')}${task.writesPaths.length === 0 ? '' : `（写 ${task.writesPaths.join('、')}）`}`).join('\n');
    return [
        `你是「${block.title}」这一块的独立监工。只判一件事：交接里写的东西，是否真的满足了下面每一条验收。`,
        '',
        `目标：${block.objective}`,
        `交付物：${block.deliverable}`,
        '',
        '验收条件（逐条判）：',
        criteria,
        '',
        '交工报上来的任务拆法：',
        split,
        '',
        '四行交接：',
        handoff.trim(),
        '',
        '规则：',
        '1. 每条验收给一个 met（true/false）和 evidence（交接里支持它的原话，逐字引用；没有就留空数组）。',
        '2. 交接没有提到的验收一律 met=false。不要推测，不要替它补证据。',
        '3. 只回一个 JSON 对象：{"criteria":[{"text":"<验收原文>","met":true,"evidence":["<交接原话>"]}]}。',
    ].join('\n');
}
/** The route the call used, for the verdict row. */
function routeLabel(route) {
    if (route.model === undefined)
        return 'inherit';
    return route.provider === undefined || route.provider === '' ? route.model : `${route.provider}/${route.model}`;
}
/**
 * Parse the child's answer into criteria, refusing anything that is not one.
 *
 * A missing criterion, a non-boolean `met` or a non-array `evidence` is a *format*
 * failure (retryable), not a `met: false` — inventing a "no" from a malformed answer
 * would report a judgement nobody made.
 * @param answer - the value the child returned.
 * @param expected - the acceptance criteria, in order.
 * @returns the parsed criteria, or the reason it could not be parsed.
 */
export function parseSupervisorAnswer(answer, expected) {
    const payload = typeof answer === 'string' ? tryJson(answer) : answer;
    const rows = payload?.criteria;
    if (!Array.isArray(rows))
        return { ok: false, reason: '答案里没有 criteria 数组' };
    const byText = new Map();
    for (const row of rows) {
        if (typeof row !== 'object' || row === null)
            return { ok: false, reason: 'criteria 里有一项不是对象' };
        const entry = row;
        if (typeof entry.text !== 'string' || entry.text.trim() === '')
            return { ok: false, reason: '有一条验收没有 text' };
        if (typeof entry.met !== 'boolean')
            return { ok: false, reason: `「${entry.text}」的 met 不是布尔值` };
        if (!Array.isArray(entry.evidence) || entry.evidence.some(item => typeof item !== 'string')) {
            return { ok: false, reason: `「${entry.text}」的 evidence 不是字符串数组` };
        }
        byText.set(entry.text.replace(/\s+/g, ' ').trim(), {
            text: entry.text.trim(),
            met: entry.met,
            evidence: entry.evidence.map(item => item.trim()).filter(item => item !== ''),
        });
    }
    const criteria = [];
    for (const text of expected) {
        const found = byText.get(text.replace(/\s+/g, ' ').trim());
        if (found === undefined)
            return { ok: false, reason: `监工漏判了验收「${text}」` };
        criteria.push(found);
    }
    return { ok: true, criteria };
}
function tryJson(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        // A fenced block is the one wrapping a model adds without being asked.
        const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
        if (fenced === null)
            return undefined;
        try {
            return JSON.parse(fenced[1]);
        }
        catch {
            return undefined;
        }
    }
}
/**
 * Ask the supervisor once, retrying once in the same attempt on a transport or format
 * failure (D-123's rule for judge legs).
 *
 * @param input - context, agent, prompt and the route chain.
 * @returns the parsed criteria, or why there are none.
 */
export async function callBlockSupervisor(input) {
    const { ctx, logger, agent, prompt } = input;
    const routes = input.routes.length === 0 ? [{}] : [...input.routes];
    let lastReason = '监工没有给出答案';
    let used = routeLabel(routes[0]);
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const route = routes[Math.min(attempt, routes.length - 1)];
        used = routeLabel(route);
        const outcome = await oneCall(ctx, logger, agent, prompt, route, attempt > 0, input.signal);
        if (outcome.ok) {
            const parsed = parseSupervisorAnswer(outcome.answer, input.criteria);
            if (parsed.ok)
                return { ok: true, criteria: parsed.criteria, route: used, retried: attempt > 0 };
            lastReason = parsed.reason;
            continue;
        }
        lastReason = outcome.reason;
    }
    return { ok: false, reason: lastReason, route: used, retried: true };
}
/** One engine round-trip. Never throws. */
async function oneCall(ctx, logger, agent, prompt, route, resubmit, signal) {
    const shaped = resubmit
        ? `${prompt}\n\n上一次的答案不是可解析的 JSON。只回 JSON 对象，不要解释，不要代码块。`
        : prompt;
    const request = {
        script: supervisorScript(shaped, route),
        meta: {
            name: SUPERVISOR_RUN_NAME,
            description: 'Judge one finished block against its acceptance criteria (one child call).',
            phases: [{ title: 'Verdict', detail: 'One judge reads the handoff and answers per criterion.' }],
        },
        args: {},
        parent: agent,
        ...signal === undefined ? {} : { signal },
        // One child: a verdict is a reading of the handoff, not a second plan.
        maxTotalAgents: 1,
    };
    try {
        const run = await teamWorkflowEngine(ctx, logger).start(request);
        const result = await run.result;
        try {
            await run.dispose();
        }
        catch { /* the engine owns the run's lifetime */ }
        if (result.stopReason !== 'completed') {
            return { ok: false, reason: `监工这一轮停了：${result.stopReason}${result.error === undefined ? '' : `（${result.error}）`}` };
        }
        const value = result.value;
        const answer = value === null || value === undefined ? undefined : value.answer;
        if (answer === undefined || answer === null || answer === '') {
            logger.warn(`block supervisor produced no answer (agentsStarted=${result.agentsStarted})`);
            return { ok: false, reason: '监工没有交出任何答案' };
        }
        return { ok: true, answer };
    }
    catch (error) {
        logger.warn(`block supervisor call failed: ${redactError(error)}`);
        return { ok: false, reason: redactError(error) };
    }
}
/**
 * The hash that decides whether two closes are the same close.
 *
 * Same block, same criteria, same split, same handoff → same verdict, and a re-submit
 * must not append a second line. Everything the supervisor read goes in, so a changed
 * handoff is a new attempt and an unchanged one is not.
 */
export function evidenceHashOf(input) {
    return sha256Hex(canonicalJson({
        blockId: input.blockId,
        acceptance: input.acceptance,
        tasks: input.tasks.map(task => ({
            title: task.title,
            acceptanceCriteria: task.acceptanceCriteria,
            writesPaths: task.writesPaths,
        })),
        handoff: input.handoff.replace(/\r\n/g, '\n').trim(),
    }));
}
/** The reasons a set of criteria yields, in criterion order. */
export function reasonsFromCriteria(criteria) {
    return criteria
        .filter(criterion => !criterion.met)
        .map(criterion => ({
        criterion: criterion.text,
        evidence: criterion.evidence.length === 0 ? '(交接里没有对着它的原话)' : criterion.evidence.join('；'),
        why: '监工认为这条验收没有被交接里的证据满足',
    }));
}
//# sourceMappingURL=verdict.js.map