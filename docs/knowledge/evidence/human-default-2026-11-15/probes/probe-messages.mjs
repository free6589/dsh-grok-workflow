/**
 * Discovery probe (not a deliverable): locate the transcript's own message containers
 * so the report text can be read in isolation from the user's own bubble.
 */
import { open, dismissNotice, waitText, log, body } from '../lib.mjs'

const { b, p } = await open()
await dismissNotice(p)
await waitText(p, '下一步：', 120000)

const survey = await p.evaluate(() => {
  const out = []
  for (const el of document.querySelectorAll('*')) {
    const attrs = Array.from(el.attributes).map((a) => `${a.name}="${String(a.value).slice(0, 60)}"`)
    const cls = attrs.filter((a) => a.startsWith('class=')).join(' ')
    const data = attrs.filter((a) => a.startsWith('data-')).join(' ')
    const t = (el.textContent || '')
    if (t.includes('下一步：') && t.length < 4000) {
      out.push({ tag: el.tagName, depthKids: el.children.length, len: t.length, data: data.slice(0, 300), cls: cls.slice(0, 200) })
    }
  }
  return out.slice(-12)
})
log({ step: 'containers_with_report', survey })

const shape = await p.evaluate(() => {
  const all = Array.from(document.querySelectorAll('*'))
  const leaf = all.filter((el) => el.children.length === 0 && (el.textContent || '').includes('下一步：')).pop()
  if (!leaf) return { found: false }
  const chain = []
  let cur = leaf
  for (let i = 0; i < 12 && cur; i++) {
    chain.push({
      i,
      tag: cur.tagName,
      data: Array.from(cur.attributes).filter((a) => a.name.startsWith('data-')).map((a) => `${a.name}=${String(a.value).slice(0, 40)}`).join(' '),
      cls: String(cur.className).slice(0, 120),
      textLen: (cur.textContent || '').length,
      kids: cur.children.length
    })
    cur = cur.parentElement
  }
  return { found: true, chain }
})
log({ step: 'ancestor_chain', shape })

log({ step: 'bodyTail', text: (await body(p)).slice(-1800) })
await b.close()
