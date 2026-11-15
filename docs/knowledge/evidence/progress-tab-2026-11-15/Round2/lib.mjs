/**
 * Shared helpers for the progress-tab Round 2 real-machine evidence run (verify group B, 2026-11-15).
 *
 * The DSH access token is read from the environment variable DSH_URL on purpose: it is a
 * live credential of the throwaway instance and never belongs in the repository.
 *
 * Round 2 reads the tab through the DOM contract this revision actually ships
 * (`data-gw-progress*` / `data-progress-*` attributes) and keeps the class-name read as a
 * second, independent path, so a renamed class cannot silently pass an assertion.
 */
import fs from 'node:fs'
import path from 'node:path'

export const PW = '/home/fish/.local/share/mise/installs/node/26.8.1/lib/node_modules/@playwright/cli/node_modules/playwright/index.mjs'

export const APP = process.env.DSH_URL
if (!APP) throw new Error('DSH_URL is required (http://127.0.0.1:<port>/?token=…)')

export const OUT = new URL('.', import.meta.url).pathname
const STATE = path.join(OUT, 'run-state.json')

export function loadState () {
  return fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {}
}
export function saveState (state) {
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2))
}

export async function open ({ w = 1440, h = 900, colorScheme = 'light', url = null } = {}) {
  const { chromium } = await import(PW)
  const b = await chromium.launch({
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  })
  const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme })
  const p = await ctx.newPage()
  await p.goto(url || APP, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(6000)
  return { b, ctx, p }
}

export async function dismissNotice (p) {
  for (const name of ['Continue', '继续', 'OK', 'Got it']) {
    const c = p.getByRole('button', { name })
    if (await c.count()) {
      await c.first().click().catch(() => {})
      await p.waitForTimeout(1200)
      return name
    }
  }
  return null
}

export async function send (p, text) {
  const box = p.locator('[contenteditable="true"]').last()
  await box.click()
  await p.keyboard.insertText(text)
  await p.waitForTimeout(400)
  await p.keyboard.press('Enter')
}

export const body = (p) => p.locator('body').innerText()

export async function waitText (p, needle, ms = 120000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if ((await body(p)).includes(needle)) return true
    await p.waitForTimeout(1500)
  }
  return false
}

export const shot = (p, name) => p.screenshot({ path: `${OUT}${name}`, fullPage: false })

/** View tab strip as the browser really renders it. */
export const tabsInfo = (p) => p.evaluate(() => Array.from(document.querySelectorAll('button[role="tab"]')).map((el) => ({
  label: (el.innerText || '').trim(),
  selected: el.getAttribute('aria-selected'),
  cls: String(el.className).slice(0, 40)
})))

export async function clickTab (p, name) {
  await p.getByRole('tab', { name, exact: true }).click()
  await p.waitForTimeout(1000)
}

/**
 * The plugin's own subtree, read twice: once through the shipped `data-*` contract and
 * once through the class names. `agree` is the cross-check.
 */
export const progressDom = (p) => p.evaluate(() => {
  const root = document.querySelector('[data-gw-progress]')
  const nodes = root ? Array.from(root.querySelectorAll('[data-gw-progress-node]')) : []
  const detail = document.querySelector('[data-progress-detail]')
  const empty = root ? root.querySelector('[data-progress-empty]') : null
  const percentEl = root ? root.querySelector('[data-progress-percent]') : null
  const byClass = root ? Array.from(root.querySelectorAll('.gw-progress-node')) : []
  return {
    present: !!root,
    emptyPresent: !!empty,
    emptyText: empty ? (empty.innerText || '').trim() : null,
    title: root ? ((root.querySelector('.gw-progress-title') || {}).innerText || '').trim() : null,
    percent: percentEl ? (percentEl.innerText || '').trim() : null,
    percentAttr: percentEl ? percentEl.getAttribute('data-progress-percent') : null,
    trackPresent: !!(root && root.querySelector('[data-gw-progress-track]')),
    nodeCount: nodes.length,
    classNodeCount: byClass.length,
    agree: nodes.length === byClass.length,
    nodes: nodes.map((n) => ({
      key: n.getAttribute('data-node-key'),
      kind: n.getAttribute('data-kind'),
      label: ((n.querySelector('.gw-progress-label') || {}).innerText || '').trim(),
      state: n.getAttribute('data-state'),
      derived: n.getAttribute('data-derived'),
      selected: n.getAttribute('data-selected'),
      title: n.getAttribute('title'),
      ariaLabel: n.getAttribute('aria-label')
    })),
    states: Array.from(new Set(nodes.map((n) => n.getAttribute('data-state')))),
    classes: Array.from(new Set(byClass.map((n) => n.getAttribute('data-state')))),
    detailOpen: !!detail,
    detailState: detail ? (detail.querySelector('[data-detail-state]') || {}).innerText : null,
    detailTitle: detail ? ((detail.querySelector('[data-detail-title]') || {}).innerText || '').trim() : null,
    detailRunId: detail ? ((detail.querySelector('[data-detail-run-id]') || {}).innerText || '').trim() : null,
    detailText: detail ? (detail.innerText || '').trim().slice(0, 1400) : null,
    detailHeadings: detail ? Array.from(detail.querySelectorAll('h4')).map((h) => (h.innerText || '').trim()) : [],
    detailFields: detail ? Array.from(detail.querySelectorAll('[data-gw-progress-field]')).map((f) => ({
      key: f.getAttribute('data-gw-progress-field'),
      source: f.getAttribute('data-source'),
      text: (f.innerText || '').trim().replace(/\s+/g, ' ')
    })) : [],
    detailSources: detail ? Array.from(detail.querySelectorAll('.gw-progress-source')).map((s) => (s.innerText || '').trim()) : [],
    detailRows: detail ? Array.from(detail.querySelectorAll('[data-gw-progress-row]')).map((r) => r.getAttribute('data-gw-progress-row')) : [],
    openButtons: detail ? Array.from(detail.querySelectorAll('[data-gw-progress-open]')).length : 0,
    actionButtons: detail ? Array.from(detail.querySelectorAll('.gw-progress-actions button')).map((x) => ({
      text: (x.innerText || '').trim(),
      disabled: x.disabled,
      title: x.getAttribute('title')
    })) : []
  }
})

/** Click the first stage node whose detail carries engine rows; returns what it opened. */
export async function openNodeDetail (p, { preferState = null, requireRows = false } = {}) {
  const nodes = p.locator('[data-gw-progress-node]')
  const n = await nodes.count()
  let fallback = null
  for (let i = 0; i < n; i++) {
    const st = await nodes.nth(i).getAttribute('data-state')
    if (preferState && st !== preferState) continue
    await nodes.nth(i).click()
    await p.waitForTimeout(1000)
    const dom = await progressDom(p)
    if (dom.detailOpen && dom.detailFields.length > 0) {
      const rows = dom.detailRows.length
      if (!requireRows || rows > 0) return { index: i, state: st, dom, rows }
      fallback = fallback || { index: i, state: st, dom, rows }
    }
    await nodes.nth(i).click()
    await p.waitForTimeout(300)
  }
  return fallback || { index: -1, state: null, dom: await progressDom(p), rows: 0 }
}

/**
 * Enter the session stage A created.
 *
 * The app must be loaded through the token URL first: the tokenless URL the SPA settles on
 * only says the view loaded, it does not resume anything. The session's own title is
 * generated by DSH and changes under us (`Running` while the turn is live, the topic
 * afterwards), so the row is found by role + the row class and the recorded title is only a
 * preference, never a requirement.
 *
 * @returns a diagnostic string naming the strategy that worked.
 */
export async function enterSession (p, state) {
  const loggedIn = p.url().includes('token=')
  if (!loggedIn) {
    await p.goto(APP, { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(6000)
  }
  for (let attempt = 0; attempt < 12; attempt++) {
    const rows = p.locator('[role="treeitem"]')
    const n = await rows.count()
    const candidates = []
    for (let i = 0; i < n; i++) {
      const el = rows.nth(i)
      const text = ((await el.innerText()) || '').trim()
      const cls = (await el.getAttribute('class')) || ''
      if (!/sessionRow/.test(cls)) continue
      if (/^(New Session|新会话)\b/.test(text)) continue
      candidates.push({ i, text })
    }
    if (candidates.length > 0) {
      const head = (state.title || '').slice(0, 6)
      const pick = (head && candidates.find((c) => c.text.includes(head))) || candidates[0]
      await rows.nth(pick.i).click()
      await p.waitForTimeout(6000)
      return `${loggedIn ? 'already-logged-in' : 'token-url'}+sessionRow(${pick.i})`
    }
    await p.waitForTimeout(2000)
  }
  return 'no-session-row'
}
