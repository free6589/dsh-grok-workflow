// Emit a standalone page that runs the real client bundle (src/client/index.js) against a
// tiny React-compatible DOM renderer, so Chromium lays out the Progress tab's real markup
// with the real stylesheet instead of a jsdom stub.
//
// Usage: node make-page.mjs [--out page.html] [--source src/client/index.js]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..', '..')
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
// Chrome refuses windows narrower than 500px, so the narrow layouts are measured inside a
// same-origin iframe: a media query is evaluated against the iframe's own viewport, which
// is the only way to exercise the <=480px rules without a device emulation session.
if (width < 500) document.getElementById('host').style.width = width + 'px'

let hookStates = []
let hookCursor = 0
let rootProps = null
let pending = false
window.__opened = []
const schedule = () => {
  if (pending) return
  pending = true
  requestAnimationFrame(() => { pending = false; paint() })
}

const refs = new WeakMap()
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
  useRef(initial) {
    const index = hookCursor++
    if (!(index in hookStates)) hookStates[index] = { current: initial === undefined ? null : initial }
    return hookStates[index]
  },
  useMemo(factory) { return factory() },
  useEffect(effect) { queueMicrotask(() => { effect() }) },
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
  const ns = node.type === 'svg' || node.type === 'path' || node.type === 'polygon' ? 'http://www.w3.org/2000/svg' : null
  const el = ns === null ? document.createElement(node.type) : document.createElementNS(ns, node.type)
  for (const [key, value] of Object.entries(node.props)) {
    if (value === undefined || value === null || value === false) continue
    if (key === 'key' || key === 'children') continue
    if (key === 'ref') { if (value !== null && typeof value === 'object') { value.current = el; refs.set(el, value) } continue }
    if (key === 'className') { el.setAttribute('class', value); continue }
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
  failed: [
    record('tool-workflow/run-start', { runId: 'r1', name: '任务团队' }, 10, 1000),
    record('tool-workflow/agent-start', { runId: 'r1', seq: 1, label: '执行', phase: '任务 1 · 修复', childId: 'c1' }, 11, 1100),
    record('tool-workflow/agent-end', { runId: 'r1', seq: 1, outcome: 'failed' }, 12, 61500),
    record('tool-workflow/agent-start', { runId: 'r1', seq: 2, label: '检查', phase: '任务 1 · 修复', childId: 'c2' }, 13, 61600),
  ],
  done: [
    record('tool-workflow/run-start', { runId: 'r1', name: '任务团队' }, 10, 1000),
    record('tool-workflow/agent-start', { runId: 'r1', seq: 1, label: '执行', phase: '任务 1 · 修复', childId: 'c1' }, 11, 1100),
    record('tool-workflow/agent-end', { runId: 'r1', seq: 1, outcome: 'completed' }, 12, 61500),
    record('tool-workflow/run-end', { runId: 'r1', stopReason: 'completed' }, 13, 62000),
  ],
  mixed: [
    record('tool-workflow/run-start', { runId: 'r1', name: '任务团队 · 3 个任务' }, 10, 1000),
    record('tool-workflow/agent-start', { runId: 'r1', seq: 1, label: '规划', phase: '规划', childId: 'c0' }, 11, 1100),
    record('tool-workflow/agent-end', { runId: 'r1', seq: 1, outcome: 'completed' }, 12, 4100),
    record('tool-workflow/agent-start', { runId: 'r1', seq: 2, label: '执行', phase: '任务 1 · 读代码', childId: 'c1' }, 13, 4200),
    record('tool-workflow/agent-end', { runId: 'r1', seq: 2, outcome: 'completed' }, 14, 12400),
    record('tool-workflow/agent-start', { runId: 'r1', seq: 3, label: '检查', phase: '任务 1 · 读代码', childId: 'c2' }, 15, 12500),
    record('tool-workflow/agent-end', { runId: 'r1', seq: 3, outcome: 'completed' }, 16, 18500),
    record('tool-workflow/agent-start', { runId: 'r1', seq: 4, label: '检查', phase: '检查', childId: 'c3' }, 17, 18600),
    record('tool-workflow/agent-start', { runId: 'r1', seq: 5, label: '执行', phase: '任务 2 · 补测试', childId: 'c4' }, 18, 18700),
  ],
}

const runs = progress.fold(fixtures[scenario] || fixtures.running)
const snapshot = { runs, activeRun: progress.selectActiveRun(runs) }
const OPENABLE = new Set(['c1', 'c2', 'c3', 'c4', 'c0'])

function propsOf() {
  return {
    useGrokProgress: (selector) => selector(snapshot),
    progressT: t,
    t,
    canOpen: (childId) => OPENABLE.has(childId),
    openChild: (childId) => { window.__opened.push(childId); return true },
  }
}

function paint() {
  hookCursor = 0
  const tree = progress.component(rootProps)
  const host = document.getElementById('host')
  host.replaceChildren(toDom(tree) || document.createTextNode(''))
  measure()
}

const rect = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }

function measure() {
  const host = document.getElementById('host')
  const root = host.querySelector('.gw-progress')
  const out = { scenario, width, viewport: window.innerWidth }
  if (!root) { out.error = 'no root'; return report(out) }
  out.root = rect(root)
  const flow = root.querySelector('[data-gw-progress-flow]')
  const track = root.querySelector('[data-gw-progress-track]')
  const band = root.querySelector('[data-gw-progress-tasks]')
  out.settle = root.querySelector('[data-gw-progress-settle]') ? {
    box: rect(root.querySelector('[data-gw-progress-settle]')),
    empty: root.querySelector('[data-gw-progress-settle]').getAttribute('data-empty'),
    parts: [...root.querySelectorAll('[data-gw-progress-settle-part]')].map((part) => ({ tone: part.getAttribute('data-tone'), count: part.getAttribute('data-gw-progress-settle-part'), width: Math.round(part.getBoundingClientRect().width) })),
    legend: root.querySelector('[data-gw-progress-settle-legend]').textContent,
  } : null
  out.segments = [...root.querySelectorAll('[data-gw-progress-node]')].map((seg) => {
    const ring = seg.querySelector('.gw-progress-ring')
    const head = seg.querySelector('.gw-progress-seg-head')
    const label = seg.querySelector('.gw-progress-label')
    const meta = seg.querySelector('[data-gw-progress-meta]')
    const dur = seg.querySelector('[data-gw-progress-dur]')
    return {
      key: seg.getAttribute('data-node-key'),
      state: seg.getAttribute('data-state'),
      box: rect(seg),
      ring: rect(ring),
      ringColour: getComputedStyle(ring).borderTopColor,
      headTop: Math.round(head.getBoundingClientRect().top),
      labelClipped: label.scrollWidth > label.clientWidth + 1,
      meta: meta.textContent,
      durEmpty: dur.getAttribute('data-empty'),
      durFill: dur.querySelector('i') ? Math.round(dur.querySelector('i').getBoundingClientRect().width) : 0,
      durFull: Math.round(dur.getBoundingClientRect().width),
    }
  })
  out.links = [...root.querySelectorAll('[data-gw-progress-link]')].map((link) => ({ filled: link.getAttribute('data-filled'), flowing: link.getAttribute('data-flowing'), box: rect(link) }))
  out.cards = [...root.querySelectorAll('[data-gw-progress-task]')].map((card) => ({
    key: card.getAttribute('data-gw-progress-task'),
    owner: card.getAttribute('data-owner'),
    state: card.getAttribute('data-state'),
    box: rect(card),
    pills: [...card.querySelectorAll('[data-gw-progress-pill]')].map((pill) => ({
      seq: pill.getAttribute('data-gw-progress-pill'),
      open: pill.getAttribute('data-gw-progress-open'),
      state: pill.getAttribute('data-state'),
      tag: pill.tagName,
      label: pill.textContent,
    })),
  }))
  out.wires = [...root.querySelectorAll('[data-gw-progress-wire]')].map((wire) => ({
    kind: wire.getAttribute('data-gw-progress-wire'),
    owner: wire.getAttribute('data-owner'),
    card: wire.getAttribute('data-card'),
    tone: wire.getAttribute('data-tone'),
    d: wire.getAttribute('d'),
    stroke: getComputedStyle(wire).stroke,
    dashed: getComputedStyle(wire).strokeDasharray,
  }))
  out.wireHeads = [...root.querySelectorAll('.gw-progress-wire-head')].length
  // Where the band sits relative to the spine, and whether the pad followed the trunk.
  if (band && track && flow) {
    out.layout = {
      track: rect(track),
      band: rect(band),
      bandBelowTrack: band.getBoundingClientRect().top >= track.getBoundingClientRect().bottom - 1,
      bandPadLeft: Math.round(band.getBoundingClientRect().left - flow.getBoundingClientRect().left),
      varPad: getComputedStyle(band).paddingLeft,
      oneRow: new Set(out.segments.map((seg) => seg.box.y)).size === 1,
      firstCardLeft: Math.round(band.querySelector('[data-gw-progress-task]').getBoundingClientRect().left - flow.getBoundingClientRect().left),
    }
  }
  out.trackScroll = track ? { scrollWidth: track.scrollWidth, clientWidth: track.clientWidth } : null
  out.overflowX = track ? track.scrollWidth > track.clientWidth + 1 : null
  const rootRect = root.getBoundingClientRect()
  out.overflowRight = [...root.querySelectorAll('*')]
    .filter((el) => el.getBoundingClientRect().right > rootRect.right + 1)
    .slice(0, 6)
    .map((el) => ({ cls: el.getAttribute('class'), right: Math.round(el.getBoundingClientRect().right) }))
  // Removed-element sweep: every one of these must be absent.
  out.removed = {
    jump: root.querySelectorAll('[data-gw-progress-jump]').length,
    branch: root.querySelectorAll('[data-gw-progress-branch]').length,
    member: root.querySelectorAll('[data-gw-progress-member]').length,
    more: root.querySelectorAll('[data-gw-progress-more]').length,
    detail: root.querySelectorAll('[data-progress-detail], .gw-progress-detail').length,
    zoom: root.querySelectorAll('[data-progress-zoom], .gw-progress-zoom').length,
    retry: root.querySelectorAll('[data-gw-progress-retry], [data-progress-retry]').length,
    copyButton: root.querySelectorAll('[data-gw-progress-copy]').length,
  }
  out.text = root.textContent.replace(/\s+/g, ' ').slice(0, 400)
  // Interaction probe: click one stage and one blank card area; both must be no-ops.
  const before = window.__opened.length
  const card = root.querySelector('[data-gw-progress-task]')
  const stage = root.querySelector('[data-node-key="stage:plan"]')
  if (stage) stage.click()
  if (card) card.click()
  out.inertClicks = { openedDelta: window.__opened.length - before, sameDom: document.querySelectorAll('[data-gw-progress-task]').length === out.cards.length }
  // Pill probe: click the first openable pill in each card; each must open its own child.
  const pills = [...root.querySelectorAll('[data-gw-progress-open]')]
  const opened = [...window.__opened]
  for (const pill of pills) pill.click()
  out.pillClicks = {
    targets: pills.map((pill) => pill.getAttribute('data-gw-progress-open')),
    opened: window.__opened.slice(opened.length),
  }
  return report(out)
}

function report(out) {
  window.__diag = out
  document.documentElement.setAttribute('data-diag', JSON.stringify(out))
}

if (width < 500) {
  document.documentElement.style.width = width + 'px'
  document.body.style.width = width + 'px'
}
// The wires are measured from the laid-out DOM, so the first paints are a convergence:
// each frame's effect re-measures, and the picture is taken once the geometry is stable.
const frameParam = params.get('frame')
if (frameParam !== null) {
  // Parent page: host a same-origin iframe at the requested width and mirror its diag.
  const width = Number(frameParam)
  document.body.replaceChildren()
  const frame = document.createElement('iframe')
  frame.setAttribute('width', String(width))
  frame.setAttribute('height', String(Number(params.get('fh') || 700)))
  frame.style.cssText = 'border:0;display:block'
  frame.src = '?scenario=' + encodeURIComponent(scenario) + '&w=' + width
  document.body.appendChild(frame)
  const copy = () => {
    try {
      const diag = frame.contentDocument.documentElement.getAttribute('data-diag')
      if (diag !== null) document.documentElement.setAttribute('data-diag', diag)
    } catch {}
  }
  frame.addEventListener('load', () => { setTimeout(copy, 120) })
  setInterval(copy, 60)
} else {
  rootProps = propsOf()
  // Converge before anything observes the page. requestAnimationFrame is not reliable in
  // headless Chromium (no compositor → no callbacks under --virtual-time-budget), so the
  // loop is synchronous and the queued effect microtasks are flushed explicitly between
  // paints: measure → render → measure, until the geometry stops moving.
  ;(async () => {
    rootProps = propsOf()
    for (let frames = 0; frames < 8; frames += 1) {
      paint()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    paint()
    document.documentElement.setAttribute('data-ready', 'true')
  })()
}
</script>
`

const page = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>progress tab two-track</title>
<style>
/* Light-theme stand-ins for the DSH alias tokens, so the screenshots show the real colour
   roles instead of every token falling back to currentColor. */
:root{
  --dsw-alias-label-primary:#1f2328; --dsw-alias-label-secondary:#656d76; --dsw-alias-label-inverse:#ffffff;
  --dsw-alias-border-l2:#d0d7de; --dsw-alias-fill-l2:rgba(31,111,235,.08);
  --dsw-alias-bg-layer-2:#ffffff;
  --dsw-alias-state-business-primary:#0969da; --dsw-alias-state-success-primary:#1a7f37;
  --dsw-alias-state-error-primary:#cf222e; --dsw-alias-state-warn-primary:#9a6700;
  --dsw-alias-state-idle-primary:#8c959f;
  --dsw-font-family-sans:system-ui,-apple-system,"Segoe UI",sans-serif;
}
html,body{margin:0;padding:0;background:#fff;color:#1f2328} #host{margin:0 auto}
</style>
</head><body>
${harness.replace('__BUNDLE_SOURCE__', () => source)}
</body></html>`

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, page)
console.log(`wrote ${outPath} (${page.length} bytes) from ${sourcePath}`)
