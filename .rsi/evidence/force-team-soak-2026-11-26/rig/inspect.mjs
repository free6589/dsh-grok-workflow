// Soak rig (not product code): reopen one existing session in the scratch Web UI and
// record what the page draws, so a row that exists in the session log can be compared
// with what a reader is actually shown.
//
//   node inspect.mjs --boot <boot.log> --out <dir> --tag <name> --session <sidebar text>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { chromium } from '/home/fish/.local/share/mise/installs/node/26.8.1/lib/node_modules/@playwright/cli/node_modules/playwright/index.mjs'

const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? fallback : argv[i + 1]
}
const bootPath = arg('boot'); const outDir = arg('out'); const tag = arg('tag'); const sessionText = arg('session')
mkdirSync(outDir, { recursive: true })
const url = readFileSync(bootPath, 'utf8').match(/dsh web: (http:\/\/\S+)/)?.[1]
if (!url) throw new Error('no url in boot log')

const browser = await chromium.launch({ executablePath: '/home/fish/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome' })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1200 } })).newPage()
await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4500)

if (sessionText !== undefined) {
  const entry = page.getByText(sessionText, { exact: false }).first()
  if (await entry.count()) await entry.click({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(2500)
}

const text = await page.evaluate(() => document.body.innerText ?? '')
writeFileSync(`${outDir}/${tag}.txt`, `# page innerText after reopening the session, verbatim\n\n${text}\n`)
await page.screenshot({ path: `${outDir}/${tag}.png`, fullPage: false })
console.log(`[inspect] wrote ${tag}.txt/.png; block=${text.includes('【强制：这一轮走团队模式】')} refusal=${text.includes('这一轮要的是团队')}`)
await browser.close()
