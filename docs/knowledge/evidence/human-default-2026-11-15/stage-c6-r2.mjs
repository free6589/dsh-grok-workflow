/**
 * Stage C5 (retry) — the diagnostics contrast on a loadable session.
 *
 * Incident: the first session's archive became unloadable after the instance was restarted
 * (see INCIDENT-session-corrupt-r2.md, which quotes the app's own error). That session was
 * the control for shots 01/02/05/06 — those images were taken while it still loaded — but it
 * can no longer be reopened, so the switch-on shots are taken on a NEW session of the same
 * instance, which has `showDiagnostics: true` in its composed config.
 *
 * shots:
 *   07 — the report head with the switch on
 *   08 — the machine ledger (the contrast subject)
 */
import { open, dismissNotice, send, body, settle, shot, tabsInfo, assistantTexts,
  userTexts, stripHits, residueHits, humanHits, crashHits, log } from './lib.mjs'
import { waitReady, mergeR2, saveStage } from './r2-lib.mjs'

const TASK6 = '小任务，请团队跑两步：第一步，在工作目录下建 .tmp/human-scratch-r2f.md，写两行待办，每行以 - 开头。第二步，用 stat -c \'%s\' 取回它的字节数，把这条命令的原始输出当成证据记下来。'
const LEDGER_LABELS = ['Grok workflow:', 'Objective:', 'Model routes:', 'Deadline:', 'Confirmed evidence:']
const LEDGER_RE = /Grok workflow:|Objective:|Model routes:|Deadline:|Confirmed evidence:|Route switches:|Uncertainties:|Errors:/

const { b, p } = await open()
await dismissNotice(p)

// The instance boots into the broken session's error banner; a new session is the clean path.
const newBtn = p.getByRole('button', { name: 'New Session' })
if (await newBtn.count()) { await newBtn.first().click().catch(() => {}); await p.waitForTimeout(2500) }
const ready = await waitReady(p)
log({ step: 'new_session', ready, url: p.url().replace(/token=[A-Za-z0-9_.-]+/, 'token=<redacted>') })

await send(p, TASK6)
const quiet = await settle(p, 600000, 6)
await p.waitForTimeout(1500)

const a = await assistantTexts(p)
const fresh = a.texts.join('\n')

const scrollHead = await p.evaluate(() => {
  const n = document.querySelector('[data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]')
  if (!n) return false
  n.scrollIntoView({ block: 'start' })
  return true
})
await p.waitForTimeout(1500)
await shot(p, '07-diagnostics-on-report-head.png')

const ledgerScrolled = await p.evaluate(() => {
  const leaves = Array.from(document.querySelectorAll('[data-chat-flow-kind="assistant-step"][data-chat-group-part="response"] *'))
    .filter((e) => e.children.length === 0)
  const anchor = leaves.filter((e) => /Grok workflow:|Model routes:/.test(e.textContent || '')).pop() ||
    leaves.filter((e) => /^\s*---\s*$/.test(e.textContent || '')).pop()
  if (!anchor) return false
  anchor.scrollIntoView({ block: 'center' })
  return true
})
await p.waitForTimeout(1500)
await shot(p, '08-diagnostics-ledger-visible.png')

const out = {
  stage: 'C6-r2',
  switch_layer: 'launch-time overlay docs/knowledge/evidence/human-default-2026-11-15/overlay-r2-diag.yml -> grok-workflow.config.showDiagnostics: true (profile layer restored to pristine; composed tree verified with `dsh ghuman --patch overlay-r2-diag.yml --dump-config`)',
  note: 'shot 07/08 come from a NEW session of the same instance; the control session of shots 01/02/05/06 became unloadable after the restart — see INCIDENT-session-corrupt-r2.md',
  task6: TASK6,
  settle_quiet: quiet,
  responses_total: a.texts.length,
  turn_len: fresh.length,
  turn_text: fresh,
  ledger_labels: LEDGER_LABELS.filter((l) => fresh.includes(l)),
  ledger_re: LEDGER_RE.test(fresh),
  has_rule: /(^|\n)---(\n|$)/.test(fresh),
  human_landmarks: humanHits([fresh]),
  strip_violations: stripHits([fresh]),
  residue: residueHits([fresh]),
  machine: {
    statCommand: /\bstat\s+-/.test(fresh),
    odCommand: /\bod\s+-[a-zA-Z]/.test(fresh),
    shaTool: /\bsha256sum\b|\bsha-?256\b/i.test(fresh),
    hexDigest: /\b[0-9a-f]{16,64}\b/i.test(fresh),
    absPath: /(?:^|[\s(（])\/(?:home|tmp|usr|var)\b/.test(fresh),
    ledgerRule: /(^|\n)---(\n|$)/.test(fresh)
  },
  user_bubbles: (await userTexts(p)).length,
  tabs: await tabsInfo(p),
  crash_hits: crashHits(await body(p)),
  scrolled: scrollHead,
  ledger_scrolled: ledgerScrolled
}
mergeR2(out)
saveStage('stage-c6-r2.json', out)
log({ ...out, turn_text: out.turn_text.slice(0, 3000) })
await b.close()
