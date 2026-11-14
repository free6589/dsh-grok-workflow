/**
 * DOM probe #6 — does `/grok on` take effect on the packed build (mode record write path)?
 */
import { open, dismissNotice, send, waitText, shot } from './lib.mjs'

const { b, p } = await open()
const log = (...a) => console.log(...a)
log('NOTICE=' + await dismissNotice(p))
await p.getByText('New Session', { exact: false }).first().click().catch(() => {})
await p.waitForTimeout(3000)
await send(p, '/grok on')
log('GROK_ON=' + await waitText(p, 'Grok workflow ON', 45000))
const t = await p.locator('body').innerText()
log('TAIL=' + JSON.stringify(t.slice(-500)))
await shot(p, 'probe-grok-on-packed.png')
await b.close()
