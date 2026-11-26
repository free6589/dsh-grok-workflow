// The done state at two more widths, with no interaction on the page: open the newest
// session, open the 进度 view, then only resize.
import { writeFileSync } from 'node:fs'
import { chromium } from '/home/fish/.local/share/mise/installs/node/26.8.1/lib/node_modules/@playwright/cli/node_modules/playwright/index.mjs'
const [url, outDir] = process.argv.slice(2)
const SOAK = `${outDir}/soak`
const READ = () => {
  const q = (s) => document.querySelectorAll(s).length
  const textOf = (s) => { const n = document.querySelector(s); return n === null ? null : n.innerText.trim() }
  const graph = document.querySelector('[data-gw-progress-graph]')
  const source = graph === null ? null : graph.getAttribute('data-gw-progress-source')
  const lines = source === null ? [] : source.split(/\r?\n/)
  let n = 0, e = 0
  for (const raw of lines) { const l = raw.trim(); if (l === '' || l.startsWith('%%')) continue
    if (/^(?:flowchart|graph)\s+[A-Za-z]+$/i.test(l)) continue
    if (/^[A-Za-z0-9_]+\s*-->\s*[A-Za-z0-9_]+$/.test(l)) { e += 1; continue }
    if (/^[A-Za-z0-9_]+\s*(\(\[|\[|\()\s*"([\s\S]*)"\s*(\]\)|\]|\))$/.test(l)) { n += 1; continue } }
  return { mounted: document.querySelector('[data-gw-progress]') !== null, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, innerWidth: window.innerWidth, devicePixelRatio: window.devicePixelRatio, pnodes: q('[data-gw-progress-pnode]'), edges: q('[data-gw-progress-edge]'), current: q('[data-current="true"]'), nodeCalls: q('[data-gw-progress-node-calls]'), traceActive: q('[data-trace="active"]'), traceDim: q('[data-trace="dim"]'), line: textOf('[data-gw-progress-line]'), stuckPresent: document.querySelector('[data-gw-progress-stuck]') !== null, stuckText: textOf('[data-gw-progress-stuck]'), chip: textOf('[data-gw-progress-chip]'), dock: textOf('[data-gw-progress-dock]'), mermaidFirstLine: lines.length === 0 ? null : lines[0], mermaidEndLines: lines.filter((l) => /^end\b/.test(l.trim())).length, mermaidNodeLines: n, mermaidEdgeLines: e, mermaidTotalLines: lines.length }
}
const b = await chromium.launch({ executablePath: '/home/fish/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome' })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const p = await ctx.newPage()
const consoleErrors = [], pageErrors = []
p.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
p.on('pageerror', (e) => pageErrors.push(String(e)))
await p.goto(url, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(8000)
const rows = p.locator('[class*="sessionRow"]')
if (!(await rows.first().isVisible().catch(() => false))) { await p.mouse.click(25, 25); await p.waitForTimeout(1800) }
const texts = await rows.allInnerTexts()
console.log('rows', JSON.stringify(texts.map((t) => t.slice(0, 30))))
const openProgress = async () => {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const tab = p.getByRole('tab', { name: '进度' })
    if (await tab.count()) { await tab.first().click({ timeout: 3000 }).catch(() => {}); return true }
    const ov = p.getByRole('button', { name: '更多会话视图' })
    if (await ov.count()) {
      await ov.first().click({ timeout: 3000 }).catch(() => {})
      await p.waitForTimeout(600)
      const it = p.getByRole('menuitem', { name: /进度/ })
      const loose = (await it.count()) ? it : p.getByText('进度', { exact: true })
      if (await loose.count()) { await loose.first().click({ timeout: 3000 }).catch(() => {}); return true }
      await p.keyboard.press('Escape').catch(() => {})
    }
    await p.waitForTimeout(400)
  }
  return false
}
let opened = false
for (let i = 1; i < texts.length; i += 1) {
  if (texts[i].trim().startsWith('新会话')) continue
  await rows.nth(i).click({ timeout: 6000 }).catch(() => {})
  await p.waitForTimeout(3500)
  await openProgress()
  await p.waitForTimeout(1200)
  const chip = await p.evaluate(() => document.querySelector('[data-gw-progress-chip]')?.textContent?.trim() ?? null)
  console.log('row', i, 'chip', chip)
  if (chip === '已完成') { opened = true; break }
}
if (!opened) { console.log('no done session found'); await b.close(); process.exit(1) }
const out = {}
for (const [width, height, name] of [[360, 800, 'phone-360-done'], [700, 900, 'tablet-700-done']]) {
  await p.setViewportSize({ width, height })
  await p.waitForTimeout(1500)
  if (!(await p.evaluate(() => document.querySelector('[data-gw-progress]') !== null))) {
    const tab = p.getByRole('tab', { name: '进度' })
    if (await tab.count()) await tab.first().click().catch(() => {})
    else { const ov = p.getByRole('button', { name: '更多会话视图' }); if (await ov.count()) { await ov.first().click().catch(() => {}); await p.waitForTimeout(600); const it = p.getByText('进度', { exact: true }); if (await it.count()) await it.first().click().catch(() => {}) } }
    await p.waitForTimeout(1200)
  }
  await p.screenshot({ path: `${SOAK}/${name}.png` })
  out[name] = await p.evaluate(READ)
  console.log(name, JSON.stringify({ w: out[name].innerWidth, sw: out[name].scrollWidth, cw: out[name].clientWidth, pn: out[name].pnodes, ed: out[name].edges, calls: out[name].nodeCalls, chip: out[name].chip }))
}
writeFileSync(`${outDir}/readings-widths.json`, JSON.stringify({ readings: out, consoleErrors, pageErrors }, null, 1))
await b.close()
