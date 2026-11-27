/**
 * Soak 缺口的逻辑守卫：跳过上报 + 卡住三态 + blocked 无结局行 + 四胶囊（v1：先红）。
 *
 * 只补证据与守卫，不改产品行为：不碰 `src/`、`lib/`，用例直接构造数据断言，
 * 不去真机造状态（blocked 态真机造不出：引擎收尾先补 cancelled 再写 run-end）。
 * 其中「出错」一条先按「它是第六颗胶囊」的假设写，跑红后再按源码真相修正：
 * error 收尾不是第六态——stopReason 非 completed/cancelled 即 failed，chip 只有
 * 五键，error 收尾的胶囊读作「未通过」。红日志见本文件末尾注释。
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BLOCK_LEDGER_VERSION, readVerdictRows } from '../src/block/index.js'
import type { BlockEntry, BlockRow, BlockTaskRow } from '../src/block/index.js'
import { resolveConfig } from '../src/config.js'
import { runBlockSupervisor } from '../src/supervisor/index.js'
import { SKIPPED_JUDGE_NOTE } from '../src/supervisor/verdict.js'

/* ------------------------------------------------ 跳过上报：台账直读 ---- */

let ledgerDir = ''

beforeAll(() => {
  ledgerDir = mkdtempSync(join(process.cwd(), '.tmp', 'soak-gaps-'))
})

afterAll(() => {
  try { rmSync(ledgerDir, { recursive: true, force: true }) } catch { /* 已收走 */ }
})

const CRITERIA = ['账本里有一行', '结论写出来了'] as const

function blockOf(): BlockEntry {
  return {
    id: 'blk-1',
    title: '读账本',
    objective: '把账本读出来',
    deliverable: '一段结论',
    acceptance: [...CRITERIA],
    writesPaths: ['src/block'],
    dependsOn: [],
    execution: 'workflow',
    status: 'open',
    tasks: [],
  }
}

function rowOf(block: BlockEntry): BlockRow {
  const at = '2026-01-01T00:00:00.000Z'
  return {
    v: BLOCK_LEDGER_VERSION,
    id: 'row-1',
    sessionId: 'sess-soak-gaps',
    objective: '把账本读出来',
    splitHash: 'a'.repeat(64),
    approval: { kind: 'user', quote: '确认', at },
    blocks: [block],
    version: 1,
    createdAt: at,
    updatedAt: at,
    rowHash: '',
  }
}

function goodTasks(): BlockTaskRow[] {
  return [{
    id: 'blk-1-t1',
    title: '读账本',
    objective: '读 blocks.jsonl',
    acceptanceCriteria: [...CRITERIA],
    writesPaths: ['src/block/tools.ts'],
  }]
}

const GOOD_HANDOFF = [
  '做了什么：读完了 blocks.jsonl 并写了结论',
  '证据：读完了 blocks.jsonl，有一行；结论：接单台子可以用了',
  '没做：没有跑真机 soak',
  '下一步：等调度验收',
].join('\n')

describe('跳过上报：verify.blockSupervisor=false 记第三种结局', () => {
  it('跳过监工落成 skipped，上报台账同字，不判过', async () => {
    const block = blockOf()
    const outcome = await runBlockSupervisor({
      ctx: {} as never,
      config: resolveConfig({}),
      logger: { warn: () => {}, info: () => {} },
      agent: {} as never,
      row: rowOf(block),
      block,
      handoff: GOOD_HANDOFF,
      tasks: goodTasks(),
      judge: false,
      exists: () => true,
      dir: ledgerDir,
      now: Date.parse('2026-01-02T00:00:00.000Z'),
    })
    expect(outcome.outcome).toBe('skipped')
    expect(outcome.judged).toBe(false)
    expect(outcome.verdict.route).toBe('deterministic')
    expect(outcome.verdict.criteria.map((criterion) => criterion.met)).toEqual([true, true])
    expect(outcome.verdict.criteria.flatMap((criterion) => criterion.evidence))
      .toEqual([SKIPPED_JUDGE_NOTE, SKIPPED_JUDGE_NOTE])
    const rows = await readVerdictRows({ dir: ledgerDir })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.outcome).toBe('skipped')
  })
})

/* ------------------------------------------------ 卡住三态：构造直断 ---- */

const SOURCE = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')

type Dict = Record<string, string>
type Element = { type: unknown, props: Record<string, unknown>, children: unknown[] }

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
  summaryFinalDraft?: number
  summaryRejected?: { drafts: number, stage: string, reason: string }
}

type Translator = (key: string, params?: Record<string, unknown>) => string

interface PanelGraph {
  state: string
  nodes: Array<{ id: string, kind: string, state: string, calls: ProgressMember[] }>
  stuck?: { nodeId: string, at: number, kind: string, role?: string, attempt?: number, drafts?: number }
}

interface Bundle {
  GROK_WORKFLOW_DICT: Record<string, Dict>
  GROK_WORKFLOW_INTERNALS: { translator: (locale: string) => Translator }
  GROK_WORKFLOW_PROGRESS: {
    component: (props: Record<string, unknown>) => unknown
    derivePanelGraph: (run: ProgressRun, t?: Translator) => PanelGraph
  }
}

type Cells = { index: number, cells: unknown[] }
let rendering: Cells | undefined

function loadBundle(): Bundle {
  let registration: { id: string, factory: (require: (id: string) => unknown) => Bundle } | undefined
  const record = globalThis as unknown as { window?: { __ModuleLoader__?: { load(spec: never): void } } | undefined }
  const previous = record.window
  record.window = { __ModuleLoader__: { load: (spec: never) => { registration = spec } } }
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
    useState: (initial: unknown) => {
      const cells = rendering
      const value = typeof initial === 'function' ? (initial as () => unknown)() : initial
      if (cells === undefined) return [value, () => {}]
      const at = cells.index++
      if (at >= cells.cells.length) cells.cells[at] = value
      const set = (next: unknown) => {
        cells.cells[at] = typeof next === 'function' ? (next as (value: unknown) => unknown)(cells.cells[at]) : next
      }
      return [cells.cells[at], set]
    },
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

function textOf(node: unknown): string {
  return texts(node).join(' ').trim()
}

function hooksOf(tree: unknown, name: string): Element[] {
  return walk(tree).filter((element) => Object.prototype.hasOwnProperty.call(element.props, name))
}

function hookOf(tree: unknown, name: string): Element {
  const found = hooksOf(tree, name)[0]
  expect(found, `no element carries ${name}`).toBeDefined()
  return found!
}

function attr(element: Element, name: string): string | undefined {
  const value = element.props[name]
  if (value === undefined || value === null) return undefined
  return String(value)
}

const bundle = loadBundle()
const progress = bundle.GROK_WORKFLOW_PROGRESS
const zh = bundle.GROK_WORKFLOW_INTERNALS.translator('zh')

const BASE = new Date(2026, 10, 25, 8, 2).getTime()

function member(
  seq: number,
  label: string,
  phase: string | undefined,
  outcome: string | undefined,
  order: number,
): ProgressMember {
  return {
    seq,
    label,
    ...phase === undefined ? {} : { phase },
    childId: `child-${seq}`,
    order,
    startedAt: BASE + seq * 60_000,
    ...outcome === undefined ? {} : { endedAt: BASE + seq * 60_000 + 20_000, outcome },
  }
}

function runOf(name: string, members: ProgressMember[], extra: Record<string, unknown> = {}): ProgressRun {
  return { runId: `r-${name}`, name: `任务团队 · ${name}`, anchorSeq: 1, members, details: [], ...extra }
}

/** 未通过：一次没过，正在重试同一任务。 */
function failedRun(): ProgressRun {
  return runOf('没过', [
    member(1, '规划助手', '规划', 'completed', 0),
    member(2, '执行', '任务 1 · 建表', 'failed', 1),
    member(3, '执行（尝试 2）', '任务 1 · 建表', 'failed', 2),
  ], { stopReason: 'error' })
}

/** 没有回报：运行收尾时还有一行没结局（用例直接构造，真机造不出）。 */
function blockedRun(): ProgressRun {
  return runOf('没有回报', [
    member(1, '规划助手', '规划', 'completed', 0),
    member(2, '执行', '任务 1 · 建表', undefined, 1),
  ], { stopReason: 'error' })
}

const REJECTED_REASON = 'the answer omits incomplete task b'

/** 全被退回：守门把稿子全退回，运行本身走完了。 */
function rejectedRun(): ProgressRun {
  return runOf('全被退回', [
    member(1, '规划助手', '规划', 'completed', 0),
    member(2, '执行', '任务 1 · 建表', 'completed', 1),
    member(3, '检查', '任务 1 · 建表', 'completed', 2),
  ], { stopReason: 'completed', summaryRejected: { drafts: 2, stage: 'verify', reason: REJECTED_REASON } })
}

/** 等你点头：宣布了运行，还没声明任何调用。 */
function waitingRun(): ProgressRun {
  return runOf('等你点头', [])
}

/** 已取消：读者叫停，有失败行也不算卡住。 */
function cancelledRun(): ProgressRun {
  return runOf('取消', [
    member(1, '规划助手', '规划', 'completed', 0),
    member(2, '执行', '任务 1 · 建表', 'failed', 1),
  ], { stopReason: 'cancelled' })
}

/** 出错收尾：引擎报 error，但没有失败行（error 收尾的读法，不是第六态）。 */
function errorRun(): ProgressRun {
  return runOf('出错', [
    member(1, '规划助手', '规划', 'completed', 0),
    member(2, '执行', '任务 1 · 建表', 'completed', 1),
  ], { stopReason: 'error' })
}

function pageOf(run: ProgressRun): unknown {
  const snapshot = { runs: [run], activeRun: run }
  return progress.component({
    t: zh,
    progressT: zh,
    useGrokProgress: (select: (value: unknown) => unknown) => select(snapshot),
  })
}

describe('卡住三态：用例构造的形状，句句有出处', () => {
  it('没过：失败行没被重试盖掉，卡住句点名第几遍', () => {
    const graph = progress.derivePanelGraph(failedRun(), zh)
    expect(graph.stuck).toEqual({ nodeId: 't1', at: 3, kind: 'failed', role: '执行', attempt: 1 })
    expect(textOf(hookOf(pageOf(failedRun()), 'data-gw-progress-stuck'))).toBe('卡在 3：执行 第 1 遍没过')
  })

  it('没有回报：收尾压着无结局行，卡住句只说没回报不猜原因', () => {
    const graph = progress.derivePanelGraph(blockedRun(), zh)
    expect(graph.stuck).toEqual({ nodeId: 't1', at: 4, kind: 'blocked' })
    expect(textOf(hookOf(pageOf(blockedRun()), 'data-gw-progress-stuck'))).toBe('卡在 4：这一步没有回报')
  })

  it('全被退回：稿子全被守门退回，卡住句挂在汇总', () => {
    const graph = progress.derivePanelGraph(rejectedRun(), zh)
    expect(graph.stuck).toEqual({ nodeId: 'sum', at: 5, kind: 'rejected', drafts: 2 })
    expect(textOf(hookOf(pageOf(rejectedRun()), 'data-gw-progress-stuck'))).toBe('卡在 5：2 稿全被退回')
  })
})

describe('blocked 无结局行：拥有它的卡片就是 blocked', () => {
  it('收尾时没结局的那行留在卡片里，卡片态为 blocked', () => {
    const graph = progress.derivePanelGraph(blockedRun(), zh)
    const card = graph.nodes.find((node) => node.id === 't1')
    expect(card, 'no box t1').toBeDefined()
    expect(card!.state).toBe('blocked')
    expect(card!.calls.map((row) => row.seq)).toEqual([2])
    expect(card!.calls[0]!.outcome).toBeUndefined()
  })
})

describe('四胶囊：等你点头 / 已取消 / 出错 / 未通过', () => {
  it('等你点头：零声明的运行站在起点，胶囊是 waiting', () => {
    const graph = progress.derivePanelGraph(waitingRun(), zh)
    expect(graph.state).toBe('waiting')
    const page = pageOf(waitingRun())
    expect(textOf(hookOf(page, 'data-gw-progress-chip'))).toBe('等你点头')
    expect(attr(hookOf(page, 'data-gw-progress-chip'), 'data-state')).toBe('waiting')
  })

  it('已取消：叫停的运行不算卡住，胶囊是 cancelled', () => {
    const graph = progress.derivePanelGraph(cancelledRun(), zh)
    expect(graph.state).toBe('cancelled')
    expect(graph.stuck).toBeUndefined()
    const page = pageOf(cancelledRun())
    expect(textOf(hookOf(page, 'data-gw-progress-chip'))).toBe('已取消')
  })

  it('未通过：没过的尝试收尾，胶囊是 failed', () => {
    const graph = progress.derivePanelGraph(failedRun(), zh)
    expect(graph.state).toBe('failed')
    const page = pageOf(failedRun())
    expect(textOf(hookOf(page, 'data-gw-progress-chip'))).toBe('未通过')
    expect(attr(hookOf(page, 'data-gw-progress-chip'), 'data-state')).toBe('failed')
  })

  it('出错：引擎 error 收尾没有失败行可指，胶囊读作未通过而非另起一态', () => {
    // 出错不是第六颗胶囊：「出错」指 error 收尾这一页。源码真相
    //（derivePanelGraph）：stopReason 非 completed/cancelled 即 failed；
    // chip 只有五键（progress.chip.* 无 error），error 收尾读作未通过。
    //
    // 红日志（2026-11-27 跑红原文，v1 假设版）：
    //   FAIL 四胶囊：等你点头 / 已取消 / 出错 / 未通过 > 出错：引擎 error 收尾自成一态，胶囊另起出错
    //   AssertionError: expected 'failed' to be 'error' // Object.is equality
    //   Expected: "error" / Received: "failed"
    const graph = progress.derivePanelGraph(errorRun(), zh)
    expect(graph.state).toBe('failed')
    const page = pageOf(errorRun())
    expect(textOf(hookOf(page, 'data-gw-progress-chip'))).toBe('未通过')
    expect(attr(hookOf(page, 'data-gw-progress-chip'), 'data-state')).toBe('failed')
    expect('progress.chip.error' in bundle.GROK_WORKFLOW_DICT['zh']!).toBe(false)
    expect(graph.stuck).toBeUndefined()
  })
})
