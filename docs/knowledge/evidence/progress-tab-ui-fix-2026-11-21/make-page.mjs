// Emit a standalone page that runs the real client bundle (src/client/index.js)
// against a tiny React-compatible DOM renderer, so the Progress tab's markup and
// its real stylesheet are laid out by Chromium instead of a jsdom stub.
//
// Usage: node .tmp/progress-ui/make-page.mjs  ->  .tmp/progress-ui/page.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..')
const sourceArg = process.argv.indexOf('--source')
const outArg = process.argv.indexOf('--out')
const sourcePath = sourceArg === -1 ? join(repo, 'src/client/index.js') : process.argv[sourceArg + 1]
const outPath = outArg === -1 ? join(here, 'page.html') : process.argv[outArg + 1]
const source = readFileSync(sourcePath, 'utf8')

const harness = String.raw`
<div id="host"></div>
<script>
let registration
window.__ModuleLoader__ = { load: (spec) => { registration = spec } }
</script>
<script>
__BUNDLE_SOURCE__
</script>
<script>
const params = new URLSearchParams(location.search)
const scenario = params.get('scenario') || 'running'
const width = Number(params.get('w') || 1200)
document.getElementById('host').style.width = width + 'px'

let hookStates = []
let hookCursor = 0
let rootProps = null
let pending = false
const schedule = () => {
  if (pending) return
  pending = true
  requestAnimationFrame(() => { pending = false; paint() })
}
const React = {
  createElement(type, props, ...children) {
    const merged = Object.assign({}, props || {})
    if (typeof type === 'function') return type(merged)
    return { type, props: merged, children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false && c !== true) }
  },
  useState(initial) {
    const index = hookCursor++
    if (!(index in hookStates)) hookStates[index] = typeof initial === 'function' ? initial() : initial
    return [hookStates[index], (next) => {
      hookStates[index] = typeof next === 'function' ? next(hookStates[index]) : next
      schedule()
    }]
  },
  useMemo(factory) { return factory() },
  useEffect(effect) { queueMicrotask(effect) },
  useSyncExternalStore(_subscribe, getSnapshot) { return getSnapshot() },
}

function toDom(node) {
  if (node === null || node === undefined || node === false || node === true) return null
  if (typeof node === 'string' || typeof node === 'number') return document.createTextNode(String(node))
  if (Array.isArray(node)) {
    const fragment = document.createDocumentFragment()
    for (const child of node) { const dom = toDom(child); if (dom) fragment.appendChild(dom) }
    return fragment
  }
  const el = document.createElement(node.type)
  for (const [key, value] of Object.entries(node.props)) {
    if (value === undefined || value === null || value === false) continue
    if (key === 'key' || key === 'children') continue
    if (key === 'className') { el.className = value; continue }
    if (key === 'style' && typeof value === 'object') {
      for (const [prop, val] of Object.entries(value)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, val)
        else el.style[prop] = val
      }
      continue
    }
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value)
      continue
    }
    if (key === 'tabIndex') { el.setAttribute('tabindex', String(value)); continue }
    el.setAttribute(key, value === true ? '' : String(value))
  }
  for (const child of node.children) { const dom = toDom(child); if (dom) el.appendChild(dom) }
  return el
}

const bundle = registration.factory((id) => {
  if (id !== 'react') throw new Error('unexpected require ' + id)
  return React
})

const progress = bundle.GROK_WORKFLOW_PROGRESS
const translate = bundle.GROK_WORKFLOW_INTERNALS.translate
const t = (key, values) => translate('zh', key, values)
const record = (type, data, seq, time) => ({ type, data, seq, time })

const LONG = '任务 2 · 修复进度标签页在窄宽度下标签被截断、成员卡片相互重叠且详情浮层文字溢出的回归问题（含样式与数据分支）'
const fixtures = {
  empty: [],
  running: [
    record('tool-workflow/run-start', { runId: 'r1', name: '任务团队 · 3 个任务' }, 10, 1000),
    record('tool-workflow/agent-start', { runId: 'r1', seq: 1, label: '执行', phase: '任务 1 · 定位渲染错乱', childId: 'c1' }, 11, 1100),
    record('tool-workflow/agent-end', { runId: 'r1', seq: 1, outcome: 'completed' }, 12, 61000),
    record('tool-workflow/agent-start', { runId: 'r1', seq: 2, label: '检查', phase: '任务 1 · 定位渲染错乱', childId: 'c2' }, 13, 61100),
    record('tool-workflow/agent-end', { runId: 'r1', seq: 2, outcome: 'completed' }, 14, 91000),
    record('tool-workflow/agent-start', { runId: 'r1', seq: 3, label: '执行', phase: '任务 2 · 修复样式与数据分支', childId: 'c3' }, 15, 91100),
  ],
  loading: [
    record('tool-workflow/run-start', { runId: 'r1', name: '任务团队 · 2 个任务' }, 10, 1000),
    record('tool-workflow/agent-start', { runId: 'r1', seq: 1, label: '执行', phase: '任务 1 · 排查', childId: 'c1' }, 11, 1100),
  ],
  done: [
    record('tool-workflow/run-start', { runId: 'r1', name: '任务团队' }, 10, 1000),
    record('tool-workflow/agent-start', { runId: 'r1', seq: 1, label: '执行', phase: '任务 1 · 修复', childId: 'c1' }, 11, 1100),
    record('tool-workflow/agent-end', { runId: 'r1', seq: 1, outcome: 'completed' }, 12, 61500),
    record('tool-workflow/run-end', { runId: 'r1', stopReason: 'completed' }, 13, 62000),
  ],
  failed: [
    record('tool-workflow/run-start', { runId: 'r1', name: '任务团队' }, 10, 1000),
    record('tool-workflow/agent-start', { runId: 'r1', seq: 1, label: '执行', phase: '任务 1 · 修复', childId: 'c1' }, 11, 1100),
    record('tool-workflow/agent-end', { runId: 'r1', seq: 1, outcome: 'failed' }, 12, 61500),
    record('tool-workflow/agent-start', { runId: 'r1', seq: 2, label: '检查', phase: '任务 1 · 修复', childId: 'c2' }, 13, 61600),
  ],
  longtext: [
    record('tool-workflow/run-start', { runId: 'r1', name: '任务团队 · 3 个任务' }, 10, 1000),
    record('tool-workflow/agent-start', { runId: 'r1', seq: 1, label: '执行', phase: LONG, childId: 'c1' }, 11, 1100),
    record('tool-workflow/agent-end', { runId: 'r1', seq: 1, outcome: 'completed' }, 12, 61500),
    record('tool-workflow/agent-start', { runId: 'r1', seq: 2, label: '检查', phase: LONG, childId: 'c2' }, 13, 61600),
    record('tool-workflow/agent-end', { runId: 'r1', seq: 2, outcome: 'completed' }, 14, 91600),
    record('tool-workflow/agent-start', { runId: 'r1', seq: 3, label: '执行', phase: '任务 3 · 补测试与宽度断言', childId: 'c3' }, 15, 91700),
  ],
}

const runs = progress.fold(fixtures[scenario] || fixtures.running)
const snapshot = { runs, activeRun: progress.selectActiveRun(runs) }

function propsOf() {
  return {
    useGrokProgress: (selector) => selector(snapshot),
    progressT: t,
    t,
    canOpen: () => false,
    openChild: () => false,
    detailSources: () => ({}),
  }
}

let clickedOnce = false

function paint() {
  hookCursor = 0
  const tree = progress.component(rootProps)
  const host = document.getElementById('host')
  host.replaceChildren(toDom(tree) || document.createTextNode(''))
  if (params.get('click') && !clickedOnce) {
    clickedOnce = true
    const index = Number(params.get('click'))
    const nodes = host.querySelectorAll('[data-gw-progress-node]')
    if (nodes[index]) nodes[index].click()
  }
  measure()
}

function measure() {
  const host = document.getElementById('host')
  const root = host.querySelector('.gw-progress')
  const out = { scenario, width, viewport: window.innerWidth }
  if (!root) { out.error = 'no root'; window.__diag = out; return report(out) }
  const rect = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }
  out.root = rect(root)
  const track = root.querySelector('.gw-progress-track')
  if (track) {
    out.track = rect(track)
    out.track.scrollWidth = track.scrollWidth
    out.track.clientWidth = track.clientWidth
    out.track.overflowX = track.scrollWidth > track.clientWidth + 1
  }
  out.segments = [...root.querySelectorAll('.gw-progress-seg')].map((seg) => {
    const label = seg.querySelector('.gw-progress-label')
    const ring = seg.querySelector('.gw-progress-ring')
    const meta = seg.querySelector('.gw-progress-meta')
    const head = seg.querySelector('.gw-progress-seg-head')
    const cs = ring ? getComputedStyle(ring) : undefined
    return {
      key: seg.getAttribute('data-node-key'),
      state: seg.getAttribute('data-state'),
      box: rect(seg),
      headW: head ? Math.round(head.getBoundingClientRect().width) : 0,
      labelW: label ? Math.round(label.getBoundingClientRect().width) : 0,
      labelFull: label ? label.scrollWidth : 0,
      labelClipped: label ? label.scrollWidth > label.clientWidth + 1 : false,
      metaClipped: meta ? meta.scrollWidth > meta.clientWidth + 1 : false,
      ring: ring ? { ...rect(ring), borderTopWidth: cs.borderTopWidth, borderRadius: cs.borderTopRadius || cs.borderTopLeftRadius, display: cs.display } : null,
    }
  })
  out.branches = [...root.querySelectorAll('.gw-progress-branch')].map((branch) => ({
    key: branch.getAttribute('data-gw-progress-branch'),
    box: rect(branch),
    members: branch.querySelectorAll('.gw-progress-member').length,
  }))
  out.detail = [...root.querySelectorAll('.gw-progress-detail')].map((detail) => ({
    box: rect(detail),
    overflowing: detail.scrollWidth > detail.clientWidth + 1,
  }))
  const rootRect = root.getBoundingClientRect()
  out.overflowRight = [...root.querySelectorAll('*')]
    .filter((el) => el.getBoundingClientRect().right > rootRect.right + 1)
    .slice(0, 8)
    .map((el) => ({ cls: el.className, right: Math.round(el.getBoundingClientRect().right) }))
  report(out)
}

function report(out) {
  window.__diag = out
  document.documentElement.setAttribute('data-diag', JSON.stringify(out))
  const pre = document.createElement('pre')
  pre.id = 'diag'
  pre.textContent = JSON.stringify(out, null, 1)
  pre.style.cssText = 'font:11px monospace;white-space:pre-wrap;border-top:2px solid #c00;margin-top:12px;padding:8px'
  document.body.appendChild(pre)
}

rootProps = propsOf()
paint()
</script>
`

const page = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>progress tab repro</title>
<style>
/* Light-theme stand-ins for the DSH alias tokens, so the screenshots show the real
   colour roles instead of every token falling back to currentColor. */
:root{
  --dsw-alias-label-primary:#1f2328; --dsw-alias-label-secondary:#656d76; --dsw-alias-label-inverse:#ffffff;
  --dsw-alias-border-l2:#d0d7de; --dsw-alias-fill-l2:rgba(31,111,235,.08);
  --dsw-alias-bg-layer-2:#ffffff;
  --dsw-alias-state-business-primary:#0969da; --dsw-alias-state-success-primary:#1a7f37;
  --dsw-alias-state-error-primary:#cf222e; --dsw-alias-state-warn-primary:#9a6700;
  --dsw-alias-state-idle-primary:#8c959f;
  --dsw-font-family-sans:system-ui,-apple-system,"Segoe UI",sans-serif;
  --dsw-font-family-mono:ui-monospace,SFMono-Regular,monospace;
}
html,body{margin:0;padding:0;background:#fff;color:#1f2328} #host{margin:0 auto}
</style>
</head><body>
${harness.replace('__BUNDLE_SOURCE__', () => source)}
</body></html>`

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, page)
console.log(`wrote ${outPath} (${page.length} bytes) from ${sourcePath}`)
