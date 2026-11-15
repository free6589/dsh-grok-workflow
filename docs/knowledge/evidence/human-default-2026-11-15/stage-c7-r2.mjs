/**
 * Stage C7 (retry) — shot 07/08 for the diagnostics contrast, given what the transcript shows.
 *
 * Measured chain (README section 3):
 *   * with `showDiagnostics: true` the gate payload really carries the ledger — the session
 *     archive holds a `user/message` whose marked text ends with `Uncertainties:`,
 *     `Model routes: …`, `Deadline: 900000 ms per run`;
 *   * the relayed answer does not: the stored `assistant/message` for that turn has no
 *     ledger label and no `---` rule, so the reader-visible form is the human block alone.
 *
 * So 07 is the reader-facing answer with the switch ON, and 08 is the transcript row that
 * holds the ledger. If the row does not expand on click, its text is revealed in the DOM
 * (the row is clipped to one line by CSS) and the shot is labelled as such — the text in it
 * is verbatim from the transcript, never retyped.
 */
import { open, dismissNotice, shot, clickTab, tabsInfo, assistantTexts, userTexts,
  body, crashHits, log } from './lib.mjs'
import { waitReady, mergeR2, saveStage } from './r2-lib.mjs'

const LEDGER_RE = /Grok workflow:|Objective:|Model routes:|Deadline:|Confirmed evidence:/

const { b, p } = await open()
await dismissNotice(p)
await waitReady(p)

// The app boots into a new session; the run under the switch is the newest sidebar row.
let opened = false
let openedBy = null
await p.waitForTimeout(3500)
for (const frag of ['human-scratch-r2f', 'r2f.md', '待办', 'Session Title']) {
  const row = p.getByText(frag, { exact: false }).first()
  const n = await row.count()
  if (!n) continue
  await row.click().catch(() => {})
  for (let i = 0; i < 20; i += 1) {
    if (await p.locator('[data-chat-flow-kind="assistant-step"]').count() > 0) { opened = true; break }
    await p.waitForTimeout(1000)
  }
  openedBy = frag
  if (opened) break
}
const rowCount = opened ? 1 : 0
const answer = await assistantTexts(p)
const answerText = answer.texts.join('\n')
log({ step: 'opened', rowCount, opened, responses: answer.texts.length, answer_len: answerText.length,
  answer_has_ledger: LEDGER_RE.test(answerText) })

await p.evaluate(() => {
  const n = document.querySelector('[data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]')
  if (n) n.scrollIntoView({ block: 'start' })
})
await p.waitForTimeout(1500)
await shot(p, '07-diagnostics-on-report-head.png')

// Trajectory: find the row that holds the gate payload.
await clickTab(p, 'Trajectory')
await p.waitForTimeout(2500)
const located = await p.evaluate(() => {
  const leaves = Array.from(document.querySelectorAll('body *')).filter((e) => e.children.length === 0)
  const hit = leaves.find((e) => /mandatory workflow gate finished/.test(e.textContent || ''))
  if (!hit) return { found: false, ledgerInDom: false }
  hit.scrollIntoView({ block: 'center' })
  const full = hit.textContent || ''
  return {
    found: true,
    ledgerInDom: /Model routes:|Deadline:/.test(full),
    textLen: full.length,
    isClipped: hit.clientHeight + 2 < hit.scrollHeight,
    tag: hit.tagName,
    cls: (hit.className || '').toString().slice(0, 80)
  }
})
let expandedByClick = false
if (located.found) {
  await p.waitForTimeout(1200)
  const leaf = p.locator('text=/mandatory workflow gate finished/').first()
  await leaf.click({ force: true }).catch(() => {})
  await p.waitForTimeout(2000)
  expandedByClick = await p.evaluate(() => {
    const leaves = Array.from(document.querySelectorAll('body *')).filter((e) => e.children.length === 0)
    const hit = leaves.find((e) => /mandatory workflow gate finished/.test(e.textContent || ''))
    return hit ? !(hit.clientHeight + 2 < hit.scrollHeight) : false
  })
}

let forcedReveal = false
if (located.found && !expandedByClick) {
  // The row is clipped to one line; reveal it so the ledger inside it is legible. The
  // text is the transcript's own, unchanged.
  forcedReveal = await p.evaluate(() => {
    const leaves = Array.from(document.querySelectorAll('body *')).filter((e) => e.children.length === 0)
    const hit = leaves.find((e) => /mandatory workflow gate finished/.test(e.textContent || ''))
    if (!hit) return false
    hit.style.whiteSpace = 'pre-wrap'
    hit.style.overflow = 'visible'
    hit.style.textOverflow = 'clip'
    hit.style.maxHeight = 'none'
    let n = hit.parentElement
    for (let i = 0; i < 4 && n; i += 1) {
      n.style.overflow = 'visible'
      n.style.maxHeight = 'none'
      n = n.parentElement
    }
    hit.scrollIntoView({ block: 'center' })
    return true
  })
  await p.waitForTimeout(1500)
}
await shot(p, '08-diagnostics-ledger-visible.png')

const trajText = await body(p)
const out = {
  stage: 'C7-r2',
  what_07_shows: 'the reader-facing answer of the run whose composed config has showDiagnostics: true (human block only)',
  what_08_shows: 'the transcript row that carries the gate payload, i.e. where the ledger for that run actually lives',
  revealed_by: expandedByClick ? 'click (the row expanded by itself)' : (forcedReveal ? 'DOM reveal: the row is clipped to one line by CSS, its text was shown in full for legibility' : 'nothing (not found)'),
  opened,
  sidebar_rows_matched: rowCount,
  opened_by: openedBy,
  answer_len: answerText.length,
  answer_has_ledger: LEDGER_RE.test(answerText),
  answer_tail: answerText.slice(-260),
  transcript_row: located,
  transcript_has_ledger: /Model routes:|Deadline:/.test(trajText),
  tabs: await tabsInfo(p),
  user_bubbles: (await userTexts(p)).length,
  crash_hits: crashHits(trajText)
}
mergeR2(out)
saveStage('stage-c7-r2.json', out)
log(out)
await b.close()
