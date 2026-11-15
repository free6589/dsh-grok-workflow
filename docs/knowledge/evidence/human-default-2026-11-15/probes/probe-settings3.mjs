/** Discovery probe (not a deliverable, read-only): find the plugin's own settings page entry. */
import { open, dismissNotice, log, redact } from '../lib.mjs'

const { b, p } = await open()
await dismissNotice(p)
await p.getByRole('button', { name: 'Account menu' }).first().click()
await p.waitForTimeout(1200)
await p.getByText('Settings', { exact: true }).first().click()
await p.waitForTimeout(4000)

log({ step: 'pages', pages: await p.evaluate(() => Array.from(document.querySelectorAll('[data-page]')).map((e) => e.getAttribute('data-page'))) })
log({ step: 'grok_text', hits: await p.evaluate(() => Array.from(document.querySelectorAll('*'))
  .filter((e) => /grok/i.test(e.textContent || '') && e.children.length === 0)
  .map((e) => ({ tag: e.tagName, text: (e.textContent || '').trim().slice(0, 50) })).slice(0, 20)) })

// The settings nav's own entries, with whatever carries a href or an index.
log({ step: 'nav', nav: await p.evaluate(() => Array.from(document.querySelectorAll('button,a,[role="tab"],[role="menuitem"]')).map((e) => ({
  tag: e.tagName, text: (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40),
  page: e.getAttribute('data-page'), role: e.getAttribute('role')
})).filter((x) => x.text || x.page).slice(0, 80)) })

// Click every nav entry that is not the current one, and see if a grok page appears.
const names = ['Built-in plugins', 'Agent presets', 'Models', 'General']
for (const n of names) {
  const el = p.getByText(n, { exact: true }).first()
  if (await el.count() === 0) continue
  await el.click().catch(() => {})
  await p.waitForTimeout(2500)
  const pages = await p.evaluate(() => Array.from(document.querySelectorAll('[data-page]')).map((e) => e.getAttribute('data-page')))
  const grok = await p.evaluate(() => Array.from(document.querySelectorAll('*')).filter((e) => e.children.length === 0 && /grok/i.test(e.textContent || '')).map((e) => (e.textContent || '').trim().slice(0, 60)).slice(0, 10))
  log({ step: 'nav_clicked', n, pages, grok })
}
log({ step: 'body_tail', text: (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 2000) })
await b.close()
