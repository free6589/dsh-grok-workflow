/**
 * Stage A2 (retry) — re-frame the default-form shots on the same real session.
 *
 * Stage A already produced the run; here the page is reloaded (a *fresh* browser, i.e.
 * the transcript has to be restored from the session archive, not from memory) and the
 * four default-form shots are framed so each shows one distinct fact:
 *
 *   01 — the three Tab coexist, Chat selected by default, the conversation opens on the
 *        user's own request (so 01 is not a second copy of 02)
 *   02 — the human-only report head: 做完了 / 关键证据 / 下一步 / 需要你知道的
 *   06 — the Trajectory tab still traces the run (no regression)
 *   05 — back on Chat after the tab round-trip, scrolled to the turn tail: the exchange
 *        survived intact
 *
 * It also measures the Progress tab (spine/detail) while it is open.
 */
import { open, dismissNotice, shot, tabsInfo, clickTab, flowKinds, assistantTexts,
  userTexts, body, stripHits, residueHits, humanHits, look, progressDom, crashHits, log } from './lib.mjs'
import { waitReady, openSessionRow, mergeR2, saveStage, loadR2 } from './r2-lib.mjs'

const prev = loadR2()
const { b, p } = await open()
const notice = await dismissNotice(p)
await waitReady(p)

const reopened = await openSessionRow(p, '创建 huma')
log({ step: 'reopened', reopened })

const scrollTop = await p.evaluate(() => {
  const s = document.querySelector('[data-chat-flow]')
  if (!s) return false
  s.scrollTop = 0
  return true
})
await p.waitForTimeout(1200)
await shot(p, '01-three-tabs-default-chat.png')
const tabs01 = await tabsInfo(p)
const userBubbleVisible = await p.evaluate(() => {
  const u = document.querySelector('[data-chat-flow-kind="user"]')
  if (!u) return null
  const r = u.getBoundingClientRect()
  return { top: Math.round(r.top), visible: r.top >= 0 && r.bottom <= innerHeight }
})

// 02 — the report head.
const reportScrolled = await p.evaluate(() => {
  const n = document.querySelector('[data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]')
  if (!n) return false
  n.scrollIntoView({ block: 'start' })
  return true
})
await p.waitForTimeout(1200)
await shot(p, '02-human-default-report.png')

const a = await assistantTexts(p)
const u = await userTexts(p)
const report = a.texts.join('\n')
const reportMeasure = {
  report_len: a.texts.map((t) => t.length),
  report_text: report,
  user_bubble_texts: u,
  same_as_stage_a: report === (prev.report_text || ''),
  human_landmarks: humanHits(a.texts),
  strip_violations: stripHits(a.texts),
  residue_findings: residueHits(a.texts)
}

// 06 — Trajectory.
await clickTab(p, 'Trajectory')
await p.waitForTimeout(2500)
await shot(p, '06-trajectory-regression.png')
const trajText = await body(p)
const trajectory = {
  tabs: await tabsInfo(p),
  has_role_rows: /SYSTEM/.test(trajText) && /USER/.test(trajText),
  has_timing: /Duration/.test(trajText),
  has_workflow_row: /workflow/i.test(trajText),
  crash_hits: crashHits(trajText)
}

// 05 — Chat again, at the turn tail.
await clickTab(p, 'Chat')
await p.waitForTimeout(1500)
const scrollBottom = await p.evaluate(() => {
  const s = document.querySelector('[data-chat-flow]')
  if (!s) return false
  s.scrollTop = s.scrollHeight
  return true
})
await p.waitForTimeout(1500)
await shot(p, '05-chat-regression.png')
const aAfter = await assistantTexts(p)
const chatText = await body(p)
const chat = {
  tabs: await tabsInfo(p),
  has_user_task: (await userTexts(p)).length > 0,
  has_report: aAfter.texts.length > 0,
  report_len_after: aAfter.texts.map((t) => t.length),
  same_report: aAfter.texts.join('\n') === report,
  crash_hits: crashHits(chatText)
}

// Progress tab — measured while open, then back to Chat.
await clickTab(p, 'Progress')
await p.waitForTimeout(2500)
const progress = await progressDom(p)
const progressTextLen = (await body(p)).length
const progressShot = await shot(p, 'probes/progress-tab-probe.png')
await clickTab(p, 'Chat')
await p.waitForTimeout(1200)

const out = {
  stage: 'A2-r2',
  notice,
  reopened,
  tabs01,
  user_bubble_visible_on_01: userBubbleVisible,
  scrolling: { toTop: scrollTop, toBottom: scrollBottom, reportScrolled },
  ...reportMeasure,
  trajectory,
  chat,
  progress: { ...progress, body_len: progressTextLen, probe_shot: !!progressShot },
  flow: await flowKinds(p),
  layout: await look(p)
}
mergeR2(out)
saveStage('stage-a2-r2.json', out)
log({ ...out, report_text: out.report_text.slice(0, 1200) })
await b.close()
