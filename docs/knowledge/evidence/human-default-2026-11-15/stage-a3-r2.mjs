/**
 * Stage A3 (retry) — re-frame shots 01 and 05 on the same real session.
 *
 * Stage A2 wrote 01 and 02 with the same hash: `[data-chat-flow]` is the flow wrapper,
 * not the scrolling element, so `scrollTop = 0` moved nothing. Here the scrollable
 * ancestor is resolved from the node itself (computed overflow-y and a real
 * scrollHeight delta) and the two framings become distinguishable:
 *
 *   01 — user's request at the top of the pane + the three Tab strip (Chat default)
 *   05 — the turn tail after the tab round-trip: timestamp, usage, composer
 */
import { open, dismissNotice, shot, tabsInfo, clickTab, assistantTexts, userTexts,
  body, crashHits, log } from './lib.mjs'
import { waitReady, openSessionRow, mergeR2, saveStage } from './r2-lib.mjs'

const { b, p } = await open()
await dismissNotice(p)
await waitReady(p)
const reopened = await openSessionRow(p, '创建 huma')

const scrollToNode = (p, sel, delta) => p.evaluate(([s, d]) => {
  const el = document.querySelector(s)
  if (!el) return { ok: false, why: 'no node' }
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
  if (sc) sc.scrollTop = Math.max(0, sc.scrollTop + d)
  const r = el.getBoundingClientRect()
  return { ok: true, top: Math.round(r.top), bottom: Math.round(r.bottom), scroller: !!sc, scrollTop: sc ? sc.scrollTop : null }
}, [sel, delta])

// 01 — request at the top.
const top01 = await scrollToNode(p, '[data-chat-flow-kind="user"]', -96)
await p.waitForTimeout(1400)
await shot(p, '01-three-tabs-default-chat.png')
const tabs01 = await tabsInfo(p)
log({ step: 'shot01', top01, tabs: tabs01 })

// 02 — report head (unchanged framing, re-taken so the pair is from one pass).
const top02 = await scrollToNode(p, '[data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]', -8)
await p.waitForTimeout(1400)
await shot(p, '02-human-default-report.png')

const a = await assistantTexts(p)

// 05 — round-trip through the tabs, then the turn tail.
await clickTab(p, 'Trajectory')
await p.waitForTimeout(2000)
await clickTab(p, 'Chat')
await p.waitForTimeout(1500)
const tail05 = await scrollToNode(p, '[data-chat-flow-kind="turn-tail"]', 0)
await p.waitForTimeout(1500)
await shot(p, '05-chat-regression.png')

const aAfter = await assistantTexts(p)
const chatText = await body(p)
const out = {
  stage: 'A3-r2',
  reopened,
  shot01: top01,
  shot02: top02,
  shot05: tail05,
  tabs01,
  report_len: a.texts.map((t) => t.length),
  report_len_after: aAfter.texts.map((t) => t.length),
  same_report: aAfter.texts.join('\n') === a.texts.join('\n'),
  user_bubbles: (await userTexts(p)).length,
  crash_hits: crashHits(chatText)
}
mergeR2(out)
saveStage('stage-a3-r2.json', out)
log(out)
await b.close()
