// Soak scratch (not product code): one page, one session, four steps.
//
//   node confirm2.mjs --boot <boot.log> --out <dir> --tag <name>
//                     [--prompt <text>] [--confirm <text>]
//
// 1. `/grok on`, wait for that to settle;
// 2. the keyword prompt, wait for the confirmation moment (block preview, or a question);
// 3. `确认`, wait up to --run-min for the run to settle;
// 4. record page innerText, screenshot, rendered transcript — same session throughout.
//
// Login/open path, settle loop and capture shapes are copied from drive.mjs; the only
// difference is that it never clicks "新会话" after the first message, so every step
// lands in the session the first step created.
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
const prompt = arg('prompt', '开团：统计 README.md 有多少行、CHANGELOG.md 有多少行，两个都要数。')
const confirmText = arg('confirm', '确认')
const runMin = Number(arg('run-min', '15'))
if (!bootPath || !outDir || !tag) {
  console.error('usage: node confirm2.mjs --boot <boot.log> --out <dir> --tag <name> [--prompt <text>]')
  process.exit(2)
}
mkdirSync(outDir, { recursive: true })

const url = readFileSync(bootPath, 'utf8').match(/dsh web: (http:\/\/\S+)/)?.[1]
if (!url) throw new Error(`no "dsh web: <url>" line in ${bootPath}`)
const log = (...a) => console.log('[confirm2]', ...a)

const browser = await chromium.launch({
  executablePath: '/home/fish/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
})
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
const consoleErrors = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', (e) => consoleErrors.push(String(e)))

await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4500)

for (let i = 0; i < 12; i++) {
  const ready = await page.evaluate(() => document.querySelector('[contenteditable="true"][role="textbox"]') !== null).catch(() => false)
  if (ready) break
  const entry = page.getByText('soak-force-team', { exact: true }).first()
  if (await entry.count().catch(() => 0)) await entry.click({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(1000)
}

const composer = page.locator('[contenteditable="true"][role="textbox"]').first()

/** Page state: busy flag, whether it is waiting for the user, whether a preview is up. */
const state = () => page.evaluate(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    return r.width > 8 && r.height > 8 && s.visibility !== 'hidden' && s.display !== 'none'
  }
  const controls = [...document.querySelectorAll('button,[role="button"]')]
    .filter((el) => visible(el))
    .map((el) => `${el.innerText || ''} ${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('title') ?? ''}`)
  const text = document.body.innerText ?? ''
  return {
    stopping: controls.some((t) => /停止|中断|stop/i.test(t) && !/停止重试/.test(t)),
    waiting: /等待你的操作|待回答/.test(text) || controls.some((t) => /跳过|提交/.test(t)),
    preview: /接单预览|preview_id|split_hash/.test(text),
    text,
  }
})

/** Wait until the page stops changing, or it asks for input, or a preview shows up. */
const waitSettle = async (label, { settleMs = 4000, maxMin = 8, stopOnWait = false, stopOnPreview = false }) => {
  let last = ''
  let stable = 0
  let sawBusy = false
  const deadline = Date.now() + maxMin * 60 * 1000
  const started = Date.now()
  let why = 'timeout'
  while (Date.now() < deadline) {
    let s
    try { s = await state() } catch { await page.waitForTimeout(250); continue }
    if (s.stopping) sawBusy = true
    if (s.text === last) stable += 1
    else { stable = 0; last = s.text }
    if (stopOnPreview && s.preview && !s.stopping) { why = 'preview'; break }
    if (stopOnWait && s.waiting && !s.stopping) { why = 'waiting-for-user'; break }
    if (stable >= Math.ceil(settleMs / 400) && !s.stopping && Date.now() - started > settleMs) { why = 'stable'; break }
    await page.waitForTimeout(400)
  }
  const elapsed = Math.round((Date.now() - started) / 1000)
  log(`${label}: settled(${why}) sawBusy=${sawBusy} after ${elapsed}s`)
  const text = await page.evaluate(() => document.body.innerText ?? '')
  writeFileSync(`${outDir}/${tag}-${label}.txt`, `# page innerText after ${label} (why=${why}, ${elapsed}s)\n\n${text}\n`)
  return { why, sawBusy, elapsed, text }
}

/** Send one message into the already-open session. */
const send = async (text, label) => {
  await composer.click()
  await composer.type(text, { delay: 2 })
  await page.keyboard.press('Enter')
  log(`${label}: sent ${text.length} chars`)
}

writeFileSync(`${outDir}/${tag}-workspace.txt`, await page.evaluate(() => document.body.innerText ?? ''))

// 1. grok mode on
await send('/grok on', 'step1-grokon')
const s1 = await waitSettle('step1-grokon', { settleMs: 4000, maxMin: 4 })

// 2. the keyword turn
await send(prompt, 'step2-prompt')
const s2 = await waitSettle('step2-prompt', { settleMs: 5000, maxMin: 8, stopOnPreview: true, stopOnWait: true })

// 3. the confirmation, if the page gave a moment for it
let s3 = null
if (s2.why === 'preview' || s2.why === 'waiting-for-user' || s2.why === 'stable') {
  await send(confirmText, 'step3-confirm')
  s3 = await waitSettle('step3-confirm', { settleMs: 10000, maxMin: runMin, stopOnWait: false, stopOnPreview: false })
} else {
  log(`step3: no confirmation moment (step2 why=${s2.why}); not sending`)
}

// 4. record
const text = await page.evaluate(() => document.body.innerText ?? '')
writeFileSync(`${outDir}/${tag}.txt`, `# page innerText, verbatim (final)\n\n${text}\n`)
writeFileSync(`${outDir}/${tag}-console.json`, JSON.stringify({
  consoleErrors,
  step1: { why: s1.why, sawBusy: s1.sawBusy, elapsed: s1.elapsed },
  step2: { why: s2.why, sawBusy: s2.sawBusy, elapsed: s2.elapsed },
  step3: s3 === null ? null : { why: s3.why, sawBusy: s3.sawBusy, elapsed: s3.elapsed },
}, null, 2))

const transcript = await page.evaluate(() => {
  const rows = []
  for (const node of document.querySelectorAll('[data-message-role],[data-role],[class*="message"]')) {
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