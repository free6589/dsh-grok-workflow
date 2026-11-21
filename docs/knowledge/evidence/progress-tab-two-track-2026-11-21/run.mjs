// Drive page.html in Chromium: dump the measured geometry for each scenario and width,
// and capture the two screenshots the README references.
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { readFileSync, writeFileSync, statSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const chrome = join(homedir(), '.cache/ms-playwright/chromium-1248/chrome-linux64/chrome')
const base = `file://${join(here, 'page.html')}`

// One throwaway profile per launch: a shared --user-data-dir serves the file:// document
// from cache, so a second scenario would silently render the first one's fixture.
const profile = () => mkdtempSync(join(tmpdir(), 'gw-progress-shot-'))

const cases = [
  { scenario: 'mixed', width: 1440, height: 560 },
  { scenario: 'running', width: 1440, height: 560 },
  { scenario: 'failed', width: 1200, height: 400 },
  { scenario: 'done', width: 1200, height: 400 },
  { scenario: 'empty', width: 1200, height: 300 },
  { scenario: 'running', width: 1024, height: 400 },
  { scenario: 'running', width: 760, height: 420 },
  { scenario: 'running', width: 480, height: 620 },
  { scenario: 'running', width: 390, height: 700 },
]

const lines = []
for (const item of cases) {
  // Chrome's minimum window width is 500px; narrower layouts are measured inside a
  // same-origin iframe, whose own viewport is what the media queries see.
  const narrow = item.width < 500
  const args = [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    ...narrow ? ['--allow-file-access-from-files'] : [],
    `--user-data-dir=${profile()}`,
    '--virtual-time-budget=6000',
    `--window-size=${narrow ? 900 : item.width},${narrow ? item.height + 60 : item.height}`,
    '--dump-dom',
    narrow
      ? `${base}?frame=${item.width}&scenario=${item.scenario}&fh=${item.height}`
      : `${base}?scenario=${item.scenario}&w=${item.width}`,
  ]
  const dom = execFileSync(chrome, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 })
  const match = /data-diag="([\s\S]*?)"/.exec(dom)
  if (match === null) {
    lines.push(`${item.scenario} @${item.width}px: NO DIAG`)
    continue
  }
  const diag = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'"))
  const segs = diag.segments || []
  const rows = new Set(segs.map((seg) => seg.box.y))
  const columns = new Set(segs.map((seg) => seg.box.x))
  lines.push([
    `scenario=${item.scenario} width=${item.width}`,
    `  spine: ${segs.length} segments, layout=${rows.size === 1 ? `single-row (y=${[...rows][0]}, ${columns.size} columns)` : `stacked (${rows.size} rows, ${columns.size} columns)`} (${segs.map((s) => `${s.key.replace('stage:', '')}:${s.state}`).join(' ')})`,
    `  band: ${(diag.cards || []).length} cards below=${diag.layout?.bandBelowTrack} padLeft=${diag.layout?.varPad} firstCardLeft=${diag.layout?.firstCardLeft}`,
    `  cards: ${(diag.cards || []).map((c) => `${c.owner}<-${c.key}[${c.pills.map((p) => `${p.seq}:${p.state}:${p.open ?? 'inert'}`).join(',')}]`).join(' ')}`,
    `  links: ${(diag.links || []).map((l) => `${l.filled === 'true' ? 'filled' : l.flowing === 'true' ? 'flowing' : 'idle'}`).join(',')}`,
    `  wires: ${(diag.wires || []).map((w) => (w.kind === 'trunk' ? `trunk(${w.owner}) ${w.d}` : `branch(${w.owner}->${w.card}) ${w.d}`)).join(' | ')}`,
    `  settle: ${diag.settle === null ? 'absent' : `${diag.settle.legend} parts=${diag.settle.parts.map((p) => `${p.tone}:${p.count}@${p.width}px`).join(',')} empty=${diag.settle.empty}`}`,
    `  overflowX=${diag.overflowX} overflowRight=${(diag.overflowRight || []).length}`,
    `  removed=${JSON.stringify(diag.removed)} inertClicks=${JSON.stringify(diag.inertClicks)} pills=${JSON.stringify(diag.pillClicks)}`,
  ].join('\n'))
}

// Screenshots. A headless screenshot fires at the first paint, before the wire geometry has
// converged, so the picture is taken from the *converged DOM* instead: dump it, keep the
// Progress tab subtree verbatim, and render that static page with the real stylesheet.
const TOKENS = `:root{
  --dsw-alias-label-primary:#1f2328; --dsw-alias-label-secondary:#656d76; --dsw-alias-label-inverse:#ffffff;
  --dsw-alias-border-l2:#d0d7de; --dsw-alias-fill-l2:rgba(31,111,235,.08);
  --dsw-alias-bg-layer-2:#ffffff;
  --dsw-alias-state-business-primary:#0969da; --dsw-alias-state-success-primary:#1a7f37;
  --dsw-alias-state-error-primary:#cf222e; --dsw-alias-state-warn-primary:#9a6700;
  --dsw-alias-state-idle-primary:#8c959f;
  --dsw-font-family-sans:system-ui,-apple-system,"Segoe UI",sans-serif;
}
html,body{margin:0;padding:0;background:#fff;color:#1f2328}`
for (const shot of [
  { name: 'two-track-1440.png', scenario: 'mixed', width: 1440, height: 560, scale: 2 },
  { name: 'two-track-760.png', scenario: 'running', width: 760, height: 470, scale: 2 },
]) {
  const dom = execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    `--user-data-dir=${profile()}`,
    '--virtual-time-budget=6000',
    `--window-size=${shot.width},${shot.height}`,
    '--dump-dom',
    `${base}?scenario=${shot.scenario}&w=${shot.width}`,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 })
  const start = dom.indexOf('<div id="host"')
  // Cut at the first <script after the host: the dumped page carries the bundle, and a
  // static copy that keeps it would re-render itself with the default fixture.
  const scriptAt = start === -1 ? -1 : dom.indexOf('<script', start)
  if (start === -1 || scriptAt === -1) {
    lines.push(`shot ${shot.name}: SKIPPED (host not found)`)
    continue
  }
  const host = dom.slice(start, scriptAt).trimEnd()
  const staticPath = join(here, `static-${shot.name.replace('.png', '.html')}`)
  writeFileSync(staticPath, `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>${TOKENS}</style></head><body>${host}</body></html>`)
  execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    `--user-data-dir=${profile()}`,
    `--force-device-scale-factor=${shot.scale}`,
    '--virtual-time-budget=1500',
    `--window-size=${shot.width},${shot.height}`,
    `--screenshot=${join(here, shot.name)}`,
    `file://${staticPath}`,
  ], { stdio: 'ignore' })
  lines.push(`shot ${shot.name} ${statSync(join(here, shot.name)).size} bytes from ${shot.scenario}@${shot.width}`)
}

writeFileSync(join(here, 'geometry.txt'), `${lines.join('\n')}\n`)
console.log(lines.join('\n'))
