/**
 * Probe — open the generated settings form for the plugin and dump the diagnostics field.
 *
 * The Plugins page lists "Grok workflow" under Built-in plugin settings; clicking it must
 * project this plugin's own `Config` schema. The probe records the field list (label,
 * type, current value) so the switch can be flipped through the same surface a user uses.
 */
import { open, dismissNotice, body, log } from '../lib.mjs'
import { waitReady } from '../r2-lib.mjs'

const { b, p } = await open()
await dismissNotice(p)
await waitReady(p)

await p.getByRole('button', { name: 'Plugins' }).first().click().catch(() => {})
await p.waitForTimeout(2500)

const entry = p.getByText('Grok workflow', { exact: false }).first()
const entryCount = await entry.count()
if (entryCount) { await entry.click().catch(() => {}); await p.waitForTimeout(2500) }

const dump = await p.evaluate(() => {
  const fields = Array.from(document.querySelectorAll('input,select,textarea')).map((el) => {
    const lab = el.closest('label') || (el.id ? document.querySelector(`label[for="${el.id}"]`) : null)
    const wrap = el.closest('div')
    return {
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type'),
      id: el.id || null,
      name: el.getAttribute('name') || el.getAttribute('aria-label') || null,
      checked: el.type === 'checkbox' ? el.checked : null,
      value: el.type === 'checkbox' ? null : String(el.value).slice(0, 60),
      label: lab ? (lab.innerText || '').trim().slice(0, 90) : null,
      wrap_text: wrap ? (wrap.innerText || '').trim().slice(0, 90) : null
    }
  })
  const switches = Array.from(document.querySelectorAll('[role="switch"],button[aria-checked]')).map((el) => ({
    role: el.getAttribute('role'),
    ariaChecked: el.getAttribute('aria-checked'),
    text: (el.innerText || '').trim().slice(0, 80),
    aria: el.getAttribute('aria-label')
  }))
  return {
    headings: Array.from(document.querySelectorAll('h1,h2,h3,h4,[role="heading"],summary,legend'))
      .map((e) => (e.innerText || '').trim()).filter(Boolean).slice(0, 80),
    fields,
    switches
  }
})

const text = await body(p)
const out = {
  step: 'grok-settings',
  entry_count: entryCount,
  ...dump,
  diagnostics_context: (text.match(/.{0,100}(?:showDiagnostics|Diagnostic|诊断).{0,140}/gi) || []).slice(0, 8),
  body_len: text.length,
  body_excerpt: text.slice(0, 3000)
}
log(out)
await p.screenshot({ path: '/home/fish/projects_mine/dsh-grok-workflow/docs/knowledge/evidence/human-default-2026-11-15/probes/grok-settings-probe-r2.png' })
await b.close()
