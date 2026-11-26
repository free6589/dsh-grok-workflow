// Re-checks every claim the README makes about the four hard criteria against the readings.
// Run from the evidence directory: node soak/verify-readings.mjs
import { readFileSync } from 'node:fs'

const readings = JSON.parse(readFileSync(new URL('./readings.json', import.meta.url), 'utf8'))
const checks = []
const add = (name, ok, got) => checks.push({ name, ok, got })

for (const width of [390, 360]) {
  const open = readings[`phone-${width}-calls`]
  const dock = readings[`phone-${width}-calls-dock`]
  const closed = readings[`phone-${width}-calls-closed`]
  const asOpened = readings[`phone-${width}-calls-as-opened`]

  add(`${width} · 列表与节点卡相交面积 = 0（摊开那一刻）`, open.overlapAreaTotal === 0 && open.overlaps.length === 0, open.overlapAreaTotal)
  add(`${width} · 列表与节点卡相交面积 = 0（滚到 dock 那一刻）`, dock.overlapAreaTotal === 0, dock.overlapAreaTotal)
  add(`${width} · 抽屉存在、列表在抽屉里、列表不在图里`,
    open.sheetCount === 1 && open.callsInsideSheet === true && open.callsInsideGraph === false,
    [open.sheetCount, open.callsInsideSheet, open.callsInsideGraph])
  add(`${width} · 点第二次之后抽屉与列表都为 0`, closed.sheetCount === 0 && closed.nodeCalls === 0, [closed.sheetCount, closed.nodeCalls])
  add(`${width} · scrollWidth = clientWidth = 视口宽`, open.scrollWidth === open.clientWidth && open.clientWidth === width, [open.scrollWidth, open.clientWidth])
  add(`${width} · 列表与 dock / dock-fill 相交面积 = 0（两个时刻）`,
    open.dockOverlapArea === 0 && open.dockFillOverlapArea === 0 && dock.dockOverlapArea === 0 && dock.dockFillOverlapArea === 0,
    [open.dockOverlapArea, open.dockFillOverlapArea, dock.dockOverlapArea, dock.dockFillOverlapArea])
  add(`${width} · dock 在滚过去那一帧里完整可见`, dock.dockInsideViewport === true, dock.dockInsideViewport)
  add(`${width} · 抽屉高 105 px / 上限 240 px / overflow auto`,
    open.sheetHeight === 105 && open.sheetMaxHeight === '240px' && open.sheetOverflowY === 'auto',
    [open.sheetHeight, open.sheetMaxHeight, open.sheetOverflowY])
  add(`${width} · 抽屉下沿与 dock 之间 168 px`,
    Math.abs((dock.dockRect.top - dock.sheetRect.bottom) - 168) < 0.5, dock.dockRect.top - dock.sheetRect.bottom)
  add(`${width} · 点开即读：抽屉贴着视口底边（§9.1 的观察）`,
    Math.abs(asOpened.sheetRect.bottom - asOpened.innerHeight) < 0.5, [asOpened.sheetRect.bottom, asOpened.innerHeight])
}

add('390 · 「收起」按钮把抽屉与列表都归零',
  readings['phone-390-calls-reopened'].sheetCount === 1 &&
  readings['phone-390-calls-hidden-by-button'].sheetCount === 0 &&
  readings['phone-390-calls-hidden-by-button'].nodeCalls === 0,
  [readings['phone-390-calls-reopened'].sheetCount, readings['phone-390-calls-hidden-by-button'].sheetCount])

const failed = checks.filter((check) => !check.ok)
for (const check of checks) console.log(check.ok ? 'ok  ' : 'FAIL', check.name, JSON.stringify(check.got))
console.log(failed.length === 0 ? `ALL ${checks.length} CHECKS PASS` : `${failed.length} of ${checks.length} FAILED`)
process.exit(failed.length === 0 ? 0 : 1)
