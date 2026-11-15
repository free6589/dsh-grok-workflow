/**
 * Stage C4 (retry) — the diagnostics contrast, with the switch set in the profile layer.
 *
 * The instance was restarted on a new port with a new one-time token. Before the browser
 * connected, `dsh ghuman --dump-config` was checked and the composed tree really carried
 * `showDiagnostics: true` (see .tmp/r2-dump-with-diag.yml and the restart log), so the only
 * variable between turn 1/2 (no ledger) and this turn is the switch itself.
 *
 * shots:
 *   07 — the delivered report head with the switch on
 *   08 — the machine ledger, which is the contrast subject
 */
import { open, dismissNotice, send, body, settle, shot, tabsInfo, assistantTexts,
  userTexts, stripHits, residueHits, humanHits, crashHits, log } from './lib.mjs'
import { waitReady, openSessionRow, mergeR2, saveStage } from './r2-lib.mjs'

const TASK4 = '小任务，请团队跑两步：第一步，在工作目录下建 .tmp/human-scratch-r2d.md，写两行待办，每行以 - 开头。第二步，用 stat -c \'%s\' 取回它的字节数，把这条命令的原始输出当成证据记下来。'
const LEDGER_LABELS = ['Grok workflow:', 'Objective:', 'Model routes:', 'Deadline:', 'Confirmed evidence:']
const LEDGER_RE = /Grok workflow:|Objective:|Model routes:|Deadline:|Confirmed evidence:|Route switches:|Uncertainties:|Errors:/

const { b, p } = await open()
await dismissNotice(p)
await waitReady(p)
const reopened = await openSessionRow(p, '创建 huma', 45000)
const before = await assistantTexts(p)
log({ step: 'opened', reopened, responses_before: before.texts.length })

await send(p, TASK4)
const quiet = await settle(p, 600000, 6)
await p.waitForTimeout(1500)

const a = await assistantTexts(p)
const fresh = a.texts.slice(before.texts.length).join('\n')

const scrollLast = await p.evaluate(() => {
  const nodes = Array.from(document.querySelectorAll('[data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]'))
  const last = nodes[nodes.length - 1]
  if (!last) return false
  last.scrollIntoView({ block: 'start' })
  return true
})
await p.waitForTimeout(1500)
await shot(p, '07-diagnostics-on-report-head.png')

const ledgerScrolled = await p.evaluate(() => {
  const nodes = Array.from(document.querySelectorAll('[data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]'))
  const last = nodes[nodes.length - 1]
  if (!last) return false
  const leaves = Array.from(last.querySelectorAll('*')).filter((e) => e.children.length === 0)
  const anchor = leaves.filter((e) => /Grok workflow:|Model routes:/.test(e.textContent || '')).pop() ||
    leaves.filter((e) => /^\s*---\s*$/.test(e.textContent || '')).pop()
  if (!anchor) return false
  anchor.scrollIntoView({ block: 'center' })
  return true
})
await p.waitForTimeout(1500)
await shot(p, '08-diagnostics-ledger-visible.png')

const all = a.texts
const out = {
  stage: 'C4-r2',
  switch_layer: 'profile layer: .tmp/human-home-r2/profiles/ghuman/cordis.patch.yml -> grok-workflow.config.showDiagnostics: true; composed tree verified by `dsh ghuman --dump-config` before boot',
  task4: TASK4,
  reopened,
  settle_quiet: quiet,
  responses_before: before.texts.length,
  responses_total: all.length,
  turn4_len: fresh.length,
  turn4_text: fresh,
  turn4_ledger_labels: LEDGER_LABELS.filter((l) => fresh.includes(l)),
  turn4_ledger_re: LEDGER_RE.test(fresh),
  turn4_has_rule: /(^|\n)---(\n|$)/.test(fresh),
  turn4_human_landmarks: humanHits([fresh]),
  turn4_strip_violations: stripHits([fresh]),
  turn4_residue: residueHits([fresh]),
  turn4_machine: {
    statCommand: /\bstat\s+-/.test(fresh),
    odCommand: /\bod\s+-[a-zA-Z]/.test(fresh),
    shaTool: /\bsha256sum\b|\bsha-?256\b/i.test(fresh),
    hexDigest: /\b[0-9a-f]{16,64}\b/i.test(fresh),
    absPath: /(?:^|[\s(（])\/(?:home|tmp|usr|var)\b/.test(fresh),
    ledgerRule: /(^|\n)---(\n|$)/.test(fresh)
  },
  earlier_turns_ledger_absent: all.slice(0, -1).map((t) => !LEDGER_RE.test(t)),
  earlier_turn_lens: all.slice(0, -1).map((t) => t.length),
  user_bubbles: (await userTexts(p)).length,
  tabs: await tabsInfo(p),
  crash_hits: crashHits(await body(p)),
  scrolled: scrollLast,
  ledger_scrolled: ledgerScrolled
}
mergeR2(out)
saveStage('stage-c4-r2.json', out)
log({ ...out, turn4_text: out.turn4_text.slice(0, 3000) })
await b.close()
