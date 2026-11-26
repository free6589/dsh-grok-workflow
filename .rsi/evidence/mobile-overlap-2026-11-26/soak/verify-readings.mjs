// Re-checks every claim the README makes about round 2 (commit 5ba1ca2) against the readings.
// Run from the evidence directory: node soak/verify-readings.mjs
import { readFileSync } from 'node:fs'

const readings = JSON.parse(readFileSync(new URL('./readings.json', import.meta.url), 'utf8'))
const interaction = JSON.parse(readFileSync(new URL('./interaction.json', import.meta.url), 'utf8'))
const checks = []
const add = (name, ok, got) => checks.push({ name, ok, got })
const near = (a, b, tolerance = 0.5) => Math.abs(a - b) <= tolerance

for (const width of [390, 360]) {
  const prefix = `phone-${width}`
  const open = readings[`${prefix}-as-opened`]
  const dock = readings[`${prefix}-calls-dock`]
  const bottom = readings[`${prefix}-bottom`]
  const closed = readings[`${prefix}-closed`]
  const tapped = interaction.tapped[prefix]

  // ── 1. visible the instant it opens, with no helping scroll ────────────────
  add(`${width} · 抽屉完全在视口内（点完当下）`, open.sheetFullyInViewport === true, open.sheetFullyInViewport)
  add(`${width} · 抽屉底线在输入框上沿之上`, open.sheetAboveComposer === true, [open.sheetRect.bottom, open.composerTop])
  add(`${width} · 两者之间的余量 = ${tapped.gapToComposer}`,
    open.sheetToComposerGap === tapped.gapToComposer && open.sheetToComposerGap > 0,
    open.sheetToComposerGap)
  add(`${width} · 输入框上沿是探针找到的固定栏（不是硬编码选择器）`,
    open.composer !== null && open.composer.foundPinnedAncestor === true,
    open.composer === null ? null : [open.composer.position, open.composer.tag, open.composer.height])

  // ── 2. the round-1 numbers, unchanged ─────────────────────────────────────
  add(`${width} · 与每张节点卡相交面积 = 0（摊开）`, open.overlapAreaTotal === 0 && open.overlaps.length === 0, open.overlapAreaTotal)
  add(`${width} · 与每张节点卡相交面积 = 0（dock 帧）`, dock.overlapAreaTotal === 0, dock.overlapAreaTotal)
  add(`${width} · 抽屉存在、列表在抽屉里、列表不在图里`,
    open.sheetCount === 1 && open.callsInsideSheet === true && open.callsInsideGraph === false,
    [open.sheetCount, open.callsInsideSheet, open.callsInsideGraph])
  add(`${width} · 再点一次：抽屉、列表、占位都归零`,
    closed.sheetCount === 0 && closed.nodeCalls === 0 && closed.roomPresent === false,
    [closed.sheetCount, closed.nodeCalls, closed.roomPresent])
  add(`${width} · scrollWidth = clientWidth = 视口宽`,
    open.scrollWidth === open.clientWidth && open.clientWidth === width, [open.scrollWidth, open.clientWidth])
  add(`${width} · 与 dock / dock-fill 相交面积 = 0（两个时刻）`,
    open.dockOverlapArea === 0 && open.dockFillOverlapArea === 0 && dock.dockOverlapArea === 0 && dock.dockFillOverlapArea === 0,
    [open.dockOverlapArea, open.dockFillOverlapArea, dock.dockOverlapArea, dock.dockFillOverlapArea])
  add(`${width} · dock 在 dock 帧里完整可见`, dock.dockInsideViewport === true, dock.dockInsideViewport)

  // ── 3. the room: after the dock, silent, only while open, and it moves nothing ──
  add(`${width} · 占位在 dock 之后（DOM 顺序）`, open.roomAfterDock === true, open.roomAfterDock)
  add(`${width} · 占位 aria-hidden`, open.roomAriaHidden === 'true', open.roomAriaHidden)
  add(`${width} · 占位几何上紧跟 dock 之后（${open.roomStartsAfterDockBy} px）`,
    open.roomStartsAfterDockBy !== null && open.roomStartsAfterDockBy >= 0, open.roomStartsAfterDockBy)
  add(`${width} · 占位高度 = 35vh（${open.roomHeight}）`,
    near(open.roomHeightShareOfViewport, 0.35, 0.005), open.roomHeightShareOfViewport)
  add(`${width} · 拿掉占位，dock 一像素都不动（决定性实验）`,
    tapped.roomRemovalProbe !== null && tapped.roomRemovalProbe.delta === 0,
    tapped.roomRemovalProbe)

  // ── 4. the bottom frame is the bottom, and under the dock is empty room ────
  add(`${width} · 底部那张图确实滚到底了（滚动容器 atBottom）`,
    bottom.scroller !== null && bottom.scroller.atBottom === true,
    bottom.scroller === null ? null : [bottom.scroller.scrollTop, bottom.scroller.scrollHeight, bottom.scroller.clientHeight])
  add(`${width} · 滚动发生在面板内部，页面本身没滚`, bottom.scrollY === 0, bottom.scrollY)
  add(`${width} · 到底时 dock 与占位都在画面里，占位在 dock 之后`,
    bottom.dockRect !== null && bottom.roomRect !== null && bottom.roomRect.top >= bottom.dockRect.bottom,
    [bottom.dockRect === null ? null : bottom.dockRect.bottom, bottom.roomRect === null ? null : bottom.roomRect.top])
}

const failed = checks.filter((check) => !check.ok)
for (const check of checks) console.log(check.ok ? 'ok  ' : 'FAIL', check.name, JSON.stringify(check.got))
console.log(failed.length === 0 ? `ALL ${checks.length} CHECKS PASS` : `${failed.length} of ${checks.length} FAILED`)
process.exit(failed.length === 0 ? 0 : 1)
