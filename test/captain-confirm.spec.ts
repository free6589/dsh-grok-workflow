import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session } from '@deepseek-ai/dsh-session'
import { apply } from '../src/index.js'
import { setMode } from '../src/mode.js'
import { callerTask, execution, task, verification } from './fixtures.js'
import { runWorkflowScript, roleOf } from './helpers.js'

/**
 * Captain foreground (round-071): after the front desk routes a message to the
 * team, the captain states the split and waits for one answer before any work is
 * dispatched. The cases below pin the four answers that matter — approve, amend,
 * not-an-answer, and the two paths that deliberately skip the round.
 *
 * The gate's own memory read is pointed at a scratch directory, so the payload
 * never depends on the developer's `~/.dsh`.
 */

let memoryDir = ''
const previousMemoryDir = process.env.GROK_WORKFLOW_MEMORY_DIR
beforeAll(() => {
  memoryDir = mkdtempSync(join(tmpdir(), 'captain-confirm-'))
  process.env.GROK_WORKFLOW_MEMORY_DIR = memoryDir
})
afterAll(() => {
  if (previousMemoryDir === undefined) delete process.env.GROK_WORKFLOW_MEMORY_DIR
  else process.env.GROK_WORKFLOW_MEMORY_DIR = previousMemoryDir
  rmSync(memoryDir, { recursive: true, force: true })
})

interface EngineResult { value: unknown, stopReason: string, agentsStarted: number }

class FakeRun {
  readonly id = 'run-captain'
  readonly meta: WorkflowStartRequest['meta']
  readonly dispose = vi.fn(async () => {})
  readonly result: Promise<EngineResult>
  private resolve!: (value: EngineResult) => void
  readonly cancel = vi.fn((_reason?: string) => {
    this.resolve({ value: null, stopReason: 'cancelled', agentsStarted: 0 })
  })

  constructor(request: WorkflowStartRequest) {
    this.meta = request.meta
    this.result = new Promise(resolve => { this.resolve = resolve })
  }

  complete(value: unknown): void {
    this.resolve({ value, stopReason: 'completed', agentsStarted: 1 })
  }
}

/** The front-desk single call answers `reply`; a real run gets a scripted plan. */
class FakeEngine {
  readonly startCalls: WorkflowStartRequest[] = []
  reply = '任务一：读现有代码；任务二：写回归测试。某项没过验收我会停下来说明。'
  singleCallError: string | undefined

  async start(request: WorkflowStartRequest): Promise<FakeRun> {
    this.startCalls.push(request)
    const run = new FakeRun(request)
    if (request.meta.name === 'Front desk') {
      if (this.singleCallError !== undefined) {
        run.complete({ reply: null })
        return run
      }
      run.complete({ reply: this.reply })
      return run
    }
    const args = request.args as Record<string, unknown>
    const result = await runWorkflowScript(request.script, args, async (_prompt, options) => {
      if (roleOf(options.label) === 'worker') return execution('work done')
      if (roleOf(options.label) === 'verifier') return verification(task('a'))
      if (roleOf(options.label) === 'planner') return { tasks: [callerTask('a')] }
      throw new Error(`unexpected label ${options.label}`)
    })
    run.complete(result.report)
    return run
  }
}

type Handler = (payload: unknown, next: () => Promise<unknown>) => Promise<unknown>

class FakeSession {
  readonly id = 'sess-captain'
  readonly header = {}
  ownEvents(): unknown[] { return [] }
  deriveMessages(): unknown[] { return [] }
  append(): number { return 0 }
}

class FakeAgent {
  readonly followups: UserMessage[] = []
  readonly session: FakeSession | Session
  readonly followup = vi.fn((message: UserMessage) => { this.followups.push(message) })
  readonly whenIdle = vi.fn(async () => {})

  constructor(session?: FakeSession | Session) {
    this.session = session ?? new FakeSession()
  }
}

class FakeContext {
  readonly handlers = new Map<string, Handler>()
  readonly engine = new FakeEngine()
  readonly workflowEngine = this.engine
  readonly warnings: string[] = []
  readonly tools = { register: () => () => {} }
  readonly systemPrompt = { section: () => () => {}, getSectionOrder: () => 2600 }
  readonly logger = () => ({ warn: (message: string) => { this.warnings.push(message) } })

  on(event: string, handler: Handler): () => void {
    this.handlers.set(event, handler)
    return () => { this.handlers.delete(event) }
  }

  effect(installer: () => () => Promise<void> | void): () => Promise<void> | void {
    return installer()
  }

  preStep(): Handler {
    const handler = this.handlers.get('agent/pre-step')
    if (handler === undefined) throw new Error('gate did not register agent/pre-step')
    return handler
  }

  /** Runs started for the team (the front-desk preview call is not one). */
  get dispatches(): WorkflowStartRequest[] {
    return this.engine.startCalls.filter(call => call.meta.name !== 'Front desk')
  }
}

function userMessage(text: string): UserMessage {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } as never }) as UserMessage
}

/**
 * Deliver one message and return the text the gate entered, without waiting for a
 * background run: the confirmation round answers in-turn and starts nothing, so a
 * wait-for-team helper would cost five seconds per case.
 */
async function say(ctx: FakeContext, agent: FakeAgent, text: string, overrides: Record<string, unknown> = {}): Promise<string> {
  if (ctx.handlers.size === 0) apply(ctx as never, { grokDefault: 'on', ...overrides })
  const messages = [userMessage(text)]
  const decision = await ctx.preStep()(
    { agent, messages, turn: 1, step: 1, signal: new AbortController().signal },
    async () => ({ kind: 'enter', messages }),
  ) as { kind: string, messages: { source?: { kind?: string }, content: { type: string, text?: string }[] }[] }
  // The gate enters the plugin's own message after the claimed one; read that body
  // and drop the host-facing wrapper markers around it.
  const plugin = (decision.messages ?? []).find(message => message.source?.kind === 'grok-workflow')
  const body = (plugin === undefined ? [] : plugin.content).map(block => block.text ?? '').join('\n')
  const marked = /<<<GROK-WORKFLOW-REPORT>>>\n([\s\S]*?)\n<<<END-GROK-WORKFLOW-REPORT>>>/.exec(body)
  return marked === null ? body : marked[1]!
}

/** Wait until a background team run reaches the engine. */
async function waitForDispatch(ctx: FakeContext, count = 1): Promise<void> {
  await vi.waitFor(() => {
    if (ctx.dispatches.length < count) {
      throw new Error(`background team run not started yet (warnings: ${ctx.warnings.join(' | ')})`)
    }
  }, { timeout: 10_000 })
}

describe('captain foreground: the split is confirmed before any work is dispatched', () => {
  it('states the split and asks once, without starting a run', async () => {
    const ctx = new FakeContext()
    const agent = new FakeAgent()
    const text = await say(ctx, agent, '帮我重构 run.ts 的超时逻辑，并补上回归测试')
    expect(text).toContain('队长先报拆法')
    expect(text).toContain('任务一：读现有代码')
    expect(text).toContain('确认')
    // One front-desk single call for the preview; the workflow itself did not start.
    expect(ctx.engine.startCalls).toHaveLength(1)
    expect(ctx.engine.startCalls[0]!.meta.name).toBe('Front desk')
    expect(ctx.dispatches).toHaveLength(0)
  })

  it('dispatches the original request when the user approves', async () => {
    const ctx = new FakeContext()
    const agent = new FakeAgent()
    await say(ctx, agent, '帮我重构 run.ts 的超时逻辑，并补上回归测试')
    const text = await say(ctx, agent, '确认')
    await waitForDispatch(ctx)
    expect(ctx.dispatches).toHaveLength(1)
    const objective = String((ctx.dispatches[0]!.args as { objective: string }).objective)
    expect(objective).toContain('帮我重构 run.ts 的超时逻辑')
    expect(text).toContain('队长确认')
  })

  it('carries an explicit change into the dispatched request', async () => {
    const ctx = new FakeContext()
    const agent = new FakeAgent()
    await say(ctx, agent, '帮我重构 run.ts 的超时逻辑，并补上回归测试')
    await say(ctx, agent, '改成先写回归测试')
    await waitForDispatch(ctx)
    expect(ctx.dispatches).toHaveLength(1)
    const objective = String((ctx.dispatches[0]!.args as { objective: string }).objective)
    expect(objective).toContain('帮我重构 run.ts 的超时逻辑')
    expect(objective).toContain('USER AMENDMENT')
    expect(objective).toContain('改成先写回归测试')
  })

  it('voids an unanswered confirmation and routes the new message on its own', async () => {
    const ctx = new FakeContext()
    const agent = new FakeAgent()
    await say(ctx, agent, '帮我重构 run.ts 的超时逻辑，并补上回归测试')
    const text = await say(ctx, agent, '你好')
    expect(text).toContain('上一个拆法确认没有回答')
    expect(ctx.dispatches).toHaveLength(0)
    // The consumed confirmation cannot be answered later: this "确认" is a new
    // message, not an approval of a question that was already voided.
    await say(ctx, agent, '确认')
    expect(ctx.dispatches).toHaveLength(0)
  })

  it('does not ask when the session forced the full shape', async () => {
    const ctx = new FakeContext()
    const agent = new FakeAgent()
    await say(ctx, agent, '帮我重构 run.ts 的超时逻辑，并补上回归测试', { mode: 'full' })
    await waitForDispatch(ctx)
    expect(ctx.dispatches).toHaveLength(1)
    expect(ctx.engine.startCalls.every(call => call.meta.name !== 'Front desk')).toBe(true)
  })

  it('does not ask twice when the front desk question was just answered', async () => {
    const ctx = new FakeContext()
    const agent = new FakeAgent()
    // "把这个弄一下" is ambiguous: the front desk asks quick-or-team first.
    const asked = await say(ctx, agent, '把这个弄一下')
    expect(asked).toContain('这个要动用团队吗')
    const text = await say(ctx, agent, '团队')
    await waitForDispatch(ctx)
    expect(ctx.dispatches).toHaveLength(1)
    expect(text).not.toContain('队长先报拆法')
  })

  it('voids an expired confirmation instead of dispatching the plan it names', async () => {
    const ctx = new FakeContext()
    const agent = new FakeAgent()
    await say(ctx, agent, '帮我重构 run.ts 的超时逻辑，并补上回归测试')
    // Eleven minutes later the question is stale: the approval must not dispatch it.
    // The interactive path used to read the entry without the TTL, so this exact
    // message started the plan it was told had expired.
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11 * 60_000)
    let text = ''
    try {
      text = await say(ctx, agent, '确认')
    } finally {
      clock.mockRestore()
    }
    expect(text).toContain('已过期')
    expect(ctx.dispatches).toHaveLength(0)
  })

  it('never hands the full shape the confirmation word as its objective', async () => {
    const ctx = new FakeContext()
    // A real session, so the `/grok on` record the full shape reads can be written.
    const session = Session.create('sess-captain-full' as never)
    const agent = new FakeAgent(session)
    await say(ctx, agent, '帮我重构 run.ts 的超时逻辑，并补上回归测试')
    // The user switched the whole workflow on after the captain asked, so the answer
    // arrives on the shape with no front desk. It must dispatch what it confirms.
    expect(setMode(session, {
      v: 1, enabled: true, turn: 1, setBy: 'command:/grok', workflowMode: 'full',
    }).ok).toBe(true)
    const text = await say(ctx, agent, '确认')
    await waitForDispatch(ctx)
    expect(ctx.dispatches).toHaveLength(1)
    const objective = String((ctx.dispatches[0]!.args as { objective: string }).objective)
    expect(objective).toContain('帮我重构 run.ts 的超时逻辑')
    expect(objective.trim()).not.toBe('确认')
    expect(text).toContain('队长确认')
  })

  it('states an expired confirmation on the full shape instead of running it', async () => {
    const ctx = new FakeContext()
    const session = Session.create('sess-captain-full-expired' as never)
    const agent = new FakeAgent(session)
    await say(ctx, agent, '帮我重构 run.ts 的超时逻辑，并补上回归测试')
    expect(setMode(session, {
      v: 1, enabled: true, turn: 1, setBy: 'command:/grok', workflowMode: 'full',
    }).ok).toBe(true)
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11 * 60_000)
    let text = ''
    try {
      text = await say(ctx, agent, '确认')
    } finally {
      clock.mockRestore()
    }
    // The void note is the whole answer: no run and no "确认" objective.
    expect(text).toContain('已过期')
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(ctx.dispatches).toHaveLength(0)
  })
})
