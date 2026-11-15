/**
 * Stage C1 (retry) — flip the diagnostics switch through the plugin's own settings page.
 *
 * The switch is *not* hand-edited into the profile layer here: the page is generated from
 * this plugin's `Config` schema (`applies: 'live'`), so the click below is the same action
 * a user takes. The probe first expands the collapsed "More · Defaults are fine" section,
 * reads the row labels, then clicks the row whose label names the machine ledger and
 * re-reads the checkbox state plus the profile layer file the page writes to.
 */
import fs from 'node:fs'
import { open, dismissNotice, body, log } from './lib.mjs'
import { waitReady } from './r2-lib.mjs'

const PROFILE = '/home/fish/projects_mine/dsh-grok-workflow/.tmp/human-home-r2/profiles/ghuman/cordis.patch.yml'

const rowsWithLabels = (p) => p.evaluate(() => Array.from(document.querySelectorAll('input[type="checkbox"]')).map((el, i) => {
  let node = el
  let text = ''
  for (let up = 0; up < 6; up += 1) {
    node = node.parentElement
    if (!node) break
    const t = (node.innerText || '').trim().replace(/\s+/g, ' ')
    if (t.length > 6) { text = t; break }
  }
  return { i, checked: el.checked, label: text.slice(0, 180) }
}))

const { b, p } = await open()
await dismissNotice(p)
await waitReady(p)
await p.getByRole('button', { name: 'Plugins' }).first().click().catch(() => {})
await p.waitForTimeout(2500)
await p.getByText('Grok workflow', { exact: false }).first().click().catch(() => {})
await p.waitForTimeout(2500)

// Expand the "More · Defaults are fine" disclosure; the output switches live inside it.
const more = p.getByText('More · Defaults are fine', { exact: false }).first()
if (await more.count()) { await more.click().catch(() => {}); await p.waitForTimeout(2500) }

const before = await rowsWithLabels(p)
const target = before.find((r) => /diagnostic|诊断|台账|ledger/i.test(r.label)) ||
  before.find((r) => /machine|机器/i.test(r.label))
log({ step: 'rows_before', target, rows: before })

let clicked = false
let afterToggle = null
if (target) {
  const boxes = p.locator('input[type="checkbox"]')
  const el = boxes.nth(target.i)
  await el.scrollIntoViewIfNeeded().catch(() => {})
  await el.click({ force: true }).catch((e) => log({ step: 'click_error', error: String(e).slice(0, 300) }))
  await p.waitForTimeout(3000)
  clicked = true
  afterToggle = (await rowsWithLabels(p)).find((r) => r.i === target.i)
}

const saveButtons = await p.evaluate(() => Array.from(document.querySelectorAll('button'))
  .map((el) => ({ text: (el.innerText || '').trim().slice(0, 30), aria: el.getAttribute('aria-label') }))
  .filter((x) => /save|保存|apply|应用/i.test((x.text || '') + (x.aria || ''))))

const text = await body(p)
await p.screenshot({ path: '/home/fish/projects_mine/dsh-grok-workflow/docs/knowledge/evidence/human-default-2026-11-15/probes/settings-switch-flip-r2.png' })

const profileAfter = fs.existsSync(PROFILE) ? fs.readFileSync(PROFILE, 'utf8') : null
log({
  step: 'flip',
  clicked,
  target,
  afterToggle,
  saveButtons,
  page_text_has_diagnostics: /diagnostic|诊断/i.test(text),
  page_context: (text.match(/.{0,80}(?:diagnostic|诊断|台账|ledger).{0,120}/gi) || []).slice(0, 6),
  profile_layer: profileAfter
})
await b.close()
