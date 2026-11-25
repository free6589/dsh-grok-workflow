/**
 * The block supervisor: six deterministic checks, then one judge, then one row.
 *
 * Two properties are the whole point of this file, and both are asserted as facts
 * rather than described:
 *
 * 1. **A deterministic failure costs nothing.** Every one of the six checks has a case
 *    that fails on it alone, and each asserts `startCalls.length === 0` — a veto on
 *    bookkeeping must never spend a child call.
 * 2. **A veto changes nothing but the verdict file.** The block row is the same object
 *    before and after, and the verdict file grew by exactly one line.
 *
 * Boundary: the ledger is real (files under `.tmp/`), the supervisor script is the real
 * generated guest script executed in a VM, and the engine is a fake that records every
 * `start` — no model is called.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import { BLOCK_LEDGER_VERSION, readVerdictRows } from '../src/block/index.js'
import type { BlockEntry, BlockRow, BlockTaskRow } from '../src/block/index.js'
import { resolveConfig } from '../src/config.js'
import { runBlockSupervisor } from '../src/supervisor/index.js'
import { SCOPE_CRITERION } from '../src/supervisor/checks.js'
import { SUPERVISOR_FAILED, evidenceHashOf } from '../src/supervisor/verdict.js'
import { runWorkflowScript } from './helpers.js'

/* ------------------------------------------------------------------ ledger -- */

let ledgerDir = ''
const previousLedgerDir = process.env['GROK_WORKFLOW_BLOCK_LEDGER_DIR']

beforeAll(() => {
  mkdirSync(join(process.cwd(), '.tmp'), { recursive: true })
  ledgerDir = mkdtempSync(join(process.cwd(), '.tmp', 'block-supervisor-'))
  process.env['GROK_WORKFLOW_BLOCK_LEDGER_DIR'] = ledgerDir
})

afterAll(() => {
  if (previousLedgerDir === undefined) delete process.env['GROK_WORKFLOW_BLOCK_LEDGER_DIR']
  else process.env['GROK_WORKFLOW_BLOCK_LEDGER_DIR'] = previousLedgerDir
  try { rmSync(ledgerDir, { recursive: true, force: true }) } catch { /* already gone */ }
})

beforeEach(() => {
  try { rmSync(join(ledgerDir, 'verdicts.jsonl'), { force: true }) } catch { /* nothing */ }
})

/* ------------------------------------------------------------------ engine -- */

interface EngineResult { value: unknown; stopReason: string; agentsStarted: number }

class FakeRun {
  readonly id = 'run-supervisor'
  readonly meta: WorkflowStartRequest['meta']
  readonly dispose = vi.fn(async () => {})
  readonly result: Promise<EngineResult>
  private settle!: (value: EngineResult) => void
  readonly cancel = vi.fn(() => this.settle({ value: null, stopReason: 'cancelled', agentsStarted: 0 }))

  constructor(request: WorkflowStartRequest) {
    this.meta = request.meta
    this.result = new Promise(resolve => { this.settle = resolve })
  }

  complete(value: unknown): void {
    this.settle({ value, stopReason: 'completed', agentsStarted: 1 })
  }
}

/** The engine the supervisor talks to: records every start, answers from a script. */
class FakeEngine {
  readonly startCalls: WorkflowStartRequest[] = []
  /** What the judge child returns; `throwOnStart` makes the whole leg die instead. */
  answer: unknown = { criteria: [] }
  throwOnStart = false

  async start(request: WorkflowStartRequest): Promise<FakeRun> {
    this.startCalls.push(request)
    if (this.throwOnStart) throw new Error('engine refused to start')
    const run = new FakeRun(request)
    const scripted = await runWorkflowScript(request.script, {}, async () => this.answer)
    run.complete(scripted.report)
    return run
  }
}

/** The ctx surface `teamWorkflowEngine` reads. */
function ctxWith(engine: FakeEngine): never {
  return { workflowEngine: engine } as never
}

const logger = { warn: () => {}, info: () => {} }

/* ------------------------------------------------------------------- rows -- */

const CRITERIA = ['账本里有一行', '结论写出来了'] as const

function blockOf(overrides: Partial<BlockEntry> = {}): BlockEntry {
  return {
    id: 'blk-1',
    title: '读账本',
    objective: '把账本读出来',
    deliverable: '一段结论',
    acceptance: [...CRITERIA],
    writesPaths: ['src/block'],
    dependsOn: [],
    execution: 'workflow',
    status: 'open',
    tasks: [],
    ...overrides,
  }
}

function rowOf(block: BlockEntry, siblings: BlockEntry[] = []): BlockRow {
  const at = '2026-01-01T00:00:00.000Z'
  return {
    v: BLOCK_LEDGER_VERSION,
    id: 'row-1',
    sessionId: 'sess-supervisor',
    objective: '把账本读出来',
    splitHash: 'a'.repeat(64),
    approval: { kind: 'user', quote: '确认', at },
    blocks: [block, ...siblings],
    version: 1,
    createdAt: at,
    updatedAt: at,
    rowHash: '',
  }
}

/** A split that answers both criteria inside the approved scope. */
function goodTasks(): BlockTaskRow[] {
  return [{
    id: 'blk-1-t1',
    title: '读账本',
    objective: '读 blocks.jsonl',
    acceptanceCriteria: [...CRITERIA],
    writesPaths: ['src/block/tools.ts'],
  }]
}

const GOOD_HANDOFF = [
  '做了什么：读完了 blocks.jsonl 并写了结论',
  '证据：读完了 blocks.jsonl，有一行；结论：接单台子可以用了',
  '没做：没有跑真机 soak',
  '下一步：等调度验收',
].join('\n')

/** Every path this suite declares exists, so the artifact check is a stated fact. */
const exists = (): boolean => true

/** Run one verdict against a fresh engine. */
async function judge(options: {
  block?: Partial<BlockEntry>
  siblings?: BlockEntry[]
  tasks?: BlockTaskRow[]
  handoff?: string
  engine?: FakeEngine
  override?: { who: string, why: string }
  judge?: boolean
  exists?: (path: string) => boolean
} = {}): Promise<{ outcome: Awaited<ReturnType<typeof runBlockSupervisor>>, engine: FakeEngine }> {
  const engine = options.engine ?? new FakeEngine()
  const block = blockOf(options.block)
  const outcome = await runBlockSupervisor({
    ctx: ctxWith(engine),
    config: resolveConfig({}),
    logger,
    agent: {} as never,
    row: rowOf(block, options.siblings ?? []),
    block,
    handoff: options.handoff ?? GOOD_HANDOFF,
    tasks: options.tasks ?? goodTasks(),
    ...options.override === undefined ? {} : { override: options.override },
    ...options.judge === undefined ? {} : { judge: options.judge },
    exists: options.exists ?? exists,
    dir: ledgerDir,
    now: Date.parse('2026-01-02T00:00:00.000Z'),
  })
  return { outcome, engine }
}

function verdictLines(): string[] {
  try {
    return readFileSync(join(ledgerDir, 'verdicts.jsonl'), 'utf8').split('\n').filter(line => line.trim() !== '')
  } catch {
    return []
  }
}

/* -------------------------------------------------------------------- tests -- */

describe('the six deterministic checks veto without spending a model call', () => {
  it('1 · plan coverage: a criterion no task claims', async () => {
    const { outcome, engine } = await judge({
      tasks: [{ id: 't1', title: '读账本', objective: '读', acceptanceCriteria: [CRITERIA[0]], writesPaths: ['src/block/tools.ts'] }],
    })
    expect(outcome.outcome).toBe('veto')
    expect(outcome.verdict.route).toBe('deterministic')
    expect(outcome.failures.map(failure => failure.criterion)).toContain(CRITERIA[1])
    expect(engine.startCalls).toHaveLength(0)
    expect(verdictLines()).toHaveLength(1)
  })

  it('2 · evidence is not blank: a one-character evidence line', async () => {
    const { outcome, engine } = await judge({
      handoff: ['做了什么：读完了', '证据：x', '没做：无', '下一步：等验收'].join('\n'),
    })
    expect(outcome.outcome).toBe('veto')
    expect(outcome.failures.map(failure => failure.criterion)).toContain('证据')
    expect(engine.startCalls).toHaveLength(0)
  })

  it('3 · artifacts are parseable: a declared path that does not exist', async () => {
    const { outcome, engine } = await judge({ exists: () => false })
    expect(outcome.outcome).toBe('veto')
    expect(JSON.stringify(outcome.failures)).toContain('不存在')
    expect(engine.startCalls).toHaveLength(0)
  })

  it('4 · scope is inside the approval: a write outside the approved paths', async () => {
    const { outcome, engine } = await judge({
      tasks: [{ id: 't1', title: '读账本', objective: '读', acceptanceCriteria: [...CRITERIA], writesPaths: ['docs/knowledge/STATE.md'] }],
    })
    expect(outcome.outcome).toBe('veto')
    expect(outcome.failures.map(failure => failure.criterion)).toContain(SCOPE_CRITERION)
    expect(engine.startCalls).toHaveLength(0)
  })

  it('5 · dangling dependency: a title no sibling carries', async () => {
    const { outcome, engine } = await judge({ block: { dependsOn: ['不存在的块'] } })
    expect(outcome.outcome).toBe('veto')
    expect(JSON.stringify(outcome.failures)).toContain('不存在的块')
    expect(engine.startCalls).toHaveLength(0)
  })

  it('5b · dangling dependency: a sibling that is still open', async () => {
    const sibling = blockOf({ id: 'blk-2', title: '写结论', status: 'open' })
    const { outcome, engine } = await judge({ block: { dependsOn: ['写结论'] }, siblings: [sibling] })
    expect(outcome.outcome).toBe('veto')
    expect(JSON.stringify(outcome.failures)).toContain('还没有交工')
    expect(engine.startCalls).toHaveLength(0)
  })

  it('6 · the handoff has its four lines', async () => {
    const { outcome, engine } = await judge({
      handoff: ['做了什么：读完了', '证据：读完了 blocks.jsonl，有一行', '下一步：等验收'].join('\n'),
    })
    expect(outcome.outcome).toBe('veto')
    expect(outcome.failures.map(failure => failure.criterion)).toContain('交接四行')
    expect(engine.startCalls).toHaveLength(0)
  })

  it('leaves the block row untouched and writes only the verdict line', async () => {
    const block = blockOf()
    const row = rowOf(block)
    const before = JSON.stringify(row)
    const engine = new FakeEngine()
    await runBlockSupervisor({
      ctx: ctxWith(engine), config: resolveConfig({}), logger, agent: {} as never,
      row, block, handoff: '一行\n两行\n三行', tasks: goodTasks(), exists, dir: ledgerDir,
    })
    expect(JSON.stringify(row)).toBe(before)
    expect(verdictLines()).toHaveLength(1)
  })
})

describe('the judge decides only after the bookkeeping is clean', () => {
  it('passes when every criterion is met and the checks are clean', async () => {
    const engine = new FakeEngine()
    engine.answer = {
      criteria: [
        { text: CRITERIA[0], met: true, evidence: ['读完了 blocks.jsonl，有一行'] },
        { text: CRITERIA[1], met: true, evidence: ['结论：接单台子可以用了'] },
      ],
    }
    const { outcome } = await judge({ engine })
    expect(outcome.outcome).toBe('pass')
    expect(outcome.judged).toBe(true)
    expect(outcome.verdict.route).toBe('inherit')
    expect(engine.startCalls).toHaveLength(1)
    expect(engine.startCalls[0]!.meta.name).toBe('Block supervisor')
    expect(engine.startCalls[0]!.maxTotalAgents).toBe(1)
    expect(outcome.verdict.criteria.every(criterion => criterion.met)).toBe(true)
  })

  it('vetoes with a named reason when one criterion is not met', async () => {
    const engine = new FakeEngine()
    engine.answer = {
      criteria: [
        { text: CRITERIA[0], met: true, evidence: ['读完了 blocks.jsonl，有一行'] },
        { text: CRITERIA[1], met: false, evidence: [] },
      ],
    }
    const { outcome } = await judge({ engine })
    expect(outcome.outcome).toBe('veto')
    expect(outcome.verdict.route).toBe('inherit')
    expect(outcome.failures).toHaveLength(1)
    expect(outcome.failures[0]!.criterion).toBe(CRITERIA[1])
    expect(outcome.failures[0]!.why).toContain('监工')
    expect(verdictLines()).toHaveLength(1)
  })

  it('re-fires once when the leg dies in transport, then reports a failed judge', async () => {
    const engine = new FakeEngine()
    engine.throwOnStart = true
    const { outcome } = await judge({ engine })
    expect(engine.startCalls, 'the judge leg is fired twice in one attempt').toHaveLength(2)
    expect(outcome.outcome).toBe('veto')
    expect(JSON.stringify(outcome.failures)).toContain(SUPERVISOR_FAILED)
  })

  it('re-fires once when the answer cannot be parsed, then reports a failed judge', async () => {
    const engine = new FakeEngine()
    engine.answer = 'not json at all'
    const { outcome } = await judge({ engine })
    expect(engine.startCalls).toHaveLength(2)
    expect(outcome.outcome).toBe('veto')
    expect(JSON.stringify(outcome.failures)).toContain(SUPERVISOR_FAILED)
  })

  it('refuses an answer that silently drops a criterion instead of reading it as a no', async () => {
    const engine = new FakeEngine()
    engine.answer = { criteria: [{ text: CRITERIA[0], met: true, evidence: ['有'] }] }
    const { outcome } = await judge({ engine })
    expect(outcome.outcome).toBe('veto')
    expect(JSON.stringify(outcome.failures)).toContain(SUPERVISOR_FAILED)
  })
})

describe('the same evidence never earns a second verdict line', () => {
  it('returns the earlier verdict and appends nothing', async () => {
    const engine = new FakeEngine()
    engine.answer = {
      criteria: [
        { text: CRITERIA[0], met: true, evidence: ['读完了 blocks.jsonl，有一行'] },
        { text: CRITERIA[1], met: true, evidence: ['结论：接单台子可以用了'] },
      ],
    }
    const first = await judge({ engine })
    const second = await judge({ engine })
    expect(first.outcome.evidenceUnchanged).toBe(false)
    expect(second.outcome.evidenceUnchanged).toBe(true)
    expect(second.outcome.verdict.verdictId).toBe(first.outcome.verdict.verdictId)
    expect(verdictLines()).toHaveLength(1)
    expect(engine.startCalls, 'a re-submit with the same evidence asks nothing').toHaveLength(1)
  })

  it('treats a changed handoff as a new attempt', async () => {
    const engine = new FakeEngine()
    engine.answer = {
      criteria: [
        { text: CRITERIA[0], met: true, evidence: ['读完了 blocks.jsonl，有一行'] },
        { text: CRITERIA[1], met: true, evidence: ['结论：接单台子可以用了'] },
      ],
    }
    await judge({ engine })
    const second = await judge({ engine, handoff: GOOD_HANDOFF.replace('下一步：等调度验收', '下一步：补真机 soak') })
    expect(second.outcome.evidenceUnchanged).toBe(false)
    expect(second.outcome.verdict.attempt).toBe(2)
    expect(verdictLines()).toHaveLength(2)
  })

  it('hashes the block, the criteria, the split and the handoff — nothing else', () => {
    const base = { blockId: 'row-1', acceptance: [...CRITERIA], tasks: goodTasks(), handoff: GOOD_HANDOFF }
    expect(evidenceHashOf(base)).toBe(evidenceHashOf({ ...base }))
    expect(evidenceHashOf(base)).not.toBe(evidenceHashOf({ ...base, handoff: `${GOOD_HANDOFF}\n多一行` }))
  })
})

describe('a human may overrule the scope veto, and only that one', () => {
  it('passes a scope-only veto when the overrule is recorded', async () => {
    const engine = new FakeEngine()
    engine.answer = {
      criteria: [
        { text: CRITERIA[0], met: true, evidence: ['读完了 blocks.jsonl，有一行'] },
        { text: CRITERIA[1], met: true, evidence: ['结论：接单台子可以用了'] },
      ],
    }
    const { outcome } = await judge({
      engine,
      tasks: [{ id: 't1', title: '读账本', objective: '读', acceptanceCriteria: [...CRITERIA], writesPaths: ['docs/knowledge/STATE.md'] }],
      override: { who: 'operator', why: '这份记录本来就要更新' },
    })
    expect(outcome.outcome).toBe('pass')
    expect(outcome.verdict.override).toEqual({ who: 'operator', why: '这份记录本来就要更新' })
  })

  it('cannot overrule a check that is not about scope', async () => {
    const { outcome } = await judge({ handoff: '一行\n两行', override: { who: 'operator', why: '就这一次' } })
    expect(outcome.outcome).toBe('veto')
    expect(outcome.verdict.override).toBeUndefined()
  })
})

describe('skipping the judge is stated, never silent', () => {
  it('marks the criteria and spends no model call', async () => {
    const { outcome, engine } = await judge({ judge: false })
    expect(outcome.outcome).toBe('pass')
    expect(outcome.judged).toBe(false)
    expect(outcome.verdict.route).toBe('deterministic')
    expect(engine.startCalls).toHaveLength(0)
    expect(JSON.stringify(outcome.verdict.criteria)).toContain('未过监工')
  })
})

describe('the ledger stays append-only', () => {
  it('reads back exactly the rows it wrote', async () => {
    const engine = new FakeEngine()
    engine.answer = {
      criteria: [
        { text: CRITERIA[0], met: true, evidence: ['读完了 blocks.jsonl，有一行'] },
        { text: CRITERIA[1], met: false, evidence: [] },
      ],
    }
    await judge({ engine })
    const rows = await readVerdictRows({ dir: ledgerDir })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.outcome).toBe('veto')
    expect(rows[0]!.by).toBe('plugin:block-supervisor')
    expect(rows.skipped).toHaveLength(0)
  })
})
