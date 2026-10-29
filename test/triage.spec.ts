import { describe, expect, it, vi } from 'vitest'
import type { WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { apply } from '../src/index.js'
import {
  askLine, chatBucket, chatReply, classifyTriage, detectLanguage, greetingLine, resolvePending,
  singleCallPrompt, tierNote, triageLine, triageSignals, TRIAGE_LIMITS,
} from '../src/triage.js'
import { callerTask, execution, task, verification } from './fixtures.js'
import { runWorkflowScript } from './helpers.js'

/* ------------------------------------------------------------- classifier -- */

describe('t52 front desk: the classifier is cheap, deterministic and explainable', () => {
  const triage = (text: string, extra: { pending?: boolean, ask?: boolean, mode?: 'full' | 'triage' } = {}) =>
    classifyTriage({ text, mode: extra.mode ?? 'triage', ask: extra.ask ?? true, ...extra.pending === true ? { pending: true } : {} })

  it('routes greetings and acknowledgements to the direct tier', () => {
    for (const text of ['你好', '您好！', '谢谢', 'thanks!', '在吗', '好的', '早上好']) {
      expect(triage(text).tier, text).toBe('chat')
    }
    // A question about the plugin itself is also answered without a team.
    expect(triage('你能做什么？').tier).toBe('chat')
  })

  it('routes one concrete action to the quick tier', () => {
    for (const text of ['算一下 5×6 等于多少，只回答数字', 'run npm test', '帮我看下 /tmp/x 里有什么']) {
      expect(triage(text).tier, text).toBe('fast')
    }
  })

  it('routes multi-part work and deliverables to the team', () => {
    for (const text of [
      '实现一个设置页并写测试',
      '帮我重构 run.ts 的超时逻辑，并补上回归测试',
      'Write a test suite for config.ts and run it',
    ]) {
      expect(triage(text).tier, text).toBe('team')
    }
    // Sequencing wins over shortness: two steps cannot be one call.
    expect(triage('先读一下 src/triage.ts 里的 TRIAGE_LIMITS，然后把两个阈值的意思写成三句说明').tier).toBe('team')
    // Length alone is a team signal: a paragraph is a plan, not a request.
    expect(triage('A'.repeat(TRIAGE_LIMITS.teamChars + 20)).tier).toBe('team')
  })

  it('asks instead of guessing when the target is only pointed at', () => {
    const verdict = triage('把这个弄一下')
    expect(verdict.tier).toBe('ask')
    expect(verdict.reason).toBe('ambiguous')
    expect(triage('把这个弄一下', { ask: false }).tier).toBe('team')
    expect(triage('把这个弄一下', { ask: false }).reason).toBe('ambiguous-escalate')
  })

  it('lets the user force the team from inside the message', () => {
    for (const text of ['用团队帮我改个 typo', '团队上', 'use the team for this']) {
      const verdict = triage(text)
      expect(verdict.tier, text).toBe('team')
      expect(verdict.reason).toBe('forced-team')
      expect(verdict.greeting).toBe(true)
    }
  })

  it('reads the answer to its own question before any other rule', () => {
    expect(triage('简单', { pending: true })).toMatchObject({ tier: 'fast', reason: 'pending-fast' })
    expect(triage('团队', { pending: true })).toMatchObject({ tier: 'team', reason: 'pending-team' })
    expect(triage('quick', { pending: true }).tier).toBe('fast')
    // A reply that ignores the question is classified normally, so the user is never stuck.
    expect(triage('你好', { pending: true }).reason).toBe('small-talk')
    expect(resolvePending('简单')).toBe('fast')
    expect(resolvePending('团队')).toBe('team')
    expect(resolvePending('随便')).toBeUndefined()
  })

  it('keeps the pre-t52 rule when the front desk is off', () => {
    const verdict = triage('你好', { mode: 'full' })
    expect(verdict).toMatchObject({ tier: 'team', reason: 'mode-full', greeting: false })
    // No tier line and no greeting in full mode: the answer text is 0.2.1's text.
    expect(triageLine(verdict)).toContain('档位：团队档')
  })

  it('is pure: no clock, no I/O, same text in the same verdict out', () => {
    const first = triage('帮我重构 run.ts 的超时逻辑，并补上回归测试')
    const second = triage('帮我重构 run.ts 的超时逻辑，并补上回归测试')
    expect(second).toEqual(first)
    expect(triageSignals('帮我重构 run.ts 的超时逻辑，并补上回归测试')).toMatchObject({
      deliverables: 2, multiStep: true, action: false, long: false, vague: false,
    })
  })
})

describe('t52 front desk: wording is bilingual and states the tier', () => {
  it('detects the language from the message', () => {
    expect(detectLanguage('你好')).toBe('zh')
    expect(detectLanguage('hello')).toBe('en')
    expect(detectLanguage('帮我看下 run.ts')).toBe('zh')
  })

  it('states tier and reason in the message language', () => {
    const zh = triageLine(classifyTriage({ text: '你好', mode: 'triage', ask: true }))
    const en = triageLine(classifyTriage({ text: 'hello', mode: 'triage', ask: true }))
    expect(zh).toMatch(/^档位：直答档 — 因为：/)
    expect(en).toMatch(/^Tier: direct — because /)
    expect(greetingLine('zh')).toContain('团队开工中')
    expect(greetingLine('en')).toContain('the team is on it')
    expect(askLine('zh')).toContain('简单 / 团队')
    expect(askLine('en')).toContain('quick')
  })

  it('tells the user which tier answered', () => {
    const chat = classifyTriage({ text: '你好', mode: 'triage', ask: true })
    const fast = classifyTriage({ text: '算一下 5×6 等于多少', mode: 'triage', ask: true })
    expect(tierNote(chat)).toContain('没有动用团队')
    expect(tierNote(fast)).toContain('只派了一个工人')
    // The English note follows the message language, not the Host locale.
    expect(tierNote(classifyTriage({ text: 'run npm test', mode: 'triage', ask: true }))).toContain('One worker was sent')
  })


  // t53 F1 (blocker): short questions and short two-step instructions were answered
  // from the greeting template, so no work happened. These are the fourteen directed
  // samples from that review, plus one English counterpart each; every one of them is
  // pinned here so the ordering cannot silently regress again.
  const f1 = (text: string, extra: { pending?: boolean } = {}) =>
    classifyTriage({ text, mode: 'triage', ask: true, ...extra.pending === true ? { pending: true } : {} })

  it('never answers a question from the greeting template (t53 F1)', () => {
    for (const text of ['为什么天空是蓝的', '今天几号', '解释幂等']) {
      const verdict = f1(text)
      expect(verdict.tier, text).toBe('fast')
      expect(verdict.reason, text).toBe('question')
    }
    for (const text of ['what is idempotency', 'how many files are in src/', 'what are the differences between HTTP/1.1 and HTTP/2?', 'can you tell me how many tests pass?']) {
      const verdict = f1(text)
      expect(verdict.tier, text).toBe('fast')
      expect(verdict.reason, text).toBe('question')
    }
  })

  it('routes short two-step instructions to the team (t53 F1)', () => {
    for (const text of ['先备份然后升级', '先建目录再拷文件', '备份数据库并通知我']) {
      const verdict = f1(text)
      expect(verdict.tier, text).toBe('team')
      expect(verdict.reason, text).toBe('multi-step')
    }
    // Enumerations and semicolons are the same signal as "先…然后…".
    for (const text of ['1) 备份 2) 升级', '一、备份 二、升级', '备份；升级；通知我']) {
      expect(f1(text).tier, text).toBe('team')
    }
  })

  it('answers a pointer that carries a path instead of asking about it (t53 F1)', () => {
    const verdict = f1('这个报错 src/triage.ts:42')
    expect(verdict.tier).toBe('fast')
    expect(verdict.reason).toBe('single-step')
    // The pointer with no named object still asks.
    expect(f1('改一下那个').tier).toBe('ask')
    // ...and a snippet or an error code counts as an anchor too.
    for (const text of ['这个报错 `TypeError: x is undefined`', '这个报错 ENOENT']) {
      expect(f1(text).tier, text).not.toBe('ask')
      expect(f1(text).tier, text).not.toBe('chat')
    }
  })

  it('does not crash on a bare choice word with no question waiting (t53 F1)', () => {
    for (const text of ['简单', '团队', 'simple', 'team']) {
      const verdict = f1(text)
      expect(verdict.tier, text).toBe('chat')
      expect(verdict.reason, text).toBe('stale-choice')
      // The answer says why nothing was dispatched, in the message's language.
      const reply = chatReply(verdict, text)
      expect(reply, text).toMatch(/没有待回答的分流问题|No front-desk question/)
    }
    // With a question waiting, the same words are read as its answer.
    expect(f1('简单', { pending: true }).tier).toBe('fast')
    expect(f1('团队', { pending: true }).tier).toBe('team')
  })


  // t55/t56 N3: the trailing "几" family, the 顿号 list and `并+回滚` were the three
  // gaps left after the F1 reorder; D-025 promises all three.
  it('treats a trailing 几 and its measure words as a question (t56 N3)', () => {
    for (const text of ['3+5等于几', '这个得几', '还剩几台机器', '有几条记录', '这是几', '还剩几', '5的平方是几', '这台机器几核']) {
      const verdict = f1(text)
      expect(verdict.tier, text).toBe('fast')
      expect(verdict.reason, text).toBe('question')
    }
    // A pointer inside a question is a lookup, not "insufficient clues".
    expect(f1('这个得几').tier).toBe('fast')
    expect(f1('这个怎么办').tier).toBe('fast')
    // ...but a pointer with nothing to look up still asks.
    expect(f1('改一下那个').tier).toBe('ask')
  })

  it('counts a 顿号 list and 并+回滚 as sequencing (t56 N3)', () => {
    expect(f1('改配置、重启、验证').tier).toBe('team')
    expect(f1('备份、升级后并回滚').tier).toBe('team')
    expect(f1('并回滚到上一版').tier).toBe('team')
    // Two items are usually one action described twice: still the quick tier.
    expect(f1('读、写').tier).toBe('fast')
  })


  // Found live: "is this repo using esm or cjs" has no "?" and none of the wh-words, so the
  // English question detector missed it and the front desk asked a question about a question.
  // Auxiliary-fronting is the general shape of an English yes/no question; sequencing is
  // checked before it, so "do this then that" still goes to the team.
  it('recognises an English yes/no question without a question mark (t56 N3)', () => {
    for (const text of ['is this repo using esm or cjs', 'is it safe to skip the lock file', 'does the build pass', 'can you add a flag', 'are there tests']) {
      const verdict = f1(text)
      expect(verdict.tier, text).toBe('fast')
      expect(verdict.reason, text).toBe('question')
    }
    expect(f1('do this then that').tier).toBe('team')
    expect(f1('the config is loaded at boot').reason).not.toBe('question')
  })


  // t57's three adversarial probes: every one of them is plainly a question to a reader and
  // none of them contains a dictionary word. The answer is question *shapes*, not more words —
  // A不A / A没A, 还是 as a choice, 谁 as a person question — each with the statement boundary
  // pinned so the shape rules cannot eat ordinary prose.
  it('recognises A不A / A没A, 还是 and 谁 as question shapes (t58 L3)', () => {
    for (const text of ['端口 8080 被谁占了', 'logs 里 500 多不多', '我该用 yarn 还是 pnpm', '有没有现成的脚本', '这样做对不对', '他是不是已经部署了', '这个文件被谁改过', '谁维护这个模块']) {
      const verdict = f1(text)
      expect(verdict.tier, text).toBe('fast')
      expect(verdict.reason, text).toBe('question')
    }
    // Boundaries: reported speech, the adverb "still", and a negated "still" are not questions.
    for (const text of ['他问是谁负责发布', '他还是走了', '他还是没有提交', '我还是觉得应该用 pnpm']) {
      expect(f1(text).reason, text).not.toBe('question')
    }
    // Two genuine alternatives stay questions even though they are short and verbless.
    expect(f1('备份还是升级').reason).toBe('question')
  })

  it('has a canned answer for every chat bucket', () => {
    const zh = (text: string) => chatReply(classifyTriage({ text, mode: 'triage', ask: true }), text)
    expect(zh('你好')).toContain('你好！我在。')
    expect(zh('谢谢')).toContain('不客气')
    expect(zh('好的')).toContain('收到')
    expect(zh('拜拜')).toContain('随时回来')
    expect(chatBucket('你能做什么')).toBe('about')
    expect(chatBucket('thanks')).toBe('thanks')
    expect(chatBucket('hello')).toBe('greeting')
  })

  it('asks the single child for exactly its tier', () => {
    const fast = singleCallPrompt(classifyTriage({ text: 'run npm test', mode: 'triage', ask: true }), 'run npm test')
    expect(fast).toContain('single worker')
    expect(fast).toContain('run npm test')
    // The plain call asks for a natural answer; the JSON demand belongs to the
    // structured retry only (see runSingleCall), so it must not leak into this one.
    expect(fast).not.toContain('{"reply"')
    expect(singleCallPrompt(classifyTriage({ text: 'run npm test', mode: 'triage', ask: true }), 'run npm test', true))
      .toContain('{"reply"')
    // ...and it must not forbid tools, because the structured answer rides on one
    // (measured on :3100: agentsStarted=1 with value={"reply":null}).
    expect(fast).not.toMatch(/do not call tools/i)
    expect(fast).toContain('run npm test')
  })
})

/* ------------------------------------------------------------ gate wiring -- */

interface EngineResult { value: unknown, stopReason: string, agentsStarted: number, error?: string }

class FakeRun {
  readonly id = 'run-triage'
  readonly meta: WorkflowStartRequest['meta']
  readonly dispose = vi.fn(async () => {})
  readonly result: Promise<EngineResult>
  private resolve!: (value: EngineResult) => void
  readonly cancel = vi.fn((_reason?: string) => {
    this.resolve({ value: null, stopReason: 'cancelled', agentsStarted: 0 })
  })

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
  readonly runs: FakeRun[] = []
  /** Value the single front-desk call returns, or a failure message. */
  reply: string | undefined = 'ok'
  singleCallError: string | undefined
  /** True when the first (schemaless) call returns nothing, so a retry is needed. */
  plainCallEmpty = false
  /** When true the team run completes with a real script result. */
  autoRunWorkflow = true

  async start(request: WorkflowStartRequest): Promise<FakeRun> {
    this.startCalls.push(request)
    const run = new FakeRun(request)
    this.runs.push(run)
    if (request.meta.name === 'Front desk') {
      const structured = request.script.includes('schema')
      if (this.singleCallError !== undefined) run.fail(this.singleCallError)
      else if (this.plainCallEmpty && !structured) run.complete({ reply: null })
      else run.complete({ reply: this.reply })
      return run
    }
    if (!this.autoRunWorkflow) return run
    const args = request.args as Record<string, unknown>
    const result = await runWorkflowScript(request.script, args, async (_prompt, options) => {
      if (options.label.startsWith('grok-worker-')) return execution('work done')
      if (options.label.startsWith('grok-verifier-')) return verification(task('a'))
      if (options.label === 'grok-planner') return { tasks: [callerTask('a')] }
      throw new Error(`unexpected label ${options.label}`)
    })
    run.complete(result.report)
    return run
  }
}

type Handler = (payload: unknown, next: () => Promise<unknown>) => Promise<unknown>

class FakeSession {
  readonly id = 'sess-triage'
  readonly header = {}
  ownEvents(): unknown[] { return [] }
  deriveMessages(): unknown[] { return [] }
  append(): number { return 0 }
}

class FakeAgent {
  readonly followups: UserMessage[] = []
  readonly session = new FakeSession()
  readonly followup = vi.fn((message: UserMessage) => { this.followups.push(message) })
  readonly whenIdle = vi.fn(async () => {})
}

class FakeContext {
  readonly handlers = new Map<string, Handler>()
  readonly engine = new FakeEngine()
  readonly workflowEngine = this.engine
  readonly warnings: string[] = []
  readonly tools = { register: () => () => {} }
  readonly systemPrompt = {
    section: () => () => {},
    getSectionOrder: () => 2600,
  }
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

function userMessage(text: string): UserMessage {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } as never }) as UserMessage
}

/** Deliver one message through the gate and return the text the plugin delivered. */
async function route(
  ctx: FakeContext,
  agent: FakeAgent,
  text: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  // One gate per context: `apply` again would install a second gate and reset the
  // front desk's pending-question memory, which is exactly what these tests read.
  if (ctx.handlers.size === 0) apply(ctx as never, { answerStrategy: 'relay', ...overrides })
  const messages = [userMessage(text)]
  const seen = agent.followups.length
  await ctx.preStep()(
    { agent, messages, turn: 1, step: 1, signal: new AbortController().signal },
    async () => ({ kind: 'enter', messages }),
  )
  // Wait for *this* call's answer: a second message on the same agent already has
  // the previous answer in the list.
  await vi.waitFor(() => {
    if (agent.followups.length <= seen) throw new Error('no answer delivered')
  })
  const content = agent.followups[agent.followups.length - 1]!.content as { type: string, text?: string }[]
  return content.map(block => block.text ?? '').join('')
}

describe('t52 front desk: each tier behaves as promised', () => {
  it('answers a greeting directly, without starting the team or a call', async () => {
    const ctx = new FakeContext()
    const text = await route(ctx, new FakeAgent(), '你好')
    // Instant by construction: the direct tier spends no model call at all.
    expect(ctx.engine.startCalls).toHaveLength(0)
    expect(text).toContain('档位：直答档')
    expect(text).toContain('你好！我在。')
    expect(text).toContain('没有动用团队')
    expect(text).not.toContain('Grok workflow:')
  })

  it('answers "what can you do" instead of deflecting it', async () => {
    const ctx = new FakeContext()
    const text = await route(ctx, new FakeAgent(), '你能做什么？')
    expect(text).toContain('档位：直答档')
    expect(text).toContain('前台')
    expect(text).toContain('用团队')
    expect(ctx.engine.startCalls).toHaveLength(0)
  })

  it('answers a simple task with one worker and says so', async () => {
    const ctx = new FakeContext()
    ctx.engine.reply = '5×6=30'
    const text = await route(ctx, new FakeAgent(), '算一下 5×6 等于多少，只回答数字')
    expect(ctx.engine.startCalls).toHaveLength(1)
    expect(ctx.engine.startCalls[0]!.script).toContain('single worker')
    expect(text).toContain('档位：快手档')
    expect(text).toContain('5×6=30')
    expect(text).toContain('只派了一个工人')
  })

  it('runs the whole workflow for a complex request and greets the user', async () => {
    const ctx = new FakeContext()
    const text = await route(ctx, new FakeAgent(), '帮我重构 run.ts 的超时逻辑，并补上回归测试')
    expect(ctx.engine.startCalls).toHaveLength(1)
    // The team tier uses the workflow script, not the one-call script.
    expect(ctx.engine.startCalls[0]!.meta.name).toMatch(/^grok-workflow/)
    expect(text).toContain('档位：团队档')
    expect(text).toContain('收到！团队开工中')
    expect(text).toContain('Grok workflow:')
  })

  it('asks one question instead of guessing, and remembers the answer', async () => {
    const ctx = new FakeContext()
    const agent = new FakeAgent()
    const asked = await route(ctx, agent, '把这个弄一下')
    expect(ctx.engine.startCalls).toHaveLength(0)
    expect(asked).toContain('档位：确认档')
    expect(asked).toContain('这个要动用团队吗？可回复：简单 / 团队')

    // "简单" answers the question: the next message runs the quick tier.
    ctx.engine.reply = 'done'
    const quick = await route(ctx, agent, '简单')
    expect(quick).toContain('档位：快手档')
    expect(quick).toContain('你刚才回答「简单」')
    expect(ctx.engine.startCalls).toHaveLength(1)

    // "团队" answers it the other way.
    const ctx2 = new FakeContext()
    const agent2 = new FakeAgent()
    await route(ctx2, agent2, '把这个弄一下')
    const team = await route(ctx2, agent2, '团队')
    expect(team).toContain('档位：团队档')
    expect(team).toContain('你刚才回答「团队」')
  })

  it('upgrades to the team when the message asks for it', async () => {
    const ctx = new FakeContext()
    const text = await route(ctx, new FakeAgent(), '用团队帮我改个 typo')
    expect(ctx.engine.startCalls[0]!.meta.name).toMatch(/^grok-workflow/)
    expect(text).toContain('你的消息里点名了团队')
  })

  it('retries once with a structured answer when the plain call returns nothing', async () => {
    const ctx = new FakeContext()
    ctx.engine.plainCallEmpty = true
    ctx.engine.reply = '30'
    const text = await route(ctx, new FakeAgent(), '算一下 5×6 等于多少')
    // Two calls, still the quick tier: one child each, never a hidden team run.
    expect(ctx.engine.startCalls).toHaveLength(2)
    expect(ctx.engine.startCalls.every(call => call.meta.name === 'Front desk')).toBe(true)
    expect(text).toContain('档位：快手档')
    expect(text).toContain('30')
  })

  it('states a failed cheap call instead of silently upgrading it', async () => {
    const ctx = new FakeContext()
    ctx.engine.singleCallError = 'provider exploded'
    const text = await route(ctx, new FakeAgent(), '算一下 5×6 等于多少')
    // The plain call and its structured retry both fail, and neither becomes a team run.
    expect(ctx.engine.startCalls).toHaveLength(2)
    expect(text).toContain('快手档')
    expect(text).toContain('could not answer')
    expect(text).toContain('provider exploded')
    // Never a hidden team run: the tier line would then be a lie.
    expect(ctx.engine.startCalls.every(call => call.meta.name === 'Front desk')).toBe(true)
  })

  it('keeps the pre-t52 text when the front desk is off', async () => {
    const ctx = new FakeContext()
    const text = await route(ctx, new FakeAgent(), '你好', { mode: 'full' })
    expect(ctx.engine.startCalls[0]!.meta.name).toMatch(/^grok-workflow/)
    expect(text).not.toContain('档位：')
    expect(text).not.toContain('团队开工中')
    expect(text).toContain('Grok workflow:')
  })
})
