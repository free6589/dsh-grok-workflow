/**
 * DOM probe #5 — why `/grok on` did not take effect: capture what the composer does with
 * a slash command and what the transcript shows afterwards.
 */
import { open, dismissNotice, send, waitText, shot, clickTab, loadState } from './lib.mjs'

const state = loadState()
const { b, p } = await open()
const log = (...a) => console.log(...a)
log('NOTICE=' + await dismissNotice(p))
await p.getByText(state.title.slice(0, 10), { exact: false }).first().click().catch(() => {})
await p.waitForTimeout(4000)
await clickTab(p, 'Chat')

const box = p.locator('[contenteditable="true"]').last()
await box.click()
await p.keyboard.insertText('/')
await p.waitForTimeout(1500)
const palette = await p.evaluate(() => {
  const hits = []
  for (const el of document.querySelectorAll('[role="listbox"], [role="option"], [role="menu"], [class*="command"], [class*="Command"]')) {
    hits.push({ tag: el.tagName, role: el.getAttribute('role'), cls: String(el.className).slice(0, 60), text: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 120) })
  }
  return hits.slice(0, 12)
})
log('PALETTE=' + JSON.stringify(palette, null, 1))
await shot(p, 'probe-slash-palette.png')

await p.keyboard.insertText('grok on')
await p.waitForTimeout(1200)
await shot(p, 'probe-slash-typed.png')
const typed = await p.evaluate(() => {
  const el = document.querySelector('[contenteditable="true"]')
  return el ? (el.innerText || '').slice(0, 200) : null
})
log('COMPOSER_TEXT=' + JSON.stringify(typed))
await p.keyboard.press('Enter')
await p.waitForTimeout(8000)
const text = await p.locator('body').innerText()
log('TRANSCRIPT_TAIL=' + JSON.stringify(text.slice(-900)))
log('HAS_ON=' + text.includes('Grok workflow ON'))
log('HAS_USAGE=' + text.includes('Usage: /grok'))
await shot(p, 'probe-after-grok-on.png')

// Does the plugin's toggle record show up in the trajectory view?
await clickTab(p, 'Trajectory')
await p.waitForTimeout(2500)
const traj = await p.locator('body').innerText()
log('TRAJ_HAS_GROK=' + /grok/i.test(traj))
log('TRAJ_TAIL=' + JSON.stringify(traj.slice(-800)))
await shot(p, 'probe-trajectory.png')
await b.close()
