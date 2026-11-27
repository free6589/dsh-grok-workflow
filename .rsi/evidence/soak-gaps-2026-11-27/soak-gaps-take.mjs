// soak-gaps 第二阶段：run 已结束，直接取证。不发新 prompt。
// 用法：node soak-gaps-take.mjs <url> <outDir> <sessionMatch>
//   sessionMatch: 会话标题片段，用于在侧边栏点到对的会话
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { chromium } from '/home/fish/.local/share/mise/installs/node/26.8.1/lib/node_modules/@playwright/cli/node_modules/playwright/index.mjs'

const [url, outDir, sessionMatch] = process.argv.slice(2)
if (url === undefined || outDir === undefined) {
  process.stderr.write('usage: node soak-gaps-take.mjs <url> <outDir> [sessionMatch]\n')
  process.exit(2)
}
const SOAK = outDir
mkdirSync(SOAK, { recursive: true })

const consoleErrors = []
const pageErrors = []
const log = (...parts) => console.log(new Date().toISOString().slice(11, 23), ...parts)

const READ_FN = () => {
  const count = (s) => document.querySelectorAll(s).length
  const textOf = (s) => {
    const n = document.querySelector(s)
    return n === null ? null : n.innerText.trim()
  }
  const attrOf = (s, a) => {
    const n = document.querySelector(s)
    return n === null ? null : n.getAttribute(a)
  }
  const rectOf = (node) => {
    if (node === null || node === undefined) return null
    const b = node.getBoundingClientRect()
    return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }
  }
  const overlapArea = (a, b) => {
    if (a === null || b === null) return 0
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
    return w > 0 && h > 0 ? Math.round(w * h * 100) / 100 : 0
  }
  const round = (v) => Math.round(v * 100) / 100
  const cards = [...document.querySelectorAll('[data-gw-progress-pnode]')].map((card) => ({
    id: card.getAttribute('data-gw-progress-pnode'),
    kind: card.getAttribute('data-kind'),
    rect: rectOf(card),
  }))
  const sheetNode = document.querySelector('[data-gw-progress-sheet]')
  const sheetRect = rectOf(sheetNode)
  const dockNode = document.querySelector('[data-gw-progress-dock]')
  const dockRect = rectOf(dockNode)
  const fillNode = document.querySelector('[data-gw-progress-dock-fill]')
  const roomNode = document.querySelector('.gw-progress-sheet-room')
  const composer = (() => {
    const at = document.elementFromPoint(Math.floor(window.innerWidth / 2), window.innerHeight - 6)
    if (at === null) return null
    let node = at
    let pinned = null
    while (node !== null && node !== document.documentElement) {
      const p = getComputedStyle(node).position
      if (p === 'fixed' || p === 'sticky') { pinned = node; break }
      node = node.parentElement
    }
    const t = pinned ?? at
    const b = t.getBoundingClientRect()
    return { pinned: pinned !== null, top: round(b.top), height: round(b.height) }
  })()
  // matchMedia change 监听：源码已删监听（只剩 CSS 断点）——读一次 listeners 证明无 JS 断点态。
  // 页面无直接钩子，这里读 resize 监听数做旁证（面板自带一个 window resize draw）。
  const sheet = sheetNode
  // guardian 四块
  const gblocks = [...document.querySelectorAll('[data-gw-progress-guardian-block]')].map((n) => ({
    name: n.getAttribute('data-gw-progress-guardian-block'),
    text: n.innerText.trim().slice(0, 80),
  }))
  return {
    mounted: document.querySelector('[data-gw-progress]') !== null,
    w: window.innerWidth,
    chip: textOf('[data-gw-progress-chip]'),
    chipState: attrOf('[data-gw-progress-chip]', 'data-state'),
    line: textOf('[data-gw-progress-line]'),
    dock: textOf('[data-gw-progress-dock]'),
    dockState: attrOf('[data-gw-progress-dock]', 'data-state'),
    dockBtn: textOf('[data-gw-progress-dock-fill]'),
    dockFillCount: count('[data-gw-progress-dock-fill]'),
    filledLine: textOf('[data-gw-progress-filled]'),
    stuck: textOf('[data-gw-progress-stuck]'),
    stuckPresent: document.querySelector('[data-gw-progress-stuck]') !== null,
    guardianPresent: document.querySelector('[data-gw-progress-guardian]') !== null,
    guardianState: attrOf('[data-gw-progress-guardian]', 'data-state'),
    guardianBlocks: gblocks,
    pnodes: count('[data-gw-progress-pnode]'),
    cards: cards.map((c) => ({ id: c.id, kind: c.kind })),
    nodeCalls: count('[data-gw-progress-node-calls]'),
    callRows: count('[data-gw-progress-node-calls] [data-gw-progress-log-row]'),
    traceActive: count('[data-trace="active"]'),
    traceDim: count('[data-trace="dim"]'),
    sheetCount: count('[data-gw-progress-sheet]'),
    sheetRect,
    sheetRows: count('[data-gw-progress-sheet] [data-gw-progress-log-row]'),
    sheetGroups: count('[data-gw-progress-sheet] .gw-progress-sheet-group'),
    sheetTitle: sheet === null ? null : (sheet.innerText.split('\n')[0] ?? '').trim(),
    roomPresent: roomNode !== null,
    roomHeight: roomNode === null ? null : round(roomNode.getBoundingClientRect().height),
    composerTop: composer === null ? null : composer.top,
    sheetBottom: sheetRect === null ? null : round(sheetRect.bottom),
    gap: sheetRect === null || composer === null ? null : round(composer.top - sheetRect.bottom),
    aboveComposer: sheetRect === null || composer === null ? null : sheetRect.bottom <= composer.top,
    inViewport: sheetRect === null ? null : (sheetRect.top >= 0 && sheetRect.bottom <= window.innerHeight),
    overlapAreaTotal: sheetRect === null ? null : round(cards.reduce((s, c) => s + overlapArea(sheetRect, c.rect), 0)),
    dockOverlap: overlapArea(sheetRect, dockRect),
    mq720: window.matchMedia('(max-width: 720px)').matches,
    mq480: window.matchMedia('(max-width: 480px)').matches,
    mq721: window.matchMedia('(min-width: 721px)').matches,
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
    noHS: document.documentElement.scrollWidth === document.documentElement.clientWidth,
    // 重试虚线：attempt 节点 + 失败行（真机失败态才有）
    edges: count('[data-gw-progress-edge]'),
    edgeKinds: [...document.querySelectorAll('[data-gw-progress-edge]')].map((e) => e.getAttribute('data-kind')).join(','),
    attemptDots: count('[data-gw-progress-pnode-attempt], [data-gw-progress-pnode-retry]'),
    failedRows: [...document.querySelectorAll('[data-gw-progress-log-row]')].filter((r) => /没过|失败|fail/i.test(r.innerText)).length,
  }
}


const browser = await chromium.launch({ executablePath: '/home/fish/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome' })
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1600 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`main: ${m.text()}`) })
page.on('pageerror', (e) => pageErrors.push(`main: ${String(e)}`))

await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(10000)

// 点到对的会话
if (sessionMatch) {
  const entry = page.getByText(sessionMatch).first()
  const n = await entry.count()
  log('session entry:', n)
  if (n) { await entry.click({ timeout: 5000 }).catch(() => {}) ; await page.waitForTimeout(8000) }
}

// 开进度页：顶栏 … 按钮（对话/轨迹右边的更多）
let tabPath = null
const openProgress = async (pg) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const tab = pg.getByRole('tab', { name: '进度' })
    if (await tab.count()) {
      await tab.first().click({ timeout: 3000 }).catch(() => {})
      if (tabPath === null) tabPath = 'tab'
      await pg.waitForTimeout(600)
      return true
    }
    const overflow = pg.getByRole('button', { name: '更多会话视图' })
    if (await overflow.count()) {
      await overflow.first().click({ timeout: 3000 }).catch(() => {})
      await pg.waitForTimeout(800)
      const item = pg.getByRole('menuitem', { name: /进度/ })
      const loose = (await item.count()) ? item : pg.getByText('进度', { exact: true })
      if (await loose.count()) {
        await loose.first().click({ timeout: 3000 }).catch(() => {})
        if (tabPath === null) tabPath = 'overflow-menu'
        await pg.waitForTimeout(600)
        return true
      }
      await pg.keyboard.press('Escape').catch(() => {})
    }
    await pg.waitForTimeout(400)
  }
  return false
}
// 窄屏进会话：先开侧边栏
const enterSessionNarrow = async (pg) => {
  const toggle = pg.getByRole('button', { name: '打开侧边栏' })
  if (await toggle.count()) {
    await toggle.first().click({ timeout: 5000 }).catch(() => {})
    await pg.waitForTimeout(1500)
  }
}
const readings = {}
const shot = async (name, key, extra = {}) => {
  await openProgress(page)
  await page.waitForTimeout(1500)
  // 进度内容滚到顶再截（窄屏内容区可滚）
  await page.evaluate(() => { document.scrollingElement ? (document.scrollingElement.scrollTop = 0) : null; [...document.querySelectorAll('*')].forEach((n) => { if (n.scrollHeight > n.clientHeight + 4) { try { n.scrollTop = 0 } catch {} } }) })
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${SOAK}/${name}.png` })
  const v = await page.evaluate(READ_FN)
  readings[key] = { screenshot: `${name}.png`, ...extra, ...v }
  log('reading', key, JSON.stringify({ chip: v.chip, dock: v.dockState, stuck: v.stuck, pnodes: v.pnodes, calls: v.nodeCalls, rows: v.callRows, sheet: v.sheetCount, sheetRows: v.sheetRows, groups: v.sheetGroups, gap: v.gap, overlap: v.overlapAreaTotal, edges: v.edges, w: v.w, mq720: v.mq720 }))
  return v
}

const opened = await openProgress(page)
log('progress opened:', opened, 'via', tabPath)

// 终态 1500（失败页）
const done1500 = await shot('done-1500', 'done-1500', { width: 1500 })

// 双组摊开
const openable = page.locator('[data-gw-progress-pnode][data-kind="task"] button[data-gw-progress-pnode-open]')
const openableCount = await openable.count()
log('openable task nodes:', openableCount)
const openedIds = []
for (let i = 0; i < openableCount; i++) {
  const btn = openable.nth(i)
  const id = await btn.getAttribute('data-gw-progress-pnode-open')
  await btn.scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(300)
  await btn.click({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(700)
  openedIds.push(id)
}
log('opened all:', JSON.stringify(openedIds))
const both1500 = await shot('both-1500', 'both-1500', { width: 1500, opened: openedIds })

// 多宽度：窄屏每次先进会话（侧边栏）再开进度（overflow 菜单）
for (const [w, h] of [[390, 844], [360, 800], [421, 900], [499, 900], [720, 900], [721, 900], [1500, 1600]]) {
  await page.setViewportSize({ width: w, height: h })
  await page.waitForTimeout(1500)
  if (w <= 721) await enterSessionNarrow(page)
  const entry = page.getByText('调用 workflow 工具').first()
  if (await entry.count()) {
    await entry.click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(2500)
  }
  await openProgress(page)
  await page.waitForTimeout(800)
  await shot(`sheet-${w}`, `sheet-${w}`, { width: w })
}
// 拖窗跨断点
await page.setViewportSize({ width: 800, height: 900 })
await page.waitForTimeout(1000)
const beforeDrag = await page.evaluate(READ_FN)
await page.setViewportSize({ width: 600, height: 900 })
await page.waitForTimeout(1000)
const midDrag = await page.evaluate(READ_FN)
await page.setViewportSize({ width: 800, height: 900 })
await page.waitForTimeout(1000)
const afterDrag = await page.evaluate(READ_FN)
readings['drag-800-600-800'] = {
  screenshot: 'sheet-721.png',
  width: 800,
  dragProbe: {
    before: { w: beforeDrag.w, mq720: beforeDrag.mq720, pnodes: beforeDrag.pnodes, sheetRows: beforeDrag.sheetRows },
    mid: { w: midDrag.w, mq720: midDrag.mq720, pnodes: midDrag.pnodes, sheetRows: midDrag.sheetRows },
    after: { w: afterDrag.w, mq720: afterDrag.mq720, pnodes: afterDrag.pnodes, sheetRows: afterDrag.sheetRows },
    stableAfterDrag: beforeDrag.pnodes === afterDrag.pnodes && beforeDrag.sheetRows === afterDrag.sheetRows,
  },
}
log('drag probe:', JSON.stringify(readings['drag-800-600-800'].dragProbe))
await page.setViewportSize({ width: 390, height: 844 })
await page.waitForTimeout(800)

// 关抽屉
for (let i = 0; i < openableCount; i++) {
  const btn = openable.nth(i)
  const expanded = await btn.getAttribute('aria-expanded')
  if (expanded === 'true') {
    await btn.scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(300)
    await btn.click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(600)
  }
}
await shot('closed-390', 'closed-390', { width: 390 })

writeFileSync(`${SOAK}/readings.json`, JSON.stringify({
  note: 'soak-gaps 取证：失败工作流（判腿常拒401，run-end error）上的 7 真机缺口；blocked/跳过上报走逻辑块用例直断。',
  url: url.replace(/token=[^&]+/, 'token=<redacted>'),
  tabPath,
  openedIds,
  entries: readings,
}, null, 1))
writeFileSync(`${SOAK}/console.json`, JSON.stringify({ consoleErrors, pageErrors }, null, 1))
log('CONSOLE', JSON.stringify({ consoleErrors, pageErrors }))
await browser.close()
