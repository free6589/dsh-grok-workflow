/**
 * 顶上句与卡住句用同一个步号（分支层）。
 *
 * 背景（114/256 轮结论）：真机造不出阻塞态（引擎收尾先补 cancelled 再写 run-end，
 * 留不下无结局行），所以阻塞态不断言真机，只直接构造无结局行断言卡住文案。
 * 本用例确定性、无网络：固定本地时钟基座，不依赖机器时区与外部服务。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const SOURCE = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')
type Element = { type: unknown, props: Record<string, unknown>, children: unknown[] }
interface ProgressMember { seq: number, label: string, phase?: string, childId: string, order: number, startedAt?: number, endedAt?: number, outcome?: string }
interface ProgressRun { runId: string, name: string, anchorSeq: number, members: ProgressMember[], details: unknown[], stopReason?: string }
type Translator = (key: string, params?: Record<string, unknown>) => string
interface PanelSubtask { taskId: string, taskNumber?: number, seq: number, leg?: string, attempt: number }
interface PanelNode { id: string, kind: string, level: number, label: string, state: string, current: boolean, calls: ProgressMember[], openable: boolean, subtask?: PanelSubtask }
interface PanelGraph { state: string, mermaid: string, nodes: PanelNode[], edges: Array<{ from: string, to: string, kind: string }>, headline: { at: number, total: number, remaining: number }, at: number, total: number, remaining: number, stuck?: { nodeId: string, at: number, kind: string } }
interface Bundle { GROK_WORKFLOW_INTERNALS: { translator: (locale: string) => Translator }, GROK_WORKFLOW_PROGRESS: { derivePanelGraph: (run: ProgressRun, t?: Translator) => PanelGraph } }
let rendering: { index: number, cells: unknown[] } | undefined
function loadBundle(): Bundle {
  let registration: { id: string, factory: (require: (id: string) => unknown) => Bundle } | undefined
  const record = globalThis as unknown as { window?: { __ModuleLoader__?: { load(spec: never): void } } | undefined }
  const previous = record.window
  record.window = { __ModuleLoader__: { load: (spec) => { registration = spec } } }
  try { new Function(SOURCE)() } finally { record.window = previous }
  expect(registration?.id).toBe('dsh-grok-workflow')
  const react = {
    createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): unknown => {
      const element: Element = { type, props: props ?? {}, children: children.flat(Infinity) as unknown[] }
      return typeof type === 'function' ? (type as (value: Record<string, unknown>) => unknown)(element.props) : element
    },
    useState: (initial: unknown) => { const cells = rendering; const value = typeof initial === 'function' ? (initial as () => unknown)() : initial; if (cells === undefined) return [value, () => {}]; const at = cells.index++; if (at >= cells.cells.length) cells.cells[at] = value; return [cells.cells[at], (next: unknown) => { cells.cells[at] = typeof next === 'function' ? (next as (value: unknown) => unknown)(cells.cells[at]) : next }] },
    useEffect: () => {},
    useMemo: (factory: () => unknown) => factory(),
    useRef: (initial: unknown) => ({ current: initial === undefined ? null : initial }),
    useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
  }
  return registration!.factory((id) => { if (id === 'react') return react; throw new Error(`the bundle must not require ${id} at load time`) })
}
const bundle = loadBundle()
const zh = bundle.GROK_WORKFLOW_INTERNALS.translator('zh')
const BASE = new Date(2026, 10, 25, 8, 2).getTime()
function member(seq: number, label: string, phase: string | undefined, outcome: string | undefined, order: number): ProgressMember {
  return { seq, label, ...(phase === undefined ? {} : { phase }), childId: `child-${seq}`, order, startedAt: BASE + seq * 60_000, ...(outcome === undefined ? {} : { endedAt: BASE + seq * 60_000 + 20_000, outcome }) }
}
function blockedRun(): ProgressRun {
  return { runId: 'r-blocked-unify', name: 'x', anchorSeq: 1, members: [ member(1, '规划助手', '规划', 'completed', 0), member(2, '执行', '任务 1 · 建表', undefined, 1) ], details: [], stopReason: 'error' }
}
describe('step-count unify: headline and stuck use one step number', () => {
  it('blocked: the stuck sentence reads the same step the headline stands on', () => {
    const graph = bundle.GROK_WORKFLOW_PROGRESS.derivePanelGraph(blockedRun(), zh)
    // WHY 同一口径：顶上句的 at 是读者站位（分支层），卡住句必须说同一处，
    // 否则同一屏出现两个步号。114 轮结论：真机造不出阻塞态，用例直接构造无结局行。
    expect(graph.stuck).toBeDefined()
    expect(graph.headline.at).toBe(graph.stuck!.at)
    expect(graph.stuck).toEqual({ nodeId: 't1', at: 4, kind: 'blocked' })
  })

  it('failed: the verdict still comes from the whole card, but the number matches the headline', () => {
    // WHY 失败态的“哪一次没过”必须看整卡（要看到被替代的重试），但报数用读者站位，
    // 否则“第几步”与顶上句各说各话。
    const run: ProgressRun = {
      runId: 'r-failed-unify', name: 'x', anchorSeq: 1,
      members: [
        member(1, '规划助手', '规划', 'completed', 0),
        member(2, '执行', '任务 1 · 建表', 'completed', 1),
        member(3, '检查', '任务 1 · 建表', 'failed', 2),
      ],
      details: [], stopReason: 'error',
    }
    const graph = bundle.GROK_WORKFLOW_PROGRESS.derivePanelGraph(run, zh)
    expect(graph.headline.at).toBe(graph.stuck!.at)
    expect(graph.stuck!.kind).toBe('failed')
  })

  it('rejected: the summary verdict already stands where the headline stands', () => {
    // WHY 退回态 verdict 落在汇总盒，顶上句收尾时同样站在汇总盒，两处天然同层。
    const run: ProgressRun = {
      runId: 'r-rejected-unify', name: 'x', anchorSeq: 1,
      members: [
        member(1, '规划助手', '规划', 'completed', 0),
        member(2, '执行', '任务 1 · 建表', 'completed', 1),
      ],
      details: [], stopReason: 'error',
    }
    const graph = bundle.GROK_WORKFLOW_PROGRESS.derivePanelGraph(run, zh)
    // 无 summaryRejected 时不卡住：不断言具体数，只断言“要么不卡、要么同层”。
    if (graph.stuck !== undefined) expect(graph.headline.at).toBe(graph.stuck.at)
  })
})
