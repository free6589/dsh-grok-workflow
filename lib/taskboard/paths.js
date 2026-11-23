/**
 * Where the durable task board lives.
 *
 * The board itself never chooses a directory — `openTaskboard(dir)` takes one
 * from the caller. This module is the one place that answers "which directory"
 * for callers that do not care, with the same three-step rule the checkpoint
 * recorder and the memory archive already use (`src/checkpoint/wiring.ts`
 * `checkpointDir`, `src/memory/archive.ts` `archiveDir`):
 *
 * 1. an explicit `dir` from the caller;
 * 2. `GROK_WORKFLOW_TASKBOARD_DIR`, so tests and e2e lanes can redirect the
 *    board without a configuration key and without touching a real `$DSH_HOME`;
 * 3. `$DSH_HOME` (else `~/.dsh`) + `taskboards/grok-workflow`.
 *
 * Inside that directory the store is exactly one file, `store.jsonl`: one
 * checksummed JSON line per task row, atomically replaced (hidden `*.tmp`
 * write, fsync, rename). The claim lock is `.store.jsonl.lock`, held only for
 * the duration of one mutation and removed afterwards. Both names come from
 * `./types.ts` so a reader never guesses a path.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { openTaskboard } from './store.js';
import { TASKBOARD_STORE_FILE } from './types.js';
/** Environment override for the board directory (tests, e2e, alternate profiles). */
export const TASKBOARD_DIR_ENV = 'GROK_WORKFLOW_TASKBOARD_DIR';
/**
 * Resolve the board directory.
 * @param options - caller options; `dir` wins over the environment.
 * @returns The board directory (not created until the first mutation).
 */
export function taskboardDir(options = {}) {
    if (options.dir !== undefined && options.dir.trim() !== '')
        return options.dir;
    const override = process.env[TASKBOARD_DIR_ENV];
    if (override !== undefined && override.trim() !== '')
        return override;
    const home = process.env.DSH_HOME;
    const base = home !== undefined && home.trim() !== '' ? home : join(homedir(), '.dsh');
    return join(base, 'taskboards', 'grok-workflow');
}
/** Path of the board's single store file: `<taskboardDir>/store.jsonl`. */
export function taskboardFile(options = {}) {
    return join(taskboardDir(options), TASKBOARD_STORE_FILE);
}
/**
 * Open the board at the resolved location (creating it on first write).
 * @param options - directory options plus the per-board lock tunables.
 */
export function openDefaultTaskboard(options = {}) {
    return openTaskboard(taskboardDir(options), {
        lockTimeoutMs: options.lockTimeoutMs,
        lockStaleMs: options.lockStaleMs,
    });
}
//# sourceMappingURL=paths.js.map