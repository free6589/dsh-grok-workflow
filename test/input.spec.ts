import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { normalizeCallerTasks, TASK_LIMITS } from '../src/input.js'

describe('caller task validation', () => {
  it('defaults ids and trims inputs', () => {
    const tasks = normalizeCallerTasks([
      {
        title: '  Scan  ',
        objective: ' Find TODOs ',
        expectedOutput: ' A list ',
        acceptanceCriteria: [' paths exist ', ''],
        context: ' repo root ',
        constraints: [' read-only '],
      },
    ], 6)
    expect(tasks).toEqual([{
      id: 'task-1',
      title: 'Scan',
      objective: 'Find TODOs',
      expectedOutput: 'A list',
      acceptanceCriteria: ['paths exist'],
      context: 'repo root',
      constraints: ['read-only'],
    }])
  })

  it('rejects duplicate ids', () => {
    expect(() => normalizeCallerTasks([
      { id: 'same', title: 'a', objective: 'a', expectedOutput: 'a', acceptanceCriteria: ['a'] },
      { id: 'same', title: 'b', objective: 'b', expectedOutput: 'b', acceptanceCriteria: ['b'] },
    ], 6)).toThrow(/duplicate task id/)
  })

  it('rejects empty criteria, missing fields, and dependencies', () => {
    expect(() => normalizeCallerTasks([
      { title: 'a', objective: 'a', expectedOutput: 'a', acceptanceCriteria: [] },
    ], 6)).toThrow(/at least one/)
    expect(() => normalizeCallerTasks([
      { title: '', objective: 'a', expectedOutput: 'a', acceptanceCriteria: ['a'] },
    ], 6)).toThrow(/title/)
    expect(() => normalizeCallerTasks([
      { title: 'a', objective: 'a', expectedOutput: 'a', acceptanceCriteria: ['a'], dependsOn: ['b'] } as never,
    ], 6)).toThrow(/dependsOn/)
  })

  it('enforces maxTasks', () => {
    const tasks = Array.from({ length: 3 }, (_, index) => ({
      title: `t${index}`, objective: 'o', expectedOutput: 'e', acceptanceCriteria: ['c'],
    }))
    expect(() => normalizeCallerTasks(tasks, 2)).toThrow(/maxTasks/)
  })
  it('rejects oversized criteria and task text instead of truncating it', () => {
    const base = { title: 't', objective: 'o', expectedOutput: 'e' }
    const tooManyCriteria = Array.from({ length: TASK_LIMITS.criteriaItems + 1 }, (_, index) => `c${index}`)
    expect(() => normalizeCallerTasks([{ ...base, acceptanceCriteria: tooManyCriteria }], 6))
      .toThrow(/acceptanceCriteria must contain at most 20 items/)

    const tooLongCriterion = 'x'.repeat(TASK_LIMITS.criteriaChars + 1)
    expect(() => normalizeCallerTasks([{ ...base, acceptanceCriteria: [tooLongCriterion] }], 6))
      .toThrow(/acceptanceCriteria\[0\] must be at most 1000 characters/)

    expect(() => normalizeCallerTasks([{
      ...base,
      title: 'x'.repeat(TASK_LIMITS.titleChars + 1),
      acceptanceCriteria: ['c'],
    }], 6)).toThrow(/title must be at most 160 characters/)

    const tooManyConstraints = Array.from({ length: TASK_LIMITS.constraintItems + 1 }, (_, index) => `c${index}`)
    expect(() => normalizeCallerTasks([{ ...base, acceptanceCriteria: ['c'], constraints: tooManyConstraints }], 6))
      .toThrow(/constraints must contain at most 20 items/)
  })

  it('accepts values exactly at the declared bounds', () => {
    const criteria = Array.from({ length: TASK_LIMITS.criteriaItems }, (_, index) => `${index}`.padEnd(TASK_LIMITS.criteriaChars, 'x'))
    const tasks = normalizeCallerTasks([{
      title: 'x'.repeat(TASK_LIMITS.titleChars),
      objective: 'o'.repeat(TASK_LIMITS.taskTextChars),
      expectedOutput: 'e'.repeat(TASK_LIMITS.taskTextChars),
      acceptanceCriteria: criteria,
      context: 'c'.repeat(TASK_LIMITS.taskTextChars),
    }], 6)
    expect(tasks?.[0]?.acceptanceCriteria).toHaveLength(TASK_LIMITS.criteriaItems)
    expect(tasks?.[0]?.objective).toHaveLength(TASK_LIMITS.taskTextChars)
  })
})

describe('configuration limits', () => {
  it('applies safe defaults', () => {
    expect(resolveConfig()).toMatchObject({
      toolName: 'grok_workflow',
      maxConcurrency: 3,
      maxRetries: 1,
      maxTasks: 6,
      timeoutMs: 1_800_000,
      maxActiveRuns: 2,
    })
  })

  it('rejects values above the hard cap', () => {
    expect(() => resolveConfig({ maxConcurrency: 7 })).toThrow(/maxConcurrency/)
    expect(() => resolveConfig({ maxRetries: 4 })).toThrow(/maxRetries/)
    expect(() => resolveConfig({ maxTasks: 13 })).toThrow(/maxTasks/)
    expect(() => resolveConfig({ toolName: 'Bad Name' })).toThrow(/toolName/)
  })
})
