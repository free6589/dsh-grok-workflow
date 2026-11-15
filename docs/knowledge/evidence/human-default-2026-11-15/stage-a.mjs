/**
 * Stage A — shot 01 (three tabs coexist, Chat default) and shot 02 (team small task,
 * human-default report).
 *
 * One message does both: with `mode: full` + `grokDefault: on` in the overlay the
 * message IS the team run, and the run creates the session (the tab strip only exists
 * once a session does), so the strip and the report are the same moment.
 *
 * Idempotent: if the session already carries a delivered report, stage A re-captures
 * it instead of starting a second run, so re-running the stage does not stack runs.
 */
import {
  open, dismissNotice, openSession, send, body, waitText, settle, shot, tabsInfo, clickTab,
  assistantTexts, userTexts, stripHits, residueHits, humanHits, flowKinds, progressDom,
  scrollReportStart, mergeState, log
} from './lib.mjs'

const TASK = '小任务，请团队跑完这两步：第一步，在仓库的 .tmp/human-home/human-scratch.md 里写三行待办，每行以 - 开头。第二步，用 stat -c \'%s\' 取回该文件的字节数、用 sha256sum 取回它的摘要，并把这两条命令的原始输出当成证据记下来。'

const { b, p } = await open()
log({ step: 'notice', dismissed: await dismissNotice(p) })
const tabsHome = await tabsInfo(p)
log({ step: 'home', tabs: tabsHome })

// Reopen the run's session; the app boots into a new one, so this is required.
const opened = await openSession(p, 'scratch')
log({ step: 'opened_session', opened })

let ran = false
if (!(await body(p)).includes('下一步：')) {
  await send(p, TASK)
  ran = true
  log({ step: 'sent', task: TASK })
  log({ step: 'report_appeared', sawReport: await waitText(p, '下一步：', 300000) })
  log({ step: 'turn_settled', quiet: await settle(p) })
} else {
  log({ step: 'run_already_present', replayed: true })
}

// 01 — the tab strip with Chat selected, over the run's transcript.
const tabsAfter = await tabsInfo(p)
await p.evaluate(() => {
  const first = document.querySelector('[data-chat-flow-kind="user"]')
  if (first) first.scrollIntoView({ block: 'start' })
})
await p.waitForTimeout(1200)
await shot(p, '01-three-tabs-default-chat.png')

// The third tab is real, not a painted label: open it, read it, come back.
const progressTab = tabsAfter.find((t) => /progress|进度/i.test(t.label))
await clickTab(p, progressTab.label)
const progressSeen = await progressDom(p)
const tabsOnProgress = await tabsInfo(p)
const chatTab = tabsAfter.find((t) => /chat|对话/i.test(t.label))
await clickTab(p, chatTab.label)
const tabsBack = await tabsInfo(p)

// 02 — the delivered report itself, scrolled to its own head.
const scrolled = await scrollReportStart(p)
await p.waitForTimeout(1200)
await shot(p, '02-human-default-report.png')

const A = await assistantTexts(p)
const U = await userTexts(p)
const strip = stripHits(A.texts)
const residue = residueHits(A.texts)
const humans = humanHits(A.texts)
const whole = await body(p)

const out = {
  stage: 'A',
  task: TASK,
  ran_this_invocation: ran,
  tabs_home: tabsHome,
  tabs_after_run: tabsAfter,
  tabs_on_progress: tabsOnProgress,
  tabs_after_click_back: tabsBack,
  tab_count: tabsAfter.length,
  tab_labels: tabsAfter.map((t) => t.label),
  default_selected: tabsAfter.filter((t) => t.selected === 'true').map((t) => t.label),
  progress_tab_live: progressSeen.present,
  progress_seen: progressSeen,
  assistant_selector: A.selector,
  assistant_node_count: A.count,
  assistant_response_count: A.texts.length,
  assistant_texts: A.texts,
  user_bubble_texts: U,
  report_len: A.texts.map((t) => t.length),
  report_scrolled: scrolled,
  human_landmarks: humans,
  strip_violations: strip,
  residue_findings: residue,
  strip_clean: strip.length === 0,
  human_block_present: humans.length > 0,
  user_bubble_has_machine_words: /stat -c|sha256sum/.test(U.join('\n')),
  whole_body_has_markers: /<<<[A-Z-]*GROK-WORKFLOW[A-Z-]*>>>/.test(whole),
  flow: await flowKinds(p)
}
mergeState(out)
log({ ...out, assistant_texts: out.assistant_texts.map((t) => t.slice(0, 400)), flow: out.flow })
await b.close()
