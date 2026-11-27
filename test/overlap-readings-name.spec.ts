import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Wave1 任务④：两处磕碰 + 正名错图 + 过期两行只验不改 + 错键只登记。
 *
 * 背景（D-174 / D-176）：窄屏摊开展示已搬进抽屉、与卡相交 0；宽屏仍是节点下浮层、
 * 实测一张摊开展示压 2 张卡、四张压 9 张。本块把宽屏统一走抽屉（与卡相交 0），
 * 窄屏不动。过期两行只断言不改，错键只登记不修。
 */

const SOURCE = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')
const PHONE_RAW = JSON.parse(readFileSync(new URL('../.rsi/evidence/task-panel-2026-11-26/soak/raw-readings-phone.json', import.meta.url), 'utf8'))
const DESKTOP_RAW = JSON.parse(readFileSync(new URL('../.rsi/evidence/task-panel-2026-11-26/soak/raw-readings-desktop.json', import.meta.url), 'utf8'))
const READINGS = JSON.parse(readFileSync(new URL('../.rsi/evidence/task-panel-2026-11-26/soak/readings.json', import.meta.url), 'utf8'))

type Element = { type: unknown, props: Record<string, unknown>, children: unknown[] }
interface ProgressMember { seq: number, label: string, phase?: string, childId: string, order: number, startedAt?: number, endedAt?: number, outcome?: string }
interface ProgressRun { runId: string, name: string, anchorSeq: number, members: ProgressMember[], details: unknown[], stopReason?: string }
type Translator = (key: string, params?: Record<string, unknown>) => string
interface Bundle {
  GROK_WORKFLOW_INTERNALS: { translator: (locale: string) => Translator }
  GROK_WORKFLOW_PROGRESS: { component: (props: Record<string, unknown>) => unknown }
}

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
    useState: (initial: unknown) => {
      const cells = rendering
      const value = typeof initial === 'function' ? (initial as () => unknown)() : initial
      if (cells === undefined) return [value, () => {}]
      const at = cells.index++
      if (at >= cells.cells.length) cells.cells[at] = value
      return [cells.cells[at], (next: unknown) => { cells.cells[at] = typeof next === 'function' ? (next as (value: unknown) => unknown)(cells.cells[at]) : next }]
    },
    useEffect: () => {},
    useMemo: (factory: () => unknown) => factory(),
    useRef: (initial: unknown) => ({ current: initial === undefined ? null : initial }),
    useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
  }
  return registration!.factory((id) => { if (id === 'react') return react; throw new Error(`must not require ${id}`) })
}

const bundle = loadBundle()
const zh = bundle.GROK_WORKFLOW_INTERNALS.translator('zh')
const BASE = new Date(2026, 10, 25, 8, 2).getTime()
function member(seq: number, label: string, phase: string, outcome?: string): ProgressMember {
  return { seq, label, phase, childId: `child-${seq}`, order: seq - 1, startedAt: BASE + seq * 60_000, endedAt: BASE + seq * 60_000 + 20_000, ...outcome === undefined ? {} : { outcome } }
}
function runningRun(): ProgressRun {
  return { runId: 'r-two', name: '任务团队 · 两个任务', anchorSeq: 1, members: [member(1, '规划助手', '规划', 'completed'), member(2, '执行', '任务 1 · 建表', 'failed'), member(3, '执行', '任务 1 · 建表', 'completed'), member(4, '执行', '任务 2 · 写文档')], details: [] }
}
function walk(node: unknown, out: Element[] = []): Element[] {
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (Array.isArray(node)) { for (const child of node) walk(child, out); return out }
  const element = node as Element
  if ('type' in element && 'props' in element) { out.push(element); walk(element.children, out) }
  return out
}
function hooksOf(tree: unknown, name: string): Element[] {
  return walk(tree).filter((element) => Object.prototype.hasOwnProperty.call(element.props, name))
}
function hookOf(tree: unknown, name: string): Element {
  const found = hooksOf(tree, name)[0]
  expect(found, `no element carries ${name}`).toBeDefined()
  return found!
}
function texts(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') { out.push(node); return out }
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (Array.isArray(node)) { for (const child of node) texts(child, out); return out }
  const element = node as Element
  if ('children' in element) texts(element.children, out)
  return out
}
function textOf(node: unknown): string { return texts(node).join(' ').trim() }
function mount(run: ProgressRun) {
  const cells: unknown[] = []
  const snapshot = { runs: [run], activeRun: run }
  const props = { t: zh, progressT: zh, useGrokProgress: (select: (value: unknown) => unknown) => select(snapshot) }
  return () => {
    const before = rendering
    const local = { index: 0, cells }
    rendering = local
    try { return bundle.GROK_WORKFLOW_PROGRESS.component(props) } finally { rendering = before }
  }
}
function bodyOf(page: unknown, id: string): Element {
  const node = hooksOf(page, 'data-gw-progress-pnode').find((element) => String(element.props['data-gw-progress-pnode']) === id)
  expect(node, `the page drew no node ${id}`).toBeDefined()
  const body = walk(node!).find((element) => String(element.props['className'] ?? '').split(/\s+/).includes('gw-progress-pnode-body'))
  expect(body, `node ${id} has no body`).toBeDefined()
  return body!
}
function clickNode(view: () => unknown, id: string): unknown {
  const body = bodyOf(view(), id)
  expect(body.type, `node ${id} is not a control`).toBe('button')
  ;(body.props['onClick'] as () => void)()
  return view()
}
type MediaFace = { media: string, matches: boolean, addEventListener: () => void, removeEventListener: () => void }
function withNarrow<T>(matches: boolean, render: () => T): T {
  const record = globalThis as unknown as { matchMedia?: (query: string) => MediaFace }
  const previous = record.matchMedia
  record.matchMedia = (): MediaFace => ({ media: '', matches, addEventListener: () => undefined, removeEventListener: () => undefined })
  try { return render() } finally { if (previous === undefined) delete record.matchMedia; else record.matchMedia = previous }
}

describe('overlap ④：窄屏与宽屏摊开展示都不压卡（抽屉统一）', () => {
  it('narrow: the opened list lives in the sheet under the figure, in 0 cards', () => {
    // WHY 窄屏已是 0：列表搬出图、落到面板自己列的抽屉，只能把页面往下推。
    const phone = withNarrow(true, () => clickNode(mount(runningRun()), 't1'))
    expect(hooksOf(phone, 'data-gw-progress-sheet')).toHaveLength(1)
    for (const node of hooksOf(phone, 'data-gw-progress-pnode')) expect(hooksOf(node, 'data-gw-progress-node-calls')).toHaveLength(0)
    const order = walk(phone)
    const at = (element: Element) => order.indexOf(element)
    expect(at(hookOf(phone, 'data-gw-progress-sheet'))).toBeGreaterThan(at(hookOf(phone, 'data-gw-progress-graph')))
    expect(at(hookOf(phone, 'data-gw-progress-dock'))).toBeGreaterThan(at(hookOf(phone, 'data-gw-progress-sheet')))
  })

  it('wide: the opened list also lives in the sheet, not floating over the next card', () => {
    // WHY 宽屏浮层实测压卡（一张压 2、四张压 9），与窄屏统一走抽屉后相交归 0。
    // 红：修前宽屏无抽屉、列表挂在节点下，此断言失败。
    const wide = withNarrow(false, () => clickNode(mount(runningRun()), 't1'))
    expect(hooksOf(wide, 'data-gw-progress-sheet')).toHaveLength(1)
    for (const node of hooksOf(wide, 'data-gw-progress-pnode')) expect(hooksOf(node, 'data-gw-progress-node-calls')).toHaveLength(0)
    const sheet = hookOf(wide, 'data-gw-progress-sheet')
    const list = hookOf(wide, 'data-gw-progress-node-calls')
    expect(hooksOf(sheet, 'data-gw-progress-node-calls')).toEqual([list])
    expect(String(list.props['id'])).toBe('gw-progress-calls-t1')
    const order = walk(wide)
    const at = (element: Element) => order.indexOf(element)
    expect(at(sheet)).toBeGreaterThan(at(hookOf(wide, 'data-gw-progress-graph')))
    expect(at(hookOf(wide, 'data-gw-progress-dock'))).toBeGreaterThan(at(sheet))
    const body = bodyOf(wide, 't1')
    expect(String(body.props['aria-controls'])).toBe(String(list.props['id']))
  })
})

describe('overlap ④：过期两行只验不改（D-176 标注原则）', () => {
  it('phone-360-done and tablet-700-done read 0/0/0 on top and keep 1/5/19 in supersededFirstPass', () => {
    // WHY 只验不改：顶层已是与留存 PNG 一致的 0/0/0，原值原样留在同条 supersededFirstPass 里；
    // 改顶层或删原值都会破坏取证链（D-176：标注并取代，不原地重写）。
    for (const key of ['phone-360-done', 'tablet-700-done']) {
      const entry = PHONE_RAW[key]
      expect(entry, key).toBeDefined()
      expect([entry.nodeCalls, entry.traceActive, entry.traceDim], key).toEqual([0, 0, 0])
      const first = entry.callListFields?.supersededFirstPass
      expect(first, `${key} keeps its first pass`).toBeDefined()
      expect([first.nodeCalls, first.traceActive, first.traceDim], `${key} first pass`).toEqual([1, 5, 19])
    }
  })
})

describe('overlap ④：错键只登记不修（D-176：能等义订正才订正）', () => {
  it('raw-readings-desktop.json phone-390-running is the desktop done state, registered and untouched', () => {
    // WHY 不修：该目录没有任何材料说明桌面侧这一条应该是什么，改写只能编数字；
    // D-176 要求只登记。登记方式：断言现状（与 desktop-1500-done 逐字段相同、
    // 与 phone 真值 390/进行中矛盾），把判断留给有真拍的下一步。
    const wrong = DESKTOP_RAW['phone-390-running']
    const done = DESKTOP_RAW['desktop-1500-done']
    expect(wrong, 'the miskeyed entry exists').toBeDefined()
    expect(wrong).toEqual(done)
    expect(wrong.scrollWidth).toBe(1500)
    const phoneTrue = PHONE_RAW['phone-390-running']
    expect(phoneTrue.scrollWidth).toBe(390)
    expect(phoneTrue.chip).toBe('进行中')
  })
})

describe('overlap ④：错名图加注（改名/加注二选一中选加注，D-176）', () => {
  it('desktop-1500-trace.png shows the trace closed; the open state is desktop-1500-node-open.png', () => {
    // WHY 加注不改名：证据文件名一改，timeline/capture 脚本与旧记忆的引用全断；
    // D-176 只许标注。注记内容：trace.png = 第二次点击（列表收起+线全灭，0/0/0），
    // 真正开着的是 node-open.png（1/5/19）。不断言像素，只断言读数口径。
    const byKey = new Map((READINGS.entries as Array<{ key: string, nodeCalls: number, traceActive: number, traceDim: number }>).map((entry) => [entry.key, entry]))
    expect([byKey.get('desktop-1500-trace')?.nodeCalls, byKey.get('desktop-1500-trace')?.traceActive, byKey.get('desktop-1500-trace')?.traceDim]).toEqual([0, 0, 0])
    expect([byKey.get('desktop-1500-node-open')?.nodeCalls, byKey.get('desktop-1500-node-open')?.traceActive, byKey.get('desktop-1500-node-open')?.traceDim]).toEqual([1, 5, 19])
    expect(textOf(hookOf(withNarrow(false, () => clickNode(mount(runningRun()), 'plan')), 'data-gw-progress-node-calls'))).toContain('规划助手')
  })
})
