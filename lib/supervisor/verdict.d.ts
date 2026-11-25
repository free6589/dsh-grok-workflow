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
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { BlockEntry, BlockTaskRow, VerdictCriterion, VerdictReason } from '../block/index.js';
import type { ModelRoute } from '../types.js';
/**
 * A route as this module uses it.
 *
 * Both halves are optional so "inherit the session's route" is expressible without
 * inventing a model id; `RouteChoice` (the configured chain entry) narrows into it.
 */
export type RouteChoice = {
    provider?: string;
    model?: string;
};
import type { WorkflowLogger } from '../run.js';
/** Run name shown in the progress panel for a block verdict. */
export declare const SUPERVISOR_RUN_NAME = "Block supervisor";
/** Child label inside the run. */
export declare const SUPERVISOR_LABEL = "block-supervisor";
/** Why the supervisor could not produce a verdict at all. */
export declare const SUPERVISOR_FAILED = "\u76D1\u5DE5\u8C03\u7528\u5931\u8D25";
/**
 * The guest script: one `agent()` call, one object back.
 *
 * Written as a string because the engine runs it in its own realm; a string answer and
 * a structured answer are both accepted so the host reads one field either way.
 * @param prompt - the whole prompt handed to the child.
 * @param route - optional provider/model override.
 * @returns the script body.
 */
export declare function supervisorScript(prompt: string, route: RouteChoice): string;
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
export declare function supervisorPrompt(block: BlockEntry, tasks: readonly BlockTaskRow[], handoff: string): string;
/** What one supervisor attempt produced. */
export type SupervisorAnswer = {
    ok: true;
    criteria: VerdictCriterion[];
    route: string;
    retried: boolean;
} | {
    ok: false;
    reason: string;
    route: string;
    retried: boolean;
};
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
export declare function parseSupervisorAnswer(answer: unknown, expected: readonly string[]): {
    ok: true;
    criteria: VerdictCriterion[];
} | {
    ok: false;
    reason: string;
};
/** Everything one supervisor call needs. */
export interface SupervisorCallInput {
    ctx: Context;
    logger: WorkflowLogger;
    agent: Agent;
    prompt: string;
    /** Candidate routes from `roles.supervisor`; empty means "inherit". */
    routes: readonly ModelRoute[];
    /** The acceptance criteria the prompt asked about, in order. */
    criteria: readonly string[];
    signal?: AbortSignal;
}
/**
 * Ask the supervisor once, retrying once in the same attempt on a transport or format
 * failure (D-123's rule for judge legs).
 *
 * @param input - context, agent, prompt and the route chain.
 * @returns the parsed criteria, or why there are none.
 */
export declare function callBlockSupervisor(input: SupervisorCallInput): Promise<SupervisorAnswer>;
/**
 * The hash that decides whether two closes are the same close.
 *
 * Same block, same criteria, same split, same handoff → same verdict, and a re-submit
 * must not append a second line. Everything the supervisor read goes in, so a changed
 * handoff is a new attempt and an unchanged one is not.
 */
export declare function evidenceHashOf(input: {
    blockId: string;
    acceptance: readonly string[];
    tasks: readonly BlockTaskRow[];
    handoff: string;
}): string;
/** The reasons a set of criteria yields, in criterion order. */
export declare function reasonsFromCriteria(criteria: readonly VerdictCriterion[]): VerdictReason[];
//# sourceMappingURL=verdict.d.ts.map