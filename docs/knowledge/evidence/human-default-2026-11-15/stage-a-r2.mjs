/**
 * Stage A (retry) — the default form of a real team run, on a fresh isolated home.
 *
 * shots:
 *   01-three-tabs-default-chat.png   three Tab coexist, Chat selected by default
 *   02-human-default-report.png      the human-only report head (no machine ledger)
 *   05-chat-regression.png           back on Chat after a tab round-trip: task + report intact
 *   06-trajectory-regression.png     the Trajectory tab renders the run
 *
 * Nothing about the model or the network is mocked: the message goes to the real
 * gateway on 127.0.0.1:18088 and the team really runs.
 */
import { open, dismissNotice, send, body, settle, shot, tabsInfo, clickTab, flowKinds,
  assistantTexts, userTexts, stripHits, residueHits, humanHits, look, progressDom,
  scrollReportStart, crashHits, redact, log } from './lib.mjs'
import { waitReady, safeUrl, sidebarRows, mergeR2, saveStage, openSessionRow } from './r2-lib.mjs'

const TASK = '小任务，请团队跑完这两步：第一步，在工作目录下建 .tmp/human-scratch-r2.md，写三行待办，每行以 - 开头。第二步，用 stat -c \'%s\' 取回该文件的字节数、用 sha256sum 取回它的摘要，并把这两条命令的原始输出当成证据记下来。'

const { b, p } = await open()
const notice = await dismissNotice(p)
const ready = await waitReady(p)
log({ step: 'ready', notice, ready, url: safeUrl(p) })

const t0 = Date.now()
await send(p, TASK)
const sawHuman = await settle(p, 600000, 5)
const secs = Math.round((Date.now() - t0) / 1000)
log({ step: 'settled', sawHuman, secs, url: safeUrl(p) })

// 01 — the three tabs as the app really renders them, Chat selected by default.
await p.waitForTimeout(1500)
await shot(p, '01-three-tabs-default-chat.png')
const tabsDefault = await tabsInfo(p)

// 02 — the human-only report, scrolled to its head.
const scrolled = await scrollReportStart(p)
await p.waitForTimeout(1200)
await shot(p, '02-human-default-report.png')

const a = await assistantTexts(p)
const u = await userTexts(p)
const whole = await body(p)
const report = a.texts.join('\n')

const reportMeasure = {
  assistant_node_count: a.count,
  assistant_response_count: a.texts.length,
  report_len: a.texts.map((t) => t.length),
  report_text: report,
  user_bubble_texts: u,
  human_landmarks: humanHits(a.texts),
  strip_violations: stripHits(a.texts),
  residue_findings: residueHits(a.texts),
  whole_body_has_markers: /<<<[A-Z-]*GROK-WORKFLOW[A-Z-]*>>>/.test(whole),
  whole_body_has_stat: /\bstat\s+-/.test(whole),
  // the user's own bubble deliberately carries the machine words, so leaking is
  // measured on the assistant's node only (see lib.mjs assistantTexts).
  user_bubble_has_machine_words: /\bstat\s+-|\bsha256sum\b/.test(u.join('\n')),
  report_scrolled: scrolled
}
log({ step: 'report', ...reportMeasure, report_text: report.slice(0, 1500) })

// 06 — the Trajectory tab (regression: the run is still traced).
await clickTab(p, 'Trajectory')
await p.waitForTimeout(2500)
await shot(p, '06-trajectory-regression.png')
const trajText = await body(p)
const trajectoryMeasure = {
  tabs: await tabsInfo(p),
  len: trajText.length,
  has_role_rows: /SYSTEM|USER|ASSISTANT/.test(trajText),
  has_timing: /\b(ms|s)\b/.test(trajText) || /Duration/.test(trajText),
  has_workflow_row: /workflow/i.test(trajText),
  crash_hits: crashHits(trajText),
  excerpt: trajText.slice(0, 1200)
}

// 05 — back on Chat: the conversation itself must be unchanged by the round-trip.
await clickTab(p, 'Chat')
await p.waitForTimeout(2500)
await shot(p, '05-chat-regression.png')
const chatAfter = await body(p)
const aAfter = await assistantTexts(p)
const chatMeasure = {
  tabs: await tabsInfo(p),
  has_user_task: (await userTexts(p)).length > 0,
  has_report: aAfter.texts.length > 0,
  report_len_after: aAfter.texts.map((t) => t.length),
  same_report: aAfter.texts.join('\n') === report,
  crash_hits: crashHits(chatAfter)
}

const out = {
  stage: 'A-r2',
  task: TASK,
  url_after: safeUrl(p),
  notice,
  ready,
  settle_seconds: secs,
  tabs_default: tabsDefault,
  tab_labels: tabsDefault.map((t) => t.label),
  default_selected: tabsDefault.filter((t) => t.selected === 'true').map((t) => t.label),
  flow: await flowKinds(p),
  ...reportMeasure,
  trajectory: trajectoryMeasure,
  chat: chatMeasure,
  progress: await progressDom(p),
  layout: await look(p),
  sidebar_rows: await sidebarRows(p)
}
mergeR2(out)
saveStage('stage-a-r2.json', out)
log({ ...out, report_text: out.report_text.slice(0, 2500), flow: out.flow })
await b.close()
