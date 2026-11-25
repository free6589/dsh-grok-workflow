import { afterEach, describe, expect, it } from 'vitest'
import { Session } from '@deepseek-ai/dsh-session'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import type { WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import { resolveConfig } from '../src/config.js'
import type { ResolvedConfig } from '../src/types.js'
import { createActiveState, runWorkflow } from '../src/run.js'
import type { RunOutcome, WorkflowLogger } from '../src/run.js'
import {
  STEERING_TOOL_NAME, closeAllSteering, openSteering, pullSteering, steeringForSession,
} from '../src/steering.js'
import { STEERING_INBOX_EVENT, STEERING_INBOX_SEEN, installSteeringInbox } from '../src/steering-inbox.js'

/**
 * The entrance a mid-run demand was missing (`D-162`).
 *
 * Two layers are pinned here, like `test/replan.spec.ts` does for the rest of the
 * channel:
 *
 * - the subscriber alone (host, pure): which inbox events it accepts, which it must
 *   refuse, how it remembers an id, and that it can never throw into the turn that
 *   delivered the message;
 * - the wire: the text it accepts reaches the queue the *real* `runWorkflow` opened for
 *   that session, and the `replan` switch still decides whether that queue exists.
 *
 * The real good news this file encodes is a Host fact, observed on a real machine
 * (`.rsi/evidence/inbox-steering-2026-11-26/`): `agent/inbox/inserted` is emitted by the
 * loop's own `inbox.splice()`, synchronously, so a message typed while a tool call is in
 * flight arrives while that call is still running. That is why this subscriber is enough
 * to close the hole `D-161` left open.
 */

interface Captured {
  event: string
  handler: (payload: unknown) => void
}

/** The narrow slice of a plugin context this module touches, with a real registry. */
function fakeContext(warnings: string[], infos: string[] = []) {
  const captured: Captured[] = []
  const disposed: string[] = []
  const ctx = {
    on: (event: string, handler: (payload: unknown) => void) => {
      captured.push({ event, handler })
      return () => { disposed.push(event) }
    },
  }
  const logger = {
    warn: (message: string) => { warnings.push(message) },
    info: (message: string) => { infos.push(message) },
  }
  return { ctx, logger, captured, disposed }
}

/** One `agent/inbox/inserted` payload, built from the real message type. */
function inserted(sessionId: string, message: UserMessage): unknown {
  return { agent: { session: { id: sessionId } }, message }
}

/** A message with the source kind an ordinary human prompt carries. */
function human(text: string): UserMessage {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }) as UserMessage
}

/** A message from another producer, with a kind this build already knows. */
function fromProducer(kind: string, text: string): UserMessage {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind } as never }) as UserMessage
}

const SESSION = 'sess-inbox'

describe('the subscriber: what counts as a demand', () => {
  afterEach(() => closeAllSteering())

  it('queues one human message for the run that is working in that session', () => {
    const warnings: string[] = []
    const { ctx, logger, captured } = fakeContext(warnings)
    installSteeringInbox({ ctx, logger })
    const { token } = openSteering(SESSION)

    captured[0]!.handler(inserted(SESSION, human('also cover the edge cases')))

    expect(pullSteering(token).intents.map(intent => intent.text)).toEqual(['also cover the edge cases'])
    expect(warnings).toEqual([])
  })

  it('drops the message when no run is working in that session', () => {
    const warnings: string[] = []
    const { ctx, logger, captured } = fakeContext(warnings)
    installSteeringInbox({ ctx, logger })

    // No queue: this is an ordinary turn, and nothing may start steering it.
    expect(() => captured[0]!.handler(inserted(SESSION, human('hello')))).not.toThrow()
    expect(steeringForSession(SESSION)).toBeUndefined()
    expect(warnings).toEqual([])
  })

  it('drops a message that belongs to another session than the working one', () => {
    const warnings: string[] = []
    const { ctx, logger, captured } = fakeContext(warnings)
    installSteeringInbox({ ctx, logger })
    const { token } = openSteering(SESSION)

    captured[0]!.handler(inserted('sess-elsewhere', human('give me a total')))

    expect(pullSteering(token).intents).toEqual([])
  })

  it('drops a message that is not a person speaking: another role, or injected context', () => {
    const warnings: string[] = []
    const { ctx, logger, captured } = fakeContext(warnings)
    installSteeringInbox({ ctx, logger })
    const { token } = openSteering(SESSION)
    const assistant = { ...human('I will handle it'), role: 'assistant' } as unknown as UserMessage

    captured[0]!.handler(inserted(SESSION, assistant))
    captured[0]!.handler(inserted(SESSION, fromProducer('runtime-context', 'Working directory: /tmp')))

    expect(pullSteering(token).intents).toEqual([])
  })

  it('drops a scheduled delivery, which arrives as a user message too', () => {
    const warnings: string[] = []
    const { ctx, logger, captured } = fakeContext(warnings)
    installSteeringInbox({ ctx, logger })
    const { token } = openSteering(SESSION)

    // A loop beat is a user-role message from the `schedule` producer: it is the
    // repository's own clock, not the person talking.
    captured[0]!.handler(inserted(SESSION, fromProducer('schedule', 'RSI heartbeat: continue')))

    expect(pullSteering(token).intents).toEqual([])
  })

  it('drops a card answer, which answers a question instead of asking for anything', () => {
    const warnings: string[] = []
    const { ctx, logger, captured } = fakeContext(warnings)
    installSteeringInbox({ ctx, logger })
    const { token } = openSteering(SESSION)

    captured[0]!.handler(inserted(SESSION, fromProducer('user-question-reply', '{"answers":["yes"]}')))

    expect(pullSteering(token).intents).toEqual([])
  })


  it('drops a message that carries no text at all', () => {
    const warnings: string[] = []
    const { ctx, logger, captured } = fakeContext(warnings)
    installSteeringInbox({ ctx, logger })
    const { token } = openSteering(SESSION)
    const imageOnly = createUserMessage({
      content: [{ type: 'image', mediaType: 'image/png', data: 'AAAA' } as never],
      source: { kind: 'user' },
    }) as UserMessage
    const blank = human('   \n  ')

    captured[0]!.handler(inserted(SESSION, imageOnly))
    captured[0]!.handler(inserted(SESSION, blank))

    expect(pullSteering(token).intents).toEqual([])
  })
})

describe('the subscriber: identity and lifetime', () => {
  afterEach(() => closeAllSteering())

  it('queues one message once when the same message is moved into the running turn', () => {
    const warnings: string[] = []
    const { ctx, logger, captured } = fakeContext(warnings)
    installSteeringInbox({ ctx, logger })
    const { token } = openSteering(SESSION)
    const message = human('also cover the edge cases')

    // Queued, then steered: the Host removes the pending message and re-inserts the
    // same one into `next-step`, so the inbox announces it twice. One demand.
    captured[0]!.handler(inserted(SESSION, message))
    captured[0]!.handler(inserted(SESSION, message))

    expect(pullSteering(token).intents.map(intent => intent.text)).toEqual(['also cover the edge cases'])
  })

  it('forgets an id only after the guard is full, so the bound is real', () => {
    const warnings: string[] = []
    const { ctx, logger, captured } = fakeContext(warnings)
    installSteeringInbox({ ctx, logger })
    const { token } = openSteering(SESSION)
    const message = human('one demand')

    captured[0]!.handler(inserted(SESSION, message))
    // Filler ids carrying no text: they take a slot in the guard without taking one in
    // the queue (which holds eight), so the assertion measures the guard and not the
    // queue's own bound.
    for (let index = 0; index < STEERING_INBOX_SEEN; index++) {
      captured[0]!.handler(inserted(SESSION, human('   ')))
    }
    captured[0]!.handler(inserted(SESSION, message))

    // The first copy is still in the queue, the re-send is accepted again: the guard is
    // a bound, not a memory that grows with the conversation.
    const texts = pullSteering(token).intents.map(intent => intent.text)
    expect(texts.filter(text => text === 'one demand')).toHaveLength(2)
  })

  it('removes its listener when the plugin unloads', () => {
    const warnings: string[] = []
    const { ctx, logger, captured, disposed } = fakeContext(warnings)
    const dispose = installSteeringInbox({ ctx, logger })

    expect(captured.map(entry => entry.event)).toEqual([STEERING_INBOX_EVENT])
    dispose()
    expect(disposed).toEqual([STEERING_INBOX_EVENT])

    // A surface that composes no event bus gets an inert disposer, not a crash: the
    // headless profile installs this plugin too.
    const silent = installSteeringInbox({ ctx: {}, logger })
    expect(() => silent()).not.toThrow()
  })

  it('warns instead of throwing when queueing fails, so the turn still runs', () => {
    const warnings: string[] = []
    const { ctx, logger, captured } = fakeContext(warnings)
    installSteeringInbox({
      ctx,
      logger,
      now: () => { throw new Error('clock is gone') },
    })
    const { token } = openSteering(SESSION)

    expect(() => captured[0]!.handler(inserted(SESSION, human('also do D')))).not.toThrow()
    expect(pullSteering(token).intents).toEqual([])
    expect(warnings.some(line => line.includes('could not queue a message'))).toBe(true)
  })

  it('logs how many are pending and never what they say', () => {
    const warnings: string[] = []
    const infos: string[] = []
    const { ctx, logger, captured } = fakeContext(warnings, infos)
    installSteeringInbox({ ctx, logger })
    openSteering(SESSION)

    captured[0]!.handler(inserted(SESSION, human('the customer password is hunter2')))

    expect(infos).toHaveLength(1)
    expect(infos[0]).toContain('1 pending')
    expect(infos[0]).not.toContain('hunter2')
  })

})

/**
 * The wire: the queue the subscriber feeds is the one a real run opened, and the
 * `replan` switch still decides whether that queue exists at all. The fake engine is
 * the only stand-in — the same shape `test/replan.spec.ts` uses, so the two files
 * cannot drift apart on what "a live channel" means.
 */
describe('wiring: the inbox feeds the run own channel, replan still decides', () => {
  const OBJECTIVE = 'Answer for the three files'

  interface WireResult { value: unknown, stopReason: string, agentsStarted: number }

  class WireRun {
    readonly id: string
    readonly meta: WorkflowStartRequest['meta']
    readonly dispose = async (): Promise<void> => {}
    readonly result: Promise<WireResult>
    private settleWith!: (result: WireResult) => void

    constructor(meta: WorkflowStartRequest['meta'], index: number) {
      this.id = `inbox-run-${index}`
      this.meta = meta
      this.result = new Promise(resolve => { this.settleWith = resolve })
    }

    cancel(): void { this.settle('cancelled') }

    settle(stopReason: string): void {
      this.settleWith({ value: null, stopReason, agentsStarted: 0 })
    }
  }

  class WireEngine {
    readonly starts: WorkflowStartRequest[] = []
    readonly runs: WireRun[] = []

    async start(request: WorkflowStartRequest): Promise<WireRun> {
      this.starts.push(request)
      const run = new WireRun(request.meta, this.runs.length + 1)
      this.runs.push(run)
      return run
    }
  }

  function config(overrides: Record<string, unknown> = {}): ResolvedConfig {
    return resolveConfig({ maxConcurrency: 2, maxTasks: 4, ...overrides })
  }

  function begin(engine: WireEngine, overrides: Record<string, unknown> = {}): Promise<RunOutcome> {
    const logger: WorkflowLogger = { warn: () => {}, info: () => {} }
    return runWorkflow({
      ctx: { workflowEngine: engine, logger: () => logger } as never,
      config: config(overrides),
      state: createActiveState(),
      logger,
      agent: { session: Session.create(SESSION as SessionId) } as never,
      objective: OBJECTIVE,
      callerTasks: [{
        id: 'a',
        title: 'Task a',
        objective: 'Do a',
        expectedOutput: 'Output a',
        acceptanceCriteria: ['a works'],
        context: '',
        constraints: [],
        writesPaths: [],
      }],
      resumeLister: 'skip',
      steering: { sessionId: SESSION },
      failureMode: 'report',
    })
  }

  async function waitForStart(engine: WireEngine): Promise<WorkflowStartRequest> {
    while (engine.starts.length === 0) await new Promise(resolve => { setImmediate(resolve) })
    return engine.starts[0]!
  }

  afterEach(() => closeAllSteering())

  it('hands the message from the inbox to the boundary pull, and closes with the run', async () => {
    const engine = new WireEngine()
    const warnings: string[] = []
    const { ctx, logger, captured } = fakeContext(warnings)
    installSteeringInbox({ ctx, logger })
    const pending = begin(engine)
    const request = await waitForStart(engine)
    const replan = (request.args as { replan?: { token?: string, tool?: string } }).replan
    expect(replan?.tool).toBe(STEERING_TOOL_NAME)

    captured[0]!.handler(inserted(SESSION, human('also cover the edge cases')))

    // The boundary child's one call takes the demand the person typed mid-run.
    expect(pullSteering(replan!.token).intents.map(intent => intent.text))
      .toEqual(['also cover the edge cases'])
    expect(pullSteering(replan!.token).intents).toEqual([])

    engine.runs[0]!.settle('completed')
    await pending
    expect(steeringForSession(SESSION)).toBeUndefined()
  })

  it('queues nothing when the replan switch is off, whatever arrives', async () => {
    const engine = new WireEngine()
    const warnings: string[] = []
    const { ctx, logger, captured } = fakeContext(warnings)
    installSteeringInbox({ ctx, logger })
    const pending = begin(engine, { replan: false })
    const request = await waitForStart(engine)
    expect('replan' in (request.args as Record<string, unknown>)).toBe(false)

    captured[0]!.handler(inserted(SESSION, human('also cover the edge cases')))

    // No channel: the message is not queued anywhere, and no run is left steering.
    expect(steeringForSession(SESSION)).toBeUndefined()
    expect(warnings).toEqual([])
    engine.runs[0]!.settle('completed')
    await pending
  })
})
