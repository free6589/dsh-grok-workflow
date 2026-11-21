// Render the mockup in Chromium and save the effect images.
//
// Usage: node shot.mjs
// Reads mockup.html (query params: ?theme=light|dark), writes PNGs next to it.
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { statSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const chrome = join(homedir(), '.cache/ms-playwright/chromium-1248/chrome-linux64/chrome')
const page = `file://${join(here, 'mockup.html')}`

const shots = [
  { name: 'mock-light-1440.png', width: 1440, height: 790, theme: 'light', scale: 2 },
  { name: 'mock-dark-1440.png', width: 1440, height: 790, theme: 'dark', scale: 2 },
  { name: 'mock-light-760.png', width: 760, height: 900, theme: 'light', scale: 2 },
]

for (const shot of shots) {
  const out = join(here, shot.name)
  execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    `--user-data-dir=${join(here, 'udd')}`,
    `--force-device-scale-factor=${shot.scale}`,
    `--window-size=${shot.width},${shot.height}`,
    '--virtual-time-budget=1200',
    `--screenshot=${out}`,
    `${page}?theme=${shot.theme}`,
  ], { stdio: 'ignore' })
  console.log(`${shot.name}  ${shot.width}x${shot.height}@${shot.scale}  ${statSync(out).size} bytes`)
}
