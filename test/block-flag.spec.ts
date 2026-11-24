/**
 * `blockIntake: false` is the tree before the feature existed.
 *
 * The claim this file pins is narrow and testable: with the switch off, a load
 * registers **nothing** from the block intake and every `agent/pre-step` decision
 * is the one a load that never heard of the key produces. The second half is the
 * reason the switch is worth having — an operator who does not want a block ledger
 * must not pay for it with a different front desk.
 *
 * Boundary: the `Context`, `SystemPrompt`, `ToolRuntime` and `Session` are the real
 * host classes, `apply()` is the real entry point, and the workflow engine is a fake
 * that records every `start` and settles a team run with a scripted report — no model
 * is called. Every decision below is compared twice: once against a load that omits
 * the key (the pre-feature shape) and once against the pinned shape the case names.
 *
 * The batch is built once per case and handed to both loads, so both sides hold the
 * same message objects. The `id` on a message is minted by the host (and by
 * `createUserMessage` in this file), never by the block intake, so it cannot be part
 * of "the flag changed a decision": `stable()` folds every `id` to `<id>`. Where the
 * gate mints nothing, both sides already carry the same ids and the raw bytes are
 * compared directly; where it does mint a message (the refusal appends a notice) that
 * id is fresh per load, and the folded bytes are compared instead. `stable()` is not
 * equal to `raw()` in either branch — the payload's own messages carry ids — and
 * folding one removes no decision, because an id is identity, not content.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import type { WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { createSystemMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session } from '@deepseek-ai/dsh-session'
import { apply } from '../src/index.js'
import { BLOCK_LEDGER_VERSION, appendBlockRow } from '../src/block/index.js'
import { HEARTBEATS_FILE, readHeartbeatObservations } from '../src/block/brakes.js'
import { CONFIG_KEYS } from '../src/config.js'
import { TASK_LIMITS } from '../src/input.js'
import { LOOP_PROMPT_PREFIX } from '../src/loop.js'
import { setMode } from '../src/mode.js'
import { execution, task, verification } from './fixtures.js'
import { roleOf, runWorkflowScript } from './helpers.js'

/**
 * Every tool name the block intake registers when it is on.
 *
 * Six names, five tools: `grok_steer` and `grok_stop` are the two halves of one
 * steering surface and are registered together, which is why the switch is described
 * as "the five tools".
 */
const BLOCK_TOOL_NAMES = [
  'grok_open_block',
  'grok_accept_block',
  'grok_close_block',
  'grok_block_status',
  'grok_steer',
  'grok_stop',
] as const

/** Run name of one front-desk call (`src/run.ts`: `TRIAGE_RUN_LABEL`). */
const FRONT_DESK_RUN = 'Front desk'

/** The objective a normal case carries. */
const OBJECTIVE = '把接单台子的账本读出来，然后写一句结论'

/* ------------------------------------------------------------------ engine -- */

interface EngineResult { value: unknown; stopReason: string; agentsStarted: number }

class FakeRun {
  readonly id = 'run-block-flag'
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
    this.settle({ value, stopReason: 'completed', agentsStarted: 2 })
  }
}

/**
 * Engine that settles every run with a scripted report.
 *
 * A case that has to reach `already-routed` needs one *completed* run first: the
 * gate records the delivery when the run it started ends, so a second dispatch of the
 * same batch is what the pass reason is about. Nothing here calls a model.
 */
class FakeEngine {
  readonly startCalls: WorkflowStartRequest[] = []
  readonly runs: FakeRun[] = []

  async start(request: WorkflowStartRequest): Promise<FakeRun> {
    this.startCalls.push(request)
    const run = new FakeRun(request)
    this.runs.push(run)
    request.signal?.addEventListener('abort', () => run.cancel(), { once: true })
    if (request.meta.name === FRONT_DESK_RUN) {
      // A front-desk call is one child; the block intake never changes this path, but
      // the escape hatch can still ask for it, so it is answered rather than hung.
      const single = await runWorkflowScript(
        request.script,
        request.args as Record<string, unknown>,
        async (_prompt, options) => {
          if (options.label === 'captain-preview') return '任务 1 · 读账本'
          if (options.label === 'quick-worker') return '读完了。'
          if (options.label === 'first-answer') return '先去读账本。'
          throw new Error(`unexpected label ${options.label}`)
        },
      )
      run.complete(single.report)
      return run
    }
    const plan = [(request.args as { tasks?: unknown }).tasks].flat().filter(Boolean)
    const tasks = plan.length > 0 ? plan as ReturnType<typeof task>[] : [task('a')]
    const scripted = await runWorkflowScript(
      request.script,
      request.args as Record<string, unknown>,
      async (_prompt, options) => {
        if (roleOf(options.label) === 'planner') return { tasks }
        if (roleOf(options.label) === 'worker') return execution('读完了账本')
        if (roleOf(options.label) === 'verifier') return verification(tasks[0]!)
        throw new Error(`unexpected label ${options.label}`)
      },
    )
    run.complete(scripted.report)
    return run
  }
}

/* ------------------------------------------------------------------ agent -- */

/** The slice of an agent the gate reads; `session` is the real host class. */
class FakeAgent {
  readonly followups: UserMessage[] = []
  readonly followup = vi.fn((message: UserMessage) => { this.followups.push(message) })
  readonly whenIdle = vi.fn(async () => {})

  constructor(readonly session: Session) {}
}

/* --------------------------------------------------------------- harness -- */

const mountedContexts: Context[] = []

/**
 * Point the loop's operator-stop marker at a path that does not exist.
 *
 * A heartbeat's routing is decided by the loop brakes, and this checkout may carry a
 * real `.rsi/STOP`. The case under test is "does the flag change the heartbeat's
 * decision", not "is this developer's marker present", so the marker is moved out of
 * the way for the duration of the file and put back afterwards.
 */
const previousStopFile = process.env['GROK_WORKFLOW_STOP_FILE']
process.env['GROK_WORKFLOW_STOP_FILE'] = `${process.cwd()}/.tmp/block-flag/STOP-does-not-exist`

afterEach(async () => {
  for (const ctx of mountedContexts.splice(0)) {
    try { await ctx.fiber.dispose() } catch { /* already disposed */ }
  }
})

afterAll(() => {
  if (previousStopFile === undefined) delete process.env['GROK_WORKFLOW_STOP_FILE']
  else process.env['GROK_WORKFLOW_STOP_FILE'] = previousStopFile
})

interface Mounted { ctx: Context; engine: FakeEngine }

/**
 * Mount the plugin on a real context.
 *
 * @param flag - `absent` omits the key entirely (the pre-feature load shape);
 *   `false`/`true` pass it explicitly.
 * @param overrides - configuration overrides for the case.
 */
async function mount(
  flag: 'absent' | 'false' | 'true',
  overrides: Record<string, unknown> = {},
): Promise<Mounted> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  const engine = new FakeEngine()
  await ctx.plugin({
    name: 'stub-workflow-engine',
    apply(inner: Context) { inner.provide('workflowEngine', engine) },
  } as never, {} as never)
  apply(ctx as never, {
    mode: 'full',
    grokDefault: 'on',
    ...flag === 'absent' ? {} : { blockIntake: flag === 'true' },
    ...overrides,
  })
  mountedContexts.push(ctx)
  return { ctx, engine }
}

/** The session a top-level conversation has: a head, so it is reopenable. */
function headed(id: string): Session {
  const live = Session.create(id as never)
  live.append('step/start', { turn: 1, step: 1 })
  live.append('system/message', { turn: 1, step: 1, message: createSystemMessage('test head') }, { surfaceOp: 'append' })
  live.append('step/end', { turn: 1, step: 1 })
  return live
}

function userMessage(text: string): UserMessage {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } as never }) as UserMessage
}

function scheduleMessage(text: string): UserMessage {
  return createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'schedule' } as never,
  }) as UserMessage
}

function systemMessage(text: string): UserMessage {
  return createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'plugin' } as never,
  }) as UserMessage
}

interface Decision { kind: string; messages?: UserMessage[]; reason?: string }

/** Drive one payload through the real waterfall with a base callback. */
async function dispatch(
  mounted: Mounted,
  agent: FakeAgent,
  messages: UserMessage[],
  turn = 1,
): Promise<Decision> {
  return await mounted.ctx.waterfall(
    'agent/pre-step',
    { agent, messages, turn, step: 1, signal: new AbortController().signal } as never,
    async () => ({ kind: 'enter', messages }),
  ) as Decision
}

/**
 * The decision as bytes, with the host's own message ids normalised.
 *
 * Ids are minted by the host (and by `createUserMessage` in this file), never by the
 * block intake, so they cannot be part of "the flag changed a decision". A case that
 * mints a message is compared with this fold; a case that mints none is compared with
 * `raw()`, because both loads then hold the same message objects and their ids already
 * match. The two functions return different strings either way: the payload's own
 * messages carry ids.
 */
function stable(decision: Decision): string {
  return JSON.stringify(decision, (key, value) => key === 'id' ? '<id>' : value)
}

function raw(decision: Decision): string {
  return JSON.stringify(decision)
}

/* ------------------------------------------------------------------ cases -- */

/**
 * One case: a session and the payload the gate will see.
 *
 * `run` receives a fresh mount so it can also settle a run first (the
 * `already-routed` case), and returns the decision the off path must produce.
 */
interface Case {
  name: string
  overrides?: Record<string, unknown>
  /** True when the gate mints a message, i.e. the bytes carry a fresh host id. */
  mints: boolean
  /**
   * The batch, built **once per case** and handed to both loads.
   *
   * Both mounts must see the same message objects, otherwise the comparison would be
   * about two different ids rather than about two different loads.
   */
  messages: () => UserMessage[]
  run: (mounted: Mounted, messages: UserMessage[]) => Promise<Decision>
}

const CASES: Case[] = [
  {
    name: 'an ordinary user message with grok mode off is still an ordinary turn',
    overrides: { grokDefault: 'off' },
    mints: false,
    messages: () => [userMessage(OBJECTIVE)],
    run: async (mounted, messages) => {
      const agent = new FakeAgent(headed('sess-flag-user'))
      return await dispatch(mounted, agent, messages)
    },
  },
  {
    name: 'a session whose /grok toggle is off keeps its pass-through turn',
    mints: false,
    messages: () => [userMessage(OBJECTIVE)],
    run: async (mounted, messages) => {
      const session = headed('sess-flag-toggle')
      expect(setMode(session, { v: 1, enabled: false, turn: 1, setBy: 'command:/grok' }).ok).toBe(true)
      return await dispatch(mounted, new FakeAgent(session), messages)
    },
  },
  {
    name: 'a delegated child session is never admitted',
    mints: false,
    messages: () => [userMessage(OBJECTIVE)],
    run: async (mounted, messages) => {
      const session = headed('sess-flag-subagent')
      // A child's header carries the delegation depth; the gate reads it and passes.
      Object.assign(session, { header: { origin: 'subagent', delegationDepth: 1 } })
      return await dispatch(mounted, new FakeAgent(session), messages)
    },
  },
  {
    name: 'a Host heartbeat stays a continuation, not a request',
    mints: false,
    messages: () => [scheduleMessage(`${LOOP_PROMPT_PREFIX} round 2 of 10`)],
    run: async (mounted, messages) => {
      const agent = new FakeAgent(headed('sess-flag-heartbeat'))
      return await dispatch(mounted, agent, messages)
    },
  },
  {
    name: 'a batch this session already routed passes instead of running twice',
    mints: false,
    messages: () => [userMessage(OBJECTIVE)],
    run: async (mounted, messages) => {
      const session = headed('sess-flag-routed')
      const agent = new FakeAgent(session)
      const first = await dispatch(mounted, agent, messages)
      expect(first.kind).toBe('enter')
      expect(mounted.engine.startCalls.length, 'the first dispatch must start one run').toBe(1)
      // Same batch object, second dispatch: the gate must not pay for a second run.
      return await dispatch(mounted, agent, messages, 2)
    },
  },
  {
    name: 'an over-long prompt is refused with the measured count',
    mints: true,
    messages: () => [userMessage('长'.repeat(TASK_LIMITS.objectiveChars + 1))],
    run: async (mounted, messages) => {
      const agent = new FakeAgent(headed('sess-flag-long'))
      return await dispatch(mounted, agent, messages)
    },
  },
  {
    name: 'an empty batch is a tool continuation, not a request',
    mints: false,
    messages: () => [],
    run: async (mounted, messages) => {
      const agent = new FakeAgent(headed('sess-flag-empty'))
      return await dispatch(mounted, agent, messages)
    },
  },
  {
    name: 'a plugin-source message is never read as a user request',
    mints: false,
    messages: () => [systemMessage('runtime context')],
    run: async (mounted, messages) => {
      const agent = new FakeAgent(headed('sess-flag-context'))
      return await dispatch(mounted, agent, messages)
    },
  },
]

/* ------------------------------------------------------------------ tests -- */

describe('blockIntake: false is the pre-feature load, byte for byte', () => {
  it('produces the same decision bytes as a load that never heard of the key', async () => {
    for (const testCase of CASES) {
      const messages = testCase.messages()
      const before = await mount('absent', testCase.overrides)
      const after = await mount('false', testCase.overrides)
      const baseline = await testCase.run(before, messages)
      const flagged = await testCase.run(after, messages)
      // Both loads see the *same* message objects, so a case that mints no new message
      // must match on the raw bytes — not merely "equal after stripping ids".
      const bytes = testCase.mints ? stable : raw
      expect(bytes(flagged), `${testCase.name}: the decision changed`).toBe(bytes(baseline))
    }
  })

  it('pins what each of those decisions actually is', async () => {
    const mounted = await mount('false')
    const userOff = await mount('false', { grokDefault: 'off' })
    const decisions: string[] = []
    for (const testCase of CASES) {
      const target = testCase.overrides?.grokDefault === 'off' ? userOff : mounted
      decisions.push(JSON.stringify(await testCase.run(target, testCase.messages())))
    }
    // The eight shapes, in CASES order: five pass-through turns that keep the batch
    // exactly as the loop claimed it, one already-routed pass, one refusal that keeps
    // the claimed message and appends one notice, and one empty-batch pass.
    expect(decisions[0]).toContain('"kind":"enter"')
    expect(decisions[0]).toContain(OBJECTIVE)
    expect(decisions[1]).toContain(OBJECTIVE)
    expect(decisions[2]).toContain(OBJECTIVE)
    expect(decisions[3]).toContain(LOOP_PROMPT_PREFIX)
    expect(decisions[4]).toContain(OBJECTIVE)
    expect(decisions[5]).toContain(`${TASK_LIMITS.objectiveChars}`)
    expect(decisions[6]).toBe('{"kind":"enter","messages":[]}')
    expect(decisions[7]).toContain('runtime context')
  })

  it('registers none of the block tools', async () => {
    const mounted = await mount('false')
    for (const name of BLOCK_TOOL_NAMES) {
      expect(mounted.ctx.tools.get(name), `${name} must not exist when the flag is off`).toBeUndefined()
    }
    // The tools that were there before the feature are still there: "off" means the
    // old surface, not an empty one.
    expect(mounted.ctx.tools.get('grok_workflow')).toBeDefined()
    expect(mounted.ctx.tools.get('grok_replan_intents')).toBeDefined()
  })

  it('accepts the switch as a real boolean and refuses anything else', async () => {
    // The key is part of the accepted surface…
    expect(CONFIG_KEYS).toContain('blockIntake')
    // …and a load that carries a non-boolean fails loudly instead of reading as off.
    expect(() => apply(new Context() as never, { blockIntake: 'yes' } as never))
      .toThrow(/blockIntake must be true or false, got "yes"/)
  })
})

/* ------------------------------------------------------- heartbeat observer -- */

/**
 * The one listener the flag adds, and the two things it must never do.
 *
 * The observer's whole job is "record that the beat reached a session that still owes
 * work". So: with the flag off there is no listener and no file; with it on there is
 * one listener, one line, and the *same* decision bytes. Anything else — a changed
 * decision, a verdict line, a written block row — would be the observer doing work it
 * was not asked to do.
 */
describe('the heartbeat observer records a beat and changes no decision', () => {
  let ledger = ''

  beforeAll(() => {
    mkdirSync(join(process.cwd(), '.tmp'), { recursive: true })
    ledger = mkdtempSync(join(process.cwd(), '.tmp', 'block-flag-heartbeat-'))
    process.env['GROK_WORKFLOW_BLOCK_LEDGER_DIR'] = ledger
  })

  afterAll(() => {
    try { rmSync(ledger, { recursive: true, force: true }) } catch { /* already gone */ }
  })

  beforeEach(() => {
    for (const file of [HEARTBEATS_FILE, 'blocks.jsonl', 'verdicts.jsonl']) {
      try { rmSync(join(ledger, file), { force: true }) } catch { /* nothing to remove */ }
    }
  })

  /** One accepted intake row for a session, written straight to the ledger. */
  async function openBlockFor(sessionId: string): Promise<string> {
    const at = new Date().toISOString()
    const written = await appendBlockRow({
      v: BLOCK_LEDGER_VERSION,
      id: `row-${sessionId}`,
      sessionId,
      objective: '读账本',
      splitHash: 'b'.repeat(64),
      approval: { kind: 'user', quote: '确认', at },
      blocks: [{
        id: 'blk-1',
        title: '读账本',
        objective: '读',
        deliverable: '一段结论',
        acceptance: ['读完了'],
        writesPaths: [],
        dependsOn: [],
        execution: 'workflow',
        status: 'open',
        tasks: [],
      }],
      version: 1,
      createdAt: at,
      updatedAt: at,
      rowHash: '',
    }, { dir: ledger })
    return written.id
  }

  /** How many `agent/pre-step` listeners this context holds (cordis's own list). */
  function listenerCount(ctx: Context): number {
    const events = (ctx as unknown as { events: { _hooks: Record<string, unknown[]> } }).events
    return (events._hooks['agent/pre-step'] ?? []).length
  }

  it('registers no listener at all when the flag is off', async () => {
    const mounted = await mount('false')
    expect(listenerCount(mounted.ctx), 'off must not add a listener to the chain').toBe(1)
    const sessionId = 'sess-brake-off'
    await openBlockFor(sessionId)
    const before = readFileSync(join(ledger, 'blocks.jsonl'), 'utf8')
    const agent = new FakeAgent(headed(sessionId))
    const decision = await dispatch(mounted, agent, [scheduleMessage(`${LOOP_PROMPT_PREFIX} round 3`)])
    expect(decision.kind).toBe('enter')
    // Not one byte written: no observation file, and the block ledger is untouched.
    expect(existsSync(join(ledger, HEARTBEATS_FILE)), 'off must not create the observation file').toBe(false)
    expect(readFileSync(join(ledger, 'blocks.jsonl'), 'utf8')).toBe(before)
    expect(existsSync(join(ledger, 'verdicts.jsonl'))).toBe(false)
  })

  it('adds exactly one listener and one observation when the flag is on, with identical bytes', async () => {
    const sessionId = 'sess-brake-on'
    await openBlockFor(sessionId)
    const messages = [scheduleMessage(`${LOOP_PROMPT_PREFIX} round 3`)]

    const off = await mount('false')
    const offDecision = await dispatch(off, new FakeAgent(headed(sessionId)), messages)
    const on = await mount('true')
    expect(listenerCount(on.ctx), 'on adds one listener, never replaces one').toBe(2)
    const onDecision = await dispatch(on, new FakeAgent(headed(sessionId)), messages)

    // The decision is the same object shape and the same bytes: the observer passes the
    // gate's answer through untouched.
    expect(JSON.stringify(onDecision)).toBe(JSON.stringify(offDecision))
    const observations = readHeartbeatObservations({ dir: ledger })
    expect(observations).toHaveLength(1)
    expect(observations[0]!.sessionId).toBe(sessionId)
    expect(observations[0]!.blockIds).toEqual([`row-${sessionId}`])
    expect(observations[0]!.kind).toBe('heartbeat')
    // And it never touches the verdict ledger: a heartbeat is not a judgement.
    expect(existsSync(join(ledger, 'verdicts.jsonl'))).toBe(false)
  })

  it('writes nothing for a beat in a session that owes no work', async () => {
    const on = await mount('true')
    const agent = new FakeAgent(headed('sess-brake-nothing'))
    await dispatch(on, agent, [scheduleMessage(`${LOOP_PROMPT_PREFIX} round 3`)])
    expect(readHeartbeatObservations({ dir: ledger })).toHaveLength(0)
  })

  it('writes nothing for a user message', async () => {
    const sessionId = 'sess-brake-user'
    await openBlockFor(sessionId)
    const on = await mount('true')
    await dispatch(on, new FakeAgent(headed(sessionId)), [userMessage(OBJECTIVE)])
    expect(readHeartbeatObservations({ dir: ledger })).toHaveLength(0)
  })
})
