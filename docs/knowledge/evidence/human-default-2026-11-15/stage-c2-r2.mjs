/**
 * Stage C2 (retry) — the diagnostics contrast, flipped by the switch the page exposes.
 *
 * Sequence, all on one instance and one session:
 *   1. Plugins → Grok workflow → "More · Defaults are fine" → tick **Machine diagnostics**
 *      → press the pending "Save (1)" button. The page is generated from this plugin's
 *      own `Config` schema and applies live, so this is the same path a user takes.
 *   2. Re-read the profile layer the page writes to (proof the switch persisted).
 *   3. Send a second small team task in the same session.
 *   4. shots 07 (report head) and 08 (the ledger, which is the contrast subject).
 *
 * The first turn stays in the transcript as the control: it was produced while the
 * switch was off, so "the same session shows both forms" is measured, not asserted.
 */
import fs from 'node:fs'
import { open, dismissNotice, send, body, settle, shot, tabsInfo, assistantTexts,
  userTexts, stripHits, humanHits, crashHits, redact, log } from './lib.mjs'
import { waitReady, openSessionRow, mergeR2, saveStage } from './r2-lib.mjs'

const PROFILE = '/home/fish/projects_mine/dsh-grok-workflow/.tmp/human-home-r2/profiles/ghuman/cordis.patch.yml'
const TASK2 = '小任务，请团队再跑两步：第一步，往 .tmp/human-scratch-r2b.md 里写两行待办，每行以 - 开头。第二步，用 stat -c \'%s\' 取回它的字节数，并把这条命令的原始输出当成证据记下来。'

const LEDGER_LABELS = ['Grok workflow:', 'Objective:', 'Plan:', 'Model routes:', 'Deadline:', 'Confirmed evidence:']
const LEDGER_RE = /Grok workflow:|Objective:|Model routes:|Deadline:|Confirmed evidence:|Route switches:|Uncertainties:|Errors:/

const { b, p } = await open()
await dismissNotice(p)
await waitReady(p)

// 1 — flip the switch through the generated settings page.
await p.getByRole('button', { name: 'Plugins' }).first().click().catch(() => {})
await p.waitForTimeout(2500)
await p.getByText('Grok workflow', { exact: false }).first().click().catch(() => {})
await p.waitForTimeout(2500)
const more = p.getByText('More · Defaults are fine', { exact: false }).first()
if (await more.count()) { await more.click().catch(() => {}); await p.waitForTimeout(2500) }

const labelOf = (idx) => p.evaluate((i) => {
  const el = document.querySelectorAll('input[type="checkbox"]')[i]
  if (!el) return null
  let node = el
  for (let up = 0; up < 6; up += 1) {
    node = node.parentElement
    if (!node) break
    const t = (node.innerText || '').trim().replace(/\s+/g, ' ')
    if (t.length > 6) return { checked: el.checked, label: t.slice(0, 160) }
  }
  return { checked: el.checked, label: null }
}, idx)

const rows = await p.evaluate(() => Array.from(document.querySelectorAll('input[type="checkbox"]')).map((el, i) => i))
let targetIdx = null
for (const i of rows) {
  const lab = await labelOf(i)
  if (lab && /machine diagnostics|诊断/i.test(lab.label || '')) { targetIdx = i; break }
}
if (targetIdx === null) throw new Error('the Machine diagnostics switch was not found on the generated settings page')
const beforeFlip = await labelOf(targetIdx)
const box = p.locator('input[type="checkbox"]').nth(targetIdx)
await box.scrollIntoViewIfNeeded().catch(() => {})
await box.click({ force: true }).catch(() => {})
await p.waitForTimeout(1500)
const afterTick = await labelOf(targetIdx)

const saveBtn = p.getByRole('button', { name: /Save \(/ })
const saveCount = await saveBtn.count()
if (saveCount) { await saveBtn.first().click().catch(() => {}); await p.waitForTimeout(4000) }
const afterSave = await labelOf(targetIdx)
const profileLayer = fs.existsSync(PROFILE) ? fs.readFileSync(PROFILE, 'utf8') : null
log({ step: 'flip', targetIdx, beforeFlip, afterTick, saveCount, afterSave, profile_layer: profileLayer })

// 2 — back to the session and run the second task.
const reopened = await openSessionRow(p, '创建 huma', 45000)
const responsesBefore = (await assistantTexts(p)).texts.length
await send(p, TASK2)
const quiet = await settle(p, 600000, 5)
await p.waitForTimeout(1500)

const a = await assistantTexts(p)
const fresh = a.texts.slice(responsesBefore)
const turn2 = fresh.join('\n')
const turn1 = a.texts[0] || ''

const scrollToSecond = await p.evaluate(() => {
  const nodes = Array.from(document.querySelectorAll('[data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]'))
  const last = nodes[nodes.length - 1]
  if (!last) return false
  last.scrollIntoView({ block: 'start' })
  return true
})
await p.waitForTimeout(1500)
await shot(p, '07-diagnostics-on-report-head.png')

const ruleSeen = await p.evaluate(() => {
  const nodes = Array.from(document.querySelectorAll('[data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]'))
  const last = nodes[nodes.length - 1]
  if (!last) return false
  const anchor = Array.from(last.querySelectorAll('*')).filter((e) => e.children.length === 0 && /Grok workflow:|Model routes:/.test(e.textContent || '')).pop()
  if (!anchor) return false
  anchor.scrollIntoView({ block: 'center' })
  return true
})
await p.waitForTimeout(1500)
await shot(p, '08-diagnostics-ledger-visible.png')

const out = {
  stage: 'C2-r2',
  switch: {
    label: beforeFlip && beforeFlip.label,
    before: beforeFlip && beforeFlip.checked,
    after_tick: afterTick && afterTick.checked,
    save_button: saveCount > 0,
    after_save: afterSave && afterSave.checked,
    profile_layer_written: /showDiagnostics:\s*true/.test(profileLayer || ''),
    profile_layer: redact(profileLayer || '')
  },
  task2: TASK2,
  reopened,
  settle_quiet: quiet,
  responses_total: a.texts.length,
  responses_before: responsesBefore,
  turn2_len: turn2.length,
  turn2_text: turn2,
  turn2_ledger_labels: LEDGER_LABELS.filter((l) => turn2.includes(l)),
  turn2_ledger_re: LEDGER_RE.test(turn2),
  turn2_has_rule: /\n---\n|^---$/m.test(turn2),
  turn2_human_landmarks: humanHits([turn2]),
  turn2_strip_violations: stripHits([turn2]),
  turn1_len: turn1.length,
  turn1_ledger_absent: !LEDGER_RE.test(turn1),
  turn1_human_landmarks: humanHits([turn1]),
  turn1_strip_violations: stripHits([turn1]),
  user_bubbles: (await userTexts(p)).length,
  tabs: await tabsInfo(p),
  crash_hits: crashHits(await body(p)),
  scrolled: scrollToSecond,
  ledger_scrolled: ruleSeen
}
mergeR2(out)
saveStage('stage-c2-r2.json', out)
log({ ...out, turn2_text: out.turn2_text.slice(0, 3000) })
await b.close()
