// Verification rig (not product code). Drives the soak GUI as a user through
// native CDP: no playwright, no puppeteer, no new dependencies.
//
//   node drive.mjs <debugPort> <appPort> <tokenFile> <outDir> <plan.json>
//
// The plan is a JSON array of steps:
//   { "type": "send",     "text": "...", "label": "s1", "timeoutMs": 240000,
//     "quietMs": 12000, "shot": true }
//   { "type": "snapshot", "label": "s1-after" }        // text + png, no input
//   { "type": "sleep",    "ms": 5000 }
//   { "type": "baseline", "label": "start" }           // pin the transcript mark
//
// A `send` writes into the composer (Input.insertText on the focused element),
// submits with a real Enter keypress, then waits for the transcript to grow AND
// go quiet for `quietMs` before recording. Every step writes
// <outDir>/<label>.txt (verbatim innerText) and, when shot, <outDir>/<label>.png.
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const [debugPortArg, appPortArg, tokenFile, outDir, planFile] = process.argv.slice(2)
if (!debugPortArg || !appPortArg || !tokenFile || !outDir || !planFile) {
  console.error('usage: node drive.mjs <debugPort> <appPort> <tokenFile> <outDir> <plan.json>')
  process.exit(2)
}
const DEBUG_PORT = Number(debugPortArg)
const APP_PORT = Number(appPortArg)
const TOKEN = readFileSync(tokenFile, 'utf8').trim()
mkdirSync(outDir, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.error('[drive]', ...a)

async function httpJson(path) {
  const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}${path}`)
  return res.json()
}

async function waitForPageTarget(timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const list = await httpJson('/json/list')
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page
    } catch { /* chromium still starting */ }
    await sleep(500)
  }
  throw new Error('no page target appeared')
}

class Cdp {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString())
      if (msg.id === undefined) return
      const p = this.pending.get(msg.id)
      if (!p) return
      this.pending.delete(msg.id)
      if (msg.error) p.reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error)})`))
      else p.resolve(msg.result)
    })
  }

  static async connect(url) {
    const ws = new WebSocket(url)
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true })
      ws.addEventListener('error', () => reject(new Error(`ws error: ${url}`)), { once: true })
    })
    return new Cdp(ws)
  }

  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`CDP timeout: ${method}`))
        }
      }, 120000)
    })
  }

  close() { try { this.ws.close() } catch { /* already gone */ } }
}

async function evaluate(cdp, expression) {
  const res = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  })
  if (res.exceptionDetails) {
    throw new Error(`evaluate failed: ${res.exceptionDetails.text} ${JSON.stringify(res.exceptionDetails.exception?.description ?? '')}`)
  }
  return res.result?.value
}

const composerProbe = `(() => {
  const isVisible = (el) => {
    if (!el) return false
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    return r.width > 20 && r.height > 10 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'
  }
  const sels = [
    'textarea',
    '[contenteditable="true"]',
    '[role="textbox"]',
    'div[contenteditable]',
  ]
  for (const sel of sels) {
    const els = [...document.querySelectorAll(sel)].filter(isVisible)
    if (els.length) {
      const el = els[els.length - 1]
      el.setAttribute('data-soak-composer', '1')
      return { found: true, tag: el.tagName, sel, count: els.length }
    }
  }
  return { found: false }
})()`

const transcriptText = `document.body.innerText`

// The composer is a Lexical contenteditable div. Programmatic .focus() does not
// reliably start its input pipeline, so click it with a real mouse event first.
async function focusComposer(cdp) {
  const probe = await evaluate(cdp, composerProbe)
  if (!probe?.found) throw new Error('composer not found on screen')
  const box = await evaluate(cdp, `(() => {
    const el = document.querySelector('[data-soak-composer="1"]')
    if (!el) return null
    el.scrollIntoView({ block: 'center' })
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }
  })()`)
  if (!box || box.w < 20 || box.h < 10) throw new Error(`composer box unusable: ${JSON.stringify(box)}`)
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await cdp.send('Input.dispatchMouseEvent', {
      type,
      x: box.x,
      y: box.y,
      button: type === 'mouseMoved' ? 'none' : 'left',
      buttons: type === 'mousePressed' ? 1 : 0,
      clickCount: type === 'mouseMoved' ? 0 : 1,
    })
  }
  await sleep(300)
  const focused = await evaluate(cdp, `(() => {
    const el = document.querySelector('[data-soak-composer="1"]')
    const a = document.activeElement
    return { isActive: !!el && (a === el || el.contains(a)), activeTag: a?.tagName ?? null }
  })()`)
  if (!focused?.isActive) throw new Error(`composer did not take focus: ${JSON.stringify(focused)}`)
  return { ...probe, ...focused, box }
}

async function pressEnter(cdp) {
  for (const type of ['rawKeyDown', 'char', 'keyUp']) {
    await cdp.send('Input.dispatchKeyEvent', {
      type,
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
      text: type === 'char' ? '\r' : undefined,
      unmodifiedText: type === 'char' ? '\r' : undefined,
    })
  }
}


async function pressCtrlEnter(cdp) {
  // The composer's own hint: "Cmd/Ctrl+Enter 插话发送全部排队消息" — this is the
  // human gesture that turns queued text into an interjection into the live turn.
  for (const type of ['rawKeyDown', 'char', 'keyUp']) {
    await cdp.send('Input.dispatchKeyEvent', {
      type,
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
      modifiers: 2,
      text: type === 'char' ? '\r' : undefined,
      unmodifiedText: type === 'char' ? '\r' : undefined,
    })
  }
}

async function sendMessage(cdp, text) {
  await focusComposer(cdp)
  // insertText goes through the real input pipeline (React/ProseMirror see it).
  const readComposer = () => evaluate(cdp, `(() => {
    const el = document.querySelector('[data-soak-composer="1"]')
    if (!el) return ''
    return (el.isContentEditable ? el.innerText : el.value) ?? ''
  })()`)
  await cdp.send('Input.insertText', { text })
  await sleep(300)
  let written = await readComposer()
  if (!written || !written.includes(text.slice(0, Math.min(12, text.length)))) {
    // The editor occasionally drops the first insertText while its input
    // pipeline is still attaching: click it again and retry once, then fail.
    await sleep(700)
    await focusComposer(cdp)
    await cdp.send('Input.insertText', { text })
    await sleep(400)
    written = await readComposer()
  }
  if (!written || !written.includes(text.slice(0, Math.min(12, text.length)))) {
    throw new Error(`composer did not take the text (got ${JSON.stringify(written?.slice(0, 80))})`)
  }
  await pressEnter(cdp)
  return written
}

// Start a clean session: the GUI restores the last session on load, and a
// restored transcript would mix earlier turns into the evidence.
async function freshSession(cdp) {
  const found = await evaluate(cdp, `(() => {
    const els = [...document.querySelectorAll('button,a,[role="button"],div')]
      .filter((e) => (e.innerText || '').trim() === '新会话' && e.getBoundingClientRect().width > 0)
    if (!els.length) return null
    const el = els[0]
    el.setAttribute('data-soak-newsession', '1')
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })()`)
  if (!found) throw new Error('new-session control not found')
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await cdp.send('Input.dispatchMouseEvent', {
      type,
      x: found.x,
      y: found.y,
      button: type === 'mouseMoved' ? 'none' : 'left',
      buttons: type === 'mousePressed' ? 1 : 0,
      clickCount: type === 'mouseMoved' ? 0 : 1,
    })
  }
  await sleep(2500)
  // The blank session shows the lone placeholder, not a transcript.
  const text = await evaluate(cdp, transcriptText) ?? ''
  return text
}

async function snapshot(cdp, label, shot) {
  const text = await evaluate(cdp, transcriptText)
  writeFileSync(join(outDir, `${label}.txt`), text ?? '')
  if (shot) {
    const png = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    writeFileSync(join(outDir, `${label}.png`), Buffer.from(png.data, 'base64'))
  }
  return text ?? ''
}

// Wait until the transcript stops changing for quietMs. Growth is NOT required:
// the GUI paints the `/grok on` acknowledgement only when the next turn starts,
// so a step that changes server state without growing the transcript would
// otherwise burn the whole timeout.
async function waitSettled(cdp, before, { timeoutMs, quietMs, expectText }) {
  const deadline = Date.now() + timeoutMs
  const t0 = deadline - timeoutMs
  let last = before
  let lastChange = Date.now()
  let sawExpect = !expectText
  while (Date.now() < deadline) {
    await sleep(1000)
    let now = ''
    try { now = await evaluate(cdp, transcriptText) ?? '' } catch { continue }
    if (now !== last) {
      last = now
      lastChange = Date.now()
    }
    if (!sawExpect && now.includes(expectText)) sawExpect = true
    if (sawExpect && Date.now() - lastChange >= quietMs) {
      return { settled: true, text: now, sawExpect, elapsedMs: Date.now() - t0, grew: now.length > before.length }
    }
  }
  return { settled: false, text: last, sawExpect, elapsedMs: timeoutMs, grew: last.length > before.length }
}

const cdp = await Cdp.connect((await waitForPageTarget()).webSocketDebuggerUrl)
await cdp.send('Page.enable')
await cdp.send('Runtime.enable')

const appUrl = `http://127.0.0.1:${APP_PORT}`
log(`navigating to ${appUrl} (token from file, never printed)`)
await cdp.send('Page.navigate', { url: `${appUrl}/?token=${encodeURIComponent(TOKEN)}` })

// Wait for the composer to exist: the app is a SPA, load events fire early.
let composer = { found: false }
for (let i = 0; i < 180; i++) {
  await sleep(1000)
  try {
    composer = await evaluate(cdp, composerProbe)
    if (composer?.found) break
  } catch { /* navigation in flight */ }
}
if (!composer?.found) throw new Error('composer never appeared (GUI did not boot)')
log(`composer ready: ${JSON.stringify(composer)}`)
writeFileSync(join(outDir, '_composer.json'), JSON.stringify(composer, null, 2))

const plan = JSON.parse(readFileSync(planFile, 'utf8'))
const startedAt = new Date().toISOString()
const results = []
let mark = await evaluate(cdp, transcriptText) ?? ''

for (const step of plan) {
  if (step.type === 'sleep') {
    await sleep(step.ms ?? 1000)
    continue
  }
  if (step.type === 'fresh') {
    const text = await freshSession(cdp)
    mark = text
    writeFileSync(join(outDir, `${step.label ?? 'fresh'}.txt`), text)
    log(`fresh session; transcript now ${text.length} chars`)
    continue
  }
  if (step.type === 'baseline') {
    mark = await evaluate(cdp, transcriptText) ?? ''
    log(`baseline pinned at ${mark.length} chars`)
    continue
  }
  if (step.type === 'snapshot') {
    const text = await snapshot(cdp, step.label, step.shot !== false)
    results.push({ label: step.label, type: 'snapshot', chars: text.length })
    log(`snapshot ${step.label} (${text.length} chars)`)
    continue
  }
  if (step.type === 'settle') {
    // Wait for the transcript to go quiet without sending anything: a run's own
    // turns arrive on their own, so "did it settle" is the only question here.
    const settled = await waitSettled(cdp, mark, {
      timeoutMs: step.timeoutMs ?? 600000,
      quietMs: step.quietMs ?? 15000,
      expectText: step.expectText,
    })
    mark = settled.text
    writeFileSync(join(outDir, `${step.label}.txt`), settled.text)
    if (step.shot !== false) await snapshot(cdp, step.label, true)
    results.push({ label: step.label, type: 'settle', settled: settled.settled, sawExpect: settled.sawExpect, elapsedMs: settled.elapsedMs })
    log(`settle ${step.label}: settled=${settled.settled} sawExpect=${settled.sawExpect} in ${settled.elapsedMs}ms`)
    continue
  }
  if (step.type === 'clicktext') {
    // Click the first visible element whose own text is exactly `text` — the
    // workspace picker and the session's own controls have no stable selectors.
    const hit = await evaluate(cdp, `(() => {
      const want = ${JSON.stringify('__TEXT__')}
      const isVisible = (el) => {
        const r = el.getBoundingClientRect()
        const s = getComputedStyle(el)
        return r.width > 8 && r.height > 8 && s.visibility !== 'hidden' && s.display !== 'none'
      }
      const all = [...document.querySelectorAll('button,a,[role="button"],[role="option"],li,div,span')]
      const el = all.find((e) => (e.innerText || '').trim() === want && isVisible(e))
      if (!el) return null
      el.scrollIntoView({ block: 'center' })
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, tag: el.tagName }
    })()`.replace('"__TEXT__"', JSON.stringify(step.text)))
    if (!hit) throw new Error(`no visible element with text ${JSON.stringify(step.text)}`)
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await cdp.send('Input.dispatchMouseEvent', {
        type,
        x: hit.x,
        y: hit.y,
        button: type === 'mouseMoved' ? 'none' : 'left',
        buttons: type === 'mousePressed' ? 1 : 0,
        clickCount: type === 'mouseMoved' ? 0 : 1,
      })
    }
    await sleep(step.waitMs ?? 1500)
    writeFileSync(join(outDir, `${step.label ?? 'click'}.txt`), await evaluate(cdp, transcriptText) ?? '')
    results.push({ label: step.label, type: 'clicktext', text: step.text, hit })
    log(`clicked ${JSON.stringify(step.text)} (${hit.tag})`)
    continue
  }
  if (step.type === 'steer') {
    log(`steer ${step.label}: ${step.text.slice(0, 60)}`)
    await focusComposer(cdp)
    await cdp.send('Input.insertText', { text: step.text })
    await sleep(400)
    const written = await evaluate(cdp, `(() => {
      const el = document.querySelector('[data-soak-composer="1"]')
      return el ? (el.isContentEditable ? el.innerText : el.value) ?? '' : ''
    })()`)
    writeFileSync(join(outDir, `${step.label}.typed.txt`), String(written ?? ''))
    await sleep(step.beforeKeyMs ?? 600)
    // Capture what the composer looks like *before* the flush key: the running
    // state's own hint ("Cmd/Ctrl+Enter ...") is the fact under test.
    writeFileSync(join(outDir, `${step.label}.beforekey.txt`), await evaluate(cdp, transcriptText) ?? '')
    const preShot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    writeFileSync(join(outDir, `${step.label}.beforekey.png`), Buffer.from(preShot.data, 'base64'))
    await pressCtrlEnter(cdp)
    await sleep(step.afterKeyMs ?? 4000)
    const text = await snapshot(cdp, step.label, true)
    results.push({ label: step.label, type: 'steer', typed: String(written ?? '').slice(0, 120), chars: text.length })
    log(`  steer sent; transcript ${text.length} chars`)
    continue
  }
  if (step.type === 'send') {
    const before = mark
    const t0 = Date.now()
    log(`send ${step.label}: ${step.text.slice(0, 60)}`)
    try {
      await sendMessage(cdp, step.text)
    } catch (error) {
      // A step marked optional is a measurement, not a precondition: a composer
      // that refuses input while a run is working is exactly the kind of fact
      // this rig has to be able to record instead of dying on.
      if (step.optional !== true) throw error
      const message = String(error?.message ?? error)
      writeFileSync(join(outDir, `${step.label}.error.txt`), message)
      results.push({ label: step.label, type: 'send', error: message })
      log(`  optional send refused: ${message}`)
      continue
    }
    const settled = await waitSettled(cdp, before, {
      timeoutMs: step.timeoutMs ?? 240000,
      quietMs: step.quietMs ?? 12000,
      expectText: step.expectText,
    })
    const delta = settled.text.slice(Math.min(before.length, settled.text.length))
    writeFileSync(join(outDir, `${step.label}.delta.txt`), delta)
    if (step.shot !== false) await snapshot(cdp, step.label, true)
    writeFileSync(join(outDir, `${step.label}.txt`), settled.text)
    mark = settled.text
    const rec = {
      label: step.label,
      type: 'send',
      text: step.text,
      settled: settled.settled,
      grew: settled.grew,
      elapsedMs: Date.now() - t0,
      beforeChars: before.length,
      afterChars: settled.text.length,
      deltaChars: delta.length,
    }
    results.push(rec)
    log(`  settled=${settled.settled} grew=${settled.grew} in ${rec.elapsedMs}ms, +${delta.length} chars`)
    continue
  }
  throw new Error(`unknown step type: ${step.type}`)
}

writeFileSync(join(outDir, '_run.json'), JSON.stringify({
  startedAt,
  finishedAt: new Date().toISOString(),
  appUrl,
  composer,
  results,
}, null, 2))

cdp.close()
log('done')
process.exit(0)
