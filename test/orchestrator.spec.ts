import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { redactDeep } from '../src/redact.js'
import { assertWorkflowReport } from '../src/report.js'
import { maxTotalAgentsFor, WORKFLOW_SCRIPT } from '../src/script.js'
import { delay, runWorkflowScript, type ScriptAgent } from './helpers.js'
import { execution, failingVerification, task, verification } from './fixtures.js'

function args(tasks: unknown[] | null, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base: Record<string, unknown> = {
    objective: 'Ship the verified result',
    tasks,
    maxConcurrency: 2,
    maxRetries: 1,
    maxTasks: 6,
    ...overrides,
  }
  // Mirror the request builder: the child cap is derived from the task count
  // (exact for a caller plan, the configured maximum otherwise).
  const taskCount = tasks === null ? (base.maxTasks as number) : tasks.length
  return { ...base, maxTotalAgents: maxTotalAgentsFor(taskCount, base.maxRetries as number) }
}

function idFrom(label: string): string {
  const match = /^grok-(?:worker|verifier)-(.+)-a\d+$/.exec(label)
  if (!match) throw new Error(`unexpected label ${label}`)
  return match[1]!
}

describe('generated workflow script', () => {
  it('plans, runs two independent tasks concurrently, verifies both, and reports completed', async () => {
    let active = 0
    let peak = 0
    const plannerTasks = [task('a'), task('b')]
    const agent: ScriptAgent = async (_prompt, options) => {
      active += 1
      peak = Math.max(peak, active)
      try {
        await delay(10)
        if (options.label === 'grok-planner') return { tasks: plannerTasks }
        if (options.label.startsWith('grok-worker-')) {
          return execution(`worker ${idFrom(options.label)}`)
        }
        if (options.label.startsWith('grok-verifier-')) {
          const id = idFrom(options.label)
          return verification(plannerTasks.find(item => item.id === id)!)
        }
        throw new Error(`unexpected agent label ${options.label}`)
      } finally {
        active -= 1
      }
    }

    const { report, calls, events } = await runWorkflowScript(WORKFLOW_SCRIPT, args(null), agent)
    expect(report.status).toBe('completed')
    expect(report.plan.source).toBe('planner')
    expect(report.tasks.map(item => item.status)).toEqual(['verified', 'verified'])
    expect(report.confirmed).toHaveLength(2)
    expect(report.incomplete).toHaveLength(0)
    expect(peak).toBe(2)
    expect(events).toContain('phase:Plan')
    expect(events).toContain('phase:Execute')
    expect(events).toContain('phase:Synthesize')
    expect(calls.some(call => call.label === 'grok-planner')).toBe(true)
  })

  it('skips the planner when caller tasks are supplied', async () => {
    const callerTasks = [task('one'), task('two')]
    const agent: ScriptAgent = async (_prompt, options) => {
      if (options.label === 'grok-planner') throw new Error('planner must not run')
      if (options.label.startsWith('grok-worker-')) return execution(`worker ${idFrom(options.label)}`)
      if (options.label.startsWith('grok-verifier-')) {
        return verification(callerTasks.find(item => item.id === idFrom(options.label))!)
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const { report, calls } = await runWorkflowScript(WORKFLOW_SCRIPT, args(callerTasks), agent)
    expect(report.status).toBe('completed')
    expect(report.plan.source).toBe('caller')
    expect(calls.filter(call => call.label === 'grok-planner')).toHaveLength(0)
    expect(calls.filter(call => call.label.startsWith('grok-worker-'))).toHaveLength(2)
  })

  it('reports partial when one task never produces a valid result', async () => {
    const callerTasks = [task('ok'), task('broken')]
    const calls: string[] = []
    const agent: ScriptAgent = async (_prompt, options) => {
      calls.push(options.label)
      if (options.label.startsWith('grok-worker-')) {
        return idFrom(options.label) === 'broken' ? null : execution('ok')
      }
      if (options.label.startsWith('grok-verifier-')) {
        return verification(callerTasks.find(item => item.id === idFrom(options.label))!)
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const { report } = await runWorkflowScript(WORKFLOW_SCRIPT, args(callerTasks), agent)
    expect(report.status).toBe('partial')
    const ok = report.tasks.find(item => item.id === 'ok')!
    const broken = report.tasks.find(item => item.id === 'broken')!
    expect(ok.status).toBe('verified')
    expect(broken.status).toBe('failed')
    expect(broken.attempts).toHaveLength(2)
    expect(report.incomplete).toEqual([{
      taskId: 'broken',
      reason: expect.stringContaining('no valid structured result'),
      category: 'infrastructure',
    }])
    expect(calls.filter(label => label.startsWith('grok-verifier-broken-'))).toHaveLength(0)
  })

  it('rejects an evidence-free verifier pass and retries only to the configured limit', async () => {
    const callerTasks = [task('a')]
    let workerCalls = 0
    let verifierCalls = 0
    const agent: ScriptAgent = async (_prompt, options) => {
      if (options.label.startsWith('grok-worker-')) {
        workerCalls += 1
        return execution('self-reported success')
      }
      if (options.label.startsWith('grok-verifier-')) {
        verifierCalls += 1
        return verification(callerTasks[0]!, {
          criteria: [{ criterion: 'a works', met: true, evidence: '' }],
        })
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const { report } = await runWorkflowScript(WORKFLOW_SCRIPT, args(callerTasks), agent)
    expect(workerCalls).toBe(2)
    expect(verifierCalls).toBe(2)
    expect(report.status).toBe('failed')
    expect(report.tasks[0]!.status).toBe('failed')
    expect(report.tasks[0]!.attempts).toHaveLength(2)
    expect(report.tasks[0]!.error).toContain('no evidence')
    expect(report.confirmed).toHaveLength(0)
  })

  it('succeeds on the second attempt when the first verification fails', async () => {
    const callerTasks = [task('a')]
    let verifierCalls = 0
    const agent: ScriptAgent = async (_prompt, options) => {
      if (options.label.startsWith('grok-worker-')) return execution('first then fixed')
      if (options.label.startsWith('grok-verifier-')) {
        verifierCalls += 1
        return verifierCalls === 1
          ? failingVerification(callerTasks[0]!, 'the test failed')
          : verification(callerTasks[0]!)
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const { report } = await runWorkflowScript(WORKFLOW_SCRIPT, args(callerTasks), agent)
    expect(report.status).toBe('completed')
    expect(report.tasks[0]!.attempts).toHaveLength(2)
    expect(report.tasks[0]!.attempts[0]!.passed).toBe(false)
    expect(report.tasks[0]!.attempts[1]!.passed).toBe(true)
    expect(report.confirmed).toHaveLength(1)
    expect(verifierCalls).toBe(2)
  })

  it('honors the configured concurrency cap across five tasks', async () => {
    const callerTasks = Array.from({ length: 5 }, (_, index) => task(`t${index}`))
    let active = 0
    let peak = 0
    const agent: ScriptAgent = async (_prompt, options) => {
      active += 1
      peak = Math.max(peak, active)
      try {
        await delay(8)
        if (options.label.startsWith('grok-worker-')) return execution('ok')
        if (options.label.startsWith('grok-verifier-')) {
          return verification(callerTasks.find(item => item.id === idFrom(options.label))!)
        }
        throw new Error(`unexpected label ${options.label}`)
      } finally {
        active -= 1
      }
    }
    const { report } = await runWorkflowScript(WORKFLOW_SCRIPT, args(callerTasks, { maxConcurrency: 2, maxTasks: 6 }), agent)
    expect(report.status).toBe('completed')
    expect(report.tasks).toHaveLength(5)
    expect(peak).toBe(2)
  })

  it('falls back to one task and cannot report fully clean completion when planning fails', async () => {
    const agent: ScriptAgent = async (_prompt, options) => {
      if (options.label === 'grok-planner') return { tasks: [] }
      if (options.label === 'grok-worker-task-1-a1') return execution('fallback completed')
      if (options.label === 'grok-verifier-task-1-a1') {
        return verification(task('task-1', ['The expected output is completed and supported by concrete evidence']))
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const { report } = await runWorkflowScript(WORKFLOW_SCRIPT, args(null), agent)
    expect(report.status).toBe('partial')
    expect(report.plan.source).toBe('fallback')
    expect(report.plan.error).toContain('planner returned no valid plan')
    expect(report.tasks).toHaveLength(1)
    expect(report.tasks[0]!.status).toBe('verified')
    expect(report.errors.some(error => error.phase === 'Plan')).toBe(true)
  })

  it('accepts a verified fallback report as partial through host validation', async () => {
    const agent: ScriptAgent = async (_prompt, options) => {
      if (options.label === 'grok-planner') throw new Error('planner unavailable')
      if (options.label === 'grok-worker-task-1-a1') return execution('fallback completed')
      if (options.label === 'grok-verifier-task-1-a1') {
        return verification(task('task-1', ['The expected output is completed and supported by concrete evidence']))
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const { report } = await runWorkflowScript(WORKFLOW_SCRIPT, args(null), agent)
    expect(report.status).toBe('partial')
    expect(report.plan.source).toBe('fallback')
    expect(report.plan.error).toContain('planner failed')

    const config = resolveConfig({ maxConcurrency: 2, maxRetries: 1, maxTasks: 6 })
    const validated = assertWorkflowReport(report, 'Ship the verified result', config)
    expect(validated.status).toBe('partial')
    expect(validated.plan.source).toBe('fallback')
    expect(validated.plan.error).toContain('planner failed')
    expect(validated.tasks.map(item => item.status)).toEqual(['verified'])
    expect(validated.errors).toContainEqual({
      phase: 'Plan',
      message: expect.stringContaining('planner failed'),
      // A host-side planner throw carries no engine code, so the class stays
      // 'unknown'; the category is reported honestly rather than guessed.
      category: 'unknown',
    })

    const nonFallback = { ...report, plan: { ...report.plan, source: 'planner' } }
    expect(() => assertWorkflowReport(nonFallback, 'Ship the verified result', config))
      .toThrow(/partial requires both verified and failed tasks/)

    const claimedCompleted = { ...report, status: 'completed' }
    expect(() => assertWorkflowReport(claimedCompleted, 'Ship the verified result', config))
      .toThrow(/cannot be completed from a fallback/)
  })

  it('rejects an aggregate planner payload over budget', async () => {
    const bad = Array.from({ length: 12 }, (_, index) => task(`t${index}`, Array.from(
      { length: 20 },
      (_, criterion) => `${criterion}`.padEnd(1000, 'x'),
    )))
    const agent: ScriptAgent = async (_prompt, options) => {
      if (options.label === 'grok-planner') return { tasks: bad }
      if (options.label === 'grok-worker-task-1-a1') return execution('fallback completed')
      if (options.label === 'grok-verifier-task-1-a1') {
        return verification(task('task-1', ['The expected output is completed and supported by concrete evidence']))
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const { report } = await runWorkflowScript(WORKFLOW_SCRIPT, args(null, { maxTasks: 12 }), agent)
    expect(report.plan.source).toBe('fallback')
    expect(report.plan.error).toContain('planner returned no valid plan')
  })

  it('rejects duplicate planner acceptance criteria instead of creating an impossible task', async () => {
    const bad = task('a', ['same', 'same'])
    const agent: ScriptAgent = async (_prompt, options) => {
      if (options.label === 'grok-planner') return { tasks: [bad] }
      if (options.label === 'grok-worker-task-1-a1') return execution('fallback completed')
      if (options.label === 'grok-verifier-task-1-a1') {
        return verification(task('task-1', ['The expected output is completed and supported by concrete evidence']))
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const { report } = await runWorkflowScript(WORKFLOW_SCRIPT, args(null), agent)
    expect(report.plan.source).toBe('fallback')
    expect(report.plan.error).toContain('planner returned no valid plan')
  })

  it('rejects an oversized planner task instead of truncating its criteria', async () => {
    const bad = task('a')
    bad.acceptanceCriteria = Array.from({ length: 21 }, (_, index) => `criterion ${index}`)
    const agent: ScriptAgent = async (_prompt, options) => {
      if (options.label === 'grok-planner') return { tasks: [bad] }
      if (options.label === 'grok-worker-task-1-a1') return execution('fallback completed')
      if (options.label === 'grok-verifier-task-1-a1') {
        return verification(task('task-1', ['The expected output is completed and supported by concrete evidence']))
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const { report } = await runWorkflowScript(WORKFLOW_SCRIPT, args(null), agent)
    expect(report.plan.source).toBe('fallback')
    expect(report.plan.error).toContain('planner returned no valid plan')
    expect(report.tasks).toHaveLength(1)
    expect(report.tasks[0]!.acceptanceCriteria).toEqual(['The expected output is completed and supported by concrete evidence'])
  })

  it('does not verify a task the executor reported as partial, even with a passing verifier', async () => {
    // t59: a /proc write that failed was planned as "attempt and report honestly",
    // verified against that rewritten criterion, and reported COMPLETED. A
    // self-reported partial/failed status is an admission: it must cap the task
    // at failed and the honest overall status at failed, no matter what the
    // verifier says about the rewritten criteria.
    const plannerTasks = [task('a')]
    let workerCalls = 0
    const agent: ScriptAgent = async (_prompt, options) => {
      if (options.label === 'grok-planner') return { tasks: plannerTasks }
      if (options.label.startsWith('grok-worker-')) {
        workerCalls += 1
        return execution('the write was blocked by the environment', { status: 'partial' })
      }
      if (options.label.startsWith('grok-verifier-')) return verification(plannerTasks[0]!)
      throw new Error(`unexpected agent label ${options.label}`)
    }

    const { report } = await runWorkflowScript(WORKFLOW_SCRIPT, args(null), agent)
    expect(report.status).toBe('failed')
    expect(report.tasks[0]!.status).toBe('failed')
    expect(report.tasks[0]!.error).toContain('executor reported partial')
    // One initial attempt plus the configured retry, and the retry still fails.
    expect(workerCalls).toBe(2)
    expect(report.incomplete.length).toBeGreaterThan(0)
  })

  it('reports failed when no task can be verified', async () => {
    const callerTasks = [task('a'), task('b')]
    const agent: ScriptAgent = async (_prompt, options) => {
      if (options.label.startsWith('grok-worker-')) return null
      throw new Error(`unexpected label ${options.label}`)
    }
    const { report } = await runWorkflowScript(WORKFLOW_SCRIPT, args(callerTasks), agent)
    expect(report.status).toBe('failed')
    expect(report.tasks.map(item => item.status)).toEqual(['failed', 'failed'])
    expect(report.confirmed).toHaveLength(0)
    expect(report.incomplete).toHaveLength(2)
  })

  it('redacts worker output and errors before verifier and retry prompts', async () => {
    const secret = ['sk', 'proj', 'FAKEEXAMPLE1234567890'].join('-')
    const apiValue = ['FAKE', 'VALUE', '123456'].join('')
    const callerTasks = [task('a')]
    let workerCalls = 0
    let verifierCalls = 0
    const agent: ScriptAgent = async (_prompt, options) => {
      if (options.label.startsWith('grok-worker-')) {
        workerCalls += 1
        return workerCalls === 1
          ? execution(`leaked ${secret} api_key=${apiValue}`)
          : execution('clean retry')
      }
      if (options.label.startsWith('grok-verifier-')) {
        verifierCalls += 1
        return verifierCalls === 1 ? failingVerification(callerTasks[0]!, 'first failure') : verification(callerTasks[0]!)
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const { report, calls } = await runWorkflowScript(WORKFLOW_SCRIPT, args(callerTasks), agent)
    const firstVerifier = calls.find(call => call.label === 'grok-verifier-a-a1')!
    const retryWorker = calls.find(call => call.label === 'grok-worker-a-a2')!
    expect(firstVerifier.prompt).not.toContain(secret)
    expect(firstVerifier.prompt).not.toContain(apiValue)
    expect(retryWorker.prompt).not.toContain(secret)
    expect(retryWorker.prompt).not.toContain(apiValue)
    expect(report.status).toBe('completed')
  })

  it('redacts database URL credentials and scoped tokens before verifier and retry prompts', async () => {
    const password = ['FAKE_DB_', 'PASSWORD'].join('')
    const gitlab = ['glpat-', 'FAKE_VALUE_FOR_REDACTION_TEST_ONLY'].join('')
    const npm = ['npm_', 'FAKE_VALUE_FOR_REDACTION_TEST_ONLY'].join('')
    const callerTasks = [task('a')]
    let workerCalls = 0
    let verifierCalls = 0
    const agent: ScriptAgent = async (_prompt, options) => {
      if (options.label.startsWith('grok-worker-')) {
        workerCalls += 1
        return workerCalls === 1
          ? execution(`connect failed postgres://demo_user:${password}@example.test/app ${gitlab} ${npm}`)
          : execution('clean retry')
      }
      if (options.label.startsWith('grok-verifier-')) {
        verifierCalls += 1
        return verifierCalls === 1 ? failingVerification(callerTasks[0]!, 'first failure') : verification(callerTasks[0]!)
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const { report, calls } = await runWorkflowScript(WORKFLOW_SCRIPT, args(callerTasks), agent)
    const firstVerifier = calls.find(call => call.label === 'grok-verifier-a-a1')!
    const retryWorker = calls.find(call => call.label === 'grok-worker-a-a2')!
    for (const prompt of [firstVerifier.prompt, retryWorker.prompt]) {
      expect(prompt).not.toContain(password)
      expect(prompt).not.toContain(gitlab)
      expect(prompt).not.toContain(npm)
      expect(prompt).toContain('[REDACTED]@')
    }
    expect(report.status).toBe('completed')
  })

  it('redacts worker exceptions before the retry prompt', async () => {
    const secret = ['sk', 'proj', 'FAKEEXAMPLE1234567890'].join('-')
    const callerTasks = [task('a')]
    let workerCalls = 0
    const agent: ScriptAgent = async (_prompt, options) => {
      if (options.label.startsWith('grok-worker-')) {
        workerCalls += 1
        if (workerCalls === 1) throw new Error(`worker failed with ${secret}`)
        return execution('retry succeeded')
      }
      if (options.label.startsWith('grok-verifier-')) return verification(callerTasks[0]!)
      throw new Error(`unexpected label ${options.label}`)
    }
    const { report, calls } = await runWorkflowScript(WORKFLOW_SCRIPT, args(callerTasks), agent)
    const retryWorker = calls.find(call => call.label === 'grok-worker-a-a2')!
    expect(retryWorker.prompt).not.toContain(secret)
    expect(report.status).toBe('completed')
  })

  it('rejects an overlong verifier criterion instead of truncating its suffix', async () => {
    const longCriterion = 'x'.repeat(1000)
    const callerTasks = [task('a', [longCriterion])]
    const agent: ScriptAgent = async (_prompt, options) => {
      if (options.label.startsWith('grok-worker-')) return execution('done')
      if (options.label.startsWith('grok-verifier-')) {
        return verification(callerTasks[0]!, {
          criteria: [{ criterion: `${longCriterion}EXTRA`, met: true, evidence: 'file:1' }],
        })
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const { report } = await runWorkflowScript(WORKFLOW_SCRIPT, args(callerTasks), agent)
    expect(report.status).toBe('failed')
    expect(report.tasks[0]!.error).toContain('criteria count does not match')
    expect(report.confirmed).toHaveLength(0)
  })

  it('rejects a malformed verifier pass that omits a criterion', async () => {
    const callerTasks = [task('a', ['first', 'second'])]
    const agent: ScriptAgent = async (_prompt, options) => {
      if (options.label.startsWith('grok-worker-')) return execution('done')
      if (options.label.startsWith('grok-verifier-')) {
        return verification(callerTasks[0]!, {
          criteria: [{ criterion: 'first', met: true, evidence: 'file:1' }],
        })
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const { report } = await runWorkflowScript(WORKFLOW_SCRIPT, args(callerTasks), agent)
    expect(report.status).toBe('failed')
    expect(report.tasks[0]!.error).toContain('criteria count does not match')
  })

  it('accepts a verifier criterion that differs only by trailing punctuation', async () => {
    const callerTasks = [task('a', ['alpha works'])]
    let workerCalls = 0
    const agent: ScriptAgent = async (_prompt, options) => {
      if (options.label.startsWith('grok-worker-')) {
        workerCalls += 1
        return execution('done')
      }
      if (options.label.startsWith('grok-verifier-')) {
        return verification(callerTasks[0]!, {
          criteria: [{ criterion: 'alpha works.', met: true, evidence: 'file:///tmp/proof' }],
        })
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const { report } = await runWorkflowScript(WORKFLOW_SCRIPT, args(callerTasks), agent)
    // Formatting drift no longer burns a retry: one attempt, verified.
    expect(workerCalls).toBe(1)
    expect(report.status).toBe('completed')
    expect(report.tasks[0]!.attempts).toHaveLength(1)
    // The report keeps the task's own criterion text, so host validation (which
    // compares confirmed evidence against the task criteria) still matches.
    expect(report.confirmed).toEqual([{ taskId: 'a', criterion: 'alpha works', evidence: 'file:///tmp/proof' }])
    const config = resolveConfig({ maxConcurrency: 2, maxRetries: 1, maxTasks: 6 })
    expect(assertWorkflowReport(report, 'Ship the verified result', config).status).toBe('completed')
  })

  it('accepts a verifier criterion that differs only by whitespace and case', async () => {
    const callerTasks = [task('a', ['Deploy the service to staging'])]
    let verifierCalls = 0
    const agent: ScriptAgent = async (_prompt, options) => {
      if (options.label.startsWith('grok-worker-')) return execution('deployed')
      if (options.label.startsWith('grok-verifier-')) {
        verifierCalls += 1
        return verification(callerTasks[0]!, {
          criteria: [{ criterion: '  deploy   THE service to   staging ', met: true, evidence: 'cmd:deploy' }],
        })
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const { report } = await runWorkflowScript(WORKFLOW_SCRIPT, args(callerTasks), agent)
    expect(verifierCalls).toBe(1)
    expect(report.status).toBe('completed')
    expect(report.tasks[0]!.attempts).toHaveLength(1)
  })

  it('still rejects a verifier criterion that names different content', async () => {
    const callerTasks = [task('a', ['alpha works'])]
    const agent: ScriptAgent = async (_prompt, options) => {
      if (options.label.startsWith('grok-worker-')) return execution('done')
      if (options.label.startsWith('grok-verifier-')) {
        return verification(callerTasks[0]!, {
          criteria: [{ criterion: 'beta works', met: true, evidence: 'file:1' }],
        })
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const { report } = await runWorkflowScript(WORKFLOW_SCRIPT, args(callerTasks), agent)
    expect(report.status).toBe('failed')
    expect(report.tasks[0]!.error).toContain('criterion not matched exactly once: alpha works')
    expect(report.confirmed).toHaveLength(0)
  })

  it('still rejects a verifier that reports one criterion twice', async () => {
    const callerTasks = [task('a', ['alpha works', 'beta works'])]
    const agent: ScriptAgent = async (_prompt, options) => {
      if (options.label.startsWith('grok-worker-')) return execution('done')
      if (options.label.startsWith('grok-verifier-')) {
        return verification(callerTasks[0]!, {
          criteria: [
            { criterion: 'alpha works', met: true, evidence: 'file:1' },
            { criterion: 'ALPHA works.', met: true, evidence: 'file:2' },
          ],
        })
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const { report } = await runWorkflowScript(WORKFLOW_SCRIPT, args(callerTasks), agent)
    expect(report.status).toBe('failed')
    expect(report.tasks[0]!.error).toContain('criterion not matched exactly once: alpha works')
    expect(report.confirmed).toHaveLength(0)
  })

  it('does not collapse criteria that differ only in trailing words', async () => {
    const callerTasks = [task('a', ['the file exists', 'the file exists with content'])]
    const agent: ScriptAgent = async (_prompt, options) => {
      if (options.label.startsWith('grok-worker-')) return execution('done')
      if (options.label.startsWith('grok-verifier-')) {
        return verification(callerTasks[0]!, {
          criteria: [
            { criterion: 'the file exists', met: true, evidence: 'file:1' },
            { criterion: 'the file exists', met: true, evidence: 'file:2' },
          ],
        })
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const { report } = await runWorkflowScript(WORKFLOW_SCRIPT, args(callerTasks), agent)
    expect(report.status).toBe('failed')
    expect(report.tasks[0]!.error).toContain('criterion not matched exactly once: the file exists with content')
  })

  it('redacts the objective before the planner prompt', async () => {
    const secret = ['sk', 'proj', 'FAKEEXAMPLE1234567890'].join('-')
    const plannerTasks = [task('a')]
    const agent: ScriptAgent = async (_prompt, options) => {
      if (options.label === 'grok-planner') return { tasks: plannerTasks }
      if (options.label.startsWith('grok-worker-')) return execution('done')
      if (options.label.startsWith('grok-verifier-')) return verification(plannerTasks[0]!)
      throw new Error(`unexpected label ${options.label}`)
    }
    const objective = `Ship the result for token ${secret}`
    const { report, calls } = await runWorkflowScript(WORKFLOW_SCRIPT, args(null, { objective }), agent)
    const planner = calls.find(call => call.label === 'grok-planner')!
    expect(planner.prompt).not.toContain(secret)
    expect(planner.prompt).toContain('[REDACTED API KEY]')
    // The script returns the objective verbatim; the host redacts it at the
    // boundary before any of it reaches the model.
    expect(report.objective).toContain(secret)
    expect(redactDeep(report).objective).not.toContain(secret)
  })

  it('rejects a planner task whose criteria collide after normalization', async () => {
    const bad = task('a', ['same criterion.', 'Same criterion'])
    const agent: ScriptAgent = async (_prompt, options) => {
      if (options.label === 'grok-planner') return { tasks: [bad] }
      if (options.label === 'grok-worker-task-1-a1') return execution('fallback completed')
      if (options.label === 'grok-verifier-task-1-a1') {
        return verification(task('task-1', ['The expected output is completed and supported by concrete evidence']))
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const { report } = await runWorkflowScript(WORKFLOW_SCRIPT, args(null), agent)
    expect(report.plan.source).toBe('fallback')
    expect(report.plan.error).toContain('planner returned no valid plan')
    expect(report.tasks).toHaveLength(1)
  })
})
