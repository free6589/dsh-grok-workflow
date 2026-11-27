// 自检：readings.json 键数 + PNG 数 + console 零错 + 关键字段不断言样式只断存在性
import { readFileSync, existsSync } from 'node:fs'
const dir = new URL('.', import.meta.url).pathname
const r = JSON.parse(readFileSync(dir + 'readings.json', 'utf8'))
const c = JSON.parse(readFileSync(dir + 'console.json', 'utf8'))
const fail = (m) => { console.error('FAIL:', m); process.exit(1) }
const keys = Object.keys(r.entries ?? {})
const need = ['done-1500', 'both-1500', 'sheet-390', 'sheet-360', 'sheet-421', 'sheet-499', 'sheet-720', 'sheet-721', 'sheet-1500', 'drag-800-600-800', 'closed-390']
for (const k of need) if (!keys.includes(k)) fail('missing key ' + k)
console.log('keys:', keys.length)
for (const k of keys) {
  if (k === 'drag-800-600-800') continue
  if (!existsSync(dir + r.entries[k].screenshot)) fail('missing png ' + k)
}
console.log('png: 10')
if ((c.consoleErrors ?? []).length !== 0) fail('consoleErrors non-empty')
if ((c.pageErrors ?? []).length !== 0) fail('pageErrors non-empty')
console.log('consoleErrors: 0')
const d = r.entries['done-1500']
if (d.chip !== '未通过') fail('done chip')
if (d.pnodes !== 32) fail('pnodes')
if (!d.stuckPresent) fail('stuck')
if (!d.guardianPresent) fail('guardian')
const b = r.entries['both-1500']
if (b.sheetRows !== 24 || b.sheetGroups !== 3) fail('drawer rows/groups')
if (JSON.stringify(r.openedIds) !== JSON.stringify(['t1', 't2', 't3'])) fail('openedIds')
const g = (k, f) => r.entries[k][f]
if (!g('sheet-720', 'mq720')) fail('720 mq')
if (!g('sheet-721', 'mq721')) fail('721 mq')
if (!g('sheet-390', 'mq720')) fail('390 mq')
if (!r.entries['drag-800-600-800'].dragProbe.stableAfterDrag) fail('drag stable')
if (r.entries['closed-390'].sheetRows !== 0) fail('closed rows')
console.log('ALL CHECKS PASSED')
