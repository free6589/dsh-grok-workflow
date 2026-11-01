/**
 * Planner-failure fallback: the objective must survive planning degradation as
 * bounded task segments. Each segment obeys TASK_LIMITS.taskTextChars, the
 * segments concatenate back to the original objective byte for byte, and the
 * same origin_goal_id links every segment to the one original goal.
 *
 * These cases run the real generated workflow script in a VM with a failing
 * planner and scripted workers/verifiers; no model API is called.
 */
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { TASK_LIMITS } from '../src/input.js'
import { assertWorkflowReport } from '../src/report.js'
import { buildWorkflowRequest, WORKFLOW_SCRIPT } from '../src/script.js'
import { shardCountFor, splitObjective } from '../src/shards.js'
import type { WorkflowReport } from '../src/types.js'
import { execution, verification } from './fixtures.js'
import { roleOf, runWorkflowScript, taskFromPrompt, type ScriptAgent } from './helpers.js'

const TASK_TEXT_LIMIT = 4_000
const SINGLE_CRITERION = 'The expected output is completed and supported by concrete evidence'

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

/**
 * Run the real script with a planner that always fails.
 *
 * The scripted verifier answers the task it was actually handed (`taskFromPrompt`)
 * instead of a hard-coded criterion, so these cases keep testing the fallback and
 * not a copy of its wording.
 */
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
    if (roleOf(options.label) === 'verifier') return verification(taskFromPrompt(prompt))
    throw new Error(`unexpected label ${options.label}`)
  }
  const { report } = await runWorkflowScript(request.script, request.args as Record<string, unknown>, agent)
  const validated = assertWorkflowReport(report, objective, config)
  return { report, validated, config }
}

/** An objective whose surrogate pairs straddle every `taskTextChars` boundary. */
function surrogateHeavyObjective(chars: number): string {
  const units = 'a'.repeat(chars).split('')
  for (let boundary = TASK_TEXT_LIMIT; boundary < chars; boundary += TASK_TEXT_LIMIT) {
    units[boundary - 1] = '\uD83D'
    units[boundary] = '\uDE42'
  }
  return units.join('')
}

describe('planner-failure fallback segments', () => {
  it.each([4_000, 4_001, 20_000, 32_000])(
    'splits a %i-character objective into bounded segments whose concatenation has the original SHA-256',
    async (chars) => {
      const objective = 'x'.repeat(chars)
      const { report, validated } = await runFallback(objective)

      expect(validated.plan.source).toBe('fallback')
      expect(validated.plan.error ?? '').toContain('planner failed')
      expect(validated.status).toBe('partial')

      // The count is the splitter's, which is what host validation re-derives.
      const expectedSegments = shardCountFor(objective, TASK_TEXT_LIMIT)
      expect(validated.plan.tasks).toHaveLength(expectedSegments)
      const segments = validated.plan.tasks.map(item => item.objective)
      expect(segments.join('')).toBe(objective)
      expect(sha256(segments.join(''))).toBe(sha256(objective))
      expect(validated.tasks).toHaveLength(expectedSegments)

      for (const planTask of validated.plan.tasks) {
        expect(planTask.objective.length).toBeLessThanOrEqual(TASK_TEXT_LIMIT)
        expect(planTask.expectedOutput.length).toBeLessThanOrEqual(TASK_TEXT_LIMIT)
        expect(planTask.context.length).toBeLessThanOrEqual(TASK_TEXT_LIMIT)
        expect(planTask.title.length).toBeLessThanOrEqual(160)
        expect(planTask.originGoalId).toBeTruthy()
        expect(planTask.context).toContain(`origin_goal_id: ${planTask.originGoalId}`)
      }
      expect(new Set(validated.plan.tasks.map(item => item.originGoalId)).size).toBe(1)
      // The raw script report carries the same segment fields before host parsing.
      expect(report.plan.tasks.map(item => item.objective).join('')).toBe(objective)
    },
  )

  it('balances a 4,001-character objective instead of leaving a one-character task', async () => {
    const { validated } = await runFallback('x'.repeat(4_001))

    const lengths = validated.plan.tasks.map(item => item.objective.length)
    expect(lengths).toEqual([2_001, 2_000])
    // The whole point: no task is a stub that a worker cannot act on.
    expect(Math.min(...lengths)).toBeGreaterThan(1_000)
  })

  it('moves a segment boundary onto the sentence end it lands near', async () => {
    const sentence = '这是第一句。这是第二句！段落在这里结束。'
    const objective = sentence.repeat(200).slice(0, 4_001)
    const { validated } = await runFallback(objective)

    const segments = validated.plan.tasks.map(item => item.objective)
    expect(segments.join('')).toBe(objective)
    expect(segments[0]).toMatch(/[。！]$/)
    expect(segments.every(item => item.length <= TASK_TEXT_LIMIT)).toBe(true)
  })

  it('moves a segment boundary onto the word break it lands near', async () => {
    const objective = 'alpha beta gamma delta epsilon zeta eta theta iota kappa '.repeat(100).slice(0, 4_001)
    const { validated } = await runFallback(objective)

    const segments = validated.plan.tasks.map(item => item.objective)
    expect(segments.join('')).toBe(objective)
    expect(segments[0]!.endsWith(' ')).toBe(true)
    expect(segments.every(item => item.length <= TASK_TEXT_LIMIT)).toBe(true)
  })

  it('accepts the fallback even when the configured maxTasks is 1', async () => {
    const objective = 'x'.repeat(32_000)
    const { validated } = await runFallback(objective, { maxTasks: 1 })

    expect(validated.plan.tasks).toHaveLength(shardCountFor(objective, TASK_TEXT_LIMIT))
    expect(validated.plan.tasks.map(item => item.objective).join('')).toBe(objective)
    expect(validated.plan.tasks.every(item => item.objective.length <= TASK_TEXT_LIMIT)).toBe(true)
  })

  it('keeps a surrogate pair whole and each segment valid UTF-8 at a boundary', async () => {
    const pattern = '段落🙂 abc\n'
    const objective = pattern.repeat(Math.ceil(4_001 / pattern.length)).slice(0, 4_001)
    const { validated } = await runFallback(objective)

    const segments = validated.plan.tasks.map(item => item.objective)
    expect(segments.join('')).toBe(objective)
    expect(sha256(segments.join(''))).toBe(sha256(objective))
    for (const segment of segments) {
      // A half pair would come back as U+FFFD instead of the original text.
      expect(Buffer.from(segment, 'utf8').toString('utf8')).toBe(segment)
      expect(segment.length).toBeLessThanOrEqual(TASK_TEXT_LIMIT)
    }
  })

  it('accepts the extra segment that surrogate back-off adds at every boundary', async () => {
    // Eight 4,000-character windows, each boundary splitting a surrogate pair, so
    // the splitter backs every boundary off by one and needs nine segments.
    // Budgeting from `ceil(chars / taskTextChars)` alone (8) rejected this
    // fallback as "over the task cap" even though every segment was legal.
    const objective = surrogateHeavyObjective(32_000)
    const expected = shardCountFor(objective, TASK_TEXT_LIMIT)

    expect(expected).toBeGreaterThan(Math.ceil(objective.length / TASK_TEXT_LIMIT))
    const { validated } = await runFallback(objective)
    expect(validated.plan.tasks).toHaveLength(expected)
    expect(validated.plan.tasks.map(item => item.objective).join('')).toBe(objective)
    expect(validated.plan.tasks.every(item => item.objective.length <= TASK_TEXT_LIMIT)).toBe(true)
  })

  it('accepts a 32,000-character objective dense in JSON escapes', async () => {
    // Every character is a quote, so the serialized plan is roughly twice the
    // objective and runs past the 48,000-character aggregate budget that bounds
    // *authored* task text. The fallback carries the caller's own 32,000
    // characters and nothing more, so escaping must not decide whether it runs.
    const objective = '"'.repeat(32_000)
    const { report, validated } = await runFallback(objective)

    expect(JSON.stringify(report.plan.tasks).length).toBeGreaterThan(TASK_LIMITS.aggregateChars)
    expect(validated.plan.tasks.map(item => item.objective).join('')).toBe(objective)
    expect(validated.plan.tasks.every(item => item.objective.length <= TASK_TEXT_LIMIT)).toBe(true)
  })

  it('produces one task for an objective at the per-task bound', async () => {
    const objective = 'x'.repeat(TASK_TEXT_LIMIT)
    const { validated } = await runFallback(objective)

    expect(validated.plan.tasks).toHaveLength(1)
    expect(validated.plan.tasks[0]!.objective).toBe(objective)
  })

  it('scopes each segment criterion to its segment and keeps the single-task criterion whole', async () => {
    const { validated: many } = await runFallback('x'.repeat(8_001))
    expect(many.plan.tasks.length).toBeGreaterThan(1)
    many.plan.tasks.forEach((planTask, index) => {
      expect(planTask.acceptanceCriteria).toEqual([
        `Objective segment ${index + 1}/${many.plan.tasks.length} is carried out and supported by concrete evidence`,
      ])
      // The segment says it is one piece of one goal, so a verifier can confirm
      // the segment without standing in for the whole objective.
      expect(planTask.context).toContain('cannot establish that the whole objective was met')
    })

    const { validated: one } = await runFallback('x'.repeat(TASK_TEXT_LIMIT))
    expect(one.plan.tasks[0]!.acceptanceCriteria).toEqual([SINGLE_CRITERION])
    expect(one.plan.tasks[0]!.context).not.toContain('cannot establish')
  })

  it('rejects a fallback plan whose segments are not the splitter\'s segments', async () => {
    const objective = 'x'.repeat(8_001)
    const { report, config } = await runFallback(objective)
    expect(() => assertWorkflowReport(report, objective, config)).not.toThrow()

    // Shift one character across the first boundary: the concatenation still
    // reproduces the objective, but the segments are no longer what the splitter
    // produced, so the report is not the fallback the script was asked to build.
    const shifted = structuredClone(report) as WorkflowReport
    const first = shifted.plan.tasks[0]!.objective
    const second = shifted.plan.tasks[1]!.objective
    const moved = first + second.slice(0, 1)
    shifted.plan.tasks[0]!.objective = moved
    shifted.plan.tasks[1]!.objective = second.slice(1)
    shifted.tasks[0]!.objective = moved
    shifted.tasks[1]!.objective = second.slice(1)

    expect(shifted.plan.tasks.map(item => item.objective).join('')).toBe(objective)
    expect(() => assertWorkflowReport(shifted, objective, config)).toThrow(/not segment 1 of the request objective/)
  })

  it('keeps the generated script free of a 4000-character objective rejection branch', () => {
    expect(WORKFLOW_SCRIPT).toContain('objectiveChars: 32000')
    expect(WORKFLOW_SCRIPT).not.toMatch(/objectiveChars:\s*4_?000/)
    expect(WORKFLOW_SCRIPT).not.toContain('objective <= 4000')
  })

  it('injects the host splitter into the script instead of a second copy', () => {
    // The script realm cannot import host code, so the splitter is rendered into
    // it. Both sides must agree on the segmentation for the same objective, which
    // is what makes the report check exact.
    for (const objective of ['x'.repeat(8_001), surrogateHeavyObjective(9_000), 'a b c。'.repeat(2_000)]) {
      const fromHost = splitObjective(objective, TASK_TEXT_LIMIT)
      expect(fromHost.join('')).toBe(objective)
      expect(fromHost.length).toBe(shardCountFor(objective, TASK_TEXT_LIMIT))
    }
    expect(WORKFLOW_SCRIPT).toContain('const splitObjective = ')
  })
})
