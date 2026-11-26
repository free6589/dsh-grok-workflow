// Verification rig (not product code): drive one scratch instance as a reader and
// record one progress-page state together with what its two dock buttons really do.
//
//   node capture-states.mjs --boot <boot.log> --out <dir> --scenario <amber|failed|cancelled>
//                           [--prompt <text>] [--timeout-min <n>] [--keep-running-shot]
//
// What it writes into <dir>:
//   <state>.png / <state>.txt   native screenshot + the page's own innerText, verbatim
//   <state>-dom.json            the progress page's own hooks: chip, flow nodes, dock, counts
//   <state>-summary-calls.txt   the summary node opened: its call rows and the verdict rows
//   dock-start.txt / dock-accept.txt        the composer's text right after the button click
//   stop-candidates.json        the controls that could stop a turn, as the page shows them
//   timeline.json / console.json            state history and the two console channels
//
// The states are the three the page can end in and one it must pass through:
// waiting (等你点头, a window under a second), running (进行中), and the terminal
// one — done / failed / cancelled.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { chromium } from '/home/fish/.local/share/mise/installs/node/26.8.1/lib/node_modules/@playwright/cli/node_modules/playwright/index.mjs'

const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? fallback : argv[i + 1]
}
const bootPath = arg('boot')
const outDir = arg('out')
const scenario = arg('scenario', 'amber')
const timeoutMin = Number(arg('timeout-min', '12'))
const PROMPT = arg('prompt', '用 grok_workflow 工具跑一个小活：objective 是「算出 12 乘 12，再在它的基础上加 1」，分两步，第二步依赖第一步，第一步只算乘法、第二步只算加法；不要传 tasks 参数，让插件自己规划。')
if (!bootPath || !outDir) {
  console.error('usage: node capture-states.mjs --boot <boot.log> --out <dir> --scenario <amber|failed|cancelled>')
  process.exit(2)
}
mkdirSync(outDir, { recursive: true })

const url = readFileSync(bootPath, 'utf8').match(/dsh web: (http:\/\/\S+)/)?.[1]
if (!url) throw new Error(`no "dsh web: <url>" line in ${bootPath}`)

const browser = await chromium.launch({
  executablePath: '/home/fish/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
})
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1600 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
const consoleErrors = []
const pageErrors = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', (e) => pageErrors.push(String(e)))

const log = (...a) => console.log('[capture]', ...a)

async function stateOf() {
  return page.evaluate(() => {
    const el = document.querySelector('[data-gw-progress]')
    if (!el) return { mounted: false }
    const chip = document.querySelector('[data-gw-progress-chip]')
    const nodes = [...document.querySelectorAll('[data-gw-progress-node]')].map((node) => ({
      key: node.getAttribute('data-gw-progress-node'),
      kind: node.getAttribute('data-kind'),
      ordinal: node.getAttribute('data-ordinal'),
      state: node.getAttribute('data-state'),
      current: node.getAttribute('data-current'),
      aria: node.getAttribute('aria-label'),
      word: node.querySelector('[data-gw-progress-node-word]')?.innerText?.trim() ?? '',
      badge: node.querySelector('[data-gw-progress-node-ord]')?.innerText?.trim() ?? '',
      toggle: !!node.querySelector('[data-gw-progress-node-toggle]'),
    }))
    const dock = document.querySelector('[data-gw-progress-dock]')
    return {
      mounted: true,
      chipText: chip ? chip.innerText.trim() : '',
      chipState: chip ? chip.getAttribute('data-state') : '',
      left: (document.querySelector('[data-gw-progress-left]')?.innerText || '').trim(),
      nodes,
      logRows: document.querySelectorAll('[data-gw-progress-log-row]').length,
      guardianBlocks: document.querySelectorAll('[data-gw-progress-guardian-block]').length,
      dockState: dock ? dock.getAttribute('data-state') : '',
      dockText: dock ? dock.innerText.trim() : '',
      dockButton: document.querySelector('[data-gw-progress-dock-fill]')?.innerText?.trim() ?? '',
      text: el.innerText,
    }
  })
}

const shot = async (name) => {
  const buf = await page.screenshot({ fullPage: false })
  writeFileSync(`${outDir}/${name}.png`, buf)
}

async function recordState(label, state) {
  writeFileSync(`${outDir}/${label}.txt`, `# page innerText, verbatim\n\n${state.text}\n`)
  writeFileSync(`${outDir}/${label}-dom.json`, JSON.stringify(state, null, 2))
  await shot(label)
  log(`${label}: chip=${state.chipText} nodes=${state.nodes.length} log=${state.logRows} dock=${state.dockState}`)
}

/** Which control the page offers to stop a turn — recorded before it is used. */
async function stopCandidates() {
  const list = await page.evaluate(() => {
    const isVisible = (el) => {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return r.width > 8 && r.height > 8 && s.visibility !== 'hidden' && s.display !== 'none'
    }
    const all = [...document.querySelectorAll('button,[role="button"],a')]
    return all.map((el) => {
      const r = el.getBoundingClientRect()
      return {
        tag: el.tagName,
        text: (el.innerText || '').trim().slice(0, 24),
        aria: el.getAttribute('aria-label') ?? '',
        title: el.getAttribute('title') ?? '',
        cls: (el.className && String(el.className).slice(0, 60)) || '',
        visible: isVisible(el),
        x: Math.round(r.left + r.width / 2),
        y: Math.round(r.top + r.height / 2),
      }
    }).filter((b) => b.visible)
  })
  writeFileSync(`${outDir}/stop-candidates.json`, JSON.stringify(list, null, 2))
  return list
}

async function clickStop(list) {
  const hit = list.find((b) => /停止|中断|stop|cancel/i.test(`${b.text} ${b.aria} ${b.title}`) && !/停止重试/.test(b.text))
  if (!hit) throw new Error('no stop control matched')
  await page.mouse.click(hit.x, hit.y)
  return hit
}

/** The composer's own text, read without sending anything. */
async function composerText() {
  return page.evaluate(() => {
    const el = document.querySelector('[data-soak-composer="1"]') ?? document.querySelector('[contenteditable="true"][role="textbox"]')
    if (!el) return { found: false }
    return { found: true, text: (el.innerText ?? '').trim() }
  })
}

async function clearComposer() {
  const box = await page.evaluate(() => {
    const el = document.querySelector('[contenteditable="true"][role="textbox"]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  if (!box) return
  await page.mouse.click(box.x, box.y)
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(200)
}

/** Click a dock button, read what landed in the box, then empty the box again. */
async function dockRead(label) {
  const btn = page.locator('[data-gw-progress-dock-fill]')
  if ((await btn.count()) === 0) {
    writeFileSync(`${outDir}/dock-${label}.txt`, '# no dock button on this page\n')
    return { button: null }
  }
  const text = (await btn.first().innerText()).trim()
  await btn.first().click()
  await page.waitForTimeout(600)
  const composer = await composerText()
  const filled = await page.locator('[data-gw-progress-filled]').count()
  const filledText = filled > 0 ? (await page.locator('[data-gw-progress-filled]').first().innerText()).trim() : ''
  writeFileSync(`${outDir}/dock-${label}.txt`, [
    `# the dock button on this page, and what the click actually did`,
    '',
    `button text: ${text}`,
    `composer after click: ${composer.found ? JSON.stringify(composer.text) : '(composer not found)'}`,
    `status line under the button: ${filledText === '' ? '(none)' : JSON.stringify(filledText)}`,
    `status line count: ${filled}`,
    '',
    `# the page, verbatim, with the box filled`,
    '',
    await page.evaluate(() => document.querySelector('[data-gw-progress]')?.innerText ?? ''),
    '',
  ].join('\n'))
  log(`dock ${label}: button=${JSON.stringify(text)} composer=${JSON.stringify(composer.text)}`)
  await clearComposer()
  return { button: text, composer }
}

/** Open the summary node and read its rows: the run's own result line plus the verdict. */
async function openSummaryNode() {
  const info = await page.evaluate(() => {
    // A run can visit the summary more than once (one node per draft). The verdict
    // is carried by the node the gate stopped at, so that is the one to open — and
    // only when no such node exists does the last visit stand in for it.
    const summaries = [...document.querySelectorAll('[data-gw-progress-node]')].filter((n) => n.getAttribute('data-kind') === 'summarize')
    const node = summaries.find((n) => ['failed', 'blocked', 'cancelled'].includes(n.getAttribute('data-state'))) ?? summaries[summaries.length - 1]
    if (!node) return { found: false }
    const toggle = node.querySelector('[data-gw-progress-node-toggle]')
    if (!toggle) return { found: true, toggle: false, state: node.getAttribute('data-state') }
    const r = toggle.getBoundingClientRect()
    return { found: true, toggle: true, state: node.getAttribute('data-state'), x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  if (!info.found || !info.toggle) {
    writeFileSync(`${outDir}/summary-calls.txt`, `# no summary node control to open: ${JSON.stringify(info)}\n`)
    return info
  }
  await page.mouse.click(info.x, info.y)
  await page.waitForTimeout(700)
  const calls = await page.evaluate(() => {
    const summaries = [...document.querySelectorAll('[data-gw-progress-node]')].filter((n) => n.getAttribute('data-kind') === 'summarize')
    const node = summaries.find((n) => ['failed', 'blocked', 'cancelled'].includes(n.getAttribute('data-state'))) ?? summaries[summaries.length - 1]
    const list = node?.querySelector('[data-gw-progress-node-calls]')
    const rejected = [...(node?.querySelectorAll('[data-gw-progress-node-rejected]') ?? [])].map((li) => ({ fact: li.getAttribute('data-gw-progress-node-rejected'), text: li.innerText.trim() }))
    return {
      state: node?.getAttribute('data-state') ?? null,
      aria: node?.getAttribute('aria-label') ?? null,
      expanded: node?.querySelector('[data-gw-progress-node-toggle]')?.getAttribute('aria-expanded') ?? null,
      callsText: list?.innerText ?? '(no calls list)',
      rows: [...(list?.querySelectorAll('li') ?? [])].map((li) => li.innerText.trim()),
      rejected,
    }
  })
  writeFileSync(`${outDir}/summary-calls.txt`, [
    '# the summary node, opened by clicking its own detail control',
    '',
    `node state: ${calls.state}`,
    `node aria-label: ${calls.aria}`,
    `toggle aria-expanded: ${calls.expanded}`,
    `rejected rows: ${calls.rejected.length}`,
    ...calls.rejected.map((r) => `  [${r.fact}] ${r.text}`),
    '',
    '# the rows inside the node, one per line',
    ...calls.rows.map((r) => `- ${r}`),
    '',
    '# the node list, verbatim',
    '',
    calls.callsText,
    '',
  ].join('\n'))
  await shot('summary-open')
  log(`summary node: state=${calls.state} rejected=${calls.rejected.length}`)
  return calls
}

await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)

// A profile whose stored selection is empty opens on "pick a workspace" and draws
// no composer at all. Pick the workspace by its own name; a profile that already
// has one keeps it (the composer is there on the first look).
for (let i = 0; i < 12; i++) {
  const ready = await page.evaluate(() => document.querySelector('[contenteditable="true"][role="textbox"]') !== null).catch(() => false)
  if (ready) break
  const entry = page.getByText('默认工作区', { exact: true }).first()
  if (await entry.count().catch(() => 0)) await entry.click({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(1000)
}
writeFileSync(`${outDir}/workspace.txt`, await page.evaluate(() => document.body.innerText ?? ''))

const newSession = page.getByRole('button', { name: /新会话|新建会话/ }).first()
if (await newSession.count()) await newSession.click({ timeout: 5000 }).catch(() => {})
await page.waitForTimeout(2000)

// The progress tab has to be on screen before a run starts, or the short waiting
// window is never rendered anywhere to be captured.
writeFileSync(`${outDir}/tab-open.txt`, await page.evaluate(() => document.body.innerText ?? ''))

const composer = page.locator('[contenteditable="true"][role="textbox"]').first()
await composer.click()
await composer.type(PROMPT, { delay: 2 })
const sentAt = Date.now()
await page.keyboard.press('Enter')
log(`sent at +0 (${PROMPT.length} chars)`)

// The tab bar only exists once the session has a turn, so the tab cannot be
// opened before the send: click it the moment it appears, then watch the page.
let tabOpenedAt = null
for (let i = 0; i < 150; i++) {
  const mounted = await page.evaluate(() => document.querySelector('[data-gw-progress]') !== null).catch(() => false)
  if (mounted) break
  const tab = page.getByRole('tab', { name: '进度' }).first()
  if (await tab.count().catch(() => 0)) {
    await tab.click({ timeout: 4000 }).catch(() => {})
    if (tabOpenedAt === null) {
      tabOpenedAt = Date.now() - sentAt
      log(`progress tab clicked at +${tabOpenedAt}ms`)
    }
  }
  await page.waitForTimeout(150)
}
writeFileSync(`${outDir}/tab-open.txt`, await page.evaluate(() => document.body.innerText ?? ''))

const timeline = []
const saved = {}
const deadline = Date.now() + timeoutMin * 60 * 1000
let stopList = null
let terminal = false

while (Date.now() < deadline && !terminal) {
  const t = Date.now()
  let s
  try { s = await stateOf() } catch { await page.waitForTimeout(100); continue }
  if (!s.mounted) { await page.waitForTimeout(100); continue }
  if (timeline.length === 0 || timeline.at(-1).chip !== s.chipText) {
    timeline.push({ t: t - sentAt, chip: s.chipText, nodes: s.nodes.map((n) => `${n.word}:${n.state}`), logRows: s.logRows })
  }

  if (s.chipText === '等你点头' && saved.waiting === undefined) {
    // The button leaves the page with the window, so the click happens in the same
    // tick as the detection; the state file keeps the text read before the click.
    const startBtn = await page.evaluate(() => {
      const btn = document.querySelector('[data-gw-progress-dock-fill]')
      if (!btn) return { found: false }
      const text = btn.innerText.trim()
      btn.click()
      return { found: true, text }
    })
    await recordState('waiting', s)
    await page.waitForTimeout(300)
    const startComposer = await composerText()
    const startFilled = await page.locator('[data-gw-progress-filled]').count()
    const startFilledText = startFilled > 0 ? (await page.locator('[data-gw-progress-filled]').first().innerText()).trim() : ''
    writeFileSync(`${outDir}/dock-start.txt`, [
      '# the 开工 button on the waiting page, clicked at the moment it was on screen',
      '',
      `button text: ${startBtn.found ? JSON.stringify(startBtn.text) : '(no button in the DOM)'}`,
      `composer after click: ${startComposer.found ? JSON.stringify(startComposer.text) : '(composer not found)'}`,
      `status line under the button: ${startFilled > 0 ? JSON.stringify(startFilledText) : '(window already closed; line not readable)'}`,
      '',
      '# the waiting page, verbatim, at the moment of the click',
      '',
      s.text,
      '',
    ].join('\n'))
    log(`dock start: button=${JSON.stringify(startBtn.text)} composer=${JSON.stringify(startComposer.text)} filled=${JSON.stringify(startFilledText)}`)
    await clearComposer()
    saved.waiting = { atSec: (Date.now() - sentAt) / 1000, nodes: s.nodes.length }
    saved.dockStart = { button: startBtn.text, composer: startComposer.text, filled: startFilledText }
    continue
  }
  if (s.chipText === '进行中' && saved.running === undefined && s.nodes.length >= 1) {
    await recordState('running', s)
    saved.running = { atSec: (Date.now() - sentAt) / 1000, nodes: s.nodes.length }
    if (scenario === 'cancelled') {
      stopList = await stopCandidates()
      const hit = await clickStop(stopList)
      saved.stopClicked = { ...hit, atSec: (Date.now() - sentAt) / 1000 }
      log(`clicked stop: ${JSON.stringify(hit)}`)
    }
    continue
  }
  if (['已完成', '未通过', '已取消'].includes(s.chipText)) {
    terminal = true
    await page.waitForTimeout(1500)
    const settled = await stateOf()
    const label = settled.chipState === 'done' ? 'done' : settled.chipState === 'failed' ? 'failed' : 'cancelled'
    await recordState(label, settled)
    saved[label] = { atSec: (Date.now() - sentAt) / 1000, chip: settled.chipText, nodes: settled.nodes.length, dock: settled.dockState }
    saved.summary = await openSummaryNode()
    saved.dockAccept = await dockRead('accept')
    writeFileSync(`${outDir}/${label}-page.txt`, `# the whole page, verbatim\n\n${await page.evaluate(() => document.body.innerText ?? '')}\n`)
    break
  }
  await page.waitForTimeout(120)
}

writeFileSync(`${outDir}/console.json`, JSON.stringify({ consoleErrors, pageErrors }, null, 1))
writeFileSync(`${outDir}/timeline.json`, JSON.stringify({ url: url.replace(/token=[^&]+/, 'token=<redacted>'), scenario, sentAt, timeline, saved, stopCandidates: stopList }, null, 1))
log(`terminal=${terminal} states=${JSON.stringify(Object.keys(saved))}`)
await browser.close()
