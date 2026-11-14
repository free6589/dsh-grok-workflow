/**
 * DOM probe — no screenshot, prints what the real UI actually exposes so the evidence
 * script can assert against observed selectors instead of guessed ones.
 */
import { open, dismissNotice, body } from './lib.mjs'

const { b, p } = await open()
console.log('NOTICE=' + await dismissNotice(p))
console.log('TITLE=' + JSON.stringify(await p.title()))

const tabs = await p.locator('[role="tab"], [aria-selected]').all()
console.log('TAB_LIKE_COUNT=' + tabs.length)
for (const t of tabs) {
  const info = await t.evaluate((el) => ({
    tag: el.tagName,
    role: el.getAttribute('role'),
    sel: el.getAttribute('aria-selected'),
    cls: el.className && String(el.className).slice(0, 60),
    text: (el.innerText || '').trim().slice(0, 40),
    html: el.outerHTML.slice(0, 220)
  }))
  console.log('TAB=' + JSON.stringify(info))
}

const ce = await p.locator('[contenteditable="true"]').count()
console.log('CONTENTEDITABLE=' + ce)

const text = await body(p)
console.log('BODY_HEAD=' + JSON.stringify(text.slice(0, 400)))
await b.close()
