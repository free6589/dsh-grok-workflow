/**
 * DOM probe #2 — locate the conversation view tab strip (chat / trajectory / progress)
 * and the plugin's `.gw-progress` subtree as the real UI exposes them.
 */
import { open, dismissNotice } from './lib.mjs'

const { b, p } = await open()
console.log('NOTICE=' + await dismissNotice(p))

const found = await p.evaluate(() => {
  const out = []
  for (const el of document.querySelectorAll('[class*="tab"], [class*="Tab"]')) {
    const text = (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 30)
    if (!text) continue
    out.push({
      tag: el.tagName,
      cls: String(el.className).slice(0, 70),
      text,
      role: el.getAttribute('role'),
      sel: el.getAttribute('aria-selected'),
      expanded: el.getAttribute('aria-expanded')
    })
  }
  return out.slice(0, 40)
})
console.log('TAB_CLASS_NODES=' + JSON.stringify(found, null, 1))

const gw = await p.evaluate(() => {
  const host = document.querySelector('.gw-progress')
  const nodes = document.querySelectorAll('[data-state]')
  return {
    gwProgress: host ? host.outerHTML.slice(0, 400) : null,
    dataStateCount: nodes.length,
    dataStates: Array.from(nodes).slice(0, 12).map((n) => n.getAttribute('data-state'))
  }
})
console.log('GW=' + JSON.stringify(gw, null, 1))

const labels = await p.evaluate(() => {
  const want = ['Chat', 'Trajectory', 'Progress', '对话', '轨迹', '进度']
  const hits = []
  for (const el of document.querySelectorAll('*')) {
    if (el.children.length) continue
    const t = (el.textContent || '').trim()
    if (want.includes(t)) {
      hits.push({ text: t, tag: el.tagName, cls: String(el.className).slice(0, 60), parent: el.parentElement && el.parentElement.outerHTML.slice(0, 260) })
    }
  }
  return hits.slice(0, 12)
})
console.log('LEAF_LABEL_HITS=' + JSON.stringify(labels, null, 1))
await b.close()
