/**
 * DOM probe #7 — retry `/grok on` inside an existing session on the packed build.
 */
import { open, dismissNotice, send, waitText, shot, loadState } from './lib.mjs'

const state = loadState()
const { b, p } = await open()
const log = (...a) => console.log(...a)
log('NOTICE=' + await dismissNotice(p))
log('OPEN=' + await p.getByText(state.title.slice(0, 10), { exact: false }).first().click().then(() => true).catch(() => false))
await p.waitForTimeout(5000)
await send(p, '/grok on')
log('GROK_ON=' + await waitText(p, 'Grok workflow ON', 45000))
const t = await p.locator('body').innerText()
log('TAIL=' + JSON.stringify(t.slice(-700)))
await shot(p, 'probe-grok-on-existing.png')
await b.close()
