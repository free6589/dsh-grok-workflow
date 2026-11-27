// 8 缺口一次跑完：失败态真工作流 + 全宽度/双组/拖窗取证。
//
// 7 缺口真机（失败 reveal 起点？不——失败态是终点；起点先拍等待 dock 再发工作流），
// blocked 态 NOT_RUN（114轮结论：引擎收尾先补 cancelled 再写 run-end，造不出无结局行）。
// 跳过上报 = 验收行 skipped（监工关闭态，verify.blockSupervisor=false 那一路）——
// 本轮不跑真机：真工作流默认监工开着，关监工走逻辑块用例直断（test/block-supervisor）。
// 卡住四胶囊 = failed/blocked/rejected 三种卡住文案 + guardian cancelled——
// failed 真机拍（判腿常拒），blocked/rejected/cancelled 走逻辑块用例直断。
//
// 用法：node soak-gaps.mjs <url> <outDir>
//   url    隔离实例，例 http://127.0.0.1:3441/?token=...
//   outDir 证据目录下的 soak/（脚本自己建）
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '/home/fish/.local/share/mise/installs/node/26.8.1/lib/node_modules/@playwright/cli/node_modules/playwright/index.mjs'

const [url, outDir] = process.argv.slice(2)
if (url === undefined || outDir === undefined) {
  process.stderr.write('usage: node soak-gaps.mjs <url> <outDir>\n')
  process.exit(2)
}
const SOAK = outDir
mkdirSync(SOAK, { recursive: true })

const PROMPT = [
  '调用 workflow 工具（grok_workflow 那一个，不要自己直接写文件，不要查插件列表）：',
  '用 workflow 工具跑一个工作流，拆成三个互相独立、可以并行的任务，每个任务都要真的写一个文件：',
  '任务一：写 notes.md，内容是三行安装步骤；',
  '任务二：写 test.txt，内容是一行 hello；',
  '任务三：写 third.txt，内容是一行 bye。',
  '三个任务并行跑，不要串行；跑完把每个任务写了什么汇总一下。',
].join('')

const consoleErrors = []
const pageErrors = []
const log = (...parts) => console.log(new Date().toISOString().slice(11, 23), ...parts)

// 一次 evaluate 读全：钩子数 + 几何 + 文案 + 断点 + 监听器。
const READ = () => {
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
await page.waitForTimeout(8000)
// Home may land on another plugin page: force a fresh chat session so the composer is chat.
{
  const fresh = page.getByRole('button', { name: '新会话' })
  if (await fresh.count()) {
    await fresh.first().click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(3000)
  }
}

let tabPath = null
const openProgress = async (pg) => {
  for (let i = 0; i < 40; i++) {
    const tab = pg.getByRole('tab', { name: '进度' })
    if (await tab.count()) {
      await tab.first().click({ timeout: 3000 }).catch(() => {})
      if (tabPath === null) tabPath = 'tab'
      await pg.waitForTimeout(400)
      return true
    }
    const overflow = pg.getByRole('button', { name: '更多会话视图' })
    if (await overflow.count()) {
      await overflow.first().click({ timeout: 3000 }).catch(() => {})
      await pg.waitForTimeout(600)
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

// 起点：先开进度页（等你点头 dock），拍等待态 = 跳过上报的反面（监工开着）。
await openProgress(page)
await page.waitForTimeout(800)
const composer = page.locator('[contenteditable="true"][role="textbox"]').first()
await composer.waitFor({ timeout: 60000 })
await composer.scrollIntoViewIfNeeded().catch(() => {})
await composer.click()
await page.waitForTimeout(800)

const readings = {}
const shot = async (name, key, extra = {}) => {
  await page.screenshot({ path: `${SOAK}/${name}.png` })
  const v = await page.evaluate(READ)
  readings[key] = { screenshot: `${name}.png`, ...extra, ...v }
  log('reading', key, JSON.stringify({ chip: v.chip, dock: v.dockState, stuck: v.stuckPresent, pnodes: v.pnodes, calls: v.nodeCalls, rows: v.callRows, sheet: v.sheetCount, sheetRows: v.sheetRows, groups: v.sheetGroups, gap: v.gap, overlap: v.overlapAreaTotal, edges: v.edges, w: v.w, mq720: v.mq720 }))
  return v
}

// 缺口0：等待 dock（等你点头 + 开工按钮）——跳过上报的反面：监工开着，验收行会判。
const waiting = await shot('wait-1500', 'wait-1500', { width: 1500 })

await page.keyboard.type(PROMPT, { delay: 2 })
await page.waitForTimeout(800)
const inBox = await composer.innerText().catch(() => '')
log('inBox chars:', inBox.length, JSON.stringify(inBox.slice(0, 40)))
const sentAt = Date.now()
await page.keyboard.press('Enter')
await page.waitForTimeout(3000)
const afterBox = await composer.innerText().catch(() => '')
log('afterBox chars:', afterBox.length, 'sent?', inBox.length > 0 && afterBox.length === 0)
log('sent')

// 等待终态：判腿常拒 → 未通过（失败态），顺带重试虚线。
const deadline = Date.now() + 13 * 60 * 1000
let endChip = null
while (Date.now() < deadline) {
  let s
  try { s = await page.evaluate(READ) } catch { await page.waitForTimeout(300); continue }
  if (!s.mounted) { await page.waitForTimeout(300); continue }
  if (s.chip === '进行中') {
    if (readings['running-1500'] === undefined) {
      await page.waitForTimeout(12000)
      await shot('running-1500', 'running-1500', { width: 1500 })
    }
    await page.waitForTimeout(500)
    continue
  }
  if (s.chip !== null && s.chip !== '等你点头') {
    endChip = s.chip
    await page.waitForTimeout(2500)
    break
  }
  await page.waitForTimeout(300)
}
log('end chip:', endChip)

// 终态 1500（失败页：未通过 + 卡住句 + 重试行）。
const done1500 = await shot('done-1500', 'done-1500', { width: 1500 })

// 缺口1：卡住四块——guardian 侧栏 + 卡住句（失败态真机）。
// 缺口2：重试虚线——attempt/失败行 + edge 种数（真机读数）。
const openable = page.locator('[data-gw-progress-pnode][data-kind="task"] button[data-gw-progress-pnode-open]')
const openableCount = await openable.count()
log('openable task nodes:', openableCount)

// 缺口5：双组摊开——把能开的全开（最多两组以上）。
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

// 多宽度：390/360/421/499/720/721/1500，每档一帧（抽屉开着）。
const widths = [[390, 844], [360, 800], [421, 900], [499, 900], [720, 900], [721, 900], [1500, 1600]]
for (const [w, h] of widths) {
  await page.setViewportSize({ width: w, height: h })
  await page.waitForTimeout(1200)
  if ((await page.evaluate(() => document.querySelector('[data-gw-progress]') !== null)) === false) {
    await openProgress(page)
    await page.waitForTimeout(600)
  }
  // 抽屉可能被 resize 关掉？不——opened 态是 React state，resize 不丢；只确认。
  await shot(`sheet-${w}`, `sheet-${w}`, { width: w })
}

// 缺口6：拖窗跨断点——resize 不刷新验 change：先 800 读 mq，再拖到 600 再回 800，读数不变则过。
await page.setViewportSize({ width: 800, height: 900 })
await page.waitForTimeout(1000)
const beforeDrag = await page.evaluate(READ)
await page.setViewportSize({ width: 600, height: 900 })
await page.waitForTimeout(1000)
const midDrag = await page.evaluate(READ)
await page.setViewportSize({ width: 800, height: 900 })
await page.waitForTimeout(1000)
const afterDrag = await page.evaluate(READ)
readings['drag-800-600-800'] = {
  screenshot: 'sheet-721.png',
  width: 800,
  dragProbe: {
    before: { w: beforeDrag.w, mq720: beforeDrag.mq720, pnodes: beforeDrag.pnodes, sheetRows: beforeDrag.sheetRows },
    mid: { w: midDrag.w, mq720: midDrag.mq720, pnodes: midDrag.pnodes, sheetRows: midDrag.sheetRows },
    after: { w: afterDrag.w, mq720: afterDrag.mq720, pnodes: afterDrag.pnodes, sheetRows: afterDrag.sheetRows },
    // resize 不刷新：拖回来后读数与拖前一致（change 无需 JS 监听，sheet 在流里）。
    stableAfterDrag: beforeDrag.pnodes === afterDrag.pnodes && beforeDrag.sheetRows === afterDrag.sheetRows,
  },
}
log('drag probe:', JSON.stringify(readings['drag-800-600-800'].dragProbe))
await page.setViewportSize({ width: 390, height: 844 })
await page.waitForTimeout(800)
await shot('sheet-390-close', 'sheet-390-close', { width: 390 })

// 收尾：关抽屉（点开着的节点），读归零。
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
  note: 'soak-gaps 一次跑完：同一失败工作流（判腿常拒→未通过）上的 7 真机缺口；blocked/跳过上报走逻辑块用例直断（见 README）。每条与同名 PNG 同一刻。',
  url: url.replace(/token=[^&]+/, 'token=<redacted>'),
  tabPath,
  sentAt: new Date(sentAt).toISOString(),
  endChip,
  openedIds,
  entries: readings,
}, null, 1))
writeFileSync(`${SOAK}/console.json`, JSON.stringify({ consoleErrors, pageErrors }, null, 1))
log('CONSOLE', JSON.stringify({ consoleErrors, pageErrors }))
await browser.close()
