// Assert the progress tab's *laid out* geometry across scenarios and widths.
//
// The page runs the real client bundle in Chromium; this script reads back the
// measured boxes (`data-diag`) and checks the invariants that the UI defect
// violated. Usage: node check.mjs <page.html> [label]
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const page = process.argv[2] ?? join(here, 'page.html')
const label = process.argv[3] ?? 'candidate'
const chrome = join(homedir(), '.cache/ms-playwright/chromium-1248/chrome-linux64/chrome')

const cases = []
for (const scenario of ['empty', 'loading', 'running', 'done', 'failed', 'longtext']) {
  for (const width of [1440, 1200, 900, 760, 600, 520, 480, 390]) cases.push({ scenario, width, click: scenario === 'running' && width === 900 })
}

function diagOf(url, width, height) {
  const dom = execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    `--user-data-dir=${join(here, 'udd')}`,
    `--window-size=${width},${height}`,
    '--virtual-time-budget=2500', '--dump-dom', url,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const match = /<pre id="diag"[^>]*>([\s\S]*?)<\/pre>/.exec(dom)
  if (match === null) return { error: 'no diagnostics rendered (page threw)' }
  const text = match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  return JSON.parse(text)
}

const failures = []
const rows = []
for (const testCase of cases) {
  const resolvedPage = page.startsWith('/') ? page : join(here, page)
  const url = `file://${resolvedPage}?scenario=${testCase.scenario}&w=${testCase.width}${testCase.click ? '&click=0' : ''}`
  const diag = diagOf(url, testCase.width, 900)
  const problems = []
  if (diag.error !== undefined) problems.push(diag.error)
  else {
    if (diag.root === undefined) problems.push('no .gw-progress root')
    if (diag.track !== undefined && diag.track.overflowX) problems.push(`track overflows horizontally (${diag.track.scrollWidth} > ${diag.track.clientWidth})`)
    if (diag.scenario !== 'empty' && (diag.segments ?? []).length === 0) problems.push('no segments rendered')
    for (const segment of diag.segments ?? []) {
      if (segment.labelW < 1 && segment.labelFull > 0) problems.push(`segment ${segment.key}: label collapsed to ${segment.labelW}px`)
      if (segment.headW < 1) problems.push(`segment ${segment.key}: head collapsed to ${segment.headW}px`)
      if (segment.ring === null) problems.push(`segment ${segment.key}: no ring`)
      else if (segment.ring.w < 20 || segment.ring.h < 20) problems.push(`segment ${segment.key}: ring is ${segment.ring.w}x${segment.ring.h}`)
      else if (segment.ring.borderTopWidth === '0px') problems.push(`segment ${segment.key}: ring has no border (state colour invisible)`)
    }
    const segments = diag.segments ?? []
    for (let index = 1; index < segments.length; index += 1) {
      const previous = segments[index - 1]
      if (previous.box.x + previous.box.w > segments[index].box.x + 1) {
        problems.push(`segments overlap: ${previous.key} ends at ${previous.box.x + previous.box.w}, ${segments[index].key} starts at ${segments[index].box.x}`)
      }
    }
    if (diag.root !== undefined) {
      for (const segment of segments) {
        if (segment.box.x + segment.box.w > diag.root.x + diag.root.w + 1) problems.push(`segment ${segment.key} overflows the root`)
      }
    }
    if ((diag.overflowRight ?? []).length > 0) problems.push(`elements overflow the right edge: ${JSON.stringify(diag.overflowRight)}`)
    for (const branch of diag.branches ?? []) {
      if (branch.box.w < 1 || branch.box.h < 1) problems.push(`branch ${branch.key} collapsed to ${branch.box.w}x${branch.box.h}`)
      if (diag.root !== undefined && branch.box.w > diag.root.w) problems.push(`branch ${branch.key} is wider than the root`)
    }
    for (const detail of diag.detail ?? []) if (detail.overflowing) problems.push('detail pane overflows horizontally')
  }
  rows.push({
    case: `${testCase.scenario}@${testCase.width}${testCase.click ? '+detail' : ''}`,
    segments: diag.segments?.length ?? 0,
    minSegment: diag.segments?.length ? Math.min(...diag.segments.map((s) => s.box.w)) : 0,
    minLabel: diag.segments?.length ? Math.min(...diag.segments.map((s) => s.labelW)) : 0,
    rings: diag.segments?.length ? `${diag.segments.filter((s) => s.ring !== null && s.ring.w >= 20).length}/${diag.segments.length}` : '0/0',
    branches: (diag.branches ?? []).map((b) => `${b.box.w}x${b.box.h}`).join(',') || '-',
    status: problems.length === 0 ? 'PASS' : 'FAIL',
  })
  for (const problem of problems) failures.push(`${testCase.scenario}@${testCase.width}${testCase.click ? '+detail' : ''}: ${problem}`)
}

console.log(`# geometry check — ${label} (${page})`)
console.table(rows)
if (failures.length === 0) console.log(`RESULT: PASS (${cases.length} cases, 0 problems)`)
else {
  console.log(`RESULT: FAIL (${failures.length} problems in ${new Set(failures.map((f) => f.split(':')[0])).size} cases)`)
  for (const failure of failures) console.log(`- ${failure}`)
}
process.exitCode = failures.length === 0 ? 0 : 1
