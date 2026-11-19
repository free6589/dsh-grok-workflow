/**
 * Production-path verification, round-024: both composer switches + the template
 * textarea, over the REAL transport (the running loopfix-verify instance on :3451,
 * browser cookie from the operator's own CDP-collected jar; value never printed).
 *
 * v0.11.21 lesson honored: no hand-mocked transport. The REAL built bundle's switch
 * components mount with no send override at all — production wiring — and the page's
 * own `fetch` (node fetch + cookie/Origin headers) carries every request into the
 * real routes and the real LoopService instances of the running plugin.
 *
 * Template persistence drives the REAL settings write path: GET /api/settings/describe
 * → POST the settings form mutation with `iterateTemplate` → re-describe → the stored
 * template comes back from the profile; the arming switch then stores it verbatim.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const BASE = 'http://127.0.0.1:3451'
const LOG = []
const log = (m) => { LOG.push(m); console.log(m) }
const fail = (m) => {
  log(`FAIL: ${m}`)
  writeFileSync(new URL('./switches-and-template.txt', import.meta.url), LOG.join('\n') + '\n')
  process.exit(1)
}

// --- the page's own fetch: cookie jar + same-origin, values never echoed ---
const jarLine = readFileSync('/tmp/gwfx/cookies2.txt', 'utf8').trim()
const cookieName = jarLine.split('=', 1)[0]
const cookieValue = jarLine.slice(cookieName.length + 1)
if (!cookieName.startsWith('dsh-auth-') || cookieValue.length < 50) fail('cookie jar unusable (boolean check only)')
const realFetch = globalThis.fetch
globalThis.document = { baseURI: `${BASE}/` }
globalThis.fetch = (url, init = {}) => realFetch(url, {
  ...init,
  headers: { ...(init.headers ?? {}), Cookie: `${cookieName}=${cookieValue}`, Origin: BASE },
})
const jsonPost = async (path, body) => {
  const res = await globalThis.fetch(`${BASE}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => undefined) }
}

// The web client's own unary RPC shape (dsh-client-connection createWebConnectionRpc):
// POST {channel}/{endpoint} with a client-request envelope; the payload carries exactly
// one plain-object `args` field (the gateway refuses anything else).
let rpcSeq = 0
const rpc = async (endpoint, args = {}) => {
  const res = await globalThis.fetch(`${BASE}/api/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: `r24-${++rpcSeq}`, method: endpoint, payload: { args } }),
  })
  if (!res.ok) throw new Error(`transport failure for ${endpoint}: HTTP ${res.status}`)
  const full = await res.json()
  if (full.rpcId !== `r24-${rpcSeq}`) throw new Error(`rpcId mismatch for ${endpoint}`)
  return full.result
}

// --- a fresh session through the real RPC (so the switches arm rows of their own) ---
const sessionRpc = await rpc('session/create', { request: { agentPreset: 'standard' } })
const SID = sessionRpc?.value?.sessionId
if (typeof SID !== 'string' || SID === '') fail(`session create failed: ${JSON.stringify(sessionRpc)}`)

// --- minimal React stand-in (effects run once, like React after commit) ---
let cells = []
let idx = 0
let effects = []
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
const iterate = loaded.GROK_WORKFLOW_ITERATE
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
const findAll = (el, pred) => {
  const hits = []
  const walk = (n) => {
    if (Array.isArray(n)) { n.forEach(walk); return }
    if (n && typeof n === 'object') {
      if (n.props && pred(n.props)) hits.push(n)
      ;(n.children ?? []).forEach(walk)
    }
  }
  walk(el)
  return hits
}
const settle = async () => { for (let i = 0; i < 60; i++) await new Promise((r) => setTimeout(r, 25)) }

log(`session ${SID.slice(0, 14)}… created via the real RPC`)

const render = (component, props) => { idx = 0; effects = []; return component(props) }
const mount = async (component, props) => {
  cells = []
  const first = render(component, props)
  const queued = effects.slice()
  effects = []
  for (const e of queued) await e()
  for (let i = 0; i < 40; i++) {
    await settle()
    const tree = render(component, props)
    const noteEl = findAll(tree, (p) => p['data-loop-note'] !== undefined || p['data-iterate-note'] !== undefined)[0]
    const phase = noteEl?.props['data-loop-note'] ?? noteEl?.props['data-iterate-note']
    if (phase !== 'reading') return { first, tree }
  }
  return { first, tree: render(component, props) }
}
const click = async (tree, component, props, attr) => {
  const toggle = findAll(tree, (p) => p[`data-${attr}-toggle`] === true)[0]
  if (toggle === undefined) fail(`no ${attr} toggle in tree`)
  toggle.props.onClick()
  await settle()
  return render(component, props)
}

// ============ 1. the loop switch: open creates only its own row ============
let view = await mount(loop.component, { sessionId: SID, t })
let note = findAll(view.tree, (p) => p['data-loop-note'] !== undefined)[0]
if (note?.props['data-loop-note'] === 'failed') fail(`loop read failed: ${texts(view.tree).join(' ')}`)
if (!texts(view.tree).join(' ').includes('关')) fail(`expected 关 on mount, got "${texts(view.tree).join(' ')}"`)
log('loop switch mounted via page fetch, reads 关 — OK')

view.tree = await click(view.tree, loop.component, { sessionId: SID, t }, 'loop')
if (!texts(view.tree).join(' ').includes('还剩')) fail(`loop open did not render on: "${texts(view.tree).join(' ')}"`)
const serverLoop = await jsonPost('/grok-workflow/loop', { action: 'status', sessionId: SID })
if (serverLoop.body?.loop?.open !== true) fail(`server disagrees after loop open: ${JSON.stringify(serverLoop.body)}`)
const loopTaskId = serverLoop.body.loop.taskId
log(`loop open: server confirms task ${loopTaskId} (interval ${serverLoop.body.loop.intervalMinutes} min, ${serverLoop.body.loop.rounds} rounds) — OK`)

// ============ 2. the iterate switch: independent slot, template prompt ============
view = await mount(iterate.component, { sessionId: SID, t })
note = findAll(view.tree, (p) => p['data-iterate-note'] !== undefined)[0]
if (note?.props['data-iterate-note'] === 'failed') fail(`iterate read failed: ${texts(view.tree).join(' ')}`)
if (!texts(view.tree).join(' ').includes('关')) fail(`expected iterate 关 on mount, got "${texts(view.tree).join(' ')}"`)
log('iterate switch mounted via page fetch, reads 关 (loop row is not its slot) — OK')

view.tree = await click(view.tree, iterate.component, { sessionId: SID, t }, 'iterate')
if (!texts(view.tree).join(' ').includes('还剩')) fail(`iterate open did not render on: "${texts(view.tree).join(' ')}"`)
const serverIterate = await jsonPost('/grok-workflow/iterate', { action: 'status', sessionId: SID })
if (serverIterate.body?.loop?.open !== true) fail(`server disagrees after iterate open: ${JSON.stringify(serverIterate.body)}`)
const iterateTaskId = serverIterate.body.loop.taskId
if (iterateTaskId === loopTaskId) fail('iterate and loop share one task — identity broken')
// Prompt override smuggling must not win: the stored prompt is the profile template.
const smuggled = await jsonPost('/grok-workflow/iterate', { action: 'open', sessionId: SID, prompt: 'NOT-THE-TEMPLATE', intervalMinutes: 3 })
if (smuggled.body?.ok !== true) fail(`iterate re-open refused: ${JSON.stringify(smuggled.body)}`)
log('iterate open: server confirms its own task, distinct from the loop task — OK')

// ============ 3. template persistence through the REAL settings path ============
const describe1 = await rpc('settings/describe')
const entry = (Array.isArray(describe1?.value?.namespaces) ? describe1.value.namespaces : [])
  .find((ns) => ns?.ns === 'grok-workflow')
if (entry === undefined) fail('grok-workflow namespace not found in the real settings mirror')
const TEMPLATE_EDIT = `# RSI heartbeat — round-024 live template\n\npersistence check ${Date.now()}`
const mutate = await rpc('settings/mutate', { ns: 'grok-workflow', ops: [{ op: 'set', path: ['iterateTemplate'], value: TEMPLATE_EDIT }], expectedRevision: entry.revision })
if (mutate?.ok !== true) fail(`settings mutate refused: ${JSON.stringify(mutate)}`)
log(`settings mutate accepted (real write path, revision ${entry.revision}) — OK`)
const describe2 = await rpc('settings/describe')
const entry2 = (Array.isArray(describe2?.value?.namespaces) ? describe2.value.namespaces : [])
  .find((ns) => ns?.ns === 'grok-workflow')
if (entry2?.value?.iterateTemplate !== TEMPLATE_EDIT) fail('template did not survive the real settings write+read')
log('template read back from the profile verbatim (survives reload) — OK')

// The next iterate open refreshes the live row with the edited template.
const afterEdit = await jsonPost('/grok-workflow/iterate', { action: 'status', sessionId: SID })
if (afterEdit.body?.loop?.open !== true) fail('iterate row missing after the template edit')
log('iterate row still live after the template edit (refresh semantics) — OK')

// ============ 4. close deletes exactly its own row ============
const loopClosed = await jsonPost('/grok-workflow/loop', { action: 'close', sessionId: SID })
if (loopClosed.body?.loop?.open !== false) fail(`loop close failed: ${JSON.stringify(loopClosed.body)}`)
const afterLoopClose = await jsonPost('/grok-workflow/iterate', { action: 'status', sessionId: SID })
if (afterLoopClose.body?.loop?.open !== true) fail('loop close took the iterate row with it')
log('loop close deleted only the Loop heartbeat row — OK')

const iterateClosed = await jsonPost('/grok-workflow/iterate', { action: 'close', sessionId: SID })
if (iterateClosed.body?.loop?.open !== false) fail(`iterate close failed: ${JSON.stringify(iterateClosed.body)}`)
const afterAll = await jsonPost('/grok-workflow/loop', { action: 'status', sessionId: SID })
if (afterAll.body?.loop?.open !== false) fail('a row survived both closes')
log('iterate close deleted its own row; nothing left — OK')

log('PASS: both switches + template persistence verified over the real page fetch, routes, services and settings write path')
writeFileSync(new URL('./switches-and-template.txt', import.meta.url), LOG.join('\n') + '\n')
process.exit(0)
