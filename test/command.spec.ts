/**
 * `/grok [on|off]` — handler semantics and lazy `commands` registration.
 *
 * The handler is exercised directly against the REAL durable toggle (real
 * `Session` from `@deepseek-ai/dsh-session`, real `src/mode.ts` writes), and
 * the registration is asserted through a **real cordis `Context`** with a
 * composed `commands` service (the way `composition.spec.ts` keeps cordis
 * real): the lazy `ctx.inject(['commands'], ...)` mount fires only once the
 * service exists — the exact headless/interactive split the plugin promises.
 * The plugin-entry wiring test drives the real `apply()` with the same shim
 * shape `composition.spec.ts` uses, delegating `inject` to the real context.
 */
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { Session } from '@deepseek-ai/dsh-session'
import { grokCommand, registerGrokCommand } from '../src/command.js'
import type { GrokCommandAgent, GrokCommandDefinition, GrokCommandResult } from '../src/command.js'
import { apply } from '../src/index.js'
import { isModeEnabled, readModeRecord, setMode } from '../src/mode.js'

/** Documented settle texts (also asserted verbatim below). */
const ON_TEXT = 'Grok workflow ON — every message now runs the full plan→execute→verify workflow.'
const OFF_TEXT = 'Grok workflow OFF — normal chat.'

/* --------------------------------------------------------------- fixtures -- */

/** Real session (mirrors `realSession` in gate.spec.ts). */
function realSession(id: string): Session {
  return Session.create(id as never)
}

/** Minimal agent fixture (mirrors gate.spec.ts's FakeAgent): session + turn. */
class FakeAgent {
  readonly session: Session
  readonly turn?: number | undefined

  constructor(session: Session, turn?: number) {
    this.session = session
    this.turn = turn
  }
}

/** Runs one invocation of the real command handler. */
function invoke(rawInput: string, agent: FakeAgent): GrokCommandResult {
  return grokCommand().handler({ agent, rawInput })
}

/* ------------------------------------------------- handler: arg parsing -- */

describe('grok command handler (arg parsing → toggle state)', () => {
  it('enables the toggle for empty input', () => {
    const session = realSession('sess-cmd-empty')
    const result = invoke('', new FakeAgent(session))
    expect(result).toEqual({ kind: 'success', text: ON_TEXT })
    expect(isModeEnabled(session)).toBe(true)
  })

  it('enables the toggle for on (whitespace trimmed)', () => {
    const session = realSession('sess-cmd-on')
    const result = invoke('  on  ', new FakeAgent(session))
    expect(result).toEqual({ kind: 'success', text: ON_TEXT })
    expect(isModeEnabled(session)).toBe(true)
  })

  it('disables the toggle for off (whitespace trimmed)', () => {
    const session = realSession('sess-cmd-off')
    invoke('', new FakeAgent(session))
    expect(isModeEnabled(session)).toBe(true)
    const result = invoke('  off  ', new FakeAgent(session))
    expect(result).toEqual({ kind: 'success', text: OFF_TEXT })
    expect(isModeEnabled(session)).toBe(false)
  })

  it('leaves a fresh session off when off is the first command', () => {
    const session = realSession('sess-cmd-off-fresh')
    expect(invoke('off', new FakeAgent(session))).toEqual({ kind: 'success', text: OFF_TEXT })
    expect(isModeEnabled(session)).toBe(false)
  })

  it('returns a usage error and does not change the toggle for a bad arg', () => {
    // Toggle currently ON: the bad arg must not flip it.
    const on = realSession('sess-cmd-bad-on')
    setMode(on, { v: 1, enabled: true, turn: 1, setBy: 'command:/grok' })
    expect(invoke('maybe', new FakeAgent(on))).toEqual({ kind: 'error', text: 'Usage: /grok [on|off]' })
    expect(isModeEnabled(on)).toBe(true)
    // Toggle currently OFF: still untouched.
    const off = realSession('sess-cmd-bad-off')
    setMode(off, { v: 1, enabled: false, turn: 1, setBy: 'command:/grok off' })
    expect(invoke('on please', new FakeAgent(off))).toEqual({ kind: 'error', text: 'Usage: /grok [on|off]' })
    expect(isModeEnabled(off)).toBe(false)
    // Never written: a bad arg writes nothing at all.
    const fresh = realSession('sess-cmd-bad-fresh')
    expect(invoke('off now', new FakeAgent(fresh))).toEqual({ kind: 'error', text: 'Usage: /grok [on|off]' })
    expect(readModeRecord(fresh)).toBeUndefined()
  })
})

/* ------------------------------------------------------- handler: results -- */

describe('grok command handler (settled kind and text)', () => {
  it('settles success for on and off, error for a bad arg', () => {
    const session = realSession('sess-cmd-kinds')
    const agent = new FakeAgent(session)
    expect(invoke('', agent)).toEqual({ kind: 'success', text: ON_TEXT })
    expect(invoke('off', agent)).toEqual({ kind: 'success', text: OFF_TEXT })
    expect(invoke('on', agent)).toEqual({ kind: 'success', text: ON_TEXT })
    const bad = invoke('banana', agent)
    expect(bad.kind).toBe('error')
    expect(bad.text).toBe('Usage: /grok [on|off]')
    // The grammar owns `on`/`off`/empty; anything else is usage — and the
    // toggle still reflects the last valid command (`on`).
    expect(isModeEnabled(session)).toBe(true)
  })
})

/* ------------------------------------------------------- handler: durable -- */

describe('grok command handler (durable write)', () => {
  it('readModeRecord reflects the value and setBy after the handler runs', () => {
    const session = realSession('sess-cmd-durable')
    const agent = new FakeAgent(session)
    invoke('on', agent)
    expect(readModeRecord(session)).toEqual({ v: 1, enabled: true, turn: 0, setBy: 'command:/grok', workflowMode: 'full' })
    invoke('off', agent)
    expect(readModeRecord(session)).toEqual({ v: 1, enabled: false, turn: 0, setBy: 'command:/grok off' })
  })

  it('records the agent turn when the agent exposes one, else 0', () => {
    const withTurn = realSession('sess-cmd-turn')
    invoke('on', new FakeAgent(withTurn, 3))
    expect(readModeRecord(withTurn)?.turn).toBe(3)
    const withoutTurn = realSession('sess-cmd-no-turn')
    invoke('on', new FakeAgent(withoutTurn))
    expect(readModeRecord(withoutTurn)?.turn).toBe(0)
    // A non-finite turn must not crash the handler; the record falls back to 0.
    const weirdTurn = realSession('sess-cmd-weird-turn')
    invoke('on', new FakeAgent(weirdTurn, Number.NaN))
    expect(readModeRecord(weirdTurn)?.turn).toBe(0)
  })
})

/* -------------------------------------------------------- registration -- */

/** Recorder standing in for the `commands` service (`register` contract). */
class CommandRecorder {
  readonly definitions: GrokCommandDefinition[] = []

  register(definition: GrokCommandDefinition): () => void {
    this.definitions.push(definition)
    return () => {}
  }
}

describe('/grok registration (lazy commands mount)', () => {
  it('registers grok only once a commands service is composed (real cordis)', async () => {
    const ctx = new Context()
    const recorder = new CommandRecorder()
    registerGrokCommand(ctx)
    // Lazy mount: before the service exists nothing can register — exactly the
    // headless/ACP case where the command must not exist at all.
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(recorder.definitions).toEqual([])
    ctx.provide('commands', recorder)
    await vi.waitFor(() => expect(recorder.definitions).toHaveLength(1))
    const definition = recorder.definitions[0]!
    expect(definition.name).toBe('grok')
    expect(definition.description).toBe('Turn the grok workflow on or off')
    expect(definition.input).toEqual({ hint: '[on|off]' })
    // The registered handler is the real one: it flips the durable toggle.
    const session = realSession('sess-cmd-registered')
    expect(definition.handler({ agent: new FakeAgent(session), rawInput: '' }))
      .toEqual({ kind: 'success', text: ON_TEXT })
    expect(isModeEnabled(session)).toBe(true)
    await ctx.fiber.dispose()
  })

  it('is wired by the plugin entry apply() (real cordis inject)', async () => {
    const ctx = new Context()
    const recorder = new CommandRecorder()
    ctx.provide('commands', recorder)
    // Same shim shape as composition.spec.ts: real cordis for the composition
    // seams (`on`, `effect`, `inject`), fake services for the rest.
    const shim = {
      on: (event: string, handler: unknown) => ctx.on(event as never, handler as never),
      effect: (installer: () => () => void) => installer(),
      logger: () => ({ warn: () => {}, info: () => {}, debug: () => {} }),
      tools: { register: () => () => {} },
      systemPrompt: { section: () => () => {}, getSectionOrder: () => 2600 },
      workflowEngine: { start: async () => { throw new Error('not used') } },
      inject: (deps: string[], callback: (injected: unknown) => void) =>
        ctx.inject(deps as never, callback as never),
    }
    apply(shim as never, {})
    await vi.waitFor(() => expect(recorder.definitions).toHaveLength(1))
    expect(recorder.definitions[0]!.name).toBe('grok')
    await ctx.fiber.dispose()
  })

  it('stays inert on a host without the plugin registry mixin', () => {
    // The commands surface is optional everywhere; a context double without
    // even `ctx.inject` must never break plugin setup.
    expect(() => registerGrokCommand({} as never)).not.toThrow()
  })
})

/* --------------------------------------------------------- type anchors -- */

// Keep the handler contract honest at compile time: FakeAgent must satisfy the
// invocation surface the commands service passes in.
const _agentTypeAnchor: GrokCommandAgent = new FakeAgent(realSession('sess-cmd-anchor'))
void _agentTypeAnchor
