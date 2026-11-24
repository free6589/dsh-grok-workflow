/**
 * The five block tools, driven through the real registry.
 *
 * What is real here: `apply()`, the cordis context, `ToolRuntime` (so the tools are
 * fetched from the registry the runtime would serve), the real `Session` (the approval
 * quote is matched against messages the session actually logged), and the ledger on
 * disk under `.tmp/`. What is fake: the workflow engine, which records every `start`
 * and answers a supervisor call from a scripted child — no model is called.
 *
 * The suite is organised the way a caller meets the surface: preview, start (and every
 * way a start is refused), claim, hand in, read back, steer.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import type { WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { createSystemMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session } from '@deepseek-ai/dsh-session'
import { apply } from '../src/index.js'
import { previewBlocks, resetPreviews } from '../src/block/index.js'
import { BLOCK_TOOL_NAMES } from '../src/block/tools.js'
import { closeAllSteering, openSteering, pullSteering } from '../src/steering.js'
import { delay } from './helpers.js'

/* ------------------------------------------------------------------ ledger -- */

let ledgerDir = ''
const previousLedgerDir = process.env['GROK_WORKFLOW_BLOCK_LEDGER_DIR']
const previousStopFile = process.env['GROK_WORKFLOW_STOP_FILE']

beforeAll(() => {
  mkdirSync(join(process.cwd(), '.tmp'), { recursive: true })
  ledgerDir = mkdtempSync(join(process.cwd(), '.tmp', 'block-tools-'))
  process.env['GROK_WORKFLOW_BLOCK_LEDGER_DIR'] = ledgerDir
  // The loop's operator-stop marker would turn a heartbeat into a stop; nothing here
  // is about that switch.
  process.env['GROK_WORKFLOW_STOP_FILE'] = join(ledgerDir, 'STOP-does-not-exist')
})

afterAll(() => {
  if (previousLedgerDir === undefined) delete process.env['GROK_WORKFLOW_BLOCK_LEDGER_DIR']
  else process.env['GROK_WORKFLOW_BLOCK_LEDGER_DIR'] = previousLedgerDir
  if (previousStopFile === undefined) delete process.env['GROK_WORKFLOW_STOP_FILE']
  else process.env['GROK_WORKFLOW_STOP_FILE'] = previousStopFile
  try { rmSync(ledgerDir, { recursive: true, force: true }) } catch { /* already gone */ }
})

beforeEach(() => {
  resetPreviews()
  // One ledger per test: a leftover row would make "the ledger has one line" a claim
  // about the previous test.
  for (const file of ['blocks.jsonl', 'verdicts.jsonl', 'heartbeats.jsonl']) {
    try { rmSync(join(ledgerDir, file), { force: true }) } catch { /* nothing to remove */ }
  }
})

/* ------------------------------------------------------------------ engine -- */

interface EngineResult { value: unknown; stopReason: string; agentsStarted: number }

class FakeRun {
  readonly id = 'run-block-tools'
  readonly meta: WorkflowStartRequest['meta']
  readonly dispose = vi.fn(async () => {})
  readonly result: Promise<EngineResult>
  private settle!: (value: EngineResult) => void
  readonly cancel = vi.fn(() => {
    this.settle({ value: null, stopReason: 'cancelled', agentsStarted: 0 })
  })

  constructor(request: WorkflowStartRequest) {
    this.meta = request.meta
    this.result = new Promise(resolve => { this.settle = resolve })
  }

  complete(value: unknown): void {
    this.settle({ value, stopReason: 'completed', agentsStarted: 1 })
  }
}

/** Scripted supervisor answer: every criterion met, with the handoff quoted back. */
const SUPERVISOR_OK = {
  criteria: [
    { text: '账本里有一行', met: true, evidence: ['读完了 blocks.jsonl，有一行'] },
    { text: '结论写出来了', met: true, evidence: ['结论：接单台子可以用了'] },
  ],
}

class FakeEngine {
  readonly startCalls: WorkflowStartRequest[] = []
  /** What the scripted judge answers; a test may replace it. */
  judgeAnswer: unknown = SUPERVISOR_OK
  /** Settle the run with a value instead of leaving it in flight. */
  autoSettle = true

  async start(request: WorkflowStartRequest): Promise<FakeRun> {
    this.startCalls.push(request)
    const run = new FakeRun(request)
    request.signal?.addEventListener('abort', () => run.cancel(), { once: true })
    if (this.autoSettle && request.meta.name === 'Block supervisor') {
      // The real guest script is executed in a VM with one scripted child, so the
      // host side reads a value exactly the way it would from a live run.
      const scripted = await runScript(request.script, this.judgeAnswer)
      run.complete(scripted)
    }
    return run
  }
}

/** Run the supervisor script with a scripted `agent()`. */
async function runScript(script: string, answer: unknown): Promise<unknown> {
  const { runWorkflowScript } = await import('./helpers.js')
  const result = await runWorkflowScript(script, {}, async () => answer)
  return result.report
}

/* ------------------------------------------------------------------ harness -- */

const mountedContexts: Context[] = []

afterEach(async () => {
  for (const ctx of mountedContexts.splice(0)) {
    try { await ctx.fiber.dispose() } catch { /* already disposed */ }
  }
  closeAllSteering()
})

interface Mounted { ctx: Context; engine: FakeEngine }

async function mount(): Promise<Mounted> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  const engine = new FakeEngine()
  await ctx.plugin({
    name: 'stub-workflow-engine',
    apply(inner: Context) { inner.provide('workflowEngine', engine) },
  } as never, {} as never)
  apply(ctx as never, { blockIntake: true, grokDefault: 'off', mode: 'triage' } as never)
  mountedContexts.push(ctx)
  return { ctx, engine }
}

/** A session with a head, so it is a real conversation. */
function headed(id: string): Session {
  const live = Session.create(id as never)
  live.append('step/start', { turn: 1, step: 1 })
  live.append('system/message', { turn: 1, step: 1, message: createSystemMessage('test head') }, { surfaceOp: 'append' })
  live.append('step/end', { turn: 1, step: 1 })
  return live
}

/** Append one user turn the way the loop does. */
function say(live: Session, text: string): void {
  const message = createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } as never }) as UserMessage
  live.append('user/message', message, { surfaceOp: 'append' })
}

/** The `exec` a tool call receives. */
function execOf(live: Session): unknown {
  return { agent: { session: live }, signal: new AbortController().signal }
}

/** Call one registered tool by name. */
async function call(
  mounted: Mounted,
  name: string,
  args: Record<string, unknown>,
  live: Session,
): Promise<Record<string, unknown>> {
  const tool = mounted.ctx.tools.get(name)
  expect(tool, `${name} must be registered when blockIntake is on`).toBeDefined()
  return await (tool as unknown as { execute(args: unknown, exec: unknown): Promise<Record<string, unknown>> })
    .execute(args, execOf(live)) as Record<string, unknown>
}

/** The blocks the ledger holds, one row per line. */
function ledgerLines(): string[] {
  try {
    return readFileSync(join(ledgerDir, 'blocks.jsonl'), 'utf8').split('\n').filter(line => line.trim() !== '')
  } catch {
    return []
  }
}

function verdictLines(): string[] {
  try {
    return readFileSync(join(ledgerDir, 'verdicts.jsonl'), 'utf8').split('\n').filter(line => line.trim() !== '')
  } catch {
    return []
  }
}

/** A two-block split the tests preview. */
const BLOCKS = [
  {
    title: '读账本',
    objective: '把 blocks.jsonl 读出来',
    deliverable: '一段读账本的结论',
    acceptance: ['账本里有一行', '结论写出来了'],
    writesPaths: ['src/block'],
    execution: 'workflow',
  },
  {
    title: '写结论',
    objective: '把结论写进交接',
    deliverable: '四行交接',
    acceptance: ['结论写出来了'],
    execution: 'foreman',
    dependsOn: ['读账本'],
  },
] as const

/** Preview a split and return the tool's answer. */
async function preview(
  mounted: Mounted,
  live: Session,
  extra: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  return await call(mounted, BLOCK_TOOL_NAMES.open, {
    mode: 'preview',
    objective: '把接单台子的账本读出来，然后写一句结论',
    blocks: BLOCKS,
    ...extra,
  }, live)
}

/**
 * Append the approving turn *after* the preview.
 *
 * The tool reads the approval out of the session log with `time > preview.createdAtMs`,
 * so the message has to be stamped later than the preview; a couple of milliseconds is
 * enough and keeps the test independent of the clock's resolution.
 */
async function approveAfterPreview(live: Session, text = '确认'): Promise<void> {
  await delay(5)
  say(live, text)
}

/* -------------------------------------------------------------------- tests -- */

describe('grok_open_block: preview writes nothing and start records the approved split', () => {
  it('previews a split without touching the ledger', async () => {
    const mounted = await mount()
    const live = headed('sess-preview')
    const previewed = await preview(mounted, live)
    expect(previewed['requires_user_approval']).toBe(true)
    expect(String(previewed['preview_id'])).toMatch(/^bp-/)
    expect(String(previewed['split_hash'])).toMatch(/^[0-9a-f]{64}$/)
    expect(String(previewed['render'])).toContain('读账本')
    expect(String(previewed['render'])).toContain('确认')
    expect(String(previewed['expires_at'])).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(ledgerLines()).toHaveLength(0)
  })

  it('starts a block once the user says yes in their own words, and does not wait for work', async () => {
    const mounted = await mount()
    const live = headed('sess-start')
    const previewed = await preview(mounted, live)
    await approveAfterPreview(live)
    const started = await call(mounted, BLOCK_TOOL_NAMES.open, {
      mode: 'start',
      preview_id: previewed['preview_id'],
      split_hash: previewed['split_hash'],
      approval: { kind: 'user', quote: '确认' },
    }, live)
    expect(String(started['block_id'])).toMatch(/^[0-9a-f-]{36}$/)
    expect(started['status']).toBe('open')
    expect(started['reused']).toBe(false)
    expect(started['waited_for_run']).toBe(false)
    expect(String(started['ledger_path'])).toContain('blocks.jsonl')
    expect(String(started['dispatch_envelope'])).toContain('读账本')
    expect(ledgerLines()).toHaveLength(1)
    // Nothing ran: the tool only records the approval.
    expect(mounted.engine.startCalls).toHaveLength(0)
  })

  it('refuses a quote the session never received', async () => {
    const mounted = await mount()
    const live = headed('sess-noquote')
    const previewed = await preview(mounted, live)
    await approveAfterPreview(live, '我想想再说')
    await expect(call(mounted, BLOCK_TOOL_NAMES.open, {
      mode: 'start',
      preview_id: previewed['preview_id'],
      split_hash: previewed['split_hash'],
      approval: { kind: 'user', quote: '确认' },
    }, live)).rejects.toMatchObject({ code: 'approval-required' })
    expect(ledgerLines()).toHaveLength(0)
  })

  it('refuses a hedge even when the words contain an approval', async () => {
    const mounted = await mount()
    const live = headed('sess-hedge')
    const previewed = await preview(mounted, live)
    await approveAfterPreview(live, '先别开工，等一下')
    await expect(call(mounted, BLOCK_TOOL_NAMES.open, {
      mode: 'start',
      preview_id: previewed['preview_id'],
      split_hash: previewed['split_hash'],
      approval: { kind: 'user', quote: '先别开工' },
    }, live)).rejects.toMatchObject({ code: 'not-approval' })
    expect(ledgerLines()).toHaveLength(0)
  })

  it('refuses a split that changed after the preview', async () => {
    const mounted = await mount()
    const live = headed('sess-changed')
    const previewed = await preview(mounted, live)
    await approveAfterPreview(live)
    await expect(call(mounted, BLOCK_TOOL_NAMES.open, {
      mode: 'start',
      preview_id: previewed['preview_id'],
      split_hash: 'f'.repeat(64),
      approval: { kind: 'user', quote: '确认' },
    }, live)).rejects.toMatchObject({ code: 'split-changed' })
  })

  it('refuses an expired preview instead of the misleading "no such preview"', async () => {
    const mounted = await mount()
    const live = headed('sess-expired')
    // Made an hour and a half ago: the ttl is ten minutes.
    const stale = previewBlocks({
      sessionId: 'sess-expired',
      objective: '把接单台子的账本读出来',
      blocks: BLOCKS as never,
      now: Date.now() - 90 * 60_000,
    })
    await approveAfterPreview(live)
    await expect(call(mounted, BLOCK_TOOL_NAMES.open, {
      mode: 'start',
      preview_id: stale.previewId,
      split_hash: stale.splitHash,
      approval: { kind: 'user', quote: '确认' },
    }, live)).rejects.toMatchObject({ code: 'preview-expired' })
  })

  it('refuses a preview id it never issued', async () => {
    const mounted = await mount()
    const live = headed('sess-unknown')
    await expect(call(mounted, BLOCK_TOOL_NAMES.open, {
      mode: 'start',
      preview_id: 'bp-not-a-preview',
      split_hash: 'a'.repeat(64),
      approval: { kind: 'user', quote: '确认' },
    }, live)).rejects.toMatchObject({ code: 'not-found' })
  })

  it('is idempotent: the same split started twice is the same block', async () => {
    const mounted = await mount()
    const live = headed('sess-idempotent')
    const previewed = await preview(mounted, live)
    await approveAfterPreview(live)
    const args = {
      mode: 'start',
      preview_id: previewed['preview_id'],
      split_hash: previewed['split_hash'],
      approval: { kind: 'user', quote: '确认' },
    }
    const first = await call(mounted, BLOCK_TOOL_NAMES.open, args, live)
    const second = await call(mounted, BLOCK_TOOL_NAMES.open, args, live)
    expect(second['block_id']).toBe(first['block_id'])
    expect(second['reused']).toBe(true)
    expect(ledgerLines()).toHaveLength(1)
  })

  it('names the mode it needs instead of guessing', async () => {
    const mounted = await mount()
    const live = headed('sess-mode')
    await expect(call(mounted, BLOCK_TOOL_NAMES.open, { mode: 'open' }, live))
      .rejects.toMatchObject({ code: 'invalid' })
    await expect(call(mounted, BLOCK_TOOL_NAMES.open, { mode: 'preview', objective: '', blocks: [] }, live))
      .rejects.toMatchObject({ code: 'invalid' })
  })
})

describe('grok_accept_block: a claim keeps the block open and names its plan', () => {
  it('returns the plan id, the split, the scope and the progress', async () => {
    const mounted = await mount()
    const live = headed('sess-accept')
    const previewed = await preview(mounted, live)
    await approveAfterPreview(live)
    const started = await call(mounted, BLOCK_TOOL_NAMES.open, {
      mode: 'start',
      preview_id: previewed['preview_id'],
      split_hash: previewed['split_hash'],
      approval: { kind: 'user', quote: '确认' },
    }, live)
    const claimed = await call(mounted, BLOCK_TOOL_NAMES.accept, { block_id: started['block_id'] }, live)
    expect(String(claimed['plan_id'])).toMatch(/^plan-/)
    expect(claimed['status']).toBe('open')
    expect(claimed['writes_paths']).toEqual(['src/block'])
    // Two blocks in the row, both still open: a claim is not a start and not a close.
    expect(claimed['progress']).toEqual({ total: 2, open: 2, accepted: 0, vetoed: 0 })
    // A claim is a new row version, not a rewrite of the first one.
    expect(ledgerLines()).toHaveLength(2)
  })

  it('refuses a block the ledger does not have', async () => {
    const mounted = await mount()
    await expect(call(mounted, BLOCK_TOOL_NAMES.accept, { block_id: 'nope' }, headed('sess-accept-missing')))
      .rejects.toMatchObject({ code: 'not-found' })
    // A missing required argument is refused by the tool runtime itself, before this
    // plugin's own validation runs — both layers are real, and the runtime's comes first.
    await expect(call(mounted, BLOCK_TOOL_NAMES.accept, {}, headed('sess-accept-empty')))
      .rejects.toMatchObject({ code: 'INVALID_ARGS' })
  })
})

describe('grok_close_block: bookkeeping first, the judge second', () => {
  it('vetoes a three-line handoff without spending a model call', async () => {
    const mounted = await mount()
    const live = headed('sess-close-veto')
    const previewed = await preview(mounted, live)
    await approveAfterPreview(live)
    const started = await call(mounted, BLOCK_TOOL_NAMES.open, {
      mode: 'start',
      preview_id: previewed['preview_id'],
      split_hash: previewed['split_hash'],
      approval: { kind: 'user', quote: '确认' },
    }, live)
    const closed = await call(mounted, BLOCK_TOOL_NAMES.close, {
      block_id: started['block_id'],
      handoff: '做了什么：读完了\n证据：blocks.jsonl 有一行\n没做：无',
    }, live)
    expect(closed['outcome']).toBe('veto')
    expect(closed['block_status']).toBe('open')
    expect(JSON.stringify(closed['reasons'])).toContain('交接四行')
    expect(mounted.engine.startCalls, 'a deterministic veto must not ask the model').toHaveLength(0)
    expect(verdictLines()).toHaveLength(1)
  })

  it('passes a complete handoff through the judge and accepts the block', async () => {
    const mounted = await mount()
    const live = headed('sess-close-pass')
    const previewed = await preview(mounted, live)
    await approveAfterPreview(live)
    const started = await call(mounted, BLOCK_TOOL_NAMES.open, {
      mode: 'start',
      preview_id: previewed['preview_id'],
      split_hash: previewed['split_hash'],
      approval: { kind: 'user', quote: '确认' },
    }, live)
    const closed = await call(mounted, BLOCK_TOOL_NAMES.close, {
      block_id: started['block_id'],
      handoff: [
        '做了什么：读完了 blocks.jsonl 并写了结论',
        '证据：读完了 blocks.jsonl，有一行；结论：接单台子可以用了',
        '没做：没有跑真机 soak',
        '下一步：等包工头验收',
      ].join('\n'),
      tasks: [{
        title: '读账本',
        acceptanceCriteria: ['账本里有一行', '结论写出来了'],
        writesPaths: ['src/block/tools.ts'],
      }],
    }, live)
    expect(closed['outcome']).toBe('pass')
    expect(closed['block_status']).toBe('accepted')
    expect(mounted.engine.startCalls).toHaveLength(1)
    expect(mounted.engine.startCalls[0]!.meta.name).toBe('Block supervisor')
    expect(mounted.engine.startCalls[0]!.maxTotalAgents).toBe(1)
    expect(verdictLines()).toHaveLength(1)
    // The block is accepted in a new version; the earlier versions stay readable.
    expect(ledgerLines().length).toBeGreaterThanOrEqual(2)
    // Named explicitly: the row still holds a second, still-open block.
    const status = await call(mounted, BLOCK_TOOL_NAMES.status, { block_id: started['block_id'], block: '读账本' }, live)
    expect(status['status']).toBe('accepted')
    expect((status['verdicts'] as unknown[]).length).toBe(1)
    // The sibling is still there and still open: closing one block never deletes the
    // others from the row it shares with them.
    const sibling = await call(mounted, BLOCK_TOOL_NAMES.status, { block_id: started['block_id'] }, live)
    expect(sibling['title']).toBe('写结论')
    expect(sibling['status']).toBe('open')
    expect(sibling['progress']).toEqual({ total: 2, open: 1, accepted: 1, vetoed: 0 })
  })

  it('returns the same verdict for the same evidence instead of a second line', async () => {
    const mounted = await mount()
    const live = headed('sess-close-again')
    const previewed = await preview(mounted, live)
    await approveAfterPreview(live)
    const started = await call(mounted, BLOCK_TOOL_NAMES.open, {
      mode: 'start',
      preview_id: previewed['preview_id'],
      split_hash: previewed['split_hash'],
      approval: { kind: 'user', quote: '确认' },
    }, live)
    const args = {
      block_id: started['block_id'],
      // Named: the row holds a second block, and "the first open one" moves once this
      // one is accepted.
      block: '读账本',
      handoff: [
        '做了什么：读完了 blocks.jsonl 并写了结论',
        '证据：读完了 blocks.jsonl，有一行；结论：接单台子可以用了',
        '没做：没有跑真机 soak',
        '下一步：等包工头验收',
      ].join('\n'),
      tasks: [{ title: '读账本', acceptanceCriteria: ['账本里有一行', '结论写出来了'], writesPaths: ['src/block/tools.ts'] }],
    }
    const first = await call(mounted, BLOCK_TOOL_NAMES.close, args, live)
    const second = await call(mounted, BLOCK_TOOL_NAMES.close, args, live)
    expect(second['outcome']).toBe(first['outcome'])
    expect(second['evidence_unchanged']).toBe(true)
    expect(verdictLines()).toHaveLength(1)
    // And the second close did not ask the judge again.
    expect(mounted.engine.startCalls).toHaveLength(1)
  })

  it('says so when the judge was skipped', async () => {
    const mounted = await mount()
    const live = headed('sess-close-skip')
    const previewed = await preview(mounted, live)
    await approveAfterPreview(live)
    const started = await call(mounted, BLOCK_TOOL_NAMES.open, {
      mode: 'start',
      preview_id: previewed['preview_id'],
      split_hash: previewed['split_hash'],
      approval: { kind: 'user', quote: '确认' },
    }, live)
    const closed = await call(mounted, BLOCK_TOOL_NAMES.close, {
      block_id: started['block_id'],
      handoff: [
        '做了什么：读完了 blocks.jsonl 并写了结论',
        '证据：读完了 blocks.jsonl，有一行；结论：接单台子可以用了',
        '没做：没有跑真机 soak',
        '下一步：等包工头验收',
      ].join('\n'),
      tasks: [{ title: '读账本', acceptanceCriteria: ['账本里有一行', '结论写出来了'], writesPaths: ['src/block/tools.ts'] }],
      verify: { blockSupervisor: false },
    }, live)
    expect(closed['outcome']).toBe('pass')
    expect(String(closed['not_judged'])).toContain('未过监工')
    expect(mounted.engine.startCalls).toHaveLength(0)
  })

  it('keeps the judge off when the block was ordered that way, with no verify on close', async () => {
    const mounted = await mount()
    const live = headed('sess-close-row-off')
    // The switch is set at order time and rides on the row; close says nothing.
    const previewed = await preview(mounted, live, { verify: { blockSupervisor: false } })
    await approveAfterPreview(live)
    const started = await call(mounted, BLOCK_TOOL_NAMES.open, {
      mode: 'start',
      preview_id: previewed['preview_id'],
      split_hash: previewed['split_hash'],
      approval: { kind: 'user', quote: '确认' },
    }, live)
    expect(ledgerLines()[0]).toContain('"blockSupervisor":false')
    const closed = await call(mounted, BLOCK_TOOL_NAMES.close, {
      block_id: started['block_id'],
      block: '读账本',
      handoff: [
        '做了什么：读完了 blocks.jsonl 并写了结论',
        '证据：读完了 blocks.jsonl，有一行；结论：接单台子可以用了',
        '没做：没有跑真机 soak',
        '下一步：等包工头验收',
      ].join('\n'),
      tasks: [{ title: '读账本', acceptanceCriteria: ['账本里有一行', '结论写出来了'], writesPaths: ['src/block/tools.ts'] }],
    }, live)
    expect(closed['outcome']).toBe('pass')
    expect(closed['judged']).toBe(false)
    expect(String(closed['not_judged'])).toContain('未过监工')
    expect(mounted.engine.startCalls.map(call => call.meta.name)).not.toContain('Block supervisor')
    expect(mounted.engine.startCalls).toHaveLength(0)
  })

  it('judges by default when the row carries no switch at all', async () => {
    const mounted = await mount()
    const live = headed('sess-close-row-default')
    const previewed = await preview(mounted, live)
    await approveAfterPreview(live)
    const started = await call(mounted, BLOCK_TOOL_NAMES.open, {
      mode: 'start',
      preview_id: previewed['preview_id'],
      split_hash: previewed['split_hash'],
      approval: { kind: 'user', quote: '确认' },
    }, live)
    expect(ledgerLines()[0]).not.toContain('"blockSupervisor"')
    const closed = await call(mounted, BLOCK_TOOL_NAMES.close, {
      block_id: started['block_id'],
      block: '读账本',
      handoff: [
        '做了什么：读完了 blocks.jsonl 并写了结论',
        '证据：读完了 blocks.jsonl，有一行；结论：接单台子可以用了',
        '没做：没有跑真机 soak',
        '下一步：等包工头验收',
      ].join('\n'),
      tasks: [{ title: '读账本', acceptanceCriteria: ['账本里有一行', '结论写出来了'], writesPaths: ['src/block/tools.ts'] }],
    }, live)
    expect(closed['outcome']).toBe('pass')
    expect(closed['judged']).toBe(true)
    expect(closed['not_judged']).toBeUndefined()
    expect(mounted.engine.startCalls).toHaveLength(1)
    expect(mounted.engine.startCalls[0]!.meta.name).toBe('Block supervisor')
  })
})

describe('grok_block_status: reads the block back', () => {
  it('lists this session\'s blocks and reads one in full', async () => {
    const mounted = await mount()
    const live = headed('sess-status')
    const previewed = await preview(mounted, live)
    await approveAfterPreview(live)
    const started = await call(mounted, BLOCK_TOOL_NAMES.open, {
      mode: 'start',
      preview_id: previewed['preview_id'],
      split_hash: previewed['split_hash'],
      approval: { kind: 'user', quote: '确认' },
    }, live)
    const list = await call(mounted, BLOCK_TOOL_NAMES.status, {}, live)
    // One line per block, and both lines belong to the one row this split wrote.
    const listed = list['blocks'] as { block_id: string, block: string }[]
    expect(listed.map(entry => entry.block_id)).toEqual([started['block_id'], started['block_id']])
    expect(listed.map(entry => entry.block)).toEqual(['blk-1', 'blk-2'])
    const one = await call(mounted, BLOCK_TOOL_NAMES.status, { block_id: started['block_id'], block: 'blk-1' }, live)
    expect(one['title']).toBe('读账本')
    expect(one['status']).toBe('open')
    expect(one['approval']).toMatchObject({ kind: 'user', quote: '确认' })
    expect(one['vetoes']).toBe(0)
    expect(one['report']).toMatchObject({ run_id: null, checkpoint: null })
    // Another session sees none of it.
    const other = await call(mounted, BLOCK_TOOL_NAMES.status, {}, headed('sess-status-other'))
    expect(other['blocks']).toEqual([])
  })
})

describe('grok_steer and grok_stop: only a workflow block has a channel', () => {
  it('refuses a foreman block and names the way to reach it', async () => {
    const mounted = await mount()
    const live = headed('sess-steer')
    const previewed = await preview(mounted, live)
    await approveAfterPreview(live)
    const started = await call(mounted, BLOCK_TOOL_NAMES.open, {
      mode: 'start',
      preview_id: previewed['preview_id'],
      split_hash: previewed['split_hash'],
      approval: { kind: 'user', quote: '确认' },
    }, live)
    // The block is opened with `execution: 'workflow'`; flip it by opening a foreman one.
    const foreman = previewBlocks({
      sessionId: 'sess-steer',
      objective: '把结论写出来',
      blocks: [{ title: '写结论', objective: '写', deliverable: '一段结论', acceptance: ['写出来了'], execution: 'foreman' }],
    })
    await approveAfterPreview(live)
    const foremanBlock = await call(mounted, BLOCK_TOOL_NAMES.open, {
      mode: 'start',
      preview_id: foreman.previewId,
      split_hash: foreman.splitHash,
      approval: { kind: 'user', quote: '确认' },
    }, live)
    await expect(call(mounted, BLOCK_TOOL_NAMES.steer, { block_id: foremanBlock['block_id'], text: '换个方向' }, live))
      .rejects.toMatchObject({ code: 'invalid', message: expect.stringContaining('send_message') })
    await expect(call(mounted, BLOCK_TOOL_NAMES.stop, { block_id: foremanBlock['block_id'] }, live))
      .rejects.toMatchObject({ code: 'invalid', message: expect.stringContaining('send_message') })
    expect(started['block_id']).not.toBe(foremanBlock['block_id'])
  })

  it('queues a demand for a workflow block that is really running', async () => {
    const mounted = await mount()
    const live = headed('sess-steer-workflow')
    const previewed = await preview(mounted, live)
    await approveAfterPreview(live)
    const started = await call(mounted, BLOCK_TOOL_NAMES.open, {
      mode: 'start',
      preview_id: previewed['preview_id'],
      split_hash: previewed['split_hash'],
      approval: { kind: 'user', quote: '确认' },
    }, live)
    // No live queue yet: the tool must say so instead of queueing into the void.
    await expect(call(mounted, BLOCK_TOOL_NAMES.steer, { block_id: started['block_id'], text: '顺便查一下' }, live))
      .rejects.toMatchObject({ code: 'invalid' })
    const { token } = openSteering('sess-steer-workflow')
    const queued = await call(mounted, BLOCK_TOOL_NAMES.steer, { block_id: started['block_id'], text: '顺便查一下' }, live)
    expect(queued['queued']).toBe(true)
    expect(pullSteering(token).intents.map(intent => intent.text)).toEqual(['顺便查一下'])
  })

  it('stops a workflow block only when its run is still live', async () => {
    const mounted = await mount()
    const live = headed('sess-stop')
    const previewed = await preview(mounted, live)
    await approveAfterPreview(live)
    const started = await call(mounted, BLOCK_TOOL_NAMES.open, {
      mode: 'start',
      preview_id: previewed['preview_id'],
      split_hash: previewed['split_hash'],
      approval: { kind: 'user', quote: '确认' },
    }, live)
    // The block carries no run id yet: nothing to stop, and the answer says so.
    const stopped = await call(mounted, BLOCK_TOOL_NAMES.stop, { block_id: started['block_id'] }, live)
    expect(stopped['stopped']).toBe(false)
    expect(String(stopped['reason'])).toContain('run_id')
  })
})
