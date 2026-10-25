import { describe, expect, it } from 'vitest'
import { WORKFLOW_SCRIPT } from '../src/script.js'
import { delay, runWorkflowScript, type ScriptAgent } from './helpers.js'
import { execution, failingVerification, task, verification } from './fixtures.js'

function args(tasks: unknown[] | null, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    objective: 'Ship the verified result',
    tasks,
    maxConcurrency: 2,
    maxRetries: 1,
    maxTasks: 6,
    maxTotalAgents: 30,
    ...overrides,
  }
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
    expect(report.incomplete).toEqual([{ taskId: 'broken', reason: expect.stringContaining('no valid structured result') }])
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
})
