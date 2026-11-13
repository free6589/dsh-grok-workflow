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

import { randomBytes } from 'node:crypto'
import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import {
  assertCheckpoint,
  buildCheckpoint,
  canonicalJson,
  CheckpointError,
  CHECKPOINT_LIMITS,
  sealCheckpoint,
  verifyCheckpointIntegrity,
  type CheckpointInput,
  type WorkflowCheckpoint,
} from './schema.js'

/** Result of one successful write. */
export interface CheckpointWriteResult {
  path: string
  /** Byte length of the file that was written. */
  bytes: number
  /** sha-256 of the canonical payload (the stored integrity checksum). */
  checksum: string
}

/** Sanitize a run id into a filename-safe segment. */
export function checkpointFileName(runId: string): string {
  const safe = runId.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, CHECKPOINT_LIMITS.idChars)
  return `checkpoint-${safe === '' || safe === '.' || safe === '..' ? 'run' : safe}.json`
}

/**
 * Build, seal, and atomically write one checkpoint.
 *
 * @param filePath - final destination; parent directories are created.
 * @param input - checkpoint input (redacted and bounded by `buildCheckpoint`).
 * @returns the written path, byte size, and payload checksum.
 */
export async function writeCheckpoint(filePath: string, input: CheckpointInput): Promise<CheckpointWriteResult> {
  const sealed = sealCheckpoint(buildCheckpoint(input))
  const file = canonicalJson(sealed)
  const fileBytes = Buffer.byteLength(file, 'utf8')
  if (fileBytes > CHECKPOINT_LIMITS.maxBytes) {
    throw new CheckpointError('too-large', `checkpoint file would be ${fileBytes} bytes, above the ${CHECKPOINT_LIMITS.maxBytes} bound`)
  }
  const dir = dirname(filePath)
  const tmp = join(dir, `.${basename(filePath)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`)
  try {
    await mkdir(dir, { recursive: true })
    const handle = await open(tmp, 'w')
    try {
      await handle.writeFile(file, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
  } catch (error) {
    // Best-effort cleanup: a failing rm must never mask the write error itself.
    await rm(tmp, { force: true }).catch(() => undefined)
    throw new CheckpointError('io', `temporary checkpoint write failed: ${describe(error)}`)
  }
  try {
    await rename(tmp, filePath)
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => undefined)
    throw new CheckpointError('io', `checkpoint rename failed: ${describe(error)}`)
  }
  // Best-effort directory fsync so the rename itself survives a crash; some
  // platforms (and some filesystems) reject opening a directory, which is fine.
  try {
    const dirHandle = await open(dir, 'r')
    try {
      await dirHandle.sync()
    } finally {
      await dirHandle.close()
    }
  } catch {
    // The rename already happened; durability of the rename entry is the OS's
    // call on platforms without directory fsync. Nothing to repair here.
  }
  const integrity = sealed.integrity
  if (integrity === undefined) throw new CheckpointError('invalid', 'sealed checkpoint carries no integrity record')
  return { path: filePath, bytes: fileBytes, checksum: integrity.checksum }
}

/**
 * Read and fully verify one checkpoint file.
 *
 * The size bound is checked on `stat` before any content is read; parsing and
 * schema validation follow, and the stored integrity record must match the
 * recomputed checksum and byte count exactly.
 */
export async function readCheckpoint(filePath: string): Promise<WorkflowCheckpoint> {
  let info
  try {
    info = await stat(filePath)
  } catch (error) {
    throw new CheckpointError('io', `checkpoint stat failed: ${describe(error)}`)
  }
  if (!info.isFile()) throw new CheckpointError('io', `checkpoint path is not a regular file: ${filePath}`)
  if (info.size > CHECKPOINT_LIMITS.maxBytes) {
    throw new CheckpointError('too-large', `checkpoint file is ${info.size} bytes, above the ${CHECKPOINT_LIMITS.maxBytes} bound`)
  }
  let text: string
  try {
    text = await readFile(filePath, 'utf8')
  } catch (error) {
    throw new CheckpointError('io', `checkpoint read failed: ${describe(error)}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new CheckpointError('invalid', `checkpoint is not valid JSON: ${describe(error)}`)
  }
  const checkpoint = assertCheckpoint(parsed)
  const verdict = verifyCheckpointIntegrity(checkpoint)
  if (!verdict.ok) throw new CheckpointError('integrity', verdict.detail ?? 'checkpoint integrity verification failed')
  return checkpoint
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
