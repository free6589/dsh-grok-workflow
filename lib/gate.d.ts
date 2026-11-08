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
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { Session } from '@deepseek-ai/dsh-session';
import type { UserMessage } from '@deepseek-ai/dsh-llm';
import type { ActiveState, WorkflowLogger } from './run.js';
import type { RecallSource } from './triage.js';
import type { ResolvedConfig, WorkflowReport } from './types.js';
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
    /**
     * Where the memory files the look-up pass may read live.
     *
     * Defaults to `<cwd>/docs/knowledge` (the directory this plugin's own
     * `AGENTS.md` names as durable memory), or to `GROK_WORKFLOW_KNOWLEDGE_DIRS`
     * when that environment variable is set. Tests pass a temporary directory so
     * the pass is deterministic and never depends on the repository's own docs.
     */
    memoryDocRoots?: readonly string[];
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
export declare function memoryDocRoots(env?: NodeJS.ProcessEnv, cwd?: string): string[];
/** One memory file read from disk; `text` is already redacted and bounded. */
export interface MemoryDoc {
    path: string;
    text: string;
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
export declare function readMemoryDocs(roots: readonly string[], bounds?: {
    files: number;
    fileChars: number;
    totalChars: number;
}): MemoryDoc[];
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
export declare function collectRecallSources(session: Session | undefined, roots: readonly string[], exclude?: string): RecallSource[];
/**
 * Decide what to do with one claimed batch.
 *
 * Classification reads `payload.messages` only: `decision.messages` is appended
 * to by other listeners, so it cannot identify a new user message.
 */
export declare function classifyPreStep(deps: Pick<GateDeps, 'config' | 'readConfig'>, payload: PreStepPayload): Classification;
/**
 * User-visible terminal for a cancelled turn (P0-4).
 *
 * A cancellation that ends silently is indistinguishable from a hang, and the two
 * used to be exactly that. The text names the state, keeps the completed/partial
 * split honest, and never reads as success.
 *
 * @param reason - Optional measured reason; empty when there is none to state.
 */
export declare function cancelledText(reason: string, report?: WorkflowReport): string;
/** Install the gate; returns false when the runtime cannot host `agent/pre-step`. */
export declare function installGate(deps: GateDeps): boolean;
export {};
//# sourceMappingURL=gate.d.ts.map