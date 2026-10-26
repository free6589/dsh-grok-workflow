import { describe, expect, it } from 'vitest'
import { buildWorkflowRequest, WORKFLOW_SCRIPT } from '../src/script.js'
import { resolveConfig } from '../src/config.js'
import {
  hasDeclaredPaths,
  normalizeWritePath,
  normalizeWritesPaths,
  pathsOverlap,
  tasksConflict,
  WRITE_PATH_LIMITS,
} from '../src/paths.js'
import { runWorkflowScript, type ScriptAgent } from './helpers.js'
import { execution, task, verification } from './fixtures.js'

/**
 * U-4 — write-path conflict detection.
 *
 * Every workflow child runs in the same working directory (the engine has no
 * per-child `cwd`), so the only defence against two tasks clobbering one file is
 * the plan's own declaration. These tests pin the predicate (pure, host side) and
 * then the scheduling consequence (inside the generated script).
 */

describe('write-path normalisation', () => {
  it('collapses . and .. segments, separators and case', () => {
    expect(normalizeWritePath('src/a.ts')).toBe('src/a.ts')
    expect(normalizeWritePath('  ./src/a.ts  ')).toBe('src/a.ts')
    expect(normalizeWritePath('src//a.ts')).toBe('src/a.ts')
    expect(normalizeWritePath('src/./a.ts')).toBe('src/a.ts')
    expect(normalizeWritePath('src/b/../a.ts')).toBe('src/a.ts')
    expect(normalizeWritePath('./docs/knowledge/../knowledge/x.md')).toBe('docs/knowledge/x.md')
    expect(normalizeWritePath('SRC/A.TS')).toBe('src/a.ts')
    expect(normalizeWritePath('src\\a.ts')).toBe('src/a.ts')
    expect(normalizeWritePath('src/a.ts/')).toBe('src/a.ts')
    expect(normalizeWritePath('/abs/./p')).toBe('/abs/p')
    // Popping past the root stays at the root: `a/../../b` and `../b` are the same
    // place relative to the tree, and treating them as equal only serializes more.
    expect(normalizeWritePath('a/../../b')).toBe('b')
    expect(normalizeWritePath('../b')).toBe('b')
  })

  it('separates "the whole tree" from "nothing to compare"', () => {
    expect(normalizeWritePath('.')).toBe('.')
    expect(normalizeWritePath('/')).toBe('/')
    expect(normalizeWritePath('   ')).toBeUndefined()
  })
})

describe('write-path overlap', () => {
  it('treats the same file as a conflict', () => {
    expect(pathsOverlap('src/a.ts', 'src/a.ts')).toBe(true)
  })

  it('treats a directory prefix as a conflict, but not a string prefix', () => {
    expect(pathsOverlap('src', 'src/a.ts')).toBe(true)
    expect(pathsOverlap('src/', 'src/deep/a.ts')).toBe(true)
    expect(pathsOverlap('src/a.ts', 'src')).toBe(true)
    // Segment boundary matters: "src/a" must not swallow "src/ab".
    expect(pathsOverlap('src/a', 'src/ab')).toBe(false)
    expect(pathsOverlap('src/a.ts', 'src/a.ts.bak')).toBe(false)
    expect(pathsOverlap('src/a', 'lib/a')).toBe(false)
  })

  it('treats the tree root as overlapping everything', () => {
    expect(pathsOverlap('.', 'src/a.ts')).toBe(true)
    expect(pathsOverlap('/', 'anything')).toBe(true)
  })
})

describe('task-level conflict rule', () => {
  it('separates declared paths, unknown declarations and "writes nothing"', () => {
    expect(tasksConflict(['src/a.ts'], ['lib/b.ts'])).toBe(false)
    expect(tasksConflict(['src'], ['src/a.ts'])).toBe(true)
    // Unknown = could write anything, so it conflicts with everything, including
    // another unknown task (two unknown writers can still collide).
    expect(tasksConflict(undefined, ['lib/b.ts'])).toBe(true)
    expect(tasksConflict(undefined, undefined)).toBe(true)
    // An explicit "writes nothing" declaration is not a conflict.
    expect(tasksConflict([], ['src/a.ts'])).toBe(false)
    expect(tasksConflict([], [])).toBe(false)
  })

  it('reports whether a plan carries any usable declaration', () => {
    expect(hasDeclaredPaths([null, null].map(entry => entry ?? undefined))).toBe(false)
    expect(hasDeclaredPaths([undefined, []])).toBe(true)
    expect(hasDeclaredPaths([['src/a.ts']])).toBe(true)
  })
})

describe('declaration parsing', () => {
  it('normalizes, dedupes and bounds a declaration', () => {
    expect(normalizeWritesPaths(['src/a.ts', './src/a.ts', ' '])).toEqual(['src/a.ts'])
    expect(normalizeWritesPaths([])).toEqual([])
    expect(normalizeWritesPaths(undefined)).toBeUndefined()
    expect(normalizeWritesPaths('src/a.ts')).toBeUndefined()
    expect(normalizeWritesPaths([1])).toBeUndefined()
    expect(normalizeWritesPaths(['x'.repeat(WRITE_PATH_LIMITS.chars + 1)])).toBeUndefined()
    expect(normalizeWritesPaths(Array.from({ length: WRITE_PATH_LIMITS.items + 1 }, () => 'a'))).toBeUndefined()
  })
})

/* --------------------------------------------------------------- scheduling -- */

const config = (overrides: Record<string, unknown> = {}) => resolveConfig({ maxConcurrency: 3, maxRetries: 0, maxTasks: 6, ...overrides })

interface Span { id: string; start: number; end: number }

interface Tracker {
  peak: number
  order: string[]
  spans: Span[]
}

/**
 * Run a plan and observe how many workers were in flight at once.
 *
 * The worker awaits a macrotask so overlap is real, not just call ordering.
 */
async function runPlan(
  plan: ReturnType<typeof task>[],
  overrides: Record<string, unknown> = {},
): Promise<{ tracker: Tracker; report: Awaited<ReturnType<typeof runWorkflowScript>>['report'] }> {
  const settings = config(overrides)
  const request = buildWorkflowRequest('Ship the verified result', plan, settings)
  const tracker: Tracker = { peak: 0, order: [], spans: [] }
  let inFlight = 0
  const agent: ScriptAgent = async (_prompt, options) => {
    if (options.label.startsWith('grok-worker-')) {
      const id = plan.find(item => options.label.includes(`-${item.id}-`))?.id ?? '?'
      inFlight += 1
      tracker.peak = Math.max(tracker.peak, inFlight)
      tracker.order.push(id)
      const span: Span = { id, start: Date.now(), end: 0 }
      tracker.spans.push(span)
      await new Promise(resolve => setTimeout(resolve, 8))
      span.end = Date.now()
      inFlight -= 1
      return execution('work done')
    }
    return verification(plan.find(item => options.label.includes(`-${item.id}-`)) ?? plan[0]!)
  }
  const run = await runWorkflowScript(WORKFLOW_SCRIPT, request.args, agent)
  return { tracker, report: run.report }
}

describe('conflict-aware scheduling (U-4)', () => {
  it('keeps non-overlapping tasks parallel up to maxConcurrency', async () => {
    const plan = [
      task('a', undefined, ['src/a.ts']),
      task('b', undefined, ['src/b.ts']),
      task('c', undefined, ['lib/c.ts']),
    ]
    const { tracker, report } = await runPlan(plan)
    expect(report.status).toBe('completed')
    expect(tracker.peak).toBe(3)
  })

  it('serializes tasks that declare the same file', async () => {
    const plan = [
      task('a', undefined, ['src/shared.ts']),
      task('b', undefined, ['src/shared.ts']),
      task('c', undefined, ['lib/c.ts']),
    ]
    const { tracker, report } = await runPlan(plan)
    expect(report.status).toBe('completed')
    // a and b never overlap; c may run with either of them.
    expect(tracker.peak).toBe(2)
  })

  it('serializes a directory writer against a file inside that directory', async () => {
    const plan = [
      task('a', undefined, ['src']),
      task('b', undefined, ['src/deep/b.ts']),
    ]
    const { tracker } = await runPlan(plan, { maxConcurrency: 2 })
    expect(tracker.peak).toBe(1)
    expect(tracker.order).toEqual(['a', 'b'])
  })

  it('serializes an undeclared task against everything, and says so in the report', async () => {
    const plan = [
      task('a', undefined, ['src/a.ts']),
      task('b'),
      task('c', undefined, ['lib/c.ts']),
    ]
    const { tracker, report } = await runPlan(plan)
    expect(report.status).toBe('completed')
    // b is unknown, so nothing may run beside it; a and c are still parallel.
    const alone = tracker.spans.find(span => span.id === 'b')!
    const beside = tracker.spans.filter(span => span.id !== 'b')
      .filter(span => span.start < alone.end && alone.start < span.end)
    expect(beside).toEqual([])
    // The report echoes the declaration the decision was made from.
    expect(report.tasks.map(row => row.writesPaths)).toEqual([['src/a.ts'], null, ['lib/c.ts']])
  })

  it('ignores conflicts when no task declares anything (pre-U-4 behaviour)', async () => {
    const plan = [task('a'), task('b'), task('c')]
    const { tracker } = await runPlan(plan)
    expect(tracker.peak).toBe(3)
  })

  it('lets a task that declares no writes run with the others', async () => {
    const plan = [
      task('a', undefined, ['src/a.ts']),
      task('b', undefined, []),
      task('c', undefined, ['lib/c.ts']),
    ]
    const { tracker } = await runPlan(plan)
    expect(tracker.peak).toBe(3)
  })

  it('never exceeds maxConcurrency even when nothing conflicts', async () => {
    const plan = [
      task('a', undefined, ['p/a']),
      task('b', undefined, ['p/b']),
      task('c', undefined, ['p/c']),
      task('d', undefined, ['p/d']),
    ]
    const { tracker } = await runPlan(plan, { maxConcurrency: 2 })
    expect(tracker.peak).toBe(2)
  })
})

/* ------------------------------------------------- script / host equivalence -- */

/**
 * The generated script cannot import TypeScript, so the write-path predicate
 * exists twice: `src/paths.ts` (host, unit-tested) and a mirror inside
 * `WORKFLOW_SCRIPT` (what actually schedules). A drift between them would let a
 * host-side test pass while the runtime does something else, so the mirror is
 * executed here and compared sample by sample.
 */
function scriptMirror(): {
  normalizeWritePath: (raw: string) => string | null
  writePathOverlap: (left: string, right: string) => boolean
  writesConflict: (left?: string[], right?: string[]) => boolean
} {
  const start = WORKFLOW_SCRIPT.indexOf('function normalizeWritePath(')
  const end = WORKFLOW_SCRIPT.indexOf('function hasDeclaredPaths(')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const source = WORKFLOW_SCRIPT.slice(start, end)
  const factory = new Function(
    `${source}; return { normalizeWritePath, writePathOverlap, writesConflict };`,
  ) as () => ReturnType<typeof scriptMirror>
  return factory()
}

describe('the script mirror agrees with the host predicate', () => {
  const samples = [
    'src/a.ts', 'src//a.ts', './src/a.ts', 'src/./a.ts', 'src/b/../a.ts',
    'SRC/A.TS', 'src\\a.ts', 'src/a.ts/', '/abs/./p', 'a/../../b', '../b',
    '.', '/', '   ', 'src', 'src/a', 'src/ab', 'lib/a', 'src/a.ts.bak',
  ]

  it('normalizes identically', () => {
    const mirror = scriptMirror()
    for (const sample of samples) {
      expect({ sample, value: mirror.normalizeWritePath(sample) })
        .toEqual({ sample, value: normalizeWritePath(sample) ?? null })
    }
  })

  it('agrees on overlap for every pair', () => {
    const mirror = scriptMirror()
    for (const left of samples) {
      for (const right of samples) {
        const hostLeft = normalizeWritePath(left)
        const hostRight = normalizeWritePath(right)
        if (hostLeft === undefined || hostRight === undefined) continue
        const expected = pathsOverlap(hostLeft, hostRight)
        expect({ left, right, overlap: mirror.writePathOverlap(hostLeft, hostRight) })
          .toEqual({ left, right, overlap: expected })
      }
    }
  })

  it('agrees on the task-level three-state rule', () => {
    const mirror = scriptMirror()
    const cases: Array<[string[] | undefined, string[] | undefined]> = [
      [['src/a.ts'], ['src/a.ts']],
      [['src'], ['src/a.ts']],
      [['src/a'], ['src/ab']],
      [['src/a.ts'], undefined],
      [undefined, undefined],
      [[], ['src/a.ts']],
      [[], []],
      [['src/a.ts'], ['lib/b.ts']],
    ]
    for (const [left, right] of cases) {
      expect({ left, right, conflict: mirror.writesConflict(left, right) })
        .toEqual({ left, right, conflict: tasksConflict(left, right) })
    }
  })
})
