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
import { type TaskBoard } from './store.js';
import { type TaskboardOptions } from './types.js';
/** Environment override for the board directory (tests, e2e, alternate profiles). */
export declare const TASKBOARD_DIR_ENV: "GROK_WORKFLOW_TASKBOARD_DIR";
/** Caller-supplied location; an explicit `dir` wins over everything else. */
export interface TaskboardDirectoryOptions {
    dir?: string | undefined;
}
/**
 * Resolve the board directory.
 * @param options - caller options; `dir` wins over the environment.
 * @returns The board directory (not created until the first mutation).
 */
export declare function taskboardDir(options?: TaskboardDirectoryOptions): string;
/** Path of the board's single store file: `<taskboardDir>/store.jsonl`. */
export declare function taskboardFile(options?: TaskboardDirectoryOptions): string;
/**
 * Open the board at the resolved location (creating it on first write).
 * @param options - directory options plus the per-board lock tunables.
 */
export declare function openDefaultTaskboard(options?: TaskboardDirectoryOptions & TaskboardOptions): Promise<TaskBoard>;
//# sourceMappingURL=paths.d.ts.map