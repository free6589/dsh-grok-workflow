/**
 * DOM probe #3 — after entering a real session, find the view tab strip and the
 * plugin's progress subtree.
 */
import { open, dismissNotice } from './lib.mjs'

const { b, p } = await open()
console.log('NOTICE=' + await dismissNotice(p))

const row = p.getByText('New Session', { exact: false }).first()
console.log('NEW_SESSION_ROW=' + await row.count())
await row.click().catch((e) => console.log('CLICK_ERR=' + e.message))
await p.waitForTimeout(6000)

const strip = await p.evaluate(() => {
  const out = []
  for (const el of document.querySelectorAll('[class*="tab"], [class*="Tab"]')) {
    const text = (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 30)
    if (!text) continue
    out.push({
      tag: el.tagName,
      cls: String(el.className).slice(0, 80),
      text,
      role: el.getAttribute('role'),
      sel: el.getAttribute('aria-selected'),
      html: el.outerHTML.slice(0, 200)
    })
  }
  return out.slice(0, 30)
})
console.log('TAB_NODES=' + JSON.stringify(strip, null, 1))

const labels = await p.evaluate(() => {
  const want = ['Chat', 'Trajectory', 'Progress', '对话', '轨迹', '进度']
  const hits = []
  for (const el of document.querySelectorAll('*')) {
    if (el.children.length) continue
    const t = (el.textContent || '').trim()
    if (want.includes(t)) hits.push({ text: t, tag: el.tagName, cls: String(el.className).slice(0, 60) })
  }
  return hits
})
console.log('LABEL_HITS=' + JSON.stringify(labels))

const gw = await p.evaluate(() => ({
  gwProgress: !!document.querySelector('.gw-progress'),
  dataState: document.querySelectorAll('[data-state]').length,
  ce: document.querySelectorAll('[contenteditable="true"]').length
}))
console.log('GW=' + JSON.stringify(gw))
console.log('BODY=' + JSON.stringify((await p.locator('body').innerText()).slice(0, 500)))
await b.close()
