// A live three-task run driven from a phone-sized context (390x844, dSF 2, isMobile,
// hasTouch), then the same page narrowed and widened to the other widths the block asks
// for. One page, one run: the widths are the same DOM resized, so any difference between
// them belongs to the layout, not to a second run.
//
// At 390 the host's conversation tab strip offers 对话/轨迹 only; the plugin's 进度 view sits
// behind the strip's 更多会话视图 menu. That is the path this script takes, and the reason the
// phone shots exist at all.
import { writeFileSync, mkdirSync } from 'node:fs'
import { chromium } from '/home/fish/.local/share/mise/installs/node/26.8.1/lib/node_modules/@playwright/cli/node_modules/playwright/index.mjs'

const [url, outDir] = process.argv.slice(2)
const SOAK = `${outDir}/soak`
mkdirSync(SOAK, { recursive: true })

const PROMPT = [
  '用 grok_workflow 工具跑一个工作流，拆成三个互相独立、可以并行的任务，每个任务都要真的写一个文件：',
  '任务一：写 notes.md，内容是三行安装步骤；',
  '任务二：写 test.txt，内容是一行 hello；',
  '任务三：写 third.txt，内容是一行 bye。',
  '三个任务并行跑，不要串行；跑完把每个任务写了什么汇总一下。',
].join('')

const consoleErrors = []
const pageErrors = []
const log = (...parts) => console.log(new Date().toISOString().slice(11, 23), ...parts)

const READ = () => {
  const q = (sel) => document.querySelectorAll(sel).length
  const textOf = (sel) => {
    const node = document.querySelector(sel)
    return node === null ? null : node.innerText.trim()
  }
  const graph = document.querySelector('[data-gw-progress-graph]')
  const source = graph === null ? null : graph.getAttribute('data-gw-progress-source')
  const lines = source === null ? [] : source.split(/\r?\n/)
  let mermaidNodeLines = 0
  let mermaidEdgeLines = 0
  for (const raw of lines) {
    const line = raw.trim()
    if (line === '' || line.startsWith('%%')) continue
    if (/^(?:flowchart|graph)\s+[A-Za-z]+$/i.test(line)) continue
    if (/^[A-Za-z0-9_]+\s*-->\s*[A-Za-z0-9_]+$/.test(line)) { mermaidEdgeLines += 1; continue }
    if (/^[A-Za-z0-9_]+\s*(\(\[|\[|\()\s*"([\s\S]*)"\s*(\]\)|\]|\))$/.test(line)) { mermaidNodeLines += 1; continue }
  }
  return {
    mounted: document.querySelector('[data-gw-progress]') !== null,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    innerWidth: window.innerWidth,
    devicePixelRatio: window.devicePixelRatio,
    pnodes: q('[data-gw-progress-pnode]'),
    edges: q('[data-gw-progress-edge]'),
    current: q('[data-current="true"]'),
    nodeCalls: q('[data-gw-progress-node-calls]'),
    traceActive: q('[data-trace="active"]'),
    traceDim: q('[data-trace="dim"]'),
    line: textOf('[data-gw-progress-line]'),
    stuckPresent: document.querySelector('[data-gw-progress-stuck]') !== null,
    stuckText: textOf('[data-gw-progress-stuck]'),
    chip: textOf('[data-gw-progress-chip]'),
    dock: textOf('[data-gw-progress-dock]'),
    runName: textOf('[data-gw-progress-run]'),
    graphMounted: graph !== null,
    mermaidFirstLine: lines.length === 0 ? null : lines[0],
    mermaidEndLines: lines.filter((line) => /^end\b/.test(line.trim())).length,
    mermaidNodeLines,
    mermaidEdgeLines,
    mermaidTotalLines: lines.length,
    emptyText: document.querySelector('[data-progress-empty]') === null ? null : document.querySelector('[data-progress-empty]').innerText.trim(),
  }
}

const readings = {}
const record = async (page, key) => {
  const value = await page.evaluate(READ)
  readings[key] = {
    ...value,
    nodeCountsAgree: value.mermaidNodeLines === value.pnodes,
    edgeCountsAgree: value.mermaidEdgeLines === value.edges,
  }
  log('reading', key, JSON.stringify({ chip: value.chip, pnodes: value.pnodes, edges: value.edges, sw: value.scrollWidth, cw: value.clientWidth, dpr: value.devicePixelRatio, calls: value.nodeCalls, trace: value.traceActive }))
  return readings[key]
}

const browser = await chromium.launch({ executablePath: '/home/fish/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome' })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', (e) => pageErrors.push(String(e)))

await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(8000)

// The phone opens the 进度 view from the tab strip's overflow menu; the tab itself is not
// in the strip at this width.
let tabPath = null
const openProgress = async () => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const tab = page.getByRole('tab', { name: '进度' })
    if (await tab.count()) {
      await tab.first().click({ timeout: 3000 }).catch(() => {})
      if (tabPath === null) tabPath = 'tab'
      return true
    }
    const overflow = page.getByRole('button', { name: '更多会话视图' })
    if (await overflow.count()) {
      await overflow.first().click({ timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(600)
      const item = page.getByRole('menuitem', { name: /进度/ })
      const loose = await item.count() ? item : page.getByText('进度', { exact: true })
      if (await loose.count()) {
        await loose.first().click({ timeout: 3000 }).catch(() => {})
        if (tabPath === null) tabPath = 'overflow-menu'
        return true
      }
      await page.keyboard.press('Escape').catch(() => {})
    }
    await page.waitForTimeout(400)
  }
  return false
}

const composer = page.locator('[contenteditable="true"][role="textbox"]').first()
await composer.waitFor({ timeout: 60000 })
await composer.click()
await page.waitForTimeout(400)
await page.keyboard.type(PROMPT, { delay: 2 })
const sentAt = Date.now()
await page.keyboard.press('Enter')
log('sent from the phone context')

const opened = await openProgress()
log('progress view opened:', opened, 'via', tabPath)

const saved = {}
const shot = async (name, key) => {
  await page.screenshot({ path: `${SOAK}/${name}.png` })
  const at = (Date.now() - sentAt) / 1000
  const value = await record(page, key)
  saved[key] = { file: `${name}.png`, at, chip: value.chip, width: value.innerWidth }
  log('shot', name, 'at', at.toFixed(2), 's', 'width', value.innerWidth)
}

const deadline = Date.now() + 12 * 60 * 1000
while (Date.now() < deadline) {
  let s
  try { s = await page.evaluate(READ) } catch { await page.waitForTimeout(250); continue }
  if (!s.mounted) {
    // The view may have closed when the run re-rendered the strip; reopen once in a while.
    if (Date.now() % 15000 < 300) await openProgress()
    await page.waitForTimeout(250)
    continue
  }
  if (s.chip === '进行中' && saved['phone-390-running'] === undefined && s.pnodes > 0) {
    await shot('phone-390-running', 'phone-390-running')
  }
  if (s.chip !== null && s.chip !== '进行中' && s.chip !== '等你点头' && saved['phone-390-done'] === undefined) {
    await page.waitForTimeout(2500)
    await shot('phone-390-done', 'phone-390-done')
    break
  }
  await page.waitForTimeout(200)
}

if (readings['phone-390-done'] !== undefined) {
  const taskNode = page.locator('[data-gw-progress-pnode][data-kind="task"]').first()
  const nodeId = await taskNode.getAttribute('data-gw-progress-pnode')
  await record(page, 'phone-390-before-tap')
  const button = taskNode.locator('button').first()
  await button.tap({ timeout: 5000 }).catch(async () => { await button.click({ timeout: 5000 }) })
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${SOAK}/phone-390-trace.png` })
  await record(page, 'phone-390-trace')

  for (const [width, height, name, key] of [
    [360, 800, 'phone-360-done', 'phone-360-done'],
    [700, 900, 'tablet-700-done', 'tablet-700-done'],
  ]) {
    await page.setViewportSize({ width, height })
    await page.waitForTimeout(1500)
    const stillMounted = await page.evaluate(() => document.querySelector('[data-gw-progress]') !== null)
    if (!stillMounted) await openProgress()
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${SOAK}/${name}.png` })
    const value = await record(page, key)
    saved[key] = { file: `${name}.png`, at: (Date.now() - sentAt) / 1000, chip: value.chip, width: value.innerWidth }
    log('shot', name, 'at width', value.innerWidth)
  }
  writeFileSync(`${SOAK}/phone-interaction.json`, JSON.stringify({ nodeId, nodeIdType: typeof nodeId, tabPath }, null, 1))
}

writeFileSync(`${outDir}/readings-phone.json`, JSON.stringify(readings, null, 1))
writeFileSync(`${outDir}/console-phone.json`, JSON.stringify({ consoleErrors, pageErrors }, null, 1))
log('READINGS', JSON.stringify(readings, null, 1))
log('CONSOLE', JSON.stringify({ consoleErrors, pageErrors }))
await browser.close()
