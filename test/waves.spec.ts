import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { assertWorkflowReport, renderReport } from '../src/report.js'
import { buildWorkflowRequest, WORKFLOW_SCRIPT } from '../src/script.js'
import { UPSTREAM_HEADER } from '../src/upstream.js'
import { planWaveReason, singleWaveCause, WAVE_LIMIT } from '../src/waves.js'
import { execution, failingVerification, task, verification } from './fixtures.js'
import { delay, roleOf, runWorkflowScript, taskFromPrompt, type ScriptAgent } from './helpers.js'

/**
 * Wave 3 + Wave 4 acceptance: the plan is a DAG of waves.
 *
 * These cases drive the *real generated script* through the VM harness, so what they
 * assert is the behaviour a run has, not a restatement of the source:
 *
 * - A2 — an illegal plan (cycle, cross-wave edge, self-reference) is rejected and the
 *   rejection names the offending task;
 * - A3 — a two-wave plan runs wave 1 in parallel and starts wave 2 only after every
 *   task of wave 1 has settled;
 * - A4 — a downstream task whose upstream did not verify is `blocked`, never
 *   `verified`, and the run is not `completed`;
 * - A5 — a plan that is honestly one wave says why, and a small job is not split.
 *
 * The wave ceiling is pinned here against the generated script's own literal, because
 * the two live in different files on purpose (the script cannot import host code).
 */

const OBJECTIVE = 'Ship the two-wave plan'

function config(overrides: Record<string, unknown> = {}) {
  return resolveConfig({ maxConcurrency: 4, maxTasks: 6, ...overrides })
}

function args(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const request = buildWorkflowRequest(OBJECTIVE, undefined, config(overrides))
  return { ...request.args, ...overrides }
}

/** One planner-shaped task, as the planner model writes it. */
function planTask(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    title: `Task ${id}`,
    objective: `Do ${id}`,
    expectedOutput: `Output ${id}`,
    acceptanceCriteria: [`${id} works`],
    context: '',
    constraints: [],
    ...extra,
  }
}

/** A plan object in the shape the planner may return. */
function plan(waves: Record<string, unknown>[][], extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { waves, ...extra }
}

/**
 * An agent that answers the planner with `planned`, then verifies every task.
 * @param planned - value the planner call returns.
 * @param hooks - optional per-call observation.
 */
function scripted(planned: unknown, hooks: {
  onWorker?: (id: string) => Promise<void> | void
  onVerifier?: (taskValue: ReturnType<typeof task>) => unknown
} = {}): ScriptAgent {
  return async (prompt, options) => {
    const role = roleOf(options.label)
    if (role === 'planner') return planned
    const taskValue = taskFromPrompt(prompt)
    if (role === 'worker') {
      if (hooks.onWorker !== undefined) await hooks.onWorker(taskValue.id)
      return execution(`did ${taskValue.id}`)
    }
    if (role === 'verifier') {
      if (hooks.onVerifier !== undefined) return hooks.onVerifier(taskValue as never)
      return verification(taskValue as never)
    }
    return verification(taskValue as never)
  }
}

describe('wave ceiling', () => {
  it('keeps the script literal and the host mirror at the same number', () => {
    expect(WAVE_LIMIT).toBe(8)
    expect(WORKFLOW_SCRIPT).toContain('const WAVE_LIMIT = 8;')
  })
})

describe('A2: an illegal dependency plan is rejected and names the offending task', () => {
  const cases: { label: string, planned: unknown, offender: string, expected: RegExp }[] = [
    {
      label: 'self-reference',
      planned: plan([[planTask('a', { dependsOn: ['a'] })]]),
      offender: 'task a depends on itself',
      expected: /task a depends on itself/,
    },
    {
      label: 'unknown dependency',
      planned: plan([[planTask('a', { dependsOn: ['ghost'] })]]),
      offender: 'task a depends on unknown task ghost',
      expected: /task a depends on unknown task ghost/,
    },
    {
      label: 'dependency cycle in a flat plan',
      planned: { tasks: [planTask('a', { dependsOn: ['b'] }), planTask('b', { dependsOn: ['a'] })] },
      offender: 'dependency cycle',
      expected: /dependency cycle: a -> b -> a|dependency cycle: b -> a -> b/,
    },
    {
      label: 'cross-wave edge',
      planned: plan([
        [planTask('a')],
        [planTask('b', { dependsOn: ['c'] }), planTask('c')],
      ]),
      offender: 'task b (wave 2) depends on c in wave 2',
      expected: /task b \(wave 2\) depends on c in wave 2; a dependency must point to an earlier wave/,
    },
    {
      label: 'too many waves',
      planned: plan(Array.from({ length: WAVE_LIMIT + 1 }, (_, index) => [planTask(`t${index}`)])),
      offender: 'plan declares 9 waves; the limit is 8',
      expected: /plan declares 9 waves; the limit is 8/,
    },
  ]

  for (const testCase of cases) {
    it(`rejects a plan with a ${testCase.label}`, async () => {
      const run = await runWorkflowScript(WORKFLOW_SCRIPT, args(), scripted(testCase.planned))
      // Fail-closed: the bad plan is refused whole and the run degrades to the
      // fallback plan, which still produces a validated report.
      expect(run.report.plan.source).toBe('fallback')
      expect(run.report.plan.error).toContain(testCase.offender)
      expect(run.report.plan.error).toMatch(testCase.expected)
      expect(() => assertWorkflowReport(run.report, OBJECTIVE, config())).not.toThrow()
      // The rejection travels into the report's own error list, so a reader (and
      // the gate's failure summary) sees which task broke the plan.
      const planError = run.report.errors.find(entry => entry.phase === 'Plan')
      expect(planError?.message).toContain(testCase.offender)
    })
  }

  it('accepts the same plan once the offending dependency is removed', async () => {
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args(), scripted(plan([
      [planTask('a')],
      [planTask('b', { dependsOn: ['a'] })],
    ])))
    expect(run.report.plan.source).toBe('planner')
    expect(run.report.plan.error).toBe('')
    expect(run.report.plan.waves).toEqual([['a'], ['b']])
    expect(run.report.status).toBe('completed')
  })
})

describe('A3: wave 1 runs in parallel and wave 2 waits for all of it', () => {
  it('measures a parallel peak above one in wave 1 and starts wave 2 only after it settles', async () => {
    let inFlight = 0
    let peak = 0
    const settled: string[] = []
    const startedWave2Before = { value: false }
    const agent: ScriptAgent = async (prompt, options) => {
      const role = roleOf(options.label)
      if (role === 'planner') {
        return plan([
          [planTask('a'), planTask('b')],
          [planTask('c', { dependsOn: ['a', 'b'] })],
        ])
      }
      const taskValue = taskFromPrompt(prompt)
      if (role === 'worker') {
        inFlight += 1
        peak = Math.max(peak, inFlight)
        if (taskValue.id === 'c' && settled.length < 2) startedWave2Before.value = true
        // Hold the call open long enough for the two wave-1 workers to overlap.
        await new Promise(resolve => setTimeout(resolve, 25))
        inFlight -= 1
        return execution(`did ${taskValue.id}`)
      }
      const verified = verification(taskValue as never)
      settled.push(taskValue.id)
      return verified
    }
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args(), agent)
    expect(run.report.plan.source).toBe('planner')
    expect(run.report.status).toBe('completed')
    expect(run.report.plan.waves).toEqual([['a', 'b'], ['c']])
    // A3: more than one task of wave 1 in flight at the same time.
    expect(peak).toBeGreaterThan(1)
    // A3: wave 2 started only after both wave-1 tasks had settled.
    expect(settled.slice(0, 2).sort()).toEqual(['a', 'b'])
    expect(startedWave2Before.value).toBe(false)
    expect(settled.indexOf('c')).toBeGreaterThan(1)
    // The report renders one heading per wave.
    const rendered = renderReport(run.report)
    expect(rendered).toContain('Wave 1/2:')
    expect(rendered).toContain('Wave 2/2:')
  })

  it('keeps the plan order in the report even though the waves run one after another', async () => {
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args(), scripted(plan([
      [planTask('a'), planTask('b')],
      [planTask('c', { dependsOn: ['a', 'b'] })],
    ])))
    expect(run.report.tasks.map(row => row.id)).toEqual(['a', 'b', 'c'])
    expect(run.report.plan.tasks.map(row => row.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('A4: an upstream failure blocks downstream instead of verifying it', () => {
  it('records the downstream task blocked, never verified, and the run is not completed', async () => {
    const agent = scripted(
      plan([
        [planTask('a')],
        [planTask('b', { dependsOn: ['a'] })],
      ]),
      { onVerifier: (taskValue) => failingVerification(taskValue, 'no artifact produced') },
    )
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args(), agent)
    const byId = new Map(run.report.tasks.map(row => [row.id, row]))
    expect(byId.get('a')?.status).toBe('failed')
    const downstream = byId.get('b')!
    expect(downstream.status).toBe('blocked')
    expect(downstream.attempts).toHaveLength(1)
    expect(downstream.attempts[0]?.execution).toBeNull()
    expect(downstream.attempts[0]?.verification).toBeNull()
    expect(downstream.attempts[0]?.passed).toBe(false)
    expect(downstream.error).toContain('upstream task a did not verify')
    expect(run.report.status).toBe('failed')
    expect(run.report.status).not.toBe('completed')
    const incomplete = run.report.incomplete.filter(item => item.taskId === 'b')
    expect(incomplete).toHaveLength(1)
    expect(incomplete[0]?.reason).toContain('blocked')
    expect(() => assertWorkflowReport(run.report, OBJECTIVE, config())).not.toThrow()
    expect(renderReport(run.report)).toContain('- b: blocked')
  })

  it('does not spend a retry on a blocked task', async () => {
    const workerCalls: string[] = []
    const agent = scripted(
      plan([
        [planTask('a')],
        [planTask('b', { dependsOn: ['a'] })],
      ]),
      {
        onWorker: (id) => { workerCalls.push(id) },
        onVerifier: (taskValue) => failingVerification(taskValue, 'no artifact produced'),
      },
    )
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args(), agent)
    // `a` spends its bounded retry (maxRetries 1 → two attempts); `b` never runs.
    expect(workerCalls.filter(id => id === 'a')).toHaveLength(2)
    expect(workerCalls.filter(id => id === 'b')).toHaveLength(0)
  })

  it('reports partial, not completed, when verified work sits beside a blocked task', async () => {
    const agent = scripted(
      plan([
        [planTask('a'), planTask('b')],
        [planTask('c', { dependsOn: ['b'] })],
      ]),
      {
        onVerifier: (taskValue) =>
          taskValue.id === 'b' ? failingVerification(taskValue, 'b did not produce its artifact') : verification(taskValue),
      },
    )
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args(), agent)
    const byId = new Map(run.report.tasks.map(row => [row.id, row]))
    expect(byId.get('a')?.status).toBe('verified')
    expect(byId.get('b')?.status).toBe('failed')
    expect(byId.get('c')?.status).toBe('blocked')
    expect(run.report.status).toBe('partial')
    expect(() => assertWorkflowReport(run.report, OBJECTIVE, config())).not.toThrow()
  })

  it('propagates blocking through two downstream waves', async () => {
    const agent = scripted(
      plan([
        [planTask('a')],
        [planTask('b', { dependsOn: ['a'] })],
        [planTask('c', { dependsOn: ['b'] })],
      ]),
      { onVerifier: (taskValue) => failingVerification(taskValue, 'never produced') },
    )
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args(), agent)
    const byId = new Map(run.report.tasks.map(row => [row.id, row]))
    expect(byId.get('a')?.status).toBe('failed')
    expect(byId.get('b')?.status).toBe('blocked')
    expect(byId.get('c')?.status).toBe('blocked')
    expect(byId.get('c')?.error).toContain('upstream task b did not verify')
  })
})

describe('A3: one wave keeps its write-path serialization', () => {
  it('serializes two overlapping writers inside one wave even with concurrency to spare', async () => {
    let inFlight = 0
    let peak = 0
    const agent = scripted(
      plan([[
        planTask('a', { writesPaths: ['src/shared.ts'] }),
        planTask('b', { writesPaths: ['src/shared.ts'] }),
      ]]),
      {
        onWorker: async () => {
          inFlight += 1
          peak = Math.max(peak, inFlight)
          await delay(20)
          inFlight -= 1
        },
      },
    )
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args(), agent)
    expect(run.report.status).toBe('completed')
    expect(peak).toBe(1)
  })

  it('still runs two disjoint writers of one wave together', async () => {
    let inFlight = 0
    let peak = 0
    const agent = scripted(
      plan([[
        planTask('a', { writesPaths: ['src/a.ts'] }),
        planTask('b', { writesPaths: ['src/b.ts'] }),
      ]]),
      {
        onWorker: async () => {
          inFlight += 1
          peak = Math.max(peak, inFlight)
          await delay(25)
          inFlight -= 1
        },
      },
    )
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args(), agent)
    expect(run.report.status).toBe('completed')
    expect(peak).toBeGreaterThan(1)
  })
})

describe('S3: a dependent task receives the evidence its dependency produced', () => {
  it('carries the upstream block into the wave-2 worker prompt', async () => {
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args(), scripted(plan([
      [planTask('a')],
      [planTask('b', { dependsOn: ['a'] })],
    ])))
    const dependent = run.calls.find(call =>
      roleOf(call.label) === 'worker' && taskFromPrompt(call.prompt).id === 'b')
    expect(dependent).toBeDefined()
    const prompt = dependent!.prompt
    expect(prompt).toContain(UPSTREAM_HEADER)
    expect(prompt).toContain('task a: did a')
    expect(prompt).toContain('deliverable: deliverable -- file:///tmp/deliverable')
    expect(prompt).toContain('evidence: implemented -- src/index.ts')
    // It is context, never evidence for the dependent's own criteria.
    expect(prompt).toContain('never treat it as evidence for your own acceptance criteria')
    // A first-wave task has nothing upstream, so it carries no block.
    const first = run.calls.find(call =>
      roleOf(call.label) === 'worker' && taskFromPrompt(call.prompt).id === 'a')
    expect(first!.prompt).not.toContain(UPSTREAM_HEADER)
  })
})

describe('S4: a verified dependency with no artifact fails its dependents', () => {
  const QUESTION = 'What is the capital of France?'

  it('fails the dependent instead of running it against a self-report', async () => {
    const started: string[] = []
    const agent: ScriptAgent = async (prompt, options) => {
      const role = roleOf(options.label)
      if (role === 'planner') {
        return plan([[planTask('a')], [planTask('b', { dependsOn: ['a'] })]])
      }
      const taskValue = taskFromPrompt(prompt)
      started.push(`${role}:${taskValue.id}`)
      if (role === 'worker') {
        // A legitimate answer-only result: the summary is the answer, and there is
        // no deliverable, evidence item, changed file or passing command.
        return execution('Paris is the capital of France', {
          deliverables: [],
          evidence: [],
          testsRun: [],
          filesChanged: [],
        })
      }
      return verification(taskValue as never)
    }
    const config = resolveConfig({ maxConcurrency: 4, maxTasks: 6 })
    const request = buildWorkflowRequest(QUESTION, undefined, config)
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, { ...request.args }, agent)
    const byId = new Map(run.report.tasks.map(row => [row.id, row]))
    expect(byId.get('a')?.status).toBe('verified')
    const downstream = byId.get('b')!
    expect(downstream.status).toBe('failed')
    expect(downstream.attempts).toHaveLength(1)
    expect(downstream.attempts[0]?.execution).toBeNull()
    expect(downstream.attempts[0]?.verification).toBeNull()
    expect(downstream.attempts[0]?.passed).toBe(false)
    expect(downstream.error).toContain('upstream task a verified without an evidence summary')
    // No child was started for the dependent: the contract check runs first.
    expect(started).not.toContain('worker:b')
    expect(run.report.status).not.toBe('completed')
    expect(() => assertWorkflowReport(run.report, QUESTION, config)).not.toThrow()
  })
})

describe('wave planning bounds', () => {
  it('rejects a waves plan that exceeds maxTasks across waves', async () => {
    const four = plan([[planTask('a'), planTask('b')], [planTask('c'), planTask('d')]])
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args({ maxTasks: 3 }), scripted(four))
    expect(run.report.plan.source).toBe('fallback')
    expect(run.report.plan.error).toContain('plan declares more than 3 tasks')
  })

  it('rejects an empty wave rather than silently renumbering the schedule', async () => {
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args(), scripted(plan([[planTask('a')], []])))
    expect(run.report.plan.source).toBe('fallback')
    expect(run.report.plan.error).toContain('wave 2 is not a non-empty task list')
  })
})

describe('A5: a single-wave plan says why, and a small job is not split', () => {
  it('does not force-split one task and states the reason', async () => {
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args(), scripted({ tasks: [planTask('a')] }))
    expect(run.report.tasks).toHaveLength(1)
    expect(run.report.plan.waves).toEqual([['a']])
    const rendered = renderReport(run.report)
    expect(rendered).toContain('Wave reason:')
    expect(rendered).toContain('indivisible')
  })

  it('names the dependency chain as the reason for a single-wave plan that has one', () => {
    const chain = [
      { writesPaths: [] as string[] | null, dependsOn: ['a'] },
      { writesPaths: [] as string[] | null, dependsOn: [] as string[] },
    ]
    expect(singleWaveCause(chain, 1)).toBe('dependency-chain')
    expect(planWaveReason(chain, 1, 'zh')).toContain('依赖')
  })

  it('names overlapping write paths as the reason', () => {
    const overlapping = [
      { writesPaths: ['src/a.ts'], dependsOn: [] as string[] },
      { writesPaths: ['src/a.ts'], dependsOn: [] as string[] },
    ]
    expect(singleWaveCause(overlapping, 1)).toBe('write-overlap')
    expect(planWaveReason(overlapping, 1, 'en')).toContain('same paths')
  })

  it('matches the scheduler on case and dot-dot normalization', () => {
    const cased = [
      { writesPaths: ['SRC/A'], dependsOn: [] as string[] },
      { writesPaths: ['src/a'], dependsOn: [] as string[] },
    ]
    const dotted = [
      { writesPaths: ['a/../b'], dependsOn: [] as string[] },
      { writesPaths: ['b'], dependsOn: [] as string[] },
    ]
    expect(singleWaveCause(cased, 1)).toBe('write-overlap')
    expect(singleWaveCause(dotted, 1)).toBe('write-overlap')
  })

  it('says nothing about waves when the plan really has more than one', () => {
    const tasks = [
      { writesPaths: ['a'], dependsOn: [] as string[] },
      { writesPaths: ['b'], dependsOn: ['a'] },
    ]
    expect(singleWaveCause(tasks, 2)).toBeUndefined()
    expect(planWaveReason(tasks, 2, 'zh')).toBeUndefined()
  })
})

describe('blocked task rows keep the report valid', () => {
  it('accepts a blocked row with its synthetic attempt and rejects one without a reason', async () => {
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args(), scripted(
      plan([[planTask('a')], [planTask('b', { dependsOn: ['a'] })]]),
      { onVerifier: (taskValue) => failingVerification(taskValue, 'no artifact') },
    ))
    expect(() => assertWorkflowReport(run.report, OBJECTIVE, config())).not.toThrow()
    const tampered = JSON.parse(JSON.stringify(run.report)) as typeof run.report
    tampered.incomplete = tampered.incomplete.filter(item => item.taskId !== 'b')
    expect(() => assertWorkflowReport(tampered, OBJECTIVE, config()))
      .toThrow(/blocked but is not reported exactly once/)
  })
})

describe('a plan task row is not invented from a dependency', () => {
  it('normalizes a flat plan with dependencies into waves by longest path', async () => {
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args(), scripted({
      tasks: [
        planTask('c', { dependsOn: ['b'] }),
        planTask('a'),
        planTask('b', { dependsOn: ['a'] }),
      ],
    }))
    expect(run.report.plan.source).toBe('planner')
    // Longest path: a=0, b=1, c=2, so plan order becomes execution order.
    expect(run.report.plan.waves).toEqual([['a'], ['b'], ['c']])
    expect(run.report.tasks.map(row => row.id)).toEqual(['a', 'b', 'c'])
    expect(run.report.status).toBe('completed')
  })

  it('rejects a flat plan deeper than the wave ceiling', async () => {
    const tasks = Array.from({ length: WAVE_LIMIT + 1 }, (_, index) =>
      planTask(`t${index}`, index === 0 ? {} : { dependsOn: [`t${index - 1}`] }))
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args({ maxTasks: 20 }), scripted({ tasks }))
    expect(run.report.plan.source).toBe('fallback')
    expect(run.report.plan.error).toContain('dependency levels; the limit is 8')
  })
})

describe('a caller plan keeps the pre-wave behaviour', () => {
  it('runs a caller plan as one wave and reports the reason', async () => {
    const callerTasks = [task('a'), task('b')]
    const request = buildWorkflowRequest(OBJECTIVE, callerTasks, config())
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, { ...request.args }, scripted(null))
    expect(run.report.plan.source).toBe('caller')
    expect(run.report.plan.waves).toEqual([['a', 'b']])
    expect(run.report.status).toBe('completed')
    expect(renderReport(run.report)).toContain('Wave reason:')
  })
})
