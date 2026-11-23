/**
 * L1 dispatcher: the resident steward's public entry.
 *
 * The dispatcher is a pure decision layer for the gate: it records what
 * happened, hands pending work to owners, and reclaims stuck tasks. It never
 * executes work itself and never judges it (no verdicts, no verification) —
 * those belong to the workflow run and the verifier.
 *
 * Gate integration (minimal, by design):
 * - `createDispatcherSession(boardDir?)` owns the board and the lifecycle;
 * - `handleDispatcherIntent(session, intent)` forwards one typed intent;
 * - `handleDispatcherRawIntent(session, raw)` forwards one gate-side JSON
 *   intent (unknown operations and verdict writes are refused there).
 * - `resumeDispatcherBoard(session)` / `stopDispatcherSession(session)` are
 *   the recovery and shutdown entries; resume reloads the persisted board.
 *
 * Only `handleDispatcherRawIntent` is meant to sit behind a gate branch: the
 * gate parses the operator's stop/run command into a plain `{op, id, ...}`
 * object and forwards it. The dispatcher refuses everything outside its
 * four-operation whitelist with an explicit, user-readable error, so the
 * gate only needs to state the returned `message`.
 */
import { DISPATCHER_OPS, decideIntent, decideRawIntent, type DispatcherDecision, type DispatcherIntent, type DispatcherLifecycle, type DispatcherOp, type DispatcherRefusalCode, type DispatcherTask, type TaskReader } from './policy.js';
import { DispatcherSession, type DispatcherBoardFile, type DispatcherResumeResult } from './session.js';
import { boardReader } from './board-reader.js';
export type { DispatcherBoardFile, DispatcherDecision, DispatcherIntent, DispatcherLifecycle, DispatcherOp, DispatcherRefusalCode, DispatcherResumeResult, DispatcherTask, TaskReader, };
export { DISPATCHER_OPS, decideIntent, decideRawIntent, DispatcherSession, boardReader };
/**
 * Open a dispatcher session.
 *
 * @param boardDir - directory holding `board.json`. Omit for a memory-only
 *   session (tests, embeddings without a workspace); pass a workspace
 *   directory in production so `stop()`/`resume()` survive restarts.
 */
export declare function createDispatcherSession(boardDir?: string): DispatcherSession;
/**
 * Forward one typed intent to the session (decide, then apply when allowed).
 */
export declare function handleDispatcherIntent(session: DispatcherSession, intent: DispatcherIntent): DispatcherDecision;
/**
 * Forward one gate-side JSON intent to the session.
 *
 * This is the gate's only call surface: unknown operations, verdict writes,
 * edits of completed/running tasks, and intents on an inactive session are
 * all refused with an explicit message the gate can state verbatim.
 */
export declare function handleDispatcherRawIntent(session: DispatcherSession, raw: Record<string, unknown>): DispatcherDecision;
/**
 * Shut the session down (persists when a directory was given).
 */
export declare function stopDispatcherSession(session: DispatcherSession): void;
/**
 * Recover the session from its persisted board.
 *
 * Returns `restored: true` with the task count when a board file existed,
 * `restored: false` with an empty board on first start. Throws (fail closed)
 * on a corrupt file and leaves the session inactive.
 */
export declare function resumeDispatcherBoard(session: DispatcherSession): DispatcherResumeResult;
//# sourceMappingURL=dispatcher.d.ts.map