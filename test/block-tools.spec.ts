/**
 * The six block tools, driven through the real registry.
 *
 * What is real here: `apply()`, the cordis context, `ToolRuntime` (so the tools are
 * fetched from the registry the runtime would serve), the real `Session` (the approval
 * quote is matched against messages the session actually logged), and the ledger on
 * disk under `.tmp/`. What is fake: the workflow engine, which records every `start`
 * and answers a supervisor call from a scripted child — no model is called.
 *
 * The suite is organised the way a caller meets the surface: preview, start (and every
 * way a start is refused), claim, hand in, read back, steer.
 *
 * Admission is live (M3.2): every tool reads the session's own mode record and refuses
 * a session that never turned grok mode on with `mode-off`. So the harness session here
 * opts in the same way `/grok on` does — one `setMode` write, not a weakened predicate —
 * and the last case pins the refusal for a session that has no record.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import type { WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { createSystemMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { SESSION_FORMAT_VERSION, Session } from '@deepseek-ai/dsh-session'
import { apply } from '../src/index.js'
import { previewBlocks, previewById, resetPreviews } from '../src/block/index.js'
import { BLOCK_TOOL_NAMES } from '../src/block/tools.js'
import { setMode } from '../src/mode.js'
import { closeAllSteering, openSteering, pullSteering } from '../src/steering.js'
import { delay } from './helpers.js'

/* ------------------------------------------------------------------ ledger -- */

let ledgerDir = ''
const previousLedgerDir = process.env['GROK_WORKFLOW_BLOCK_LEDGER_DIR']
const previousStopFile = process.env['GROK_WORKFLOW_STOP_FILE']
/**
 * Real session directories this suite made.
 *
 * They are real mkdtemp directories on purpose: the approval-directory cases assert
 * about what the filesystem says, so a mocked directory would prove nothing. They live
 * under `.tmp/` (gitignored) and are removed when the suite ends.
 */
const tempDirs: string[] = []

/** A real directory under `.tmp/`, gone when the suite ends. */
function tempDir(label: string): string {
  const dir = mkdtempSync(join(process.cwd(), '.tmp', `block-tools-${label}-`))
  tempDirs.push(dir)
  return dir
}

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
  for (const dir of tempDirs.splice(0)) {
    try { rmSync(dir, { recursive: true, force: true }) } catch { /* already gone */ }
  }
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
  apply(ctx as never, { blockIntake: true, grokDefault: 'off' } as never)
  mountedContexts.push(ctx)
  return { ctx, engine }
}

/**
 * A session with a head, so it is a real conversation — and with grok mode on.
 *
 * The intake refuses a session that never turned the mode on (`mode-off`), and these
 * cases are about the tools, not about admission: so the harness session writes the
 * same durable record `/grok on` writes. `grokDefault: 'off'` in the mount is the
 * deployment default and is deliberately not an admission — the session's own record is.
 *
 * `dir` is opt-in. With it the session carries a real {@link SessionHeader} whose `cwd`
 * is that directory — the shape a session created in a real project has, and the second
 * source the tool layer reads a session directory from. Without it the header is the
 * synthesised minimal one every other case has always used.
 */
function headed(id: string, dir?: string): Session {
  const live = dir === undefined
    ? Session.create(id as never)
    : Session.create(id as never, undefined, {
        version: SESSION_FORMAT_VERSION,
        id: id as never,
        createdAt: Date.now(),
        cwd: dir,
        isSeeded: false,
      } as never)
  live.append('step/start', { turn: 1, step: 1 })
  live.append('system/message', { turn: 1, step: 1, message: createSystemMessage('test head') }, { surfaceOp: 'append' })
  live.append('step/end', { turn: 1, step: 1 })
  const optedIn = setMode(live, { v: 1, enabled: true, turn: 1, setBy: 'command:/grok', workflowMode: 'full' })
  if (!optedIn.ok) throw new Error(`the harness session could not opt into grok mode: ${optedIn.reason ?? 'unknown'}`)
  return live
}

/** Append one user turn the way the loop does. */
function say(live: Session, text: string): void {
  const message = createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } as never }) as UserMessage
  live.append('user/message', message, { surfaceOp: 'append' })
}

/**
 * Log an `ask_user_question` call the way the tool layer does.
 *
 * The call id is what a card answer names, and its `time` is what proves the
 * question was asked *after* a preview.
 */
function ask(live: Session, callId: string, question = '这一单可以开工吗？'): void {
  live.append('tool/call', {
    turn: 1,
    step: 1,
    callId: callId as never,
    name: 'ask_user_question',
    arguments: JSON.stringify({
      questions: [{ id: 'q1', question, options: [{ label: '确认' }, { label: '再看看' }] }],
    }),
  })
}

/**
 * Log a question-card answer, payload and all.
 *
 * The Host writes the whole batch as one JSON text part — question text
 * included — under `source.kind: 'user-question-reply'`; only `selected` /
 * `custom` are the user's own words.
 */
function cardAnswer(live: Session, callId: string, selected: string[], question = '这一单可以开工吗？'): void {
  const message = createUserMessage({
    content: [{
      type: 'text',
      text: JSON.stringify({
        kind: 'answer_to_pending_question',
        tool: 'ask_user_question',
        callId,
        questions: [{ id: 'q1', question, options: [{ label: '确认' }, { label: '再看看' }] }],
        answers: [{ id: 'q1', selected }],
      }),
    }],
    source: { kind: 'user-question-reply', callId, outcome: 'answered' } as never,
  }) as UserMessage
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

/** Preview a split, take the user's nod, and start it — the whole desk, through the tools. */
async function startSplit(
  mounted: Mounted,
  live: Session,
  extra: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const previewed = await preview(mounted, live, extra)
  await approveAfterPreview(live)
  return await call(mounted, BLOCK_TOOL_NAMES.open, {
    mode: 'start',
    preview_id: previewed['preview_id'],
    split_hash: previewed['split_hash'],
    approval: { kind: 'user', quote: '确认' },
  }, live)
}

/** The row the ledger wrote on `index`, read back from disk rather than trusted from the answer. */
function ledgerRow(index: number): { id?: string, root?: string } {
  const line = ledgerLines()[index]
  if (line === undefined) throw new Error(`the ledger has no line ${index}`)
  return JSON.parse(line) as { id?: string, root?: string }
}

/**
 * A split whose only declared scope is `notes`.
 *
 * The approval-directory cases need one real artifact that exists under exactly one
 * directory, and a scope wide enough to declare it: `notes/a.md` inside the approved
 * `notes`.
 */
const NOTES_BLOCKS = [
  {
    title: '写笔记',
    objective: '把一条笔记写进 notes/a.md',
    deliverable: 'notes/a.md',
    acceptance: ['notes/a.md 写好了'],
    writesPaths: ['notes'],
  },
] as const

/** The handoff for the notes cases: four lines, and an evidence line worth the name. */
const NOTES_HANDOFF = [
  '做了什么：在 notes/a.md 里写下了一条笔记',
  '证据：notes/a.md 写好了，文件就在批准的目录里',
  '没做：没有写第二份，也没有改批准范围外的文件',
  '下一步：等验收',
].join('\n')

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

  it('counts a card answer only for a question asked after the preview, and only for what the user picked', async () => {
    const mounted = await mount()
    const startArgs = (previewed: Record<string, unknown>): Record<string, unknown> => ({
      mode: 'start',
      preview_id: previewed['preview_id'],
      split_hash: previewed['split_hash'],
      approval: { kind: 'user', quote: '确认' },
    })

    // Asked after the preview, answered 确认: the nod opens the block.
    const asked = headed('sess-card-asked')
    const previewed = await preview(mounted, asked)
    await delay(5)
    ask(asked, 'call-after-preview')
    cardAnswer(asked, 'call-after-preview', ['确认'])
    const started = await call(mounted, BLOCK_TOOL_NAMES.open, startArgs(previewed), asked)
    expect(String(started['block_id'])).toMatch(/^[0-9a-f-]{36}$/)
    expect(started['waited_for_run']).toBe(false)
    expect(ledgerLines()).toHaveLength(1)

    // (a) The question was asked before the preview: answering it is not a nod for this split.
    const early = headed('sess-card-early')
    ask(early, 'call-before-preview')
    await delay(5)
    const earlyPreview = await preview(mounted, early)
    await delay(5)
    cardAnswer(early, 'call-before-preview', ['确认'])
    await expect(call(mounted, BLOCK_TOOL_NAMES.open, startArgs(earlyPreview), early))
      .rejects.toMatchObject({ code: 'approval-required' })
    expect(ledgerLines()).toHaveLength(1)

    // (b) A reply whose call id was never asked — even with another question open in the same window.
    const unasked = headed('sess-card-unasked')
    const unaskedPreview = await preview(mounted, unasked)
    await delay(5)
    ask(unasked, 'call-that-was-asked')
    cardAnswer(unasked, 'call-never-asked', ['确认'])
    await expect(call(mounted, BLOCK_TOOL_NAMES.open, startArgs(unaskedPreview), unasked))
      .rejects.toMatchObject({ code: 'approval-required' })
    expect(ledgerLines()).toHaveLength(1)

    // (c) 确认 in the question text only: the model's own words must not be the approval.
    const quoted = headed('sess-card-quoted')
    const quotedPreview = await preview(mounted, quoted)
    await delay(5)
    ask(quoted, 'call-quoted', '用户说了「确认」吗？')
    cardAnswer(quoted, 'call-quoted', ['再看看'], '用户说了「确认」吗？')
    await expect(call(mounted, BLOCK_TOOL_NAMES.open, startArgs(quotedPreview), quoted))
      .rejects.toMatchObject({ code: 'approval-required' })
    expect(ledgerLines()).toHaveLength(1)
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
      // A task split is reported so this case keeps arguing about the thing it is named
      // for: a close without one is refused before the checks run (see the refusal case
      // below), and a refusal would not tell us whether a short handoff vetoes.
      tasks: [{ title: '读账本', acceptanceCriteria: ['账本里有一行', '结论写出来了'] }],
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
        '下一步：等调度验收',
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
        '下一步：等调度验收',
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
        '下一步：等调度验收',
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
        '下一步：等调度验收',
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
        '下一步：等调度验收',
      ].join('\n'),
      tasks: [{ title: '读账本', acceptanceCriteria: ['账本里有一行', '结论写出来了'], writesPaths: ['src/block/tools.ts'] }],
    }, live)
    expect(closed['outcome']).toBe('pass')
    expect(closed['judged']).toBe(true)
    expect(closed['not_judged']).toBeUndefined()
    expect(mounted.engine.startCalls).toHaveLength(1)
    expect(mounted.engine.startCalls[0]!.meta.name).toBe('Block supervisor')
  })

  it('refuses a close with no task split at all, before any check or model call', async () => {
    const mounted = await mount()
    const live = headed('sess-close-notasks')
    const started = await startSplit(mounted, live)
    // The row's block was opened with `tasks: []` and close reports none: there is no
    // split to judge, so nothing may reach the checks or the model.
    await expect(call(mounted, BLOCK_TOOL_NAMES.close, {
      block_id: started['block_id'],
      handoff: [
        '做了什么：读完了 blocks.jsonl 并写了结论',
        '证据：读完了 blocks.jsonl，有一行；结论：接单台子可以用了',
        '没做：没有跑真机 soak',
        '下一步：等调度验收',
      ].join('\n'),
    }, live)).rejects.toMatchObject({ code: 'invalid', message: expect.stringContaining('任务拆法') })
    expect(verdictLines(), 'a refusal is not a verdict').toHaveLength(0)
    expect(mounted.engine.startCalls, 'and it is not a model call either').toHaveLength(0)
  })

  it('keeps a second close working off the split the accepted row already carries', async () => {
    const mounted = await mount()
    const live = headed('sess-close-recorded')
    const started = await startSplit(mounted, live)
    const handoff = [
      '做了什么：读完了 blocks.jsonl 并写了结论',
      '证据：读完了 blocks.jsonl，有一行；结论：接单台子可以用了',
      '没做：没有跑真机 soak',
      '下一步：等调度验收',
    ].join('\n')
    const first = await call(mounted, BLOCK_TOOL_NAMES.close, {
      block_id: started['block_id'],
      block: '读账本',
      handoff,
      tasks: [{ title: '读账本', acceptanceCriteria: ['账本里有一行', '结论写出来了'], writesPaths: ['src/block/tools.ts'] }],
    }, live)
    expect(first['outcome']).toBe('pass')
    // The accepted row carries the split it was judged on, so a later close that reports
    // none falls back to it (`tasksOf`) instead of being refused as an empty hand-in.
    const second = await call(mounted, BLOCK_TOOL_NAMES.close, {
      block_id: started['block_id'],
      block: '读账本',
      handoff,
    }, live)
    expect(second['outcome']).toBe(first['outcome'])
    expect(second['evidence_unchanged']).toBe(true)
    expect(verdictLines(), 'the same evidence never earns a second verdict').toHaveLength(1)
  })
})

describe('the approval directory: preview, then the row, then the close', () => {
  it('records the session directory on the preview, and keeps it out of the split hash', async () => {
    const mounted = await mount()
    const dir = tempDir('root-preview')
    const previewed = await preview(mounted, headed('sess-root-preview', dir))
    expect(previewById(String(previewed['preview_id']))?.root).toBe(realpathSync.native(dir))
    expect(ledgerLines(), 'a preview still writes nothing').toHaveLength(0)

    // The same split approved in another directory is the same split: the tree the work
    // lives in is not part of what the user approved.
    const other = tempDir('root-preview-other')
    const elsewhere = await preview(mounted, headed('sess-root-preview-other', other))
    expect(elsewhere['split_hash']).toBe(previewed['split_hash'])
    expect(previewById(String(elsewhere['preview_id']))?.root).toBe(realpathSync.native(other))

    // A directory that cannot be named is dropped instead of refused: a preview stays
    // total, and recording a guess would state a fact nobody gave.
    const relativeRoot = previewBlocks({
      sessionId: 'sess-root-relative',
      objective: '把接单台子的账本读出来，然后写一句结论',
      blocks: BLOCKS as never,
      root: 'relative/dir',
    })
    expect(previewById(relativeRoot.previewId)?.root).toBeUndefined()
  })

  it('writes that directory onto the row, and omits the key when the session had none', async () => {
    const mounted = await mount()
    const dir = tempDir('root-start')
    const started = await startSplit(mounted, headed('sess-root-start', dir))
    // Read from the ledger, not from the tool's answer: the line on disk is the claim.
    expect(ledgerRow(0).id).toBe(started['block_id'])
    expect(ledgerRow(0).root).toBe(realpathSync.native(dir))

    // A session with no directory records none, and the key is absent rather than empty,
    // so a row written before this field existed stays byte-identical.
    const bare = await startSplit(mounted, headed('sess-root-start-bare'))
    expect(bare['reused']).toBe(false)
    expect(ledgerLines()).toHaveLength(2)
    expect(ledgerLines()[1]).not.toContain('"root"')
  })

  it('closes against the directory the block was approved in, not the closing session\'s', async () => {
    const mounted = await mount()
    mounted.engine.judgeAnswer = {
      criteria: [{ text: 'notes/a.md 写好了', met: true, evidence: ['notes/a.md 就在批准的目录里'] }],
    }
    const dirA = tempDir('root-close-a')
    const dirB = tempDir('root-close-b')
    mkdirSync(join(dirA, 'notes'), { recursive: true })
    writeFileSync(join(dirA, 'notes', 'a.md'), '# 笔记\n')
    expect(existsSync(join(dirB, 'notes', 'a.md')), 'the closing session must not have the artifact').toBe(false)

    const started = await startSplit(mounted, headed('sess-root-close-a', dirA), {
      objective: '写一条笔记',
      blocks: NOTES_BLOCKS,
    })
    expect(ledgerRow(0).root).toBe(realpathSync.native(dirA))

    // Closed from a session standing in a different directory where the artifact does
    // not exist: only the row's own directory can make this path real, so a pass proves
    // the row wins over both the closing session and the plugin process cwd.
    const closed = await call(mounted, BLOCK_TOOL_NAMES.close, {
      block_id: started['block_id'],
      handoff: NOTES_HANDOFF,
      tasks: [{ title: '写笔记', acceptanceCriteria: ['notes/a.md 写好了'], writesPaths: ['notes/a.md'] }],
    }, headed('sess-root-close-b', dirB))
    expect(closed['outcome']).toBe('pass')
    expect(closed['block_status']).toBe('accepted')
    expect(mounted.engine.startCalls.map(call => call.meta.name)).toEqual(['Block supervisor'])
    expect(verdictLines()).toHaveLength(1)
  })

  it('does not fall back to the process cwd when the artifact only exists there', async () => {
    const mounted = await mount()
    const dir = tempDir('root-cwd-row')
    // A real file that exists relative to the process cwd and nowhere under the row's
    // directory. It is made inside gitignored scratch so the tree stays clean; the name
    // is fixed lowercase because a declared write path is normalized to lowercase.
    const underCwd = join(process.cwd(), '.tmp', `block-tools-cwd-${process.pid}-${tempDirs.length}`)
    tempDirs.push(underCwd)
    mkdirSync(join(underCwd, 'notes'), { recursive: true })
    writeFileSync(join(underCwd, 'notes', 'a.md'), '# 笔记\n')
    const declared = join(relative(process.cwd(), underCwd), 'notes', 'a.md')

    const started = await startSplit(mounted, headed('sess-root-cwd-row', dir), {
      objective: '写一条笔记',
      blocks: [{
        title: '写笔记',
        objective: '把一条笔记写进 notes/a.md',
        deliverable: 'notes/a.md',
        acceptance: ['那条笔记写好了'],
        // The approved scope covers the declaration, so the one thing wrong with it is
        // the tree it resolves in.
        writesPaths: [relative(process.cwd(), underCwd)],
      }],
    })
    const closed = await call(mounted, BLOCK_TOOL_NAMES.close, {
      block_id: started['block_id'],
      handoff: NOTES_HANDOFF,
      tasks: [{ title: '写笔记', acceptanceCriteria: ['那条笔记写好了'], writesPaths: [declared] }],
    }, headed('sess-root-cwd-close', tempDir('root-cwd-close')))

    expect(closed['outcome']).toBe('veto')
    expect(JSON.stringify(closed['reasons'])).toContain('不存在')
    expect(mounted.engine.startCalls, 'a missing artifact is a deterministic veto').toHaveLength(0)
    expect(verdictLines()).toHaveLength(1)
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
  it('refuses a dispatcher block and names the way to reach it', async () => {
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

describe('admission: a session that never turned grok mode on cannot use the intake', () => {
  /** A real conversation that never wrote a mode record — the pre-`/grok on` session. */
  function headedWithoutMode(id: string): Session {
    const live = Session.create(id as never)
    live.append('step/start', { turn: 1, step: 1 })
    live.append('system/message', { turn: 1, step: 1, message: createSystemMessage('test head') }, { surfaceOp: 'append' })
    live.append('step/end', { turn: 1, step: 1 })
    return live
  }

  it('refuses with mode-off before it reads the ledger, and the same call passes once the session opts in', async () => {
    const mounted = await mount()
    const stranger = headedWithoutMode('sess-no-mode')
    // `grokDefault: 'off'` is the deployment default; admission reads the session's own
    // record, so neither a default nor a stale tool call can open work in this session.
    await expect(call(mounted, BLOCK_TOOL_NAMES.open, {
      mode: 'preview',
      objective: '把接单台子的账本读出来',
      blocks: BLOCKS,
    }, stranger)).rejects.toMatchObject({ code: 'mode-off', message: expect.stringContaining('mode-off') })
    await expect(call(mounted, BLOCK_TOOL_NAMES.status, {}, stranger))
      .rejects.toMatchObject({ code: 'mode-off' })
    // Refused at the door: nothing landed in the ledger for either call.
    expect(ledgerLines()).toHaveLength(0)

    // The very same call, one `/grok on` record later, gets past admission.
    const optedIn = headed('sess-mode-on')
    const previewed = await preview(mounted, optedIn)
    expect(String(previewed['preview_id'])).toMatch(/^bp-/)
    expect(ledgerLines(), 'a preview still writes nothing').toHaveLength(0)
  })
})
