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
 * Round-57: the session persists to `store.jsonl` through the `TaskBoard`
 * store (reads via the round-56 `boardReader` adapter). Every forwarding
 * function is async — await it, then the board already holds the decision.
 * `createDispatcherSession` stays sync (construct + start, no disk writes).
 *
 * Only `handleDispatcherRawIntent` is meant to sit behind a gate branch: the
 * gate parses the operator's stop/run command into a plain `{op, id, ...}`
 * object and forwards it. The dispatcher refuses everything outside its
 * four-operation whitelist with an explicit, user-readable error, so the
 * gate only needs to state the returned `message`.
 */
import { DISPATCHER_OPS, decideIntent, decideRawIntent, isAddressPath, isFullSubagentPath, resultRecipient, } from './policy.js';
import { DispatcherSession } from './session.js';
import { boardReader } from './board-reader.js';
export { DISPATCHER_OPS, decideIntent, decideRawIntent, DispatcherSession, boardReader, isAddressPath, isFullSubagentPath, resultRecipient, };
/**
 * Open a dispatcher session.
 *
 * @param boardDir - directory holding `store.jsonl`. Omit for a memory-only
 *   session (tests, embeddings without a workspace); pass a workspace
 *   directory in production so `stop()`/`resume()` survive restarts. The
 *   board itself opens lazily on the first `handle`/`resume`, so this stays
 *   synchronous. `start()` clears prior state for directory sessions too —
 *   use `resume()` for existing state, never `start()`.
 */
export function createDispatcherSession(boardDir) {
    const session = new DispatcherSession(boardDir);
    session.start();
    return session;
}
/**
 * Forward one typed intent to the session (decide, then apply when allowed).
 */
export function handleDispatcherIntent(session, intent) {
    return session.handle(intent);
}
/**
 * Forward one gate-side JSON intent to the session.
 *
 * This is the gate's only call surface: unknown operations, verdict writes,
 * edits of completed/running tasks, and intents on an inactive session are
 * all refused with an explicit message the gate can state verbatim.
 */
export function handleDispatcherRawIntent(session, raw) {
    return session.handleRaw(raw);
}
/**
 * Shut the session down (every allowed write already persisted).
 */
export function stopDispatcherSession(session) {
    return session.stop();
}
/**
 * Recover the session from its persisted board.
 *
 * Returns `restored: true` with the task count when a store existed,
 * `restored: false` with an empty board on first start. Throws (fail closed)
 * on a corrupt file and leaves the session inactive.
 */
export function resumeDispatcherBoard(session) {
    return session.resume();
}
//# sourceMappingURL=dispatcher.js.map