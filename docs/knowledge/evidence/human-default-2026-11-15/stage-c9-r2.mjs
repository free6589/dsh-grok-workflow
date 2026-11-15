/**
 * Stage C9 (retry) — retake shot 07 without the sidebar hover card.
 *
 * Stage C8's 07 was taken with the pointer resting on a sidebar row, so the app's session
 * preview card covered part of the answer. Nothing about the page changed here: the mouse is
 * parked in empty space and the same answer is photographed again.
 */
import { open, dismissNotice, shot, assistantTexts, log } from './lib.mjs'
import { waitReady, mergeR2, saveStage } from './r2-lib.mjs'

const { b, p } = await open()
await dismissNotice(p)
await waitReady(p)
await p.waitForTimeout(3500)

let opened = false
for (const frag of ['human-scratch-r2f', 'r2f.md', '待办']) {
  const row = p.getByText(frag, { exact: false }).first()
  if (!(await row.count())) continue
  await row.click().catch(() => {})
  for (let i = 0; i < 20; i += 1) {
    if (await p.locator('[data-chat-flow-kind="assistant-step"]').count() > 0) { opened = true; break }
    await p.waitForTimeout(1000)
  }
  if (opened) break
}

await p.mouse.move(1150, 860)
await p.waitForTimeout(600)
await p.evaluate(() => {
  const n = document.querySelector('[data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]')
  if (n) n.scrollIntoView({ block: 'start' })
})
await p.waitForTimeout(1500)
await shot(p, '07-diagnostics-on-report-head.png')

const a = await assistantTexts(p)
const out = {
  stage: 'C9-r2',
  opened,
  responses: a.texts.length,
  answer_len: a.texts.map((t) => t.length),
  answer_has_ledger: /Model routes:|Deadline:/.test(a.texts.join('\n')),
  note: 'retake of 07 with the pointer parked away from the sidebar, so no hover card covers the answer'
}
mergeR2(out)
saveStage('stage-c9-r2.json', out)
log(out)
await b.close()
