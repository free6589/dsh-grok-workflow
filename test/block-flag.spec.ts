/**
 * `blockIntake` defaults to on, and `false` is the opt-out.
 *
 * Three claims, one group each:
 *
 * 1. **Omitting the key and writing `true` are the same load.** Same tools, same
 *    listeners, same decisions. A default that is a third shape would make every
 *    deployment that says nothing a special case.
 * 2. **`false` removes the intake and nothing else.** No block tool, no intake
 *    observer — and the narrow heartbeat listener, which owns the brakes, is still
 *    installed. That is the M3.2 hole this file keeps shut: the intake switch must
 *    never be able to take the brake owner with it.
 * 3. **The switch does not decide a user message.** The same batch, handed to all
 *    three shapes, comes back as the same decision with the same objects. Since M3.3
 *    there is no admission listener left in the chain, so "the intake is not a front
 *    desk" is now a claim about absence rather than about behaviour.
 *
 * Boundary: the `Context`, `SystemPrompt`, `ToolRuntime` and `Session` are the real
 * host classes, `apply()` is the real entry point, and the workflow engine is a stub
 * that throws if a run is ever started — no model is called, and no case may start
 * work. Listener counts read cordis's own hook list, which is the only honest way to
 * say "this load registered nothing extra".
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { createSystemMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session } from '@deepseek-ai/dsh-session'
import { apply } from '../src/index.js'
import { BLOCK_LEDGER_VERSION, appendBlockRow } from '../src/block/index.js'
import { HEARTBEATS_FILE, readHeartbeatObservations } from '../src/block/brakes.js'
import { CONFIG_KEYS } from '../src/config.js'
import { HEARTBEATS_LISTEN_FILE, readHeartbeatListenObservations } from '../src/heartbeat-listen.js'
import { TASK_LIMITS } from '../src/input.js'
import { LOOP_PROMPT_PREFIX } from '../src/loop.js'
import { setMode } from '../src/mode.js'

/**
 * Every tool name the intake owns.
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

/** The two tools every load registers, whatever the intake switch says. */
const ALWAYS_TOOLS = ['grok_workflow', 'grok_replan_intents'] as const

/** The objective a normal case carries; nothing here runs it. */
const OBJECTIVE = '把接单台子的账本读出来，然后写一句结论'

/* ------------------------------------------------------------------ agent -- */

/** The slice of an agent the listeners read; `session` is the real host class. */
class FakeAgent {
  readonly followups: UserMessage[] = []
  readonly followup = (message: UserMessage): void => { this.followups.push(message) }
  readonly whenIdle = async (): Promise<void> => {}

  constructor(readonly session: Session) {}
}

/* --------------------------------------------------------------- harness -- */

const mountedContexts: Context[] = []

/**
 * Engine that refuses to run: no case in this file may start a workflow.
 *
 * `apply()` needs the service to exist, and every decision here is a routing decision,
 * so a `start` would mean the file was measuring something else entirely.
 */
const noRunEngine = {
  async start(): Promise<never> {
    throw new Error('block-flag.spec.ts must not start a workflow run')
  },
}

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

/**
 * One throwaway ledger directory for the whole file.
 *
 * The narrow heartbeat listener is installed on every load and writes a line per beat,
 * so a mount that omitted this override would write into `$DSH_HOME` (`~/.dsh` on a
 * developer machine). The directory is set before the first mount, not only in the
 * observer cases, because the decision cases dispatch a heartbeat too.
 */
const previousLedgerDir = process.env['GROK_WORKFLOW_BLOCK_LEDGER_DIR']
mkdirSync(join(process.cwd(), '.tmp'), { recursive: true })
const ledger = mkdtempSync(join(process.cwd(), '.tmp', 'block-flag-heartbeat-'))
process.env['GROK_WORKFLOW_BLOCK_LEDGER_DIR'] = ledger

afterEach(async () => {
  for (const ctx of mountedContexts.splice(0)) {
    try { await ctx.fiber.dispose() } catch { /* already disposed */ }
  }
})

afterAll(() => {
  if (previousStopFile === undefined) delete process.env['GROK_WORKFLOW_STOP_FILE']
  else process.env['GROK_WORKFLOW_STOP_FILE'] = previousStopFile
  if (previousLedgerDir === undefined) delete process.env['GROK_WORKFLOW_BLOCK_LEDGER_DIR']
  else process.env['GROK_WORKFLOW_BLOCK_LEDGER_DIR'] = previousLedgerDir
  try { rmSync(ledger, { recursive: true, force: true }) } catch { /* already gone */ }
})

interface Mounted { ctx: Context }

/**
 * Mount the plugin on a real context.
 *
 * @param flag - `absent` omits the key entirely (the default load); `false`/`true`
 *   pass it explicitly.
 * @param overrides - configuration overrides for the case.
 */
async function mount(
  flag: 'absent' | 'false' | 'true',
  overrides: Record<string, unknown> = {},
): Promise<Mounted> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin({
    name: 'stub-workflow-engine',
    apply(inner: Context) { inner.provide('workflowEngine', noRunEngine) },
  } as never, {} as never)
  apply(ctx as never, {
    grokDefault: 'on',
    ...flag === 'absent' ? {} : { blockIntake: flag === 'true' },
    ...overrides,
  })
  mountedContexts.push(ctx)
  return { ctx }
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
 * The decision as bytes.
 *
 * Every payload below is built once per case and handed to every shape, so both sides
 * hold the same message objects and the ids match by construction: no folding is
 * needed, and none is done.
 */
function raw(decision: Decision): string {
  return JSON.stringify(decision)
}

/** How many `agent/pre-step` listeners this context holds (cordis's own list). */
function listenerCount(ctx: Context): number {
  const events = (ctx as unknown as { events: { _hooks: Record<string, unknown[]> } }).events
  return (events._hooks['agent/pre-step'] ?? []).length
}

/* ------------------------------------------------------------------ cases -- */

/**
 * One case: a session and the payload the chain will see.
 *
 * These are the payload shapes that used to be the front desk's decision surface —
 * an ordinary turn, a toggle-off session, a child session, a Host heartbeat, an
 * over-long prompt, an empty batch, a plugin-source message. Every one of them is now
 * a pass-through in every shape, which is the point: the switch has no opinion.
 */
interface Case {
  name: string
  overrides?: Record<string, unknown>
  messages: () => UserMessage[]
  run: (mounted: Mounted, messages: UserMessage[]) => Promise<Decision>
}

const CASES: Case[] = [
  {
    name: 'an ordinary user message with grok mode off is still an ordinary turn',
    overrides: { grokDefault: 'off' },
    messages: () => [userMessage(OBJECTIVE)],
    run: async (mounted, messages) => await dispatch(mounted, new FakeAgent(headed('sess-flag-user')), messages),
  },
  {
    name: 'a session whose /grok toggle is off keeps its pass-through turn',
    messages: () => [userMessage(OBJECTIVE)],
    run: async (mounted, messages) => {
      const session = headed('sess-flag-toggle')
      expect(setMode(session, { v: 1, enabled: false, turn: 1, setBy: 'command:/grok' }).ok).toBe(true)
      return await dispatch(mounted, new FakeAgent(session), messages)
    },
  },
  {
    name: 'a delegated child session is still an ordinary turn',
    messages: () => [userMessage(OBJECTIVE)],
    run: async (mounted, messages) => {
      const session = headed('sess-flag-subagent')
      // A child's header carries the delegation depth; nothing in the chain reads it
      // any more, and the turn must survive it unchanged.
      Object.assign(session, { header: { origin: 'subagent', delegationDepth: 1 } })
      return await dispatch(mounted, new FakeAgent(session), messages)
    },
  },
  {
    name: 'a Host heartbeat stays a continuation, not a request',
    messages: () => [scheduleMessage(`${LOOP_PROMPT_PREFIX} round 2 of 10`)],
    run: async (mounted, messages) => await dispatch(mounted, new FakeAgent(headed('sess-flag-heartbeat')), messages),
  },
  {
    name: 'an over-long prompt is handed on unchanged, not refused',
    messages: () => [userMessage('长'.repeat(TASK_LIMITS.objectiveChars + 1))],
    run: async (mounted, messages) => await dispatch(mounted, new FakeAgent(headed('sess-flag-long')), messages),
  },
  {
    name: 'an empty batch is a tool continuation, not a request',
    messages: () => [],
    run: async (mounted, messages) => await dispatch(mounted, new FakeAgent(headed('sess-flag-empty')), messages),
  },
  {
    name: 'a plugin-source message is never read as a user request',
    messages: () => [systemMessage('runtime context')],
    run: async (mounted, messages) => await dispatch(mounted, new FakeAgent(headed('sess-flag-context')), messages),
  },
]

/* ------------------------------------------------------------------ tests -- */

describe('a load that omits blockIntake is the same load as blockIntake: true', () => {
  it('registers the same tools', async () => {
    const absent = await mount('absent')
    const explicit = await mount('true')
    for (const name of [...ALWAYS_TOOLS, ...BLOCK_TOOL_NAMES]) {
      expect(
        explicit.ctx.tools.get(name) === undefined,
        `${name}: the two loads must agree on whether it exists`,
      ).toBe(absent.ctx.tools.get(name) === undefined)
    }
    // …and the shared answer is "present", so the loop above is not comparing two
    // empty surfaces.
    for (const name of [...ALWAYS_TOOLS, ...BLOCK_TOOL_NAMES]) {
      expect(absent.ctx.tools.get(name), `${name} must be registered by default`).toBeDefined()
    }
  })

  it('installs the same listeners', async () => {
    const absent = await mount('absent')
    const explicit = await mount('true')
    // The narrow heartbeat listener plus the intake's own observer: the default load
    // carries both, and the explicit opt-in adds nothing on top.
    expect(listenerCount(absent.ctx)).toBe(2)
    expect(listenerCount(explicit.ctx), 'the key must not change the chain').toBe(listenerCount(absent.ctx))
  })

  it('decides every payload the same way', async () => {
    for (const testCase of CASES) {
      const messages = testCase.messages()
      const before = await mount('absent', testCase.overrides)
      const after = await mount('true', testCase.overrides)
      const baseline = await testCase.run(before, messages)
      const flagged = await testCase.run(after, messages)
      expect(raw(flagged), `${testCase.name}: the decision changed`).toBe(raw(baseline))
    }
  })
})

describe('blockIntake: false removes the intake and nothing else', () => {
  it('registers none of the block tools and keeps the tools that were always there', async () => {
    const mounted = await mount('false')
    for (const name of BLOCK_TOOL_NAMES) {
      expect(mounted.ctx.tools.get(name), `${name} must not exist when the flag is off`).toBeUndefined()
    }
    for (const name of ALWAYS_TOOLS) {
      expect(mounted.ctx.tools.get(name), `${name} is not part of the intake`).toBeDefined()
    }
  })

  it('installs no intake observer but keeps the narrow heartbeat listener', async () => {
    try { rmSync(join(ledger, HEARTBEATS_LISTEN_FILE), { force: true }) } catch { /* nothing to remove */ }
    const off = await mount('false')
    // One listener: the narrow heartbeat listener every load carries. The intake's own
    // observer would be the second, and "off" is the claim that it is absent.
    expect(listenerCount(off.ctx), 'off must not add a listener to the chain').toBe(1)
    expect(listenerCount(off.ctx)).toBe(listenerCount((await mount('absent')).ctx) - 1)

    // And the narrow listener is not merely counted: it still records the beat.
    const sessionId = 'sess-brake-off'
    await dispatch(off, new FakeAgent(headed(sessionId)), [scheduleMessage(`${LOOP_PROMPT_PREFIX} round 3`)])
    const recorded = readHeartbeatListenObservations({ dir: ledger })
    expect(recorded, 'the narrow listener writes its own line either way').toHaveLength(1)
    expect(recorded[0]).toMatchObject({ sessionId, outcome: 'continued' })
  })

  it('accepts the switch as a real boolean and refuses anything else', async () => {
    // The key is part of the accepted surface…
    expect(CONFIG_KEYS).toContain('blockIntake')
    // …and a load that carries a non-boolean fails loudly instead of reading as off.
    expect(() => apply(new Context() as never, { blockIntake: 'yes' } as never))
      .toThrow(/blockIntake must be true or false, got "yes"/)
  })
})

describe('the switch does not decide a user message', () => {
  it('hands the same batch back unchanged in all three shapes', async () => {
    const messages = [userMessage(OBJECTIVE)]
    for (const flag of ['absent', 'true', 'false'] as const) {
      const mounted = await mount(flag)
      const decision = await dispatch(mounted, new FakeAgent(headed(`sess-shape-${flag}`)), messages)
      expect(decision.kind, `${flag}: a user turn is entered`).toBe('enter')
      // The very same array, not an equal copy: nothing in the chain rewrote or
      // re-wrapped the batch.
      expect(decision.messages, `${flag}: the batch must be the one the loop claimed`).toBe(messages)
    }
  })
})

/* ------------------------------------------------------- heartbeat observer -- */

/**
 * The one listener the flag adds, and the two things it must never do.
 *
 * The observer's whole job is "record that the beat reached a session that still owes
 * work". So: with the flag off there is no observer and no file; with it on there is
 * one more listener, one line, and the *same* decision bytes. Anything else — a
 * changed decision, a verdict line, a written block row — would be the observer doing
 * work it was not asked to do.
 */
describe('the heartbeat observer records a beat and changes no decision', () => {
  beforeEach(() => {
    for (const file of [HEARTBEATS_FILE, HEARTBEATS_LISTEN_FILE, 'blocks.jsonl', 'verdicts.jsonl']) {
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

  it('adds no observation when the flag is off', async () => {
    const mounted = await mount('false')
    const sessionId = 'sess-brake-off-file'
    await openBlockFor(sessionId)
    const before = readFileSync(join(ledger, 'blocks.jsonl'), 'utf8')
    const decision = await dispatch(mounted, new FakeAgent(headed(sessionId)), [scheduleMessage(`${LOOP_PROMPT_PREFIX} round 3`)])
    expect(decision.kind).toBe('enter')
    // Not one byte written by the intake: no observation file, and the block ledger is
    // untouched.
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
    // Two listeners, never a replacement: the narrow heartbeat listener that decides
    // the beat, and the intake's observer that records what it did.
    expect(listenerCount(on.ctx), 'on adds one listener, never replaces one').toBe(2)
    const onDecision = await dispatch(on, new FakeAgent(headed(sessionId)), messages)

    // The decision is the same object shape and the same bytes: the observer passes the
    // chain's answer through untouched.
    expect(raw(onDecision)).toBe(raw(offDecision))
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
    await dispatch(on, new FakeAgent(headed('sess-brake-nothing')), [scheduleMessage(`${LOOP_PROMPT_PREFIX} round 3`)])
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
