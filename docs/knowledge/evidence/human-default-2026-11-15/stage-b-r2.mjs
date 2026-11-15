/**
 * Stage B (retry) — 03 narrow (480 px) and 04 dark, both on the real transcript.
 *
 * Same session, same report; only the context changes (viewport width, prefers-color-
 * scheme). Both are measured, not just photographed: viewport, body background/colour,
 * tab strip box and the report box come from the live DOM so "narrow" and "dark" are
 * facts about the rendering rather than about the screenshot filename.
 */
import { open, dismissNotice, shot, tabsInfo, look, assistantTexts, body, crashHits, log } from './lib.mjs'
import { waitReady, openSessionRow, mergeR2, saveStage } from './r2-lib.mjs'

const scrollToNode = (p, sel, d) => p.evaluate(([s, dd]) => {
  const el = document.querySelector(s)
  if (!el) return { ok: false }
  const scrollerOf = (n) => {
    let cur = n.parentElement
    while (cur) {
      const cs = getComputedStyle(cur)
      if (/(auto|scroll|overlay)/.test(cs.overflowY) && cur.scrollHeight > cur.clientHeight + 4) return cur
      cur = cur.parentElement
    }
    return null
  }
  const sc = scrollerOf(el)
  el.scrollIntoView({ block: 'start' })
  if (sc) sc.scrollTop = Math.max(0, sc.scrollTop + dd)
  return { ok: true, top: Math.round(el.getBoundingClientRect().top) }
}, [sel, d])

async function pass ({ w, h, colorScheme, file, label }) {
  const { b, p } = await open({ w, h, colorScheme })
  await dismissNotice(p)
  await waitReady(p)
  const reopened = await openSessionRow(p, '创建 huma')
  const scrolled = await scrollToNode(p, '[data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]', -8)
  await p.waitForTimeout(1500)
  await shot(p, file)
  const a = await assistantTexts(p)
  const text = await body(p)
  const out = {
    label,
    reopened,
    scrolled,
    ...(await look(p)),
    tabs: await tabsInfo(p),
    report_len: a.texts.map((t) => t.length),
    crash_hits: crashHits(text),
    overflow_x: await p.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: innerWidth,
      horizontal_scroll: document.documentElement.scrollWidth > innerWidth + 1
    }))
  }
  await b.close()
  return out
}

const narrow = await pass({ w: 480, h: 900, colorScheme: 'light', file: '03-narrow-480-report.png', label: 'narrow-480-light' })
log({ step: 'narrow', ...narrow })
const dark = await pass({ w: 1440, h: 900, colorScheme: 'dark', file: '04-dark-report.png', label: 'dark-1440' })
log({ step: 'dark', ...dark })

const out = { stage: 'B-r2', narrow, dark }
mergeR2(out)
saveStage('stage-b-r2.json', out)
log({ stage: 'B-r2', narrow, dark })