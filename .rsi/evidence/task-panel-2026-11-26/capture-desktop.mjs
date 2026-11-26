// One real three-task workflow in the isolated instance (web-clone profile, port 3411),
// captured at every progress state this page offers, at the widths the block asks for.
// Nothing here is mocked: the page is the shipped build installed into the clone, the run
// is a live model calling grok_workflow, and every number written to readings.json was read
// out of the DOM at the moment of the screenshot next to it.
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

// The readings the block asks for, read in one evaluate so they belong to one instant.
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
  log('reading', key, JSON.stringify({ chip: value.chip, pnodes: value.pnodes, edges: value.edges, sw: value.scrollWidth, cw: value.clientWidth, calls: value.nodeCalls, trace: value.traceActive }))
  return readings[key]
}

const attach = (page, tag) => {
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`${tag}: ${m.text()}`) })
  page.on('pageerror', (e) => pageErrors.push(`${tag}: ${String(e)}`))
}

const openProgressTab = async (page) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const tab = page.getByRole('tab', { name: '进度' })
    if (await tab.count()) {
      await tab.first().click({ timeout: 3000 }).catch(() => {})
      return true
    }
    const loose = page.getByText('进度', { exact: true })
    if (await loose.count()) {
      await loose.first().click({ timeout: 3000 }).catch(() => {})
      return true
    }
    await page.waitForTimeout(250)
  }
  return false
}

// Playwright's own isMobile/hasTouch/deviceScaleFactor are these CDP calls; the page under
// the override is the same live page, so a phone shot cannot show a different run.
const setDevice = async (page, cdp, { width, height, dsf, mobile }) => {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: dsf, mobile,
    screenWidth: width, screenHeight: height,
  })
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 })
}

const browser = await chromium.launch({ executablePath: '/home/fish/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome' })
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1600 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
attach(page, 'desktop')
const cdp = await ctx.newCDPSession(page)

await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(7000)

// Fresh session in the scratch workspace: the landing page is one, so this only has to
// make sure the composer is on screen.
const composer = page.locator('[contenteditable="true"][role="textbox"]').first()
await composer.waitFor({ timeout: 60000 })
await composer.click()
await page.keyboard.type(PROMPT, { delay: 2 })
const sentAt = Date.now()
await page.keyboard.press('Enter')
log('sent')

const tabOpened = await openProgressTab(page)
log('progress tab opened:', tabOpened)
const tabOpenedAt = Date.now()

const saved = {}
const deadline = Date.now() + 11 * 60 * 1000

const captureDesktop = async (name, key) => {
  await page.screenshot({ path: `${SOAK}/${name}.png` })
  const at = (Date.now() - sentAt) / 1000
  const value = await record(page, key)
  saved[key] = { file: `${name}.png`, at, chip: value.chip }
  log('shot', name, 'at', at.toFixed(2), 's')
  return at
}

let doneSeenAt = null
while (Date.now() < deadline) {
  let s
  try { s = await page.evaluate(READ) } catch { await page.waitForTimeout(200); continue }
  if (!s.mounted || s.chip === null) { await page.waitForTimeout(200); continue }

  if (s.chip === '进行中' && saved.running === undefined) {
    if (s.pnodes > 0) {
      await captureDesktop('desktop-1500-running', 'desktop-1500-running')
      // Phone running, taken while the run is still live, from the same page.
      await setDevice(page, cdp, { width: 390, height: 844, dsf: 2, mobile: true })
      await page.waitForTimeout(900)
      await captureDesktop('phone-390-running', 'phone-390-running')
      const phoneTrace = await page.evaluate(() => {
        const node = [...document.querySelectorAll('[data-gw-progress-pnode]')].find((n) => /_t\d+$/.test(n.getAttribute('data-gw-progress-pnode') || ''))
        return node === undefined || node === null
      })
      await setDevice(page, cdp, { width: 1500, height: 1600, dsf: 1, mobile: false })
      await page.waitForTimeout(700)
      log('phone running captured; phone had a task node:', !phoneTrace)
    }
  }
  if ((s.chip === '已完成' || s.chip === '未通过' || s.chip === '出错' || s.chip === '已取消') && saved.done === undefined) {
    doneSeenAt = Date.now()
    await page.waitForTimeout(2000)
    await captureDesktop('desktop-1500-done', 'desktop-1500-done')
    break
  }
  await page.waitForTimeout(200)
}

// Interactions on the done page: one click opens the calls and lights the wires; the same
// click again is measured as it really behaves, not as expected.
if (readings['desktop-1500-done'] !== undefined) {
  const taskNode = page.locator('[data-gw-progress-pnode][data-kind="task"]').first()
  const nodeId = await taskNode.getAttribute('data-gw-progress-pnode')
  log('first task node', nodeId)
  await record(page, 'desktop-1500-done-before-click')
  await taskNode.locator('button').first().click({ timeout: 5000 })
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${SOAK}/desktop-1500-node-open.png` })
  await record(page, 'desktop-1500-node-open')
  await taskNode.locator('button').first().click({ timeout: 5000 })
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${SOAK}/desktop-1500-trace.png` })
  await record(page, 'desktop-1500-trace')
  // A third reading for the record: one more click restores the open+lit state the first
  // click produced, which is the only state in which the list and the wires are both up.
  await taskNode.locator('button').first().click({ timeout: 5000 })
  await page.waitForTimeout(500)
  await record(page, 'desktop-1500-node-open-again')
  await page.screenshot({ path: `${SOAK}/desktop-1500-trace-open.png` })
  writeFileSync(`${SOAK}/interaction.json`, JSON.stringify({ nodeId, nodeIdType: typeof nodeId }, null, 1))
}

// What a fresh context can see: the sidebar entries that would let a phone reach this
// session without a per-session URL. Recorded, not guessed.
const sidebar = await page.evaluate(() => [...document.querySelectorAll('aside button, aside a, nav button, nav a')].map((n) => n.innerText.trim()).filter((x) => x !== '').slice(0, 40))
const hrefs = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((n) => n.getAttribute('href')).filter((h) => h !== null && h !== '/' && !h.startsWith('http')).slice(0, 20))

writeFileSync(`${outDir}/timeline.json`, JSON.stringify({
  url: url.replace(/token=[^&]+/, 'token=<redacted>'),
  sentAt, sentAtLocal: new Date(sentAt).toISOString(), tabOpened, tabOpenedAt,
  doneSeenAt, doneAt: doneSeenAt === null ? null : (doneSeenAt - sentAt) / 1000,
  saved, sidebar, hrefs,
}, null, 1))
writeFileSync(`${outDir}/readings.json`, JSON.stringify(readings, null, 1))
writeFileSync(`${outDir}/console.json`, JSON.stringify({ consoleErrors, pageErrors }, null, 1))
log('READINGS', JSON.stringify(readings, null, 1))
log('CONSOLE', JSON.stringify({ consoleErrors, pageErrors }))
await browser.close()
