import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildCheckpoint,
  canonicalJson,
  CHECKPOINT_LIMITS,
  sealCheckpoint,
  stripIntegrity,
  type CheckpointInput,
} from '../src/checkpoint/schema.js'
import { readCheckpoint, writeCheckpoint } from '../src/checkpoint/writer.js'

/**
 * The checkpoint byte bound, locked end to end (offline, deterministic).
 *
 * `CHECKPOINT_LIMITS.maxBytes` bounds the *file*; a sealed file is the canonical
 * payload plus its integrity record, so the largest payload the writer can
 * actually accept is smaller than the bound every place that says "maxBytes"
 * invites a reader to assume. That gap is 129 bytes here (122 fixed bytes plus
 * the 7 decimal digits of the byte count), which puts the legal payload top at
 * 1,048,447. The numbers are derived from a real sealed file rather than copied
 * out of the comment, so a comment that drifts from the writer is a failure and
 * not a coincidence.
 */

const NOW = 1_700_000_000_000

/** Fixed part of `,"integrity":{...}`, measured below instead of assumed. */
const RECORD_FIXED_BYTES = 122
/** Digits of `integrity.bytes` at the ceiling: 1,048,447. */
const CEILING_DIGITS = 7
const RECORD_BYTES_AT_CEILING = RECORD_FIXED_BYTES + CEILING_DIGITS
const PAYLOAD_CEILING = 1_048_447

/**
 * Input whose sealed payload is exactly `target` bytes.
 *
 * Maximum-width evidence rows move the payload in fixed ~2 KB steps, so they
 * cannot land on a byte boundary; the min-context digest is copied verbatim at
 * one byte per character, so it trims the remainder. Choosing the row count
 * first and filling the difference with the digest reaches an exact size
 * without scanning a megabyte of candidates.
 */
function sizedInput(target: number): CheckpointInput {
  const input = (rows: number, digest: number): CheckpointInput => ({
    run: { runId: 'r', objective: 'o', status: 'running' },
    plan: { source: 'caller', tasks: [{ id: 't1', title: 'T' }] },
    tasks: [{ id: 't1', title: 'T', status: 'failed', attempts: 1 }],
    evidence: Array.from({ length: rows }, () => ({
      taskId: 't1',
      criterion: 'c'.repeat(CHECKPOINT_LIMITS.criterionChars),
      claim: 'x'.repeat(CHECKPOINT_LIMITS.claimChars),
      locator: `file://${'l'.repeat(CHECKPOINT_LIMITS.locatorChars - 7)}`,
    })),
    minContext: { digest: 'd'.repeat(digest) },
  })
  const bytes = (rows: number, digest: number) =>
    Buffer.byteLength(canonicalJson(stripIntegrity(buildCheckpoint(input(rows, digest), NOW))), 'utf8')
  const perRow = bytes(101, 0) - bytes(100, 0)
  let rows = Math.max(1, Math.floor((target - bytes(0, 0)) / perRow))
  while (rows > 1 && bytes(rows, 0) > target) rows -= 1
  const digest = target - bytes(rows, 0)
  if (digest < 0 || digest > CHECKPOINT_LIMITS.digestChars) {
    throw new Error(`cannot size a payload of ${target} bytes (rows ${rows}, digest ${digest})`)
  }
  if (bytes(rows, digest) !== target) throw new Error(`payload of ${target} bytes did not land on target`)
  return input(rows, digest)
}

/** Byte length of the file a sealed checkpoint would be written as. */
function fileBytesOf(checkpoint: ReturnType<typeof buildCheckpoint>): number {
  return Buffer.byteLength(canonicalJson(sealCheckpoint(checkpoint)), 'utf8')
}

describe('checkpoint byte bound', () => {
  let dir: string

  beforeEach(async () => {
    dir = join(tmpdir(), `ckpt-bound-${process.pid}-${Math.random().toString(36).slice(2, 8)}`)
    await mkdir(dir, { recursive: true })
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const target = () => join(dir, 'checkpoint-bound.json')

  it('measures the integrity record and derives the payload ceiling from it', () => {
    const sample = sealCheckpoint(buildCheckpoint(sizedInput(4_000), NOW))
    const payload = sample.integrity!.bytes
    const file = fileBytesOf(buildCheckpoint(sizedInput(4_000), NOW))
    // The record repeats the byte count in decimal, so the part that does not
    // depend on the payload is fixed and the rest is one byte per digit.
    expect(file - payload - String(payload).length).toBe(RECORD_FIXED_BYTES)
    expect(String(payload)).toHaveLength(4)

    // At the ceiling the count has 7 digits, so the record is 129 bytes and the
    // legal payload top is the file bound minus exactly that.
    expect(String(PAYLOAD_CEILING)).toHaveLength(CEILING_DIGITS)
    expect(RECORD_BYTES_AT_CEILING).toBe(129)
    expect(CHECKPOINT_LIMITS.maxBytes - RECORD_BYTES_AT_CEILING).toBe(PAYLOAD_CEILING)

    const atCeiling = sealCheckpoint(buildCheckpoint(sizedInput(PAYLOAD_CEILING), NOW))
    expect(atCeiling.integrity!.bytes).toBe(PAYLOAD_CEILING)
    expect(fileBytesOf(buildCheckpoint(sizedInput(PAYLOAD_CEILING), NOW)) - PAYLOAD_CEILING).toBe(RECORD_BYTES_AT_CEILING)
  })

  it('writes at the payload ceiling and reads the file back intact', async () => {
    const result = await writeCheckpoint(target(), sizedInput(PAYLOAD_CEILING))
    // The writer accepts the largest legal payload and the file it produces is
    // exactly the documented file bound — not a byte more.
    expect(result.bytes).toBe(CHECKPOINT_LIMITS.maxBytes)

    const read = await readCheckpoint(target())
    expect(read.integrity!.bytes).toBe(PAYLOAD_CEILING)
    expect(read.integrity!.checksum).toBe(result.checksum)
  })

  it('refuses one payload byte above the ceiling as too large', async () => {
    await expect(writeCheckpoint(target(), sizedInput(PAYLOAD_CEILING + 1)))
      .rejects.toMatchObject({ reason: 'too-large' })
    // `sealCheckpoint` alone would have accepted it (the payload is still under
    // `maxBytes`); it is the file bound that refuses, which is the distinction
    // the constant's comment has to keep straight.
    expect(sealCheckpoint(buildCheckpoint(sizedInput(PAYLOAD_CEILING + 1), NOW)).integrity!.bytes).toBe(PAYLOAD_CEILING + 1)
  })

  it('refuses a file above the bound before parsing it', async () => {
    await writeFile(target(), 'x'.repeat(CHECKPOINT_LIMITS.maxBytes + 1), 'utf8')
    await expect(readCheckpoint(target())).rejects.toMatchObject({ reason: 'too-large' })
  })

  it('keeps the maxBytes comment stating the ceiling and the record it comes from', async () => {
    const source = await readFile(new URL('../src/checkpoint/schema.ts', import.meta.url), 'utf8')
    const declaration = source.indexOf('maxBytes: 1_048_576')
    expect(declaration).toBeGreaterThan(0)
    // The docblock that a reader consults at the constant is the last one before
    // the declaration; anchoring on it rather than on a phrase means the wording
    // may change while the numbers may not.
    const start = source.lastIndexOf('/**', declaration)
    expect(start).toBeGreaterThan(0)
    const comment = source.slice(start, declaration)
    // The numbers a reader needs: the legal payload top, the fixed part of the
    // integrity record, and the record size at the ceiling.
    expect(comment).toContain(PAYLOAD_CEILING.toLocaleString('en-US'))
    expect(comment).toContain(String(RECORD_FIXED_BYTES))
    expect(comment).toContain(String(RECORD_BYTES_AT_CEILING))
    // A stale sentence claiming the payload tops out at the file bound is the
    // exact error this comment exists to prevent, so it must not survive next to
    // the correct numbers.
    expect(comment).not.toMatch(/tops out at 1,048,576/)
  })
})
