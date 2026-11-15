/**
 * Stage D — ⑥ zero regression on Chat / Trajectory, and a completed row's
 * "Open child session" action really opens the child session.
 */
import { open, dismissNotice, shot, clickTab, openNodeDetail, tabsInfo, loadState, saveState, enterSession } from './lib.mjs'

const state = loadState()
const log = (...a) => console.log(...a)
const { b, p } = await open()
log('NOTICE=' + await dismissNotice(p))
log('ENTER=' + await enterSession(p, state))

// --- Chat tab ---
await clickTab(p, 'Chat')
await p.waitForTimeout(3000)
const chat = await p.locator('body').innerText()
log('CHAT_HAS_TASK=' + chat.includes('scratch-r2.md'))
log('CHAT_HAS_REPORT=' + /档位|工作流|GROK-WORKFLOW|plan→execute→verify|已完成|Completed/.test(chat))
log('CHAT_HAS_TOGGLE_ON=' + chat.includes('Grok workflow ON'))
log('CHAT_HAS_CRASH_TEXT=' + /Cannot read|TypeError|Uncaught|undefined is not/.test(chat))
log('CHAT_LEN=' + chat.length)
await shot(p, '09-chat-regression.png')

// --- Trajectory tab ---
await clickTab(p, 'Trajectory')
await p.waitForTimeout(4000)
const traj = await p.locator('body').innerText()
log('TRAJ_LEN=' + traj.length)
log('TRAJ_HAS_EVENTS=' + /ASSISTANT|TOOL|USER/.test(traj))
log('TRAJ_HAS_WORKFLOW=' + /workflow|agent-start|run-start|tool-workflow/i.test(traj))
log('TRAJ_HAS_CRASH_TEXT=' + /Cannot read|TypeError|Uncaught|undefined is not/.test(traj))
await shot(p, '10-trajectory-regression.png')

// --- completed row → open child session ---
await clickTab(p, 'Progress')
await p.waitForTimeout(1500)
const opened = await openNodeDetail(p, { preferState: 'done', requireRows: true })
log('DETAIL_INDEX=' + opened.index)
log('DETAIL_NODE_STATE=' + opened.state)
log('DETAIL_OPEN_BUTTONS=' + opened.dom.openButtons)
log('DETAIL_ACTIONS=' + JSON.stringify(opened.dom.actionButtons))
const openBtn = p.locator('[data-gw-progress-open]').first()
log('OPEN_CHILD_BUTTONS=' + await openBtn.count())
if (await openBtn.count()) {
  await openBtn.click()
  await p.waitForTimeout(7000)
  const after = await p.locator('body').innerText()
  log('AFTER_OPEN_HAS_BACK=' + /Back|返回|subagent|Subagent/i.test(after))
  log('AFTER_OPEN_TABS=' + JSON.stringify(await tabsInfo(p)))
  log('AFTER_OPEN_HEAD=' + JSON.stringify(after.slice(0, 700)))
  log('AFTER_OPEN_URL_DIFFERS=' + (p.url() !== state.url))
  await shot(p, '11-child-session-opened.png')
} else {
  await shot(p, '11-child-session-opened.png')
  log('NO_OPEN_BUTTON=1')
}
state.detailButtons = opened.dom.actionButtons
state.openedChild = (await openBtn.count()) > 0
saveState(state)
await b.close()
