/** Discovery probe (not a deliverable, read-only): open the plugin settings page from the Plugins list. */
import { open, dismissNotice, log, redact } from '../lib.mjs'

const { b, p } = await open()
await dismissNotice(p)
await p.getByRole('button', { name: 'Plugins', exact: true }).first().click()
await p.waitForTimeout(6000)

const btns = await p.evaluate(() => Array.from(document.querySelectorAll('button,[role="button"]')).map((e) => (e.innerText || '').trim().replace(/\s+/g, ' ')).filter(Boolean))
log({ step: 'plugin_buttons', btns: btns.slice(0, 60) })

const target = p.getByRole('button', { name: /^Grok workflow$/ }).first()
const n = await target.count()
log({ step: 'target_count', n })
if (n) {
  await target.click()
  await p.waitForTimeout(5000)
  log({ step: 'after_click', url: redact(await p.url()),
    pages: await p.evaluate(() => Array.from(document.querySelectorAll('[data-page]')).map((e) => e.getAttribute('data-page'))),
    fields: await p.evaluate(() => Array.from(document.querySelectorAll('input[data-field]')).map((i) => ({ f: i.getAttribute('data-field'), type: i.type, checked: i.checked }))),
    body: (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 1200) })
}
await b.close()
