/**
 * Shared helpers for the human-report real-machine evidence run (agent-31, 2026-11-15).
 *
 * The DSH access token is read from the environment variable DSH_URL on purpose: it is a
 * live credential of the throwaway instance and never belongs in the repository. Every
 * helper that could echo a URL redacts the token.
 *
 * The transcript contract below (`data-chat-flow-kind`) was read off the live DOM with
 * `probes/probe-flow.mjs`, not guessed: the app renders the reply as Markdown, so a
 * single newline in the delivered text becomes a space in the rendered paragraph.
 * Assertions therefore run on `innerText` of the assistant's own node, and a missing
 * selector is reported as a failure instead of passing vacuously.
 */
import fs from 'node:fs'
import path from 'node:path'

export const PW = '/home/fish/.local/share/mise/installs/node/26.8.1/lib/node_modules/@playwright/cli/node_modules/playwright/index.mjs'

export const APP = process.env.DSH_URL
if (!APP) throw new Error('DSH_URL is required (http://127.0.0.1:<port>/?token=...)')

export const OUT = new URL('.', import.meta.url).pathname
const STATE = path.join(OUT, 'run-state.json')

/** Strip a live token out of any string before it can reach a log or a screenshot. */
export const redact = (s) => String(s).replace(/token=[A-Za-z0-9_.\-]+/g, 'token=<redacted>')

export function loadState () {
  return fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {}
}
export function saveState (state) {
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2))
}
export function mergeState (patch) {
  const next = { ...loadState(), ...patch }
  saveState(next)
  return next
}
export function log (obj) {
  process.stdout.write(redact(typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2)) + '\n')
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
  for (const name of ['Continue', '继续', 'OK', 'Got it', '知道了']) {
    const c = p.getByRole('button', { name })
    if (await c.count()) {
      await c.first().click().catch(() => {})
      await p.waitForTimeout(1200)
      return name
    }
  }
  return null
}

/** Reopen the run's session from the sidebar (the app boots into a new session). */
export async function openSession (p, fragment = 'scratch', ms = 20000) {
  const row = p.getByText(fragment, { exact: false }).first()
  if (await row.count() === 0) return false
  await row.click()
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await p.locator('[data-chat-flow-kind="assistant-step"]').count() > 0) {
      await p.waitForTimeout(2000)
      return true
    }
    await p.waitForTimeout(1000)
  }
  return false
}

export async function send (p, text) {
  const box = p.locator('[contenteditable="true"]').last()
  await box.click()
  await p.keyboard.insertText(text)
  await p.waitForTimeout(400)
  await p.keyboard.press('Enter')
}

export const body = (p) => p.locator('body').innerText()

export async function waitText (p, needle, ms = 300000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if ((await body(p)).includes(needle)) return true
    await p.waitForTimeout(2000)
  }
  return false
}

/** Wait until the page text stops changing (the turn has settled). */
export async function settle (p, ms = 300000, needStable = 4) {
  const end = Date.now() + ms
  let last = ''
  let stable = 0
  while (Date.now() < end) {
    const now = await body(p)
    if (now === last) { stable += 1; if (stable >= needStable) return true } else { stable = 0; last = now }
    await p.waitForTimeout(3000)
  }
  return false
}

export const shot = (p, name) => p.screenshot({ path: `${OUT}${name}`, fullPage: false })

/** The View tab strip as the browser really renders it. */
export const tabsInfo = (p) => p.evaluate(() => Array.from(document.querySelectorAll('button[role="tab"]')).map((el) => ({
  label: (el.innerText || '').trim(),
  selected: el.getAttribute('aria-selected')
})))

export async function clickTab (p, name) {
  await p.getByRole('tab', { name, exact: true }).click()
  await p.waitForTimeout(1500)
}

/** Every chat flow node the app really renders, with its own text length. */
export const flowKinds = (p) => p.evaluate(() => Array.from(document.querySelectorAll('[data-chat-flow-kind]')).map((e) => ({
  kind: e.getAttribute('data-chat-flow-kind'),
  turn: e.getAttribute('data-chat-turn'),
  part: e.getAttribute('data-chat-group-part'),
  len: (e.innerText || '').length
})))

/**
 * The assistant's own reply text, isolated from the user's bubble.
 *
 * The user bubble deliberately contains the machine words the human block must not
 * repeat (`stat -c`, `sha256sum`), so a whole-page substring scan cannot tell "the
 * report leaked a command" from "the user asked for one".
 */
export async function assistantTexts (p) {
  const sel = '[data-chat-flow-kind="assistant-step"]'
  const n = await p.locator(sel).count()
  const all = await p.evaluate((s) => Array.from(document.querySelectorAll(s)).map((e) => (e.innerText || '').trim()), sel)
  const responses = await p.evaluate((s) => Array.from(document.querySelectorAll(s + '[data-chat-group-part="response"]')).map((e) => (e.innerText || '').trim()), sel)
  return { selector: sel, count: n, all, responses, texts: responses.filter((t) => t !== '') }
}

/** The user's own bubble text (so "the task is still there" is measured, not assumed). */
export const userTexts = (p) => p.evaluate(() => Array.from(document.querySelectorAll('[data-chat-flow-kind="user"]')).map((e) => (e.innerText || '').trim()))

/** Scroll the head of the delivered report to the top of the pane without re-rendering. */
export async function scrollReportStart (p) {
  return p.evaluate(async () => {
    const node = document.querySelector('[data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]')
    const target = node ? (node.querySelector('li, p') || node) : null
    if (!target) return false
    target.scrollIntoView({ block: 'start' })
    await new Promise((r) => setTimeout(r, 400))
    const scroller = document.querySelector('[data-chat-flow]')
    if (scroller) scroller.scrollTop = Math.max(0, scroller.scrollTop - 90)
    return true
  })
}

/**
 * Machine material the delivery layer says it strips from the human block.
 *
 * A hit here is a *defect against the stated contract*: the reader got handed a
 * command, a digest, a locator, the relay markers or a ledger field label.
 */
export const STRIP_PROBES = {
  markerBegin: /<<<GROK-WORKFLOW-REPORT>>>/,
  markerEnd: /<<<END-GROK-WORKFLOW-REPORT>>>/,
  anyRelayMarker: /<<<[A-Z-]*GROK-WORKFLOW[A-Z-]*>>>/,
  ledgerGuard: /\[internal: workflow ledger/,
  statCommand: /\bstat\s+-/,
  odCommand: /\bod\s+-[a-zA-Z]/,
  shaTool: /\b(?:sha-?256|sha256sum|sha512sum|sha1sum|md5sum|md5)\b/i,
  hexDigest: /\b[0-9a-f]{16,64}\b/i,
  codeFence: /```/,
  absolutePosixPath: /(?:^|[\s(（"'=])\/(?:home|tmp|usr|var|etc|opt|root)\b/,
  windowsPath: /\b[A-Za-z]:\\/,
  fileUri: /\bfile:\/\//,
  url: /\bhttps?:\/\//,
  ledgerLabelGrokWorkflow: /Grok workflow:/,
  ledgerLabelObjective: /Objective:/,
  ledgerLabelPlan: /\bPlan:/,
  ledgerLabelModelRoutes: /Model routes:/,
  ledgerLabelDeadline: /Deadline:/,
  ledgerLabelConfirmedEvidence: /Confirmed evidence:/,
  ledgerLabelIncomplete: /\bIncomplete:/,
  ledgerLabelFinalAnswer: /Final answer:/,
  ledgerLabelRouteSwitches: /Route switches:/,
  idKeyRunId: /\brunId\b/,
  idKeySeq: /\bseq\b/,
  childSession: /\bchild session\b/i,
  rawTaskId: /\btask-\d+\b/
}

/**
 * Machine material that survived the strip — recorded as a finding, not as a pass.
 *
 * These are the classes the human block still shows in this build; the evidence set
 * reports them instead of rounding them away.
 */
export const RESIDUE_PROBES = {
  dotRelativePath: /(?:^|[\s(（])\.[\w.-]*\/[\w.@%+-]+/,
  bareSlashSeparator: /(?:^|[\s：])[/](?:[\s。，；]|$)/,
  commandHeadCat: /\bcat\s+[^，。；\n]{0,40}/,
  escapeSequence: /\\[rn]/,
  shellJargonNoop: /\bnoop\b/i
}

const tally = (probes, texts) => {
  const hits = []
  for (const [name, re] of Object.entries(probes)) {
    for (const t of texts) {
      const m = re.exec(t)
      if (m) { hits.push({ probe: name, sample: m[0].slice(0, 70) }); break }
    }
  }
  return hits
}
export const stripHits = (texts) => tally(STRIP_PROBES, texts)
export const residueHits = (texts) => tally(RESIDUE_PROBES, texts)

/** Human-block landmarks the default form must carry (zh first, then the en mirror). */
export const HUMAN_PROBES = {
  zhHeadline: /做完了：|办好了：|完成了：/,
  zhEvidenceLabel: /关键证据：/,
  zhNextLabel: /下一步：/,
  zhWorthKnowing: /需要你知道的：/,
  zhUndone: /没做成的：/,
  enMirror: /Done: all|Key evidence:|Next: /,
  bulletList: /^\s*[•\-]/m,
  ledgerRule: /\n---\n/
}
export const humanHits = (texts) => {
  const hits = []
  for (const [name, re] of Object.entries(HUMAN_PROBES)) {
    for (const t of texts) { if (re.test(t)) { hits.push(name); break } }
  }
  return hits
}

/** Dark-mode / layout measurement, read from the live DOM. */
export const look = (p) => p.evaluate(() => {
  const cs = getComputedStyle(document.body)
  const tab = document.querySelector('button[role="tab"]')
  const box = (el) => el ? { w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) } : null
  return {
    viewport: { w: innerWidth, h: innerHeight },
    prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
    bodyBg: cs.backgroundColor,
    bodyColor: cs.color,
    tabColor: tab ? getComputedStyle(tab).color : null,
    tabStripBox: box(document.querySelector('[role="tablist"]')),
    reportBox: box(document.querySelector('[data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]'))
  }
})

/** The plugin's own progress subtree, read from the live DOM. */
export const progressDom = (p) => p.evaluate(() => {
  const root = document.querySelector('.gw-progress')
  const nodes = root ? Array.from(root.querySelectorAll('.gw-progress-node')) : []
  return {
    present: !!root,
    nodeCount: nodes.length,
    states: Array.from(new Set(nodes.map((n) => n.getAttribute('data-state')))),
    percent: root ? ((root.querySelector('.gw-progress-percent') || {}).innerText || '').trim() : null
  }
})

export const CRASH = [/TypeError/, /Cannot read propert/, /is not a function/, /Uncaught/, /Minified React error/]
export const crashHits = (text) => CRASH.filter((re) => re.test(text)).map(String)
