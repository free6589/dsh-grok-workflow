/**
 * Stage C3 (retry) — the live path of the diagnostics switch, retested carefully.
 *
 * Stage C2 ticked the switch and pressed "Save (1)", yet the next delivered report carried
 * no ledger — but a single click is not proof of a commit, so this stage records the page's
 * own commit signal: the pending-change counter has to disappear, and the checkbox has to
 * read `true`, before a third task is sent. Only then does "the switch does not reach the
 * delivered report" become a measured statement rather than a suspicion.
 */
import fs from 'node:fs'
import { open, dismissNotice, send, body, settle, shot, tabsInfo, assistantTexts,
  userTexts, crashHits, log } from './lib.mjs'
import { waitReady, openSessionRow, mergeR2, saveStage } from './r2-lib.mjs'

const PROFILE = '/home/fish/projects_mine/dsh-grok-workflow/.tmp/human-home-r2/profiles/ghuman/cordis.patch.yml'
const TASK3 = '小任务，请团队跑两步：第一步，在工作目录下建 .tmp/human-scratch-r2c.md，只写一行待办，以 - 开头。第二步，用 stat -c \'%s\' 取它的字节数，把原始输出当成证据记下来。'
const LEDGER_RE = /Grok workflow:|Objective:|Model routes:|Deadline:|Confirmed evidence:|Route switches:|Uncertainties:|Errors:/

const buttonsText = (p) => p.evaluate(() => Array.from(document.querySelectorAll('button'))
  .map((el) => (el.innerText || '').trim()).filter(Boolean))

const diag = (p) => p.evaluate(() => {
  const boxes = Array.from(document.querySelectorAll('input[type="checkbox"]'))
  const el = boxes[13]
  if (!el) return null
  let node = el
  let text = ''
  for (let up = 0; up < 6; up += 1) {
    node = node.parentElement
    if (!node) break
    const t = (node.innerText || '').trim().replace(/\s+/g, ' ')
    if (t.length > 6) { text = t; break }
  }
  return { checked: el.checked, label: text.slice(0, 120) }
})

const { b, p } = await open()
await dismissNotice(p)
await waitReady(p)
await p.getByRole('button', { name: 'Plugins' }).first().click().catch(() => {})
await p.waitForTimeout(2500)
await p.getByText('Grok workflow', { exact: false }).first().click().catch(() => {})
await p.waitForTimeout(2500)
const more = p.getByText('More · Defaults are fine', { exact: false }).first()
if (await more.count()) { await more.click().catch(() => {}); await p.waitForTimeout(2500) }

const before = await diag(p)
const buttonsBefore = await buttonsText(p)
await p.locator('input[type="checkbox"]').nth(13).click({ force: true }).catch(() => {})
await p.waitForTimeout(1800)
const afterTick = await diag(p)
const buttonsDirty = await buttonsText(p)

const save = p.getByRole('button', { name: /^Save/ }).first()
const saveVisible = await save.count()
if (saveVisible) { await save.click().catch(() => {}); await p.waitForTimeout(3500) }
const afterSave = await diag(p)
const buttonsAfter = await buttonsText(p)
const committed = !buttonsAfter.some((t) => /^Save \(\d+\)/.test(t)) && afterSave && afterSave.checked === true
const profileLayer = fs.existsSync(PROFILE) ? fs.readFileSync(PROFILE, 'utf8') : null
log({ step: 'flip', before, afterTick, afterSave, save_visible: !!saveVisible, committed,
  buttons_before: buttonsBefore, buttons_dirty: buttonsDirty, buttons_after: buttonsAfter,
  profile_layer_written: /showDiagnostics:\s*true/.test(profileLayer || ''), profile_layer: profileLayer })

// Back to the session and a third task, with the switch now committed in the page.
const reopened = await openSessionRow(p, '创建 huma', 45000)
const responsesBefore = (await assistantTexts(p)).texts.length
await send(p, TASK3)
const quiet = await settle(p, 600000, 5)
await p.waitForTimeout(1500)

const a = await assistantTexts(p)
const fresh = a.texts.slice(responsesBefore).join('\n')
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
  const anchor = Array.from(last.querySelectorAll('*'))
    .filter((e) => e.children.length === 0 && /Grok workflow:|Model routes:|Objective:/.test(e.textContent || '')).pop()
  if (!anchor) return false
  anchor.scrollIntoView({ block: 'center' })
  return true
})
await p.waitForTimeout(1500)
await shot(p, '08-diagnostics-ledger-visible.png')

const out = {
  stage: 'C3-r2',
  flip: { before, afterTick, afterSave, committed, profile_layer_written: /showDiagnostics:\s*true/.test(profileLayer || '') },
  task3: TASK3,
  reopened,
  settle_quiet: quiet,
  responses_before: responsesBefore,
  responses_total: a.texts.length,
  turn3_len: fresh.length,
  turn3_text: fresh,
  turn3_ledger_re: LEDGER_RE.test(fresh),
  turn3_has_rule: /(^|\n)---(\n|$)/.test(fresh),
  turn3_machine: {
    statCommand: /\bstat\s+-/.test(fresh),
    shaTool: /\bsha256sum\b/i.test(fresh),
    hexDigest: /\b[0-9a-f]{16,64}\b/i.test(fresh),
    absPath: /(?:^|[\s(（])\/(?:home|tmp|usr|var)\b/.test(fresh)
  },
  user_bubbles: (await userTexts(p)).length,
  tabs: await tabsInfo(p),
  crash_hits: crashHits(await body(p)),
  scrolled: scrollLast,
  ledger_scrolled: ledgerScrolled
}
mergeR2(out)
saveStage('stage-c3-r2.json', out)
log({ ...out, turn3_text: out.turn3_text.slice(0, 2500) })
await b.close()
