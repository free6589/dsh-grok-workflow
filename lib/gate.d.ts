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
 * - A rejected batch never becomes a `user/message` event, so this plugin keeps
 *   its own delivery records and delivers the validated report afterwards.
 *
 * The gate fails closed: when it cannot run the workflow it still refuses the
 * step and states the reason, because passing the message through would let the
 * main model answer directly.
 *
 * Deployment precondition (design note, not a guarantee): the run continues
 * after the turn ends, so the agent tree must stay alive until the workflow
 * settles. A one-shot app tears the tree down as soon as the turn closes
 * `blocked`, which aborts the run and fails the delivery. Long-lived apps are
 * unaffected. Keep-alive options — a dedicated maintenance task or a child run
 * held open until the run settles — are **not implemented and not measured**;
 * the measured facts are in docs/knowledge/WORKFLOW-DESIGN.md (G-18, F9, NR-1).
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { UserMessage } from '@deepseek-ai/dsh-llm';
import type { ActiveState, WorkflowLogger } from './run.js';
import type { ResolvedConfig } from './types.js';
/** Payload shape of one `agent/pre-step` dispatch. */
export interface PreStepPayload {
    agent: Agent;
    messages: UserMessage[];
    turn: number;
    step: number;
    signal: AbortSignal;
}
/** Dependencies of the gate. */
export interface GateDeps {
    ctx: Context;
    config: ResolvedConfig;
    state: ActiveState;
    logger: WorkflowLogger;
}
/** Verdict for one claimed batch. */
type Classification = {
    kind: 'pass';
    reason: string;
} | {
    kind: 'admit';
    agent: Agent;
    agentId: string;
    key: string;
    request: string;
    turn: number;
};
/**
 * Decide what to do with one claimed batch.
 *
 * Classification reads `payload.messages` only: `decision.messages` is appended
 * to by other listeners, so it cannot identify a new user message.
 */
export declare function classifyPreStep(deps: Pick<GateDeps, 'config'>, payload: PreStepPayload): Classification;
/** Install the gate; returns false when the runtime cannot host `agent/pre-step`. */
export declare function installGate(deps: GateDeps): boolean;
export {};
//# sourceMappingURL=gate.d.ts.map