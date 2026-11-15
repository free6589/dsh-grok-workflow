/**
 * Probe — what the session list really is, so the later stages can enter the session that
 * stage A created without relying on a guessed selector.
 */
import { open, dismissNotice } from './lib.mjs'

const { b, p } = await open()
console.log('NOTICE=' + await dismissNotice(p))
await p.waitForTimeout(3000)
const info = await p.evaluate(() => {
  const items = Array.from(document.querySelectorAll('[role="treeitem"]'))
  const anchors = Array.from(document.querySelectorAll('a[href]')).map((a) => ({ href: a.getAttribute('href'), text: (a.innerText || '').trim().slice(0, 60) }))
  return {
    treeitems: items.map((el) => ({
      text: (el.innerText || '').trim().slice(0, 120),
      selected: el.getAttribute('aria-selected'),
      cls: String(el.className).slice(0, 60),
      tag: el.tagName
    })),
    anchors: anchors.filter((a) => a.href && !/^https?:/.test(a.href)).slice(0, 12),
    url: location.href.replace(/token=[^&]*/, 'token=<redacted>')
  }
})
console.log('PROBE=' + JSON.stringify(info, null, 1))
await b.close()
