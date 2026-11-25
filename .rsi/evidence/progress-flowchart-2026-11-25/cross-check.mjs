// Run from the worktree root:
//   node .rsi/evidence/progress-flowchart-2026-11-25/cross-check.mjs
// It needs a built lib/ (npm run build) and reads the two derivations' outputs only through
// their public shapes: no field is compared that the contract does not name.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const { foldProgressRuns, deriveProgressFlow } = await import(pathToFileURL(join(root, 'lib/progress-tab.js')).href)

const SOURCE = readFileSync(join(root, 'src/client/index.js'), 'utf8')
let registration
globalThis.window = { __ModuleLoader__: { load: (spec) => { registration = spec } } }
new Function(SOURCE)()
const react = {
  createElement: () => null,
  useState: (v) => [v, () => {}],
  useEffect: () => {},
  useMemo: (f) => f(),
  useRef: (i) => ({ current: i ?? null }),
  useSyncExternalStore: () => undefined,
}
const bundle = registration.factory((id) => { if (id === 'react') return react; throw new Error(id) })
const mirror = bundle.GROK_WORKFLOW_PROGRESS

let clock = 0
const rec = (type, data, seq, time) => ({ type, data, seq, ...(time === undefined ? {} : { time }) })
function streamOf(calls, options = {}) {
  const records = [rec('tool-workflow/run-start', { runId: 'r-flow', name: '任务团队 · 2 个任务' }, 1, 1000)]
  let at = 2
  for (const [seq, label, phase, outcome] of calls) {
    records.push(rec('tool-workflow/agent-start', { runId: 'r-flow', seq, label, phase, childId: `child-${seq}` }, at, 1000 + seq * 100))
    at += 1
    if (outcome === undefined) continue
    records.push(rec('tool-workflow/agent-end', { runId: 'r-flow', seq, outcome }, at, 1500 + seq * 100))
    at += 1
  }
  if (options.summaryFinal !== undefined) { records.push(rec('tool-workflow/summary-final', { runId: 'r-flow', draft: options.summaryFinal }, at)); at += 1 }
  if (options.stopReason !== undefined) records.push(rec('tool-workflow/run-end', { runId: 'r-flow', stopReason: options.stopReason }, at))
  return records
}

const shape = (flow) => JSON.stringify({
  state: flow.state,
  at: flow.at,
  total: flow.total,
  remaining: flow.remaining,
  final: flow.final ?? null,
  nodes: flow.nodes.map((n) => [n.key, n.kind, n.ordinal, n.state, n.members.map((m) => m.seq)]),
})

const realRun = [
  [1, '执行', '任务 1 · 修复登录', 'completed'],
  [2, '执行', '任务 2 · 写文档', 'completed'],
  [3, '检查', '任务 1 · 修复登录', 'completed'],
  [4, '检查', '任务 2 · 写文档', 'completed'],
  [5, '复核', '任务 1 · 修复登录', 'completed'],
  [6, '复核', '任务 2 · 写文档', 'completed'],
  [7, '汇总·第1稿', '汇总', 'completed'],
  [8, '汇总·第2稿', '汇总', 'completed'],
]
const cases = {
  waiting: [[], {}],
  'real run, second draft shipped': [realRun, { summaryFinal: 2, stopReason: 'completed' }],
  'two planning visits': [[[1, '规划（第1次）', '规划', 'completed'], [2, '规划（第2次）', '规划', 'completed']], { stopReason: 'completed' }],
  'one leg declared out of order': [[[2, '执行', '任务 2 · 写文档', 'completed'], [1, '执行', '任务 1 · 修复登录', 'completed']], { stopReason: 'completed' }],
  'a row naming no leg': [[[1, '执行', '任务 1 · 修复登录', 'completed'], [2, '旁听者', '任务 1 · 修复登录', 'completed']], { stopReason: 'completed' }],
  'the guardian call': [[[1, '执行', '任务 1 · 修复登录', 'completed'], [2, 'Guardian', 'Guardian', 'completed']], { stopReason: 'completed' }],
  'a failed attempt being retried': [[[1, '执行', '任务 1 · 修复登录', 'completed'], [2, '执行', '任务 2 · 写文档', 'failed'], [3, '执行（尝试 2）', '任务 2 · 写文档', undefined]], {}],
  'the same stream, ended broken': [[[1, '执行', '任务 1 · 修复登录', 'completed'], [2, '执行', '任务 2 · 写文档', 'failed'], [3, '执行（尝试 2）', '任务 2 · 写文档', undefined], [4, '执行', '任务 3 · 补测试', 'cancelled']], { stopReason: 'error' }],
  'a cancelled run': [[[1, '执行', '任务 1 · 修复登录', 'completed']], { stopReason: 'cancelled' }],
  'english boundary calls': [[[1, 'Plan (call 1)', 'plan', 'completed'], [2, 'Execute', 'work', 'completed'], [3, 'Verify', 'work', 'completed']], { stopReason: 'completed' }],
}

let bad = 0
for (const [name, [calls, options]] of Object.entries(cases)) {
  const records = streamOf(calls, options)
  const [typedRun] = foldProgressRuns(records)
  const [mirrorRun] = mirror.fold(records)
  const typed = shape(deriveProgressFlow(typedRun))
  const mine = shape(mirror.deriveProgressFlow(mirrorRun))
  const same = typed === mine
  if (!same) bad += 1
  console.log(`${same ? 'SAME' : 'DIFF'}  ${name}`)
  if (!same) { console.log('  typed :', typed); console.log('  mirror:', mine) }
}
console.log(bad === 0 ? 'ALL SAME' : `${bad} DIFFERENCES`)
