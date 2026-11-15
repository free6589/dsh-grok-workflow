/**
 * Stage B2 — the team run again, this time against a path inside the session's own
 * workspace, so the run reaches its own `done` outcome instead of failing on a sandbox
 * boundary. Same session as stage A/B, same real engine, nothing mocked.
 *
 * The first attempt (stage-b.log.txt) is kept: it failed because the executor was asked to
 * write outside the session workspace, and that run is the real source of the `failed`
 * frame. This run supplies the completed-run frames the panel's detail view is read from.
 */
import { open, dismissNotice, send, waitText, shot, clickTab, progressDom, loadState, saveState, enterSession } from './lib.mjs'

const state = loadState()
const TASK = '只做一件小事：在本工作区根目录创建文件 r2-todos.md，写入三行待办（每行以 - 开头），然后读回该文件确认内容。不要改动任何其它文件。'
const { b, p } = await open()
const log = (...a) => console.log(...a)

log('NOTICE=' + await dismissNotice(p))
log('ENTER=' + await enterSession(p, state))
await clickTab(p, 'Chat')
log('ENTER_HAS_GREETING=' + (await p.locator('body').innerText()).includes('打个招呼'))

await send(p, '/grok on')
log('GROK_ON=' + await waitText(p, 'Grok workflow ON', 60000))
await p.waitForTimeout(2500)

await send(p, TASK)
log('TASK_SENT=1')
await p.waitForTimeout(1200)
await clickTab(p, 'Progress')

const timeline = []
let firstShot = false
let lastKey = ''
let lastChange = Date.now()
const start = Date.now()
const LIMIT = 12 * 60 * 1000

while (Date.now() - start < LIMIT) {
  const dom = await progressDom(p)
  const key = `${dom.percent}|${dom.states.join(',')}|${dom.nodeCount}`
  const t = Math.round((Date.now() - start) / 1000)
  if (key !== lastKey) {
    lastKey = key
    lastChange = Date.now()
    timeline.push({ t, percent: dom.percent, states: dom.states, nodes: dom.nodes.map((n) => `${n.label}:${n.state}`) })
    log(`T+${t}s states=${JSON.stringify(dom.states)} percent=${JSON.stringify(dom.percent)} nodes=${dom.nodeCount}`)
  }
  const triple = ['pending', 'doing', 'done'].every((s) => dom.states.includes(s))
  if (!firstShot && triple) {
    firstShot = true
    await shot(p, '03-progress-pending-doing-done.png')
    log('SHOT_03_T+' + t)
  }
  if (dom.nodeCount > 0 && !dom.states.includes('doing') && Date.now() - lastChange > 20000) break
  await p.waitForTimeout(1000)
}

const final = await progressDom(p)
log('TRIPLE_SEEN=' + firstShot)
log('FINAL_PERCENT=' + JSON.stringify(final.percent))
log('FINAL_PERCENT_ATTR=' + JSON.stringify(final.percentAttr))
log('FINAL_STATES=' + JSON.stringify(final.states))
log('FINAL_NODES=' + JSON.stringify(final.nodes))
log('FINAL_CLASSES_AGREE=' + final.agree)
log('TIMELINE=' + JSON.stringify(timeline))
await shot(p, '04-progress-run-settled.png')
state.timeline2 = timeline
state.finalNodes2 = final.nodes
state.finalPercent2 = final.percent
state.finalStates2 = final.states
state.tripleSeen2 = firstShot
saveState(state)

await clickTab(p, 'Chat')
await p.waitForTimeout(6000)
await shot(p, '05-chat-with-run-report.png')
log('CHAT_TAIL=' + JSON.stringify((await p.locator('body').innerText()).slice(-1400)))
await b.close()
