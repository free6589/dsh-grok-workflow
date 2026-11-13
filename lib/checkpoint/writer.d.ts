/**
 * Atomic checkpoint writer and reader.
 *
 * Durability contract (pinned by `test/checkpoint-schema.spec.ts`):
 *
 * 1. **Atomic.** The payload is written to a hidden `*.tmp` file in the target
 *    directory (same filesystem, so `rename` is atomic on POSIX and Windows),
 *    fsynced, and only then renamed over the final path. A reader therefore
 *    never observes a half-written checkpoint, and a failed write leaves the
 *    previous checkpoint intact. On any failure the temporary file is removed.
 * 2. **Checksummed.** The integrity record is computed by
 *    {@link sealCheckpoint} over the canonical JSON of the payload (sorted
 *    keys, no `undefined` fields); the reader recomputes it and refuses a
 *    file whose bytes no longer match.
 * 3. **Bounded IO.** The writer refuses a payload above
 *    `CHECKPOINT_LIMITS.maxBytes` before touching the disk; the reader stats
 *    the file first and refuses to parse anything larger, so a hostile or
 *    corrupted file cannot blow up memory.
 * 4. **No secrets.** The schema build step (`buildCheckpoint`) redacts every
 *    free-text field through `src/redact.ts` before anything reaches disk.
 *
 * Callers supply the file path and all data (including timestamps), so the
 * writer itself injects no clock or randomness into the file content — two
 * writes of the same checkpoint are byte-identical, which is what makes the
 * checksum reproducible offline.
 *
 * Integration points: the run lifecycle (`src/run.ts`, `src/team-engine.ts`)
 * owns the data this module persists — run identity and watchdog state from
 * the engine started through `ctx.workflowEngine.start`, per-task progress
 * from the engine's `agent()` bookkeeping, git state from the caller. This
 * module only performs schema-safe, atomic file IO and never calls the engine.
 */
import { type CheckpointInput, type WorkflowCheckpoint } from './schema.js';
/** Result of one successful write. */
export interface CheckpointWriteResult {
    path: string;
    /** Byte length of the file that was written. */
    bytes: number;
    /** sha-256 of the canonical payload (the stored integrity checksum). */
    checksum: string;
}
/** Sanitize a run id into a filename-safe segment. */
export declare function checkpointFileName(runId: string): string;
/**
 * Build, seal, and atomically write one checkpoint.
 *
 * @param filePath - final destination; parent directories are created.
 * @param input - checkpoint input (redacted and bounded by `buildCheckpoint`).
 * @returns the written path, byte size, and payload checksum.
 */
export declare function writeCheckpoint(filePath: string, input: CheckpointInput): Promise<CheckpointWriteResult>;
/**
 * Read and fully verify one checkpoint file.
 *
 * The size bound is checked on `stat` before any content is read; parsing and
 * schema validation follow, and the stored integrity record must match the
 * recomputed checksum and byte count exactly.
 */
export declare function readCheckpoint(filePath: string): Promise<WorkflowCheckpoint>;
//# sourceMappingURL=writer.d.ts.map