/**
 * Production-path LoopSwitch verification (round-023).
 *
 * Drives the REAL built bundle's LoopSwitch component with NO `loopSend` prop —
 * exactly the production wiring — against the live loopfix-verify instance, using
 * node fetch + the instance cookie jar as the page's own fetch. Before the fix,
 * the component defaulted `send` to `loopSend` itself (body-shaped), so every read
 * answered `loop/response` with `HTTP undefined` and the switch sat inert.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const BASE = 'http://127.0.0.1:3451'
const JAR = new URL('./cookies.txt', import.meta.url)
const SID = readFileSync(new URL('./session-id.txt', import.meta.url), 'utf8').trim()
const LOG = []
const log = (m) => { LOG.push(m); console.log(m) }

// --- page environment: baseURI + fetch with the browser's own credentials ---
const jar = readFileSync(JAR, 'utf8').split('\n')
  .filter((l) => l && !l.startsWith('# ') && !l.startsWith('#This') && !l.startsWith('# Netscape') && !l.startsWith('# https'))
  .map((l) => l.replace(/^#HttpOnly_/, '').split('\t'))
  .filter((p) => p.length >= 7)
  .map((p) => `${p[5]}=${p[6]}`).join('; ')
if (!jar) { console.error('FAIL: empty cookie jar'); process.exit(1) }
const realFetch = globalThis.fetch
globalThis.document = { baseURI: `${BASE}/` }
globalThis.fetch = (url, init = {}) => {
  LOG.push(`POST ${url}`)
  return realFetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), Cookie: jar, Origin: BASE },
  })
}

// --- minimal React stand-in (effects run once, like React after commit) ---
let cells = []
let idx = 0
const effects = []
const React = {
  createElement: (type, props, ...children) => {
    const el = { type, props: props ?? {}, children: children.flat(Infinity) }
    return typeof type === 'function' ? type(el.props) : el
  },
  useState: (init) => {
    const at = idx++
    if (at >= cells.length) cells.push(typeof init === 'function' ? init() : init)
    return [cells[at], (n) => { cells[at] = typeof n === 'function' ? n(cells[at]) : n }]
  },
  useEffect: (fn) => { effects.push(fn) },
  useMemo: (f) => f(),
  useSyncExternalStore: (_s, g) => g(),
}

// --- load the real bundle ---
const source = readFileSync('/home/fish/projects_mine/dsh-grok-workflow/src/client/index.js', 'utf8')
let registration
const prevWindow = globalThis.window
globalThis.window = { __ModuleLoader__: { load: (spec) => { registration = spec } } }
try { new Function(source)() } finally { globalThis.window = prevWindow }
const loaded = registration.factory((id) => {
  if (id === 'react') return React
  throw new Error(`unexpected require ${id}`)
})
const loop = loaded.GROK_WORKFLOW_LOOP
const zhDict = loaded.GROK_WORKFLOW_DICT.zh
const t = (key, params = {}) => {
  let s = zhDict[key] ?? key
  for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v))
  return s
}

const texts = (el) => {
  const out = []
  const walk = (n) => {
    if (typeof n === 'string') { out.push(n); return }
    if (Array.isArray(n)) { n.forEach(walk); return }
    if (n && typeof n === 'object') {
      (n.children ?? []).forEach(walk)
      const c = n.props?.children
      if (c !== undefined && n.children.length === 0) walk(c)
    }
  }
  walk(el)
  return out
}
const find = (el, pred) => {
  let hit
  const walk = (n) => {
    if (hit !== undefined) return
    if (Array.isArray(n)) { n.forEach(walk); return }
    if (n && typeof n === 'object') {
      if (n.props && pred(n.props)) { hit = n; return }
      ;(n.children ?? []).forEach(walk)
    }
  }
  walk(el)
  return hit
}
const settle = async () => { for (let i = 0; i < 40; i++) await new Promise((r) => setTimeout(r, 5)) }
const render = (props) => { idx = 0; effects.length = 0; return loaded.GROK_WORKFLOW_LOOP.component(props) }

const fail = (m) => { log(`FAIL: ${m}`); writeFileSync(new URL('./switch-prod-path.txt', import.meta.url), LOG.join('\n') + '\n'); process.exit(1) }

// 1. mount with NO loopSend prop (production wiring)
let tree = render({ sessionId: SID, t })
const toggleFirst = find(tree, (p) => p['data-loop-toggle'] === true)
if (toggleFirst?.props.disabled !== true) fail('switch must be disabled while reading')
log('mount: disabled while reading — OK')
for (const e of effects.splice(0)) await e()
await settle()
tree = render({ sessionId: SID, t })
const note = find(tree, (p) => p['data-loop-note'] !== undefined)
const toggle = find(tree, (p) => p['data-loop-toggle'] === true)
log(`after read: state=${note?.props['data-loop-note']} note="${texts(note).join(' ')}"`)
if (note?.props['data-loop-note'] === 'failed') fail(`production read failed: ${texts(tree).join(' ')}`)
if (!texts(tree).join(' ').includes('关')) fail('expected 关 after read of a closed loop')
if (toggle?.props.disabled !== false) fail('switch must be clickable after read')
log('read on mount via page fetch — OK (no HTTP undefined)')

// 2. click to open
toggle.props.onClick()
await settle()
tree = render({ sessionId: SID, t })
log(`after open click: "${texts(tree).join(' ')}"`)
if (!texts(tree).join(' ').includes('开')) fail('expected 开 after open click')
const serverOpen = await (await realFetch(`${BASE}/grok-workflow/loop`, {
  method: 'POST', headers: { 'content-type': 'application/json', Cookie: jar, Origin: BASE },
  body: JSON.stringify({ action: 'status', sessionId: SID }),
})).json()
if (serverOpen.loop?.open !== true) fail(`server does not show open: ${JSON.stringify(serverOpen)}`)
log(`server confirms open (task ${serverOpen.loop.taskId}) — OK`)

// 3. click to close
find(tree, (p) => p['data-loop-toggle'] === true).props.onClick()
await settle()
tree = render({ sessionId: SID, t })
log(`after close click: "${texts(tree).join(' ')}"`)
if (!texts(tree).join(' ').includes('关')) fail('expected 关 after close click')
const serverClosed = await (await realFetch(`${BASE}/grok-workflow/loop`, {
  method: 'POST', headers: { 'content-type': 'application/json', Cookie: jar, Origin: BASE },
  body: JSON.stringify({ action: 'status', sessionId: SID }),
})).json()
if (serverClosed.loop?.open !== false) fail(`server does not show closed: ${JSON.stringify(serverClosed)}`)
log('server confirms closed — OK')

log('PASS: production-path switch reads, opens and closes through the page fetch')
writeFileSync(new URL('./switch-prod-path.txt', import.meta.url), LOG.join('\n') + '\n')
