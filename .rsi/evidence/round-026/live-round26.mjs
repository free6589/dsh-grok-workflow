/**
 * Production-path verification, round-025: the self-iteration switch arms the
 * `RSI heartbeat` row with the SHIPPED DEFAULT template, and closing it leaves no
 * Schedule residue.
 *
 * Runs against the real built bundle of the running isolated profile
 * (`loopfix-verify`, link to this worktree, :3451). No transport override: the
 * page's own `fetch` carries every request into the real routes and the real
 * LoopService instance of the running plugin. The cookie is read from a
 * Netscape jar written by curl from the boot URL; its value is never printed.
 *
 * The profile's stored `iterateTemplate` is blanked first through the real
 * settings write path, so the open exercises the whitespace fallback rather than
 * whatever an earlier round left in the profile.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { DEFAULT_ITERATE_TEMPLATE } from '../../../lib/config.js'

const BASE = 'http://127.0.0.1:3451'
const LOG = []
const log = (m) => { LOG.push(m); console.log(m) }
const fail = (m) => {
  log(`FAIL: ${m}`)
  writeFileSync(new URL('./live-iterate.txt', import.meta.url), LOG.join('\n') + '\n')
  process.exit(1)
}

// --- the page's own fetch: cookie jar + same-origin, values never echoed ---
const jarLine = readFileSync('/tmp/gwfx25/cookies.txt', 'utf8')
  .split('\n')
  .find((line) => line.startsWith('#HttpOnly_'))
if (jarLine === undefined) fail('cookie jar has no dsh-auth entry')
const jarFields = jarLine.split('\t')
const cookieName = jarFields[5]
const cookieValue = jarFields[6]
if (!cookieName?.startsWith('dsh-auth-') || !cookieValue || cookieValue.length < 50) fail('cookie jar unusable (boolean check only)')
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

// The web client's own unary RPC shape (dsh-client-connection createWebConnectionRpc).
let rpcSeq = 0
const rpc = async (endpoint, args = {}) => {
  const res = await globalThis.fetch(`${BASE}/api/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: `r25-${++rpcSeq}`, method: endpoint, payload: { args } }),
  })
  if (!res.ok) throw new Error(`transport failure for ${endpoint}: HTTP ${res.status}`)
  const full = await res.json()
  if (full.rpcId !== `r25-${rpcSeq}`) throw new Error(`rpcId mismatch for ${endpoint}`)
  return full.result
}

// --- the real Schedule storage, read-only: what the plugin actually wrote ---
const SCHEDULE = `${process.env.HOME}/.dsh/storages/schedule.json`
const scheduleEntries = () => Object.entries(JSON.parse(readFileSync(SCHEDULE, 'utf8')).tables?.tasks ?? {})
  .map(([id, entry]) => ({ id, ...entry }))
const rowsFor = (sessionId) => scheduleEntries().filter((entry) => entry.target?.sessionId === sessionId)
const allIds = () => new Set(scheduleEntries().map((entry) => entry.id))
const before = { ids: allIds(), rows: [] }

// --- a fresh session through the real RPC (so the switch arms a row of its own) ---
const sessionRpc = await rpc('session/create', { request: { agentPreset: 'standard' } })
const SID = sessionRpc?.value?.sessionId
if (typeof SID !== 'string' || SID === '') fail(`session create failed: ${JSON.stringify(sessionRpc)}`)
log(`session ${SID.slice(0, 14)}… created via the real RPC`)

// --- blank the stored template so the open must use the shipped default ---
const namespacesOf = (described) => (Array.isArray(described?.value?.namespaces) ? described.value.namespaces : [])
const entryOf = (described) => namespacesOf(described).find((ns) => ns?.ns === 'grok-workflow')
const described0 = await rpc('settings/describe')
const entry0 = entryOf(described0)
if (entry0 === undefined) fail('grok-workflow namespace not found in the real settings mirror')
let blanked = false
if (entry0.value?.iterateTemplate !== '') {
  const cleared = await rpc('settings/mutate', {
    ns: 'grok-workflow',
    ops: [{ op: 'set', path: ['iterateTemplate'], value: '' }],
    expectedRevision: entry0.revision,
  })
  if (cleared?.ok !== true) fail(`settings mutate refused: ${JSON.stringify(cleared)}`)
  blanked = true
}
const described1 = await rpc('settings/describe')
if (entryOf(described1)?.value?.iterateTemplate !== '') fail('stored template is not blank; the fallback would not be exercised')
log(`${blanked ? 'stored template blanked through the real settings write path' : 'stored template was already blank in the real settings mirror'} (fallback exercised) — OK`)

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
    const noteEl = findAll(tree, (p) => p['data-iterate-note'] !== undefined)[0]
    if (noteEl?.props['data-iterate-note'] !== 'reading') return { first, tree }
  }
  return { first, tree: render(component, props) }
}
const click = async (tree, component, props) => {
  const toggle = findAll(tree, (p) => p['data-iterate-toggle'] === true)[0]
  if (toggle === undefined) fail('no iterate toggle in tree')
  toggle.props.onClick()
  await settle()
  return render(component, props)
}

// ============ 1. the iterate switch reads closed, then open ============
let view = await mount(iterate.component, { sessionId: SID, t })
let note = findAll(view.tree, (p) => p['data-iterate-note'] !== undefined)[0]
if (note?.props['data-iterate-note'] === 'failed') fail(`iterate read failed: ${texts(view.tree).join(' ')}`)
if (!texts(view.tree).join(' ').includes('关')) fail(`expected 关 on mount, got "${texts(view.tree).join(' ')}"`)
log('iterate switch mounted via page fetch, reads 关 — OK')

view.tree = await click(view.tree, iterate.component, { sessionId: SID, t })
if (!texts(view.tree).join(' ').includes('还剩')) fail(`iterate open did not render on: "${texts(view.tree).join(' ')}"`)
const serverOpened = await jsonPost('/grok-workflow/iterate', { action: 'status', sessionId: SID })
if (serverOpened.body?.loop?.open !== true) fail(`server disagrees after iterate open: ${JSON.stringify(serverOpened.body)}`)
const taskId = serverOpened.body.loop.taskId
log(`iterate open: server confirms its own task ${taskId} — OK`)

// ============ 2. the Schedule row carries the shipped default template ============
const openedRows = rowsFor(SID)
if (openedRows.length !== 1) fail(`expected exactly one Schedule row for the session, got ${openedRows.length}`)
const row = openedRows[0]
if (row.id !== taskId) fail(`status taskId ${taskId} is not the stored row ${row.id}`)
if (row.record?.title !== 'RSI heartbeat') fail(`stored title is ${JSON.stringify(row.record?.title)}, not RSI heartbeat`)
if (row.record?.prompt !== DEFAULT_ITERATE_TEMPLATE) fail('the stored prompt is not the shipped default template')
if (!row.record.prompt.startsWith('# RSI heartbeat — self-iteration round')) fail('the default template lost its first line')
if (!row.record.prompt.includes('POOL first') || !row.record.prompt.includes('R1 ')) fail('the default template lost its required sections')
if (row.record.prompt.length !== DEFAULT_ITERATE_TEMPLATE.length) fail('stored prompt length drifted from the default')
log(`Schedule row written: title "RSI heartbeat", ${row.record.prompt.length} chars, byte-equal to DEFAULT_ITERATE_TEMPLATE — OK`)
writeFileSync(new URL('./schedule-open-row.json', import.meta.url), JSON.stringify({
  id: row.id, title: row.record.title, kind: row.record.kind, rrule: row.record.rrule, target: row.target,
  promptChars: row.record.prompt.length,
  promptSha: (await import('node:crypto')).createHash('sha256').update(row.record.prompt).digest('hex'),
}, null, 2) + '\n')

// A loop row is not this switch's row, and none exists for this session.
if (scheduleEntries().some((entry) => entry.target?.sessionId === SID && entry.record?.title === 'Loop heartbeat')) fail('the iterate open created a Loop heartbeat row')

// ============ 3. close deletes its own row, and leaves no residue ============
view.tree = await click(view.tree, iterate.component, { sessionId: SID, t })
if (!texts(view.tree).join(' ').includes('关')) fail(`expected 关 after close, got "${texts(view.tree).join(' ')}"`)
const serverClosed = await jsonPost('/grok-workflow/iterate', { action: 'status', sessionId: SID })
if (serverClosed.body?.loop?.open !== false) fail(`iterate close failed: ${JSON.stringify(serverClosed.body)}`)
const afterRows = rowsFor(SID)
if (afterRows.length !== 0) fail(`Schedule residue after close: ${afterRows.map((r) => `${r.record?.title}:${r.id}`).join(', ')}`)
if (scheduleEntries().some((entry) => entry.id === taskId)) fail('the opened task id is still in Schedule storage')
const afterIds = allIds()
const removed = [...before.ids].filter((id) => !afterIds.has(id))
if (removed.length !== 0) fail(`close deleted rows it did not own: ${removed.join(', ')}`)
log('iterate close deleted only its own row; session has no Schedule residue, no foreign row removed — OK')

// ============ 4. a second open/close cycle is equally clean ============
view.tree = await click(view.tree, iterate.component, { sessionId: SID, t })
const reopened = await jsonPost('/grok-workflow/iterate', { action: 'status', sessionId: SID })
if (reopened.body?.loop?.open !== true) fail('second open did not arm the row')
if (rowsFor(SID).length !== 1) fail('second open did not leave exactly one row')
view.tree = await click(view.tree, iterate.component, { sessionId: SID, t })
const reclosed = await jsonPost('/grok-workflow/iterate', { action: 'status', sessionId: SID })
if (reclosed.body?.loop?.open !== false || rowsFor(SID).length !== 0) fail('second close left a row behind')
log('second open/close cycle: one row created, one row deleted, no residue — OK')

log('PASS: the self-iteration switch arms the shipped default template over the real page fetch, route, service and Schedule storage, and leaves nothing behind')
writeFileSync(new URL('./live-iterate.txt', import.meta.url), LOG.join('\n') + '\n')
process.exit(0)
