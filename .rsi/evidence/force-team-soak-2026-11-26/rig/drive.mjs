// Soak rig (not product code): send one message through the scratch Web UI and record
// what the page shows, as a reader sees it.
//
//   node drive.mjs --boot <boot.log> --out <dir> --tag <name> --prompt <text>
//                  [--settle-ms 4000] [--timeout-min 12]
//
// Writes into <out>:
//   <tag>.png          screenshot after the turn settled
//   <tag>.txt          the page's own innerText, verbatim
//   <tag>-transcript.json  every message row the page rendered, with its author class
//
// The URL carries the instance's session token, so it is read from the boot log and
// never printed or written anywhere.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { chromium } from '/home/fish/.local/share/mise/installs/node/26.8.1/lib/node_modules/@playwright/cli/node_modules/playwright/index.mjs'

const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? fallback : argv[i + 1]
}
const bootPath = arg('boot')
const outDir = arg('out')
const tag = arg('tag')
const prompt = arg('prompt')
const pre = arg('pre')
const settleMs = Number(arg('settle-ms', '4000'))
const timeoutMin = Number(arg('timeout-min', '12'))
if (!bootPath || !outDir || !tag || prompt === undefined) {
  console.error('usage: node drive.mjs --boot <boot.log> --out <dir> --tag <name> --prompt <text>')
  process.exit(2)
}
mkdirSync(outDir, { recursive: true })

const url = readFileSync(bootPath, 'utf8').match(/dsh web: (http:\/\/\S+)/)?.[1]
if (!url) throw new Error(`no "dsh web: <url>" line in ${bootPath}`)

const log = (...a) => console.log('[drive]', ...a)
const browser = await chromium.launch({
  executablePath: '/home/fish/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
})
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
const consoleErrors = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', (e) => consoleErrors.push(String(e)))

await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)

// A profile whose stored selection is empty opens on "pick a workspace" and draws no
// composer; a profile with a default workspace draws the composer on the first look.
const workspace = await page.evaluate(() => document.body.innerText ?? '')
writeFileSync(`${outDir}/${tag}-workspace.txt`, workspace)
for (let i = 0; i < 12; i++) {
  const ready = await page.evaluate(() => document.querySelector('[contenteditable="true"][role="textbox"]') !== null).catch(() => false)
  if (ready) break
  const entry = page.getByText('soak-force-team', { exact: true }).first()
  if (await entry.count().catch(() => 0)) await entry.click({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(1000)
}

const newSession = page.getByRole('button', { name: /新会话|新建会话/ }).first()
if (await newSession.count()) await newSession.click({ timeout: 5000 }).catch(() => {})
await page.waitForTimeout(1500)

const composer = page.locator('[contenteditable="true"][role="textbox"]').first()

// An optional first message in the SAME session — the path a user takes to put the
// session in grok mode before asking for a team.
if (pre !== undefined) {
  await composer.click()
  await composer.type(pre, { delay: 2 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(6000)
  writeFileSync(`${outDir}/${tag}-pre.txt`, `# the page right after the first message ${JSON.stringify(pre)}\n\n${await page.evaluate(() => document.body.innerText ?? '')}\n`)
  log(`pre-message sent: ${pre}`)
}

await composer.click()
await composer.type(prompt, { delay: 2 })
const sentAt = Date.now()
await page.keyboard.press('Enter')
log(`sent, ${prompt.length} chars`)

/** Whatever the page is willing to tell us about a turn in progress. */
const busy = () => page.evaluate(() => {
  const isVisible = (el) => {
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    return r.width > 8 && r.height > 8 && s.visibility !== 'hidden' && s.display !== 'none'
  }
  const controls = [...document.querySelectorAll('button,[role="button"]')]
    .filter((el) => isVisible(el))
    .map((el) => `${el.innerText || ''} ${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('title') ?? ''}`)
  return {
    stopping: controls.some((text) => /停止|中断|stop/i.test(text) && !/停止重试/.test(text)),
    text: document.body.innerText ?? '',
    controls: controls.length,
  }
})

let last = ''
let stable = 0
let done = false
const deadline = Date.now() + timeoutMin * 60 * 1000
let sawBusy = false
while (Date.now() < deadline) {
  let state
  try { state = await busy() } catch { await page.waitForTimeout(200); continue }
  if (state.stopping) sawBusy = true
  if (state.text === last) stable += 1
  else { stable = 0; last = state.text }
  // Settled: the page stopped changing and nothing offers to stop the turn. The
  // extra guard keeps a slow first paint from reading as "settled".
  if (stable >= Math.ceil(settleMs / 400) && !state.stopping && Date.now() - sentAt > settleMs) { done = true; break }
  await page.waitForTimeout(400)
}
log(`settled=${done} sawBusy=${sawBusy} after ${Math.round((Date.now() - sentAt) / 1000)}s`)

const text = await page.evaluate(() => document.body.innerText ?? '')
writeFileSync(`${outDir}/${tag}.txt`, `# page innerText, verbatim\n\n${text}\n`)
writeFileSync(`${outDir}/${tag}-console.json`, JSON.stringify({ consoleErrors, sawBusy, settled: done }, null, 2))

// Every message row the page draws, with the class that marks who wrote it, so the
// transcript can be compared against the session log.
const transcript = await page.evaluate(() => {
  const rows = []
  const nodes = document.querySelectorAll('[data-message-role],[data-role],[class*="message"]')
  for (const node of nodes) {
    const t = (node.innerText ?? '').trim()
    if (t === '') continue
    rows.push({
      role: node.getAttribute('data-message-role') ?? node.getAttribute('data-role') ?? null,
      cls: String(node.className ?? '').slice(0, 120),
      text: t.slice(0, 4000),
    })
  }
  return rows
})
writeFileSync(`${outDir}/${tag}-transcript.json`, JSON.stringify(transcript, null, 2))

await page.screenshot({ path: `${outDir}/${tag}.png`, fullPage: false })
await browser.close()
log(`wrote ${tag}.png / ${tag}.txt / ${tag}-transcript.json`)
