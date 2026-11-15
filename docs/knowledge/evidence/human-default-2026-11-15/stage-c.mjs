/**
 * Stage C — shot 05 (chat) and shot 06 (trajectory): the zero-regression check.
 *
 * The claim is not "the tabs exist" but "the two tabs that existed before the
 * delivery layer still carry what they carried": the user's own task, the assistant's
 * report, and a trajectory with the run's events. Failure is asserted too — crash text
 * in the transcript is a regression by definition.
 */
import { open, dismissNotice, openSession, body, waitText, shot, tabsInfo, clickTab, mergeState, progressDom, crashHits, log } from './lib.mjs'

const { b, p } = await open({ w: 1440, h: 900 })
await dismissNotice(p)
await openSession(p, 'scratch')
await waitText(p, '下一步：', 60000)

const tabs = await tabsInfo(p)
const chatText = await body(p)
await shot(p, '05-chat-regression.png')

const chatTab = tabs.find((t) => /chat|对话/i.test(t.label))
const trajTab = tabs.find((t) => /trajectory|轨迹/i.test(t.label))
const progTab = tabs.find((t) => /progress|进度/i.test(t.label))

await clickTab(p, trajTab.label)
await p.waitForTimeout(2500)
const trajText = await body(p)
await shot(p, '06-trajectory-regression.png')

await clickTab(p, progTab.label)
const progress = await progressDom(p)
const progressText = await body(p)
await clickTab(p, chatTab.label)

const out = {
  stage: 'C',
  tabs,
  chat: {
    has_user_task: /human-scratch\.md/.test(chatText),
    has_report: /下一步：/.test(chatText),
    has_human_labels: /关键证据：|结果：|需要你知道的：/.test(chatText),
    has_en_mirror: /Done: all|Key evidence:/.test(chatText),
    crash_hits: crashHits(chatText)
  },
  trajectory: {
    len: trajText.length,
    has_role_rows: /SYSTEM|USER|ASSISTANT|TOOL|CONTEXT/.test(trajText),
    has_timing: /Duration|Turns|Calls|Subcalls|turns|steps/i.test(trajText),
    has_workflow_row: /workflow/i.test(trajText),
    crash_hits: crashHits(trajText),
    excerpt: trajText.replace(/\s+/g, ' ').slice(0, 400)
  },
  progress: { ...progress, textLen: progressText.length },
  chat_crash_hits: crashHits(chatText)
}
mergeState(out)
log(out)
await b.close()
