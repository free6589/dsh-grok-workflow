/**
 * Incremental memory archive — deterministic tests.
 *
 * What these tests are for (acceptance of the `incremental_archive` task):
 *
 * 1. **The write happens when the work happens.** A round's result is on disk at
 *    the moment the round settles and while the run is still live, not in a
 *    session-end or plugin-dispose hook. The strongest form of that assertion is
 *    the one taken *inside a later child's own activation*: the earlier child's
 *    entry is already readable, and the run has not settled yet.
 * 2. **A reader with no session state finds it.** A separate `node` process —
 *    no DSH context, no session, no plugin state — reads the archive and gets the
 *    newest entry back.
 * 3. **Append-only and idempotent.** Re-archiving the same round or the same child
 *    settlement writes nothing, leaves every existing byte untouched, and never
 *    rewrites an entry that was already there.
 *
 * No model is called and no network is used: the engine is the real
 * `@deepseek-ai/dsh-workflow-ptc` implementation from `test/engine-harness.ts`,
 * with a fake subagent provider (the only expensive boundary).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Session } from '@deepseek-ai/dsh-session'
import { resolveConfig } from '../src/config.js'
import {
  ARCHIVE_LIMITS,
  appendArchiveEntry,
  archiveDir,
  archiveFile,
  readArchive,
  recentArchiveDigest,
  sanitizeEntry,
} from '../src/memory/archive.js'
import type { ArchiveEntry } from '../src/memory/archive.js'
import { runArchiveCli } from '../src/memory/cli.js'
import { childFinding, childResultText, createMemoryArchiver, roundArchiveSummary } from '../src/memory/recorder.js'
import { createActiveState, runSingleCall, runWorkflow } from '../src/run.js'
import type { NormalizedTask } from '../src/types.js'
import { createEngineHarness, type ChildAnswer, type ChildCall, type EngineHarness } from './engine-harness.js'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const LIB_ARCHIVE = join(REPO, 'lib', 'memory', 'archive.js')
const LIB_CLI = join(REPO, 'lib', 'memory', 'cli.js')

const harnesses = new Set<EngineHarness>()
let dir: string
let previousDir: string | undefined

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'grok-memory-'))
  previousDir = process.env.GROK_WORKFLOW_MEMORY_DIR
  process.env.GROK_WORKFLOW_MEMORY_DIR = dir
})

afterEach(async () => {
  for (const harness of harnesses) await harness.dispose()
  harnesses.clear()
  if (previousDir === undefined) delete process.env.GROK_WORKFLOW_MEMORY_DIR
  else process.env.GROK_WORKFLOW_MEMORY_DIR = previousDir
  rmSync(dir, { recursive: true, force: true })
})

const logger = { warn: (): void => {} }

/** A context that exposes a session store the way cordis does — through `get`. */
function ctxWith(store: unknown): { get: (name: string) => unknown } {
  return { get: (name: string) => name === 'sessions' ? store : undefined }
}


function harness(answer: (call: ChildCall) => ChildAnswer | Promise<ChildAnswer>): EngineHarness {
  const created = createEngineHarness(answer)
  harnesses.add(created)
  return created
}

function entry(overrides: Partial<ArchiveEntry> = {}): ArchiveEntry {
  return {
    v: 1,
    id: 'run:r1',
    kind: 'round',
    at: '2026-11-06T00:00:00.000Z',
    atMs: Date.parse('2026-11-06T00:00:00.000Z'),
    summary: 'the finding',
    ...overrides,
  }
}

function lines(): string[] {
  const file = archiveFile()
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(line => line.trim() !== '') : []
}

// ---------------------------------------------------------------------------
// A. The store itself: append-only, bounded, redacted, never fatal
// ---------------------------------------------------------------------------

describe('the archive store', () => {
  it('resolves the directory from the environment so a writer and a later reader agree', () => {
    expect(archiveDir()).toBe(dir)
    expect(archiveFile()).toBe(join(dir, 'archive.jsonl'))
    expect(archiveDir({ dir: '/tmp/elsewhere' })).toBe('/tmp/elsewhere')
  })

  it('writes exactly one JSON line per entry and reads it back newest first', () => {
    expect(appendArchiveEntry(entry(), { dir }).written).toBe(true)
    expect(appendArchiveEntry(entry({
      id: 'run:r2',
      at: '2026-11-06T00:00:10.000Z',
      atMs: Date.parse('2026-11-06T00:00:10.000Z'),
      summary: 'the later finding',
    }), { dir }).written).toBe(true)

    expect(lines()).toHaveLength(2)
    const read = readArchive({ dir })
    expect(read.map(item => item.id)).toEqual(['run:r2', 'run:r1'])
    expect(read[0]!.summary).toBe('the later finding')
    expect(readArchive({ dir, limit: 1 }).map(item => item.id)).toEqual(['run:r2'])
  })

  it('is idempotent: the same entry archived twice writes nothing and leaves every byte alone', () => {
    const first = appendArchiveEntry(entry(), { dir })
    expect(first.written).toBe(true)
    const before = readFileSync(archiveFile({ dir }), 'utf8')

    const again = appendArchiveEntry(entry(), { dir })
    expect(again.written).toBe(false)
    expect(again.reason).toBe('duplicate')
    expect(readFileSync(archiveFile({ dir }), 'utf8')).toBe(before)
    expect(lines()).toHaveLength(1)
  })

  it('is append-only: a new entry never rewrites or reorders an existing one', () => {
    appendArchiveEntry(entry(), { dir })
    const firstLine = lines()[0]!
    appendArchiveEntry(entry({
      id: 'run:r1:agent:1',
      kind: 'agent',
      at: '2026-11-06T00:01:00.000Z',
      atMs: Date.parse('2026-11-06T00:01:00.000Z'),
      summary: 'child result',
    }), { dir })
    const after = lines()
    expect(after).toHaveLength(2)
    expect(after[0]).toBe(firstLine)
    // The stored line is a single self-contained JSON record.
    expect(JSON.parse(after[0]!)).toMatchObject({ id: 'run:r1', summary: 'the finding' })
  })

  it('redacts credentials before anything reaches the disk', () => {
    // A synthetic, non-functional token shaped like a GitHub PAT: the point is the
    // redaction pattern, and nothing here was ever a real credential.
    const secret = 'github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz'
    appendArchiveEntry(entry({
      summary: `worker echoed a token: ${secret}`,
      evidence: [`Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456`],
    }), { dir })
    const raw = readFileSync(archiveFile({ dir }), 'utf8')
    expect(raw).not.toContain(secret)
    expect(raw).not.toContain('abcdefghijklmnopqrstuvwxyz123456')
    expect(raw).toContain('[REDACTED')
  })

  it('bounds every field, and refuses an entry that carries no identity or no finding', () => {
    const huge = 'x'.repeat(ARCHIVE_LIMITS.summaryChars + 500)
    appendArchiveEntry(entry({ summary: huge, evidence: Array.from({ length: 20 }, (_, index) => `src/${index}.ts`) }), { dir })
    const [stored] = readArchive({ dir })
    expect(stored!.summary.length).toBeLessThan(huge.length)
    expect(stored!.summary).toContain('[truncated')
    expect(stored!.evidence!.length).toBe(ARCHIVE_LIMITS.evidenceItems)

    expect(sanitizeEntry(entry({ id: '' }))).toBeUndefined()
    expect(appendArchiveEntry(entry({ summary: '   ' }), { dir }).reason).toBe('invalid')
    expect(lines()).toHaveLength(1)
  })

  it('never throws when the disk refuses the write', () => {
    const blocker = join(dir, 'not-a-directory')
    writeFileSync(blocker, 'x')
    const result = appendArchiveEntry(entry(), { dir: join(blocker, 'nested') })
    expect(result.written).toBe(false)
    expect(result.reason).toBe('write-failed')
    // A read against the same broken location is also just "nothing there".
    expect(readArchive({ dir: join(blocker, 'nested') })).toEqual([])
  })

  it('skips a corrupt line instead of failing the read, and collapses a duplicate id', () => {
    appendArchiveEntry(entry(), { dir })
    const file = archiveFile({ dir })
    writeFileSync(file, `${readFileSync(file, 'utf8')}not json\n${JSON.stringify(entry({ summary: 'second copy' }))}\n`, 'utf8')
    const read = readArchive({ dir })
    expect(read).toHaveLength(1)
    expect(read[0]!.summary).toBe('the finding')
  })

  it('filters by kind and by time, which is what "find the latest research" asks for', () => {
    appendArchiveEntry(entry({ id: 'run:old', atMs: 1_000, at: '1970-01-01T00:00:01.000Z' }), { dir })
    appendArchiveEntry(entry({ id: 'run:r1:agent:1', kind: 'agent', atMs: 2_000, at: '1970-01-01T00:00:02.000Z' }), { dir })
    appendArchiveEntry(entry({ id: 'run:r2', atMs: 3_000, at: '1970-01-01T00:00:03.000Z' }), { dir })
    expect(readArchive({ dir, kinds: ['agent'] }).map(item => item.id)).toEqual(['run:r1:agent:1'])
    expect(readArchive({ dir, sinceMs: 2_500 }).map(item => item.id)).toEqual(['run:r2'])
    expect(recentArchiveDigest({ dir, limit: 1 })).toContain('run:r2')
    expect(recentArchiveDigest({ dir: join(dir, 'empty'), limit: 1 })).toContain('no entries')
  })
})

// ---------------------------------------------------------------------------
// B. The recorder: a child's own result is archived when the child settles
// ---------------------------------------------------------------------------

describe('the archiver records a settled child', () => {
  it('archives the child transcript text under a deterministic id', () => {
    const childId = 'child-7'
    const ctx = ctxWith({
      get: (id: string) => id === childId
        ? {
            ownEvents: () => [
              { type: 'user/message', data: {} },
              { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'the child finding' }] } } },
            ],
          }
        : undefined,
    })
    expect(childResultText(ctx as never, childId)).toBe('the child finding')
    expect(childResultText(ctx as never, 'unknown')).toBeUndefined()
    expect(childResultText(undefined, childId)).toBeUndefined()

    const archiver = createMemoryArchiver({ ctx: ctx as never, logger, dir, sessionId: 's1' })
    archiver.adopt('run-1', 'memory-archive')
    archiver.agentStart('run-1', { seq: 1, label: '执行', phase: '任务 1 · Task a', childId })
    archiver.agentEnd('run-1', { seq: 1, outcome: 'completed' })

    const [stored] = readArchive({ dir })
    expect(stored).toMatchObject({
      id: 'run:run-1:agent:1',
      kind: 'agent',
      runId: 'run-1',
      sessionId: 's1',
      seq: 1,
      status: 'completed',
      phase: '任务 1 · Task a',
      label: '执行',
      summary: 'the child finding',
    })
  })

  it('still records the settlement when the session store is unreachable', () => {
    // cordis throws when a context has no `sessions` service (this plugin does not
    // inject one), and the real child transcript often ends in a tool call rather
    // than text. Both must cost the transcript excerpt, never the entry: an engine
    // listener that raises would lose the very record this module exists to keep.
    const throwing = Object.defineProperty({}, 'sessions', {
      get(): never { throw new Error('service sessions is not provided') },
    })
    expect(childResultText(throwing as never, 'child-1')).toBeUndefined()
    expect(childResultText(ctxWith({ get: () => { throw new Error('boom') } }) as never, 'child-1')).toBeUndefined()
    // The real failure mode this plugin meets: `ctx.sessions` itself throws on a fiber
    // that does not `inject` the service, while `ctx.get('sessions')` answers.
    const injectedOnly = Object.defineProperty(ctxWith({ get: () => undefined }), 'sessions', {
      get(): never { throw new Error('cannot get property "sessions" without inject') },
    })
    expect(childResultText(injectedOnly as never, 'child-1')).toBeUndefined()

    const archiver = createMemoryArchiver({ ctx: throwing as never, logger, dir })
    archiver.adopt('run-3', 'memory-archive')
    archiver.agentEnd('run-3', { seq: 1, outcome: 'completed' })
    const [stored] = readArchive({ dir })
    expect(stored).toMatchObject({ id: 'run:run-3:agent:1', status: 'completed' })
    expect(stored!.summary).toContain('the engine reported no child session id')

    // A child whose last assistant message is a tool call (the normal shape of a
    // structured child) keeps the last text-bearing message instead of nothing.
    const toolCallOnly = ctxWith({
        get: () => ({
          ownEvents: () => [
            { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'partial note' }, { type: 'tool-call' }] } } },
            { type: 'assistant/message', data: { message: { content: [{ type: 'reasoning', text: 'thinking' }, { type: 'tool-call' }] } } },
          ],
        }),
    })
    expect(childResultText(toolCallOnly as never, 'child-9')).toBe('partial note')
  })

  it('captures the child transcript at agent-start, because the store is gone by agent-end', () => {
    // Measured on a real run: the engine's guest disposes the child before the
    // batched `agent-end` reaches the host, so a settlement-time lookup answers
    // nothing and every child entry would read "no result text". The recorder
    // therefore takes the session object at `agent-start`, while it is live.
    let live = true
    const childSession = {
      ownEvents: () => [{
        type: 'assistant/message',
        data: {
          message: {
            content: [{
              type: 'tool-call',
              name: 'structured_output',
              arguments: JSON.stringify({ verdict: 'pass', criteria: [{ criterion: 'a works' }] }),
            }],
          },
        },
      }],
    }
    const ctx = ctxWith({ get: () => live ? childSession : undefined })
    const archiver = createMemoryArchiver({ ctx: ctx as never, logger, dir })
    archiver.adopt('run-5', 'memory-archive')
    archiver.agentStart('run-5', { seq: 3, label: '检查', phase: '任务 1 · Task a', childId: 'child-3' })
    live = false // the child is disposed before the settlement arrives
    archiver.agentEnd('run-5', { seq: 3, outcome: 'completed' })

    const [stored] = readArchive({ dir })
    expect(stored!.summary).toBe('verdict pass · 1 criterion/criteria checked')
    expect(stored!.phase).toBe('任务 1 · Task a')
    expect(stored!.label).toBe('检查')
  })

  it('reads the structured submission of a child that answered through a tool call', () => {
    // Measured shape: a real child's final `assistant/message` has only `reasoning`
    // and `tool-call` parts, and the tool arguments are a JSON *string* carrying the
    // plugin's own result schema — `summary` for an execution, `verdict` + `criteria`
    // for a verification.
    const execution = ctxWith({
        get: () => ({
          ownEvents: () => [{
            type: 'assistant/message',
            data: {
              message: {
                content: [
                  { type: 'reasoning', text: 'planning the work' },
                  { type: 'tool-call', name: 'submit', arguments: JSON.stringify({
                    summary: 'wrote data.txt with 1517 and check.mjs asserting it',
                    status: 'completed',
                    deliverables: [{ description: 'data file', locator: 'file:///work/data.txt' }],
                    evidence: [{ claim: 'assert passes', source: 'node check.mjs → exit 0' }],
                  }) },
                ],
              },
            },
          }],
        }),
    })
    const finding = childFinding(execution as never, 'child-2')
    expect(finding.text).toBeUndefined()
    expect(finding.submitted).toBe('wrote data.txt with 1517 and check.mjs asserting it')
    expect(finding.evidence).toEqual(['node check.mjs → exit 0', 'file:///work/data.txt'])

    const verification = ctxWith({
        get: () => ({
          ownEvents: () => [{
            type: 'assistant/message',
            data: {
              message: {
                content: [{
                  type: 'tool-call',
                  arguments: JSON.stringify({ verdict: 'pass', criteria: [{ criterion: 'a' }, { criterion: 'b' }] }),
                }],
              },
            },
          }],
        }),
    })
    expect(childFinding(verification as never, 'child-3').submitted).toBe('verdict pass · 2 criterion/criteria checked')

    // … and it reaches the archive as the agent entry's finding.
    expect(childFinding({ get: () => ({ get: () => ({ ownEvents: () => [
      { type: 'assistant/message', data: { message: { content: [{ type: 'tool-call', arguments: JSON.stringify({ tasks: [{ id: 'a' }, { id: 'b' }] }) }] } } },
    ] }) }) } as never, 'child-1').submitted).toBe('plan: 2 task(s)')

    const archiver = createMemoryArchiver({ ctx: execution as never, logger, dir })
    archiver.adopt('run-4', 'memory-archive')
    archiver.agentStart('run-4', { seq: 2, label: '执行', childId: 'child-2' })
    archiver.agentEnd('run-4', { seq: 2, outcome: 'completed' })
    const [stored] = readArchive({ dir })
    expect(stored!.summary).toBe('wrote data.txt with 1517 and check.mjs asserting it')
    expect(stored!.evidence).toEqual(['node check.mjs → exit 0', 'file:///work/data.txt'])
  })

  it('ignores another run, buffers events that arrive before adoption, and is idempotent on replay', () => {
    const archiver = createMemoryArchiver({ logger, dir })
    // Before adoption: buffered, not written.
    archiver.agentEnd('run-2', { seq: 2, outcome: 'completed' })
    expect(readArchive({ dir })).toEqual([])
    archiver.adopt('run-2', 'late')
    // The buffered settlement is flushed on adoption …
    expect(readArchive({ dir }).map(item => item.id)).toEqual(['run:run-2:agent:2'])

    // … a foreign run is ignored entirely …
    archiver.agentEnd('someone-else', { seq: 1, outcome: 'completed' })
    expect(readArchive({ dir }).map(item => item.id)).toEqual(['run:run-2:agent:2'])

    // … and replaying the same settlement writes nothing.
    archiver.adopt('run-2', 'late')
    archiver.agentEnd('run-2', { seq: 2, outcome: 'completed' })
    expect(lines()).toHaveLength(1)

    // A replayed round verdict is a no-op too.
    archiver.round({ runId: 'run-2', objective: 'o', summary: 'the finding', status: 'completed' })
    const afterFirstRound = readFileSync(archiveFile({ dir }), 'utf8')
    archiver.round({ runId: 'run-2', objective: 'o', summary: 'the finding', status: 'completed' })
    expect(readFileSync(archiveFile({ dir }), 'utf8')).toBe(afterFirstRound)
    expect(readArchive({ dir })).toHaveLength(2)

    archiver.dispose()
    archiver.agentEnd('run-2', { seq: 3, outcome: 'failed' })
    expect(readArchive({ dir })).toHaveLength(2)
  })

  it('describes a round from the validated report, not from a model paraphrase', () => {
    const summary = roundArchiveSummary({
      status: 'partial',
      tasks: [
        { id: 'a', title: 'Task a', status: 'verified' },
        { id: 'b', title: 'Task b', status: 'failed', error: 'no valid structured result' },
      ],
      confirmed: [{ taskId: 'a', criterion: 'a works', evidence: 'src/a.ts' }],
      incomplete: [{ taskId: 'b', reason: 'worker failed' }],
      uncertainties: [{ taskId: 'b', text: 'unverified' }],
      errors: [{ phase: 'Execute', message: 'child failed' }],
      synthesis: { mode: 'in-turn', summary: 'a is done' },
    } as never, 'report-invalid')
    expect(summary).toContain('status partial')
    expect(summary).toContain('verified 1/2 task(s)')
    expect(summary).toContain('confirmed 1 criterion/criteria')
    expect(summary).toContain('answer: a is done')
    expect(summary).toContain('task b failed')
    expect(summary).toContain('cause: report-invalid')
    expect(roundArchiveSummary(undefined, 'timeout')).toContain('no report: timeout')
  })
})

// ---------------------------------------------------------------------------
// C. The production path: `runWorkflow` archives mid-run, not at session exit
// ---------------------------------------------------------------------------

const executionResult = {
  summary: 'worker done',
  status: 'completed',
  deliverables: [{ description: 'output', locator: 'file:///tmp/out' }],
  evidence: [{ claim: 'implemented', source: 'src/index.ts' }],
  testsRun: [{ command: 'npm test', status: 'passed', detail: 'ok' }],
  filesChanged: [],
  uncertainties: [],
}

function taskFixture(id: string): NormalizedTask {
  return {
    id,
    title: `Task ${id}`,
    objective: `Do ${id}`,
    expectedOutput: `Output ${id}`,
    acceptanceCriteria: [`${id} works`],
    context: '',
    constraints: [],
    writesPaths: null,
  }
}

function verificationResult(task: NormalizedTask) {
  return {
    verdict: 'pass' as const,
    criteria: task.acceptanceCriteria.map(criterion => ({ criterion, met: true, evidence: `checked ${criterion}` })),
    checkedEvidence: [{ kind: 'file', locator: 'file:///tmp/out', finding: 'observed output' }],
    commandsRun: [{ command: 'npm test', status: 'passed', detail: 'ok' }],
    issues: [],
    confidence: 'high' as const,
  }
}

describe('a real run archives while it is running', () => {
  it('puts the first child\'s result on disk before the run settles, and the round verdict at settle', async () => {
    const task = taskFixture('a')
    let runSettled = false
    /** What the archive looked like from inside the second child's own activation. */
    let seenMidRun: ReturnType<typeof readArchive> = []
    let seenMidRunId = ''

    const engine = harness((call: ChildCall): ChildAnswer => {
      if (call.prompt.includes('You are the execution agent')) {
        return { structured: executionResult }
      }
      // The verifier activation happens after the worker settled: at this instant
      // the worker's entry must already be durable, and the run must still be live.
      seenMidRun = readArchive({ dir })
      seenMidRunId = lines()[0] ?? ''
      expect(runSettled).toBe(false)
      return { structured: verificationResult(task) }
    })
    // A real session store shape: the archive reads the child transcript through it.
    ;(engine.ctx as unknown as { sessions: unknown }).sessions = {
      get: (id: string) => ({
        ownEvents: () => [
          { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: `result of ${id}` }] } } },
        ],
      }),
    }

    const outcome = runWorkflow({
      ctx: engine.ctx as never,
      config: resolveConfig({ maxConcurrency: 1, maxRetries: 0, maxTasks: 4, timeoutMs: 60_000 }),
      state: createActiveState(),
      logger,
      agent: { session: Session.create('sess-memory-archive' as never) } as never,
      objective: 'Ship the verified result',
      callerTasks: [task],
      failureMode: 'report',
    })
    const settled = await outcome
    runSettled = true

    expect(settled.report.status).toBe('completed')

    // 1. The child's own result was archived the moment that child settled.
    expect(seenMidRun.map(item => item.kind)).toEqual(['agent'])
    expect(seenMidRun[0]!.summary).toBe('result of child-1')
    expect(seenMidRun[0]!.status).toBe('completed')

    // 2. The round verdict is there as soon as the run returns — no session-end,
    //    no dispose hook, no operator edit of STATE/HANDOFF involved.
    const archived = readArchive({ dir })
    const round = archived.find(item => item.kind === 'round')!
    expect(round.id).toBe(`run:${archived.find(item => item.kind === 'agent')!.runId}`)
    expect(round).toMatchObject({ status: 'completed', objective: 'Ship the verified result' })
    expect(round.summary).toContain('verified 1/1 task(s)')
    expect(round.evidence?.[0]).toContain('[a] a works')
    // Both children are archived, each under its own deterministic id.
    expect(archived.filter(item => item.kind === 'agent').map(item => item.id).sort())
      .toEqual([`${round.id}:agent:1`, `${round.id}:agent:2`])
    // 3. The append-only file is what the mid-run read saw, extended — never rewritten.
    expect(lines()[0]).toBe(seenMidRunId)
  })

  it('archives a round that hit the deadline, with its cause, so a later session still learns it happened', async () => {
    // The round never finished its work: the child is held open past the 1 s
    // deadline (the configured minimum). Nothing about that is a finding, but the *fact* that the round ran
    // and why it stopped is exactly what a later session must not have to guess.
    const hold = new Promise<void>(resolve => setTimeout(resolve, 2_500))
    const engine = harness(() => ({ structured: executionResult, gate: hold }))
    const outcome = await runWorkflow({
      ctx: engine.ctx as never,
      config: resolveConfig({ maxConcurrency: 1, maxRetries: 0, maxTasks: 2, timeoutMs: 1_000 }),
      state: createActiveState(),
      logger,
      agent: { session: Session.create('sess-memory-archive-timeout' as never) } as never,
      objective: 'Ship the verified result',
      callerTasks: [taskFixture('a')],
      failureMode: 'report',
    })
    expect(outcome.ok).toBe(false)
    const round = readArchive({ dir }).find(item => item.kind === 'round')!
    expect(round.objective).toBe('Ship the verified result')
    expect(round.summary).toContain('cause: timeout')
    await hold
  })
})

describe('the front-desk tier is a round too', () => {
  it('archives the one-call answer under its own run id before the call returns', async () => {
    const engine = harness(() => ({ output: [{ type: 'text', text: '407 是 11 乘 37 的结果' }] }))
    const outcome = await runSingleCall({
      ctx: engine.ctx as never,
      config: resolveConfig({ maxConcurrency: 1, maxRetries: 0, maxTasks: 2, timeoutMs: 30_000 }),
      state: createActiveState(),
      logger,
      agent: { session: Session.create('sess-memory-front-desk' as never) } as never,
      prompt: '11 乘 37 等于多少？',
      label: 'Front desk',
    })
    expect(outcome).toEqual({ ok: true, text: '407 是 11 乘 37 的结果' })

    const [stored] = readArchive({ dir })
    expect(stored).toMatchObject({
      kind: 'round',
      status: 'completed',
      objective: '11 乘 37 等于多少？',
      summary: '407 是 11 乘 37 的结果',
      sessionId: 'sess-memory-front-desk',
    })
    expect(stored!.id.startsWith('run:')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// D. A reader that has nothing but the file
// ---------------------------------------------------------------------------

describe('a fresh process finds the newest archive', () => {
  function freshReader(script: string, args: string[]): string {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, ...args], {
      encoding: 'utf8',
      env: { ...process.env, GROK_WORKFLOW_MEMORY_DIR: dir },
    })
    expect(result.error).toBeUndefined()
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    return result.stdout
  }

  it('answers "what was archived last?" from a process with no session and no plugin state', () => {
    expect(existsSync(LIB_ARCHIVE)).toBe(true)
    appendArchiveEntry(entry({ id: 'run:old', atMs: 1_000, at: '1970-01-01T00:00:01.000Z' }), { dir })
    appendArchiveEntry(entry({
      id: 'run:newest',
      kind: 'agent',
      atMs: 9_000,
      at: '1970-01-01T00:00:09.000Z',
      summary: 'the newest research result',
    }), { dir })

    const stdout = freshReader(
      `const { readArchive } = await import(${JSON.stringify(LIB_ARCHIVE)});` +
      `process.stdout.write(JSON.stringify(readArchive({ limit: 2 })));`,
      [],
    )
    const read = JSON.parse(stdout) as Array<{ id: string, summary: string }>
    expect(read.map(item => item.id)).toEqual(['run:newest', 'run:old'])
    expect(read[0]!.summary).toBe('the newest research result')
  })

  it('prints the same answer through the shipped CLI, with no session in sight', () => {
    expect(existsSync(LIB_CLI)).toBe(true)
    appendArchiveEntry(entry({ id: 'run:cli', summary: 'research from the CLI reader' }), { dir })
    const result = spawnSync(process.execPath, [LIB_CLI, 'recent', '--limit', '1', '--dir', dir], { encoding: 'utf8' })
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toContain('run:cli')
    expect(result.stdout).toContain('research from the CLI reader')

    const json = spawnSync(process.execPath, [LIB_CLI, 'recent', '--json', '--dir', dir], { encoding: 'utf8' })
    expect(JSON.parse(json.stdout).map((item: { id: string }) => item.id)).toEqual(['run:cli'])
  })

  it('keeps the CLI usable with a bad flag and never throws on an empty archive', () => {
    const out: string[] = []
    const err: string[] = []
    const io = { out: (line: string) => out.push(line), err: (line: string) => err.push(line) }
    expect(runArchiveCli(['recent', '--limit', 'not-a-number', '--dir', join(dir, 'empty')], io)).toBe(0)
    expect(out.join('\n')).toContain('no entries')
    expect(err).toEqual([])
    expect(runArchiveCli(['--help'], io)).toBe(0)
    expect(out.join('\n')).toContain('usage: node lib/memory/cli.js')
    out.length = 0
    expect(runArchiveCli(['path', '--dir', dir], io)).toBe(0)
    expect(out.join('\n')).toContain(join(dir, 'archive.jsonl'))
  })
})
