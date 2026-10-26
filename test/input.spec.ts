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
      writesPaths: null,
    }])
  })

  it('accepts write paths, normalizes them, and refuses malformed ones', () => {
    // U-4, caller side: a caller states its write paths explicitly, so a malformed
    // declaration is an input error (a planner answer degrades to "unknown"
    // instead, because losing a task is worse than serializing it).
    const ok = normalizeCallerTasks([{
      title: 'Doc', objective: 'Write it', expectedOutput: 'File',
      acceptanceCriteria: ['exists'], writesPaths: ['docs/A.md', './docs/a.md', 'lib'],
    }], 6)
    expect(ok?.at(0)?.writesPaths).toEqual(['docs/a.md', 'lib'])
    const empty = normalizeCallerTasks([{
      title: 'Read', objective: 'Read it', expectedOutput: 'Answer',
      acceptanceCriteria: ['given'], writesPaths: [],
    }], 6)
    expect(empty?.at(0)?.writesPaths).toEqual([])
    const absent = normalizeCallerTasks([{
      title: 'Unknown', objective: 'Do it', expectedOutput: 'Done',
      acceptanceCriteria: ['works'],
    }], 6)
    expect(absent?.at(0)?.writesPaths).toBeNull()
    const malformed: unknown[] = ['docs/a.md', [1], ['x'.repeat(301)], Array.from({ length: 17 }, () => 'p')]
    for (const bad of malformed) {
      expect(() => normalizeCallerTasks([{
        title: 'Bad', objective: 'Do it', expectedOutput: 'Done',
        acceptanceCriteria: ['works'], writesPaths: bad,
      } as never], 6)).toThrow(/writesPaths/)
    }
  })

  it('rejects duplicate ids', () => {
    expect(() => normalizeCallerTasks([
      { id: 'same', title: 'a', objective: 'a', expectedOutput: 'a', acceptanceCriteria: ['a'] },
      { id: 'same', title: 'b', objective: 'b', expectedOutput: 'b', acceptanceCriteria: ['b'] },
    ], 6)).toThrow(/duplicate task id/)
  })

  it('rejects duplicate acceptance criteria', () => {
    expect(() => normalizeCallerTasks([
      { title: 'x', objective: 'x', expectedOutput: 'x', acceptanceCriteria: ['same', 'same'] },
    ], 6)).toThrow(/acceptanceCriteria must not contain duplicates/)
  })

  it('rejects acceptance criteria that collide after normalization', () => {
    expect(() => normalizeCallerTasks([
      { title: 'x', objective: 'x', expectedOutput: 'x', acceptanceCriteria: ['Do X.', '  do   x'] },
    ], 6)).toThrow(/stay distinct after normalization/)
  })

  it('keeps criteria distinct when only inner content differs', () => {
    const tasks = normalizeCallerTasks([
      { title: 'x', objective: 'x', expectedOutput: 'x', acceptanceCriteria: ['Do X, then Y', 'Do X then Y'] },
    ], 6)
    expect(tasks![0]!.acceptanceCriteria).toEqual(['Do X, then Y', 'Do X then Y'])
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

  it('rejects an aggregate task payload over budget', () => {
    const tasks = Array.from({ length: 12 }, (_, index) => ({
      title: `task ${index}`,
      objective: 'o',
      expectedOutput: 'e',
      acceptanceCriteria: Array.from({ length: TASK_LIMITS.criteriaItems }, (_, criterion) => `${criterion}`.padEnd(TASK_LIMITS.criteriaChars, 'x')),
    }))
    expect(() => normalizeCallerTasks(tasks, 12)).toThrow(/aggregate 48000-character budget/)
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
