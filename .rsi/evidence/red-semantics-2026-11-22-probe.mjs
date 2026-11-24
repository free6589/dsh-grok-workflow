// Before/after probe for the red semantics, run against the real bundle.
//
// Loads `src/client/index.js` exactly the way the host does (module-loader stub + stub
// React), derives the same two fixtures through the shipped code, and prints what a reader
// would see. The "before" column is the previous one-line predicate (`some row ever
// failed`) evaluated on the same fixtures — labelled as such, never as current behaviour.

import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/client/index.js', import.meta.url), 'utf8')
let registration
const globalRecord = globalThis
const previousWindow = globalRecord.window
globalRecord.window = { __ModuleLoader__: { load: (spec) => { registration = spec } } }
try {
  new Function(source)()
} finally {
  globalRecord.window = previousWindow
}
const stubReact = {
  createElement: (type, props, ...children) => {
    const element = { type, props: props ?? {}, children: children.flat(Infinity) }
    return typeof type === 'function' ? type(element.props) : element
  },
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useRef: (initial) => ({ current: initial === undefined ? null : initial }),
  useMemo: (factory) => factory(),
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
}
const bundle = registration.factory((id) => {
  if (id === 'react') return stubReact
  throw new Error(`unexpected require: ${id}`)
})
const progress = bundle.GROK_WORKFLOW_PROGRESS
const t = (key, params) => (bundle.GROK_WORKFLOW_DICT.zh[key] ?? key).replace(/\{(\w+)\}/g, (_m, name) => String(params?.[name] ?? ''))

function member(seq, phase, outcome, label = '执行', order = seq - 1) {
  return { seq, label, childId: `c${seq}`, order, phase, ...(outcome === undefined ? {} : { outcome }) }
}

const fixtures = {
  // Task 2 failed attempt 1, then verified on attempt 2. Tasks 1 and 3 were clean.
  'recovered (task 2 failed once, then passed)': {
    stopReason: 'completed',
    members: [
      member(1, '任务 1 · 读代码', 'completed'),
      member(2, '任务 2 · 写文档', 'failed'),
      member(3, '任务 2 · 写文档', 'completed', '执行（尝试 2）'),
      member(4, '任务 2 · 写文档', 'completed', '检查（尝试 2）'),
      member(5, '任务 3 · 补测试', 'completed'),
    ],
  },
  // The same task, failing both attempts: still broken when the reader looks.
  'still broken (task 2 failed both attempts)': {
    stopReason: 'error',
    members: [
      member(1, '任务 1 · 读代码', 'completed'),
      member(2, '任务 2 · 写文档', 'failed'),
      member(3, '任务 2 · 写文档', 'failed', '执行（尝试 2）'),
      member(4, '任务 3 · 补测试', 'completed'),
    ],
  },
}

function walk(tree, out = []) {
  if (tree === null || typeof tree !== 'object') return out
  if (Array.isArray(tree)) { for (const item of tree) walk(item, out); return out }
  if (tree.props !== undefined) out.push(tree)
  walk(tree.children, out)
  return out
}

const oldRule = (members) => (members.some((m) => m.outcome === 'failed') ? 'failed' : 'not failed')

for (const [name, fixture] of Object.entries(fixtures)) {
  const run = { runId: 'probe', name: '任务团队', anchorSeq: 1, ...fixture }
  const track = progress.deriveTrack(run, (key) => t(`progress.stage.${key}`))
  const card = track.nodes.find((node) => node.key === 'phase:任务 2 · 写文档')
  const execute = track.nodes.find((node) => node.key === 'stage:execute')
  const tree = progress.component({
    t,
    progressT: t,
    useGrokProgress: (select) => select({ runs: [run], activeRun: run }),
  })
  const elements = walk(tree)
  const bar = elements.filter((e) => typeof e.props['data-gw-progress-settle-part'] === 'number')
  const rendered = progress.component({ t, progressT: t, useGrokProgress: (select) => select({ runs: [run], activeRun: run }) })
  const cardEl = walk(rendered).find((e) => e.props['data-gw-progress-task'] === 'phase:任务 2 · 写文档')
  const pills = walk(cardEl).filter((e) => typeof e.props['data-gw-progress-pill'] === 'number')
  const spineEl = walk(rendered).find((e) => e.props['data-node-key'] === 'stage:execute')
  const badge = walk(spineEl).find((e) => e.props['data-gw-progress-failbadge'] !== undefined)

  console.log(`\n=== ${name} ===`)
  console.log(`BEFORE (rule: any row ever failed)`)
  console.log(`  task-2 card state         : ${oldRule(card.members)}`)
  console.log(`  spine execute state       : ${oldRule(execute.evidence)}`)
  console.log(`  settle bar red segments   : ${fixture.members.filter((m) => m.outcome === 'failed').length}`)
  console.log(`AFTER (rule: red = still broken now)`)
  console.log(`  task-2 card state         : ${card.state}`)
  console.log(`  task-2 card chain         : ${card.chain.map((slot) => `${slot.key}=${slot.state}`).join(' ')}`)
  console.log(`  spine execute state       : ${execute.state}`)
  console.log(`  current failures (execute): ${progress.currentFailureCount(execute.evidence)}`)
  console.log(`  recovered rows (execute)  : [${[...progress.recoveredFailures(execute.evidence)].join(', ')}]`)
  console.log(`  settle bar segments       : ${bar.map((p) => `${p.props['data-tone']}=${p.props['data-gw-progress-settle-part']}`).join(' ') || '(none)'}`)
  console.log(`  rendered card data-state  : ${cardEl.props['data-state']}`)
  console.log(`  rendered row pills        : ${pills.map((p) => `${p.props['data-gw-progress-pill']}:${p.props['data-state']}`).join(' ')}`)
  console.log(`  spine failure badge       : ${badge === undefined ? '(none)' : badge.props['data-gw-progress-failbadge']}`)
}

// The wires: measured from a stub layout whose owner is failed, to show the line carries
// no state at all (no tone key, no inline style, one border-token stroke in the CSS).
const wires = progress.measureWires({
  querySelectorAll: (selector) => (selector === '[data-gw-progress-task]'
    ? [{
      getAttribute: (name) => (name === 'data-owner' ? 'stage:execute' : name === 'data-gw-progress-task' ? 'phase:任务 2 · 写文档' : 'failed'),
      getBoundingClientRect: () => ({ top: 240, left: 40, height: 80, width: 1300 }),
    }]
    : []),
  querySelector: (selector) => {
    if (selector === '[data-gw-progress-track]') return { getBoundingClientRect: () => ({ top: 100, bottom: 188, left: 0, width: 1440, height: 88 }) }
    if (selector.startsWith('.gw-progress-track')) return { querySelector: () => ({ getBoundingClientRect: () => ({ left: 432, width: 28 }) }), getAttribute: () => 'failed' }
    return null
  },
  getBoundingClientRect: () => ({ top: 100, left: 0, width: 1440, height: 500 }),
})
console.log('\n=== longitudinal wires (owner is failed) ===')
console.log(`  path keys                : ${wires.paths.map((p) => Object.keys(p).join('+')).join(' | ')}`)
console.log(`  tone present on a path   : ${wires.paths.some((p) => 'tone' in p)}`)
const wireRule = progress.css.split('\n').filter((line) => line.startsWith('.gw-progress-wire'))
console.log(`  CSS wire rules           : ${wireRule.map((line) => line.trim()).join('  ||  ')}`)
