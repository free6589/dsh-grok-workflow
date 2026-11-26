import { writeFileSync } from 'node:fs'
import { chromium } from '/home/fish/.local/share/mise/installs/node/26.8.1/lib/node_modules/@playwright/cli/node_modules/playwright/index.mjs'
const [url, out] = process.argv.slice(2)
const b = await chromium.launch({ executablePath: '/home/fish/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome' })
const ctx = await b.newContext({ viewport: { width: 1500, height: 1600 } })
const p = await ctx.newPage()
await p.goto(url, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(8000)
const rows = p.locator('[class*="sessionRow"]')
if (!(await rows.first().isVisible().catch(() => false))) { await p.mouse.click(25, 25); await p.waitForTimeout(1800) }
const texts = await rows.allInnerTexts()
for (let i = 1; i < texts.length; i += 1) {
  if (texts[i].trim().startsWith('新会话')) continue
  await rows.nth(i).click({ timeout: 6000 }).catch(() => {})
  await p.waitForTimeout(3500)
  const tab = p.getByRole('tab', { name: '进度' })
  if (await tab.count()) await tab.first().click().catch(() => {})
  await p.waitForTimeout(1500)
  const v = await p.evaluate(() => {
    const g = document.querySelector('[data-gw-progress-graph]')
    return {
      chip: document.querySelector('[data-gw-progress-chip]')?.textContent?.trim() ?? null,
      line: document.querySelector('[data-gw-progress-line]')?.textContent?.trim() ?? null,
      run: document.querySelector('[data-gw-progress-run]')?.textContent?.trim() ?? null,
      stuck: document.querySelector('[data-gw-progress-stuck]')?.textContent?.trim() ?? null,
      dock: document.querySelector('[data-gw-progress-dock]')?.innerText?.trim() ?? null,
      pnodes: document.querySelectorAll('[data-gw-progress-pnode]').length,
      edges: document.querySelectorAll('[data-gw-progress-edge]').length,
      source: g === null ? null : g.getAttribute('data-gw-progress-source'),
      aria: g === null ? null : g.getAttribute('aria-label'),
    }
  })
  if (v.chip === '已完成' && v.source) {
    writeFileSync(`${out}/mermaid-done.txt`, v.source + '\n')
    writeFileSync(`${out}/done-dom.json`, JSON.stringify({ ...v, source: '<see mermaid-done.txt>' }, null, 1))
    console.log(JSON.stringify({ chip: v.chip, line: v.line, run: v.run, stuck: v.stuck, dock: v.dock, pnodes: v.pnodes, edges: v.edges, aria: v.aria, sourceLines: v.source.split('\n').length }))
    break
  }
}
await b.close()
