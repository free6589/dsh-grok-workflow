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
    /**
     * Read the current configuration. Called at every decision so a settings edit
     * applies to the next admitted message; when absent the load-time snapshot is
     * used (tests and embeddings without a settings surface).
     */
    readConfig?: () => ResolvedConfig;
    /**
     * The last configuration that validated. Delivery decisions fall back to it, so
     * a broken edit cannot silently undo an edit that had already taken effect.
     */
    lastGoodConfig?: () => ResolvedConfig;
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
export declare function classifyPreStep(deps: Pick<GateDeps, 'config' | 'readConfig'>, payload: PreStepPayload): Classification;
/** Install the gate; returns false when the runtime cannot host `agent/pre-step`. */
export declare function installGate(deps: GateDeps): boolean;
export {};
//# sourceMappingURL=gate.d.ts.map