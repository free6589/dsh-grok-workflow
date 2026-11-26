import { Session } from '@deepseek-ai/dsh-session'
import { createSystemMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { describe, expect, it } from 'vitest'
import {
  FORCE_TEAM_SOURCE_KIND,
  TEAM_INSTRUCTION_EN,
  TEAM_INSTRUCTION_ZH,
  TEAM_STARTING_TOOLS,
  asksForTeam,
  installForceTeam,
  languageOf,
  teamGateVerdict,
  teamInstruction,
  teamStartedInTurn,
} from '../src/force-team.js'
import { refuseNonTeamTurn } from '../src/intake.js'
import { setMode } from '../src/mode.js'
import { DEFAULT_FORCE_TEAM_ROUTING, resolveConfig } from '../src/config.js'

/**
 * The forced team route: keyword → hard instruction, and the one-shot turn gate.
 *
 * What is pinned here, and why each pin exists:
 *
 * - **The keyword set, both languages, with the English side bounded by a word.**
 *   A Chinese keyword is a substring because Chinese has no spaces; an English one
 *   must be the whole word, so `delegated` / `delegation` / `delegating` are *not*
 *   hits. The consequence is stated in `src/force-team.ts`: no stemming, no plural,
 *   no `-ed`. Pinning both directions means a later "helpful" widening of the match
 *   fails here instead of forcing a team run on an unrelated message.
 * - **The instruction is appended, never substituted.** The user's own text stays a
 *   byte-identical prefix; the message keeps its id, its source and its position, so
 *   nothing is re-written and nothing extra is written to the session.
 * - **The switch and the mode toggle both hold.** `forceTeamRouting: false` and a
 *   session that is not in grok mode are inert, and inert means the decision the loop
 *   proposed comes back unchanged (the same array), not a copy that happens to match.
 * - **The turn gate fires once, and only on evidence.** One reject per turn, only for
 *   the turn that carried the keyword, only when that turn's own log shows neither a
 *   `tool-workflow/*` event nor a `tool/call` to a team-starting tool — and never when
 *   the log cannot be read.
 */

/* ---------------------------------------------------------------- fixtures -- */

/** A session with a head, so a plugin-written `user/message` is a legal append. */
function headed(id: string): Session {
  const session = Session.create(id as never)
  session.append('step/start', { turn: 0, step: 1 })
  session.append('system/message', { turn: 0, step: 1, message: createSystemMessage('test head') }, { surfaceOp: 'append' })
  session.append('step/end', { turn: 0, step: 1 })
  return session
}

function userMessage(text: string, kind = 'user'): UserMessage {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind } as never }) as UserMessage
}

/** Write a `tool-workflow/*` event the way the run's progress recorder does. */
function runStartEvent(session: Session, runId = 'run-1'): void {
  const raw = session as unknown as { append(type: string, data: Record<string, unknown>): unknown }
  raw.append('tool-workflow/run-start', { runId, name: '任务团队 · 2 个任务' })
}

/** Log a `tool/call` the way the tool layer does: name and turn inside `data`. */
function callEvent(session: Session, name: string, turn: number, step = 1): void {
  session.append('tool/call', { turn, step, callId: `call_${name}` as never, name, arguments: '{}' })
}

/**
 * A log of exactly these events.
 *
 * Used for the shapes a real `Session.append` would refuse to write (a `tool/call`
 * with no `data`, a `name` that is not a string): the reader has to survive a log
 * written by something other than this build, not only a log this build wrote.
 */
function logOf(events: Array<{ type: string, seq: number, data?: unknown }>): Session {
  return { id: 'sess-log', ownEvents: () => events } as unknown as Session
}

/** Turn the session's grok mode on, the way `/grok on` does. */
function grokOn(session: Session, turn = 1): void {
  expect(setMode(session, { v: 1, enabled: true, turn, setBy: 'command:/grok', workflowMode: 'full' }).ok).toBe(true)
}

function grokOff(session: Session, turn = 1): void {
  expect(setMode(session, { v: 1, enabled: false, turn, setBy: 'command:/grok off' }).ok).toBe(true)
}

interface Harness {
  dispatch: (payload: Partial<Payload>, next?: () => Promise<Decision>) => Promise<Decision>
  warnings: () => string[]
}

interface Payload {
  agent: { session: Session }
  messages: UserMessage[]
  turn: number
  step: number
}

type Decision =
  | { kind: 'reject' }
  | { kind: 'enter', messages: UserMessage[] }

interface InstallOptions {
  forceTeamRouting?: boolean
  grokDefault?: 'on' | 'off'
}

/** Install the real listener over a capture-only context. */
function harness(options: InstallOptions = {}): Harness {
  const handlers: Array<(payload: Payload, next: () => Promise<Decision>) => Promise<Decision>> = []
  const warnings: string[] = []
  const config = resolveConfig(options.forceTeamRouting === undefined
    ? { grokDefault: options.grokDefault ?? 'off' }
    : { forceTeamRouting: options.forceTeamRouting, grokDefault: options.grokDefault ?? 'off' } as never)
  installForceTeam({
    ctx: { on: (event: string, handler: unknown) => {
      expect(event).toBe('agent/pre-step')
      handlers.push(handler as never)
      return () => {}
    } },
    logger: { warn: (text: string) => { warnings.push(text) } },
    enabled: true,
    config,
  })
  expect(handlers).toHaveLength(1)
  return {
    dispatch: async (payload, next) => {
      const full = {
        agent: { session: headed('sess-force-team') },
        messages: [],
        turn: 1,
        step: 1,
        ...payload,
      } as Payload
      const base = next ?? (async () => ({ kind: 'enter', messages: full.messages }) as Decision)
      return await handlers[0]!(full, base)
    },
    warnings: () => warnings,
  }
}

/** Every text block of one message, in order. */
function texts(message: UserMessage): string[] {
  return message.content
    .filter((block): block is { type: 'text', text: string } => block.type === 'text')
    .map(block => block.text)
}

/* ---------------------------------------------------------------- keywords -- */

describe('the keyword set is two languages wide and exact', () => {
  it('hits each Chinese keyword inside an ordinary sentence', () => {
    for (const keyword of ['开团', '组队', '分工']) {
      expect(asksForTeam(`帮我${keyword}把这件事做完`), keyword).toBe(true)
    }
  })

  it('does not hit Chinese text that asks for none of them', () => {
    expect(asksForTeam('把这件事做完，给我结论')).toBe(false)
    expect(asksForTeam('')).toBe(false)
  })

  it('hits each English keyword as a whole word', () => {
    for (const text of [
      'Please form a team for this.',
      'split the work and report back',
      'delegate the reading to someone else',
      'DELEGATE this now',
      'form  a\n team', // one keyword, runs of whitespace
    ]) {
      expect(asksForTeam(text), text).toBe(true)
    }
  })

  it('does not hit English inflections of the keywords', () => {
    // The documented boundary: the word must be the keyword itself. `delegated`,
    // `delegates`, `delegation` and `delegating` are different words, and a false
    // positive here forces a team run on a message that described the past.
    for (const text of [
      'the delegated work is done',
      'she delegates everything',
      'delegation is hard',
      'delegating was the plan',
      'undelegate this',
      'splitting the work took all day',
      'formateam',
    ]) {
      expect(asksForTeam(text), text).toBe(false)
    }
  })

  it('still hits a keyword that ends at punctuation', () => {
    expect(asksForTeam('Then delegate.')).toBe(true)
    expect(asksForTeam('delegate: the reading')).toBe(true)
    expect(asksForTeam('form a team!')).toBe(true)
  })
})

/* ------------------------------------------------------------ instruction -- */

describe('the instruction is one fixed command block per language', () => {
  it('reads as a command, with the three ordered steps', () => {
    for (const text of [TEAM_INSTRUCTION_ZH]) {
      for (const step of ['先拆活', '并发', '汇总']) expect(text).toContain(step)
      expect(text).toContain('不许单条作答')
    }
    for (const text of [TEAM_INSTRUCTION_EN]) {
      for (const step of ['split the work', 'concurrently', 'summarise']) expect(text).toContain(step)
      expect(text).toContain('not acceptable')
    }
    // A suggestion is ignorable; the whole point is that this is not one.
    expect(TEAM_INSTRUCTION_ZH).not.toContain('请你')
    expect(TEAM_INSTRUCTION_EN.toLowerCase()).not.toContain('could you')
  })

  it('picks the language of the turn', () => {
    expect(languageOf('帮我组队做这件事')).toBe('zh')
    expect(languageOf('split the work please')).toBe('en')
    expect(languageOf('')).toBe('zh')
    expect(teamInstruction('zh')).toBe(TEAM_INSTRUCTION_ZH)
    expect(teamInstruction('en')).toBe(TEAM_INSTRUCTION_EN)
  })
})

/* ------------------------------------------------------------- injection -- */

describe('a keyword turn hands the model the same text plus the instruction', () => {
  it('appends a block and keeps the user text a byte-identical prefix', async () => {
    const session = headed('sess-inject-zh')
    grokOn(session)
    const original = '帮我开团做这件事：把三个子项目各自摸一遍再汇总。'
    const message = userMessage(original)
    const { dispatch } = harness()
    const decision = await dispatch({ agent: { session }, messages: [message] })

    expect(decision.kind).toBe('enter')
    const entered = (decision as { messages: UserMessage[] }).messages
    // Nothing added, nothing removed: the batch the loop claimed is the batch it gets.
    expect(entered).toHaveLength(1)
    const rewritten = entered[0]!
    expect(rewritten.id, 'the message keeps its identity').toBe(message.id)
    expect(rewritten.source.kind).toBe('user')
    const blocks = texts(rewritten)
    expect(blocks).toEqual([original, TEAM_INSTRUCTION_ZH])
    expect(blocks.join('\n\n').startsWith(original), 'the original is still a verbatim prefix').toBe(true)
  })

  it('answers in the turn language, and leaves other messages of the batch alone', async () => {
    const session = headed('sess-inject-en')
    grokOn(session)
    const matched = userMessage('split the work on these three files')
    const other = userMessage('然后按顺序汇报')
    const { dispatch } = harness()
    const entered = ((await dispatch({ agent: { session }, messages: [matched, other] })) as { messages: UserMessage[] }).messages
    expect(texts(entered[0]!)).toEqual(['split the work on these three files', TEAM_INSTRUCTION_EN])
    expect(entered[1], 'a message without a keyword is handed over untouched').toBe(other)
  })

  it('injects nothing when this session is not in grok mode', async () => {
    const session = headed('sess-inject-off')
    grokOff(session)
    const message = userMessage('开团做这件事')
    const messages = [message]
    const { dispatch } = harness()
    const decision = await dispatch({ agent: { session }, messages })
    // The same array, not a copy that happens to match: an inert listener must not
    // stand between the user and the model at all.
    expect((decision as { messages: UserMessage[] }).messages).toBe(messages)
    expect(texts(message)).toEqual(['开团做这件事'])
  })

  it('treats a session with no mode record through the deployment default', async () => {
    const session = headed('sess-inject-default')
    const message = userMessage('组队做这件事')
    const offDefault = harness({ grokDefault: 'off' })
    const messages = [message]
    expect(((await offDefault.dispatch({ agent: { session }, messages })) as { messages: UserMessage[] }).messages).toBe(messages)

    const onDefault = harness({ grokDefault: 'on' })
    const entered = ((await onDefault.dispatch({ agent: { session }, messages })) as { messages: UserMessage[] }).messages
    expect(texts(entered[0]!)).toEqual(['组队做这件事', TEAM_INSTRUCTION_ZH])
  })

  it('injects nothing when forceTeamRouting is off', async () => {
    const session = headed('sess-inject-switch')
    grokOn(session)
    const message = userMessage('开团做这件事')
    const messages = [message]
    const { dispatch } = harness({ forceTeamRouting: false })
    expect(((await dispatch({ agent: { session }, messages })) as { messages: UserMessage[] }).messages).toBe(messages)
  })

  it('registers no listener at all when the switch is off at load', () => {
    const registered: string[] = []
    const dispose = installForceTeam({
      ctx: { on: (event: string) => { registered.push(event); return () => {} } },
      logger: { warn: () => {} },
      enabled: false,
      config: resolveConfig({}),
    })
    // Off is inert by absence, not by an early return: the chain a profile that
    // turned the switch off carries is the pre-feature chain.
    expect(registered).toEqual([])
    expect(typeof dispose).toBe('function')
  })

  it('never injects into a message the user did not write', async () => {
    const session = headed('sess-inject-schedule')
    grokOn(session)
    const beat = userMessage('开团这一轮的例行工作', 'schedule')
    const messages = [beat]
    const { dispatch } = harness()
    expect(((await dispatch({ agent: { session }, messages })) as { messages: UserMessage[] }).messages).toBe(messages)
  })

  it('stays out of a delegated child session', async () => {
    // A child's user message is the prompt its parent wrote: forcing a team there
    // would nest teams and could refuse the child's own continuation step.
    const session = headed('sess-inject-child')
    Object.assign(session, { header: { origin: 'subagent', delegationDepth: 1 } })
    grokOn(session)
    const messages = [userMessage('开团把这三件事做完')]
    const { dispatch } = harness({ grokDefault: 'on' })
    expect(((await dispatch({ agent: { session }, messages, turn: 5, step: 1 })) as { messages: UserMessage[] }).messages).toBe(messages)
    // And no flag was set, so the continuation step is not refused either.
    const deep = headed('sess-inject-depth')
    Object.assign(deep, { header: { origin: 'cli', delegationDepth: 2 } })
    grokOn(deep)
    expect((await dispatch({ agent: { session: deep }, messages, turn: 5, step: 1 })).kind).toBe('enter')
    expect((await dispatch({ agent: { session: deep }, messages: [], turn: 5, step: 2 })).kind).toBe('enter')
  })

  it('survives a batch it cannot read, and changes nothing', async () => {
    // The listener runs on every pre-step, so a malformed element has to read as "not
    // a user message" instead of taking the turn down.
    const session = headed('sess-inject-malformed')
    grokOn(session)
    const messages = [null, { content: 'not blocks' }, 'text'] as never
    const { dispatch } = harness()
    const decision = await dispatch({ agent: { session }, messages })
    expect(decision.kind).toBe('enter')
    expect((decision as { messages: unknown[] }).messages).toBe(messages)
  })

  it('does nothing when a downstream listener already refused the step', async () => {
    const session = headed('sess-inject-refused')
    grokOn(session)
    const { dispatch } = harness()
    const decision = await dispatch({ agent: { session }, messages: [userMessage('开团')] }, async () => ({ kind: 'reject' }))
    expect(decision).toEqual({ kind: 'reject' })
  })
})

/* ------------------------------------------------------------ turn gate -- */

describe('the turn gate refuses once, on evidence, and keeps the user text', () => {
  /** A turn that opened with a keyword message and then asked for a second step. */
  function flaggedTurn(session: Session, turn = 5): void {
    session.append('turn/start', { turn })
    session.append('user/message', userMessage('开团把这件事做完'), { surfaceOp: 'append' })
    session.append('step/start', { turn, step: 1 })
    session.append('step/end', { turn, step: 1 })
  }

  it('refuses the continuation step when the turn started no team', async () => {
    const session = headed('sess-gate-refuse')
    grokOn(session)
    const { dispatch } = harness()
    const keywordMessage = userMessage('开团把这件事做完')
    // Step 1: the injection happens and the turn is remembered.
    const first = await dispatch({ agent: { session }, messages: [keywordMessage], turn: 5, step: 1 })
    expect(first.kind).toBe('enter')
    flaggedTurn(session)

    // Step 2: still no `tool-workflow/*` event — the model was about to work alone.
    const second = await dispatch({ agent: { session }, messages: [], turn: 5, step: 2 })
    expect(second.kind).toBe('reject')
  })

  it('states the refusal in the intake shape, as a message the reader can see', async () => {
    const session = headed('sess-gate-text')
    grokOn(session)
    const { dispatch } = harness()
    await dispatch({ agent: { session }, messages: [userMessage('组队做这件事')], turn: 5, step: 1 })
    flaggedTurn(session)
    const before = session.ownEvents().length
    await dispatch({ agent: { session }, messages: [], turn: 5, step: 2 })

    const written = session.ownEvents().slice(before)
    expect(written, 'exactly one row is written').toHaveLength(1)
    const row = written[0] as unknown as { type: string, data: UserMessage }
    expect(row.type).toBe('user/message')
    expect(row.data.source.kind).toBe(FORCE_TEAM_SOURCE_KIND)

    const text = texts(row.data).join('\n')
    const expected = refuseNonTeamTurn('组队做这件事'.length).text
    expect(text).toBe(expected)
    // The existing bilingual shape: English line, Chinese line, next action, both
    // languages — four lines, no new apology sentence.
    expect(text.split('\n')).toHaveLength(4)
    expect(text).toContain('团队')
    expect(text.toLowerCase()).toContain('team')
  })

  it('does not refuse when the turn started a team', async () => {
    const session = headed('sess-gate-team')
    grokOn(session)
    const { dispatch } = harness()
    await dispatch({ agent: { session }, messages: [userMessage('开团做这件事')], turn: 5, step: 1 })
    flaggedTurn(session)
    runStartEvent(session)
    const before = session.ownEvents().length

    expect((await dispatch({ agent: { session }, messages: [], turn: 5, step: 2 })).kind).toBe('enter')
    expect((await dispatch({ agent: { session }, messages: [], turn: 5, step: 3 })).kind).toBe('enter')
    expect(session.ownEvents().length, 'no refusal row is written').toBe(before)
  })

  it('refuses at most once per turn', async () => {
    const session = headed('sess-gate-once')
    grokOn(session)
    const { dispatch } = harness()
    await dispatch({ agent: { session }, messages: [userMessage('分工做这件事')], turn: 5, step: 1 })
    flaggedTurn(session)
    const before = session.ownEvents().length
    expect((await dispatch({ agent: { session }, messages: [], turn: 5, step: 2 })).kind).toBe('reject')
    const afterFirst = session.ownEvents().length
    expect(afterFirst - before, 'one refusal row').toBe(1)
    expect((await dispatch({ agent: { session }, messages: [], turn: 5, step: 3 })).kind).toBe('enter')
    expect(session.ownEvents().length, 'the second continuation writes nothing').toBe(afterFirst)
  })

  it('drops a stale flag instead of refusing an unrelated later turn', async () => {
    const session = headed('sess-gate-stale')
    grokOn(session)
    const { dispatch } = harness()
    await dispatch({ agent: { session }, messages: [userMessage('开团做这件事')], turn: 5, step: 1 })
    // The turn answered alone and ended; the runtime offered no second pre-step, so
    // the next opportunity belongs to a different, unrelated message.
    session.append('turn/end', { turn: 5, reason: { kind: 'completed' } })
    const before = session.ownEvents().length
    expect((await dispatch({ agent: { session }, messages: [], turn: 6, step: 1 })).kind).toBe('enter')
    expect(session.ownEvents().length).toBe(before)
  })

  it('keeps a steering message that arrived on the refused step', async () => {
    const session = headed('sess-gate-keep')
    grokOn(session)
    const { dispatch } = harness()
    await dispatch({ agent: { session }, messages: [userMessage('开团做这件事')], turn: 5, step: 1 })
    flaggedTurn(session)
    const steering = userMessage('顺便把第二个项目也算上')
    const before = session.ownEvents().length
    expect((await dispatch({ agent: { session }, messages: [steering], turn: 5, step: 2 })).kind).toBe('reject')
    const rows = session.ownEvents().slice(before) as unknown as { type: string, data: UserMessage }[]
    const kept = rows.filter(row => row.type === 'user/message').map(row => row.data)
    expect(kept.map(message => texts(message).join('\n'))).toEqual(['顺便把第二个项目也算上', refuseNonTeamTurn('开团做这件事'.length).text])
  })

  it('never refuses when the session log cannot be read', async () => {
    const unreadable = {
      id: 'sess-gate-unreadable',
      header: { origin: 'cli' },
      ownEvents: () => { throw new Error('log unavailable') },
      append: () => { throw new Error('log unavailable') },
    }
    const { dispatch, warnings } = harness()
    await dispatch({ agent: { session: unreadable as unknown as Session }, messages: [userMessage('开团')], turn: 5, step: 1 })
    expect((await dispatch({ agent: { session: unreadable as unknown as Session }, messages: [], turn: 5, step: 2 })).kind).toBe('enter')
    expect(warnings().length).toBeGreaterThan(0)
  })
})

/* -------------------------------------------------------------- evidence -- */

describe('the turn evidence is read from the session log, not assumed', () => {
  it('finds a team only after the turn opened', () => {
    const session = headed('sess-evidence')
    // A run that finished before this turn began is not this turn's team.
    runStartEvent(session, 'run-before')
    session.append('turn/start', { turn: 7 })
    expect(teamStartedInTurn(session, 7)).toBe(false)
    runStartEvent(session, 'run-this-turn')
    expect(teamStartedInTurn(session, 7)).toBe(true)
    expect(teamStartedInTurn(session, 8), 'a later turn has no team yet').toBe(false)
  })

  it('reports "unknown" rather than "no team" when the log cannot be read', () => {
    const unreadable = { ownEvents: () => { throw new Error('nope') } }
    expect(teamStartedInTurn(unreadable as unknown as Session, 1)).toBeUndefined()
    // Unknown must never become a refusal: a brake that fires on unreadable evidence
    // refuses turns for a reason it cannot state.
    expect(teamGateVerdict({ flag: { turn: 5, step: 1, chars: 2 }, turn: 5, step: 2, teamStarted: undefined })).toBe('none')
  })
})

/* ------------------------------------------------------ widened evidence -- */

/**
 * The measured defect: the block intake is a team start with no session event.
 *
 * `grok_open_block` writes its block to an on-disk ledger (`src/block/store.ts`) and
 * records nothing in the session, so a turn that opened a block carried no
 * `tool-workflow/*` event at all — and the gate refused a turn that had already
 * started real work. The session log does record the call itself, with `name` and
 * `turn` in its `data`, and that is the evidence these cases pin.
 */
describe('a team-starting tool call counts as the team this turn started', () => {
  it('pins the two tools a turn can start a team with', () => {
    expect([...TEAM_STARTING_TOOLS]).toEqual(['grok_workflow', 'grok_open_block'])
  })

  it('accepts a `grok_open_block` call as this turn\'s team', () => {
    const session = headed('sess-evidence-block')
    session.append('turn/start', { turn: 9 })
    expect(teamStartedInTurn(session, 9)).toBe(false)
    callEvent(session, 'grok_open_block', 9)
    expect(teamStartedInTurn(session, 9)).toBe(true)
  })

  it('accepts a `grok_workflow` call as this turn\'s team', () => {
    const session = headed('sess-evidence-workflow')
    session.append('turn/start', { turn: 9 })
    callEvent(session, 'grok_workflow', 9)
    expect(teamStartedInTurn(session, 9)).toBe(true)
  })

  it('does not accept a call to any other tool', () => {
    const session = headed('sess-evidence-bash')
    session.append('turn/start', { turn: 9 })
    callEvent(session, 'bash', 9)
    // A near miss is not a member of the set: the match is the whole tool name.
    callEvent(session, 'grok_open_block_preview', 9)
    expect(teamStartedInTurn(session, 9)).toBe(false)
  })

  it('still accepts a `tool-workflow/*` event', () => {
    const session = headed('sess-evidence-run')
    session.append('turn/start', { turn: 9 })
    runStartEvent(session)
    expect(teamStartedInTurn(session, 9)).toBe(true)
  })

  it('does not accept a team call recorded in another turn', () => {
    const session = headed('sess-evidence-other-turn')
    // Before this turn opened: a call the previous turn made.
    callEvent(session, 'grok_workflow', 8)
    session.append('turn/start', { turn: 9 })
    // After it opened, but carrying the earlier turn: the `turn` field decides, so
    // ordering alone cannot be what accepts it.
    callEvent(session, 'grok_open_block', 8)
    expect(teamStartedInTurn(session, 9)).toBe(false)
  })

  it('reads a malformed call as no evidence, without throwing', () => {
    const session = logOf([
      { type: 'turn/start', seq: 1, data: { turn: 4 } },
      { type: 'tool/call', seq: 2, data: null },
      { type: 'tool/call', seq: 3 },
      { type: 'tool/call', seq: 4, data: { turn: 4, name: null } },
      { type: 'tool/call', seq: 5, data: { turn: '4', name: 'grok_workflow' } },
      { type: 'tool/call', seq: 6, data: { turn: 4, name: 42 } },
      { type: 'tool/call', seq: 7, data: 'not an object' },
    ])
    expect(teamStartedInTurn(session, 4)).toBe(false)
  })

  it('does not refuse a turn that opened a block', async () => {
    // The defect end to end: the model did what the instruction asked — it formed a
    // team through the intake — and the gate refused the next step anyway.
    const session = headed('sess-gate-block')
    grokOn(session)
    const { dispatch } = harness()
    await dispatch({ agent: { session }, messages: [userMessage('开团把这件事做完')], turn: 5, step: 1 })
    session.append('turn/start', { turn: 5 })
    callEvent(session, 'grok_open_block', 5)
    const before = session.ownEvents().length
    expect((await dispatch({ agent: { session }, messages: [], turn: 5, step: 2 })).kind).toBe('enter')
    expect(session.ownEvents().length, 'no refusal row is written').toBe(before)
  })
})

/* ------------------------------------------------------------------ gate -- */

describe('the gate decision is a pure function of the flag and the evidence', () => {
  const flag = { turn: 5, step: 1, chars: 6 }

  it('holds its four answers', () => {
    expect(teamGateVerdict({ flag: undefined, turn: 5, step: 2, teamStarted: false })).toBe('none')
    expect(teamGateVerdict({ flag, turn: 5, step: 2, teamStarted: false })).toBe('refuse')
    expect(teamGateVerdict({ flag, turn: 5, step: 2, teamStarted: true })).toBe('none')
    expect(teamGateVerdict({ flag, turn: 6, step: 1, teamStarted: false })).toBe('stale')
    // The same step that set the flag never refuses itself.
    expect(teamGateVerdict({ flag, turn: 5, step: 1, teamStarted: false })).toBe('none')
  })
})

/* ----------------------------------------------------------------- config -- */

describe('the switch exists, defaults on, and is a real boolean', () => {
  it('defaults to on and reads back as a boolean', () => {
    expect(DEFAULT_FORCE_TEAM_ROUTING).toBe(true)
    expect(resolveConfig({}).forceTeamRouting).toBe(true)
    expect(resolveConfig({ forceTeamRouting: false } as never).forceTeamRouting).toBe(false)
    expect(() => resolveConfig({ forceTeamRouting: 'onn' } as never)).toThrow(/forceTeamRouting must be true or false/)
  })
})
