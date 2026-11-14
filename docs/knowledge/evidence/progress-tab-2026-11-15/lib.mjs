/**
 * Shared helpers for the progress-tab real-machine evidence run (verify-H2, 2026-11-15).
 *
 * The DSH access token is read from the environment variable DSH_URL on purpose: it is a
 * live credential of the throwaway instance and never belongs in the repository.
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

export async function open ({ w = 1440, h = 900, colorScheme = 'light' } = {}) {
  const { chromium } = await import(PW)
  const b = await chromium.launch({
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  })
  const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme })
  const p = await ctx.newPage()
  await p.goto(APP, { waitUntil: 'domcontentloaded' })
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

/** The plugin's own subtree, read from the live DOM (not from source). */
export const progressDom = (p) => p.evaluate(() => {
  const root = document.querySelector('.gw-progress')
  const nodes = root ? Array.from(root.querySelectorAll('.gw-progress-node')) : []
  const detail = document.querySelector('.gw-progress-detail')
  return {
    present: !!root,
    emptyText: root ? ((root.querySelector('.gw-progress-empty') || {}).innerText || '').trim() : null,
    title: root ? ((root.querySelector('.gw-progress-title') || {}).innerText || '').trim() : null,
    percent: root ? ((root.querySelector('.gw-progress-percent') || {}).innerText || '').trim() : null,
    nodeCount: nodes.length,
    nodes: nodes.map((n) => ({
      label: ((n.querySelector('.gw-progress-label') || {}).innerText || '').trim(),
      state: n.getAttribute('data-state'),
      derived: n.getAttribute('data-derived'),
      title: n.getAttribute('title'),
      selected: n.getAttribute('data-selected')
    })),
    states: Array.from(new Set(nodes.map((n) => n.getAttribute('data-state')))),
    detailOpen: !!detail,
    detailText: detail ? (detail.innerText || '').trim().slice(0, 1200) : null,
    detailHeadings: detail ? Array.from(detail.querySelectorAll('h4')).map((h) => (h.innerText || '').trim()) : [],
    detailFields: detail ? Array.from(detail.querySelectorAll('.gw-progress-field')).map((f) => (f.innerText || '').trim().replace(/\s+/g, ' ')) : [],
    detailSources: detail ? Array.from(detail.querySelectorAll('.gw-progress-source')).map((s) => (s.innerText || '').trim()) : [],
    detailRunIds: detail ? Array.from(detail.querySelectorAll('.gw-progress-facts dd')).slice(0, 8).map((d) => (d.innerText || '').trim()) : []
  }
})

/** Click the first stage node whose detail carries engine rows; returns what it opened. */
export async function openNodeDetail (p, { preferState = null, requireRows = false } = {}) {
  const nodes = p.locator('.gw-progress-node')
  const n = await nodes.count()
  let fallback = null
  for (let i = 0; i < n; i++) {
    const st = await nodes.nth(i).getAttribute('data-state')
    if (preferState && st !== preferState) continue
    await nodes.nth(i).click()
    await p.waitForTimeout(1000)
    const dom = await progressDom(p)
    if (dom.detailOpen && dom.detailFields.length > 0) {
      const rows = Number((/^(\d+) rows/m.exec(dom.detailText || '') || [])[1] || 0)
      if (!requireRows || rows > 0) return { index: i, state: st, dom, rows }
      fallback = fallback || { index: i, state: st, dom, rows }
    }
    await nodes.nth(i).click()
    await p.waitForTimeout(300)
  }
  return fallback || { index: -1, state: null, dom: await progressDom(p), rows: 0 }
}

export async function openSessionByTitle (p, title) {
  const needle = title.slice(0, 10)
  const row = p.getByText(needle, { exact: false }).first()
  if (await row.count() === 0) return false
  await row.click()
  await p.waitForTimeout(4000)
  return true
}
