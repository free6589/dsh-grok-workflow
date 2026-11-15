/**
 * Stage B2 (retry) — narrow 480 px, with the sidebar opened first.
 *
 * At 480 px the app boots to the empty home with the sidebar collapsed, so the session
 * row that stage B looked for is not in the DOM: `reopened` came back false and shot 03
 * was a picture of the landing page. Here the sidebar toggle is located by its own
 * accessible name (falling back to the only button in the top-left corner), the
 * transcript is reopened, and only then is the report framed and photographed.
 */
import { open, dismissNotice, shot, tabsInfo, look, assistantTexts, body, crashHits, log } from './lib.mjs'
import { waitReady, openSessionRow, mergeR2, saveStage } from './r2-lib.mjs'

const { b, p } = await open({ w: 480, h: 900, colorScheme: 'light' })
await dismissNotice(p)
await waitReady(p)

const topLeft = await p.evaluate(() => Array.from(document.querySelectorAll('button')).map((el) => {
  const r = el.getBoundingClientRect()
  return { aria: el.getAttribute('aria-label'), title: el.getAttribute('title'), text: (el.innerText || '').trim().slice(0, 24), x: Math.round(r.x), y: Math.round(r.y) }
}).filter((x) => x.y < 60).slice(0, 10))
log({ step: 'topLeftButtons', topLeft })

let clicked = null
for (const cand of topLeft.sort((a, z) => a.x - z.x)) {
  if (cand.x < 60 && (cand.aria || cand.title || cand.text)) {
    const name = cand.aria || cand.title || cand.text
    const c = p.getByRole('button', { name })
    if (await c.count()) {
      await c.first().click().catch(() => {})
      await p.waitForTimeout(1500)
      clicked = name
      break
    }
  }
}
const rowsAfterToggle = await p.evaluate(() => Array.from(document.querySelectorAll('body *'))
  .filter((e) => e.children.length === 0 && /创建 huma/.test(e.textContent || '')).length)
log({ step: 'sidebar', clicked, rowsAfterToggle })

const reopened = await openSessionRow(p, '创建 huma', 45000)
const scrolled = await p.evaluate(() => {
  const el = document.querySelector('[data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]')
  if (!el) return false
  el.scrollIntoView({ block: 'start' })
  return true
})
await p.waitForTimeout(1600)
await shot(p, '03-narrow-480-report.png')

const a = await assistantTexts(p)
const text = await body(p)
const out = {
  stage: 'B2-r2',
  topLeft,
  toggle: clicked,
  rows_after_toggle: rowsAfterToggle,
  reopened,
  scrolled,
  ...(await look(p)),
  tabs: await tabsInfo(p),
  report_len: a.texts.map((t) => t.length),
  report_text: a.texts.join('\n').slice(0, 800),
  crash_hits: crashHits(text),
  overflow_x: await p.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth,
    horizontal_scroll: document.documentElement.scrollWidth > innerWidth + 1
  })),
  body_head: text.slice(0, 300)
}
mergeR2({ narrow: out })
saveStage('stage-b2-r2.json', out)
log(out)
await b.close()
