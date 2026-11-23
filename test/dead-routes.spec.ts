import { describe, expect, it } from 'vitest'
import { CHILD_DEATH_FAMILIES, CHILD_DEATH_MARKER, childDeathRejection } from '../src/child-outcomes.js'
import { resolveConfig } from '../src/config.js'
import { deliverReport } from '../src/delivery/index.js'
import { parseMemberLabel } from '../src/naming.js'
import { assertWorkflowReport, renderReport } from '../src/report.js'
import { buildWorkflowRequest, WORKFLOW_SCRIPT } from '../src/script.js'
import { teamWorkflowEngine } from '../src/team-engine.js'
import type { WorkflowReport } from '../src/types.js'
import { createEngineHarness, type ChildAnswer, type ChildCall } from './engine-harness.js'
import { execution, task, verification } from './fixtures.js'
import { roleOf, runWorkflowScript, taskFromPrompt, type ScriptAgent } from './helpers.js'

/**
 * Dead routes: a route that fails the same *transport* family twice in a row is
 * moved behind every live route for the rest of the run.
 *
 * The point of the table is cost, not blame: a run with one dead route in a
 * three-route chain used to spend one child call per task (and one child-call
 * timeout, when the route hangs instead of refusing) on a route that had
 * already shown it cannot answer. The table is deliberately narrow — only the
 * four families where "try this again" is a reasonable thing to think about
 * count, and a credential refusal is not one of them (the next call would be
 * refused identically, and the fix is a key, not a route).
 */

const OBJECTIVE = 'Ship the verified result'

function args(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    objective: OBJECTIVE,
    tasks: [task('a')],
    maxConcurrency: 1,
    maxRetries: 0,
    maxTasks: 6,
    maxTotalAgents: 60,
    childTimeoutMs: 7_200_000,
    roles: {},
    synthesis: 'deterministic',
    ...overrides,
  }
}

/** The built-in switching policy minus the 429 checkbox (the gate this table follows). */
const SWITCH_WITHOUT_RATE_LIMIT = ['server-error', 'connection', 'timeout', 'model-unavailable', 'format-error', 'agent-start-failed']

/** Every model a run actually called, in call order (the route the call was placed on). */
function modelsCalled(run: { calls: { model?: string }[] }): string[] {
  return run.calls.map(call => call.model ?? 'inherit')
}

describe('dead routes: the family table and its threshold', () => {
  it('kills a route after two consecutive server errors and records it in the report', async () => {
    const agent: ScriptAgent = async (prompt, options) => {
      if (roleOf(options.label) === 'worker') {
        if (options.model === 'w1') throw new Error('502 bad gateway from the provider')
        return execution('done')
      }
      return verification(taskFromPrompt(prompt))
    }
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({ tasks: [task('a'), task('b')], roles: { worker: [{ model: 'w1' }, { model: 'w2' }] } }),
      agent,
    )
    expect(run.report.status).toBe('completed')
    expect(run.report.deadRoutes).toEqual([{ route: 'w1', class: 'server-error', streak: 2 }])
  })

  it('leaves a route alive after a single failure', async () => {
    const agent: ScriptAgent = async (prompt, options) => {
      if (roleOf(options.label) === 'worker') {
        if (options.model === 'w1') throw new Error('502 bad gateway from the provider')
        return execution('done')
      }
      return verification(taskFromPrompt(prompt))
    }
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({ roles: { worker: [{ model: 'w1' }, { model: 'w2' }] } }),
      agent,
    )
    expect(run.report.status).toBe('completed')
    expect(run.report.deadRoutes).toBeUndefined()
    expect(modelsCalled(run)).toEqual(['w1', 'w2', 'inherit'])
  })

  it('clears the streak when the route answers, so the two failures are not consecutive', async () => {
    const agent: ScriptAgent = async (prompt, options) => {
      if (roleOf(options.label) === 'worker') {
        const id = taskFromPrompt(prompt).id
        if (options.model === 'w1' && id !== 'b') throw new Error('502 bad gateway from the provider')
        return execution('done')
      }
      return verification(taskFromPrompt(prompt))
    }
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({ tasks: [task('a'), task('b'), task('c')], roles: { worker: [{ model: 'w1' }, { model: 'w2' }] } }),
      agent,
    )
    expect(run.report.status).toBe('completed')
    expect(run.report.deadRoutes).toBeUndefined()
    // w1 answered task b: the streak was cleared instead of continuing to 2.
    const answeredByW1 = run.report.routes.filter(entry => entry.role === 'worker' && entry.route === 'w1' && entry.outcome === 'ok')
    expect(answeredByW1).toHaveLength(1)
  })

  it('counts timeout and connection failures in the same table', async () => {
    const agent: ScriptAgent = async (prompt, options) => {
      const role = roleOf(options.label)
      if (role === 'worker') {
        if (options.model === 'w1') throw new Error('request timed out after 7200 s')
        return execution('done')
      }
      if (role === 'verifier') {
        if (options.model === 'v1') throw new Error('ECONNRESET while reading the response')
        return verification(taskFromPrompt(prompt))
      }
      throw new Error(`unexpected role ${String(options.label)}`)
    }
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({
        tasks: [task('a'), task('b')],
        roles: {
          worker: [{ model: 'w1' }, { model: 'w2' }],
          verifier: [{ model: 'v1' }, { model: 'v2' }],
        },
      }),
      agent,
    )
    expect(run.report.status).toBe('completed')
    expect(run.report.deadRoutes).toEqual([
      { route: 'w1', class: 'timeout', streak: 2 },
      { route: 'v1', class: 'connection', streak: 2 },
    ])
  })

  it('never kills a route on an auth refusal: the next call would be refused the same way', async () => {
    const agent: ScriptAgent = async (prompt, options) => {
      if (roleOf(options.label) === 'worker') throw new Error('401 invalid api key for this route')
      return verification(taskFromPrompt(prompt))
    }
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({ maxRetries: 1, roles: { worker: [{ model: 'w1' }] } }),
      agent,
    )
    // Two attempts on the only route in the chain: the refusal was seen twice —
    // and still decides nothing, because a refusal is a key, not a transport.
    expect(run.calls.filter(call => call.model === 'w1')).toHaveLength(2)
    expect(run.report.deadRoutes).toBeUndefined()
    expect(run.report.routes.filter(entry => entry.failureClass === 'model-unavailable')).toHaveLength(2)
  })

  it('never kills a route on a missing structured result (that is the child, not the route)', async () => {
    const agent: ScriptAgent = async () => null
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({ roles: { worker: [{ model: 'w1' }, { model: 'w2' }] } }),
      agent,
    )
    expect(run.report.deadRoutes).toBeUndefined()
    expect(run.report.routes.filter(entry => entry.failureClass === 'format-error').length).toBeGreaterThanOrEqual(2)
  })

  it('never kills a route when the engine could not start the child at all', async () => {
    const agent: ScriptAgent = async (prompt, options) => {
      if (roleOf(options.label) === 'worker') {
        if (options.model === 'w1') {
          const refused = new Error('the engine refused to start a child') as Error & { code: string }
          refused.code = 'AGENT_START'
          throw refused
        }
        return execution('done')
      }
      return verification(taskFromPrompt(prompt))
    }
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({ tasks: [task('a'), task('b')], roles: { worker: [{ model: 'w1' }, { model: 'w2' }] } }),
      agent,
    )
    expect(run.report.deadRoutes).toBeUndefined()
    expect(run.report.routes.filter(entry => entry.failureClass === 'agent-start-failed')).toHaveLength(2)
  })

  it('never records an inherited route: there is no other route to prefer', async () => {
    const agent: ScriptAgent = async () => {
      throw new Error('503 service unavailable')
    }
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args({ tasks: [task('a'), task('b')] }), agent)
    expect(run.report.deadRoutes).toBeUndefined()
    expect(run.report.routes.every(entry => entry.route === 'inherit')).toBe(true)
  })

  it('keeps 429 in the table, behind the switch gate: only a 429 that advances the chain counts', async () => {
    const failing: ScriptAgent = async (prompt, options) => {
      if (roleOf(options.label) === 'worker') {
        if (options.model === 'w1') throw new Error('429 too many requests')
        return execution('done')
      }
      return verification(taskFromPrompt(prompt))
    }
    const twoTasks = { tasks: [task('a'), task('b')], roles: { worker: [{ model: 'w1' }, { model: 'w2' }] } }

    const builtIn = await runWorkflowScript(WORKFLOW_SCRIPT, args(twoTasks), failing)
    expect(builtIn.report.deadRoutes).toEqual([{ route: 'w1', class: 'rate-limit', streak: 2 }])

    // The operator turned the 429 checkbox off: the route is kept and the task
    // retries on it, so a 429 says nothing about the route being dead.
    const gated = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({ ...twoTasks, switchOn: SWITCH_WITHOUT_RATE_LIMIT }),
      failing,
    )
    expect(gated.report.deadRoutes).toBeUndefined()
  })

  it('caps the table at 16 routes and drops the oldest', async () => {
    const chain = Array.from({ length: 17 }, (_unused, index) => ({ model: `m${index}` }))
    const agent: ScriptAgent = async () => {
      throw new Error('internal server error')
    }
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({ maxRetries: 1, maxTotalAgents: 200, roles: { worker: chain } }),
      agent,
    )
    const dead = run.report.deadRoutes ?? []
    expect(dead).toHaveLength(16)
    expect(dead[0]?.route).toBe('m1')
    expect(dead[dead.length - 1]?.route).toBe('m16')
  })

  it('revives a route that answers again, and still tries a dead route as the last candidate', async () => {
    const agent: ScriptAgent = async (prompt, options) => {
      if (roleOf(options.label) === 'worker') {
        const id = taskFromPrompt(prompt).id
        if (options.model === 'w1') {
          if (id === 'c') return execution('done')
          throw new Error('502 bad gateway from the provider')
        }
        if (id === 'c') throw new Error('503 service unavailable')
        return execution('done')
      }
      return verification(taskFromPrompt(prompt))
    }
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({ tasks: [task('a'), task('b'), task('c')], roles: { worker: [{ model: 'w1' }, { model: 'w2' }] } }),
      agent,
    )
    expect(run.report.status).toBe('completed')
    // A dead route is deprioritized, never removed: when the live route fails
    // too, the dead one is the next candidate and its success clears the table.
    expect(run.report.deadRoutes).toBeUndefined()
    expect(run.report.routes.some(entry => entry.role === 'worker' && entry.route === 'w1' && entry.outcome === 'ok')).toBe(true)
  })
})

describe('dead routes: call order', () => {
  it('stops placing calls on a dead route while a live one has room', async () => {
    const agent: ScriptAgent = async (prompt, options) => {
      if (roleOf(options.label) === 'worker') {
        if (options.model === 'w1') throw new Error('502 bad gateway from the provider')
        return execution('done')
      }
      return verification(taskFromPrompt(prompt))
    }
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({ tasks: [task('a'), task('b'), task('c')], roles: { worker: [{ model: 'w1' }, { model: 'w2' }] } }),
      agent,
    )
    expect(run.report.status).toBe('completed')
    expect(modelsCalled(run)).toEqual(['w1', 'w2', 'inherit', 'w1', 'w2', 'inherit', 'w2', 'inherit'])
    expect(run.calls.filter(call => call.model === 'w1')).toHaveLength(2)
  })

  it('puts the task id on the report row, and leaves run-level rows without one', async () => {
    const agent: ScriptAgent = async (prompt, options) => {
      const role = roleOf(options.label)
      if (role === 'planner') return { tasks: [task('a')] }
      if (role === 'worker') {
        if (options.model === 'w1') throw new Error('502 bad gateway from the provider')
        return execution('done')
      }
      return verification(taskFromPrompt(prompt))
    }
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({
        tasks: null,
        roles: { planner: [{ model: 'p1' }], worker: [{ model: 'w1' }, { model: 'w2' }] },
      }),
      agent,
    )
    const planned = run.report.routes.filter(entry => entry.role === 'planner')
    expect(planned.length).toBeGreaterThan(0)
    expect(planned.every(entry => entry.taskId === undefined)).toBe(true)
    const scoped = run.report.routes.filter(entry => entry.role === 'worker' || entry.role === 'verifier')
    expect(scoped.length).toBeGreaterThan(0)
    expect(scoped.every(entry => entry.taskId === 'a')).toBe(true)
  })
})

describe('dead routes: the host boundary', () => {
  // The report's own limits are checked against this configuration, so it must be
  // the configuration those runs actually ran under.
  const config = resolveConfig({
    maxConcurrency: 1,
    maxTasks: 6,
    childTimeoutMs: 7_200_000,
    roles: { worker: [{ model: 'w1' }, { model: 'w2' }] },
  })

  async function killed(): Promise<WorkflowReport> {
    const agent: ScriptAgent = async (prompt, options) => {
      if (roleOf(options.label) === 'worker') {
        if (options.model === 'w1') throw new Error('502 bad gateway from the provider')
        return execution('done')
      }
      return verification(taskFromPrompt(prompt))
    }
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({ maxRetries: 1, tasks: [task('a'), task('b')], roles: { worker: [{ model: 'w1' }, { model: 'w2' }] } }),
      agent,
    )
    return run.report
  }

  it('accepts the new fields and keeps them through validation', async () => {
    const report = assertWorkflowReport(await killed(), OBJECTIVE, config)
    expect(report.deadRoutes).toEqual([{ route: 'w1', class: 'server-error', streak: 2 }])
    expect(report.routes.some(entry => entry.taskId === 'a')).toBe(true)
  })

  it('stays backward compatible with a report that predates the field', async () => {
    const old = { ...(await killed()), deadRoutes: undefined }
    expect(assertWorkflowReport(old, OBJECTIVE, config).deadRoutes).toBeUndefined()
  })

  it('rejects a row that would claim a route is dead below the threshold', async () => {
    const report = await killed()
    const below = { ...report, deadRoutes: [{ route: 'w1', class: 'server-error', streak: 1 }] }
    expect(() => assertWorkflowReport(below, OBJECTIVE, config)).toThrow(/streak/)
    const unknown = { ...report, deadRoutes: [{ route: 'w1', class: 'not-a-failure-class', streak: 2 }] }
    expect(() => assertWorkflowReport(unknown, OBJECTIVE, config)).toThrow(/class/)
  })
})

describe('dead routes: rendered only as a diagnostic, never in a reader’s answer', () => {
  async function killed(): Promise<WorkflowReport> {
    const agent: ScriptAgent = async (prompt, options) => {
      if (roleOf(options.label) === 'worker') {
        if (options.model === 'w1') throw new Error('502 bad gateway from the provider')
        return execution('done')
      }
      return verification(taskFromPrompt(prompt))
    }
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({ maxRetries: 1, tasks: [task('a'), task('b')], roles: { worker: [{ model: 'w1' }, { model: 'w2' }] } }),
      agent,
    )
    return run.report
  }

  it('renders the ledger line only when diagnostics are on', async () => {
    const report = await killed()
    const shown = renderReport(report, { showDiagnostics: true })
    expect(shown).toContain('Dead routes')
    expect(shown).toContain('w1')
    expect(shown).toContain('server-error')
    expect(renderReport(report)).not.toContain('Dead routes')
  })

  it('keeps the label out of the delivered answer even when a summary echoes it', async () => {
    const report = await killed()
    const view = deliverReport({
      ...report,
      synthesis: { mode: 'deterministic', summary: 'Dead routes: w1 died of server-error twice, so calls moved to w2' },
    })
    expect(view.human).not.toContain('Dead routes:')
    // Diagnostics on: the ledger may carry machine material, the answer may not.
    const ledgerView = deliverReport(report, { diagnostics: true })
    expect(ledgerView.human).not.toContain('Dead routes:')
  })
})

/**
 * The shapes the *real* engine produces, which the table above cannot see.
 *
 * D-120: every earlier case here throws from the agent seam, so it exercises
 * "how the table books a failure the script already classified". On a real run
 * the engine folds a dead child into `null` and the child's own session is the
 * only place its cause exists — so with the table's old gate
 * (`class === family && switchModel === true`) no real path could ever enter it,
 * and the soak found an empty table with 5 dead 503 calls and 8 dead hangs in
 * the log.
 *
 * These cases drive the real engine over the harness provider and the plugin's
 * own twin (the seam production uses), so what is asserted is the engine's shape:
 * the child settles with a real `stopReason`, its session carries the provider's
 * words, and the guest only ever sees what the engine hands it.
 */
describe('dead routes: the shape the real engine produces', () => {
  /** A configuration whose worker chain is one dead route and one live one. */
  function realConfig(overrides: Record<string, unknown> = {}) {
    return resolveConfig({
      maxConcurrency: 1,
      maxTasks: 6,
      childTimeoutMs: 7_200_000,
      roles: { worker: [{ model: 'w1' }, { model: 'w2' }] },
      ...overrides,
    })
  }

  /**
   * Run the real script over the real engine and the plugin's twin seam.
   *
   * `answer` decides what each child settles as; the twin is the one production
   * uses (`src/team-engine.ts`), built over the harness's own engine so the
   * child terminals are the engine's real ones.
   */
  async function runReal(
    answer: (call: ChildCall) => ChildAnswer,
    config: ReturnType<typeof resolveConfig>,
    tasks = [task('a'), task('b'), task('c')],
  ): Promise<{ report: WorkflowReport, children: ChildCall[] }> {
    const harness = createEngineHarness(async call => answer(call))
    try {
      const payload = buildWorkflowRequest(OBJECTIVE, tasks, config)
      const engine = teamWorkflowEngine(harness.ctx as never, { warn() {} })
      const run = engine.start({
        script: payload.script,
        meta: { name: '任务团队', description: 'dead-route twin run' },
        args: payload.args,
        parent: { session: { header: {}, id: 'dead-route-parent' } } as never,
        maxTotalAgents: payload.maxTotalAgents,
      })
      const result = await run.result
      await run.dispose()
      expect(result.stopReason).toBe('completed')
      return { report: assertWorkflowReport(result.value, OBJECTIVE, config), children: harness.children }
    } finally {
      await harness.dispose()
    }
  }

  /**
   * The role a child belongs to, read the way the panel reads it.
   *
   * The twin rewrites each activation's label from the prompt's first line
   * (`执行 · Task a`), so the role has to come off the prompt title — the raw
   * `call.label` is both the wrong string and, under the twin, the title itself.
   */
  function roleOfCall(call: { prompt: string }): string {
    const head = call.prompt.split('\n')[0]!.trim().split('·')[0]!.trim()
    return parseMemberLabel(head, 'zh')?.role ?? ''
  }

  /** Worker calls in placement order, by the model each was asked for. */
  function workerModels(children: ChildCall[]): string[] {
    return children.filter(call => roleOfCall(call) === 'worker').map(call => call.model ?? 'inherit')
  }

  it('counts a 503 the engine collapsed to null, because the child session named it', async () => {
    const { report, children } = await runReal(call => {
      const role = roleOfCall(call)
      if (role === 'worker') {
        // The in-process death, in the shape the published runtime produces: no
        // `diagnostic` on the result, the provider's words only in the session.
        if (call.model === 'w1') {
          return {
            output: [{ type: 'text' as const, text: '' }],
            stopReason: 'error',
            sessionFailure: { message: '503: {"message":"service unavailable"}', code: 'HTTP_503', status: 503 },
          }
        }
        return { structured: execution('done') }
      }
      if (role === 'verifier') return { structured: verification(taskFromPrompt(call.prompt)) }
      return { structured: { summary: 'ok' } }
    }, realConfig())
    // Two dead calls are enough: the route is behind the live one from task 3 on,
    // which is the whole cost the table exists to save.
    expect(report.deadRoutes).toEqual([{ route: 'w1', class: 'server-error', streak: 2 }])
    expect(workerModels(children)).toEqual(['w1', 'w2', 'w1', 'w2', 'w2'])
    // The row says what the provider said, not "no valid structured result".
    const dead = report.routes.filter(entry => entry.failureClass === 'server-error')
    expect(dead).toHaveLength(2)
    expect(dead.every(entry => entry.reason?.includes('503'))).toBe(true)
    expect(report.routes.filter(entry => entry.failureClass === 'format-error')).toEqual([])
  })

  it('counts a call that hung, even though a hang does not switch models', async () => {
    const hang = new Promise<never>(() => {})
    const { report, children } = await runReal(call => {
      const role = roleOfCall(call)
      if (role === 'worker') {
        if (call.model === 'w1') return { gate: hang }
        return { structured: execution('done') }
      }
      if (role === 'verifier') return { structured: verification(taskFromPrompt(call.prompt)) }
      return { structured: { summary: 'ok' } }
    }, realConfig({ childTimeoutMs: 1000 }), [task('a'), task('b')])
    // The budget is the script's own (no engine timer): a loser is settled as a
    // timeout, the task retries with new wording, and the route that hung is
    // demoted at the second one.
    expect(report.deadRoutes).toEqual([{ route: 'w1', class: 'timeout', streak: 2 }])
    // task a: both attempts hang on the first route and fail; task b (a dead route
    // is placed last) reaches the live one.
    expect(workerModels(children)).toEqual(['w1', 'w1', 'w2'])
  })

  it('still leaves a child that finished without submitting alone', async () => {
    const { report } = await runReal(call => {
      const role = roleOfCall(call)
      if (role === 'worker') {
        // The genuine format gap: the child ran to completion and only talked.
        return { output: [{ type: 'text' as const, text: 'I did the work.' }], stopReason: 'completed' }
      }
      if (role === 'verifier') return { structured: verification(taskFromPrompt(call.prompt)) }
      return { structured: { summary: 'ok' } }
    }, realConfig())
    expect(report.deadRoutes).toBeUndefined()
    expect(report.routes.some(entry => entry.failureClass === 'format-error')).toBe(true)
  })

  it('still refuses to blame a route for a refused key', async () => {
    const { report } = await runReal(call => {
      const role = roleOfCall(call)
      if (role === 'worker') {
        if (call.model === 'w1') {
          return {
            output: [{ type: 'text' as const, text: '' }],
            stopReason: 'error',
            sessionFailure: { message: '401: {"message":"virtual key is required."}', code: 'AUTH', status: 401 },
          }
        }
        return { structured: execution('done') }
      }
      if (role === 'verifier') return { structured: verification(taskFromPrompt(call.prompt)) }
      return { structured: { summary: 'ok' } }
    }, realConfig())
    expect(report.deadRoutes).toBeUndefined()
  })
})

describe('dead routes: the host side of the channel it opens', () => {
  it('refuses only the four transport families, and names the provider in the line', () => {
    expect(CHILD_DEATH_FAMILIES).toEqual(['timeout', 'connection', 'server-error', 'rate-limit'])
    expect(childDeathRejection({ stopReason: 'error', diagnostic: '503 service unavailable' }))
      .toBe(`${CHILD_DEATH_MARKER} server-error: the child run ended abnormally (503 service unavailable)`)
    expect(childDeathRejection({ stopReason: 'error', diagnostic: 'ECONNRESET while reading' })).toContain('connection:')
    expect(childDeathRejection({ stopReason: 'error', code: 'RATE_LIMIT' })).toContain('rate-limit:')
    expect(childDeathRejection({ stopReason: 'error', code: 'TIMEOUT' })).toContain('timeout:')
    // Everything else keeps the null shape it had.
    expect(childDeathRejection({ stopReason: 'completed' })).toBeUndefined()
    expect(childDeathRejection({ stopReason: 'aborted' })).toBeUndefined()
    expect(childDeathRejection({ stopReason: 'error', code: 'AUTH' })).toBeUndefined()
    expect(childDeathRejection({ stopReason: 'error', diagnostic: 'the child run ended `error`' })).toBeUndefined()
  })

  it('pins the marker and the family table on both sides of the seam', () => {
    // The script parses the marker out of a sentence; the host writes it. A rename
    // on one side would silently stop the channel without failing anything else.
    expect(WORKFLOW_SCRIPT).toContain(`'${CHILD_DEATH_MARKER}'`)
    const table = /const ROUTE_HEALTH_FAMILIES = \{([^}]*)\};/.exec(WORKFLOW_SCRIPT)
    expect(table, 'the script no longer declares ROUTE_HEALTH_FAMILIES').not.toBeNull()
    const keys = [...table![1]!.matchAll(/'?([a-z-]+)'?:\s*1/g)].map(match => match[1])
    expect(keys).toEqual([...CHILD_DEATH_FAMILIES])
  })
})
