/**
 * Stage B — ③ a real small task run by the workflow team produces pending / doing / done
 * on the Progress tab. Nothing is mocked: the model really answers through the local
 * gateway, the workflow engine really spawns the child agents, and the plugin's recorder
 * really writes the `tool-workflow/*` events the tab folds.
 */
import { open, dismissNotice, send, waitText, shot, clickTab, progressDom, loadState, saveState } from './lib.mjs'

const state = loadState()
const TASK = '只做一件小事：在文件 /home/fish/projects_mine/dsh-grok-workflow/.dsh-home/h2-scratch2.md 里写入三行待办（每行以 - 开头），然后读回该文件确认内容。除此之外不要改动任何其它文件。'
const { b, p } = await open()
const log = (...a) => console.log(...a)

log('NOTICE=' + await dismissNotice(p))
log('OPEN_SESSION=' + await p.getByText(state.title.slice(0, 10), { exact: false }).first().click().then(() => true).catch(() => false))
await p.waitForTimeout(4000)
await clickTab(p, 'Chat')

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
const LIMIT = 9 * 60 * 1000

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
    state.shot03 = timeline[timeline.length - 1]
    saveState(state)
  }
  // Settled: no 'doing' left and the DOM stopped changing for 20s.
  if (dom.nodeCount > 0 && !dom.states.includes('doing') && Date.now() - lastChange > 20000) break
  await p.waitForTimeout(1000)
}

const final = await progressDom(p)
log('FINAL_PERCENT=' + JSON.stringify(final.percent))
log('FINAL_STATES=' + JSON.stringify(final.states))
log('FINAL_NODES=' + JSON.stringify(final.nodes))
log('TIMELINE=' + JSON.stringify(timeline))
await shot(p, '04-progress-run-settled.png')
state.timeline = timeline
state.finalNodes = final.nodes
state.finalPercent = final.percent
state.finalStates = final.states
saveState(state)

await clickTab(p, 'Chat')
await p.waitForTimeout(5000)
await shot(p, '05-chat-with-run-report.png')
log('CHAT_TAIL=' + JSON.stringify((await p.locator('body').innerText()).slice(-1600)))
await b.close()
