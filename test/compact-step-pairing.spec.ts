/**
 * Regression: `/compact` failed on a session this plugin wrote a receipt into.
 *
 * The failure mode, measured end to end in `scripts/repro-compact.mjs`: DSH's
 * token meter replays the journal with one hard pairing rule — an
 * `assistant/message` is legal only between a `step/start` and its `step/end` for
 * the same `(turn, step)` (`@deepseek-ai/dsh-token-meter` 0.2.1-rc.2,
 * `advanceMeasurement`). The gate's instant receipt runs in `agent/pre-step`,
 * i.e. *before* the step opens, so the row it wrote had no step behind it. The
 * first replay then threw `token meter: assistant/message at seq N has no matching
 * step/start event`, and because the fold cursor never advances past that seq,
 * every later replay threw at the same place. `BasicCompactionEngine.compactNow()`
 * measures before it selects a range, so `/compact` answered with an error on a
 * session that otherwise looked healthy — and automatic compaction failed the same
 * way, silently (`agent/pre-step` only warns and continues the turn).
 *
 * These tests replay through the **real** token meter (a devDependency, pinned to
 * the same version as the other DSH packages), so the assertion is the production
 * rule and not a copy of it. They are deterministic: no model, no network, no
 * store — the session is an in-memory `Session`.
 */
import { describe, expect, it } from 'vitest'
import { Session } from '@deepseek-ai/dsh-session'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { TokenMeter } from '@deepseek-ai/dsh-token-meter'
import { appendInstantReceipt, appendUnloadNotice } from '../src/records.js'

/* ------------------------------------------------------------------ harness -- */

/** A session with a turn open and the user's words in it, and no step yet. */
function atPreStep(id: string): Session {
  const session = Session.create(id as SessionId)
  session.append('turn/start', { turn: 1 })
  session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: 'run the workflow' }],
    source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  return session
}

/**
 * The real meter, wired to nothing else.
 *
 * `TokenMeter` is a cordis service, and the replay it performs (`measure` →
 * `_sync` → `advanceMeasurement`) only needs the session and a context whose
 * `get` answers nothing (no `llm` service, so no route image pricing). Building
 * that here keeps the service registry out of a unit test while the fold under
 * assertion stays the shipped one.
 */
function meter(): TokenMeter {
  // `states` and `ctx` are private to the service; a cast keeps the assertion on
  // the shipped fold while the test stays out of the cordis registry.
  const instance = Object.create(TokenMeter.prototype) as unknown as {
    states: WeakMap<object, unknown>
    ctx: unknown
    measure: TokenMeter['measure']
  }
  instance.states = new WeakMap()
  instance.ctx = { get: () => undefined }
  return instance as unknown as TokenMeter
}

/** No logger noise from the writers; each test asserts the return value instead. */
const silent = { warn: () => {}, info: () => {} }

/* -------------------------------------------------------------- the defect -- */

describe('a plugin row outside an open step breaks the token meter', () => {
  it('replays an unpaired assistant row as a hard error — the `/compact` failure', () => {
    const session = atPreStep('sess-orphan-control')
    // What the pre-fix writers did: `lastTurnOf()` reported (turn 1, step 0) and
    // the row was appended with no `step/start` behind it.
    session.append('assistant/message', {
      turn: 1,
      step: 0,
      message: createAssistantMessage({
        content: [{ type: 'text', text: '档位：团队档' }],
        source: { provider: 'grok-workflow', model: 'workflow-receipt' },
      }),
      stream: [],
    }, { surfaceOp: 'append' })

    expect(() => meter().measure(session)).toThrow(/assistant\/message at seq 2 has no matching step\/start event/)
    // Not self-healing: the fold cursor stops at the offending seq, so a second
    // measurement throws at the same place instead of advancing past it.
    expect(() => meter().measure(session)).toThrow(/assistant\/message at seq 2/)
  })
})

/* ---------------------------------------------------------------- the fix -- */

describe('the plugin never writes an assistant row without an open step', () => {
  it('refuses the instant receipt at pre-step, so the session still measures', () => {
    const session = atPreStep('sess-receipt-pre-step')

    // Red on the pre-fix source: this returned true and appended the unpaired row,
    // which made the measurement below throw instead of returning a number.
    expect(appendInstantReceipt(session, '档位：团队档', silent)).toBe(false)

    expect(session.ownEvents().filter(event => event.type === 'assistant/message')).toEqual([])
    // The whole point: `/compact` measures this session and gets a number.
    const measurement = meter().measure(session)
    expect(measurement.totalTokens).toBeGreaterThan(0)
  })

  it('writes the receipt at the open step’s own pair, and still measures', () => {
    const session = atPreStep('sess-receipt-in-step')
    session.append('step/start', { turn: 1, step: 0 })

    expect(appendInstantReceipt(session, '档位：团队档', silent)).toBe(true)

    const rows = session.ownEvents().filter(event => event.type === 'assistant/message')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.data).toMatchObject({ turn: 1, step: 0 })
    expect(() => meter().measure(session)).not.toThrow()
  })

  it('keeps the unload notice as a record when the disposal has no step to attach to', async () => {
    const session = atPreStep('sess-notice-pre-step')

    // The row is refused, but the notice's words are not dropped: they are the
    // plugin's terminal record, and the return value still says it reached the log.
    expect(appendUnloadNotice(session, '[grok-workflow] the run was cut by an unload', silent)).toBe(true)

    expect(session.ownEvents().filter(event => event.type === 'assistant/message')).toEqual([])
    expect(() => meter().measure(session)).not.toThrow()
    const { TERMINAL_RECORD } = await import('../src/records.js')
    // Plugin records are `ignorable` events outside the known-type union, so the
    // type is compared as a plain string here.
    const kept = session.ownEvents()
      .map(event => (String((event as { type?: unknown }).type) === TERMINAL_RECORD
        ? (event as { data?: { text?: string } }).data
        : undefined))
      .filter(record => record !== undefined)
    expect(kept.map(record => record.text)).toEqual(['[grok-workflow] the run was cut by an unload'])
  })
})

/* ------------------------------------ repair of an already-orphaned row -- */

/**
 * Repair invariant for journals that already carry the defect (2026-11-20,
 * session-3a683cb6: seq 3553 + seq 5424, both `workflow-notice` rows written by
 * the pre-fix disposer with no `step/start` behind them).
 *
 * The fix (`openStepOf` + `appendAssistantInStep`) prevents new orphans but
 * does not rewrite history: a journal that already carries one still fails the
 * meter on replay. The supported repair is a shape change only — the orphan
 * `assistant/message` becomes the plugin's own `plugin:grok-workflow/terminal`
 * record at the same seq/time, so no text is lost (the dispose + delivery
 * records stay untouched) and the meter's pairing rule passes again. Anything
 * else (dropping the seq, renumbering, editing text) would fork the journal.
 */
describe('repair of an already-orphaned assistant row', () => {
  it('a terminal record carrying the same words passes the meter the orphan broke', async () => {
    const { recordTerminal, TERMINAL_RECORD } = await import('../src/records.js')
    const orphanText = '[grok-workflow] the run was cut by an unload'

    // Control: the pre-fix shape (assistant row, no step behind it) breaks the meter.
    const broken = atPreStep('sess-repair-orphan')
    broken.append('assistant/message', {
      turn: 1,
      step: 0,
      message: createAssistantMessage({
        content: [{ type: 'text', text: orphanText }],
        source: { provider: 'grok-workflow', model: 'workflow-notice' },
      }),
      stream: [],
    }, { surfaceOp: 'append' })
    expect(() => meter().measure(broken)).toThrow(/has no matching step\/start event/)

    // Repaired shape: the same words as the plugin's terminal record, no
    // assistant row. Seq preservation is a file-level property (the repair
    // rewrites the journal at the same seq, verified by the seq-contiguity
    // check on session-3a683cb6); the Session API assigns seqs, so what is
    // pinned here is the shape the meter accepts.
    const repaired = atPreStep('sess-repair-terminal')
    expect(recordTerminal(repaired, orphanText, silent)).toBe(true)
    expect(repaired.ownEvents().filter(event => event.type === 'assistant/message')).toEqual([])
    expect(() => meter().measure(repaired)).not.toThrow()
    const kept = repaired.ownEvents()
      .map(event => (String((event as { type?: unknown }).type) === TERMINAL_RECORD
        ? (event as { data?: { text?: string } }).data
        : undefined))
      .filter(record => record !== undefined)
    expect(kept.map(record => record.text)).toEqual([orphanText])
  })
})

describe('openStepOf reads the same boundary the meter enforces', () => {
  // Loaded here rather than at the top of the file so the two writer tests above
  // stay *behaviourally* red on the pre-fix source (a top-level import of a symbol
  // the fix introduces would fail the whole file at import time instead).
  const boundary = async (): Promise<typeof import('../src/records.js')> => import('../src/records.js')

  it('closes on step/end and on turn/end', async () => {
    const { openStepOf } = await boundary()
    const session = atPreStep('sess-open-step-boundary')
    session.append('step/start', { turn: 1, step: 0 })
    expect(openStepOf(session)).toEqual({ turn: 1, step: 0 })

    session.append('step/end', { turn: 1, step: 0 })
    expect(openStepOf(session)).toBeUndefined()

    session.append('step/start', { turn: 1, step: 1 })
    expect(openStepOf(session)).toEqual({ turn: 1, step: 1 })

    // A turn that ends with its step still marked open is not a step a plugin row
    // may attach to: the meter refuses anything after `turn/end` as well.
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    expect(openStepOf(session)).toBeUndefined()
  })

  it('reports no open step for a session that cannot list its events', async () => {
    const { openStepOf } = await boundary()
    expect(openStepOf({} as Session)).toBeUndefined()
  })
})
