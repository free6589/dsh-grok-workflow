/**
 * Round-024收口 production-path verification: both switches via the REAL bundle
 * with NO send override, through the page's own fetch into the live instance.
 * Cookie jar: .rsi/evidence/round-024/cookies.txt (Netscape format, HttpOnly).
 */
import { readFileSync, writeFileSync } from 'node:fs'

const BASE = 'http://127.0.0.1:3451'
const LOG = []
const log = (m) => { LOG.push(m); console.log(m) }
const out = new URL('./switches-live.txt', import.meta.url)
const fail = (m) => { log(`FAIL: ${m}`); writeFileSync(out, LOG.join('\n') + '\n'); process.exit(1) }

const raw = readFileSync(new URL('./cookies.txt', import.meta.url), 'utf8')
const jar = raw.split('\n')
  .filter((l) => l && !l.startsWith('# ') && !l.startsWith('#This') && !l.startsWith('# Netscape') && !l.startsWith('# https'))
  .map((l) => l.replace(/^#HttpOnly_/, '').split('\t'))
  .filter((p) => p.length >= 7)
  .map((p) => `${p[5]}=${p[6]}`).join('; ')
if (jar.length < 50) fail('cookie jar unusable (boolean check only)')
const SID = readFileSync(new URL('./session-id.txt', import.meta.url), 'utf8').trim()

globalThis.document = { baseURI: `${BASE}/` }
const realFetch = globalThis.fetch
globalThis.fetch = (url, init = {}) => {
  LOG.push(`POST ${url}`)
  return realFetch(url, { ...init, headers: { ...(init.headers ?? {}), Cookie: jar, Origin: BASE } })
}

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

const source = readFileSync('/home/fish/projects_mine/dsh-grok-workflow/src/client/index.js', 'utf8')
let registration
const prevWindow = globalThis.window
globalThis.window = { __ModuleLoader__: { load: (spec) => { registration = spec } } }
try { new Function(source)() } finally { globalThis.window = prevWindow }
const loaded = registration.factory((id) => {
  if (id === 'react') return React
  throw new Error(`unexpected require ${id}`)
})
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
    if (n && typeof n === 'object') { (n.children ?? []).forEach(walk) }
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
const render = (comp, props) => { idx = 0; effects.length = 0; return comp(props) }
const serverStatus = async (route) => (await (await realFetch(`${BASE}/grok-workflow/${route}`, {
  method: 'POST', headers: { 'content-type': 'application/json', Cookie: jar, Origin: BASE },
  body: JSON.stringify({ action: 'status', sessionId: SID }),
})).json()).loop

for (const [name, comp, attr] of [['loop', loaded.GROK_WORKFLOW_LOOP.component, 'loop'], ['iterate', loaded.GROK_WORKFLOW_ITERATE.component, 'iterate']]) {
  const route = name === 'loop' ? 'loop' : 'iterate'
  cells = []
  let tree = render(comp, { sessionId: SID, t })
  if (find(tree, (p) => p[`data-${attr}-toggle`] === true)?.props.disabled !== true) fail(`${name}: must be disabled while reading`)
  log(`${name}: disabled while reading — OK`)
  for (const e of effects.splice(0)) await e()
  await settle()
  tree = render(comp, { sessionId: SID, t })
  const note = find(tree, (p) => p[`data-${attr}-note`] !== undefined)
  if (note?.props[`data-${attr}-note`] === 'failed') fail(`${name}: production read failed: ${texts(tree).join(' ')}`)
  log(`${name}: read via page fetch — "${texts(tree).join(' ')}"`)
  find(tree, (p) => p[`data-${attr}-toggle`] === true).props.onClick()
  await settle()
  tree = render(comp, { sessionId: SID, t })
  const opened = texts(tree).join(' ')
  const srv = await serverStatus(route)
  if (srv?.open !== true) fail(`${name}: server not open after click: ${JSON.stringify(srv)}`)
  log(`${name}: opened — "${opened}" (task ${srv.taskId})`)
  find(tree, (p) => p[`data-${attr}-toggle`] === true).props.onClick()
  await settle()
  tree = render(comp, { sessionId: SID, t })
  const srv2 = await serverStatus(route)
  if (srv2?.open !== false) fail(`${name}: server not closed after click`)
  log(`${name}: closed — "${texts(tree).join(' ')}"`)
}
log('PASS: both switches drive their own rows through the production path')
writeFileSync(out, LOG.join('\n') + '\n')
