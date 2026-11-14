/**
 * Stage E — try to reach the derived `blocked` state with a real user action: stop a run
 * while a row is still unsettled (no mock; the engine's own abort path).
 */
import { open, dismissNotice, send, waitText, shot, clickTab, progressDom, loadState, saveState } from './lib.mjs'

const state = loadState()
const TASK = '读一遍 README.md 的前 40 行，然后把要点整理成 5 条写进 /home/fish/projects_mine/dsh-grok-workflow/.dsh-home/h2-summary.md，最后读回确认。'
const { b, p } = await open()
const log = (...a) => console.log(...a)

log('NOTICE=' + await dismissNotice(p))
await p.getByText(state.title.slice(0, 10), { exact: false }).first().click().catch(() => {})
await p.waitForTimeout(4000)
await clickTab(p, 'Chat')
await send(p, '/grok on')
log('GROK_ON=' + await waitText(p, 'Grok workflow ON', 60000))
await p.waitForTimeout(2000)
await send(p, TASK)
log('TASK_SENT=1')
await p.waitForTimeout(1000)
await clickTab(p, 'Progress')

let sawDoing = false
for (let i = 0; i < 60; i++) {
  const dom = await progressDom(p)
  if (dom.states.includes('doing')) { sawDoing = true; log('DOING_AT_T+' + i); break }
  await p.waitForTimeout(1000)
}
log('SAW_DOING=' + sawDoing)
await shot(p, '12-before-stop.png')

const stop = p.locator('button[aria-label*="Stop" i], button[title*="Stop" i], button[aria-label*="停止"]')
const n = await stop.count()
log('STOP_BUTTONS=' + n)
if (n > 0) {
  await stop.first().click()
  log('CLICKED_STOP=1')
} else {
  // The composer's trailing round button is the stop control while a turn is running.
  const round = p.locator('button').filter({ hasText: '' }).last()
  await round.click().catch(() => {})
  log('CLICKED_FALLBACK=1')
}
await p.waitForTimeout(12000)
await shot(p, '13-progress-after-stop.png')

let dom = await progressDom(p)
log('AFTER_STOP_STATES=' + JSON.stringify(dom.states))
log('AFTER_STOP_PERCENT=' + JSON.stringify(dom.percent))
log('AFTER_STOP_NODES=' + JSON.stringify(dom.nodes))
for (let i = 0; i < 20; i++) {
  await p.waitForTimeout(2000)
  const d = await progressDom(p)
  if (JSON.stringify(d.states) !== JSON.stringify(dom.states) || d.percent !== dom.percent) {
    dom = d
    log(`CHANGE_T+${(i + 1) * 2}s states=${JSON.stringify(d.states)} percent=${JSON.stringify(d.percent)}`)
  }
}
await shot(p, '14-progress-after-stop-settled.png')
log('FINAL_STATES=' + JSON.stringify(dom.states))
log('FINAL_NODES=' + JSON.stringify(dom.nodes))
log('FINAL_PERCENT=' + JSON.stringify(dom.percent))

await clickTab(p, 'Chat')
await p.waitForTimeout(4000)
await shot(p, '14-chat-after-stop.png')
log('CHAT_TAIL=' + JSON.stringify((await p.locator('body').innerText()).slice(-900)))
state.stop = { states: dom.states, percent: dom.percent, nodes: dom.nodes }
saveState(state)
await b.close()
