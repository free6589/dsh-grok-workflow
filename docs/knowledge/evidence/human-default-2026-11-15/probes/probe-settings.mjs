/** Discovery probe (not a deliverable, read-only): where the plugin's settings page lives. */
import { open, dismissNotice, log, APP, redact } from '../lib.mjs'

const { b, p } = await open()
await dismissNotice(p)

const dump = async (label) => {
  const d = await p.evaluate(() => ({
    url: location.href,
    buttons: Array.from(document.querySelectorAll('button,[role="button"],a')).map((e) => ({
      tag: e.tagName, text: (e.innerText || '').trim().slice(0, 30),
      aria: e.getAttribute('aria-label'), title: e.getAttribute('title'), href: e.getAttribute('href')
    })).filter((x) => x.text || x.aria || x.title || x.href).slice(0, 70),
    inputs: Array.from(document.querySelectorAll('input')).map((i) => ({ type: i.type, field: i.getAttribute('data-field'), checked: i.checked }))
  }))
  log({ step: label, ...d, url: redact(d.url) })
}

await dump('initial')

// "More" in the sidebar is the usual second drawer.
const more = p.getByRole('button', { name: 'More', exact: true }).first()
if (await more.count()) { await more.click(); await p.waitForTimeout(1500); await dump('after_more') }

for (const path of ['/settings', '#/settings', '/?settings=1']) {
  try {
    await p.goto(new URL(path, APP).href, { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(3000)
    const found = await p.locator('[data-page="grok-workflow"]').count()
    const fields = await p.locator('input[data-field]').count()
    log({ step: 'route_try', path, grokPage: found, fields })
  } catch (e) { log({ step: 'route_try', path, error: String(e).slice(0, 120) }) }
}

await b.close()
