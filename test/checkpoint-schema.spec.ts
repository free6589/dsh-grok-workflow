import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  assertCheckpoint,
  buildCheckpoint,
  buildMinContextDigest,
  canonicalJson,
  CheckpointError,
  CHECKPOINT_LIMITS,
  CHECKPOINT_VERSION,
  ENGINE_HOOK_LIMITS,
  limitContractViolations,
  sealCheckpoint,
  stripIntegrity,
  verifyCheckpointIntegrity,
  type CheckpointInput,
} from '../src/checkpoint/schema.js'
import { checkpointFileName, readCheckpoint, writeCheckpoint } from '../src/checkpoint/writer.js'

/**
 * Checkpoint schema and writer (offline, deterministic).
 *
 * Every clock value in these tests is a fixed constant and every write goes to
 * a per-test scratch directory, so the suite never depends on wall time,
 * randomness, or the network. The checksum determinism assertions are what make
 * the tests able to verify integrity at all: a checksum that moved between runs
 * would be noise, not integrity.
 */

const NOW = 1_700_000_000_000

function fullInput(): CheckpointInput {
  return {
    run: { runId: 'run-42', sessionId: 'session-abc', objective: 'Deliver the checkpoint module', status: 'running' },
    plan: {
      source: 'planner',
      tasks: [
        { id: 'task-1', title: 'Schema', writesPaths: ['src/checkpoint/schema.ts'] },
        { id: 'task-2', title: 'Writer', writesPaths: null },
        { id: 'task-3', title: 'Docs', writesPaths: [] },
      ],
    },
    tasks: [
      { id: 'task-1', title: 'Schema', status: 'verified', attempts: 1 },
      { id: 'task-2', title: 'Writer', status: 'running', attempts: 1 },
      { id: 'task-3', title: 'Docs', status: 'pending', attempts: 0 },
    ],
    agents: [
      { role: 'worker', outcome: 'ok', taskId: 'task-1', attempt: 1, route: 'prov/model-a', startedAtMs: NOW, durationMs: 1_200 },
      { role: 'verifier', outcome: 'failed', taskId: 'task-1', attempt: 1, route: 'prov/model-b', failureClass: 'task-failed', reason: 'evidence missing' },
    ],
    stages: [
      { phase: 'plan', status: 'completed', startedAtMs: NOW - 10, endedAtMs: NOW },
      { phase: 'execute', status: 'running', startedAtMs: NOW },
    ],
    evidence: [
      { taskId: 'task-1', criterion: 'schema covers every section', claim: 'all section keys present', locator: 'src/checkpoint/schema.ts' },
    ],
    git: { branch: 'main', head: '84e6894dfb10c64aa2e75e755fc3e202839c9de8', dirty: true, ahead: 0, behind: 0 },
    time: { startedAtMs: NOW - 5_000, updatedAtMs: NOW, deadlineAtMs: NOW + 3_600_000 },
    limits: { maxConcurrency: 3, maxRetries: 1, maxTasks: 3, timeoutMs: 3_600_000 },
    watchdog: { deadlineHit: false, cancelled: false, deadlineMs: 3_600_000 },
  }
}

describe('schema coverage', () => {
  it('carries every documented section (run plan tasks agents stages evidence git time min-context)', () => {
    const checkpoint = buildCheckpoint(fullInput(), NOW)
    for (const section of ['version', 'run', 'plan', 'tasks', 'agents', 'stages', 'evidence', 'git', 'time', 'minContext', 'limits', 'watchdog']) {
      expect(checkpoint, `section ${section}`).toHaveProperty(section)
    }
    expect(checkpoint.version).toBe(CHECKPOINT_VERSION)
    expect(checkpoint.run.runId).toBe('run-42')
    expect(checkpoint.plan.taskCount).toBe(3)
    expect(checkpoint.tasks).toHaveLength(3)
    expect(checkpoint.agents).toHaveLength(2)
    expect(checkpoint.stages.map(stage => stage.phase)).toEqual(['plan', 'execute'])
    expect(checkpoint.evidence).toHaveLength(1)
    expect(checkpoint.git.head).toBe('84e6894dfb10c64aa2e75e755fc3e202839c9de8')
    expect(checkpoint.time.startedAtMs).toBe(NOW - 5_000)
    expect(checkpoint.minContext.source).toBe('auto')
    expect(checkpoint.watchdog.deadlineHit).toBe(false)
  })

  it('normalizes plan write paths and defaults absent task rows to pending', () => {
    const checkpoint = buildCheckpoint(
      {
        run: { runId: 'r', objective: 'o', status: 'running' },
        plan: { source: 'caller', tasks: [{ id: 't1', title: 'T', writesPaths: ['./SRC/A.ts', 'src//a.ts'] }] },
      },
      NOW,
    )
    expect(checkpoint.plan.tasks[0]!.writesPaths).toEqual(['src/a.ts'])
    expect(checkpoint.tasks).toEqual([{ id: 't1', title: 'T', status: 'pending', attempts: 0 }])
    expect(checkpoint.git.dirty).toBe(false)
    expect(checkpoint.limits).toEqual({ maxConcurrency: 3, maxRetries: 1, maxTasks: 12 })
    expect(checkpoint.watchdog).toEqual({ deadlineHit: false, cancelled: false })
    expect(checkpoint.time).toEqual({ startedAtMs: NOW, updatedAtMs: NOW })
  })

  it('builds an auto min-context digest from objective, plan, and evidence', () => {
    const checkpoint = buildCheckpoint(fullInput(), NOW)
    expect(checkpoint.minContext.objective).toBe('Deliver the checkpoint module')
    expect(checkpoint.minContext.digest).toContain('objective: Deliver the checkpoint module')
    expect(checkpoint.minContext.digest).toContain('plan: 3 task(s), 1 finished')
    expect(checkpoint.minContext.digest).toContain('- task-1 verified Schema')
    expect(checkpoint.minContext.digest).toContain('- [task-1] schema covers every section :: all section keys present')
  })

  it('keeps a caller-supplied digest verbatim and marks the source', () => {
    const checkpoint = buildCheckpoint(
      {
        ...fullInput(),
        minContext: { digest: 'hand-compiled digest' },
      },
      NOW,
    )
    expect(checkpoint.minContext).toEqual({ objective: 'Deliver the checkpoint module', digest: 'hand-compiled digest', source: 'caller' })
  })
})

describe('redaction and bounding', () => {
  it('redacts credential shapes in every free-text field', () => {
    const secret = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789'
    const checkpoint = buildCheckpoint(
      {
        run: { runId: 'r', objective: `leak ${secret} and password=hunter2secret`, status: 'running', cause: `token=${secret}` },
        plan: { source: 'caller', tasks: [{ id: 't1', title: `secret ${secret}` }] },
        tasks: [{ id: 't1', title: 'T', status: 'failed', attempts: 2, error: `api_key = ${secret}` }],
        evidence: [{ taskId: 't1', criterion: 'c', claim: `bearer ${secret}` }],
      },
      NOW,
    )
    const rendered = canonicalJson(checkpoint)
    expect(rendered).not.toContain(secret)
    expect(rendered).not.toContain('hunter2secret')
    expect(checkpoint.run.objective).toContain('[REDACTED')
    expect(checkpoint.tasks[0]!.error).toContain('[REDACTED')
  })

  it('bounds oversized text with an explicit ellipsis, never a dangling surrogate', () => {
    const checkpoint = buildCheckpoint(
      {
        run: { runId: 'r', objective: 'a'.repeat(10_000), status: 'running' },
        plan: { source: 'caller', tasks: [{ id: 't1', title: 'x'.repeat(5_000) }] },
      },
      NOW,
    )
    expect(checkpoint.run.objective.length).toBe(CHECKPOINT_LIMITS.objectiveChars)
    expect(checkpoint.run.objective.endsWith('…')).toBe(true)
    expect(checkpoint.plan.tasks[0]!.title.length).toBe(CHECKPOINT_LIMITS.titleChars)
    const surrogate = buildCheckpoint(
      { run: { runId: 'r', objective: `${'a'.repeat(CHECKPOINT_LIMITS.objectiveChars - 1)}😀`, status: 'running' }, plan: { source: 'caller', tasks: [] } },
      NOW,
    )
    const tail = surrogate.run.objective.charCodeAt(surrogate.run.objective.length - 2)
    expect(tail).not.toBeGreaterThanOrEqual(0xd800)
    expect(tail).not.toBeGreaterThan(0xdbff)
  })

  it('bounds the auto digest by the digest limit', () => {
    const bounded = buildMinContextDigest({
      objective: 'o',
      tasks: Array.from({ length: 70 }, (_, index) => ({ id: `t${index}`, title: 'T'.repeat(100), status: 'pending' as const })),
    })
    expect(bounded.length).toBeLessThanOrEqual(CHECKPOINT_LIMITS.digestChars)
    expect(bounded).toContain('[truncated: 6 more task row(s)]')
    const hardCut = buildMinContextDigest({
      objective: 'o',
      tasks: Array.from({ length: 200 }, (_, index) => ({ id: `t${index}`, title: 'T'.repeat(500), status: 'pending' as const })),
    })
    expect(hardCut.length).toBeLessThanOrEqual(CHECKPOINT_LIMITS.digestChars)
  })
})

describe('canonical form and checksum', () => {
  it('is stable across key insertion order and drops undefined fields', () => {
    expect(canonicalJson({ a: 1, b: { d: 2, c: 3 } })).toBe(canonicalJson({ b: { c: 3, d: 2 }, a: 1 }))
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}')
  })

  it('produces the same checksum for the same input, twice in a row', () => {
    const first = sealCheckpoint(buildCheckpoint(fullInput(), NOW))
    const second = sealCheckpoint(buildCheckpoint(fullInput(), NOW))
    expect(canonicalJson(first)).toBe(canonicalJson(second))
    expect(first.integrity!.checksum).toBe(second.integrity!.checksum)
    expect(first.integrity!.checksum).toMatch(/^[0-9a-f]{64}$/)
    expect(first.integrity!.bytes).toBe(Buffer.byteLength(canonicalJson(stripIntegrity(first)), 'utf8'))
  })

  it('detects any payload mutation through the checksum', () => {
    const sealed = sealCheckpoint(buildCheckpoint(fullInput(), NOW))
    const tampered = { ...stripIntegrity(sealed), run: { ...sealed.run, status: 'failed' as const } }
    const verdict = verifyCheckpointIntegrity({ ...tampered, integrity: sealed.integrity! })
    expect(verdict.ok).toBe(false)
    expect(verdict.detail).toContain('checksum mismatch')
  })

  it('reports a byte-count mismatch when the stored byte length lies', () => {
    const sealed = sealCheckpoint(buildCheckpoint(fullInput(), NOW))
    const verdict = verifyCheckpointIntegrity({ ...sealed, integrity: { ...sealed.integrity!, bytes: sealed.integrity!.bytes + 1 } })
    expect(verdict.ok).toBe(false)
    expect(verdict.detail).toContain('byte count mismatch')
  })

  it('refuses to seal a payload above the size bound', () => {
    const huge: CheckpointInput = {
      run: { runId: 'r', objective: 'o', status: 'running' },
      plan: { source: 'caller', tasks: [{ id: 't1', title: 'T' }] },
      tasks: [{ id: 't1', title: 'T', status: 'failed', attempts: 1 }],
      evidence: Array.from({ length: CHECKPOINT_LIMITS.maxEvidence }, () => ({
        taskId: 't1',
        criterion: 'c'.repeat(CHECKPOINT_LIMITS.criterionChars),
        claim: 'x'.repeat(CHECKPOINT_LIMITS.claimChars),
        locator: `file://${'l'.repeat(CHECKPOINT_LIMITS.locatorChars - 7)}`,
      })),
    }
    expect(() => sealCheckpoint(buildCheckpoint(huge, NOW))).toThrow(CheckpointError)
    try {
      sealCheckpoint(buildCheckpoint(huge, NOW))
      expect.unreachable('seal must throw')
    } catch (error) {
      expect(error).toBeInstanceOf(CheckpointError)
      expect((error as CheckpointError).reason).toBe('too-large')
    }
  })
})

describe('schema validation', () => {
  it('accepts a sealed round trip unchanged', () => {
    const sealed = sealCheckpoint(buildCheckpoint(fullInput(), NOW))
    expect(assertCheckpoint(JSON.parse(canonicalJson(sealed)))).toEqual(sealed)
  })

  it('rejects a wrong version, an unknown status, and a non-integer timestamp', () => {
    const base = () => JSON.parse(canonicalJson(sealCheckpoint(buildCheckpoint(fullInput(), NOW)))) as Record<string, unknown>
    const wrongVersion = base()
    wrongVersion['version'] = 'other/v9'
    expect(() => assertCheckpoint(wrongVersion)).toThrow(/version/)
    const wrongStatus = base()
    ;(wrongStatus['run'] as Record<string, unknown>)['status'] = 'victorious'
    expect(() => assertCheckpoint(wrongStatus)).toThrow(/status/)
    const wrongTime = base()
    ;(wrongTime['time'] as Record<string, unknown>)['startedAtMs'] = 1.5
    expect(() => assertCheckpoint(wrongTime)).toThrow(/safe integer/)
  })

  it('rejects oversized fields, too many tasks, and a taskCount mismatch', () => {
    const overlong = buildCheckpoint(fullInput(), NOW)
    const broken = JSON.parse(canonicalJson(sealCheckpoint(overlong))) as Record<string, unknown>
    ;((broken['tasks'] as Record<string, unknown>[])[0] as Record<string, unknown>)['title'] = 'x'.repeat(CHECKPOINT_LIMITS.titleChars + 1)
    expect(() => assertCheckpoint(broken)).toThrow(/title/)

    const tooMany = buildCheckpoint(
      {
        run: { runId: 'r', objective: 'o', status: 'running' },
        plan: { source: 'caller', tasks: Array.from({ length: CHECKPOINT_LIMITS.maxTasks + 1 }, (_, index) => ({ id: `t${index}`, title: 'T' })) },
      },
      NOW,
    )
    expect(tooMany.plan.tasks).toHaveLength(CHECKPOINT_LIMITS.maxTasks)
    const mismatch = JSON.parse(canonicalJson(sealCheckpoint(tooMany))) as Record<string, unknown>
    ;(mismatch['plan'] as Record<string, unknown>)['taskCount'] = 0
    expect(() => assertCheckpoint(mismatch)).toThrow(/taskCount/)
  })

  it('rejects a missing section and a malformed integrity record', () => {
    const noGit = JSON.parse(canonicalJson(sealCheckpoint(buildCheckpoint(fullInput(), NOW)))) as Record<string, unknown>
    delete noGit['git']
    expect(() => assertCheckpoint(noGit)).toThrow(/git/)

    const badIntegrity = JSON.parse(canonicalJson(sealCheckpoint(buildCheckpoint(fullInput(), NOW)))) as Record<string, unknown>
    ;((badIntegrity['integrity'] as Record<string, unknown>)['checksum'] as string) = 'zz'
    expect(() => assertCheckpoint(badIntegrity)).toThrow(/checksum/)
  })

  it('rejects a malformed git head', () => {
    expect(() => buildCheckpoint({ ...fullInput(), git: { head: 'not-a-sha', dirty: false } }, NOW)).toThrow(/git\.head/)
  })
})

describe('engine hook limit contract', () => {
  it('pins the documented concurrency and retry bounds', () => {
    expect(ENGINE_HOOK_LIMITS).toEqual({ maxConcurrency: { default: 3, max: 6 }, maxRetries: { default: 1, max: 3 } })
  })

  it('reports violations without blocking the checkpoint', () => {
    expect(limitContractViolations({ maxConcurrency: 3, maxRetries: 1 })).toEqual([])
    expect(limitContractViolations({ maxConcurrency: 8, maxRetries: 1 })).toEqual(['maxConcurrency 8 exceeds the documented maximum 6'])
    expect(limitContractViolations({ maxConcurrency: 4, maxRetries: 5 })).toEqual(['maxRetries 5 exceeds the documented maximum 3'])
    // The observed config default (4) is inside the documented maximum 6, so a
    // real run's checkpoint is never flagged for the concurrency default alone.
    expect(limitContractViolations({ maxConcurrency: 4, maxRetries: 2 })).toEqual([])
  })
})

describe('checkpoint file names', () => {
  it('sanitizes run ids into safe file names', () => {
    expect(checkpointFileName('run-42')).toBe('checkpoint-run-42.json')
    expect(checkpointFileName('../etc/passwd')).toBe('checkpoint-.._etc_passwd.json')
    expect(checkpointFileName('')).toBe('checkpoint-run.json')
    expect(checkpointFileName('..')).toBe('checkpoint-run.json')
  })
})

describe('atomic writer', () => {
  let dir = ''

  beforeEach(async () => {
    dir = join(tmpdir(), `ckpt-spec-${process.pid}-${Math.random().toString(36).slice(2, 8)}`)
    await mkdir(dir, { recursive: true })
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const target = () => join(dir, 'checkpoint-run-42.json')

  it('writes via a temporary file and leaves no temporary residue', async () => {
    const result = await writeCheckpoint(target(), fullInput())
    expect(result.path).toBe(target())
    const info = await stat(target())
    expect(info.isFile()).toBe(true)
    const entries = await readdir(dir)
    expect(entries).toEqual(['checkpoint-run-42.json'])
    const onDisk = JSON.parse(await readFile(target(), 'utf8')) as Record<string, unknown>
    expect((onDisk['integrity'] as Record<string, unknown>)['algorithm']).toBe('sha256')
    expect(result.bytes).toBe(info.size)
  })

  it('round-trips through read with the integrity record verified', async () => {
    const built = buildCheckpoint(fullInput(), NOW)
    const result = await writeCheckpoint(target(), fullInput())
    const read = await readCheckpoint(target())
    expect(stripIntegrity(read)).toEqual(built)
    expect(read.integrity!.checksum).toBe(result.checksum)
    expect(verifyCheckpointIntegrity(read)).toEqual({ ok: true })
  })

  it('replaces an existing checkpoint atomically on a second write', async () => {
    await writeCheckpoint(target(), fullInput())
    const updated = fullInput()
    updated.run.status = 'completed'
    updated.tasks![0]!.status = 'verified'
    await writeCheckpoint(target(), updated)
    const read = await readCheckpoint(target())
    expect(read.run.status).toBe('completed')
    const entries = await readdir(dir)
    expect(entries).toEqual(['checkpoint-run-42.json'])
  })

  it('keeps the file byte-identical for identical input', async () => {
    await writeCheckpoint(target(), fullInput())
    const second = join(dir, 'copy.json')
    await writeCheckpoint(second, fullInput())
    expect(await readFile(target(), 'utf8')).toBe(await readFile(second, 'utf8'))
  })

  it('never writes a secret to disk', async () => {
    const secret = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789'
    const input = fullInput()
    input.run.objective = `export ${secret}`
    await writeCheckpoint(target(), input)
    expect(await readFile(target(), 'utf8')).not.toContain(secret)
  })

  it('cleans up the temporary file when the rename fails', async () => {
    await mkdir(target())
    await expect(writeCheckpoint(target(), fullInput())).rejects.toMatchObject({ name: 'CheckpointError', reason: 'io' })
    const entries = await readdir(dir)
    expect(entries.filter(entry => entry.endsWith('.tmp'))).toEqual([])
  })

  it('reports an io error when a path component is not a directory', async () => {
    const blocker = join(dir, 'blocker.txt')
    await writeFile(blocker, 'file', 'utf8')
    await expect(writeCheckpoint(join(blocker, 'checkpoint.json'), fullInput())).rejects.toMatchObject({ reason: 'io' })
  })
})

describe('size bounds on read', () => {
  let dir = ''

  beforeEach(async () => {
    dir = join(tmpdir(), `ckpt-spec-read-${process.pid}-${Math.random().toString(36).slice(2, 8)}`)
    await mkdir(dir, { recursive: true })
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('refuses an oversized file before parsing it', async () => {
    const path = join(dir, 'huge.json')
    await writeFile(path, 'x'.repeat(CHECKPOINT_LIMITS.maxBytes + 1), 'utf8')
    try {
      await readCheckpoint(path)
      expect.unreachable('read must refuse oversize files')
    } catch (error) {
      expect(error).toBeInstanceOf(CheckpointError)
      expect((error as CheckpointError).reason).toBe('too-large')
    }
  })

  it('refuses corrupt JSON and a file without an integrity record', async () => {
    const broken = join(dir, 'broken.json')
    await writeFile(broken, '{not json', 'utf8')
    try {
      await readCheckpoint(broken)
      expect.unreachable('read must refuse corrupt JSON')
    } catch (error) {
      expect((error as CheckpointError).reason).toBe('invalid')
    }
    const built = buildCheckpoint(fullInput(), NOW)
    const bare = join(dir, 'bare.json')
    await writeFile(bare, canonicalJson(built), 'utf8')
    try {
      await readCheckpoint(bare)
      expect.unreachable('read must refuse files without integrity')
    } catch (error) {
      expect((error as CheckpointError).reason).toBe('integrity')
    }
  })

  it('refuses a missing file with an io error', async () => {
    try {
      await readCheckpoint(join(dir, 'absent.json'))
      expect.unreachable('read must fail on a missing file')
    } catch (error) {
      expect((error as CheckpointError).reason).toBe('io')
    }
  })
})
