import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Both shipped languages must carry every key the UI asks for, and the two dictionaries in
 * the bundle must not drift apart.
 *
 * The bundle holds **two** tables: the plugin's own `DICT` (`t` on the settings page and the
 * progress tab) and `PANEL_DICT`, registered under its own namespace for the re-registered
 * stock run renderer. A key typed into the wrong table renders as the raw key (or the
 * not-reported placeholder), which no type checks and no render test would catch. That is why
 * the checks below are split by scope instead of asserting "the key exists somewhere": a key
 * that moves from one table to the other must fail here, loudly.
 */
const SOURCE = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')

type Dict = Record<string, string>
type Dicts = { zh: Dict, en: Dict }

/**
 * The only two-scope seam this file allows: these keys are asked for by the panel renderer,
 * whose translator reads `PANEL_DICT`, and are deliberately absent from the plugin table.
 */
const PANEL_SCOPE_KEYS = ['member.empty', 'member.open', 'phase.empty', 'phase.unassigned', 'run.empty']

/** Load the bundle the way the host does, with a stub React. */
function loadBundle(): { dict: Dicts, panel: Dicts } {
  let registration: { id: string, factory: (require: (id: string) => unknown) => Record<string, any> } | undefined
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
    createElement: () => null,
    useState: (value: unknown) => [value, () => {}],
    useEffect: () => {},
    useRef: (value: unknown) => ({ current: value }),
    useSyncExternalStore: () => undefined,
  }
  const bundle = registration!.factory(() => react) as Record<string, any>
  return {
    dict: bundle['GROK_WORKFLOW_DICT'],
    panel: bundle['GROK_WORKFLOW_PANEL'].DICT,
  }
}

/** Keys one locale has and the other does not, in both directions. */
function asymmetric(left: Dict, right: Dict): { leftOnly: string[], rightOnly: string[] } {
  return {
    leftOnly: Object.keys(left).filter((key) => !(key in right)).sort(),
    rightOnly: Object.keys(right).filter((key) => !(key in left)).sort(),
  }
}

/**
 * The flowchart's copy contract (`.tmp/flowchart-contract.md` §5), key by key.
 *
 * The values are asserted verbatim, not just for presence: a key that exists with the
 * wrong words is the same defect as a missing one — the page would say something nobody
 * agreed to, in the language the operator reads.
 *
 * The page's visible vocabulary is small on purpose: seven leg words, three badges, one step
 * sentence (with its estimate and the basis that estimate rests on), three stuck verdicts,
 * one reader label for the figure, the five-state chip, the dock's words and the row words.
 * `progress.plan.*` survives as the *spoken* state word on a node (`aria-label`), so it is
 * still pinned here even though the page never prints it.
 */
const REDESIGN_COPY: ReadonlyArray<readonly [key: string, zh: string, en: string]> = [
  ['progress.chip.waiting', '等你点头', 'Waiting for you'],
  ['progress.chip.running', '进行中', 'Running'],
  ['progress.chip.done', '已完成', 'Done'],
  ['progress.chip.failed', '未通过', 'Not passed'],
  ['progress.chip.cancelled', '已取消', 'Cancelled'],
  // The seven leg words and the two badges (draft, attempt). The visit badge retired
  // with the old edition (no code reads it): it is listed under REDESIGN_DELETED now.
  ['progress.flow.start', '起点', 'Start'],
  ['progress.flow.plan', '规划', 'Plan'],
  ['progress.flow.execute', '执行', 'Execute'],
  ['progress.flow.check', '检查', 'Check'],
  ['progress.flow.review', '复核', 'Review'],
  ['progress.flow.summarize', '汇总', 'Summarize'],
  ['progress.flow.end', '终点', 'End'],
  ['progress.flow.draft', '第 {n} 稿', 'Draft {n}'],
  ['progress.flow.attempt', '第 {n} 遍', 'Attempt {n}'],
  // The fork panel (2026-11-26, contract §26): the acceptance as a place rather than a leg, the
  // six lights a task card carries, the five the run is verified against, and the two words that
  // name those two rows of lights — plus the two words of the sheet a narrow screen opens a list in.
  ['progress.flow.accept', '验收', 'Accept'],
  ['progress.ring.plan', '规划', 'Plan'],
  ['progress.ring.execute', '执行', 'Execute'],
  ['progress.ring.check', '检查', 'Check'],
  ['progress.ring.review', '复核', 'Review'],
  ['progress.ring.accept', '验收', 'Accept'],
  ['progress.ring.summarize', '汇总', 'Summarize'],
  ['progress.verify.machine', '机器远端', 'Remote machine'],
  ['progress.verify.model', '模型复核', 'Model review'],
  ['progress.verify.isolated', '真机隔离', 'Isolated real machine'],
  ['progress.verify.human', '人验', 'Human review'],
  ['progress.verify.ledger', '对账', 'Ledger reconciliation'],
  ['progress.panel.rings', '六环', 'Six stages'],
  ['progress.panel.checks', '五验', 'Five checks'],
  // The task panel's own keys (the operator's panel brief, §21 → the panel): the one
  // sentence under the title, the estimate and what it rests on, the three stuck verdicts,
  // the three durations that spell the estimate, the trace's one word, the figure's
  // reader label, and the two words of the sheet a narrow screen opens a list in. The first
  // eleven replace the count line and the flow's label, which are gone.
  ['progress.panel.step', '第 {at} 步，共 {total} 步', 'Step {at} of {total}'],
  ['progress.panel.eta', '还剩约 {time}', 'about {time} left'],
  ['progress.panel.etaBasis', '按 {n} 个已完成步骤的实测耗时推算', 'from the {n} finished steps actually measured'],
  ['progress.panel.stuck.failed', '卡在 {at}：{role} 第 {n} 遍没过', 'Stuck at {at}: attempt {n} of {role} did not pass'],
  ['progress.panel.stuck.blocked', '卡在 {at}：这一步没有回报', 'Stuck at {at}: this step never reported back'],
  ['progress.panel.stuck.rejected', '卡在 {at}：{n} 稿全被退回', 'Stuck at {at}: every draft was rejected ({n})'],
  ['progress.panel.durationSec', '{s} 秒', '{s}s'],
  ['progress.panel.durationMin', '{m} 分 {s} 秒', '{m}m {s}s'],
  ['progress.panel.durationHour', '{h} 小时 {m} 分', '{h}h {m}m'],
  ['progress.panel.trace', '看线', 'Trace its wires'],
  ['progress.panel.graph', '任务图', 'Task graph'],
  // The sheet a narrow screen draws an opened list in: what it holds, and the one control
  // that puts it away. Wide pages print neither word.
  ['progress.panel.calls', '调用', 'Calls'],
  ['progress.panel.collapse', '收起', 'Hide'],
  // The state words a node speaks and never prints (`aria-label`).
  ['progress.plan.waiting', '等着', 'Waiting'],
  ['progress.plan.running', '在做', 'Doing'],
  ['progress.plan.done', '过了', 'Passed'],
  ['progress.plan.failed', '没过', 'Not passed'],
  ['progress.plan.cancelled', '没做', 'Cancelled'],
  // The row control's name, and the seven words a call line can end on.
  ['progress.task.detail', '详情', 'Detail'],
  ['progress.log.done', '做完', 'Did it'],
  ['progress.log.passed', '过了', 'Passed'],
  ['progress.log.reviewed', '通过', 'Approved'],
  ['progress.log.running', '正在看', 'Checking'],
  ['progress.log.failed', '没过', 'Not passed'],
  ['progress.log.shipped', '交卷', 'Shipped'],
  ['progress.log.cancelled', '取消', 'Cancelled'],
  ['progress.final.mark', '（定稿）', '(final)'],
  // The all-rejected verdict, printed in the summary node's opened calls: how many drafts
  // were turned back, which gate the last one stopped at, and the gate's own words.
  ['progress.final.rejected', '第 {n} 稿全被退回', 'Every draft was rejected: {n}'],
  ['progress.final.rejectedStage', '卡在{stage}', 'Held at {stage}'],
  ['progress.final.rejectedReason', '最后不过：{reason}', 'Last failure: {reason}'],
  ['progress.dock.start', '开工', 'Start'],
  ['progress.dock.fill', '确认', 'yes'],
  ['progress.dock.filled', '已填进输入框，按发送', 'Filled the box; press send'],
]

/**
 * The keys §19.3 deletes, with the spellings of every wildcard expanded.
 *
 * Deleting a *family* is the point: `progress.stage.*` and `progress.state.*` were the
 * spine's and the aggregate's words, and the spine left the page. A single survivor would
 * be a slot reserved for a sentence the page no longer says, so both tables must lose all
 * of them, and the prefix check below catches a clever rename that the list would miss.
 */
const REDESIGN_DELETED: readonly string[] = [
  // the four-zone page's own copy (2026-11-25, replaced by the flowchart)
  'progress.now.label',
  'progress.now.planning',
  'progress.now.done',
  'progress.now.suffix',
  'progress.now.allPassed',
  'progress.now.step',
  'progress.steps.aria',
  'progress.flag.retrying',
  'progress.flag.failed',
  'progress.rest',
  'progress.plan.title',
  'progress.log.title',
  'progress.log.more',
  'progress.log.less',
  'progress.final.title',
  'progress.final.missing',
  'progress.dock.hintStart',
  'progress.dock.hintAccept',
  'progress.dock.quiet',
  'progress.title',
  'progress.aria',
  'progress.percent',
  'progress.percentHint',
  'progress.unsettled',
  'progress.stage.start',
  'progress.stage.plan',
  'progress.stage.execute',
  'progress.stage.verify',
  'progress.stage.synthesize',
  'progress.stage.end',
  'progress.extraHint',
  'progress.state.pending',
  'progress.state.doing',
  'progress.state.done',
  'progress.state.blocked',
  'progress.state.cancelled',
  'progress.state.failed',
  'progress.derived.runEndedUnsettled',
  'progress.derived.outcomeUnsettled',
  'progress.notReported',
  'progress.empty.body',
  'progress.settle.aria',
  'progress.settle.ok',
  'progress.settle.bad',
  'progress.settle.retried',
  'progress.settle.warn',
  'progress.settle.open',
  'progress.settle.unsettled',
  'progress.tasks.aria',
  'progress.branch.settledOf',
  'progress.branch.running',
  'progress.branch.failedCount',
  'progress.branch.evidenceRows',
  'progress.evidenceHint',
  'progress.chain.pendingHint',
  'progress.source.stageDetail',
  'progress.source.coordination',
  'progress.source.notReported',
  'progress.field.workCommit',
  'progress.field.changes',
  'progress.field.testsRun',
  'progress.field.results',
  'progress.field.localRuntimeVerified',
  'progress.field.blockers',
  'progress.field.nextAction',
  // The task panel's own retirement (2026-11-26): the count line counted steps the reader
  // could not spend, and the figure's label said nothing a reader of the figure did not see.
  // The one step sentence replaced the first; the figure's `aria-label` is `progress.panel.graph`.
  'progress.flow.left',
  'progress.flow.aria',
  // The fork panel's own retirement (2026-11-26): the acceptance became a place on the figure,
  // and the user acceptance click that used to sit in the dock went with it.
  'progress.dock.accept',
  // Dead-key retirement (wave1-05): the visit badge left with the old edition and no code
  // reads it, so both dictionaries drop it instead of reserving a dead slot.
  'progress.flow.visit',
]

/** The namespaces §19.3 deletes whole; no key may carry one of these prefixes. */
const REDESIGN_DELETED_PREFIXES = [
  'progress.stage.',
  'progress.state.',
  'progress.settle.',
  'progress.source.',
  'progress.field.',
  'progress.branch.',
  'progress.derived.',
]

/** The copy the redesign keeps, because the row capsule, the chain and the guardian stay. */
const REDESIGN_KEPT: readonly string[] = [
  'progress.empty.title',
  'progress.member.open',
  'progress.chain.execute',
  'progress.chain.check',
  'progress.chain.review',
  'progress.unphased',
  'progress.guardian.title',
  'progress.guardian.active',
  'progress.guardian.budget',
]

const bundle = loadBundle()

describe('client i18n: both locales carry every key the UI asks for', () => {
  it('reports a key that only one locale has, so the parity check can fail at all', () => {
    // A guard nobody has seen fail is a guard that might compare two empty lists.
    const broken = asymmetric({ 'a.one': '1', 'a.two': '2' }, { 'a.one': '1' })
    expect(broken.leftOnly).toEqual(['a.two'])
    expect(broken.rightOnly).toEqual([])
    expect(asymmetric({}, {})).toEqual({ leftOnly: [], rightOnly: [] })
    // The real tables are the ones under test; this only proves the comparison can fail.
    expect(asymmetric(bundle.dict.zh, bundle.dict.en)).toEqual({ leftOnly: [], rightOnly: [] })
  })

  it('keeps the plugin dictionary symmetric and non-trivial', () => {
    expect(Object.keys(bundle.dict.zh).length).toBeGreaterThan(100)
    expect(asymmetric(bundle.dict.zh, bundle.dict.en)).toEqual({ leftOnly: [], rightOnly: [] })
    // No empty copy in either language: an empty string renders as a blank label, which is
    // the same defect as a missing key but invisible to a key-set comparison.
    const empty = Object.entries(bundle.dict).flatMap(([locale, table]) =>
      Object.entries(table as Dict).filter(([, value]) => String(value).trim() === '').map(([key]) => `${locale}:${key}`))
    expect(empty).toEqual([])
  })

  it('keeps the panel dictionary symmetric, and is exactly what the panel-scope keys land in', () => {
    expect(asymmetric(bundle.panel.zh, bundle.panel.en)).toEqual({ leftOnly: [], rightOnly: [] })
    for (const key of PANEL_SCOPE_KEYS) {
      expect(bundle.panel.zh[key], key).toBeTypeOf('string')
      expect(bundle.panel.en[key], key).toBeTypeOf('string')
      // …and the plugin's own table deliberately does not carry them: the panel translator
      // reads `PANEL_DICT`, so a copy here would be dead weight that hides a move.
      expect(key in bundle.dict.zh, key).toBe(false)
    }
  })

  it('resolves every literal `t(\'…\')` key in the bundle source', () => {
    const literals = new Set<string>()
    for (const match of SOURCE.matchAll(/\b(?:t|progressT)\(\s*'([A-Za-z0-9_.-]+)'/g)) {
      if (match[1] !== undefined) literals.add(match[1])
    }
    expect(literals.size).toBeGreaterThan(50)
    const unresolved = [...literals].filter((key) =>
      !(key in bundle.dict.zh) && !(key in bundle.dict.en) && !(key in bundle.panel.zh) && !(key in bundle.panel.en))
    expect(unresolved).toEqual([])
    // A literal that is missing from the plugin table must be one of the panel-scope keys —
    // anything else means a key was added to the wrong table.
    const panelOnly = [...literals]
      .filter((key) => !(key in bundle.dict.zh) && (key in bundle.panel.zh))
      .sort()
    expect(panelOnly).toEqual([...PANEL_SCOPE_KEYS, 'statusCount.completed'].sort())
  })

  it('resolves the keys built by concatenation and the tables that hold them', () => {
    // Two shapes are assembled at render time and are therefore invisible to the
    // literal scan above: the number-unit suffixes in `NUMBER_UNITS`, and the status
    // line's `${key}.detail`. (The mode cards that used to supply the rest were
    // deleted with the front desk in M3.3, so the guard below names the real
    // survivors instead of counting literals that no longer exist.)
    const unitsStart = SOURCE.indexOf('const NUMBER_UNITS = {')
    expect(unitsStart, 'the unit table must still be readable').toBeGreaterThan(-1)
    const unitsBlock = SOURCE.slice(unitsStart, SOURCE.indexOf('}', unitsStart))
    const unitKeys = [...unitsBlock.matchAll(/'([A-Za-z0-9_.]+)'/g)].map((match) => match[1]!)
    expect(unitKeys.length, 'every number row carries a unit key').toBeGreaterThanOrEqual(6)
    for (const key of unitKeys) expect(key.startsWith('unit.'), key).toBe(true)

    // The status line builds `${key}.detail` from `status.on` / `status.off`, so both
    // the base keys and the details they derive are named here explicitly.
    expect(SOURCE).toContain('`${key}.detail`')
    const statusKeys = ['status.on', 'status.on.detail', 'status.off', 'status.off.detail']

    // Both sets are read by `t(...)`, so a typo there renders as the raw key: assert
    // them in both dictionaries instead of trusting the source.
    for (const key of [...unitKeys, ...statusKeys]) {
      expect(key in bundle.dict.zh, `zh ${key}`).toBe(true)
      expect(key in bundle.dict.en, `en ${key}`).toBe(true)
    }

    // The settings fields the page labels through `t(`field.${key}`)`.
    const fieldKeys = [...SOURCE.matchAll(/'field\.([A-Za-z0-9]+)'\s*:/g)].map((match) => match[1]!)
    expect(fieldKeys.length).toBeGreaterThan(4)
    for (const key of new Set(fieldKeys)) {
      expect(`field.${key}` in bundle.dict.zh, key).toBe(true)
      expect(`field.${key}` in bundle.dict.en, key).toBe(true)
    }
  })

  it('resolves every dynamic expansion the bundle can produce, in the table that consumes it', () => {
    // The role words are the one family still built by concatenation (`role.${role}`);
    // the spine's stage words, the aggregate's state words, the detail ladder's source
    // and field keys and the two derived-state sentences all left with the spine and the
    // detail card (§19.3), so demanding them here would demand copy the page deleted.
    const roles = ['planner', 'worker', 'verifier', 'supervisor', 'synthesizer']
    const pluginKeys = roles.map((role) => `role.${role}`)
    expect(pluginKeys.length).toBeGreaterThan(4)
    const missing = pluginKeys.filter((key) => !(key in bundle.dict.zh) || !(key in bundle.dict.en))
    expect(missing).toEqual([])

    const panelKeys = ['running', 'completed', 'failed', 'cancelled', 'interrupted', 'unknown']
      .flatMap((status) => [`status.${status}`, `statusCount.${status}`])
    expect(panelKeys.filter((key) => !(key in bundle.panel.zh) || !(key in bundle.panel.en))).toEqual([])
  })

  it('carries every redesign key, word for word, in both languages', () => {
    // The table is the contract (§19.3): a missing key renders as a bare identifier and a
    // mistranslated one renders as a sentence nobody agreed to. Both are failures here.
    expect(REDESIGN_COPY.length).toBeGreaterThanOrEqual(30)
    for (const [key, zh, en] of REDESIGN_COPY) {
      expect(bundle.dict.zh[key], `zh ${key}`).toBe(zh)
      expect(bundle.dict.en[key], `en ${key}`).toBe(en)
    }
  })

  it('deletes the whole removed family from both tables, and keeps the survivors', () => {
    for (const key of REDESIGN_DELETED) {
      expect(key in bundle.dict.zh, `zh ${key}`).toBe(false)
      expect(key in bundle.dict.en, `en ${key}`).toBe(false)
    }
    // A family deleted wholesale may not leave a survivor under a new name: the prefix
    // check is what catches a key the explicit list did not think of.
    for (const prefix of REDESIGN_DELETED_PREFIXES) {
      expect(Object.keys(bundle.dict.zh).filter((key) => key.startsWith(prefix)), prefix).toEqual([])
      expect(Object.keys(bundle.dict.en).filter((key) => key.startsWith(prefix)), prefix).toEqual([])
    }
    // A deletion that took a survivor with it fails here, not on screen.
    for (const key of REDESIGN_KEPT) {
      expect(key in bundle.dict.zh, `zh ${key}`).toBe(true)
      expect(key in bundle.dict.en, `en ${key}`).toBe(true)
    }
  })
})
