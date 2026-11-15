/**
 * Discovery probe (not a deliverable): how to reopen the run's session, and what the
 * transcript's message containers look like once its text is on screen.
 */
import { open, dismissNotice, log, body } from '../lib.mjs'

const { b, p } = await open()
await dismissNotice(p)
log({ step: 'url_before', url: redactUrl(await p.url()) })

// The sidebar lists the run's session; click it and see where the app goes.
const row = p.getByText('scratch.md', { exact: false }).first()
const hadRow = (await row.count()) > 0
if (hadRow) { await row.click(); await p.waitForTimeout(5000) }
log({ step: 'clicked_row', hadRow, url_after: redactUrl(await p.url()) })

const has = (await body(p)).includes('下一步：')
log({ step: 'report_on_screen', has })
log({ step: 'sidebar_rows', rows: await p.evaluate(() => Array.from(document.querySelectorAll('a,button,[role="option"],[role="listitem"],li')).map((e) => (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 70)).filter((t) => t.includes('scratch')).slice(0, 5)) })

const shape = await p.evaluate(() => {
  const all = Array.from(document.querySelectorAll('*'))
  const leaf = all.filter((el) => el.children.length === 0 && (el.textContent || '').includes('下一步：')).pop()
  if (!leaf) return { found: false }
  const chain = []
  let cur = leaf
  for (let i = 0; i < 14 && cur; i++) {
    chain.push({
      i, tag: cur.tagName,
      data: Array.from(cur.attributes).filter((a) => a.name.startsWith('data-')).map((a) => `${a.name}=${String(a.value).slice(0, 50)}`).join(' '),
      role: cur.getAttribute('role'),
      cls: String(cur.className).slice(0, 90),
      textLen: (cur.textContent || '').length,
      kids: cur.children.length
    })
    cur = cur.parentElement
  }
  return { found: true, chain }
})
log({ step: 'ancestor_chain', shape })

function redactUrl (u) { return String(u).replace(/token=[A-Za-z0-9_.\-]+/g, 'token=<redacted>') }
await b.close()
