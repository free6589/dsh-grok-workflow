/** Discovery probe (not a deliverable, read-only): the Settings page and the plugin's own settings entry. */
import { open, dismissNotice, log, redact } from '../lib.mjs'

const { b, p } = await open()
await dismissNotice(p)
await p.getByRole('button', { name: 'Account menu' }).first().click()
await p.waitForTimeout(1200)
await p.getByText('Settings', { exact: true }).first().click()
await p.waitForTimeout(4000)
log({ step: 'settings_page', url: redact(await p.url()),
  body: (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 1500) })
log({ step: 'nav_items', items: await p.evaluate(() => Array.from(document.querySelectorAll('button,a,[role="tab"],[role="menuitem"]')).map((e) => (e.innerText || '').trim().replace(/\s+/g, ' ')).filter((t) => t && t.length < 40).slice(0, 60)) })

for (const label of ['Grok workflow', 'dsh-grok-workflow', 'Grok 工作流']) {
  const el = p.getByText(label, { exact: false }).first()
  if (await el.count()) {
    await el.click().catch(() => {})
    await p.waitForTimeout(3500)
    log({ step: 'clicked', label,
      grokPage: await p.locator('[data-page="grok-workflow"]').count(),
      fields: await p.evaluate(() => Array.from(document.querySelectorAll('input[data-field]')).map((i) => ({ f: i.getAttribute('data-field'), type: i.type, checked: i.checked }))),
      body: (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 900) })
    break
  }
}
await b.close()
