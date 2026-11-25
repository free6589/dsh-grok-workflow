/**
 * M3.2: admission is live, and the narrow listener is the only brake owner.
 *
 * Five groups, one product claim each:
 *
 * 1. **Admission is live.** `BLOCK_ADMISSION_ENFORCED` is on, so `canAcceptBlock` reads
 *    the session's own mode record: no record, `enabled: false`, or a hand-written
 *    `workflowMode: 'off'` all answer "no"; an enabled record answers "yes" in both
 *    shapes (`full`, `triage`).
 * 2. **Every block tool reads it.** All six names in `BLOCK_TOOL_NAMES` refuse a session
 *    with no mode record with the named `mode-off` refusal, and the same call gets past
 *    admission once the session carries a `/grok on` record — the failure after that
 *    point, if any, is a different one.
 * 3. **The narrow listener is the only brake owner.** With the default configuration the
 *    `agent/pre-step` chain holds exactly one listener; a stopped beat is answered
 *    `reject` without opening a turn, stops the loop once, and records one `stopped`
 *    line with the brake code; a continued beat calls `next()` and charges one round; a
 *    user message is untouched; a batch it cannot read is total (no throw, no line).
 * 4. **Two files, one writer each.** With the intake on, one beat writes one line to
 *    `heartbeats.jsonl` (which blocks it found open) and one to
 *    `heartbeats-listen.jsonl` (what it did). With the intake off, only the second file
 *    exists and the first is never created.
 * 5. **Registration.** The intake switch adds the observer and the six tools and nothing
 *    else; the narrow listener is there either way, and it answers a beat before any
 *    other listener in the chain runs.
 *
 * The design doc's §3.1 case list is not in this repository, so these five groups are
 * written as its intent rather than as a transcription of it.
 *
 * Boundary: `Context`, `SystemPrompt`, `ToolRuntime`, `Session`, `apply()` and the
 * `agent/pre-step` waterfall are the real host classes; the workflow engine is a stub
 * that throws if a run is ever started, because no case here may spend a model call.
 * Listener counts read cordis's own hook list, which is the only honest way to say "off
 * registers nothing". The only stub inside the routing cases is the brake port, used
 * where a count ("stopped once", "charged once") has to be observed rather than inferred;
 * the end-to-end cases drive the real port the composition builds.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { Session, appendPluginRecord } from '@deepseek-ai/dsh-session'
import { createSystemMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { apply } from '../src/index.js'
import { BLOCK_LEDGER_VERSION, appendBlockRow, resetPreviews } from '../src/block/index.js'
import { HEARTBEATS_FILE } from '../src/block/brakes.js'
import { BLOCK_TOOL_NAMES } from '../src/block/tools.js'
import {
  HEARTBEATS_LISTEN_FILE,
  installHeartbeatListen,
  isHeartbeatMessage,
  readHeartbeatListenObservations,
} from '../src/heartbeat-listen.js'
import { resolveConfig } from '../src/config.js'
import { LOOP_PROMPT_PREFIX } from '../src/loop.js'
import type { LoopBrakeInput, LoopBrakePort } from '../src/loop-brakes.js'
import { MODE_RECORD, setMode } from '../src/mode.js'
import { BLOCK_ADMISSION_ENFORCED, canAcceptBlock, canAcceptBlockWhenEnforced } from '../src/user-source.js'

/** The objective a user turn carries; nothing here runs it. */
const OBJECTIVE = '把账本读出来，写一句结论'

/* ------------------------------------------------------------------ agent -- */

/** The slice of an agent the listeners and the tools read; `session` is the real class. */
class FakeAgent {
  readonly followups: UserMessage[] = []
  readonly followup = (message: UserMessage): void => { this.followups.push(message) }
  readonly whenIdle = async (): Promise<void> => {}

  constructor(readonly session: Session) {}
}

/* --------------------------------------------------------------- harness -- */

const mountedContexts: Context[] = []

/** One ledger for the whole file, emptied between cases. */
let ledger = ''
const previousLedgerDir = process.env['GROK_WORKFLOW_BLOCK_LEDGER_DIR']
const previousStopFile = process.env['GROK_WORKFLOW_STOP_FILE']

beforeAll(() => {
  mkdirSync(join(process.cwd(), '.tmp'), { recursive: true })
  ledger = mkdtempSync(join(process.cwd(), '.tmp', 'm3-2-'))
  process.env['GROK_WORKFLOW_BLOCK_LEDGER_DIR'] = ledger
})

afterAll(() => {
  if (previousLedgerDir === undefined) delete process.env['GROK_WORKFLOW_BLOCK_LEDGER_DIR']
  else process.env['GROK_WORKFLOW_BLOCK_LEDGER_DIR'] = previousLedgerDir
  if (previousStopFile === undefined) delete process.env['GROK_WORKFLOW_STOP_FILE']
  else process.env['GROK_WORKFLOW_STOP_FILE'] = previousStopFile
  try { rmSync(ledger, { recursive: true, force: true }) } catch { /* already gone */ }
})

beforeEach(() => {
  resetPreviews()
  for (const file of [HEARTBEATS_FILE, HEARTBEATS_LISTEN_FILE, 'blocks.jsonl', 'verdicts.jsonl']) {
    try { rmSync(join(ledger, file), { force: true }) } catch { /* nothing to remove */ }
  }
  // This checkout may carry a real `.rsi/STOP`; the default for every case is "no marker",
  // and the stop cases point the variable at a file they create themselves.
  process.env['GROK_WORKFLOW_STOP_FILE'] = join(ledger, 'STOP-does-not-exist')
})

afterEach(async () => {
  for (const ctx of mountedContexts.splice(0)) {
    try { await ctx.fiber.dispose() } catch { /* already disposed */ }
  }
})

/** Engine that refuses to run: no case in this file may start a workflow. */
const noRunEngine = {
  async start(): Promise<never> {
    throw new Error('m3-intake.spec.ts must not start a workflow run')
  },
}

/**
 * Mount the plugin on a real context.
 *
 * No overrides means the shipped defaults, which is what group 3 calls "the default
 * configuration": the intake on (`blockIntake` is on by default since M3.3) and no other
 * admission listener, because the front desk is gone.
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
  apply(ctx as never, { grokDefault: 'on', ...overrides } as never)
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

/** A headed session that opted into grok mode the way `/grok on` does. */
function optedIn(id: string, workflowMode: 'full' | 'triage' = 'full'): Session {
  const live = headed(id)
  const written = setMode(live, { v: 1, enabled: true, turn: 1, setBy: 'command:/grok', workflowMode })
  expect(written.ok, `the mode record must be readable back: ${written.reason ?? ''}`).toBe(true)
  return live
}

function userMessage(text: string): UserMessage {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } as never }) as UserMessage
}

function scheduleMessage(text: string): UserMessage {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'schedule' } as never }) as UserMessage
}

/** One Host heartbeat delivery, as the driver writes it. */
function heartbeat(): UserMessage {
  return scheduleMessage(`${LOOP_PROMPT_PREFIX} round 2`)
}

interface Decision { kind: string; messages?: UserMessage[]; reason?: string }

/** Drive one payload through the real waterfall with a base callback that counts. */
async function dispatch(
  ctx: Context,
  agent: FakeAgent,
  messages: UserMessage[],
  turn = 1,
): Promise<{ decision: Decision; nextCalls: number }> {
  let nextCalls = 0
  const decision = await ctx.waterfall(
    'agent/pre-step',
    { agent, messages, turn, step: 1, signal: new AbortController().signal } as never,
    async () => { nextCalls += 1; return { kind: 'enter', messages } },
  ) as Decision
  return { decision, nextCalls }
}

/** How many `agent/pre-step` listeners this context holds (cordis's own list). */
function listenerCount(ctx: Context): number {
  const events = (ctx as unknown as { events: { _hooks: Record<string, unknown[]> } }).events
  return (events._hooks['agent/pre-step'] ?? []).length
}

/** The `exec` a tool call receives. */
function execOf(live: Session): unknown {
  return { agent: { session: live }, signal: new AbortController().signal }
}

/** Call one registered tool by name. */
async function call(ctx: Context, name: string, args: Record<string, unknown>, live: Session): Promise<Record<string, unknown>> {
  const tool = ctx.tools.get(name)
  expect(tool, `${name} must be registered when the intake is on`).toBeDefined()
  return await (tool as unknown as { execute(args: unknown, exec: unknown): Promise<Record<string, unknown>> })
    .execute(args, execOf(live)) as Record<string, unknown>
}

/** What one tool call did: `ok`, or the refusal code it threw with. */
async function outcomeOf(promise: Promise<unknown>): Promise<{ ok: boolean; code: string }> {
  try {
    await promise
    return { ok: true, code: '' }
  } catch (error) {
    return { ok: false, code: String((error as { code?: unknown }).code ?? '') }
  }
}

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

/** The lines of one ledger file, or none when it was never created. */
function linesOf(file: string): string[] {
  try {
    return readFileSync(join(ledger, file), 'utf8').split('\n').filter(line => line.trim() !== '')
  } catch {
    return []
  }
}

/* -------------------------------------------------- 1. admission is live -- */

describe('1. admission is live', () => {
  it('answers no for every session that did not opt in', () => {
    expect(BLOCK_ADMISSION_ENFORCED, 'M3.2 turns the rule on').toBe(true)
    // No session at all, and a real session that never wrote a record.
    expect(canAcceptBlock(undefined)).toBe(false)
    expect(canAcceptBlock(headed('sess-admit-none'))).toBe(false)
    // A written "off" — what `/grok off` leaves behind.
    const disabled = headed('sess-admit-disabled')
    expect(setMode(disabled, { v: 1, enabled: false, turn: 1, setBy: 'command:/grok' }).ok).toBe(true)
    expect(canAcceptBlock(disabled)).toBe(false)
    // An explicit "off" shape is written by hand: `setMode` refuses a record this build
    // cannot read back, so only a future build can produce one. The reader drops it and
    // the rule still says no — an "off" is never an admission.
    const explicitOff = headed('sess-admit-explicit-off')
    appendPluginRecord(explicitOff, MODE_RECORD, { v: 1, enabled: true, turn: 1, setBy: 'test', workflowMode: 'off' } as never)
    expect(canAcceptBlock(explicitOff)).toBe(false)
  })

  it('answers yes for an enabled record, in both workflow shapes', () => {
    const full = optedIn('sess-admit-full', 'full')
    expect(canAcceptBlock(full)).toBe(true)
    const triage = optedIn('sess-admit-triage', 'triage')
    expect(canAcceptBlock(triage)).toBe(true)
    // The shape says how admitted work is routed, not whether the intake may take it.
    const record = canAcceptBlockWhenEnforced(triage)
    expect(record).toBe(true)
  })

  it('keeps the rule and the phase switch separable', () => {
    // While enforcement is on the two agree; the rule is exported on its own so its
    // boundaries can be reviewed without depending on the switch, and so the switch can
    // be turned off without deleting the rule (D-138).
    const cases: Session[] = [headed('sess-rule-none'), optedIn('sess-rule-on'), headed('sess-rule-off')]
    expect(setMode(cases[2]!, { v: 1, enabled: false, turn: 1, setBy: 'command:/grok' }).ok).toBe(true)
    for (const session of cases) {
      expect(canAcceptBlockWhenEnforced(session)).toBe(canAcceptBlock(session))
    }
    expect(canAcceptBlockWhenEnforced(undefined)).toBe(canAcceptBlock(undefined))
  })
})

/* --------------------------------------------- 2. every block tool reads it -- */

describe('2. every block tool reads the admission rule', () => {
  /** The smallest argument set each tool accepts, so admission is what answers. */
  const MINIMAL: Record<string, Record<string, unknown>> = {
    [BLOCK_TOOL_NAMES.open]: {
      mode: 'preview',
      objective: '把账本读出来',
      blocks: [{ title: '读账本', objective: '读', deliverable: '一段结论', acceptance: ['读完了'] }],
    },
    [BLOCK_TOOL_NAMES.accept]: { block_id: 'blk-does-not-exist' },
    [BLOCK_TOOL_NAMES.close]: { block_id: 'blk-does-not-exist', handoff: '做了什么：读了\n证据：一行\n没做：无\n下一步：交' },
    [BLOCK_TOOL_NAMES.status]: {},
    [BLOCK_TOOL_NAMES.steer]: { block_id: 'blk-does-not-exist', text: '换个方向' },
    [BLOCK_TOOL_NAMES.stop]: { block_id: 'blk-does-not-exist' },
  }

  it('covers all six registered names, not a sample', () => {
    expect(Object.keys(MINIMAL).sort()).toEqual(Object.values(BLOCK_TOOL_NAMES).sort())
    expect(Object.keys(BLOCK_TOOL_NAMES)).toHaveLength(6)
  })

  it('refuses every one of them with mode-off when the session has no mode record', async () => {
    const ctx = await mount({ blockIntake: true })
    const stranger = headed('sess-tools-no-mode')
    for (const [name, args] of Object.entries(MINIMAL)) {
      await expect(call(ctx, name, args, stranger), `${name} must refuse a session with no record`)
        .rejects.toMatchObject({ code: 'mode-off' })
    }
    // Nothing was opened, accepted, closed or steered by those six refusals.
    expect(linesOf('blocks.jsonl')).toHaveLength(0)
  })

  it('lets the same six calls past admission once the session carries a /grok on record', async () => {
    const ctx = await mount({ blockIntake: true })
    const live = optedIn('sess-tools-mode-on')
    for (const [name, args] of Object.entries(MINIMAL)) {
      const outcome = await outcomeOf(call(ctx, name, args, live))
      // Each of these still fails — there is no such block — but never at the door:
      // `mode-off` is the one code that must not appear.
      expect(outcome.code, `${name} must get past admission`).not.toBe('mode-off')
      expect(outcome.ok || outcome.code === 'not-found' || outcome.code === 'invalid').toBe(true)
    }
    // `grok_block_status` has nothing to refuse, so it is the one call that succeeds.
    const listed = await call(ctx, BLOCK_TOOL_NAMES.status, {}, live)
    expect(listed['blocks']).toEqual([])
  })
})

/** A brake port that records what was asked of it, so a count is observed rather than inferred. */
function stubLoop(review: () => 'continue' | 'stop'): {
  loop: LoopBrakePort
  stops: { sessionId: string, code: string, detail: string }[]
  admitted: string[]
  reviewed: number
} {
  const state = {
    stops: [] as { sessionId: string, code: string, detail: string }[],
    admitted: [] as string[],
    reviewed: 0,
    loop: {
      review: (_input: LoopBrakeInput) => {
        state.reviewed += 1
        return review() === 'stop'
          ? { kind: 'stop' as const, code: 'loop/daily-cap' as const, detail: '今天已经跑满' }
          : { kind: 'continue' as const }
      },
      admit: (input: LoopBrakeInput) => { state.admitted.push(input.sessionId) },
      stop: async (input: { sessionId: string, code: string, detail: string }) => { state.stops.push(input) },
    } satisfies LoopBrakePort,
  }
  return state
}

/* ------------------------- 3. the narrow listener is the only brake owner -- */

describe('3. the narrow listener is the only brake owner', () => {
  it('leaves the narrow listener as the only brake owner on the default configuration', async () => {
    // The default is the new shape: the intake is on (M3.3), so the chain carries the
    // narrow listener plus the intake's own observer — and no admission listener at all,
    // because the front desk and the routing key it read were deleted.
    expect(resolveConfig({}).blockIntake).toBe(true)
    const ctx = await mount()
    expect(listenerCount(ctx), 'the narrow listener plus the intake observer').toBe(2)
  })

  it('answers a stopped beat with reject, opens no turn, stops the loop once, and records the code', async () => {
    const ctx = new Context()
    mountedContexts.push(ctx)
    const brakes = stubLoop(() => 'stop')
    installHeartbeatListen({
      ctx,
      logger: { warn: () => {} },
      enabled: true,
      loop: brakes.loop,
      config: resolveConfig({}),
      options: { dir: ledger },
    })
    const { decision, nextCalls } = await dispatch(ctx, new FakeAgent(headed('sess-beat-stop')), [heartbeat()])
    expect(decision.kind).toBe('reject')
    expect(nextCalls, 'a stopped beat must not open a turn').toBe(0)
    expect(brakes.reviewed, 'one beat, one review').toBe(1)
    expect(brakes.stops).toEqual([{ sessionId: 'sess-beat-stop', code: 'loop/daily-cap', detail: '今天已经跑满' }])
    const recorded = readHeartbeatListenObservations({ dir: ledger })
    expect(recorded).toHaveLength(1)
    expect(recorded[0]).toMatchObject({ sessionId: 'sess-beat-stop', outcome: 'stopped', code: 'loop/daily-cap' })
  })

  it('continues a beat the brakes allow, calls next() once and charges one round', async () => {
    const ctx = new Context()
    mountedContexts.push(ctx)
    const brakes = stubLoop(() => 'continue')
    installHeartbeatListen({
      ctx,
      logger: { warn: () => {} },
      enabled: true,
      loop: brakes.loop,
      config: resolveConfig({}),
      options: { dir: ledger },
    })
    const { decision, nextCalls } = await dispatch(ctx, new FakeAgent(headed('sess-beat-continue')), [heartbeat()])
    expect(decision.kind).toBe('enter')
    expect(nextCalls).toBe(1)
    expect(brakes.admitted).toEqual(['sess-beat-continue'])
    expect(brakes.stops).toEqual([])
    const recorded = readHeartbeatListenObservations({ dir: ledger })
    expect(recorded).toHaveLength(1)
    expect(recorded[0]).toMatchObject({ sessionId: 'sess-beat-continue', outcome: 'continued' })
    expect(recorded[0]!.code).toBeUndefined()
  })

  it('stops a real beat end to end through the composed chain, with the real brake port', async () => {
    // The real port, driven by the operator's stop marker: no stub anywhere in this case.
    const marker = join(ledger, 'STOP')
    writeFileSync(marker, '')
    process.env['GROK_WORKFLOW_STOP_FILE'] = marker
    const ctx = await mount()
    const { decision, nextCalls } = await dispatch(ctx, new FakeAgent(headed('sess-beat-real-stop')), [heartbeat()])
    expect(decision.kind).toBe('reject')
    expect(nextCalls).toBe(0)
    const recorded = readHeartbeatListenObservations({ dir: ledger })
    expect(recorded).toHaveLength(1)
    expect(recorded[0]).toMatchObject({ sessionId: 'sess-beat-real-stop', outcome: 'stopped', code: 'loop/stop-file' })
  })

  it('leaves a user message untouched', async () => {
    const ctx = await mount()
    const messages = [userMessage(OBJECTIVE)]
    const { decision, nextCalls } = await dispatch(ctx, new FakeAgent(headed('sess-beat-user')), messages)
    expect(decision.kind).toBe('enter')
    expect(decision.messages).toBe(messages)
    expect(nextCalls).toBe(1)
    expect(readHeartbeatListenObservations({ dir: ledger })).toHaveLength(0)
  })

  it('survives a batch it cannot read, and writes nothing for it', async () => {
    // The listener runs on every pre-step now, so a null element has to read as "not a
    // heartbeat" instead of taking the turn down.
    expect(isHeartbeatMessage(null)).toBe(false)
    expect(isHeartbeatMessage(undefined)).toBe(false)
    expect(isHeartbeatMessage({})).toBe(false)

    const ctx = await mount()
    const messages = [null as never]
    const { decision, nextCalls } = await dispatch(ctx, new FakeAgent(headed('sess-beat-malformed')), messages)
    expect(decision.kind).toBe('enter')
    expect(decision.messages).toBe(messages)
    expect(nextCalls).toBe(1)
    expect(readHeartbeatListenObservations({ dir: ledger })).toHaveLength(0)
  })
})

/* ---------------------------------------- 4. two files, one writer each -- */

describe('4. two files, one writer each', () => {
  it('writes one line to each file for one beat while the intake is on', async () => {
    const sessionId = 'sess-files-on'
    await openBlockFor(sessionId)
    const ctx = await mount({ blockIntake: true })
    const { decision } = await dispatch(ctx, new FakeAgent(headed(sessionId)), [heartbeat()])
    expect(decision.kind).toBe('enter')
    // The intake's observation answers "which blocks did this beat find open".
    const opened = linesOf(HEARTBEATS_FILE)
    expect(opened).toHaveLength(1)
    expect(JSON.parse(opened[0]!)).toMatchObject({ kind: 'heartbeat', sessionId, blockIds: [`row-${sessionId}`] })
    // This listener's own file answers "what did the beat do".
    const recorded = readHeartbeatListenObservations({ dir: ledger })
    expect(recorded).toHaveLength(1)
    expect(recorded[0]).toMatchObject({ sessionId, outcome: 'continued' })
  })

  it('never creates the intake file when the intake is off', async () => {
    const sessionId = 'sess-files-off'
    await openBlockFor(sessionId)
    const ctx = await mount({ blockIntake: false })
    const { decision } = await dispatch(ctx, new FakeAgent(headed(sessionId)), [heartbeat()])
    expect(decision.kind).toBe('enter')
    expect(existsSync(join(ledger, HEARTBEATS_FILE)), 'no intake observer, no intake file').toBe(false)
    const recorded = readHeartbeatListenObservations({ dir: ledger })
    expect(recorded).toHaveLength(1)
    expect(recorded[0]).toMatchObject({ sessionId, outcome: 'continued' })
  })
})

/* ----------------------------------------------------- 5. registration -- */

describe('5. registration', () => {
  it('registers no intake listener and no block tool when the intake is off — and the narrow listener still exists', async () => {
    const ctx = await mount({ blockIntake: false })
    expect(listenerCount(ctx), 'the narrow listener is not part of the intake branch').toBe(1)
    for (const name of Object.values(BLOCK_TOOL_NAMES)) {
      expect(ctx.tools.get(name), `${name} must not be registered`).toBeUndefined()
    }
    // The one listener on the chain is the narrow one: it is what records the beat.
    const sessionId = 'sess-reg-off'
    await openBlockFor(sessionId)
    await dispatch(ctx, new FakeAgent(headed(sessionId)), [heartbeat()])
    expect(readHeartbeatListenObservations({ dir: ledger })).toHaveLength(1)
  })

  it('registers the six block tools on a default load', async () => {
    // M3.3 flipped the default: a load that says nothing carries the intake, so the tools
    // an operator expects are there without a patch entry.
    const ctx = await mount()
    for (const name of Object.values(BLOCK_TOOL_NAMES)) {
      expect(ctx.tools.get(name), `${name} must be registered by default`).toBeDefined()
    }
  })

  it('adds the intake observer — and nothing else — when the intake is on', async () => {
    const off = await mount({ blockIntake: false })
    const on = await mount({ blockIntake: true })
    expect(listenerCount(on) - listenerCount(off), 'exactly one more listener').toBe(1)
    // The added one is the intake observer: its file appears for a beat that finds work.
    const sessionId = 'sess-reg-on'
    await openBlockFor(sessionId)
    await dispatch(on, new FakeAgent(headed(sessionId)), [heartbeat()])
    expect(linesOf(HEARTBEATS_FILE)).toHaveLength(1)
  })

  it('never intercepts a user message on the default load', async () => {
    // M3.3's product promise: with no configuration at all, nothing stands between the
    // user and the model. The message comes back as the same object, the turn is entered,
    // and no run was started to make that decision.
    const ctx = await mount()
    const messages = [userMessage(OBJECTIVE)]
    const { decision, nextCalls } = await dispatch(ctx, new FakeAgent(headed('sess-reg-user')), messages)
    expect(decision.kind).toBe('enter')
    expect(decision.messages).toBe(messages)
    expect(nextCalls, 'no listener answered on its own').toBe(1)
  })

  it('never lets a stopped beat reach the rest of the chain', async () => {
    // The narrow listener is registered first and answers `reject` without calling
    // `next()`, so nothing behind it — the intake observer, or anything a profile adds —
    // ever decides a stopped beat.
    const marker = join(ledger, 'STOP-before-chain')
    writeFileSync(marker, '')
    process.env['GROK_WORKFLOW_STOP_FILE'] = marker
    const mounted = await mount({ blockIntake: true })
    const { decision, nextCalls } = await dispatch(mounted, new FakeAgent(headed('sess-reg-stop-chain')), [heartbeat()])
    expect(decision.kind).toBe('reject')
    expect(nextCalls, 'the narrow listener answers before the observer runs').toBe(0)
  })
})
