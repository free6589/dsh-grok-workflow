/**
 * Planner-failure fallback: the objective must survive planning degradation as
 * bounded task shards. Each shard obeys TASK_LIMITS.taskTextChars, the shards
 * concatenate back to the original objective byte for byte, and the same
 * origin_goal_id links every shard to the one original goal.
 *
 * These cases run the real generated workflow script in a VM with a failing
 * planner and scripted workers/verifiers; no model API is called.
 */
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { assertWorkflowReport } from '../src/report.js'
import { buildWorkflowRequest, WORKFLOW_SCRIPT } from '../src/script.js'
import type { WorkflowReport } from '../src/types.js'
import { execution, task, verification } from './fixtures.js'
import { roleOf, runWorkflowScript, type ScriptAgent } from './helpers.js'

const TASK_TEXT_LIMIT = 4_000
const FALLBACK_CRITERION = 'The expected output is completed and supported by concrete evidence'

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

async function runFallback(objective: string, overrides: Record<string, unknown> = {}): Promise<{
  report: WorkflowReport
  validated: WorkflowReport
  config: ReturnType<typeof resolveConfig>
}> {
  const config = resolveConfig({ maxTasks: 6, ...overrides })
  const request = buildWorkflowRequest(objective, undefined, config)
  const agent: ScriptAgent = async (prompt, options) => {
    if (roleOf(options.label) === 'planner') throw new Error('planner unavailable')
    if (roleOf(options.label) === 'worker') return execution('segment done')
    if (roleOf(options.label) === 'verifier') {
      return verification(task('fallback', [FALLBACK_CRITERION]))
    }
    throw new Error(`unexpected label ${options.label}`)
  }
  const { report } = await runWorkflowScript(request.script, request.args as Record<string, unknown>, agent)
  const validated = assertWorkflowReport(report, objective, config)
  return { report, validated, config }
}

describe('planner-failure fallback shards', () => {
  it.each([4_001, 20_000, 32_000])(
    'splits a %i-character objective into bounded shards whose concatenation has the original SHA-256',
    async (chars) => {
      const objective = 'x'.repeat(chars)
      const { report, validated } = await runFallback(objective)

      expect(validated.plan.source).toBe('fallback')
      expect(validated.plan.error ?? '').toContain('planner failed')
      expect(validated.status).toBe('partial')

      const expectedShards = Math.ceil(chars / TASK_TEXT_LIMIT)
      expect(validated.plan.tasks).toHaveLength(expectedShards)
      const segments = validated.plan.tasks.map(item => item.objective)
      expect(segments.join('')).toBe(objective)
      expect(sha256(segments.join(''))).toBe(sha256(objective))
      expect(validated.tasks).toHaveLength(expectedShards)

      for (const planTask of validated.plan.tasks) {
        expect(planTask.objective.length).toBeLessThanOrEqual(TASK_TEXT_LIMIT)
        expect(planTask.expectedOutput.length).toBeLessThanOrEqual(TASK_TEXT_LIMIT)
        expect(planTask.context.length).toBeLessThanOrEqual(TASK_TEXT_LIMIT)
        expect(planTask.title.length).toBeLessThanOrEqual(160)
        expect(planTask.originGoalId).toBeTruthy()
        expect(planTask.context).toContain(`origin_goal_id: ${planTask.originGoalId}`)
      }
      expect(new Set(validated.plan.tasks.map(item => item.originGoalId)).size).toBe(1)
      // The raw script report carries the same shard fields before host parsing.
      expect(report.plan.tasks.map(item => item.objective).join('')).toBe(objective)
    },
  )

  it('accepts the 8-shard fallback even when the configured maxTasks is 1', async () => {
    const objective = 'x'.repeat(32_000)
    const { validated } = await runFallback(objective, { maxTasks: 1 })

    expect(validated.plan.tasks).toHaveLength(8)
    expect(validated.plan.tasks.map(item => item.objective).join('')).toBe(objective)
    expect(validated.plan.tasks.every(item => item.objective.length <= TASK_TEXT_LIMIT)).toBe(true)
  })

  it('preserves multi-byte text when a shard boundary falls inside a surrogate pair', async () => {
    const pattern = '段落🙂 abc\n'
    const objective = pattern.repeat(Math.ceil(4_001 / pattern.length)).slice(0, 4_001)
    const { validated } = await runFallback(objective)

    const concat = validated.plan.tasks.map(item => item.objective).join('')
    expect(concat).toBe(objective)
    expect(sha256(concat)).toBe(sha256(objective))
    expect(validated.plan.tasks.every(item => item.objective.length <= TASK_TEXT_LIMIT)).toBe(true)
  })

  it('produces one task for an objective at the per-task bound', async () => {
    const objective = 'x'.repeat(TASK_TEXT_LIMIT)
    const { validated } = await runFallback(objective)

    expect(validated.plan.tasks).toHaveLength(1)
    expect(validated.plan.tasks[0]!.objective).toBe(objective)
  })

  it('keeps the generated script free of a 4000-character objective rejection branch', () => {
    expect(WORKFLOW_SCRIPT).toContain('objectiveChars: 32000')
    expect(WORKFLOW_SCRIPT).not.toMatch(/objectiveChars:\s*4_?000/)
    expect(WORKFLOW_SCRIPT).not.toContain('objective <= 4000')
  })
})
