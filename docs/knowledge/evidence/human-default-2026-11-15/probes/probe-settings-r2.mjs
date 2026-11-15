/**
 * Probe — where the diagnostics switch actually lives in this build.
 *
 * The plugin exports its `Config` schema, and DSH's settings page is generated from
 * schemas (`applies: 'live'`), so the switch *should* be reachable as a form field.
 * This probe finds out instead of assuming: it walks every nav entry whose text looks
 * like settings, then dumps the section titles and any field whose label mentions
 * diagnostics / 诊断, plus the checkbox state.
 */
import { open, dismissNotice, body, log } from '../lib.mjs'
import { waitReady } from '../r2-lib.mjs'

const { b, p } = await open()
await dismissNotice(p)
await waitReady(p)

const nav = await p.evaluate(() => Array.from(document.querySelectorAll('button,a,[role="button"]'))
  .map((el) => ({ aria: el.getAttribute('aria-label'), text: (el.innerText || '').trim().slice(0, 40) }))
  .filter((x) => x.aria || x.text))
log({ step: 'nav', nav: nav.slice(0, 60) })

async function tryOpen (name) {
  const c = p.getByRole('button', { name })
  if (!(await c.count())) return false
  await c.first().click().catch(() => {})
  await p.waitForTimeout(2000)
  return true
}

const openedBy = []
for (const name of ['More', 'Settings', '设置', 'Plugins']) {
  if (await tryOpen(name)) {
    openedBy.push(name)
    const t = await body(p)
    if (/Settings|设置|showDiagnostics|Diagnostics/i.test(t)) break
  }
}

const afterOpen = await body(p)
const hasSettingsEntry = /Settings|设置/.test(afterOpen)
if (hasSettingsEntry && !/showDiagnostics|Diagnostics/i.test(afterOpen)) {
  for (const name of ['Settings', '设置']) {
    if (await tryOpen(name)) { openedBy.push(name); break }
  }
}

const text = await body(p)
const sections = await p.evaluate(() => Array.from(document.querySelectorAll('h1,h2,h3,h4,[role="heading"],legend'))
  .map((e) => (e.innerText || '').trim()).filter(Boolean).slice(0, 60))
const inputs = await p.evaluate(() => Array.from(document.querySelectorAll('input')).map((el) => {
  const lab = el.closest('label') || document.querySelector(`label[for="${el.id}"]`)
  return {
    type: el.type,
    id: el.id,
    name: el.getAttribute('name'),
    checked: el.type === 'checkbox' ? el.checked : null,
    value: el.type === 'checkbox' ? null : String(el.value).slice(0, 40),
    label: lab ? (lab.innerText || '').trim().slice(0, 80) : null
  }
}).slice(0, 60))

const out = {
  step: 'settings',
  opened_by: openedBy,
  sections,
  inputs,
  mentions_diagnostics: /showDiagnostics|Diagnostics|诊断/i.test(text),
  diagnostics_context: (text.match(/.{0,90}(?:showDiagnostics|Diagnostics|诊断).{0,120}/gi) || []).slice(0, 6),
  body_excerpt: text.slice(0, 2500)
}
log(out)
await p.screenshot({ path: '/home/fish/projects_mine/dsh-grok-workflow/docs/knowledge/evidence/human-default-2026-11-15/probes/settings-probe-r2.png' })
await b.close()
