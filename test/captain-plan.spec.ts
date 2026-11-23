import { describe, expect, it } from 'vitest'
import { WORKFLOW_SCRIPT } from '../src/script.js'
import { captainAnswer, amendRequest, captainPreviewPrompt, captainAskText } from '../src/captain.js'
import { runWorkflowScript, roleOf, idOfPhase, type ScriptAgent } from './helpers.js'
import { execution, failingVerification, task, verification } from './fixtures.js'

/**
 * The captain's plan (round-071): the model owns the split, the order and the
 * continue/stop call; the script keeps only the shape gate.
 *
 * The behavioural case is deliberately about *scheduling*, not wording: a plan the
 * captain marked `onFailure: 'stop'` must not dispatch the wave after a failed one,
 * and every task that did not run still needs its row (the report requires one).
 */

/** Minimal run arguments the generated script reads (mirrors the request builder). */
function args(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    objective: 'Ship the verified result',
    tasks: null,
    maxConcurrency: 2,
    maxRetries: 1,
    maxTasks: 6,
    maxTotalAgents: 40,
    childTimeoutMs: 7_200_000,
    ...overrides,
  }
}

/** A planner plan of two waves, each holding one fixture task. */
function twoWaves(onFailure: string): Record<string, unknown> {
  return { waves: [[task('a')], [task('b')]], onFailure }
}

describe('captain plan: the model decides the split, the order and continue/stop', () => {
  it('honours a captain stop: the wave after a failed task is never dispatched', async () => {
    const calls: string[] = []
    const agent: ScriptAgent = async (_prompt, options) => {
      const role = roleOf(options.label)
      calls.push(`${role}:${options.phase ?? ''}`)
      if (role === 'planner') return twoWaves('stop')
      if (role === 'worker') return execution(`worker ${idOfPhase(options.phase)}`)
      if (role === 'verifier') {
        // Task "a" fails verification; task "b" would pass but must never be asked.
        return idOfPhase(options.phase) === 'a'
          ? failingVerification(task('a'))
          : verification(task('b'))
      }
      throw new Error(`unexpected label ${options.label}`)
    }

    const { report, calls: made } = await runWorkflowScript(WORKFLOW_SCRIPT, args(), agent)
    const workerPhases = made.filter(call => roleOf(call.label) === 'worker').map(call => call.phase)
    // The captain's decision is what kept wave 2 from running: no worker for "b".
    expect(workerPhases.some(phase => String(phase).includes('b'))).toBe(false)
    // Both plan rows exist, and the one that never started says why.
    expect(report.tasks.map(row => row.status)).toEqual(['failed', 'blocked'])
    const stopped = report.tasks.find(row => row.id === 'b')!
    expect(stopped.error).toContain('the captain ended this plan')
    expect(stopped.error).toContain('a')
    // Nothing verified and the plan was not the degraded one: an honest failure.
    expect(report.status).toBe('failed')
    expect(report.incomplete.map(row => row.taskId).sort()).toEqual(['a', 'b'])
  })

  it('keeps the pre-round-071 behaviour when the captain says continue', async () => {
    const agent: ScriptAgent = async (_prompt, options) => {
      const role = roleOf(options.label)
      if (role === 'planner') return twoWaves('continue')
      if (role === 'worker') return execution(`worker ${idOfPhase(options.phase)}`)
      if (role === 'verifier') {
        return idOfPhase(options.phase) === 'a'
          ? failingVerification(task('a'))
          : verification(task('b'))
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const { report, calls } = await runWorkflowScript(WORKFLOW_SCRIPT, args(), agent)
    const workerPhases = calls.filter(call => roleOf(call.label) === 'worker').map(call => String(call.phase))
    expect(workerPhases.some(phase => phase.includes('b'))).toBe(true)
    expect(report.tasks.map(row => row.status)).toEqual(['failed', 'verified'])
    expect(report.status).toBe('partial')
  })

  it('treats an unusable onFailure value as continue instead of rejecting the plan', async () => {
    const agent: ScriptAgent = async (_prompt, options) => {
      const role = roleOf(options.label)
      if (role === 'planner') return { tasks: [task('a'), task('b')], onFailure: 'maybe' }
      if (role === 'worker') return execution(`worker ${idOfPhase(options.phase)}`)
      if (role === 'verifier') return verification(task(idOfPhase(options.phase) as 'a' | 'b'))
      throw new Error(`unexpected label ${options.label}`)
    }
    const { report } = await runWorkflowScript(WORKFLOW_SCRIPT, args(), agent)
    expect(report.plan.source).toBe('planner')
    expect(report.tasks.map(row => row.status)).toEqual(['verified', 'verified'])
    expect(report.status).toBe('completed')
  })

  it('carries the captain charter and the continue/stop field, not the removed hard rule', async () => {
    const agent: ScriptAgent = async (_prompt, options) => {
      const role = roleOf(options.label)
      if (role === 'planner') return { tasks: [task('a')] }
      if (role === 'worker') return execution('done')
      if (role === 'verifier') return verification(task('a'))
      throw new Error(`unexpected label ${options.label}`)
    }
    const { calls } = await runWorkflowScript(WORKFLOW_SCRIPT, args(), agent)
    const plannerPrompt = calls.find(call => roleOf(call.label) === 'planner')!.prompt
    expect(plannerPrompt).toContain('You are the captain')
    expect(plannerPrompt).toContain('You decide the split')
    expect(plannerPrompt).toContain('onFailure')
    // The old script told the planner what to answer; that instruction is gone.
    expect(plannerPrompt).not.toContain('return exactly one task')
    // The shape gate stays: limits are still stated as limits, not as a plan.
    expect(plannerPrompt).toContain('These limits are the gate, not the plan')
  })

  it('shows the captain memory to the planner only when the host passed it', async () => {
    const agent: ScriptAgent = async (_prompt, options) => {
      const role = roleOf(options.label)
      if (role === 'planner') return { tasks: [task('a')] }
      if (role === 'worker') return execution('done')
      if (role === 'verifier') return verification(task('a'))
      throw new Error(`unexpected label ${options.label}`)
    }
    const withMemory = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({ captain: 'CAPTAIN MEMORY: user prefers Chinese replies' }),
      agent,
    )
    const without = await runWorkflowScript(WORKFLOW_SCRIPT, args(), agent)
    const promptOf = (run: typeof withMemory): string => run.calls.find(call => roleOf(call.label) === 'planner')!.prompt
    expect(promptOf(withMemory)).toContain('user prefers Chinese replies')
    expect(promptOf(without)).not.toContain('CAPTAIN MEMORY')
  })
})

describe('captain answer semantics', () => {
  it('reads a bare approval as approval and an edit as an edit', () => {
    for (const text of ['确认', '确认吧。', '开干', '好的', 'ok', 'approve', '请确认']) {
      expect(captainAnswer(text), text).toBe('approve')
    }
    for (const text of ['确认，改成两个任务', '不要拆了', '先做验证部分', 'instead do it in one task']) {
      expect(captainAnswer(text), text).toBe('amend')
    }
    for (const text of ['你好', '再帮我查一下别的', '确认一下这个文件是什么', '']) {
      expect(captainAnswer(text), text).toBe('other')
    }
  })

  it('keeps the original request when folding an amendment in', () => {
    const combined = amendRequest('重构超时逻辑', '改成先写测试')
    expect(combined).toContain('重构超时逻辑')
    expect(combined).toContain('改成先写测试')
    expect(combined).toContain('USER AMENDMENT')
  })

  it('asks for a split in the user\'s language and bounds the preview', () => {
    expect(captainPreviewPrompt('做一件事')).toContain('CAPTAIN SPLIT PREVIEW')
    expect(captainAskText('zh', '任务一：读代码')).toContain('队长先报拆法')
    expect(captainAskText('en', 'Task one: read the code')).toContain('Reply "confirm"')
  })
})
