/**
 * Stage D — ⑥ zero regression on Chat / Trajectory, and a completed row's
 * "Open child session" action really opens the child session.
 */
import { open, dismissNotice, shot, clickTab, openNodeDetail, tabsInfo, loadState, saveState } from './lib.mjs'

const state = loadState()
const log = (...a) => console.log(...a)
const { b, p } = await open()
log('NOTICE=' + await dismissNotice(p))
await p.getByText(state.title.slice(0, 10), { exact: false }).first().click().catch(() => {})
await p.waitForTimeout(5000)

// --- Chat tab ---
await clickTab(p, 'Chat')
await p.waitForTimeout(3000)
const chat = await p.locator('body').innerText()
log('CHAT_HAS_TASK=' + chat.includes('h2-scratch2.md'))
log('CHAT_HAS_REPORT=' + /档位|工作流|GROK-WORKFLOW|plan→execute→verify|已完成|Completed/.test(chat))
log('CHAT_HAS_TOGGLE_ON=' + chat.includes('Grok workflow ON'))
log('CHAT_HAS_CRASH_TEXT=' + /Cannot read|TypeError|Uncaught|undefined is not/.test(chat))
await shot(p, '09-chat-regression.png')

// --- Trajectory tab ---
await clickTab(p, 'Trajectory')
await p.waitForTimeout(4000)
const traj = await p.locator('body').innerText()
log('TRAJ_LEN=' + traj.length)
log('TRAJ_HAS_EVENTS=' + /ASSISTANT|TOOL|USER/.test(traj))
log('TRAJ_HAS_WORKFLOW=' + /workflow|agent-start|run-start|tool-workflow/i.test(traj))
await shot(p, '10-trajectory-regression.png')

// --- completed row → open child session ---
await clickTab(p, 'Progress')
await p.waitForTimeout(1500)
const opened = await openNodeDetail(p, { preferState: 'done', requireRows: true })
const detail = await p.evaluate(() => {
  const d = document.querySelector('.gw-progress-detail')
  if (!d) return null
  const buttons = Array.from(d.querySelectorAll('button')).map((x) => ({ text: (x.innerText || '').trim(), disabled: x.disabled }))
  return { buttons, text: (d.innerText || '').slice(0, 900) }
})
log('DETAIL_BUTTONS=' + JSON.stringify(detail && detail.buttons))
const openBtn = p.locator('.gw-progress-detail button', { hasText: /Open child session|打开子会话/ }).first()
log('OPEN_CHILD_BUTTONS=' + await openBtn.count())
if (await openBtn.count()) {
  await openBtn.click()
  await p.waitForTimeout(6000)
  const after = await p.locator('body').innerText()
  log('AFTER_OPEN_HAS_BACK=' + /Back|返回|subagent|Subagent/i.test(after))
  log('AFTER_OPEN_TABS=' + JSON.stringify(await tabsInfo(p)))
  log('AFTER_OPEN_HEAD=' + JSON.stringify(after.slice(0, 700)))
  await shot(p, '11-child-session-opened.png')
} else {
  await shot(p, '11-child-session-opened.png')
  log('NO_OPEN_BUTTON=1')
}
state.detailButtons = detail && detail.buttons
saveState(state)
await b.close()
