/**
 * Probe — did the settings Save persist?
 *
 * Reopens the generated form in a brand-new browser (i.e. after a full client reload) and
 * reads the Machine diagnostics checkbox plus any still-pending "Save (n)" button. This
 * separates two different defects: "the page never wrote the value" from "the value is
 * stored but the next run ignores it".
 */
import { open, dismissNotice, log } from '../lib.mjs'
import { waitReady } from '../r2-lib.mjs'

const { b, p } = await open()
await dismissNotice(p)
await waitReady(p)
await p.getByRole('button', { name: 'Plugins' }).first().click().catch(() => {})
await p.waitForTimeout(2500)
await p.getByText('Grok workflow', { exact: false }).first().click().catch(() => {})
await p.waitForTimeout(2500)
const more = p.getByText('More · Defaults are fine', { exact: false }).first()
if (await more.count()) { await more.click().catch(() => {}); await p.waitForTimeout(2500) }

const state = await p.evaluate(() => Array.from(document.querySelectorAll('input[type="checkbox"]')).map((el, i) => {
  let node = el
  let text = ''
  for (let up = 0; up < 6; up += 1) {
    node = node.parentElement
    if (!node) break
    const t = (node.innerText || '').trim().replace(/\s+/g, ' ')
    if (t.length > 6) { text = t; break }
  }
  return { i, checked: el.checked, label: text.slice(0, 120) }
}).filter((r) => /machine diagnostics|diagnostics|诊断|Watch the build|Keep records|Plain-language/i.test(r.label)))

const buttons = await p.evaluate(() => Array.from(document.querySelectorAll('button'))
  .map((el) => (el.innerText || '').trim()).filter(Boolean).slice(0, 40))

log({ step: 'persisted?', switches: state, buttons })
await p.screenshot({ path: '/home/fish/projects_mine/dsh-grok-workflow/docs/knowledge/evidence/human-default-2026-11-15/probes/settings-after-save-r2.png' })
await b.close()
