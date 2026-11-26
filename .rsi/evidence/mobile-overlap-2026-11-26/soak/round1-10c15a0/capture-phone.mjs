// Mobile overlap: one live three-task run, then the same finished page at 390x844 and
// 360x800 with one task node's calls list opened — and the area by which that list lands on
// anything it must not touch.
//
// The claim under test: at <=720 px the opened list is a bottom sheet, so its rectangle has
// zero intersection with every node card, with the dock, and with the dock's fill; above
// 720 px nothing changed. This script measures the <=720 px side at two widths. The number
// that has to be 0 is `overlapAreaTotal` — before the fix it is not 0 (the list floats out
// from under its node and covers the neighbouring card).
//
// Everything is measured in one `page.evaluate` per moment, so a reading and the frame beside
// it come from the same paint: no reading is taken after a screenshot that could have moved.
//
// Usage: node capture-phone.mjs <url> <outDir>
//   <url>    the isolated instance, e.g. http://127.0.0.1:3421/?token=...
//   <outDir> where soak/readings-phone.json, soak/*.png and the console dump go
//
// `node capture-phone.mjs --self-test` checks the measuring code against three local fixtures
// (a floating list that overlaps a card, a sheet that clears the cards, a sheet that eats the
// dock) and prints the areas it computed. It needs no instance and no workflow, so the number
// this script reports can be trusted before a three-minute run is spent on it.
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
 * One moment: the page's own readings plus the geometry the block asks for. Runs in the
 * browser, so every rectangle is the one on screen at that instant.
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

  const callsNode = document.querySelector('[data-gw-progress-node-calls]')
  const callsRect = rectOf(callsNode)
  const panelRect = rectOf(document.querySelector('[data-gw-progress]'))
  const dockNode = document.querySelector('[data-gw-progress-dock]')
  const fillNode = document.querySelector('[data-gw-progress-dock-fill]')
  const dockRect = rectOf(dockNode)
  const fillRect = rectOf(fillNode)

  // The narrow layout puts the opened calls in a sheet of its own, outside the graph. Where
  // that sheet is, whether the list is really inside it, and how tall it got are the three
  // facts that separate "drawer" from "the list still floating on the card".
  const sheetNode = document.querySelector('[data-gw-progress-sheet]')
  const sheetRect = rectOf(sheetNode)
  const sheetHideNode = document.querySelector('[data-gw-progress-sheet-hide]')

  // The card of a node is `.gw-progress-pnode-body` — a class in this build, and a data
  // attribute in a build that exposes it. Both are honoured, the attribute first, and the
  // selector actually used is recorded so the reading cannot be misread later.
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
  const overlapAreaTotal = Math.round(hits.reduce((sum, hit) => sum + hit.area, 0) * 100) / 100

  // How much of the panel a reader can actually see right now, and what share of it the list
  // takes: a sheet that eats the whole panel is a different defect from one that eats a corner.
  const viewportHeight = window.innerHeight
  const panelTop = panelRect === null ? 0 : Math.max(panelRect.top, 0)
  const panelBottom = panelRect === null ? viewportHeight : Math.min(panelRect.bottom, viewportHeight)
  const panelVisibleHeight = Math.max(0, panelBottom - panelTop)
  const callsHeightShare = callsRect === null || panelVisibleHeight === 0
    ? null
    : Math.round((callsRect.height / panelVisibleHeight) * 1000) / 1000

  const dockInsideViewport = dockRect === null
    ? null
    : dockRect.top >= 0 && dockRect.bottom <= viewportHeight

  return {
    // ── the four readings this page has always carried ──────────────────────────
    mounted: document.querySelector('[data-gw-progress]') !== null,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    noHorizontalScroll: document.documentElement.scrollWidth === document.documentElement.clientWidth,
    innerWidth: window.innerWidth,
    innerHeight: viewportHeight,
    devicePixelRatio: window.devicePixelRatio,
    current: count('[data-current="true"]'),
    nodeCalls: count('[data-gw-progress-node-calls]'),
    pnodes: count('[data-gw-progress-pnode]'),
    chip: textOf('[data-gw-progress-chip]'),
    line: textOf('[data-gw-progress-line]'),
    dock: textOf('[data-gw-progress-dock]'),

    // ── how the opened list is positioned, and where it is ──────────────────────
    callsSelectorMatched: callsNode === null ? null : callsNode.className,
    callsPosition: callsNode === null ? null : getComputedStyle(callsNode).position,
    callsRect,
    callsHeightShareOfPanel: callsHeightShare,
    panelVisibleHeight,

    // ── the sheet: present, holding the list, and how tall ─────────────────────
    narrowLayout: window.matchMedia('(max-width: 720px)').matches,
    sheetCount: count('[data-gw-progress-sheet]'),
    sheetRect,
    sheetHeight: sheetRect === null ? null : Math.round(sheetRect.height * 100) / 100,
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

    // ── the number the fix has to make zero ────────────────────────────────────
    cardSelector,
    cardCount: cards.length,
    overlapAreaTotal,
    overlappingCount: hits.length,
    overlaps: hits,

    // ── the dock must stay readable: measured, then measured again after scrolling ──
    dockRect,
    dockFillRect: fillRect,
    dockOverlapArea: overlapArea(callsRect, dockRect),
    dockFillOverlapArea: overlapArea(callsRect, fillRect),
    dockInsideViewport,
  }
}

/**
 * Three fixtures with known areas: what the real page reports is only worth as much as the
 * arithmetic behind it, and this is the arithmetic. Runs offline, no instance, no workflow.
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
      name: 'floating list over the card below it (the defect)',
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
  // One more: the height share and the dock's visibility, read off the last fixture.
  const share = await page.evaluate(READ)
  log('reference', JSON.stringify({
    panelVisibleHeight: share.panelVisibleHeight,
    callsHeightShareOfPanel: share.callsHeightShareOfPanel,
    dockInsideViewport: share.dockInsideViewport,
    dockFillOverlapArea: share.dockFillOverlapArea,
  }))
  await browser.close()
  log(failures === 0 ? 'self-test: all fixtures agree' : `self-test: ${failures} fixture(s) disagree`)
  process.exit(failures === 0 ? 0 : 1)
}

if (selfTesting) await SELF_TEST()

const record = async (page, key) => {
  const value = await page.evaluate(READ)
  readings[key] = value
  log(
    'reading', key,
    JSON.stringify({
      w: value.innerWidth,
      chip: value.chip,
      calls: value.nodeCalls,
      position: value.callsPosition,
      overlapAreaTotal: value.overlapAreaTotal,
      overlappingCount: value.overlappingCount,
      dockOverlap: value.dockOverlapArea,
      dockFillOverlap: value.dockFillOverlapArea,
      heightShare: value.callsHeightShareOfPanel,
      sw: value.scrollWidth,
      cw: value.clientWidth,
    }),
  )
  return value
}

const readings = {}
const browser = await chromium.launch({ executablePath: '/home/fish/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome' })
// A real mobile context, not a desktop window resized: these are the numbers a phone sees.
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
page.on('pageerror', (error) => pageErrors.push(String(error)))

await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(8000)

// At 390 the host's conversation tab strip offers 对话/轨迹 only; the plugin's 进度 view sits
// behind the strip's 更多会话视图 menu. Same path as the previous block's phone run.
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
  writeFileSync(`${outDir}/readings-phone.json`, JSON.stringify({ ...readings, unfinished: true }, null, 1))
  writeFileSync(`${outDir}/console-phone.json`, JSON.stringify({ consoleErrors, pageErrors }, null, 1))
  await browser.close()
  process.exit(1)
}

const interaction = { tabPath, tapped: {}, widths: {} }

/** The list must be closed before the next width is opened, or the reading measures nothing. */
const closeIfOpen = async () => {
  const open = await page.locator('[data-gw-progress-node-calls]').count()
  if (open === 0) return
  // Close the node that is actually open (the expanded control), not just any node.
  const expanded = page.locator('[data-gw-progress-pnode-open][aria-expanded="true"]').first()
  const body = await expanded.count() ? expanded : page.locator('[data-gw-progress-pnode-open]').first()
  if (await body.count()) await body.tap({ timeout: 5000 }).catch(async () => { await body.click({ timeout: 5000 }) })
  await page.waitForTimeout(600)
  log('closed the opened list; lists left:', await page.locator('[data-gw-progress-node-calls]').count())
}

for (const [width, height, shotName, dockShotName] of [
  [390, 844, 'phone-390-calls', 'phone-390-calls-dock'],
  [360, 800, 'phone-360-calls', 'phone-360-calls-dock'],
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
  await page.waitForTimeout(300)

  // A task node in the middle of the tree: neighbours above and below it, so an overlap is
  // something the picture can show and not only something the numbers claim.
  const openable = page.locator('[data-gw-progress-pnode][data-kind="task"]').filter({ has: page.locator('[data-gw-progress-pnode-open]') })
  const openableCount = await openable.count()
  if (openableCount === 0) {
    log('no openable task node at', width)
    interaction.widths[width] = { openableCount: 0 }
    continue
  }
  const index = Math.floor(openableCount / 2)
  const target = openable.nth(index)
  const nodeId = await target.getAttribute('data-gw-progress-pnode')
  const label = await target.getAttribute('aria-label')
  await target.scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)

  const body = target.locator('[data-gw-progress-pnode-open]').first()
  await body.tap({ timeout: 5000 }).catch(async () => { await body.click({ timeout: 5000 }) })
  await page.waitForTimeout(900)

  const listOpen = await page.locator('[data-gw-progress-node-calls]').count()
  interaction.tapped[width] = { nodeId, label, openableCount, index, listOpen }
  log('opened', nodeId, 'at', width, '| lists on screen:', listOpen)

  // What the app's own scroll leaves on screen when a node opens: recorded so the frame below
  // is not mistaken for the app's doing. On a narrow layout the sheet is drawn after the whole
  // tree, so it can sit below the fold even though the node that opened it is in view.
  const asOpened = await record(page, `${shotName}-as-opened`)
  interaction.widths[width] = {
    asOpenedSheetInViewport: asOpened.sheetRect === null
      ? null
      : asOpened.sheetRect.top >= 0 && asOpened.sheetRect.bottom <= asOpened.innerHeight,
    asOpenedOverlapAreaTotal: asOpened.overlapAreaTotal,
  }

  // The evidence frame has to contain the open list, or it proves nothing: centre the sheet,
  // so the cards above it are in the picture and the gap between them is visible.
  await page.evaluate(() => {
    const sheet = document.querySelector('[data-gw-progress-sheet]')
    if (sheet !== null) sheet.scrollIntoView({ block: 'center' })
  })
  await page.waitForTimeout(600)

  // Shot A: the moment the block asks for — a node's calls list is open at this width, and it
  // is in the frame together with the cards it must not touch.
  const openReading = await shot(shotName, shotName)
  interaction.widths[width] = {
    ...interaction.widths[width],
    openShot: shotName,
    openAt: openReading.at,
    overlapAreaTotal: openReading.overlapAreaTotal,
    overlaps: openReading.overlaps,
    dockOverlapArea: openReading.dockOverlapArea,
    dockFillOverlapArea: openReading.dockFillOverlapArea,
  }

  // Shot B: the dock, scrolled into view, with the list still open — proof the sheet did not
  // eat the thing a reader presses to hand the version in. Rectangles move with the scroll,
  // so the reading is retaken here rather than reused from shot A.
  await page.evaluate(() => {
    const dock = document.querySelector('[data-gw-progress-dock]')
    if (dock !== null) dock.scrollIntoView({ block: 'center' })
  })
  await page.waitForTimeout(700)
  const dockReading = await shot(dockShotName, dockShotName)
  interaction.widths[width].dockShot = dockShotName
  interaction.widths[width].dockAt = dockReading.at
  interaction.widths[width].dockOverlapAreaAfterScroll = dockReading.dockOverlapArea
  interaction.widths[width].dockFillOverlapAreaAfterScroll = dockReading.dockFillOverlapArea
  interaction.widths[width].dockInsideViewportAfterScroll = dockReading.dockInsideViewport
  interaction.widths[width].overlapAreaTotalAfterScroll = dockReading.overlapAreaTotal
  interaction.widths[width].listStillOpen = dockReading.nodeCalls

  // Second tap on the same node: the toggle must put both the sheet and the list away.
  // Measured, not assumed — this is the reading behind "after a second tap the drawer and the
  // list are both 0".
  await target.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await body.tap({ timeout: 5000 }).catch(async () => { await body.click({ timeout: 5000 }) })
  await page.waitForTimeout(800)
  const closedReading = await record(page, `${shotName}-closed`)
  interaction.widths[width].closed = {
    sheetCount: closedReading.sheetCount,
    nodeCalls: closedReading.nodeCalls,
    overlapAreaTotal: closedReading.overlapAreaTotal,
  }

  // The sheet's own 收起 button is the second entrance to the same toggle; at the first width
  // it is exercised too, so neither path is left unread.
  if (width === 390) {
    await body.tap({ timeout: 5000 }).catch(async () => { await body.click({ timeout: 5000 }) })
    await page.waitForTimeout(800)
    const reopened = await record(page, `${shotName}-reopened`)
    const hide = page.locator('[data-gw-progress-sheet-hide]').first()
    if (await hide.count()) {
      await hide.tap({ timeout: 5000 }).catch(async () => { await hide.click({ timeout: 5000 }) })
      await page.waitForTimeout(800)
    }
    const hidden = await record(page, `${shotName}-hidden-by-button`)
    interaction.widths[width].hideButton = {
      reopenedSheetCount: reopened.sheetCount,
      hideLabel: reopened.sheetHideLabel,
      afterHideSheetCount: hidden.sheetCount,
      afterHideNodeCalls: hidden.nodeCalls,
    }
  }
}

// The list closed again at the last width: nothing left behind that a second reader could
// mistake for the state under test.
const closedReading = await page.evaluate(READ).catch(() => null)
interaction.afterClosing = closedReading === null
  ? null
  : { nodeCalls: closedReading.nodeCalls, overlapAreaTotal: closedReading.overlapAreaTotal }

writeFileSync(`${SOAK}/readings-phone.json`, JSON.stringify(readings, null, 1))
writeFileSync(`${SOAK}/interaction-phone.json`, JSON.stringify(interaction, null, 1))
writeFileSync(`${outDir}/console-phone.json`, JSON.stringify({ consoleErrors, pageErrors }, null, 1))
log('INTERACTION', JSON.stringify(interaction, null, 1))
log('CONSOLE', JSON.stringify({ consoleErrors, pageErrors }))
await browser.close()
