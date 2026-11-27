import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  DETAIL_FIELDS,
  PROGRESS_DETAIL_EVENT_TYPE,
  PROGRESS_EVENT_TYPES,
  PROGRESS_NODE_KIND,
  PROGRESS_SUMMARY_FINAL_EVENT_TYPE,
  PROGRESS_SUMMARY_REJECTED_EVENT_TYPE,
  PROGRESS_VIEW_TARGET,
} from '../src/progress-tab.js'
import {
  DISPOSE_RECORD,
  PROGRESS_AGENT_END,
  PROGRESS_AGENT_START,
  PROGRESS_RUN_END,
  PROGRESS_RUN_START,
  PROGRESS_SUMMARY_FINAL,
  PROGRESS_SUMMARY_REJECTED,
  ROUTING_RECORD,
  TERMINAL_RECORD,
  progressStopReason,
} from '../src/records.js'
import { DEFAULT_DIAGNOSTICS, deliverReport, diagnosticsEnabled } from '../src/delivery/index.js'
import {
  CARRYOVER_LIMITS,
  INHERITANCE_HEADER,
  INHERITANCE_LIMITS,
  INHERITANCE_PREFIX,
  buildCarryoverDigest,
  buildInheritanceDigest,
  carryoverBounds,
  clampBounds,
  collectCarryoverRounds,
  parseReportRound,
} from '../src/carryover.js'

/**
 * 契约冻结钉子（wave-contract-2026-11-27）：只断言冻结面现状，不引入新行为。
 *
 * 冻结了什么（读端键 + 快照现状）：
 * - progress-tab 读端键：PROGRESS_EVENT_TYPES 9 项（顺序固定）、3 个事件常量、
 *   DETAIL_FIELDS 7 项（顺序固定）、VIEW_TARGET/NODE_KIND。
 * - client 镜像白名单：src/client/index.js 内同名 PROGRESS_EVENT_TYPES 9 项、
 *   DETAIL_FIELDS、VIEW/NODE 常量，与 typed 侧逐条一致。
 * - records 的 plugin 键：TERMINAL/ROUTING/DISPOSE 三个 plugin:grok-workflow/* 常量
 *   存在且互不相同；progress 六事件常量与 progress-tab 侧一致。
 * - delivery/carryover 现状快照：只断言当前真实行为（默认值、签名存在、
 *   固定 markers/limits），不改运行时逻辑。
 * - soak 读数 JSON 顶层字段：文件存在才断言（缺失则跳过记 NOT_RUN）。
 *
 * 三处不一致只登记不修行为（本文件断言现状，供 T2/T3/T4 引用 stub）：
 * - I1：src/progress-tab.ts 顶部注释写"四个 session 事件"（旧数），实际
 *   PROGRESS_EVENT_TYPES 为 9 项；注释未同步，不改逻辑。
 * - I2：src/records.ts 注释写"same four types"（旧数），实际 recorder 六事件
 *   常量（run/agent-start/agent-end/run-end + summary-final/rejected）；不改逻辑。
 * - I3：src/client/index.js 注释"eight progress and Guardian"（旧数），实际
 *   白名单 9 项；不改逻辑。
 *
 * T2/T3/T4 引用方式：import { PROGRESS_EVENT_TYPES } from '../src/progress-tab.js'
 * 的 stub 直接复用本文件的 toEqual 冻结值；client 侧读 GROK_WORKFLOW_PROGRESS
 * 导出；delivery/carryover 侧直接调用本文件快照的同名函数。
 */

const FROZEN_EVENTS = [
  'tool-workflow/run-start',
  'tool-workflow/agent-start',
  'tool-workflow/agent-end',
  'tool-workflow/summary-final',
  'tool-workflow/summary-rejected',
  'tool-workflow/guardian-start',
  'tool-workflow/guardian-finding',
  'tool-workflow/guardian-end',
  'tool-workflow/run-end',
] as const

const FROZEN_DETAIL_FIELDS = [
  'workCommit',
  'changes',
  'testsRun',
  'results',
  'localRuntimeVerified',
  'blockers',
  'nextAction',
] as const

/** 读出 client bundle 的 GROK_WORKFLOW_PROGRESS 导出（served verbatim，不能 import）。 */
function clientProgress(): Record<string, unknown> {
  const SOURCE = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')
  let registration: { id: string, factory: (require: (id: string) => unknown) => Record<string, unknown> } | undefined
  const record = globalThis as unknown as { window?: { __ModuleLoader__?: { load(spec: never): void } } | undefined }
  const previous = record.window
  record.window = { __ModuleLoader__: { load: (spec) => { registration = spec } } }
  try { new Function(SOURCE)() } finally { record.window = previous }
  expect(registration?.id).toBe('dsh-grok-workflow')
  const react = {
    createElement: () => null,
    useState: (value: unknown) => [value, () => {}],
    useEffect: () => {},
    useMemo: (factory: () => unknown) => factory(),
    useRef: (value: unknown) => ({ current: value }),
    useSyncExternalStore: () => undefined,
  }
  const bundle = registration!.factory(() => react) as Record<string, unknown>
  const progress = bundle['GROK_WORKFLOW_PROGRESS'] as Record<string, unknown> | undefined
  expect(progress, 'bundle must export GROK_WORKFLOW_PROGRESS').toBeDefined()
  return progress!
}

describe('contract-freeze: progress-tab 读端键（9+3+7+2）', () => {
  it('PROGRESS_EVENT_TYPES 冻结为 9 项且顺序固定', () => {
    expect([...PROGRESS_EVENT_TYPES]).toEqual([...FROZEN_EVENTS])
  })

  it('3 个事件常量冻结', () => {
    expect(PROGRESS_DETAIL_EVENT_TYPE).toBe('tool-workflow/stage-detail')
    expect(PROGRESS_SUMMARY_FINAL_EVENT_TYPE).toBe('tool-workflow/summary-final')
    expect(PROGRESS_SUMMARY_REJECTED_EVENT_TYPE).toBe('tool-workflow/summary-rejected')
    expect((PROGRESS_EVENT_TYPES as readonly string[]).includes(PROGRESS_DETAIL_EVENT_TYPE)).toBe(false)
  })

  it('DETAIL_FIELDS 冻结为 7 项且顺序固定', () => {
    expect([...DETAIL_FIELDS]).toEqual([...FROZEN_DETAIL_FIELDS])
  })

  it('VIEW_TARGET / NODE_KIND 冻结', () => {
    expect(PROGRESS_VIEW_TARGET).toBe('grok-progress')
    expect(PROGRESS_NODE_KIND).toBe('grok-progress-run')
  })
})

describe('contract-freeze: client 镜像白名单与 typed 侧一致', () => {
  it('client PROGRESS_EVENT_TYPES 与 typed 侧逐条相等', () => {
    const shipped = clientProgress()['eventTypes'] as readonly string[]
    expect([...shipped]).toEqual([...PROGRESS_EVENT_TYPES])
  })

  it('client detailFields / target / kind 与 typed 侧一致', () => {
    const progress = clientProgress()
    expect(progress['detailEventType']).toBe(PROGRESS_DETAIL_EVENT_TYPE)
    expect(progress['summaryFinalEventType']).toBe(PROGRESS_SUMMARY_FINAL_EVENT_TYPE)
    expect(progress['summaryRejectedEventType']).toBe(PROGRESS_SUMMARY_REJECTED_EVENT_TYPE)
    expect(progress['detailFields']).toEqual([...DETAIL_FIELDS])
    expect(progress['target']).toBe(PROGRESS_VIEW_TARGET)
    expect(progress['kind']).toBe(PROGRESS_NODE_KIND)
  })
})

describe('contract-freeze: records 的 plugin 键存在', () => {
  it('三个 plugin:grok-workflow/* 常量存在且互不相同', () => {
    expect(TERMINAL_RECORD).toBe('plugin:grok-workflow/terminal')
    expect(ROUTING_RECORD).toBe('plugin:grok-workflow/routing')
    expect(DISPOSE_RECORD).toBe('plugin:grok-workflow/dispose')
    expect(new Set([TERMINAL_RECORD, ROUTING_RECORD, DISPOSE_RECORD]).size).toBe(3)
  })

  it('records 六 progress 常量与 progress-tab 侧一致', () => {
    expect(PROGRESS_RUN_START).toBe('tool-workflow/run-start')
    expect(PROGRESS_AGENT_START).toBe('tool-workflow/agent-start')
    expect(PROGRESS_AGENT_END).toBe('tool-workflow/agent-end')
    expect(PROGRESS_RUN_END).toBe('tool-workflow/run-end')
    expect(PROGRESS_SUMMARY_FINAL).toBe(PROGRESS_SUMMARY_FINAL_EVENT_TYPE)
    expect(PROGRESS_SUMMARY_REJECTED).toBe(PROGRESS_SUMMARY_REJECTED_EVENT_TYPE)
    for (const event of [
      PROGRESS_RUN_START, PROGRESS_AGENT_START, PROGRESS_AGENT_END,
      PROGRESS_SUMMARY_FINAL, PROGRESS_SUMMARY_REJECTED, PROGRESS_RUN_END,
    ]) {
      expect((PROGRESS_EVENT_TYPES as readonly string[]).includes(event)).toBe(true)
    }
  })

  it('progressStopReason 现状快照：completed+completed 才 completed', () => {
    expect(progressStopReason('completed', 'completed')).toBe('completed')
    expect(progressStopReason('completed', 'partial')).toBe('error')
    expect(progressStopReason('completed', 'failed')).toBe('error')
    expect(progressStopReason('completed', undefined)).toBe('error')
    expect(progressStopReason('cancelled', 'completed')).toBe('cancelled')
    expect(progressStopReason('error', undefined)).toBe('error')
  })
})

describe('contract-freeze: delivery 现状快照（只断言当前行为）', () => {
  it('diagnostics 开关默认关闭', () => {
    expect(DEFAULT_DIAGNOSTICS).toBe(false)
    expect(diagnosticsEnabled(undefined)).toBe(false)
    expect(diagnosticsEnabled(true)).toBe(true)
    expect(diagnosticsEnabled(false)).toBe(false)
    expect(diagnosticsEnabled({ get: () => true })).toBe(true)
    expect(diagnosticsEnabled({ get: () => { throw new Error('broken') } })).toBe(false)
  })

  it('deliverReport 签名存在：默认无 ledger，加开关才有', () => {
    const report = {
      schemaVersion: 'grok-workflow/v1',
      status: 'completed',
      objective: 'freeze snapshot',
      plan: { version: 1, tasks: [], replans: [] },
      tasks: [],
      confirmed: [],
      incomplete: [],
      errors: [],
      uncertainties: [],
      routes: [],
      routing: { planner: [], worker: [], verifier: [], supervisor: [], synthesizer: [] },
      synthesis: { mode: 'deterministic' },
      limits: { maxConcurrency: 1, maxRetries: 0, maxTasks: 1, maxTotalAgents: 1 },
    } as never
    const plain = deliverReport(report)
    expect(plain.diagnostics).toBe(false)
    expect(plain.human.length).toBeGreaterThan(0)
    expect(plain.ledger).toBeUndefined()
    expect(plain.text).toBe(plain.human)
    const withLedger = deliverReport(report, { diagnostics: true })
    expect(withLedger.diagnostics).toBe(true)
    expect(withLedger.ledger).toBeDefined()
    expect(withLedger.text).toContain('---')
  })
})

describe('contract-freeze: carryover 现状快照（只断言当前行为）', () => {
  it('LIMITS 冻结值', () => {
    expect(CARRYOVER_LIMITS.rounds).toBe(24)
    expect(CARRYOVER_LIMITS.chars).toBe(12_000)
    expect(INHERITANCE_LIMITS.chars).toBe(8_000)
    expect(INHERITANCE_PREFIX).toBe('INHERITED WORK FROM EARLIER ROUNDS')
    expect(INHERITANCE_HEADER.startsWith(INHERITANCE_PREFIX)).toBe(true)
  })

  it('parseReportRound 读得到 Grok workflow 签名行，读不到返回 null', () => {
    const round = parseReportRound('Grok workflow: COMPLETED\nObjective: do things\n')
    expect(round?.status).toBe('completed')
    expect(round?.objective).toBe('do things')
    expect(parseReportRound('no signature here')).toBeNull()
  })

  it('clampBounds 把越界压到上限，0 表示不带', () => {
    expect(clampBounds({ rounds: 999, chars: 999_999 })).toEqual({ rounds: 24, chars: 12_000 })
    expect(clampBounds({ rounds: 0, chars: 0 })).toEqual({ rounds: 0, chars: 0 })
    expect(carryoverBounds({ historyTurns: 0, historyChars: 0 })).toEqual({ rounds: 0, chars: 0 })
    expect(collectCarryoverRounds(undefined)).toEqual([])
    expect(buildCarryoverDigest([])).toBe('')
    expect(buildInheritanceDigest([])).toBe('')
  })
})

describe('contract-freeze: soak 读数 JSON 顶层字段（缺失跳过）', () => {
  const PATHS = [
    '../.rsi/evidence/task-panel-2026-11-26/soak/readings.json',
    '../.rsi/evidence/task-panel-2026-11-26/soak/raw-readings-phone.json',
    '../.rsi/evidence/task-panel-2026-11-26/soak/raw-readings-desktop.json',
  ] as const

  it.each(PATHS)('%s 顶层字段冻结（缺失则跳过 NOT_RUN）', (rel) => {
    const url = new URL(rel, import.meta.url)
    if (!existsSync(url)) {
      console.log(`NOT_RUN: missing ${rel}`)
      return
    }
    const data = JSON.parse(readFileSync(url, 'utf8')) as Record<string, unknown>
    if (rel.endsWith('readings.json')) {
      expect(Object.keys(data).sort()).toEqual(['console', 'entries', 'mermaidTruthCheck', 'note'])
      expect(Array.isArray(data['entries'])).toBe(true)
    } else {
      expect(typeof data).toBe('object')
      expect(Object.keys(data).length).toBeGreaterThan(0)
    }
  })
})
