/** Discovery probe (not a deliverable, read-only): reach the plugin's settings page. */
import { open, dismissNotice, log, redact } from '../lib.mjs'

const { b, p } = await open()
await dismissNotice(p)

// 1) the sidebar's "Plugins" entry
const plugins = p.getByRole('button', { name: 'Plugins', exact: true }).first()
if (await plugins.count()) { await plugins.click(); await p.waitForTimeout(3500) }
log({ step: 'after_plugins', url: redact(await p.url()),
  body: (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 1200),
  grokPage: await p.locator('[data-page="grok-workflow"]').count(),
  fields: await p.locator('input[data-field]').count() })

// 2) any element naming the plugin
const named = await p.evaluate(() => Array.from(document.querySelectorAll('*'))
  .filter((e) => e.children.length === 0 && /grok|Grok workflow|Grok 工作流/i.test(e.textContent || ''))
  .map((e) => ({ tag: e.tagName, text: (e.textContent || '').trim().slice(0, 60), cls: String(e.className).slice(0, 60) })).slice(0, 20))
log({ step: 'named_elements', named })

// 3) follow it if it is clickable
for (const label of ['Grok workflow', 'Grok 工作流', 'grok-workflow']) {
  const el = p.getByText(label, { exact: false }).first()
  if (await el.count()) {
    await el.click().catch(() => {})
    await p.waitForTimeout(3000)
    log({ step: 'clicked_label', label,
      grokPage: await p.locator('[data-page="grok-workflow"]').count(),
      fields: await p.locator('input[data-field]').count(),
      fieldNames: await p.evaluate(() => Array.from(document.querySelectorAll('input[data-field]')).map((i) => i.getAttribute('data-field'))),
      body: (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 800) })
    break
  }
}

// 4) account menu, in case Settings lives there
const acct = p.getByRole('button', { name: 'Account menu' }).first()
if (await acct.count()) {
  await acct.click(); await p.waitForTimeout(1500)
  log({ step: 'account_menu', items: await p.evaluate(() => Array.from(document.querySelectorAll('[role="menuitem"],[role="menu"] button,button')).map((e) => (e.innerText || '').trim()).filter(Boolean).slice(0, 30)) })
}
await b.close()
