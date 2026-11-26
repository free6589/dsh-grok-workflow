// One real run in the isolated instance, driven from the page, captured only when the
// stuck line ([data-gw-progress-stuck]) is actually on screen.
//
// usage: node capture-stuck.mjs <url> <outDir> <stateTag> [--mode=failed|blocked|rejected]
//
// The prompt is typed verbatim, the progress tab is opened the way a reader opens it
// (the strip at 1500 px, the strip's 更多会话视图 menu at 390 px), and every number written
// to the readings file is read out of the DOM in the same evaluate as the shot beside it.
import { writeFileSync, mkdirSync } from 'node:fs'
import { chromium } from '/home/fish/.local/share/mise/installs/node/26.8.1/lib/node_modules/@playwright/cli/node_modules/playwright/index.mjs'

const [url, outDir, tag, modeArg] = process.argv.slice(2)
const mode = (modeArg ?? '--mode=failed').replace('--mode=', '')
const OUT = `${outDir}/${tag}`
mkdirSync(OUT, { recursive: true })

const PROMPT = [
  '用 grok_workflow 工具跑一个工作流（只用 grok_workflow，不要用内置的 workflow 工具），拆成两个互相独立、可以并行的任务，每个任务都要真的写一个文件：',
  '任务一：在 notes.md 里写三行安装步骤，写完数一下一共几行；',
  '任务二：在 test.txt 里写一行 hello，写完读回来核对一遍。',
  '两个任务并行跑，不要串行；跑完把两个文件各有几行、分别写了什么汇总一下。',
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
  const stuck = document.querySelector('[data-gw-progress-stuck]')
  let stuckBox = null
  let stuckInViewport = null
  let stuckTopmost = null
  if (stuck !== null) {
    const r = stuck.getBoundingClientRect()
    stuckBox = { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), left: Math.round(r.left) }
    stuckInViewport = r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth && r.width > 0 && r.height > 0
    const cx = Math.round(r.left + r.width / 2)
    const cy = Math.round(r.top + r.height / 2)
    const hit = (cx >= 0 && cy >= 0 && cx < window.innerWidth && cy < window.innerHeight) ? document.elementFromPoint(cx, cy) : null
    stuckTopmost = hit === null ? null : {
      tag: hit.tagName,
      isStuckOrChild: hit === stuck || stuck.contains(hit),
      dataStuck: hit.closest('[data-gw-progress-stuck]') !== null,
      parentData: hit.parentElement === null ? null : Object.keys(hit.parentElement.dataset).filter((k) => k.startsWith('gwProgress')),
    }
  }
  const states = [...document.querySelectorAll('[data-gw-progress-pnode]')].map((n) => ({
    id: n.getAttribute('data-gw-progress-pnode'),
    kind: n.getAttribute('data-kind'),
    state: n.getAttribute('data-state'),
  }))
  return {
    mounted: document.querySelector('[data-gw-progress]') !== null,
    viewport: { innerWidth: window.innerWidth, innerHeight: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    pnodes: q('[data-gw-progress-pnode]'),
    edges: q('[data-gw-progress-edge]'),
    current: q('[data-current="true"]'),
    line: textOf('[data-gw-progress-line]'),
    stuckPresent: stuck !== null,
    stuckText: textOf('[data-gw-progress-stuck]'),
    stuckBox,
    stuckInViewport,
    stuckTopmost,
    chip: textOf('[data-gw-progress-chip]'),
    dock: textOf('[data-gw-progress-dock]'),
    graphMounted: graph !== null,
    mermaidFirstLine: lines.length === 0 ? null : lines[0],
    mermaidNodeLines,
    mermaidEdgeLines,
    mermaidTotalLines: lines.length,
    nodeStates: states,
    emptyText: document.querySelector('[data-progress-empty]') === null ? null : document.querySelector('[data-progress-empty]').innerText.trim(),
  }
}

const readings = {}
const record = async (page, key) => {
  const value = await page.evaluate(READ)
  readings[key] = { ...value, nodeCountsAgree: value.mermaidNodeLines === value.pnodes, edgeCountsAgree: value.mermaidEdgeLines === value.edges }
  log('reading', key, JSON.stringify({ chip: value.chip, stuck: value.stuckPresent, text: value.stuckText, inViewport: value.stuckInViewport, sw: value.scrollWidth, cw: value.clientWidth }))
  return readings[key]
}

// The progress view is a tab at 1500 px and a 更多会话视图 menu item below 500 px.
let tabPath = null
const openProgress = async (page) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const tab = page.getByRole('tab', { name: '进度' })
    if (await tab.count()) {
      await tab.first().click({ timeout: 3000 }).catch(() => {})
      if (tabPath === null) tabPath = 'tab-strip'
      return true
    }
    const overflow = page.getByRole('button', { name: '更多会话视图' })
    if (await overflow.count()) {
      await overflow.first().click({ timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(500)
      const item = page.getByRole('menuitem', { name: /进度/ })
      const loose = (await item.count()) ? item : page.getByText('进度', { exact: true })
      if (await loose.count()) {
        await loose.first().click({ timeout: 3000 }).catch(() => {})
        if (tabPath === null) tabPath = 'overflow-menu'
        return true
      }
      await page.keyboard.press('Escape').catch(() => {})
    }
    await page.waitForTimeout(300)
  }
  return false
}

// Put the stuck line inside the viewport honestly: scroll its own scroll container.
const revealStuck = async (page) => {
  return await page.evaluate(() => {
    const el = document.querySelector('[data-gw-progress-stuck]')
    if (el === null) return null
    el.scrollIntoView({ block: 'center', inline: 'nearest' })
    const r = el.getBoundingClientRect()
    return { afterScroll: { top: Math.round(r.top), bottom: Math.round(r.bottom) }, innerHeight: window.innerHeight }
  })
}

const browser = await chromium.launch({ executablePath: '/home/fish/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome' })
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1600 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`${tag}: ${m.text()}`) })
page.on('pageerror', (e) => pageErrors.push(`${tag}: ${String(e)}`))

await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(7000)

// A fresh session per state: the panel is per-session, and a reused session would carry
// the previous run's transcript into this one's context.
const fresh = page.getByRole('button', { name: '新建会话' })
if (await fresh.count()) {
  await fresh.first().click({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(3500)
  log('new session')
}

const composer = page.locator('[contenteditable="true"][role="textbox"]').first()
await composer.waitFor({ timeout: 60000 })
await composer.click()
await page.keyboard.type(PROMPT, { delay: 2 })
const sentAt = Date.now()
await page.keyboard.press('Enter')
log('sent', sentAt)

const tabOpened = await openProgress(page)
log('progress view opened:', tabOpened, 'via', tabPath)

const saved = {}
const shot = async (page, name, key, { reveal = true } = {}) => {
  if (reveal) await revealStuck(page)
  await page.waitForTimeout(350)
  await page.screenshot({ path: `${OUT}/${name}.png` })
  const value = await record(page, key)
  saved[key] = { file: `${name}.png`, atSeconds: Math.round((Date.now() - sentAt) / 1000), stuckText: value.stuckText, chip: value.chip }
  return value
}

const TERMINAL = new Set(['已完成', '未通过', '出错', '已取消'])
let terminalAt = null
const deadline = Date.now() + 14 * 60 * 1000
let midRunShot = false
while (Date.now() < deadline) {
  let s
  try { s = await page.evaluate(READ) } catch { await page.waitForTimeout(300); continue }
  if (!s.mounted || s.chip === null) { await page.waitForTimeout(300); continue }
  if (s.stuckPresent && !midRunShot && !TERMINAL.has(s.chip)) {
    midRunShot = true
    await shot(page, `${tag}-desktop-1500-midrun`, `${tag}-desktop-1500-midrun`)
    log('mid-run shot with the stuck line, chip =', s.chip)
  }
  if (TERMINAL.has(s.chip)) { terminalAt = Date.now(); break }
  await page.waitForTimeout(400)
}
log('terminal chip seen:', terminalAt !== null, 'after', terminalAt === null ? 'n/a' : Math.round((terminalAt - sentAt) / 1000), 's')

// Let the terminal render settle, then read it.
await page.waitForTimeout(2500)
const finalDesktop = await shot(page, `${tag}-desktop-1500`, `${tag}-desktop-1500`)

// The narrow shot: the same page, narrowed. The strip loses 进度, so it is reached again
// through 更多会话视图 — the path a reader at this width really takes.
await page.setViewportSize({ width: 390, height: 844 })
await page.waitForTimeout(1200)
tabPath = null
const reopened = await openProgress(page)
log('narrow: progress view reopened:', reopened, 'via', tabPath)
await page.waitForTimeout(600)
const finalNarrow = await shot(page, `${tag}-narrow-390`, `${tag}-narrow-390`)

// A full-page copy of the narrow shot for reading the wording without cropping.
await page.screenshot({ path: `${OUT}/${tag}-narrow-390-full.png`, fullPage: true })

writeFileSync(`${OUT}/readings.json`, JSON.stringify({
  tag,
  mode,
  prompt: PROMPT,
  url: url.replace(/token=[^&]+/, 'token=<redacted>'),
  tabPathNarrow: tabPath,
  sentAt: new Date(sentAt).toISOString(),
  terminalAfterSeconds: terminalAt === null ? null : Math.round((terminalAt - sentAt) / 1000),
  midRunShot,
  saved,
  readings,
  consoleErrors,
  pageErrors,
}, null, 1))
log('DONE', JSON.stringify(saved))
await browser.close()
