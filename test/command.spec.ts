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
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Session } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { grokCommand, GROK_USAGE_TEXT, registerGrokCommand } from '../src/command.js'
import type { GrokCommandAgent, GrokCommandDefinition, GrokCommandResult } from '../src/command.js'
import { apply } from '../src/index.js'
import { isModeEnabled, readModeRecord, setMode } from '../src/mode.js'
import { isPromptShapedArgument } from '../src/intake.js'
import { canAcceptBlock } from '../src/user-source.js'

/** Documented settle texts (also asserted verbatim below). */
const ON_TEXT = 'Grok workflow ON — every message now runs the full plan→execute→verify workflow.'
const OFF_TEXT = 'Grok workflow OFF — normal chat.'

/**
 * The stored team task prompt that stalled intake (measured, two independent
 * sessions: 2 032 and 2 041 characters, `docs/knowledge/VALIDATION.md`). Its
 * first line opens with `/grok`, which is what the commands parser reads, so the
 * whole body arrives as the command's argument.
 */
const PASTED_TEAM_PROMPT = [
  '团队任务：实现「自我迭代」功能（与「自动接着跑」并列，第二开关 + 独立心跳 + 可改模板）',
  '',
  '【背景】',
  '仓库 /home/fish/projects_mine/dsh-grok-workflow，分支 main，当前 v0.11.21。',
  '「自动接着跑」= Schedule 里一条 rrule 任务，到点续一句让本会话接着干。',
  '现在要加第二条独立心跳「自我迭代」：心跳唤醒后自己选题、自己改、自己测、自己记、自己发版。',
  '',
  '【要求】',
  '1. 第二个开关，与「自动接着跑」并列，独立心跳。',
  '2. 默认模板文件放在 docs 下，模板可改。',
  '3. npm run ci 通过；每处改动有改前失败、改后通过的测试。',
].join('\n')

/* --------------------------------------------------------------- fixtures -- */

/** Real session, so the record is the durable one the host would persist. */
function realSession(id: string): Session {
  return Session.create(id as never)
}

/** Minimal agent fixture: session + turn. */
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
    expect(invoke('maybe', new FakeAgent(on))).toEqual({ kind: 'error', text: GROK_USAGE_TEXT })
    expect(isModeEnabled(on)).toBe(true)
    // Toggle currently OFF: still untouched.
    const off = realSession('sess-cmd-bad-off')
    setMode(off, { v: 1, enabled: false, turn: 1, setBy: 'command:/grok off' })
    expect(invoke('on please', new FakeAgent(off))).toEqual({ kind: 'error', text: GROK_USAGE_TEXT })
    expect(isModeEnabled(off)).toBe(false)
    // Never written: a bad arg writes nothing at all.
    const fresh = realSession('sess-cmd-bad-fresh')
    expect(invoke('off now', new FakeAgent(fresh))).toEqual({ kind: 'error', text: GROK_USAGE_TEXT })
    expect(readModeRecord(fresh)).toBeUndefined()
  })
})

/* ----------------------------------------- grammar: case and whitespace -- */

/**
 * `/grok` takes a switch word, not a spelling test.
 *
 * `rawInput` is whatever the commands parser sliced off the first line, so its
 * casing and its surrounding whitespace belong to the keyboard, not to the
 * intent. Every variant below must reach the same durable state and the same
 * settle text as the lowercase, unspaced form.
 */
describe('grok command handler (case and whitespace tolerance)', () => {
  const ON_VARIANTS = ['on', 'ON', 'On', 'oN', ' on', 'on ', '  ON  ', '\ton\n', '\u3000on\u3000', '\u00a0ON\u00a0']
  const OFF_VARIANTS = ['off', 'OFF', 'Off', 'oFf', ' off', 'off ', '  OFF  ', '\toff\n', '\u3000OFF\u3000', '\u00a0Off\u00a0']

  it('enables for every casing and whitespace variant of on', () => {
    ON_VARIANTS.forEach((raw, index) => {
      const session = realSession(`sess-variant-on-${index}`)
      expect(invoke(raw, new FakeAgent(session)), `rawInput ${JSON.stringify(raw)}`).toEqual({ kind: 'success', text: ON_TEXT })
      expect(isModeEnabled(session)).toBe(true)
      expect(readModeRecord(session)?.setBy).toBe('command:/grok')
    })
  })

  it('disables for every casing and whitespace variant of off, from an enabled session', () => {
    OFF_VARIANTS.forEach((raw, index) => {
      const session = realSession(`sess-variant-off-${index}`)
      invoke('on', new FakeAgent(session))
      expect(isModeEnabled(session)).toBe(true)
      expect(invoke(raw, new FakeAgent(session)), `rawInput ${JSON.stringify(raw)}`).toEqual({ kind: 'success', text: OFF_TEXT })
      expect(isModeEnabled(session)).toBe(false)
      expect(readModeRecord(session)?.setBy).toBe('command:/grok off')
    })
  })

  it('refuses a nearly-right word without changing the toggle', () => {
    // Case tolerance must not become a spell-check bypass: a word that is not
    // `on`/`off` is still a usage error, and the toggle keeps its last value.
    for (const raw of ['onn', 'OF', 'ON please', 'off.', 'on;off', 'ON OFF']) {
      const session = realSession(`sess-variant-bad-${raw.length}-${raw.charCodeAt(0)}`)
      invoke('on', new FakeAgent(session))
      expect(invoke(raw, new FakeAgent(session)), `rawInput ${JSON.stringify(raw)}`).toEqual({ kind: 'error', text: GROK_USAGE_TEXT })
      expect(isModeEnabled(session)).toBe(true)
    }
  })

  it('treats a non-string argument as a usage error, not as "no argument means on"', () => {
    // A malformed invocation must not throw and must not write: the empty-input
    // branch (bare `/grok` enables) is only for a real empty string.
    for (const raw of [undefined, null, 42, {}]) {
      const session = realSession(`sess-variant-shape-${String(raw)}`)
      const result = invoke(raw as never, new FakeAgent(session))
      expect(result).toEqual({ kind: 'error', text: GROK_USAGE_TEXT })
      expect(readModeRecord(session)).toBeUndefined()
    }
  })
})

/* --------------------------------------- command ↔ settings switch state -- */

/**
 * The command and the settings page's master switch must never disagree.
 *
 * The settings switch persists the deployment default (`grokDefault`); the command
 * persists the session record. Since M3.3 deleted the front desk, nothing decides a
 * *message* from that record any more — so "both agree" is a claim about the surface
 * that still reads it: the block intake's admission rule (`canAcceptBlock`). After
 * `/grok on` the block tools accept the session, and after `/grok off` they refuse it —
 * and the record the command wrote is the record the rule read.
 */
describe('grok command and the master switch read one state', () => {
  it('admits a block after /grok on', () => {
    const session = realSession('sess-cmd-switch-on')
    expect(canAcceptBlock(session), 'no record, no admission').toBe(false)
    invoke('on', new FakeAgent(session))
    expect(canAcceptBlock(session)).toBe(true)
  })

  it('refuses a block after /grok off', () => {
    const session = realSession('sess-cmd-switch-off')
    invoke('on', new FakeAgent(session))
    expect(canAcceptBlock(session)).toBe(true)
    invoke('off', new FakeAgent(session))
    expect(canAcceptBlock(session), 'an explicit off is never an admission').toBe(false)
  })

  it('settles with the state the readers see, and the round trip returns to the switch default', () => {
    const session = realSession('sess-cmd-switch-round-trip')
    const agent = new FakeAgent(session)
    expect(invoke('OFF', agent)).toEqual({ kind: 'success', text: OFF_TEXT })
    expect(canAcceptBlock(session)).toBe(false)
    expect(invoke('On', agent)).toEqual({ kind: 'success', text: ON_TEXT })
    expect(canAcceptBlock(session)).toBe(true)
    expect(invoke('OFF', agent)).toEqual({ kind: 'success', text: OFF_TEXT })
    expect(canAcceptBlock(session)).toBe(false)
  })

  it('no longer decides a user message: the record belongs to the intake, not the chain', async () => {
    // M3.3 deleted the listener that read this record for admission. A user batch now
    // enters the step with the objects the loop claimed, whether the session is on or
    // off — the promise is "nothing stands between the user and the model".
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin({
      name: 'stub-workflow-engine',
      apply(inner: Context) { inner.provide('workflowEngine', { start: async () => { throw new Error('not used') } }) },
    } as never, {} as never)
    const previousLedger = process.env['GROK_WORKFLOW_BLOCK_LEDGER_DIR']
    process.env['GROK_WORKFLOW_BLOCK_LEDGER_DIR'] = mkdtempSync(join(tmpdir(), 'command-switch-'))
    try {
      apply(ctx as never, {})
      const session = realSession('sess-cmd-switch-chain')
      const messages = [createUserMessage({
        content: [{ type: 'text', text: 'do the thing' }],
        source: { kind: 'user' } as never,
      }) as UserMessage]
      const step = async (): Promise<{ kind: string, messages?: UserMessage[] }> => await ctx.waterfall(
        'agent/pre-step',
        { agent: { session }, messages, turn: 1, step: 1, signal: new AbortController().signal } as never,
        async () => ({ kind: 'enter', messages }),
      ) as { kind: string, messages?: UserMessage[] }

      expect(await step()).toMatchObject({ kind: 'enter' })
      invoke('on', new FakeAgent(session))
      const on = await step()
      expect(on.kind).toBe('enter')
      expect(on.messages).toBe(messages)
      invoke('off', new FakeAgent(session))
      const off = await step()
      expect(off.kind).toBe('enter')
      expect(off.messages).toBe(messages)
    } finally {
      if (previousLedger === undefined) delete process.env['GROK_WORKFLOW_BLOCK_LEDGER_DIR']
      else process.env['GROK_WORKFLOW_BLOCK_LEDGER_DIR'] = previousLedger
      await ctx.fiber.dispose()
    }
  })
})


/* ------------------------------------------------- handler: failed writes -- */

describe('grok command handler (a write that does not land)', () => {
  it('settles error, never the success wording, when the session refuses the write', () => {
    // A log that cannot take a plugin record at all (here: not a Session).
    const refusing = { ownEvents: () => [], append() { throw new Error('read-only session') } } as unknown as Session
    const result = invoke('on', new FakeAgent(refusing))
    expect(result.kind).toBe('error')
    expect(result.text).not.toContain('Grok workflow ON')
    expect(result.text).not.toContain('Grok workflow OFF')
    expect(result.text).toContain('toggle not changed')
    expect(result.text).toContain('no toggle was recorded')
  })

  it('reports the state the session really has when the write does not land', () => {
    const session = realSession('sess-cmd-stale')
    const agent = new FakeAgent(session)
    invoke('on', agent)
    expect(isModeEnabled(session)).toBe(true)
    // The log stops reflecting new writes: `/grok off` cannot land, so the
    // handler must report the state the readers still see (on), not "OFF".
    const staleLog = session.ownEvents()
    Object.defineProperty(session, 'ownEvents', { value: () => staleLog, configurable: true })
    const result = invoke('off', agent)
    expect(result.kind).toBe('error')
    expect(result.text).toContain('the session still reads a different record')
    expect(result.text).toContain('the toggle is still on')
    expect(result.text).not.toContain('Grok workflow OFF')
    expect(result.text).not.toContain('normal chat')
  })

  it('settles error when the append is accepted but never readable back', () => {
    const session = realSession('sess-cmd-unreadable')
    Object.defineProperty(session, 'ownEvents', { value: () => [], configurable: true })
    const result = invoke('on', new FakeAgent(session))
    expect(result.kind).toBe('error')
    expect(result.text).toContain('not readable back')
    expect(result.text).toContain('no toggle was recorded')
    expect(result.text).not.toContain('every message now runs the full plan')
  })

  it('settles error on an agent without a session instead of claiming success', () => {
    const result = invoke('on', new FakeAgent(undefined as never))
    expect(result.kind).toBe('error')
    expect(result.text).toContain('toggle not changed')
    expect(result.text).not.toContain('Grok workflow ON')
  })

  it('still settles success for a write the session really holds', () => {
    const session = realSession('sess-cmd-lands')
    expect(invoke('on', new FakeAgent(session))).toEqual({ kind: 'success', text: ON_TEXT })
    expect(invoke('off', new FakeAgent(session))).toEqual({ kind: 'success', text: OFF_TEXT })
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
    expect(bad.text).toBe(GROK_USAGE_TEXT)
    // The grammar owns `on`/`off`/empty; anything else is usage — and the
    // toggle still reflects the last valid command (`on`).
    expect(isModeEnabled(session)).toBe(true)
  })
})

/* -------------------------------------------------------- intake boundary -- */

describe('grok command handler (prompt-shaped argument: the intake stall)', () => {
  it('refuses a pasted team prompt with the measured, bilingual refusal', () => {
    // The measured shape: `/grok` at the start of the line, the whole task body
    // as the argument. Before this change the same call settled as a one-line
    // usage error and the prompt never reached the gate.
    const session = realSession('sess-cmd-prompt')
    const result = invoke(` ${PASTED_TEAM_PROMPT}`, new FakeAgent(session))

    expect(result.kind).toBe('error')
    expect(result.text).toContain('Usage: /grok [on|off]')
    expect(result.text).toContain(`the ${PASTED_TEAM_PROMPT.length} characters after it were discarded`)
    expect(result.text).toContain('这段文字没有作为提示词发出')
    expect(result.text).toContain('其后的')
    expect(result.text).toContain(String(PASTED_TEAM_PROMPT.length))
    // Nothing was written: a refused argument never touches the toggle.
    expect(readModeRecord(session)).toBeUndefined()
  })

  it('also covers the "/grok on /grok …" shape the fresh session carried', () => {
    const session = realSession('sess-cmd-prompt-on')
    const result = invoke(` on /grok${PASTED_TEAM_PROMPT}`, new FakeAgent(session))

    expect(result.kind).toBe('error')
    expect(result.text).toContain('Usage: /grok [on|off]')
    expect(result.text).toContain(String(` on /grok${PASTED_TEAM_PROMPT}`.trim().length))
    expect(readModeRecord(session)).toBeUndefined()
  })

  it('keeps the terse grammar error for a one-line argument, never silence', () => {
    expect(invoke('maybe', new FakeAgent(realSession('sess-cmd-one')))).toEqual({ kind: 'error', text: GROK_USAGE_TEXT })
    expect(invoke('banana', new FakeAgent(realSession('sess-cmd-two')))).toEqual({ kind: 'error', text: GROK_USAGE_TEXT })

    // The shape test: a one-line argument is a typo, a long or multi-line one is a
    // prompt the command swallowed.
    expect(isPromptShapedArgument('maybe')).toBe(false)
    expect(isPromptShapedArgument('x'.repeat(199))).toBe(false)
    expect(isPromptShapedArgument('x'.repeat(201))).toBe(true)
    expect(isPromptShapedArgument(PASTED_TEAM_PROMPT)).toBe(true)
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
    // Round 70: the command now also answers `/grok status`, so its advertised
    // description and hint name that third word — a `status` invocation the grammar
    // accepts while the help text says otherwise is the worse of the two lies.
    expect(definition.description).toBe('Turn the grok workflow on or off, or report the last run')
    expect(definition.input).toEqual({ hint: '[on|off|status]' })
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
