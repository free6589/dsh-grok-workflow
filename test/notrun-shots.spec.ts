/**
 * NOT_RUN 真快门：四个只缺快门的态，一态一张 PNG + 一份读数。
 *
 * 方法（照实）：headless-fixture —— 不跑真机隔离 soak、不碰 live ~/.dsh、
 * 不起 3080。stub React 渲染 bundle 的 ProgressView 断言读数；PNG 由
 * REPORT §A 的命令把同一 bundle 烘成静态 HTML 再经系统 chromium 离线截得。
 * 事件流走录制器真实形状（run-start/agent-start/agent-end/run-end），
 * fold 用 bundle 自己的 GROK_WORKFLOW_PROGRESS.fold。
 *
 * 四态：
 *  A waiting  等你点头（开工按钮）：run-start 后零声明，无 run-end。
 *  B cancelled 已取消：stopReason=cancelled。
 *  C skipped  跳过上报态：verify.blockSupervisor=false 的台账行 —— 页面无
 *    skipped 胶囊（chip 只有五键），本页拍的是台账行 verdict-rows.json
 *    落成 skipped 的那一幕 + 同页 waiting 图（见 REPORT 说明）。
 *  D retry    重试态 attempt2/第 2 遍：同一任务第二遍。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const OUT = join(process.cwd(), '.rsi', 'evidence', 'notrun-shots') // dedup fix: single copy lives in .rsi; root evidence/ is not used
mkdirSync(OUT, { recursive: true })

/* ---------------- stub react + bundle ---------------- */

type Element = { type: unknown, props: Record<string, unknown>, children: unknown[] }

function loadBundle(): any {
  const source = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')
  let registration: { id: string, factory: (require: (id: string) => unknown) => any } | undefined
  const record = globalThis as unknown as { window?: { __ModuleLoader__?: { load(spec: never): void } } | undefined }
  const previous = record.window
  record.window = { __ModuleLoader__: { load: (spec: never) => { registration = spec } } }
  try {
    new Function(source)()
  } finally {
    record.window = previous
  }
  expect(registration?.id).toBe('dsh-grok-workflow')
  const stubReact = {
    createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): unknown => {
      const element: Element = { type, props: props ?? {}, children: children.flat(Infinity) as unknown[] }
      return typeof type === 'function' ? (type as (p: Record<string, unknown>) => unknown)(element.props) : element
    },
    useState: (initial: unknown) => [typeof initial === 'function' ? (initial as () => unknown)() : initial, () => {}],
    useEffect: () => {},
    useRef: (initial: unknown) => ({ current: initial === undefined ? null : initial }),
    useMemo: (factory: () => unknown) => factory(),
    useSyncExternalStore: (_s: unknown, g: () => unknown) => g(),
  }
  return registration!.factory((id) => {
    if (id === 'react') return stubReact
    throw new Error(`the bundle must not require ${id} at load time`)
  })
}

const bundle = loadBundle()
const zh = bundle.GROK_WORKFLOW_INTERNALS.translator('zh')

/* ---------------- fixtures: recorder-shaped streams (PNG 烘焙见 REPORT §A) ---------------- */

const BASE = new Date(2026, 10, 25, 8, 2).getTime()

function rec(type: string, data: Record<string, unknown>, seq: number, time?: number) {
  return { type, data, seq, ...time === undefined ? {} : { time } }
}

function streamOf(
  calls: Array<[number, string, string, (string | undefined)?]>,
  opts: { stopReason?: string } = {},
) {
  const records: Array<Record<string, unknown>> = [
    rec('tool-workflow/run-start', { runId: 'r-shot', name: '快门 · 对账运行' }, 1, BASE - 60_000),
  ]
  let at = 2
  for (const [seq, label, phase, outcome] of calls) {
    records.push(rec('tool-workflow/agent-start', { runId: 'r-shot', seq, label, phase, childId: `child-${seq}` }, at, BASE + seq * 60_000))
    at += 1
    if (outcome === undefined) continue
    records.push(rec('tool-workflow/agent-end', { runId: 'r-shot', seq, outcome }, at, BASE + seq * 60_000 + 500))
    at += 1
  }
  if (opts.stopReason !== undefined) records.push(rec('tool-workflow/run-end', { runId: 'r-shot', stopReason: opts.stopReason }, at))
  const runs = bundle.GROK_WORKFLOW_PROGRESS.fold(records)
  expect(runs).toHaveLength(1)
  return runs[0]
}

/* ---------------- texts / hooks for readings ---------------- */

function texts(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') { const t = node.trim(); if (t) out.push(t); return out }
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (Array.isArray(node)) { for (const c of node) texts(c, out); return out }
  const el = node as Element
  if ('children' in el) texts(el.children, out)
  return out
}
function walk(node: unknown, out: Element[] = []): Element[] {
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (Array.isArray(node)) { for (const c of node) walk(c, out); return out }
  const el = node as Element
  if ('type' in el && 'props' in el) { out.push(el); walk(el.children, out) }
  return out
}

function readingOf(run: unknown, extra: Record<string, unknown> = {}) {
  const snapshot = { runs: [run], activeRun: run }
  const page = bundle.GROK_WORKFLOW_PROGRESS.component({
    t: zh, progressT: zh,
    useGrokProgress: (s: (v: unknown) => unknown) => s(snapshot),
    ...extra,
  })
  const els = walk(page)
  const one = (hook: string) => els.find((e) => Object.prototype.hasOwnProperty.call(e.props, hook))
  const chip = one('data-gw-progress-chip')
  const dock = one('data-gw-progress-dock')
  const dockFill = one('data-gw-progress-dock-fill')
  return {
    chip: chip ? texts(chip).join(' ') : null,
    chipState: chip ? String(chip.props['data-state'] ?? '') : null,
    dockState: dock ? String(dock.props['data-state'] ?? '') : null,
    dockButton: dockFill ? texts(dockFill).join(' ') : null,
  }
}

describe('notrun-shots 去重：根下 evidence/ 不再出现（单份在 .rsi）', () => {
  it('no root duplicate: evidence/notrun-shots must not exist, .rsi copy is the single source', () => {
    expect(OUT).toContain(join('.rsi', 'evidence', 'notrun-shots'))
    expect(existsSync(join(process.cwd(), 'evidence', 'notrun-shots'))).toBe(false)
    expect(existsSync(join(process.cwd(), '.rsi', 'evidence', 'notrun-shots'))).toBe(true)
  })
})

describe('NOT_RUN 真快门：四态 PNG + 读数（先红后绿的绿）', () => {
  it('A 等你点头 waiting：胶囊等你点头 + 开工按钮', () => {
    const run = streamOf([])
    const graph = bundle.GROK_WORKFLOW_PROGRESS.derivePanelGraph(run, zh)
    expect(graph.state).toBe('waiting')
    const r = readingOf(run, { fillDraft: () => true })
    expect(r.chip).toBe('等你点头')
    expect(r.chipState).toBe('waiting')
    expect(r.dockState).toBe('start')
    expect(r.dockButton).toBe('开工')
    writeFileSync(join(OUT, 'waiting.reading.json'), JSON.stringify({ state: 'waiting', ...r }, null, 2))
    // PNG 烘焙：node 侧只留读数；HTML 是中间产物，由 REPORT 里的 chromium 命令现场烘成 PNG（见 REPORT §A）。
  })

  it('B 已取消 cancelled：胶囊已取消，无开工按钮', () => {
    const run = streamOf(
      [[1, '规划助手', '规划', 'completed'], [2, '执行', '任务 1 · 建表', 'failed']],
      { stopReason: 'cancelled' },
    )
    const graph = bundle.GROK_WORKFLOW_PROGRESS.derivePanelGraph(run, zh)
    expect(graph.state).toBe('cancelled')
    const r = readingOf(run)
    expect(r.chip).toBe('已取消')
    expect(r.chipState).toBe('cancelled')
    expect(r.dockState).toBe('none')
    expect(r.dockButton).toBe(null)
    writeFileSync(join(OUT, 'cancelled.reading.json'), JSON.stringify({ state: 'cancelled', ...r }, null, 2))
    // PNG 烘焙见 REPORT §A（chromium 现场烘）。
  })

  it('C 跳过上报 skipped：台账行 outcome=skipped（页面无 skipped 胶囊，chip 只有五键）', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs')
    const { join: pjoin } = await import('node:path')
    const { runBlockSupervisor } = await import('../src/supervisor/index.js')
    const { readVerdictRows, BLOCK_LEDGER_VERSION } = await import('../src/block/index.js')
    const { resolveConfig } = await import('../src/config.js')
    const dir = mkdtempSync(pjoin(process.cwd(), '.tmp', 'shot-skipped-'))
    try {
      const at = '2026-01-01T00:00:00.000Z'
      const block: any = {
        id: 'blk-1', title: '读账本', objective: '把账本读出来',
        deliverable: '一段结论', acceptance: ['账本里有一行', '结论写出来了'],
        writesPaths: ['src/block'], dependsOn: [], execution: 'workflow', status: 'open', tasks: [],
      }
      const out: any = await runBlockSupervisor({
        ctx: {} as never, config: resolveConfig({}), logger: { warn: () => {}, info: () => {} }, agent: {} as never,
        row: {
          v: BLOCK_LEDGER_VERSION, id: 'row-1', sessionId: 'sess-shot',
          objective: '把账本读出来', splitHash: 'a'.repeat(64),
          approval: { kind: 'user', quote: '确认', at },
          blocks: [block], version: 1, createdAt: at, updatedAt: at, rowHash: '',
        },
        block, tasks: [{ id: 'blk-1-t1', title: '读账本', objective: '读 blocks.jsonl', acceptanceCriteria: ['账本里有一行', '结论写出来了'], writesPaths: ['src/block/tools.ts'] }],
        handoff: ['做了什么：读完了 blocks.jsonl 并写了结论', '证据：读完了 blocks.jsonl，有一行；结论：接单台子可以用了', '没做：没有跑真机 soak', '下一步：等调度验收'].join('\n'),
        judge: false, exists: () => true, dir, now: Date.parse('2026-01-02T00:00:00.000Z'),
      })
      expect(out.outcome).toBe('skipped')
      const rows: any = await readVerdictRows({ dir })
      expect(rows).toHaveLength(1)
      expect(rows[0].outcome).toBe('skipped')
      // 页面真相：chip 只有五键，无 skipped 胶囊 —— 照实记，不伪造第六态。
      expect(bundle.GROK_WORKFLOW_DICT['zh']['progress.chip.skipped']).toBeUndefined()
      // 同页配一张 waiting 图：跳过上报发生在开工前（监工被关掉的那一关）。
      // PNG 烘焙见 REPORT §A（chromium 现场烘）。
      writeFileSync(join(OUT, 'skipped.reading.json'), JSON.stringify({
        verdictOutcome: rows[0].outcome,
        judged: false,
        chipKeys: Object.keys(bundle.GROK_WORKFLOW_DICT['zh']).filter((k: string) => k.startsWith('progress.chip.')),
        note: '页面无 skipped 胶囊；跳过上报只落在台账 verdict 行，不进 chip。',
      }, null, 2))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('D 重试态 attempt2：第 2 遍分支 + 未通过胶囊', () => {
    const run = streamOf(
      [[1, '执行', '任务 1 · 建表', 'failed'], [2, '执行（尝试 2）', '任务 1 · 建表', undefined]],
    )
    const r = readingOf(run)
    // 进行中：重试分支应带「第 2 遍」字样
    const snapshot = { runs: [run], activeRun: run }
    const page = bundle.GROK_WORKFLOW_PROGRESS.component({
      t: zh, progressT: zh,
      useGrokProgress: (s: (v: unknown) => unknown) => s(snapshot),
    })
    const all = texts(page).join(' | ')
    expect(all).toContain('第 2 遍')
    // 同一流收尾：error 收尾读作未通过（非第六态）
    const ended = streamOf(
      [[1, '执行', '任务 1 · 建表', 'failed'], [2, '执行（尝试 2）', '任务 1 · 建表', 'failed']],
      { stopReason: 'error' },
    )
    const g = bundle.GROK_WORKFLOW_PROGRESS.derivePanelGraph(ended, zh)
    expect(g.state).toBe('failed')
    const re = readingOf(ended)
    expect(re.chip).toBe('未通过')
    writeFileSync(join(OUT, 'retry-attempt2.reading.json'), JSON.stringify({
      running: r, endedChip: re.chip, endedState: re.chipState,
    }, null, 2))
    // PNG 烘焙见 REPORT §A（chromium 现场烘）。
  })
})
