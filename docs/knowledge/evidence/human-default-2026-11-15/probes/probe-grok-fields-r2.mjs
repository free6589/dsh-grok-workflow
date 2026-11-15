/**
 * Probe — the actual labels of the plugin's generated settings form.
 *
 * The form is custom-rendered, so `label[for]` is empty for every control; the label is
 * a sibling inside the row. This walks the rows and prints, per control, the nearest
 * ancestor text, which is what a human reads — enough to name the diagnostics switch
 * exactly instead of guessing which of 43 controls it is.
 */
import { open, dismissNotice, body, log } from '../lib.mjs'
import { waitReady } from '../r2-lib.mjs'

const { b, p } = await open()
await dismissNotice(p)
await waitReady(p)
await p.getByRole('button', { name: 'Plugins' }).first().click().catch(() => {})
await p.waitForTimeout(2500)
await p.getByText('Grok workflow', { exact: false }).first().click().catch(() => {})
await p.waitForTimeout(2500)

const rows = await p.evaluate(() => {
  const out = []
  const controls = Array.from(document.querySelectorAll('input,select,textarea'))
  controls.forEach((el, i) => {
    let node = el
    let text = ''
    for (let up = 0; up < 4; up += 1) {
      node = node.parentElement
      if (!node) break
      const t = (node.innerText || '').trim().replace(/\s+/g, ' ')
      if (t.length > (el.type === 'checkbox' ? 4 : 0)) { text = t; break }
    }
    out.push({
      i,
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type'),
      checked: el.type === 'checkbox' ? el.checked : null,
      value: el.type === 'checkbox' ? null : String(el.value).slice(0, 40),
      row_text: text.slice(0, 160)
    })
  })
  return out
})

const sections = await p.evaluate(() => Array.from(document.querySelectorAll('details,section,[data-section]')).map((el) => ({
  open: el.tagName === 'DETAILS' ? el.open : null,
  head: (el.querySelector('summary,h2,h3,h4') || {}).innerText || null,
  text: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 500)
})).slice(0, 20))

log({ step: 'rows', count: rows.length, rows, sections })
await p.screenshot({ path: '/home/fish/projects_mine/dsh-grok-workflow/docs/knowledge/evidence/human-default-2026-11-15/probes/grok-fields-probe-r2.png' })
await b.close()
