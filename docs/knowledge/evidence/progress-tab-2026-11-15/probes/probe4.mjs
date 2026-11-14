/**
 * DOM probe #4 — send one ordinary message (grok mode off) so a real session exists,
 * then locate the view tab strip and the plugin's `.gw-progress` subtree.
 */
import { open, dismissNotice, send, body, waitText } from './lib.mjs'

const { b, p } = await open()
console.log('NOTICE=' + await dismissNotice(p))
await p.getByText('New Session', { exact: false }).first().click().catch(() => {})
await p.waitForTimeout(3000)
await send(p, '你好，简单打个招呼就好')
console.log('REPLY=' + await waitText(p, '你好', 90000))
await p.waitForTimeout(6000)

const info = await p.evaluate(() => {
  const pick = (sel) => Array.from(document.querySelectorAll(sel)).slice(0, 12).map((el) => ({
    tag: el.tagName,
    cls: String(el.className).slice(0, 80),
    role: el.getAttribute('role'),
    sel: el.getAttribute('aria-selected'),
    text: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 30)
  }))
  return {
    tabish: pick('[class*="tab"], [class*="Tab"]'),
    roleTab: pick('[role="tab"]'),
    ariaSelected: pick('[aria-selected]'),
    gwProgress: !!document.querySelector('.gw-progress'),
    dataState: Array.from(document.querySelectorAll('[data-state]')).slice(0, 10).map((n) => n.getAttribute('data-state'))
  }
})
console.log('INFO=' + JSON.stringify(info, null, 1))
console.log('BODY_TAIL=' + JSON.stringify((await body(p)).slice(-700)))
await b.close()
