import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { assertWorkflowReport } from '../src/report.js'
import { buildWorkflowRequest, maxTotalAgentsFor, routeBudgetFor, WORKFLOW_SCRIPT } from '../src/script.js'
import {
  CHILD_CAUSE_UNKNOWN,
  CHILD_OUTCOME_LIMIT,
  childFailureClass,
  classifyChildFailureText,
  createChildOutcomeLog,
  failureClassForCode,
  reclassifyNullCollapses,
  type ChildOutcome,
} from '../src/child-outcomes.js'
import { activationFacts, childOutcomeCause, childOutcomeLog, teamWorkflowEngine } from '../src/team-engine.js'
import type { RoleName, WorkflowReport } from '../src/types.js'
import { createEngineHarness, type ChildAnswer, type ChildCall } from './engine-harness.js'
import { execution, task, verification } from './fixtures.js'
import { roleOf, taskFromPrompt } from './helpers.js'

/**
 * T1 — the null-semantics collapse.
 *
 * The published PTC engine folds "the child run died" and "the child answered
 * but never submitted a structured result" into the same `null`:
 * `WorkflowExecution.agent()` returns null for every `stopReason !== 'completed'`
 * and for a completed child whose `structured` capture is missing, and its host
 * `childResult()` forwards only `{output, stopReason, structured}` — the child's
 * own failure detail never reaches the script. The generated script therefore has
 * one shape to report both cases, and today it reports both as `format-error`.
 *
 * Measured cost (agent-99, 3691 child calls over 21 runs): 530 transport, auth
 * and timeout deaths were written down as format errors against 25 real ones.
 *
 * These cases drive the real engine over the harness's fake subagent provider, so
 * the collapse is the engine's own, not a mock of it. Each case seeds one child
 * terminal state and asks what the report says about it.
 */

/** First line of a child prompt, minus the ` · task title` suffix. */
function headOf(prompt: string): string {
  const cut = prompt.indexOf('\n')
  const line = (cut === -1 ? prompt : prompt.slice(0, cut)).trim()
  return line.split('·')[0]!.trim()
}

/** The role a child call belongs to, read the way the panel reads it. */
function roleOfCall(call: ChildCall): RoleName | undefined {
  return roleOf(headOf(call.prompt))
}

type Seed =
  | 'prose-only'
  | 'timeout'
  | 'forbidden'
  | 'cancelled'
  /**
   * The in-process death: the engine's result carries `stopReason: 'error'` and no
   * diagnostic at all, and the provider's words live only in the child's own
   * session log. This is the shape the published runtime produces for a spawn
   * child, and the one the earlier repair could only call `unknown`.
   */
  | 'session-refusal'
  /** The same death, but the log ended mid-turn: only the attempt carries it. */
  | 'session-attempt-only'
  /** A death with nothing recorded anywhere: the honest "cause unknown" case. */
  | 'dead-unknown'

/**
 * One child terminal state, in the engine's own vocabulary.
 *
 * `prose-only` is a child that finished normally and only talked: `completed`
 * with no `structured` capture. The other three are the deaths that were being
 * written down as format errors.
 */
function seedAnswer(seed: Seed) {
  const answer: Record<Seed, ChildAnswer> = {
    'prose-only': {
      output: [{ type: 'text', text: 'I did the work, but I never called the submit tool.' }],
      stopReason: 'completed',
    },
    timeout: {
      output: [{ type: 'text', text: '' }],
      stopReason: 'error',
      diagnostic: 'the child run timed out: its 1200000 ms stall budget expired',
    },
    forbidden: {
      output: [{ type: 'text', text: '' }],
      stopReason: 'error',
      diagnostic: '403 Forbidden: this api key is not authorized to use model w1',
    },
    cancelled: {
      output: [{ type: 'text', text: '' }],
      stopReason: 'aborted',
      diagnostic: 'the run was cancelled while this child was working',
    },
    'session-refusal': {
      output: [{ type: 'text', text: '' }],
      stopReason: 'error',
      // No `diagnostic`: that is the whole point of this case.
      sessionFailure: {
        message: '401: {"message":"virtual key is required. Provide a virtual key via the x-bf-vk header."}',
        code: 'AUTH',
        status: 401,
      },
    },
    'session-attempt-only': {
      output: [{ type: 'text', text: '' }],
      stopReason: 'error',
      sessionFailure: {
        message: '401: {"message":"virtual key is required."}',
        code: 'AUTH',
        shape: 'attempt-only',
      },
    },
    'dead-unknown': {
      output: [{ type: 'text', text: '' }],
      stopReason: 'error',
    },
  }
  return answer[seed]
}

/** Host config for these cases: one worker route, so one call path per attempt. */
function config(): ReturnType<typeof resolveConfig> {
  return resolveConfig({ maxConcurrency: 1, maxTasks: 4, roles: { worker: [{ model: 'w1' }] } })
}

interface SeedRun {
  report: ReturnType<typeof assertWorkflowReport>
  calls: ChildCall[]
  /** Rows the host repaired, as `src/run.ts` counts them. */
  rewritten: number
  /** The child settlements the engine seam recorded during this run. */
  outcomes: number
}

/**
 * Run one task through the real engine with a seeded worker child, and report
 * what the assembled report says about the failed attempt.
 *
 * A caller task keeps the plan out of the run (`plan.source = 'caller'`), so the
 * only children are the worker and — after a passing execution — its verifier.
 */
async function runSeed(seed: Seed): Promise<SeedRun> {
  const cfg = config()
  const objective = 'Ship the verified result'
  const tasks = [task('a')]
  const answer = (call: ChildCall): ChildAnswer => {
    const role = roleOfCall(call)
    if (role === 'worker') return seedAnswer(seed)
    if (role === 'verifier') return { structured: verification(taskFromPrompt(call.prompt)) }
    if (role === 'synthesizer') return { structured: { summary: 'ok' } }
    return { structured: execution('done') }
  }
  const harness = createEngineHarness(answer)
  try {
    const request = buildWorkflowRequest(objective, tasks, cfg)
    // The plugin's own seam: the twin engine over the harness's real engine class,
    // so the child terminal states recorded here are the engine's real ones.
    const outcomes = childOutcomeLog(harness.ctx as never)
    const engine = teamWorkflowEngine(harness.ctx as never, { warn() {} })
    const mark = outcomes.mark()
    const run = engine.start({
      script: WORKFLOW_SCRIPT,
      meta: { name: '任务团队', description: 'null-collapse run' },
      args: request.args,
      parent: { session: { header: {}, id: 'null-collapse-parent' } } as never,
      maxTotalAgents: maxTotalAgentsFor(tasks.length, cfg.maxRetries, routeBudgetFor(cfg)),
    })
    const result = await run.result
    await run.dispose()
    expect(result.stopReason).toBe('completed')
    const recorded = outcomes.since(mark)
    const report = assertWorkflowReport(result.value, objective, cfg)
    const rewritten = reclassifyNullCollapses(report, recorded)
    return { report, calls: harness.children, rewritten, outcomes: recorded.length }
  } finally {
    await harness.dispose()
  }
}

/** Worker prompts that are the same-attempt resubmit, not a fresh retry. */
function resubmits(calls: ChildCall[]): ChildCall[] {
  return calls.filter(call => roleOfCall(call) === 'worker' && call.prompt.includes('Do NOT redo work'))
}

describe('the engine seam records what each child settled as', () => {
  it('captures the stop reason and the diagnostic of a refused child', () => {
    return runSeed('forbidden').then(({ outcomes, rewritten }) => {
      // The ledger is the evidence the repair rests on: without a recorded death
      // the report could only be rewritten by guessing.
      expect(outcomes).toBeGreaterThan(0)
      expect(rewritten).toBeGreaterThan(0)
    })
  })

  /**
   * The spec-shape case. The published engine builds the activation spec flat
   * (`prompt`, `agentOptions` at the top level). Reading only a nested
   * `request.prompt` made the title empty and the route `inherit` on every real
   * run, which left the ledger with no role to group by — the repair then never
   * fired in production even though these unit cases were green. So the harness
   * now sends the flat shape and this case pins what the seam reads out of it.
   */
  it('reads the role, the attempt and the route out of the flat spec', async () => {
    const cfg = config()
    const harness = createEngineHarness(call => roleOfCall(call) === 'worker'
      ? { output: [{ type: 'text' as const, text: '' }], stopReason: 'error', diagnostic: 'the child run timed out after 1200000 ms' }
      : { structured: execution('done') })
    try {
      const request = buildWorkflowRequest('Ship the verified result', [task('a')], cfg)
      const outcomes = childOutcomeLog(harness.ctx as never)
      const engine = teamWorkflowEngine(harness.ctx as never, { warn() {} })
      const mark = outcomes.mark()
      const run = engine.start({
        script: WORKFLOW_SCRIPT,
        meta: { name: '任务团队', description: 'flat spec' },
        args: request.args,
        parent: { session: { header: {}, id: 'flat-spec-parent' } } as never,
        maxTotalAgents: maxTotalAgentsFor(1, cfg.maxRetries, routeBudgetFor(cfg)),
      })
      await run.result
      await run.dispose()
      const worker = outcomes.since(mark).find(entry => entry.role === 'worker')
      expect(worker, 'the seam recorded no worker outcome, so the title was not read').toBeDefined()
      expect(worker!.attempt).toBe(1)
      expect(worker!.route).toBe('w1')
      expect(worker!.stopReason).toBe('error')
      expect(String(worker!.diagnostic)).toContain('timed out')
    } finally {
      await harness.dispose()
    }
  })

  /**
   * Both spec shapes are real, and the seam must read both.
   *
   * The published engine builds the activation spec flat; the older host mirror
   * nested the same two fields under `request`. The seam read only the nested one
   * for a whole release, so every production child came back with an empty title
   * and an `inherit` route while the unit cases (whose fake sent the nested shape)
   * were green. These two cases are the same assertions against each shape.
   */
  it('reads the title and the route out of the flat spec', () => {
    const facts = activationFacts({
      label: 'engine label',
      prompt: [{ type: 'text', text: '执行 · Task a\nbody of the prompt' }],
      agentOptions: { provider: 'bifrost', model: 'w1' },
    })
    expect(facts.title).toBe('执行 · Task a')
    expect(facts.route).toBe('bifrost/w1')
  })

  it('reads the title and the route out of the nested spec', () => {
    const facts = activationFacts({
      label: 'engine label',
      request: {
        prompt: [{ type: 'text', text: '检查 · Task a\nbody of the prompt' }],
        agentOptions: { provider: 'bifrost', model: 'w1' },
      },
    })
    expect(facts.title).toBe('检查 · Task a')
    expect(facts.route).toBe('bifrost/w1')
  })

  it('falls back to the route label the engine uses when nothing was asked for', () => {
    expect(activationFacts({ label: 'x', prompt: [{ type: 'text', text: '执行 · a' }] }).route).toBe('inherit')
    expect(activationFacts({ label: 'x', request: { prompt: [] } }).route).toBe('inherit')
  })

  it('captures nothing to repair when every child finishes cleanly', async () => {    const cfg = config()
    const objective = 'Ship the verified result'
    const harness = createEngineHarness(call => {
      const role = roleOfCall(call)
      if (role === 'worker') return { structured: execution('done') }
      if (role === 'verifier') return { structured: verification(taskFromPrompt(call.prompt)) }
      return { structured: execution('done') }
    })
    try {
      const request = buildWorkflowRequest(objective, [task('a')], cfg)
      const outcomes = childOutcomeLog(harness.ctx as never)
      const engine = teamWorkflowEngine(harness.ctx as never, { warn() {} })
      const mark = outcomes.mark()
      const run = engine.start({
        script: WORKFLOW_SCRIPT,
        meta: { name: '任务团队', description: 'clean run' },
        args: request.args,
        parent: { session: { header: {}, id: 'null-collapse-parent' } } as never,
        maxTotalAgents: maxTotalAgentsFor(1, cfg.maxRetries, routeBudgetFor(cfg)),
      })
      const result = await run.result
      await run.dispose()
      expect(result.stopReason).toBe('completed')
      const report = assertWorkflowReport(result.value, objective, cfg)
      expect(report.status).toBe('completed')
      expect(reclassifyNullCollapses(report, outcomes.since(mark))).toBe(0)
      // Nothing to rewrite, and nothing rewritten: a healthy run's report is the
      // script's own, byte for byte.
      expect(report.routes.filter(entry => entry.failureClass !== undefined)).toEqual([])
    } finally {
      await harness.dispose()
    }
  })
})

describe('a child that died is not reported as a format error', () => {
  it('keeps format-error for a child that finished without submitting, and still resubmits', async () => {
    const { report, calls, rewritten } = await runSeed('prose-only')
    const attempt = report.tasks[0]?.attempts[0]
    expect(attempt?.failure?.class).toBe('format-error')
    expect(attempt?.failure?.reason).toContain('no valid structured result')
    // The genuine format gap is the one case the repair must leave alone.
    expect(rewritten).toBe(0)
    // The prose-only child is the case the resubmit exists for: it already holds
    // the work, it only failed to submit it.
    expect(resubmits(calls).length).toBeGreaterThan(0)
  })

  it('reports a timed-out child as a timeout, not a format error', async () => {
    const { report, rewritten } = await runSeed('timeout')
    expect(rewritten).toBeGreaterThan(0)
    const attempt = report.tasks[0]?.attempts[0]
    expect(attempt?.failure?.class).toBe('timeout')
    expect(attempt?.failure?.category).toBe('infrastructure')
    expect(attempt?.failure?.reason).not.toContain('no valid structured result')
  })

  it('reports a 403 child as model-unavailable, not a re-sendable format error', async () => {
    const { report, rewritten } = await runSeed('forbidden')
    expect(rewritten).toBeGreaterThan(0)
    const attempt = report.tasks[0]?.attempts[0]
    expect(attempt?.failure?.class).toBe('model-unavailable')
    expect(attempt?.failure?.category).toBe('infrastructure')
    // The route trail is the record a maintainer reads: no route may claim a
    // format error for a child the provider refused to serve.
    expect(report.routes.filter(entry => entry.failureClass === 'format-error')).toEqual([])
    expect(report.routes.some(entry => entry.failureClass === 'model-unavailable')).toBe(true)
  })

  /**
   * The in-process death. The engine's result carries `stopReason: 'error'` and no
   * diagnostic (`@deepseek-ai/dsh-subagent` `captureLocalResult`), so the only
   * place the provider's words exist is the child's own session log — the
   * `turn/end` the child committed, whose reason is the provider's `LlmFailure`
   * verbatim. Measured on this machine (round 077): four real 401 child deaths
   * reached the report as `the child run ended \`error\``.
   */
  it('names the provider failure the child session recorded, with no diagnostic on the result', async () => {
    const { report, rewritten } = await runSeed('session-refusal')
    expect(rewritten).toBeGreaterThan(0)
    const failure = report.tasks[0]?.attempts[0]?.failure
    expect(failure?.class).toBe('model-unavailable')
    expect(failure?.category).toBe('infrastructure')
    expect(failure?.reason).toContain('virtual key is required')
    expect(failure?.reason).not.toContain('no valid structured result')
    // The route trail is the record a maintainer reads: no row may still claim a
    // format error for a child the gateway refused.
    expect(report.routes.filter(entry => entry.failureClass === 'format-error')).toEqual([])
  })

  it('reads the failure out of the attempt when the child died before its turn closed', async () => {
    const { report } = await runSeed('session-attempt-only')
    const failure = report.tasks[0]?.attempts[0]?.failure
    expect(failure?.class).toBe('model-unavailable')
    expect(failure?.reason).toContain('virtual key is required')
  })

  /**
   * A death with nothing recorded is still not a format error, and it does not
   * pretend to know more than it does: the report says the child ended abnormally
   * and that the cause was not recorded.
   */
  it('says the cause is unknown instead of inventing a missing form', async () => {
    const { report, rewritten } = await runSeed('dead-unknown')
    expect(rewritten).toBeGreaterThan(0)
    const failure = report.tasks[0]?.attempts[0]?.failure
    expect(failure?.class).toBe('unknown')
    expect(failure?.reason).toContain(CHILD_CAUSE_UNKNOWN)
    expect(failure?.reason).not.toContain('no valid structured result')
    expect(report.incomplete[0]?.reason).not.toContain('no valid structured result')
  })

  it('reports a cancelled child as cancelled', async () => {
    const { report, rewritten } = await runSeed('cancelled')
    expect(rewritten).toBeGreaterThan(0)
    expect(report.tasks[0]?.attempts[0]?.failure?.class).toBe('cancelled')
    expect(report.tasks[0]?.attempts[0]?.failure?.category).toBe('cancelled')
  })
})

describe('the seeded death reaches the report with its own words', () => {
  it('names the cause instead of the missing form', async () => {
    const { report } = await runSeed('forbidden')
    const reason = report.tasks[0]?.attempts[0]?.failure?.reason ?? ''
    expect(reason).toMatch(/403|not authorized|refused/i)
  })
})

/**
 * The host classifier is a mirror of the generated script's own table: the script
 * cannot be imported (it is source text evaluated in the engine's realm), so the
 * function is lifted out of `WORKFLOW_SCRIPT` and the two are compared verdict by
 * verdict. A class that changes on one side only would make the reason a child
 * prints and the class the host writes disagree about the same event.
 */
function guestClassifier(): (value: unknown) => string {
  const start = WORKFLOW_SCRIPT.indexOf('function classifyFailureText(')
  expect(start).toBeGreaterThan(-1)
  const end = WORKFLOW_SCRIPT.indexOf('\n}\n', start)
  expect(end).toBeGreaterThan(start)
  const source = WORKFLOW_SCRIPT.slice(start, end + 2)
  // eslint-disable-next-line no-new-func -- the script itself is evaluated the same way.
  return new Function(`${source}\nreturn classifyFailureText`)() as (value: unknown) => string
}

describe('the host failure table mirrors the script team table', () => {
  const messages = [
    '429 Too Many Requests',
    'rate limited by the provider',
    'resource_exhausted',
    '503 Service Unavailable',
    '502 bad gateway',
    'overloaded',
    'ECONNRESET from the socket',
    'network error while fetching',
    'connection refused',
    'child run timed out after 1200000 ms',
    'deadline exceeded',
    'model gpt-x not found',
    'no adapter for that provider',
    '403 Forbidden: this api key is not authorized',
    '401 Unauthorized',
    'invalid api key',
    'permission denied for this model',
    'structured_output missing',
    "Expected ',' or '}' after property value in JSON",
    'the child returned prose and never submitted',
    '',
  ]

  it('agrees with the generated script on every message', () => {
    const guest = guestClassifier()
    for (const message of messages) {
      expect(classifyChildFailureText(message), message).toBe(guest(message))
    }
  })

  it('files a credential refusal as model-unavailable on both sides', () => {
    expect(classifyChildFailureText('403 Forbidden')).toBe('model-unavailable')
    expect(guestClassifier()('403 Forbidden')).toBe('model-unavailable')
  })

  it('reads the engine vocabulary the way the child meant it', () => {
    expect(childFailureClass({ stopReason: 'completed' })).toBe('format-error')
    expect(childFailureClass({ stopReason: 'aborted' })).toBe('cancelled')
    expect(childFailureClass({ stopReason: 'error', diagnostic: 'child run timed out' })).toBe('timeout')
    expect(childFailureClass({ stopReason: 'error', diagnostic: '403 Forbidden' })).toBe('model-unavailable')
    expect(childFailureClass({ stopReason: 'error' })).toBe('unknown')
    expect(childFailureClass({ stopReason: 'max-tokens' })).toBe('unknown')
    expect(childFailureClass({ stopReason: 'rejected', diagnostic: 'fetch failed' })).toBe('connection')
  })
})

describe('reclassifyNullCollapses', () => {
  const COLLAPSE = 'worker returned no valid structured result (structured output missing or unparsable)'

  function reportFixture(): WorkflowReport {
    const composite = `worker failed on every route: [format-error] ${COLLAPSE}`
    return {
      schemaVersion: 'grok-workflow/v1',
      status: 'failed',
      objective: 'Ship it',
      plan: { source: 'caller', tasks: [], failure: null },
      tasks: [{
        id: 'a',
        title: 'Task a',
        objective: 'Do a',
        expectedOutput: 'A',
        acceptanceCriteria: ['a works'],
        context: '',
        constraints: [],
        writesPaths: null,
        status: 'failed',
        attempts: [{
          attempt: 1,
          execution: null,
          verification: null,
          passed: false,
          failure: { class: 'format-error', reason: COLLAPSE, category: 'infrastructure' },
          error: composite,
        }],
        error: composite,
      }],
      confirmed: [],
      incomplete: [{ taskId: 'a', reason: composite, category: 'infrastructure' }],
      errors: [{ phase: 'Attempt 1', message: `a: ${composite}`, category: 'infrastructure' }],
      uncertainties: [],
      routes: [{ role: 'worker', chainIndex: 0, route: 'inherit', attempt: 1, outcome: 'failed', failureClass: 'format-error', reason: COLLAPSE }],
      routing: { planner: [], worker: ['inherit'], verifier: [], supervisor: [], synthesizer: [] },
      synthesis: { mode: 'deterministic' },
      limits: { maxConcurrency: 1, maxRetries: 1, maxTasks: 4, maxTotalAgents: 10 },
    }
  }

  function outcome(overrides: Partial<ChildOutcome> = {}): ChildOutcome {
    return { seq: 1, role: 'worker', attempt: 1, stopReason: 'error', diagnostic: 'child run timed out', ...overrides }
  }

  it('rewrites the row, its prose and its category together', () => {
    const report = reportFixture()
    expect(reclassifyNullCollapses(report, [outcome()])).toBe(2)
    expect(report.tasks[0]!.attempts[0]!.failure).toMatchObject({ class: 'timeout', category: 'infrastructure' })
    expect(report.tasks[0]!.attempts[0]!.failure!.reason).toContain('the child run timed out')
    expect(report.routes[0]!.failureClass).toBe('timeout')
    // The prose a reader sees is the same sentence that was just repaired: a stale
    // "worker failed on every route: [format-error]" would read as the old claim.
    expect(report.incomplete[0]!.reason).toContain('[timeout]')
    expect(report.incomplete[0]!.reason).not.toContain('no valid structured result')
    expect(report.errors[0]!.message).toContain('[timeout]')
    expect(report.tasks[0]!.error).toContain('[timeout]')
  })

  /**
   * The delivered answer carries its own copy of the rows.
   *
   * The generated script copies the *pre-repair* reason into its report-notes
   * block and the delivery prints that block to the user, so repairing only the
   * structured rows left the visible sentence claiming the old cause. Measured on
   * the release soak (round 077): every structured row had been repaired while the
   * delivered line still said "no valid structured result". The bullet is rebuilt
   * by task id, because the sentence a reader sees has drifted from the row it came
   * from (the delivery strips `route: [format-error]`, a model draft may paraphrase
   * it), so a sentence-level match is the wrong key.
   */
  it("rebuilds the answer's report-notes bullet by task id when its wording drifted", () => {
    const report = reportFixture()
    report.synthesis = {
      mode: 'model',
      summary: [
        '答案：这次没做成。',
        '',
        '报告附注（以下为报告事实，摘要不改写）：',
        '仍未完成（来自报告）：',
        '- 任务 a：worker failed on every worker returned an invalid result',
        '下一步：把没做成的部分单独再发一次。',
      ].join('\n'),
    }
    expect(reclassifyNullCollapses(report, [outcome()])).toBe(2)
    const summary = report.synthesis.summary ?? ''
    expect(summary).not.toContain('invalid result')
    expect(summary).toContain('- 任务 a：')
    expect(summary).toContain('the child run timed out')
    // Everything around the bullet is left exactly as the answer wrote it.
    expect(summary.startsWith('答案：这次没做成。')).toBe(true)
    expect(summary.endsWith('下一步：把没做成的部分单独再发一次。')).toBe(true)
  })

  it('rebuilds the English report-notes block the same way', () => {
    const report = reportFixture()
    report.synthesis = {
      mode: 'model',
      summary: [
        'Answer: it did not finish.',
        'Report notes (facts from the report, not rewritten):',
        'Still incomplete (from the report):',
        '- task a: the worker produced an unreadable answer',
      ].join('\n'),
    }
    expect(reclassifyNullCollapses(report, [outcome()])).toBe(2)
    const summary = report.synthesis.summary ?? ''
    expect(summary).not.toContain('unreadable answer')
    expect(summary).toContain('- task a: worker call produced no result: the child run timed out')
  })

  it('leaves the answer untouched when no row was repaired', () => {
    const report = reportFixture()
    const summary = 'Answer.\nStill incomplete (from the report):\n- task a: whatever the script wrote'
    report.synthesis = { mode: 'model', summary }
    expect(reclassifyNullCollapses(report, [])).toBe(0)
    expect(report.synthesis.summary).toBe(summary)
  })

  it('declines when the children of one role died of different causes', () => {
    const report = reportFixture()
    const rewritten = reclassifyNullCollapses(report, [
      outcome({ seq: 1, diagnostic: 'child run timed out' }),
      outcome({ seq: 2, diagnostic: '403 Forbidden' }),
    ])
    expect(rewritten).toBe(0)
    expect(report.tasks[0]!.attempts[0]!.failure!.class).toBe('format-error')
  })

  it('declines while one child of that role really did finish without submitting', () => {
    const report = reportFixture()
    const rewritten = reclassifyNullCollapses(report, [
      outcome({ seq: 1, diagnostic: '403 Forbidden' }),
      { seq: 2, role: 'worker', attempt: 1, stopReason: 'completed' },
    ])
    expect(rewritten).toBe(0)
  })

  it('declines when the run recorded nothing for that role', () => {
    const report = reportFixture()
    expect(reclassifyNullCollapses(report, [])).toBe(0)
    expect(reclassifyNullCollapses(report, [outcome({ role: 'verifier' })])).toBe(0)
  })

  it('repairs a planner failure the same way', () => {
    const report = reportFixture()
    report.plan.failure = { class: 'format-error', reason: 'planner returned no valid structured result', category: 'infrastructure' }
    report.plan.error = 'planner returned no valid structured result'
    const rewritten = reclassifyNullCollapses(report, [
      outcome({ role: 'planner', stopReason: 'aborted', diagnostic: 'the run was cancelled' }),
    ])
    expect(rewritten).toBe(1)
    expect(report.plan.failure.class).toBe('cancelled')
    expect(report.plan.failure.category).toBe('cancelled')
    expect(report.plan.error).toContain('the child run was cancelled')
  })
})

describe('the child-outcome log', () => {
  it('answers since() from a mark and of() by child id', () => {
    const log = createChildOutcomeLog()
    log.add({ childId: 'c1', role: 'worker', attempt: 1, stopReason: 'completed' })
    const mark = log.mark()
    log.add({ childId: 'c2', role: 'worker', attempt: 1, stopReason: 'error', diagnostic: '403 Forbidden' })
    const since = log.since(mark)
    expect(since).toHaveLength(1)
    expect(since[0]!.childId).toBe('c2')
    expect(log.of('c1')!.stopReason).toBe('completed')
    expect(log.of('nope')).toBeUndefined()
  })

  it('stays bounded and keeps since() honest after eviction', () => {
    const log = createChildOutcomeLog()
    const before = log.mark()
    for (let index = 0; index < CHILD_OUTCOME_LIMIT + 20; index += 1) {
      log.add({ childId: `c${index}`, stopReason: 'completed' })
    }
    expect(log.since(before)).toHaveLength(CHILD_OUTCOME_LIMIT)
    expect(log.of('c0')).toBeUndefined()
    expect(log.of(`c${CHILD_OUTCOME_LIMIT + 19}`)).toBeDefined()
  })

  it('names a child cause for the memory archive, or nothing when unobserved', () => {
    const log = createChildOutcomeLog()
    log.add({ childId: 'c9', stopReason: 'error', diagnostic: '403 Forbidden' })
    expect(childOutcomeCause(log, 'c9')).toContain('403 Forbidden')
    expect(childOutcomeCause(log, 'missing')).toBeUndefined()
    expect(childOutcomeCause(log, undefined)).toBeUndefined()
  })
})

describe("the memory archive names the cause, not just the empty transcript", () => {
  it('appends the child terminal state to the fallback summary', async () => {
    const { mkdtemp } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { createMemoryArchiver } = await import('../src/memory/recorder.js')
    const { readArchive } = await import('../src/memory/archive.js')
    const dir = await mkdtemp(join(tmpdir(), 'grok-null-collapse-'))
    // A context with no reachable session store: the child left no text, which is
    // exactly the case whose summary used to blame the transcript.
    const ctx = { sessions: undefined, get: () => undefined }
    const archiver = createMemoryArchiver({
      ctx: ctx as never,
      logger: { warn: () => {} },
      dir,
      childCause: childId => (childId === 'child-7' ? 'the child run timed out (1200000 ms stall budget)' : undefined),
    })
    try {
      archiver.adopt('run-9', 'null-collapse')
      archiver.agentStart('run-9', { seq: 1, label: '执行', childId: 'child-7' })
      archiver.agentEnd('run-9', { seq: 1, outcome: 'failed' })
      archiver.agentStart('run-9', { seq: 2, label: '检查', childId: 'child-8' })
      archiver.agentEnd('run-9', { seq: 2, outcome: 'failed' })
      const stored = readArchive({ dir })
      const withCause = stored.find(item => item.id === 'run:run-9:agent:1')
      const withoutCause = stored.find(item => item.id === 'run:run-9:agent:2')
      expect(withCause?.summary).toContain('the child run timed out')
      expect(withoutCause?.summary).toContain('its child session was not reachable')
      expect(withoutCause?.summary).not.toContain('the child run timed out')
    } finally {
      await rmDir(dir)
    }
  })
})

/** Remove a scratch directory without letting a failure mask the assertion above. */
async function rmDir(dir: string): Promise<void> {
  const { rm } = await import('node:fs/promises')
  await rm(dir, { recursive: true, force: true })
}
