// Render flow.html in Chromium, with and without an open inspector.
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { statSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const chrome = join(homedir(), '.cache/ms-playwright/chromium-1248/chrome-linux64/chrome')
const page = `file://${join(here, 'flow.html')}`

const shots = [
  { name: 'flow-light-1440.png', width: 1440, height: 800, query: 'theme=light' },
  { name: 'flow-dark-1440.png', width: 1440, height: 800, query: 'theme=dark' },
]

for (const shot of shots) {
  const out = join(here, shot.name)
  execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    `--user-data-dir=${join(here, 'udd')}`,
    '--force-device-scale-factor=2',
    `--window-size=${shot.width},${shot.height}`,
    '--virtual-time-budget=1500',
    `--screenshot=${out}`,
    `${page}?${shot.query}`,
  ], { stdio: 'ignore' })
  console.log(`${shot.name}  ${statSync(out).size} bytes`)
}
