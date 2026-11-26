import { Session } from '@deepseek-ai/dsh-session'
import { createSystemMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { describe, expect, it } from 'vitest'
import {
  TEAM_INSTRUCTION_EN,
  TEAM_INSTRUCTION_ZH,
  asksForTeam,
  installForceTeam,
  languageOf,
  teamInstruction,
} from '../src/force-team.js'
import { setMode } from '../src/mode.js'
import { DEFAULT_FORCE_TEAM_ROUTING, resolveConfig } from '../src/config.js'

/**
 * The forced team route: keyword → hard instruction, and nothing else.
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
 * - **No turn is ever refused.** The refusal half this route used to carry was deleted
 *   (D-169) after real-machine rounds showed it ended turns with no answer at all. The
 *   last describe pins the absence: a keyword turn that keeps stepping with no team
 *   tool at all passes every step, no refusal row is ever appended, and the listener
 *   never returns anything but the decision it was given.
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
    // A child's user message is the prompt its parent wrote: the parent's task text is
    // not a person asking for a team, and a child that got the instruction would nest
    // teams under a team.
    const session = headed('sess-inject-child')
    Object.assign(session, { header: { origin: 'subagent', delegationDepth: 1 } })
    grokOn(session)
    const messages = [userMessage('开团把这三件事做完')]
    const { dispatch } = harness({ grokDefault: 'on' })
    expect(((await dispatch({ agent: { session }, messages, turn: 5, step: 1 })) as { messages: UserMessage[] }).messages).toBe(messages)
    // And a deeper child gets its continuation steps through as well.
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

/* ------------------------------------------------------------- no refusal -- */

/**
 * The refusal half is gone, and its absence is the contract now.
 *
 * Real-machine rounds measured what the old gate did: a keyword turn that reached a
 * later step without having started a team was answered with a refusal, and the turn
 * ended with no answer at all (`turn/end` reason `blocked`) while the row the gate wrote
 * never reached the page. So the brake was deleted rather than retuned (D-169). What is
 * pinned below is that nothing replaced it: every step of a keyword turn enters, no
 * refusal row is ever appended, and a step with nothing to instruct gets back the very
 * decision the loop proposed.
 */
describe('no turn is ever refused, whatever the model does with the instruction', () => {
  it('runs a keyword turn to its third step with no team tool at all', async () => {
    const session = headed('sess-no-refusal-steps')
    grokOn(session)
    const { dispatch } = harness()
    const keywordMessage = userMessage('开团把这件事做完')
    const before = session.ownEvents().length
    session.append('turn/start', { turn: 5 })

    expect((await dispatch({ agent: { session }, messages: [keywordMessage], turn: 5, step: 1 })).kind).toBe('enter')
    // Steps 2 and 3 carry no keyword of their own and start no team: this is exactly
    // the shape the old gate refused, and it has to simply run.
    expect((await dispatch({ agent: { session }, messages: [], turn: 5, step: 2 })).kind).toBe('enter')
    expect((await dispatch({ agent: { session }, messages: [], turn: 5, step: 3 })).kind).toBe('enter')

    const written = session.ownEvents().slice(before) as unknown as
      Array<{ type: string, data?: { source?: { kind?: string } } }>
    const refusalRows = written.filter(row => row.data?.source?.kind === 'grok-workflow-force-team')
    expect(refusalRows, 'no refusal row is ever appended').toEqual([])
    // The user's own row keeps its words: nothing here rewrites the transcript.
    const userRows = written.filter(row => row.type === 'user/message') as unknown as
      Array<{ type: string, data: UserMessage }>
    for (const row of userRows) {
      expect(texts(row.data).join('\n')).not.toContain('这一轮要的是团队')
    }
  })

  it('never answers with anything but an `enter`', async () => {
    const session = headed('sess-no-refusal-kinds')
    grokOn(session)
    const { dispatch } = harness()
    session.append('turn/start', { turn: 5 })
    const keyword = userMessage('开团把这件事做完')
    // A keyword on the first step, a keyword on a later step, and a step with neither:
    // the refusal decision is gone from this listener, so nothing may come back as one.
    for (const payload of [
      { messages: [keyword], turn: 5, step: 1 },
      { messages: [keyword], turn: 5, step: 2 },
      { messages: [], turn: 5, step: 3 },
    ]) {
      const decision = await dispatch({ agent: { session }, ...payload })
      expect(decision.kind, `step ${payload.step}`).toBe('enter')
    }
  })

  it('hands back the same decision object when a continuation step has nothing to instruct', async () => {
    const session = headed('sess-no-refusal-identity')
    grokOn(session)
    const { dispatch } = harness()
    await dispatch({ agent: { session }, messages: [userMessage('组队做这件事')], turn: 5, step: 1 })
    session.append('turn/start', { turn: 5 })
    const given = { kind: 'enter', messages: [] } as Decision
    const decision = await dispatch({ agent: { session }, messages: [], turn: 5, step: 2 }, async () => given)
    // Identity, not equality: an inert step must not stand between the user and the
    // model at all, and a copy that happens to match would be a second authority.
    expect(decision).toBe(given)
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
