import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * P1① step-total-words: 顶上"第 X 步，共 7 步"的 7 是七层流程，不是任务数。
 *
 * 背景见 `docs/knowledge/DESIGN-progress-tab.md` §26.1/§26.6：`total` 恒为 7
 * （起点 → 规划 → 任务 → 子任务 → 汇合 → 验收 → 终点，共七层），而一次运行的
 * 计划任务通常只有 3 个左右。旧文案只写"第 X 步，共 7 步"，普通读者会误以为
 * 7 步 = 7 个任务。
 *
 * 最小解耦（`total` 不动）：
 *
 * 1. 顶上句点出七层含义：`progress.panel.step` 拼出"{total} 层流程 / {total} levels"；
 * 2. 任务数另起一句单独表：`progress.panel.tasks`（图上 N 个任务），与步句不在同一元素；
 * 3. 模型同时给出 `taskCount`（任务卡数），换任务数时 `total` 仍为 7。
 *
 * 普通人测试：一个不懂代码的人看到顶上两句，能说出"7 步是流程的 7 层，
 * 3 任务是图上的任务卡"，两者不混。
 */

const SOURCE = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')

type Dict = Record<string, string>
type Element = { type: unknown, props: Record<string, unknown>, children: unknown[] }
type Translator = (key: string, params?: Record<string, unknown>) => string

interface ProgressMember {
  seq: number
  label: string
  phase?: string
  childId: string
  order: number
  startedAt?: number
  endedAt?: number
  outcome?: string
}

interface ProgressRun {
  runId: string
  name: string
  anchorSeq: number
  members: ProgressMember[]
  details: unknown[]
  stopReason?: string
}

interface PanelGraph {
  state: string
  mermaid: string
  nodes: Array<{ id: string, kind: string }>
  headline: { at: number, total: number, remaining: number, taskCount?: number }
  at: number
  total: number
  remaining: number
  taskCount?: number
}

interface Bundle {
  GROK_WORKFLOW_DICT: Record<string, Dict>
  GROK_WORKFLOW_INTERNALS: { translator: (locale: string) => Translator }
  GROK_WORKFLOW_PROGRESS: {
    component: (props: Record<string, unknown>) => unknown
    css: string
    derivePanelGraph: (run: ProgressRun, t?: Translator) => PanelGraph
  }
}

function loadBundle(): Bundle {
  let registration: { id: string, factory: (require: (id: string) => unknown) => Bundle } | undefined
  const record = globalThis as unknown as { window?: { __ModuleLoader__?: { load(spec: never): void } } | undefined }
  const previous = record.window
  record.window = { __ModuleLoader__: { load: (spec) => { registration = spec } } }
  try {
    new Function(SOURCE)()
  } finally {
    record.window = previous
  }
  expect(registration?.id).toBe('dsh-grok-workflow')
  const react = {
    createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): unknown => {
      const element: Element = { type, props: props ?? {}, children: children.flat(Infinity) as unknown[] }
      return typeof type === 'function' ? (type as (value: Record<string, unknown>) => unknown)(element.props) : element
    },
    useState: (initial: unknown) => [typeof initial === 'function' ? (initial as () => unknown)() : initial, () => {}],
    useEffect: () => {},
    useMemo: (factory: () => unknown) => factory(),
    useRef: (initial: unknown) => ({ current: initial === undefined ? null : initial }),
    useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
  }
  return registration!.factory((id) => {
    if (id === 'react') return react
    throw new Error(`the bundle must not require ${id} at load time`)
  })
}

/** Every element of a stub tree, depth first. */
function walk(node: unknown, out: Element[] = []): Element[] {
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const child of node) walk(child, out)
    return out
  }
  const element = node as Element
  if ('type' in element && 'props' in element) {
    out.push(element)
    walk(element.children, out)
  }
  return out
}

/** Every string of a stub tree, in document order. */
function texts(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') {
    out.push(node)
    return out
  }
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const child of node) texts(child, out)
    return out
  }
  const element = node as Element
  if ('children' in element) texts(element.children, out)
  return out
}

/** The readable text of one element, joined for a single comparison. */
function textOf(node: unknown): string {
  return texts(node).join(' ').trim()
}

/** Every element carrying one data hook, in document order. */
function hooksOf(tree: unknown, name: string): Element[] {
  return walk(tree).filter((element) => Object.prototype.hasOwnProperty.call(element.props, name))
}

/** The first element carrying one data hook, or a failure that names the hook. */
function hookOf(tree: unknown, name: string): Element {
  const found = hooksOf(tree, name)[0]
  expect(found, `no element carries ${name}`).toBeDefined()
  return found!
}

const bundle = loadBundle()
const progress = bundle.GROK_WORKFLOW_PROGRESS
const zh = bundle.GROK_WORKFLOW_INTERNALS.translator('zh')
const en = bundle.GROK_WORKFLOW_INTERNALS.translator('en')

/** Local wall-clock base of every fixture, built from local parts. */
const BASE = new Date(2026, 10, 25, 8, 2).getTime()

/** One plan row plus one completed work row per plan task. */
function runWithTasks(count: number): ProgressRun {
  const members: ProgressMember[] = [{
    seq: 1,
    label: '规划助手',
    phase: '规划',
    childId: 'child-1',
    order: 0,
    startedAt: BASE + 60_000,
    endedAt: BASE + 80_000,
    outcome: 'completed',
  }]
  for (let task = 1; task <= count; task += 1) {
    const seq = task + 1
    members.push({
      seq,
      label: '执行',
      phase: `任务 ${task} · 标题${task}`,
      childId: `child-${seq}`,
      order: seq - 1,
      startedAt: BASE + seq * 60_000,
      endedAt: BASE + seq * 60_000 + 20_000,
      outcome: 'completed',
    })
  }
  return { runId: `r-tasks-${count}`, name: `任务团队 · ${count} 个任务`, anchorSeq: 1, members, details: [] }
}

/** One page, rendered against a fixed snapshot (a single pass, no clicks). */
function pageOf(run: ProgressRun): unknown {
  const snapshot = { runs: [run], activeRun: run }
  return progress.component({
    t: zh,
    progressT: zh,
    useGrokProgress: (select: (value: unknown) => unknown) => select(snapshot),
  })
}

describe('step-total-words: the 7 is seven process levels, the tasks are counted apart', () => {
  it('keeps total at 7 when the task count changes', () => {
    // 1 个任务与 3 个任务：任务数换了，步总数不动——它数的是七层，不是任务。
    for (const count of [1, 3]) {
      const graph = progress.derivePanelGraph(runWithTasks(count), zh)
      expect(graph.total).toBe(7)
      expect(graph.headline.total).toBe(7)
    }
  })

  it('names the task count on the model, apart from the step count', () => {
    // 任务卡数跟任务数走：1 个任务就是 1，3 个任务就是 3，与 total 无关。
    expect(progress.derivePanelGraph(runWithTasks(1), zh).taskCount).toBe(1)
    expect(progress.derivePanelGraph(runWithTasks(3), zh).taskCount).toBe(3)
    expect(progress.derivePanelGraph(runWithTasks(3), zh).headline.taskCount).toBe(3)
  })

  it('says the step sentence counts process levels, in both languages', () => {
    // 顶上句自己点出七层含义：中文见"层流程"，英文见"levels"。
    expect(zh('progress.panel.step', { at: 4, total: 7 })).toBe('第 4 步，共 7 步（7 层流程）')
    expect(en('progress.panel.step', { at: 4, total: 7 })).toBe('Step 4 of 7 (7 levels)')
  })

  it('counts the tasks in their own sentence, in both languages', () => {
    // 任务数另起一句，中英同步，钉死措辞。
    expect(zh('progress.panel.tasks', { count: 3 })).toBe('图上 3 个任务')
    expect(en('progress.panel.tasks', { count: 3 })).toBe('3 tasks in the figure')
  })

  it('renders the task sentence in its own place, and it moves with the tasks', () => {
    // 任务句与步句是两个元素：任务数换了，任务句跟着换，步句的总数仍是 7。
    for (const count of [1, 3]) {
      const page = pageOf(runWithTasks(count))
      const step = hookOf(page, 'data-gw-progress-line')
      const tasks = hookOf(page, 'data-gw-progress-count')
      expect(step).not.toBe(tasks)
      expect(textOf(tasks)).toBe(zh('progress.panel.tasks', { count }))
      expect(textOf(step)).toContain('7')
    }
    expect(textOf(hookOf(pageOf(runWithTasks(1)), 'data-gw-progress-count')))
      .not.toBe(textOf(hookOf(pageOf(runWithTasks(3)), 'data-gw-progress-count')))
  })
})
