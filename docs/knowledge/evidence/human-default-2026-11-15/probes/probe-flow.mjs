/** Discovery probe (not a deliverable): enumerate chat flow kinds and dump the assistant text raw. */
import { open, dismissNotice, log } from '../lib.mjs'

const { b, p } = await open()
await dismissNotice(p)
const row = p.getByText('scratch.md', { exact: false }).first()
if (await row.count()) { await row.click(); await p.waitForTimeout(5000) }

const kinds = await p.evaluate(() => Array.from(document.querySelectorAll('[data-chat-flow-kind]')).map((e) => ({
  kind: e.getAttribute('data-chat-flow-kind'),
  turn: e.getAttribute('data-chat-turn'),
  part: e.getAttribute('data-chat-group-part'),
  len: (e.innerText || '').length,
  head: (e.innerText || '').trim().slice(0, 50)
})))
log({ step: 'flow_kinds', kinds })

const assistant = await p.evaluate(() => Array.from(document.querySelectorAll('[data-chat-flow-kind="assistant-step"]')).map((e) => e.innerText))
log({ step: 'assistant_count', n: assistant.length })
log({ step: 'assistant_raw', texts: assistant.map((t) => t) })
await b.close()
