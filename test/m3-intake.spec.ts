/**
 * M3.1: the intake's own heartbeat listener, and the switch that will enforce it.
 *
 * Two things are pinned here, both of them about *shapes* rather than features:
 *
 * 1. **The admission predicate exists and is inert.** `canAcceptBlock` answers "yes"
 *    for every session in this build; the rule it will enforce once M3.2 flips its
 *    phase switch is pinned separately (`canAcceptBlockWhenEnforced`), so the rule can
 *    be reviewed before it can refuse anything.
 * 2. **The narrow heartbeat listener observes and never decides — until it is the only
 *    listener left.** With the old front desk registered (the default) it computes
 *    nothing, changes no decision byte, and writes one line per beat into its own file.
 *    With `legacyGate: false` the gate is not registered at all, so the same listener
 *    owns the brake review and is the one thing that can stop a beat.
 *
 * Boundary: the `Context`, `SystemPrompt`, `ToolRuntime`, `Session` and `apply()` are
 * the real host classes; the workflow engine is a stub that throws if a run is ever
 * started, because no case here may spend a model call. The listener-count cases read
 * cordis's own `agent/pre-step` list, which is the only honest way to say "off
 * registers nothing".
 *
 * The two files must stay apart: `heartbeats.jsonl` is the block intake's observation
 * (which blocks a beat found open) and `heartbeats-listen.jsonl` is this listener's
 * (what the beat did). One beat may appear in both — once — and in neither twice.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { Session } from '@deepseek-ai/dsh-session'
import { appendPluginRecord } from '@deepseek-ai/dsh-session'
import { createSystemMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { apply } from '../src/index.js'
import { BLOCK_LEDGER_VERSION, appendBlockRow } from '../src/block/index.js'
import { HEARTBEATS_FILE } from '../src/block/brakes.js'
import { HEARTBEATS_LISTEN_FILE, installHeartbeatListen, isHeartbeatMessage, readHeartbeatListenObservations } from '../src/heartbeat-listen.js'
import { resolveConfig } from '../src/config.js'
import { LOOP_PROMPT_PREFIX } from '../src/loop.js'
import { MODE_RECORD, setMode } from '../src/mode.js'
import { BLOCK_ADMISSION_ENFORCED, canAcceptBlock, canAcceptBlockWhenEnforced } from '../src/user-source.js'

/** The objective a user turn carries; nothing here runs it. */
const OBJECTIVE = '把账本读出来，写一句结论'

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
 * Move the loop's operator-stop marker out of the way.
 *
 * A heartbeat's routing is decided by the loop brakes, and this checkout may carry a
 * real `.rsi/STOP`. These cases are about "did the beat reach the right listener",
 * not about whether this developer's marker exists.
 */
const previousStopFile = process.env['GROK_WORKFLOW_STOP_FILE']
process.env['GROK_WORKFLOW_STOP_FILE'] = `${process.cwd()}/.tmp/m3-intake/STOP-does-not-exist`

afterEach(async () => {
  for (const ctx of mountedContexts.splice(0)) {
    try { await ctx.fiber.dispose() } catch { /* already disposed */ }
  }
})

afterAll(() => {
  if (previousStopFile === undefined) delete process.env['GROK_WORKFLOW_STOP_FILE']
  else process.env['GROK_WORKFLOW_STOP_FILE'] = previousStopFile
})

/** Engine that refuses to run: no case in this file may start a workflow. */
const noRunEngine = {
  async start(): Promise<never> {
    throw new Error('m3-intake.spec.ts must not start a workflow run')
  },
}

/**
 * Mount the plugin on a real context.
 * @param overrides - configuration overrides for the case.
 */
async function mount(overrides: Record<string, unknown> = {}): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin({
    name: 'stub-workflow-engine',
    apply(inner: Context) { inner.provide('workflowEngine', noRunEngine) },
  } as never, {} as never)
  apply(ctx as never, { mode: 'full', grokDefault: 'on', ...overrides } as never)
  mountedContexts.push(ctx)
  return ctx
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
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'schedule' } as never }) as UserMessage
}

interface Decision { kind: string; messages?: UserMessage[]; reason?: string }

/** Drive one payload through the real waterfall with a base callback. */
async function dispatch(ctx: Context, agent: FakeAgent, messages: UserMessage[], turn = 1): Promise<Decision> {
  return await ctx.waterfall(
    'agent/pre-step',
    { agent, messages, turn, step: 1, signal: new AbortController().signal } as never,
    async () => ({ kind: 'enter', messages }),
  ) as Decision
}

/** How many `agent/pre-step` listeners this context holds (cordis's own list). */
function listenerCount(ctx: Context): number {
  const events = (ctx as unknown as { events: { _hooks: Record<string, unknown[]> } }).events
  return (events._hooks['agent/pre-step'] ?? []).length
}

/* -------------------------------------------------------------- predicate -- */

describe('canAcceptBlock is written, and deliberately not enforced yet', () => {
  it('answers yes for every session while the phase switch is off', () => {
    expect(BLOCK_ADMISSION_ENFORCED, 'M3.1 must not change a single answer').toBe(false)
    expect(canAcceptBlock(undefined)).toBe(true)
    expect(canAcceptBlock(headed('sess-admit-none'))).toBe(true)
    const disabled = headed('sess-admit-disabled')
    expect(setMode(disabled, { v: 1, enabled: false, turn: 1, setBy: 'command:/grok' }).ok).toBe(true)
    // Even a session that explicitly turned the mode off still gets a yes: the rule
    // is written, the enforcement is M3.2's flip.
    expect(canAcceptBlock(disabled)).toBe(true)
  })

  it('pins the rule the switch will enforce', () => {
    // No session, and a session that never wrote a record: no admission.
    expect(canAcceptBlockWhenEnforced(undefined)).toBe(false)
    expect(canAcceptBlockWhenEnforced(headed('sess-rule-unset'))).toBe(false)
    // A written "off" is not an admission either.
    const disabled = headed('sess-rule-disabled')
    expect(setMode(disabled, { v: 1, enabled: false, turn: 1, setBy: 'command:/grok' }).ok).toBe(true)
    expect(canAcceptBlockWhenEnforced(disabled)).toBe(false)
    // Both workflow shapes are admissions: the mode is on, and the shape only says
    // how the work is routed, not whether the intake may take it.
    const full = headed('sess-rule-full')
    expect(setMode(full, { v: 1, enabled: true, turn: 1, setBy: 'command:/grok', workflowMode: 'full' }).ok).toBe(true)
    expect(canAcceptBlockWhenEnforced(full)).toBe(true)
    const triage = headed('sess-rule-triage')
    expect(setMode(triage, { v: 1, enabled: true, turn: 1, setBy: 'command:/grok', workflowMode: 'triage' }).ok).toBe(true)
    expect(canAcceptBlockWhenEnforced(triage)).toBe(true)
    // An explicit `off` shape is written by hand: `setMode` refuses a record this
    // build cannot read back, so only a future build can produce one. Today the
    // reader drops it; the guard in the predicate is what keeps the answer false
    // once the union grows.
    const explicitOff = headed('sess-rule-explicit-off')
    appendPluginRecord(explicitOff, MODE_RECORD, { v: 1, enabled: true, turn: 1, setBy: 'test', workflowMode: 'off' } as never)
    expect(canAcceptBlockWhenEnforced(explicitOff)).toBe(false)
  })
})

/* ---------------------------------------------------------------- intake -- */

describe('the narrow heartbeat listener observes without deciding', () => {
  let ledger = ''

  beforeAll(() => {
    mkdirSync(join(process.cwd(), '.tmp'), { recursive: true })
    ledger = mkdtempSync(join(process.cwd(), '.tmp', 'm3-intake-'))
    process.env['GROK_WORKFLOW_BLOCK_LEDGER_DIR'] = ledger
  })

  afterAll(() => {
    try { rmSync(ledger, { recursive: true, force: true }) } catch { /* already gone */ }
  })

  beforeEach(() => {
    for (const file of [HEARTBEATS_FILE, HEARTBEATS_LISTEN_FILE, 'blocks.jsonl', 'verdicts.jsonl']) {
      try { rmSync(join(ledger, file), { force: true }) } catch { /* nothing to remove */ }
    }
  })

  /** One accepted intake row for a session, written straight to the ledger. */
  async function openBlockFor(sessionId: string): Promise<void> {
    const at = new Date().toISOString()
    await appendBlockRow({
      v: BLOCK_LEDGER_VERSION,
      id: `row-${sessionId}`,
      sessionId,
      objective: '读账本',
      splitHash: 'c'.repeat(64),
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
  }

  it('registers nothing new when the intake is off', async () => {
    const ctx = await mount({ blockIntake: false })
    expect(listenerCount(ctx), 'off is the pre-intake chain: the gate alone').toBe(1)
    const sessionId = 'sess-m3-off'
    await openBlockFor(sessionId)
    const decision = await dispatch(ctx, new FakeAgent(headed(sessionId)), [scheduleMessage(`${LOOP_PROMPT_PREFIX} round 2`)])
    expect(decision.kind).toBe('enter')
    expect(existsSync(join(ledger, HEARTBEATS_LISTEN_FILE)), 'off must not create the listen file').toBe(false)
  })

  it('observes one beat into its own file while the old gate keeps deciding', async () => {
    const sessionId = 'sess-m3-on'
    await openBlockFor(sessionId)
    const messages = [scheduleMessage(`${LOOP_PROMPT_PREFIX} round 2`)]

    const off = await mount({ blockIntake: false })
    const offDecision = await dispatch(off, new FakeAgent(headed(sessionId)), messages)
    const on = await mount({ blockIntake: true })
    expect(listenerCount(on), 'gate + intake observer + narrow listener').toBe(3)
    const onDecision = await dispatch(on, new FakeAgent(headed(sessionId)), messages)

    // Same objects in, same decision out: the listener observes, it does not decide.
    expect(JSON.stringify(onDecision)).toBe(JSON.stringify(offDecision))
    const observed = readHeartbeatListenObservations({ dir: ledger })
    expect(observed).toHaveLength(1)
    expect(observed[0]!.sessionId).toBe(sessionId)
    expect(observed[0]!.outcome).toBe('observed')
    // Both files hold the same single beat, once each: the intake's own observation
    // (which blocks were open) and this listener's (what the beat did).
    expect(readFileSync(join(ledger, HEARTBEATS_FILE), 'utf8').trim().split('\n')).toHaveLength(1)
  })

  it('writes nothing for a beat in a session that owes no work', async () => {
    const ctx = await mount({ blockIntake: true })
    await dispatch(ctx, new FakeAgent(headed('sess-m3-nothing')), [scheduleMessage(`${LOOP_PROMPT_PREFIX} round 2`)])
    expect(readHeartbeatListenObservations({ dir: ledger })).toHaveLength(0)
    expect(existsSync(join(ledger, HEARTBEATS_FILE))).toBe(false)
  })

  it('writes nothing for a user message', async () => {
    const sessionId = 'sess-m3-user'
    await openBlockFor(sessionId)
    const ctx = await mount({ blockIntake: true })
    await dispatch(ctx, new FakeAgent(headed(sessionId)), [userMessage(OBJECTIVE)])
    expect(readHeartbeatListenObservations({ dir: ledger })).toHaveLength(0)
  })

  it('survives a batch it cannot read, in both shapes, and writes nothing', async () => {
    const sessionId = 'sess-m3-malformed'
    await openBlockFor(sessionId)
    // A batch with an element that is not even an object. The listener now runs on every
    // pre-step, so reading it must answer "not a heartbeat" instead of throwing: a
    // listener that can take a turn down is worse than one that misses a beat.
    const messages = [null as never]
    // The predicate itself is total: the gate calls it on every message of every batch,
    // so it may not throw on any input.
    expect(isHeartbeatMessage(null)).toBe(false)
    expect(isHeartbeatMessage(undefined)).toBe(false)
    expect(isHeartbeatMessage({})).toBe(false)

    // The shape where the listener is the only listener on the chain.
    const owning = await mount({ blockIntake: true, legacyGate: false })
    const decision = await dispatch(owning, new FakeAgent(headed(sessionId)), messages)
    expect(decision.kind).toBe('enter')
    expect(decision.messages).toBe(messages)
    expect(readHeartbeatListenObservations({ dir: ledger })).toHaveLength(0)

    // And the observing shape, where the old gate still decides: the listener is not the
    // one that breaks the batch.
    const observing = new Context()
    mountedContexts.push(observing)
    installHeartbeatListen({
      ctx: observing,
      logger: { warn: () => {} },
      enabled: true,
      ownsRouting: false,
      config: resolveConfig({}),
      options: { dir: ledger },
    })
    const passed = await dispatch(observing, new FakeAgent(headed(sessionId)), messages)
    expect(passed.kind).toBe('enter')
    expect(passed.messages).toBe(messages)
    expect(readHeartbeatListenObservations({ dir: ledger })).toHaveLength(0)
    expect(existsSync(join(ledger, HEARTBEATS_FILE))).toBe(false)
  })
})

/* ------------------------------------------------------------ the switch -- */

describe('legacyGate: false leaves the narrow listener alone on the chain', () => {
  let ledger = ''

  beforeAll(() => {
    mkdirSync(join(process.cwd(), '.tmp'), { recursive: true })
    ledger = mkdtempSync(join(process.cwd(), '.tmp', 'm3-legacy-off-'))
    process.env['GROK_WORKFLOW_BLOCK_LEDGER_DIR'] = ledger
  })

  afterAll(() => {
    try { rmSync(ledger, { recursive: true, force: true }) } catch { /* already gone */ }
  })

  beforeEach(() => {
    for (const file of [HEARTBEATS_FILE, HEARTBEATS_LISTEN_FILE, 'blocks.jsonl', 'verdicts.jsonl']) {
      try { rmSync(join(ledger, file), { force: true }) } catch { /* nothing to remove */ }
    }
  })

  it('registers the narrow listener only, and lets a user message through untouched', async () => {
    const ctx = await mount({ blockIntake: true, legacyGate: false })
    expect(listenerCount(ctx), 'the old front desk must not be registered').toBe(1)
    const messages = [userMessage(OBJECTIVE)]
    const decision = await dispatch(ctx, new FakeAgent(headed('sess-m3-gate-off')), messages)
    // No gate means no admission decision: the batch reaches the model as it is. That
    // is the shape the switch exists for, not a regression.
    expect(decision.kind).toBe('enter')
    expect(decision.messages).toBe(messages)
  })

  it('reviews the brakes itself, and a stopped beat is refused with no turn', async () => {
    const ctx = new Context()
    mountedContexts.push(ctx)
    const stops: { sessionId: string, code: string, detail: string }[] = []
    const loop = {
      review: () => ({ kind: 'stop' as const, code: 'loop/daily-cap' as const, detail: '今天已经跑满' }),
      admit: () => {},
      stop: async (input: { sessionId: string, code: string, detail: string }) => { stops.push(input) },
    }
    installHeartbeatListen({
      ctx,
      logger: { warn: () => {} },
      enabled: true,
      ownsRouting: true,
      loop,
      config: resolveConfig({}),
    })
    let nextCalls = 0
    const decision = await ctx.waterfall(
      'agent/pre-step',
      { agent: new FakeAgent(headed('sess-m3-stop')), messages: [scheduleMessage(`${LOOP_PROMPT_PREFIX} round 4`)], turn: 1, step: 1, signal: new AbortController().signal } as never,
      async () => { nextCalls += 1; return { kind: 'enter', messages: [] } },
    ) as Decision
    expect(decision.kind).toBe('reject')
    expect(nextCalls, 'a stopped beat must not open a turn').toBe(0)
    expect(stops).toEqual([{ sessionId: 'sess-m3-stop', code: 'loop/daily-cap', detail: '今天已经跑满' }])
    const observed = readHeartbeatListenObservations({ dir: ledger })
    expect(observed).toHaveLength(1)
    expect(observed[0]!.outcome).toBe('stopped')
    expect(observed[0]!.code).toBe('loop/daily-cap')
  })

  it('continues a beat the brakes allow, and records that it did', async () => {
    const ctx = new Context()
    mountedContexts.push(ctx)
    const admitted: string[] = []
    const loop = {
      review: () => ({ kind: 'continue' as const }),
      admit: (input: { sessionId: string }) => { admitted.push(input.sessionId) },
      stop: async () => {},
    }
    installHeartbeatListen({
      ctx,
      logger: { warn: () => {} },
      enabled: true,
      ownsRouting: true,
      loop,
      config: resolveConfig({}),
    })
    let nextCalls = 0
    const decision = await ctx.waterfall(
      'agent/pre-step',
      { agent: new FakeAgent(headed('sess-m3-continue')), messages: [scheduleMessage(`${LOOP_PROMPT_PREFIX} round 5`)], turn: 1, step: 1, signal: new AbortController().signal } as never,
      async () => { nextCalls += 1; return { kind: 'enter', messages: [] } },
    ) as Decision
    expect(decision.kind).toBe('enter')
    expect(nextCalls).toBe(1)
    expect(admitted).toEqual(['sess-m3-continue'])
    const observed = readHeartbeatListenObservations({ dir: ledger })
    expect(observed).toHaveLength(1)
    expect(observed[0]!.outcome).toBe('continued')
  })
})
