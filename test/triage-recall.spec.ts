import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { Session } from '@deepseek-ai/dsh-session'
import type { WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { frontDeskText } from '../src/answer.js'
import { resolveConfig } from '../src/config.js'
import { apply } from '../src/index.js'
import { installGate, memoryDocRoots, readMemoryDocs } from '../src/gate.js'
import { createActiveState } from '../src/run.js'
import {
  askLine, chatReply, classifyTriage, missingNote, recallFromPrior, recallPrompt, recalledNote,
  tierNote, triageLine, RECALL_LIMITS,
} from '../src/triage.js'
import type { RecallSource } from '../src/triage.js'

/**
 * "Look it up before asking" (`history_first_no_reask`, v0.5).
 *
 * The failure this file pins is the one observed in
 * `session-7e079b80-1a57-451b-aca4-795d24a14c4d`: the session already held the
 * research results, the follow-up pointed at them, and the answer was "please
 * repeat what you said". Two properties must hold, and both are deterministic —
 * no model, no network, no clock:
 *
 * | branch | promise |
 * | --- | --- |
 * | material exists (history, an earlier round's report, a memory file on disk) | answer from it; no reply may ask the user to restate anything |
 * | material really is absent | ask exactly once, name what is missing, invent nothing |
 * | no material at all (a fresh session) | the pre-existing question, byte for byte |
 */

/* ---------------------------------------------------------------- helpers -- */

/** A rendered report of an earlier round, in the shape `renderReport` writes. */
function earlierResearchReport(): string {
  return [
    'Grok workflow: COMPLETED',
    'Objective: 调研本机 8080 端口被谁占用、以及换端口要改哪个配置文件',
    'Confirmed evidence:',
    '- 8080 端口被 dsh-web 进程占用（证据：ss -ltnp | grep 8080 → pid 4021 dsh-web）',
    '- 换端口只改 cordis.patch.yml 里 web.port 一处即可，其余配置引用该值（证据：grep -rn "8080" cordis.patch.yml）',
    '- 端口被占没有启动报错，只表现为 GUI 打开白屏（证据：session-3d1c 的 stderr 中 EADDRINUSE 未出现）',
    'Final answer:',
    '8080 被 dsh-web 占用；换端口改 cordis.patch.yml 的 web.port 一处。',
  ].join('\n')
}

/** The follow-up that was met with "please restate it" in the observed session. */
const FAILING_FOLLOW_UP = '刚才那个端口的事你再说一下'

/** Phrases that make a reply the failure this task exists to remove. */
const RE_ASK_AGAIN = /重新(?:说明|描述|陈述)|请把.{0,8}(?:再说一遍|重说|重新说)|\brestate\b|\brepeat (?:what|the|it)\b/i

function userMessage(text: string, kind: 'user' | 'grok-workflow' = 'user'): UserMessage {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind } as never }) as UserMessage
}

/** A temporary `docs/knowledge` with one memory file, so the pass reads real bytes. */
function memoryDir(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'gw-recall-'))
  mkdirSync(join(root, 'docs', 'knowledge'), { recursive: true })
  for (const [name, body] of Object.entries(files)) writeFileSync(join(root, 'docs', 'knowledge', name), body, 'utf8')
  return join(root, 'docs', 'knowledge')
}

/* ------------------------------------------------------------ fake host --- */

class FakeRun {
  readonly id = 'run-recall'
  readonly meta: WorkflowStartRequest['meta']
  readonly dispose = vi.fn(async () => {})
  readonly result: Promise<{ value: unknown, stopReason: string, agentsStarted: number, error?: string }>
  private resolve!: (value: { value: unknown, stopReason: string, agentsStarted: number, error?: string }) => void
  readonly cancel = vi.fn(() => { this.resolve({ value: null, stopReason: 'cancelled', agentsStarted: 0 }) })

  constructor(request: WorkflowStartRequest) {
    this.meta = request.meta
    this.result = new Promise(resolve => { this.resolve = resolve })
  }

  complete(value: unknown): void {
    this.resolve({ value, stopReason: 'completed', agentsStarted: 1 })
  }

  fail(error: string): void {
    this.resolve({ value: null, stopReason: 'failed', agentsStarted: 1, error })
  }
}

class FakeEngine {
  readonly startCalls: WorkflowStartRequest[] = []
  reply = '端口 8080 被 dsh-web 占用；换端口改 cordis.patch.yml 的 web.port 一处。'

  async start(request: WorkflowStartRequest): Promise<FakeRun> {
    this.startCalls.push(request)
    const run = new FakeRun(request)
    if (request.meta.name === 'Front desk') {
      if (request.script.includes('schema')) run.complete({ reply: this.reply })
      else run.complete({ reply: this.reply })
      return run
    }
    run.fail('the team tier must not run for a looked-up ask')
    return run
  }
}

type Handler = (payload: unknown, next: () => Promise<unknown>) => Promise<unknown>

class FakeContext {
  readonly handlers = new Map<string, Handler>()
  readonly engine = new FakeEngine()
  readonly workflowEngine = this.engine
  readonly warnings: string[] = []
  readonly tools = { register: () => () => {} }
  readonly systemPrompt = { section: () => () => {}, getSectionOrder: () => 2600 }
  readonly logger = () => ({ warn: (message: string) => { this.warnings.push(message) } })

  on(event: string, handler: Handler): () => void {
    this.handlers.set(event, handler)
    return () => { this.handlers.delete(event) }
  }

  effect(installer: () => () => Promise<void> | void): () => Promise<void> | void {
    return installer()
  }

  preStep(): Handler {
    const handler = this.handlers.get('agent/pre-step')
    if (handler === undefined) throw new Error('gate did not register agent/pre-step')
    return handler
  }
}

class FakeAgent {
  readonly followups: UserMessage[] = []
  readonly followup = vi.fn((message: UserMessage) => { this.followups.push(message) })
  readonly whenIdle = vi.fn(async () => {})

  constructor(readonly session: unknown) {}
}

/**
 * Install the gate itself, with the memory roots this file controls.
 *
 * `apply()` (used by the other specs) would read the repository's own
 * `docs/knowledge`, which would make these tests depend on whatever the operator
 * wrote there. Passing an explicit root keeps every case deterministic, and
 * `[]` reproduces a machine with no memory files at all.
 */
function install(ctx: FakeContext, roots: readonly string[]): void {
  installGate({
    ctx: ctx as never,
    config: resolveConfig({ answerStrategy: 'relay', mode: 'triage', grokDefault: 'on' }),
    state: createActiveState(),
    logger: ctx.logger() as never,
    memoryDocRoots: roots,
  })
}

/** Deliver one message through the gate and return the text the plugin delivered. */
async function route(ctx: FakeContext, agent: FakeAgent, text: string): Promise<string> {
  const messages = [userMessage(text)]
  const seen = agent.followups.length
  await ctx.preStep()(
    { agent, messages, turn: 1, step: 1, signal: new AbortController().signal },
    async () => ({ kind: 'enter', messages }),
  )
  await vi.waitFor(() => {
    if (agent.followups.length <= seen) throw new Error('no answer delivered')
  })
  const content = agent.followups[agent.followups.length - 1]!.content as { type: string, text?: string }[]
  return content.map(block => block.text ?? '').join('')
}

/* ------------------------------------------------- recallFromPrior (pure) -- */

describe('recallFromPrior: search what is already on hand', () => {
  const history: RecallSource = {
    kind: 'history',
    locator: 'conversation so far',
    text: 'User: 调研本机 8080 端口被谁占用\nAssistant: 8080 端口被 dsh-web 进程占用；换端口改 cordis.patch.yml 的 web.port 一处。',
  }

  it('hits when the message names things the material contains', () => {
    const result = recallFromPrior({ text: '8080 端口的事和 web.port 配置', sources: [history] })
    expect(result.kind).toBe('hit')
    if (result.kind !== 'hit') return
    expect(result.reason).toBe('content-match')
    expect(result.locators).toEqual(['conversation so far'])
    expect(result.tokens).toContain('8080')
    expect(result.excerpt).toContain('dsh-web')
  })

  it('reports a miss when nothing exists to search', () => {
    const result = recallFromPrior({ text: '刚才那个端口的事你再说一下', sources: [] })
    expect(result).toMatchObject({ kind: 'miss', checked: [] })
  })

  it('reports a miss, with the anchors it looked for, when the material is unrelated', () => {
    const unrelated: RecallSource = { kind: 'history', locator: 'conversation so far', text: 'User: 你好\nAssistant: 你好！我在。' }
    const result = recallFromPrior({ text: '把那个题库的判分标准整理一下', sources: [unrelated] })
    expect(result.kind).toBe('miss')
    if (result.kind !== 'miss') return
    expect(result.checked).toEqual(['conversation so far'])
    expect(result.tokens.length).toBeGreaterThan(0)
  })

  it('hits a bare prior reference ("刚才那份") when the material is substantial', () => {
    const round: RecallSource = { kind: 'history', locator: 'earlier rounds in this session (1)', text: earlierResearchReport() }
    const result = recallFromPrior({ text: FAILING_FOLLOW_UP, sources: [round] })
    expect(result.kind).toBe('hit')
    if (result.kind !== 'hit') return
    expect(result.reason).toBe('prior-reference')
    expect(result.excerpt).toContain('dsh-web')
  })

  it('does not treat small talk as the thing a pointer points at', () => {
    const thin: RecallSource = { kind: 'history', locator: 'conversation so far', text: 'User: 你好\nAssistant: 你好！我在。' }
    const result = recallFromPrior({ text: FAILING_FOLLOW_UP, sources: [thin] })
    expect(result.kind).toBe('miss')
  })

  it('is deterministic: same material in, same result out', () => {
    const round: RecallSource = { kind: 'history', locator: 'earlier rounds in this session (1)', text: earlierResearchReport() }
    const first = recallFromPrior({ text: FAILING_FOLLOW_UP, sources: [round] })
    const second = recallFromPrior({ text: FAILING_FOLLOW_UP, sources: [round] })
    expect(second).toEqual(first)
  })

  it('keeps the excerpt bounded', () => {
    const long: RecallSource = { kind: 'memory', locator: '/tmp/long.md', text: `端口 ${'x'.repeat(20_000)}` }
    const result = recallFromPrior({ text: '刚才那份端口的记录', sources: [long] })
    expect(result.kind).toBe('hit')
    if (result.kind !== 'hit') return
    expect(result.excerpt.length).toBeLessThanOrEqual(RECALL_LIMITS.excerptChars + 1)
  })
})

/* ------------------------------------------ classifyTriage honours it ---- */

describe('classifyTriage: a hit answers, a miss still asks', () => {
  const round: RecallSource = { kind: 'history', locator: 'earlier rounds in this session (1)', text: earlierResearchReport() }
  const hit = recallFromPrior({ text: FAILING_FOLLOW_UP, sources: [round] })

  it('turns the question into an answer when the material exists', () => {
    const verdict = classifyTriage({ text: FAILING_FOLLOW_UP, mode: 'triage', ask: true, prior: hit })
    expect(verdict.tier).toBe('fast')
    expect(verdict.reason).toBe('recalled')
    expect(triageLine(verdict)).toContain('档位：快手档')
    expect(triageLine(verdict)).toContain('先回捞再作答')
  })

  it('keeps the question when the material was searched and is absent', () => {
    const miss = recallFromPrior({ text: FAILING_FOLLOW_UP, sources: [] })
    const verdict = classifyTriage({ text: FAILING_FOLLOW_UP, mode: 'triage', ask: true, prior: miss })
    expect(verdict.tier).toBe('ask')
    expect(verdict.reason).toBe('ambiguous')
  })

  it('is byte-identical when no pass ran at all (a fresh session)', () => {
    const without = classifyTriage({ text: FAILING_FOLLOW_UP, mode: 'triage', ask: true })
    const withMiss = classifyTriage({ text: FAILING_FOLLOW_UP, mode: 'triage', ask: true, prior: { kind: 'miss', tokens: [], checked: [] } })
    expect(without).toMatchObject({ tier: 'ask', reason: 'ambiguous' })
    expect(withMiss).toEqual(without)
  })

  it('answers from the material even when asking is switched off', () => {
    const verdict = classifyTriage({ text: FAILING_FOLLOW_UP, mode: 'triage', ask: false, prior: hit })
    expect(verdict.tier).toBe('fast')
    expect(verdict.reason).toBe('recalled')
  })

  it('states the reason in the message language', () => {
    // An English pointer with no path, code or verb is the ask tier; the same
    // material makes it an answer.
    const englishHit = recallFromPrior({
      text: 'that port finding, again please',
      sources: [{ kind: 'history', locator: 'conversation so far', text: 'The port 8080 finding: dsh-web holds it.' }],
    })
    expect(englishHit.kind).toBe('hit')
    const english = classifyTriage({ text: 'that port finding, again please', mode: 'triage', ask: true, prior: englishHit })
    expect(english.lang).toBe('en')
    expect(english.tier).toBe('fast')
    expect(english.reason).toBe('recalled')
    expect(triageLine(english)).toContain('Tier: quick')
  })
})

/* ------------------------------------------------- the two visible notes -- */

describe('the notes tell the user where the front desk looked', () => {
  it('names what is missing instead of asking for the whole task again', () => {
    const note = missingNote('zh', { kind: 'miss', tokens: ['端口', '配置'], checked: ['conversation so far', '/tmp/a.md'] })
    expect(note).toContain('先查后问')
    expect(note).toContain('2 处')
    expect(note).toContain('端口')
    expect(note).toContain('配置')
    expect(note).not.toMatch(/重新(?:说明|描述)|重述|rephrase|restate/i)
  })

  it('says an answer came from existing material, and where', () => {
    const note = recalledNote('zh', { kind: 'hit', reason: 'content-match', tokens: ['8080'], locators: ['/tmp/docs/knowledge/STATE.md'], excerpt: 'x' })
    expect(note).toContain('先查后答')
    expect(note).toContain('STATE.md')
  })

  it('names the earlier rounds in the message language', () => {
    const note = recalledNote('zh', {
      kind: 'hit', reason: 'prior-reference', tokens: ['端口'],
      locators: ['earlier rounds in this session (2)'], excerpt: 'x',
    })
    expect(note).toContain('本会话前序 2 轮报告')
    // A file path is shown as it is: it is the thing the user can open.
    const file = recalledNote('zh', {
      kind: 'hit', reason: 'content-match', tokens: ['端口'],
      locators: ['/work/docs/knowledge/VALIDATION.md'], excerpt: 'x',
    })
    expect(file).toContain('/work/docs/knowledge/VALIDATION.md')
  })

  it('gives the worker the material and forbids asking the user to repeat it', () => {
    const verdict = classifyTriage({ text: FAILING_FOLLOW_UP, mode: 'triage', ask: true })
    const prompt = recallPrompt(verdict, FAILING_FOLLOW_UP, {
      kind: 'hit', reason: 'prior-reference', tokens: ['端口'],
      locators: ['earlier rounds in this session (1)'], excerpt: '8080 端口被 dsh-web 占用',
    })
    expect(prompt).toContain('8080 端口被 dsh-web 占用')
    expect(prompt).toContain('never ask the user to repeat')
    expect(prompt).toContain('END MATERIAL')
  })
})

/* ------------------------- replay: session-7e079b80 failing shape -------- */

describe('replay: a follow-up about earlier research is answered, not bounced back', () => {
  it('before the fix (no earlier round): the same message is a clarification question', async () => {
    // The failing shape minus the material: the front desk cannot place the
    // pointer, so it asks. This is the behaviour the fix must replace *only*
    // when the material is actually there.
    const ctx = new FakeContext()
    install(ctx, [])
    const agent = new FakeAgent(Session.create('sess-replay-bare' as never))
    const text = await route(ctx, agent, FAILING_FOLLOW_UP)
    expect(text).toContain('档位：确认档')
    expect(text).toContain('这个要动用团队吗？可回复：简单 / 团队')
    // Nothing was consulted because nothing existed: no claim about memory either.
    expect(text).not.toContain('先查后问')
    expect(ctx.engine.startCalls).toHaveLength(0)
  })

  it('after the fix (earlier round has the research): answered from it, one worker, no re-asking', async () => {
    const ctx = new FakeContext()
    install(ctx, [])
    const session = Session.create('sess-replay-7e079b80' as never)
    // Round 1 happened: the user's words, then the validated report the plugin
    // wrote into the transcript — the durable copy of the research results.
    session.append('user/message', userMessage('调研本机 8080 端口被谁占用、以及换端口要改哪个配置文件'), { surfaceOp: 'append' })
    session.append('user/message', userMessage(earlierResearchReport(), 'grok-workflow'), { surfaceOp: 'append' })
    const agent = new FakeAgent(session)
    const text = await route(ctx, agent, FAILING_FOLLOW_UP)

    // Answered, not asked.
    expect(text).toContain('档位：快手档')
    expect(text).toContain('先回捞再作答')
    expect(text).not.toContain('这个要动用团队吗')
    expect(text).not.toMatch(RE_ASK_AGAIN)

    // Exactly one worker, and it was handed the material instead of a blank slate.
    expect(ctx.engine.startCalls).toHaveLength(1)
    const call = ctx.engine.startCalls[0]!
    expect(call.meta.name).toBe('Front desk')
    expect(call.script).toContain('dsh-web 进程占用')
    expect(call.script).toContain('web.port')
    expect(call.script).toContain('never ask the user to repeat')
    // ...and the answer says where it came from.
    expect(text).toContain('先查后答')
  })
})

/* ------------------------------- memory files already on disk ------------- */

describe('memory files on disk are read before asking', () => {
  it('answers from a docs/knowledge file that holds the answer', async () => {
    const root = memoryDir({
      'STATE.md': '# 状态\n\n端口与配置：8080 端口被 dsh-web 占用（ss -ltnp 观察）；换端口只改 cordis.patch.yml 的 web.port 一处。\n',
    })
    const ctx = new FakeContext()
    install(ctx, [root])
    const agent = new FakeAgent(Session.create('sess-recall-memory' as never))
    const text = await route(ctx, agent, '那个 8080 端口被占用的事再说一下')
    expect(text).toContain('档位：快手档')
    expect(text).toContain('先查后答')
    expect(text).not.toMatch(RE_ASK_AGAIN)
    expect(ctx.engine.startCalls).toHaveLength(1)
    expect(ctx.engine.startCalls[0]!.script).toContain('dsh-web')
  })

  it('still asks once, and says what is missing, when the memory files do not hold it', async () => {
    const root = memoryDir({ 'HANDOFF.md': '# 交接\n\n下一步：整理题库的判分标准，其余不变。\n' })
    const ctx = new FakeContext()
    install(ctx, [root])
    const session = Session.create('sess-recall-memory-miss' as never)
    // The user has already said something, so the question can point at where it looked.
    session.append('user/message', userMessage('先记一下：端口那件事待查'), { surfaceOp: 'append' })
    const agent = new FakeAgent(session)
    const text = await route(ctx, agent, '那个 8080 端口被占用的事再说一下')
    expect(text).toContain('档位：确认档')
    expect(text).toContain('这个要动用团队吗？可回复：简单 / 团队')
    expect(text).toContain('先查后问')
    expect(text).toContain('还缺')
    expect(text).not.toMatch(RE_ASK_AGAIN)
    // Nothing ran, so nothing was invented.
    expect(ctx.engine.startCalls).toHaveLength(0)
  })

  it('changes nothing when the memory directory does not exist', async () => {
    const ctx = new FakeContext()
    install(ctx, [join(tmpdir(), 'gw-recall-does-not-exist-8f21')])
    const agent = new FakeAgent(Session.create('sess-recall-no-docs' as never))
    const text = await route(ctx, agent, '刚才那个端口的事你再说一下')
    const verdict = classifyTriage({ text: '刚才那个端口的事你再说一下', mode: 'triage', ask: true })
    expect(text).toBe(frontDeskText([triageLine(verdict), '', askLine('zh')].join('\n')))
  })

  it('keeps a brand-new session\'s question byte-identical even with memory files present', async () => {
    // Nothing has been said in this session, so there is no earlier wording to point
    // at: the pre-existing question is already the honest one, and it is unchanged.
    const root = memoryDir({ 'HANDOFF.md': '# 交接\n\n下一步：整理题库的判分标准，其余不变。\n' })
    const ctx = new FakeContext()
    install(ctx, [root])
    const agent = new FakeAgent(Session.create('sess-recall-fresh-docs' as never))
    const text = await route(ctx, agent, '那个 8080 端口被占用的事再说一下')
    const verdict = classifyTriage({ text: '那个 8080 端口被占用的事再说一下', mode: 'triage', ask: true })
    expect(text).toBe(frontDeskText([triageLine(verdict), '', askLine('zh')].join('\n')))
    expect(ctx.engine.startCalls).toHaveLength(0)
  })

  it('leaves a greeting untouched even with memory files present', async () => {
    const root = memoryDir({ 'STATE.md': '# 状态\n\n端口 8080 相关记录。\n' })
    const ctx = new FakeContext()
    install(ctx, [root])
    const agent = new FakeAgent(Session.create('sess-recall-greeting' as never))
    const text = await route(ctx, agent, '你好')
    const verdict = classifyTriage({ text: '你好', mode: 'triage', ask: true })
    expect(text).toBe(frontDeskText([triageLine(verdict), '', chatReply(verdict, '你好'), '', tierNote(verdict)].join('\n')))
    expect(ctx.engine.startCalls).toHaveLength(0)
  })
})

/* ------------------------------------------- the disk reader itself ------ */

describe('readMemoryDocs and memoryDocRoots: bounded, redacted, never fatal', () => {
  it('reads markdown files in a deterministic order and skips everything else', () => {
    const root = memoryDir({ 'B.md': 'bee', 'A.md': 'ay', 'notes.txt': 'not markdown' })
    const docs = readMemoryDocs([root])
    expect(docs.map(doc => doc.path.split('/').pop())).toEqual(['A.md', 'B.md'])
  })

  it('redacts credentials and bounds each file', () => {
    const root = memoryDir({ 'A.md': `github_pat_abcdef0123456789abcdef ${'y'.repeat(9_000)}` })
    const docs = readMemoryDocs([root])
    expect(docs[0]!.text).not.toContain('github_pat_abcdef0123456789abcdef')
    expect(docs[0]!.text.length).toBeLessThanOrEqual(RECALL_LIMITS.fileChars + 1)
  })

  it('returns nothing for a missing or unreadable root instead of throwing', () => {
    expect(readMemoryDocs([join(tmpdir(), 'gw-recall-missing-c0de')])).toEqual([])
    expect(readMemoryDocs([])).toEqual([])
  })

  it('defaults to <cwd>/docs/knowledge and honours the environment override', () => {
    expect(memoryDocRoots({}, '/work')).toEqual([join('/work', 'docs', 'knowledge')])
    expect(memoryDocRoots({ GROK_WORKFLOW_KNOWLEDGE_DIRS: '/a:/b' }, '/work')).toEqual(['/a', '/b'])
    // An empty override falls back to the default rather than reading nothing.
    expect(memoryDocRoots({ GROK_WORKFLOW_KNOWLEDGE_DIRS: '  ' }, '/work')).toEqual([join('/work', 'docs', 'knowledge')])
  })
})

/* -------------------------------------------------------- apply() path --- */

describe('the installed plugin keeps its ordinary front desk', () => {
  it('applies without a memory override and answers a greeting with no call', async () => {
    // `apply()` is the production install path (index.ts): the default root is the
    // workspace's docs/knowledge, and a greeting must never reach the look-up pass.
    const ctx = new FakeContext()
    apply(ctx as never, { answerStrategy: 'relay', mode: 'triage', grokDefault: 'on' })
    const agent = new FakeAgent(Session.create('sess-recall-apply' as never))
    const text = await route(ctx, agent, '你好')
    expect(text).toContain('档位：直答档')
    expect(ctx.engine.startCalls).toHaveLength(0)
  })
})
