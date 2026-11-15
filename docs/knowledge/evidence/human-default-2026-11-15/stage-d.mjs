/**
 * Stage D — shots 07/08: the diagnostics contrast.
 *
 * Same task, same session, same model; the only difference is output switch 2/2
 * (`showDiagnostics`), flipped on in the profile layer — the layer the plugin's own
 * settings page writes to. The default form (shot 02) carries the human block alone;
 * with the switch on, `src/delivery/index.ts:deliverReport` puts the machine ledger
 * inside the markers too, so the reader sees it.
 *
 * The stage asserts BOTH directions: the ledger labels must be present, and the run
 * must be a genuinely new run (a second assistant response), not a re-read of turn 1.
 */
import {
  open, dismissNotice, openSession, send, body, waitText, settle, shot, tabsInfo,
  assistantTexts, stripHits, residueHits, flowKinds, mergeState, scrollReportStart, log
} from './lib.mjs'

const TASK = '小任务，请团队跑完这两步：第一步，在仓库的 .tmp/human-home/human-scratch.md 里写三行待办，每行以 - 开头。第二步，用 stat -c \'%s\' 取回该文件的字节数、用 sha256sum 取回它的摘要，并把这两条命令的原始输出当成证据记下来。'

const LEDGER_LABELS = ['Grok workflow:', 'Objective:', 'Plan:', 'Model routes:', 'Deadline:', 'Confirmed evidence:']
const LEDGER_LABEL_RE = /Grok workflow:|Objective:|Plan:|Model routes:|Deadline:|Confirmed evidence:|Route switches:|Route overflows|Uncertainties:|Errors:/

const { b, p } = await open()
await dismissNotice(p)
const opened = await openSession(p, 'scratch')
await waitText(p, '下一步：', 60000)

const before = await assistantTexts(p)
log({ step: 'before_switch', responses: before.texts.length })

// Run twice under the switch, so a single flaky turn cannot pass the stage.
await send(p, TASK)
log({ step: 'sent_second_run', sawReport: await waitText(p, '下一步：', 300000) })
log({ step: 'settled', quiet: await settle(p) })

const after = await assistantTexts(p)
const second = after.texts.slice(before.texts.length)
const turnTexts = second.filter((t) => t !== '')
const joined = turnTexts.join('\n')

const scroll = await scrollReportStart(p)
await p.waitForTimeout(1200)
await shot(p, '07-diagnostics-on-report-head.png')

// Scroll so the ledger itself is on screen: that block is the contrast subject.
const ruleSeen = await p.evaluate(() => {
  const nodes = Array.from(document.querySelectorAll('[data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]'))
  const last = nodes[nodes.length - 1]
  if (!last) return false
  const walk = Array.from(last.querySelectorAll('*')).filter((e) => e.children.length === 0 && /^\s*---\s*$/.test(e.textContent || '')).pop()
  const anchor = walk || Array.from(last.querySelectorAll('*')).filter((e) => e.children.length === 0 && /Model routes:/.test(e.textContent || '')).pop()
  if (!anchor) return false
  anchor.scrollIntoView({ block: 'center' })
  return true
})
await p.waitForTimeout(1200)
await shot(p, '08-diagnostics-ledger-visible.png')

const ledgerLabels = LEDGER_LABELS.filter((l) => joined.includes(l))
const machineInLedger = {
  statCommand: /\bstat\s+-/.test(joined),
  shaTool: /\bsha256sum\b|\bsha-?256\b/i.test(joined),
  hexDigest: /\b[0-9a-f]{16,64}\b/i.test(joined),
  absPath: /(?:^|[\s(（])\/(?:home|tmp|usr|var)\b/.test(joined),
  ledgerRule: /\n---\n/.test(joined),
  taskId: /\bt\d+\b|\btask-\d+\b/.test(joined)
}

const out = {
  stage: 'D',
  switch_layer: 'profile patch: <DSH_HOME>/profiles/ghuman/cordis.patch.yml -> config.showDiagnostics: true',
  opened,
  responses_before: before.texts.length,
  responses_after: after.texts.length,
  new_turn_texts: turnTexts.length,
  ledger_labels_present: ledgerLabels,
  ledger_label_count: ledgerLabels.length,
  ledger_label_re: LEDGER_LABEL_RE.test(joined),
  machine_in_turn: machineInLedger,
  turn_text: joined,
  scrolled: scroll,
  ledger_scrolled: ruleSeen,
  tabs: await tabsInfo(p),
  flow: await flowKinds(p)
}
mergeState(out)
log({ ...out, turn_text: out.turn_text.slice(0, 3000), flow: out.flow })
await b.close()
