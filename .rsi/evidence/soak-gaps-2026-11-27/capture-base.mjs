// The phone's opened calls list, measured the moment it opens — no helping scroll.
//
// Round 1 of this block proved the list no longer lands on the card next door. It did not
// prove the list is *visible* when a reader taps: the app scrolled it to `block: 'nearest'`,
// which parks it against the bottom of the viewport, under the shell's pinned composer. This
// script measures what the fix has to deliver now: the frame the tap produces, as it is.
//
// The number that has to hold: `sheetAboveComposer` — the sheet's bottom edge at or above the
// top edge of the composer bar found by probing, not by a hard-coded selector. Plus the
// round-1 numbers, unchanged: zero intersection area with every node card, with the dock and
// with the dock's fill; the sheet present with the list inside it; both gone after a second
// tap; and no horizontal scroll.
//
// Usage: node capture-phone.mjs <url> <outDir>
//   <url>    the isolated instance, e.g. http://127.0.0.1:3431/?token=...
//   <outDir> where soak/readings.json, soak/*.png and the console dump go
//
// `node capture-phone.mjs --self-test` checks the measuring code against local fixtures
// (floating list over a card; sheet clear of the cards; sheet eating the dock) and needs no
// instance and no workflow.
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '/home/fish/.local/share/mise/installs/node/26.8.1/lib/node_modules/@playwright/cli/node_modules/playwright/index.mjs'

const [url, outDir] = process.argv.slice(2)
const selfTesting = url === '--self-test'
if (!selfTesting && (url === undefined || outDir === undefined)) {
  process.stderr.write('usage: node capture-phone.mjs <url> <outDir>\n       node capture-phone.mjs --self-test\n')
  process.exit(2)
}
const SOAK = `${outDir ?? ''}/soak`
// The self-test takes no output directory, and must not leave one behind either.
if (!selfTesting) mkdirSync(SOAK, { recursive: true })

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

/**
 * One moment: the page's own readings plus every rectangle the block asks about. Runs in the
 * browser in a single call, so the numbers and the frame beside them are the same paint.
 */
const READ = () => {
  const count = (selector) => document.querySelectorAll(selector).length
  const textOf = (selector) => {
    const node = document.querySelector(selector)
    return node === null ? null : node.innerText.trim()
  }
  const rectOf = (node) => {
    if (node === null || node === undefined) return null
    const box = node.getBoundingClientRect()
    return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height }
  }
  const overlapArea = (a, b) => {
    if (a === null || b === null) return 0
    const width = Math.min(a.right, b.right) - Math.max(a.left, b.left)
    const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
    return width > 0 && height > 0 ? Math.round(width * height * 100) / 100 : 0
  }
  const round = (value) => Math.round(value * 100) / 100

  const callsNode = document.querySelector('[data-gw-progress-node-calls]')
  const callsRect = rectOf(callsNode)
  const panelRect = rectOf(document.querySelector('[data-gw-progress]'))
  const dockNode = document.querySelector('[data-gw-progress-dock]')
  const fillNode = document.querySelector('[data-gw-progress-dock-fill]')
  const dockRect = rectOf(dockNode)
  const fillRect = rectOf(fillNode)
  const sheetNode = document.querySelector('[data-gw-progress-sheet]')
  const sheetRect = rectOf(sheetNode)
  const sheetHideNode = document.querySelector('[data-gw-progress-sheet-hide]')

  // The scroll room the fix adds after the dock: empty, silent, and only while a list is open.
  const roomNode = document.querySelector('.gw-progress-sheet-room')
  const roomRect = rectOf(roomNode)
  const roomAfterDock = roomNode === null || dockNode === null
    ? null
    : (dockNode.compareDocumentPosition(roomNode) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

  // The composer is whatever the shell pins over the bottom of the screen. It is found by
  // probing the bottom edge and walking up to the pinned ancestor, so no selector of the
  // host's internal markup is assumed and the reading stays honest if that markup changes.
  const composer = (() => {
    const at = document.elementFromPoint(Math.floor(window.innerWidth / 2), window.innerHeight - 6)
    if (at === null) return null
    let node = at
    let pinned = null
    while (node !== null && node !== document.documentElement) {
      const position = getComputedStyle(node).position
      if (position === 'fixed' || position === 'sticky') { pinned = node; break }
      node = node.parentElement
    }
    const target = pinned ?? at
    const box = target.getBoundingClientRect()
    return {
      foundPinnedAncestor: pinned !== null,
      probeTag: at.tagName.toLowerCase(),
      tag: target.tagName.toLowerCase(),
      className: String(target.className ?? '').slice(0, 60),
      position: getComputedStyle(target).position,
      top: round(box.top),
      bottom: round(box.bottom),
      height: round(box.height),
    }
  })()
  const inputRect = rectOf(document.querySelector('[contenteditable="true"][role="textbox"]'))

  // The page itself does not scroll: the shell scrolls a column inside it (`window.scrollY`
  // stays 0 while rectangles move). So "did the dock move" can only be answered in the
  // scroller's own coordinates — viewport coordinates change on every scroll by design.
  const scrollerOf = (node) => {
    let element = node === null || node === undefined ? null : node.parentElement
    while (element !== null && element !== undefined && element !== document.documentElement) {
      const style = getComputedStyle(element)
      if (/(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1) return element
      element = element.parentElement
    }
    return null
  }
  const scroller = scrollerOf(sheetNode ?? dockNode ?? callsNode)
  const scrollerRect = rectOf(scroller)
  const scrollerInfo = scroller === null
    ? null
    : {
        tag: scroller.tagName.toLowerCase(),
        className: String(scroller.className ?? '').slice(0, 60),
        scrollTop: round(scroller.scrollTop),
        scrollHeight: scroller.scrollHeight,
        clientHeight: scroller.clientHeight,
        atBottom: scroller.scrollTop >= scroller.scrollHeight - scroller.clientHeight - 1,
      }
  const contentTop = (box) => box === null || box === undefined || scrollerRect === null
    ? null
    : round(box.top - scrollerRect.top + (scroller === null ? 0 : scroller.scrollTop))

  const cardSelector = document.querySelector('[data-gw-progress-pnode-body]') !== null
    ? '[data-gw-progress-pnode-body]'
    : '.gw-progress-pnode-body'
  const cards = Array.from(document.querySelectorAll(cardSelector)).map((card) => {
    const holder = card.closest('[data-gw-progress-pnode]')
    return {
      id: holder === null ? null : holder.getAttribute('data-gw-progress-pnode'),
      kind: holder === null ? null : holder.getAttribute('data-kind'),
      rect: rectOf(card),
    }
  })
  const hits = cards
    .map((card) => ({ id: card.id, kind: card.kind, area: overlapArea(callsRect, card.rect) }))
    .filter((hit) => hit.area > 0)
  const overlapAreaTotal = round(hits.reduce((sum, hit) => sum + hit.area, 0))

  const viewportHeight = window.innerHeight
  const panelTop = panelRect === null ? 0 : Math.max(panelRect.top, 0)
  const panelBottom = panelRect === null ? viewportHeight : Math.min(panelRect.bottom, viewportHeight)
  const panelVisibleHeight = Math.max(0, panelBottom - panelTop)
  const scrollY = window.scrollY

  return {
    // ── the four readings this page has always carried ──────────────────────────
    mounted: document.querySelector('[data-gw-progress]') !== null,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    noHorizontalScroll: document.documentElement.scrollWidth === document.documentElement.clientWidth,
    innerWidth: window.innerWidth,
    innerHeight: viewportHeight,
    devicePixelRatio: window.devicePixelRatio,
    scrollY: round(scrollY),
    docHeight: document.documentElement.scrollHeight,
    current: count('[data-current="true"]'),
    nodeCalls: count('[data-gw-progress-node-calls]'),
    pnodes: count('[data-gw-progress-pnode]'),
    chip: textOf('[data-gw-progress-chip]'),
    line: textOf('[data-gw-progress-line]'),
    dock: textOf('[data-gw-progress-dock]'),

    // ── how the opened list is positioned, and where it is ──────────────────────
    callsPosition: callsNode === null ? null : getComputedStyle(callsNode).position,
    callsRect,
    callRows: count('[data-gw-progress-node-calls] [data-gw-progress-log-row]'),
    panelVisibleHeight,
    callsHeightShareOfPanel: callsRect === null || panelVisibleHeight === 0
      ? null
      : Math.round((callsRect.height / panelVisibleHeight) * 1000) / 1000,

    // ── the sheet: present, holding the list, how tall, and where its bottom is ──
    narrowLayout: window.matchMedia('(max-width: 720px)').matches,
    sheetCount: count('[data-gw-progress-sheet]'),
    sheetRect,
    sheetHeight: sheetRect === null ? null : round(sheetRect.height),
    sheetHeightShareOfPanel: sheetRect === null || panelVisibleHeight === 0
      ? null
      : Math.round((sheetRect.height / panelVisibleHeight) * 1000) / 1000,
    sheetMaxHeight: sheetNode === null ? null : getComputedStyle(sheetNode).maxHeight,
    sheetOverflowY: sheetNode === null ? null : getComputedStyle(sheetNode).overflowY,
    sheetTitle: sheetNode === null ? null : (sheetNode.innerText.split('\n')[0] ?? '').trim(),
    sheetHideButton: count('[data-gw-progress-sheet-hide]'),
    sheetHideLabel: sheetHideNode === null ? null : sheetHideNode.innerText.trim(),
    callsInsideSheet: callsNode === null ? null : callsNode.closest('[data-gw-progress-sheet]') !== null,
    callsInsideGraph: callsNode === null ? null : callsNode.closest('[data-gw-progress-graph]') !== null,

    // ── the composer, and whether the sheet clears it without any help ──────────
    composer,
    composerTop: composer === null ? null : composer.top,
    composerHeight: composer === null ? null : composer.height,
    inputTop: inputRect === null ? null : round(inputRect.top),
    sheetFullyInViewport: sheetRect === null
      ? null
      : sheetRect.top >= 0 && sheetRect.bottom <= viewportHeight && sheetRect.left >= 0 && sheetRect.right <= window.innerWidth,
    sheetAboveComposer: sheetRect === null || composer === null ? null : sheetRect.bottom <= composer.top,
    sheetToComposerGap: sheetRect === null || composer === null ? null : round(composer.top - sheetRect.bottom),

    // ── the scroll room after the dock ─────────────────────────────────────────
    roomPresent: roomNode !== null,
    roomAriaHidden: roomNode === null ? null : roomNode.getAttribute('aria-hidden'),
    roomAfterDock,
    roomRect,
    roomHeight: roomRect === null ? null : round(roomRect.height),
    roomHeightShareOfViewport: roomRect === null ? null : Math.round((roomRect.height / viewportHeight) * 1000) / 1000,
    dockBelowRoom: roomRect === null || dockRect === null ? null : dockRect.bottom <= roomRect.top,

    // ── scroller coordinates: the dock must not move when the room appears ─────
    // Viewport coordinates move with every scroll, so these are measured from the top of the
    // scrolling column's content: same numbers at any scroll position, in any state.
    scroller: scrollerInfo,
    dockContentTop: contentTop(dockRect),
    dockFillContentTop: contentTop(fillRect),
    sheetContentTop: contentTop(sheetRect),
    roomContentTop: contentTop(roomRect),
    roomStartsAfterDockBy: contentTop(roomRect) === null || contentTop(dockRect) === null || dockRect === null
      ? null
      : round(roomRect.top - dockRect.bottom),

    // ── the numbers the block has to see at zero ───────────────────────────────
    cardSelector,
    cardCount: cards.length,
    overlapAreaTotal,
    overlappingCount: hits.length,
    overlaps: hits,
    dockRect,
    dockFillRect: fillRect,
    dockOverlapArea: overlapArea(callsRect, dockRect),
    dockFillOverlapArea: overlapArea(callsRect, fillRect),
    dockInsideViewport: dockRect === null ? null : dockRect.top >= 0 && dockRect.bottom <= viewportHeight,
  }
}

/**
 * Three fixtures with known areas: the real page's numbers are only worth as much as the
 * arithmetic behind them. Runs offline, no instance, no workflow.
 */
const SELF_TEST = async () => {
  // The viewport meta is not decoration: in a mobile context without it the layout viewport is
  // 980 px wide and every rectangle below is scaled, which is exactly the mistake that made an
  // earlier block's "phone" reading wrong.
  const fixture = (callsStyle) => `<!doctype html><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><body style="margin:0">
    <div data-gw-progress style="position:relative;width:390px;height:800px">
      <span data-gw-progress-chip>已完成</span>
      <li data-gw-progress-pnode="task-1" data-kind="task" style="position:absolute;top:100px;left:0;width:390px;height:32px">
        <button class="gw-progress-pnode-body" data-gw-progress-pnode-open="task-1" style="width:390px;height:32px">任务 1</button>
      </li>
      <li data-gw-progress-pnode="task-2" data-kind="task" style="position:absolute;top:160px;left:0;width:390px;height:32px">
        <button class="gw-progress-pnode-body" data-gw-progress-pnode-open="task-2" style="width:390px;height:32px">任务 2</button>
      </li>
      <ol data-gw-progress-node-calls="task-1" style="${callsStyle}"></ol>
      <div data-gw-progress-dock data-state="done" style="position:absolute;top:650px;left:0;width:390px;height:40px">
        <span data-gw-progress-dock-fill style="display:block;height:20px">…</span>
      </div>
    </div></body>`

  const cases = [
    {
      name: 'floating list over the card below it (round 1 defect)',
      callsStyle: 'position:absolute;top:138px;left:0;width:390px;height:60px',
      expect: { overlapAreaTotal: 12480, overlappingCount: 1, overlappingId: 'task-2', dockOverlapArea: 0 },
    },
    {
      name: 'sheet at the bottom, clear of every card',
      callsStyle: 'position:fixed;left:0;bottom:0;width:390px;height:80px',
      expect: { overlapAreaTotal: 0, overlappingCount: 0, overlappingId: null, dockOverlapArea: 0 },
    },
    {
      name: 'sheet that eats the dock (so the dock check can fail too)',
      callsStyle: 'position:fixed;left:0;bottom:0;width:390px;height:220px',
      expect: { overlapAreaTotal: 0, overlappingCount: 0, overlappingId: null, dockOverlapArea: 15600 },
    },
  ]

  const browser = await chromium.launch({ executablePath: '/home/fish/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome' })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  let failures = 0
  for (const probe of cases) {
    await page.setContent(fixture(probe.callsStyle))
    const value = await page.evaluate(READ)
    const got = {
      overlapAreaTotal: value.overlapAreaTotal,
      overlappingCount: value.overlappingCount,
      overlappingId: value.overlappingCount === 1 ? value.overlaps[0].id : null,
      dockOverlapArea: value.dockOverlapArea,
    }
    const ok = Object.entries(probe.expect).every(([key, want]) => got[key] === want)
    if (!ok) failures += 1
    log(ok ? 'ok  ' : 'FAIL', probe.name, JSON.stringify({ got, want: probe.expect }), '| cardSelector', value.cardSelector)
  }
  await browser.close()
  log(failures === 0 ? 'self-test: all fixtures agree' : `self-test: ${failures} fixture(s) disagree`)
  process.exit(failures === 0 ? 0 : 1)
}

if (selfTesting) await SELF_TEST()

const readings = {}
const record = async (page, key) => {
  const value = await page.evaluate(READ)
  readings[key] = value
  log(
    'reading', key,
    JSON.stringify({
      w: value.innerWidth,
      chip: value.chip,
      calls: value.nodeCalls,
      rows: value.callRows,
      sheet: value.sheetCount,
      sheetBottom: value.sheetRect === null ? null : value.sheetRect.bottom,
      composerTop: value.composerTop,
      gap: value.sheetToComposerGap,
      aboveComposer: value.sheetAboveComposer,
      inViewport: value.sheetFullyInViewport,
      overlapAreaTotal: value.overlapAreaTotal,
      dockOverlap: value.dockOverlapArea,
      dockFillOverlap: value.dockFillOverlapArea,
      room: value.roomPresent,
      roomHeight: value.roomHeight,
      sw: value.scrollWidth,
      cw: value.clientWidth,
    }),
  )
  return value
}

const browser = await chromium.launch({ executablePath: '/home/fish/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome' })
// A real mobile context, not a desktop window resized: these are the numbers a phone sees.
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
page.on('pageerror', (error) => pageErrors.push(String(error)))

await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(8000)

// At 390 the host's conversation tab strip offers 对话/轨迹 only; the plugin's 进度 view sits
// behind the strip's 更多会话视图 menu. Same path as the earlier phone runs.
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

const shot = async (name, key) => {
  await page.screenshot({ path: `${SOAK}/${name}.png` })
  const value = await record(page, key)
  return { file: `${name}.png`, at: (Date.now() - sentAt) / 1000, ...value }
}

// Wait for the run to stop being 进行中, then let the final paint settle.
const deadline = Date.now() + 12 * 60 * 1000
let finished = false
while (Date.now() < deadline) {
  let state
  try { state = await page.evaluate(READ) } catch { await page.waitForTimeout(250); continue }
  if (!state.mounted) {
    if (Date.now() % 15000 < 300) await openProgress()
    await page.waitForTimeout(250)
    continue
  }
  if (state.chip !== null && state.chip !== '进行中' && state.chip !== '等你点头') {
    await page.waitForTimeout(2500)
    finished = true
    break
  }
  await page.waitForTimeout(250)
}
log('run finished:', finished)
if (!finished) {
  writeFileSync(`${SOAK}/readings.json`, JSON.stringify({ ...readings, unfinished: true }, null, 1))
  writeFileSync(`${SOAK}/console.json`, JSON.stringify({ consoleErrors, pageErrors }, null, 1))
  await browser.close()
  process.exit(1)
}

const interaction = { tabPath, sentAt: new Date(sentAt).toISOString(), tapped: {}, widths: {} }

/** The list must be closed before the next probe, or the measurement reads the wrong node. */
const closeIfOpen = async () => {
  if (await page.locator('[data-gw-progress-node-calls]').count() === 0) return
  const expanded = page.locator('[data-gw-progress-pnode-open][aria-expanded="true"]').first()
  const body = await expanded.count() ? expanded : page.locator('[data-gw-progress-pnode-open]').first()
  if (await body.count()) await body.tap({ timeout: 5000 }).catch(async () => { await body.click({ timeout: 5000 }) })
  await page.waitForTimeout(600)
}

const openableNodes = page.locator('[data-gw-progress-pnode][data-kind="task"]').filter({ has: page.locator('[data-gw-progress-pnode-open]') })
const openableCount = await openableNodes.count()
log('openable task nodes:', openableCount)

// The tallest sheet is the case the fix has to survive, so the node is chosen by opening a few
// (middle outwards) and keeping the one with the most call rows. Nothing here is measured.
if (openableCount === 0) {
  log('no openable task node in this tree; nothing to measure')
  writeFileSync(`${SOAK}/readings.json`, JSON.stringify({ ...readings, noOpenableNode: true }, null, 1))
  writeFileSync(`${SOAK}/console.json`, JSON.stringify({ consoleErrors, pageErrors }, null, 1))
  await browser.close()
  process.exit(1)
}
const tryIndexes = []
const middle = Math.floor(openableCount / 2)
for (let step = 0; step < openableCount * 2; step += 1) {
  const candidate = step === 0 ? middle : (step % 2 === 1 ? middle - Math.ceil(step / 2) : middle + Math.floor(step / 2))
  if (candidate < 0 || candidate >= openableCount || tryIndexes.includes(candidate)) continue
  tryIndexes.push(candidate)
}
let chosen = null
for (const index of tryIndexes.slice(0, 5)) {
  const target = openableNodes.nth(index)
  await target.scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(300)
  const body = target.locator('[data-gw-progress-pnode-open]').first()
  await body.tap({ timeout: 5000 }).catch(async () => { await body.click({ timeout: 5000 }) })
  await page.waitForTimeout(800)
  const rows = await page.locator('[data-gw-progress-node-calls] [data-gw-progress-log-row]').count()
  const nodeId = await target.getAttribute('data-gw-progress-pnode')
  log('probe index', index, 'node', nodeId, 'rows', rows)
  if (chosen === null || rows > chosen.rows) chosen = { index, rows, nodeId }
  await closeIfOpen()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)
  if (chosen.rows >= 3) break
}
log('chosen node:', JSON.stringify(chosen))
const chosenNode = openableNodes.nth(chosen.index)

for (const [width, height, prefix] of [
  [390, 844, 'phone-390'],
  [360, 800, 'phone-360'],
]) {
  await page.setViewportSize({ width, height })
  await page.waitForTimeout(1200)
  // A narrower viewport can drop the 进度 tab off the strip again; the page keeps its state.
  if (await page.locator('[data-gw-progress]').count() === 0) {
    await openProgress()
    await page.waitForTimeout(600)
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(400)
  await closeIfOpen()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(500)

  // The state the room must not disturb: measured closed, so the dock's document-space top
  // can be compared with the same value while the sheet is open.
  const beforeOpen = await record(page, `${prefix}-before-open`)

  await chosenNode.scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(400)
  const body = chosenNode.locator('[data-gw-progress-pnode-open]').first()
  await body.tap({ timeout: 5000 }).catch(async () => { await body.click({ timeout: 5000 }) })
  // Only the page's own reveal runs here: no scrollIntoView, no waiting for a human.
  await page.waitForTimeout(900)

  // The frame the block asks for: what a reader sees the instant the list opens.
  const asOpened = await shot(`${prefix}-as-opened`, `${prefix}-as-opened`)

  // Does the room push the dock? Taken out and put straight back: an element that sits after
  // the dock cannot move it, and this says so with a number instead of an argument. The sheet
  // itself does move the dock (it is inserted above it) — that is why this probe removes only
  // the room, and why the two effects are not confused in the report.
  const roomRemoval = await page.evaluate(() => {
    const room = document.querySelector('.gw-progress-sheet-room')
    const dock = document.querySelector('[data-gw-progress-dock]')
    if (room === null || dock === null) return null
    const parent = room.parentElement
    const next = room.nextSibling
    const before = dock.getBoundingClientRect().top
    room.remove()
    const after = dock.getBoundingClientRect().top
    parent.insertBefore(room, next)
    return { dockTopWithRoom: Math.round(before * 100) / 100, dockTopWithoutRoom: Math.round(after * 100) / 100, delta: Math.round((after - before) * 100) / 100 }
  })
  interaction.tapped[prefix] = {
    nodeId: chosen.nodeId,
    rows: asOpened.callRows,
    openAt: asOpened.at,
    composerTop: asOpened.composerTop,
    sheetBottom: asOpened.sheetRect === null ? null : asOpened.sheetRect.bottom,
    gapToComposer: asOpened.sheetToComposerGap,
    sheetAboveComposer: asOpened.sheetAboveComposer,
    sheetFullyInViewport: asOpened.sheetFullyInViewport,
    overlapAreaTotal: asOpened.overlapAreaTotal,
    // The room sits after the dock, so the dock's place in the column must not change: these
    // are scroller-content coordinates, and the two states must read the same number.
    dockContentTopBeforeOpen: beforeOpen.dockContentTop,
    dockContentTopWhileOpen: asOpened.dockContentTop,
    dockMovedBy: beforeOpen.dockContentTop === null || asOpened.dockContentTop === null
      ? null
      : Math.round((asOpened.dockContentTop - beforeOpen.dockContentTop) * 100) / 100,
    roomStartsAfterDockBy: asOpened.roomStartsAfterDockBy,
    roomRemovalProbe: roomRemoval,
    roomPresent: asOpened.roomPresent,
    roomAriaHidden: asOpened.roomAriaHidden,
    roomAfterDock: asOpened.roomAfterDock,
    roomHeight: asOpened.roomHeight,
    roomHeightShareOfViewport: asOpened.roomHeightShareOfViewport,
  }

  // The dock, scrolled into view with the list still open: the round-1 proof, again, on this
  // build. This frame is the one a reader can check by eye.
  await page.evaluate(() => {
    const dock = document.querySelector('[data-gw-progress-dock]')
    if (dock !== null) dock.scrollIntoView({ block: 'center' })
  })
  await page.waitForTimeout(700)
  const dockReading = await shot(`${prefix}-calls-dock`, `${prefix}-calls-dock`)
  interaction.widths[prefix] = {
    dockShot: `${prefix}-calls-dock`,
    dockOverlapArea: dockReading.dockOverlapArea,
    dockFillOverlapArea: dockReading.dockFillOverlapArea,
    dockInsideViewport: dockReading.dockInsideViewport,
    overlapAreaTotal: dockReading.overlapAreaTotal,
    listStillOpen: dockReading.nodeCalls,
  }

  // The very bottom of the page: what lies under the dock must be the empty room, not content
  // that got clipped away.
  await page.evaluate(() => {
    // The page does not scroll; the shell's column does. Scrolling the window here would take
    // a photograph of nothing moving.
    const anchor = document.querySelector('[data-gw-progress-sheet]') ?? document.querySelector('[data-gw-progress-dock]')
    let element = anchor === null ? null : anchor.parentElement
    while (element !== null && element !== document.documentElement) {
      const style = getComputedStyle(element)
      if (/(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1) {
        element.scrollTop = element.scrollHeight
        return
      }
      element = element.parentElement
    }
    window.scrollTo(0, document.documentElement.scrollHeight)
  })
  await page.waitForTimeout(700)
  const bottomReading = await shot(`${prefix}-bottom`, `${prefix}-bottom`)
  interaction.widths[prefix].bottomShot = `${prefix}-bottom`
  interaction.widths[prefix].bottom = {
    scrollerAtBottom: bottomReading.scroller === null ? null : bottomReading.scroller.atBottom,
    scroller: bottomReading.scroller,
    windowScrollY: bottomReading.scrollY,
    roomPresent: bottomReading.roomPresent,
    roomRect: bottomReading.roomRect,
    dockRect: bottomReading.dockRect,
    dockBelowRoom: bottomReading.dockBelowRoom,
    roomStartsAfterDockBy: bottomReading.roomStartsAfterDockBy,
    overlapAreaTotal: bottomReading.overlapAreaTotal,
  }

  // Second tap on the same node: the toggle must put both the sheet and the list away, and the
  // room with them.
  await chosenNode.scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(400)
  await body.tap({ timeout: 5000 }).catch(async () => { await body.click({ timeout: 5000 }) })
  await page.waitForTimeout(800)
  const closedReading = await record(page, `${prefix}-closed`)
  interaction.widths[prefix].closed = {
    sheetCount: closedReading.sheetCount,
    nodeCalls: closedReading.nodeCalls,
    roomPresent: closedReading.roomPresent,
    overlapAreaTotal: closedReading.overlapAreaTotal,
  }

  // The sheet's own 收起 button is the second entrance to the same toggle; at 390 it is
  // exercised too, so neither path is left unread.
  if (width === 390) {
    await body.tap({ timeout: 5000 }).catch(async () => { await body.click({ timeout: 5000 }) })
    await page.waitForTimeout(800)
    const reopened = await record(page, `${prefix}-reopened`)
    const hide = page.locator('[data-gw-progress-sheet-hide]').first()
    if (await hide.count()) {
      await hide.tap({ timeout: 5000 }).catch(async () => { await hide.click({ timeout: 5000 }) })
      await page.waitForTimeout(800)
    }
    const hidden = await record(page, `${prefix}-hidden-by-button`)
    interaction.widths[prefix].hideButton = {
      reopenedSheetCount: reopened.sheetCount,
      hideLabel: reopened.sheetHideLabel,
      afterHideSheetCount: hidden.sheetCount,
      afterHideNodeCalls: hidden.nodeCalls,
      afterHideRoomPresent: hidden.roomPresent,
    }
  }
}

writeFileSync(`${SOAK}/readings.json`, JSON.stringify(readings, null, 1))
writeFileSync(`${SOAK}/interaction.json`, JSON.stringify(interaction, null, 1))
writeFileSync(`${SOAK}/console.json`, JSON.stringify({ consoleErrors, pageErrors }, null, 1))
log('INTERACTION', JSON.stringify(interaction, null, 1))
log('CONSOLE', JSON.stringify({ consoleErrors, pageErrors }))
await browser.close()
