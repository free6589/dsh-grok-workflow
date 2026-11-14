/**
 * Stage A — ① three view tabs coexist with Chat as the default, ② Progress empty state.
 *
 * Starts a real session with the grok workflow still OFF, so the session carries no
 * tool-workflow event and the progress track is genuinely empty.
 */
import { open, dismissNotice, send, waitText, shot, tabsInfo, clickTab, progressDom, loadState, saveState } from './lib.mjs'

const state = loadState()
const { b, p } = await open()
const log = (...a) => console.log(...a)

log('NOTICE=' + await dismissNotice(p))
await p.getByText('New Session', { exact: false }).first().click().catch(() => {})
await p.waitForTimeout(3000)
await send(p, '你好，只打个招呼，不要做任何事。')
log('REPLY_SEEN=' + await waitText(p, '你好', 120000))
await p.waitForTimeout(5000)

const tabs = await tabsInfo(p)
log('A2_TABS=' + JSON.stringify(tabs))
log('A2_TAB_COUNT=' + tabs.length)
log('A2_DEFAULT_SELECTED=' + JSON.stringify(tabs.filter((t) => t.selected === 'true').map((t) => t.label)))
log('A2_PROGRESS_TAB_EXISTS=' + tabs.some((t) => t.label === 'Progress'))
await shot(p, '01-three-tabs-default-chat.png')

// Session title for later stages.
const title = await p.evaluate(() => {
  const row = document.querySelector('[role="treeitem"][aria-selected="true"]')
  return row ? (row.innerText || '').split('\n')[0].trim() : null
})
log('A3_SESSION_TITLE=' + JSON.stringify(title))
state.title = title
saveState(state)

// ② empty state on the same (event-free) session.
await clickTab(p, 'Progress')
await p.waitForTimeout(2500)
const dom = await progressDom(p)
log('A4_PROGRESS_DOM=' + JSON.stringify(dom))
log('A4_EMPTY_STATE=' + (dom.present === true && dom.nodeCount === 0 && !!dom.emptyText))
await shot(p, '02-progress-empty.png')

const after = await tabsInfo(p)
log('A5_TABS_AFTER=' + JSON.stringify(after))

await b.close()
