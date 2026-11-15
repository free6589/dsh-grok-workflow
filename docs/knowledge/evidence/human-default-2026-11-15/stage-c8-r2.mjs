/**
 * Stage C8 (retry) — shot 08: the ledger inside the transcript detail panel.
 *
 * Stage C7 opened the gate's CONTEXT row and the right-hand detail panel appeared with the
 * full payload, but the panel was still showing the top of it. This stage scrolls the panel
 * to the `Model routes:` / `Deadline:` lines that the switch added, and records that they are
 * on screen.
 */
import { open, dismissNotice, shot, clickTab, body, tabsInfo, crashHits, log } from './lib.mjs'
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

await clickTab(p, 'Trajectory')
await p.waitForTimeout(2500)
await p.locator('text=/mandatory workflow gate finished/').first().click({ force: true }).catch(() => {})
await p.waitForTimeout(2500)

const scrolled = await p.evaluate(() => {
  const leaves = Array.from(document.querySelectorAll('body *')).filter((e) => e.children.length === 0)
  const hit = leaves.filter((e) => /Model routes:/.test(e.textContent || '')).pop()
  if (!hit) return { ok: false }
  hit.scrollIntoView({ block: 'center' })
  const r = hit.getBoundingClientRect()
  return { ok: true, inViewport: r.top >= 0 && r.bottom <= innerHeight, top: Math.round(r.top), text: (hit.textContent || '').slice(0, 220) }
})
await p.waitForTimeout(1500)
await shot(p, '08-diagnostics-ledger-visible.png')

const text = await body(p)
const panel = await p.evaluate(() => {
  const leaves = Array.from(document.querySelectorAll('body *')).filter((e) => e.children.length === 0)
  const has = (re) => leaves.some((e) => re.test(e.textContent || ''))
  return {
    panel_headings: Array.from(document.querySelectorAll('h1,h2,h3,h4,[role="heading"]')).map((e) => (e.innerText || '').trim()).filter(Boolean).slice(0, 12),
    ledger_labels_on_screen: ['Grok workflow:', 'Objective:', 'Model routes:', 'Deadline:', 'Confirmed evidence:'].filter((l) => has(new RegExp(l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))),
    markers_present_in_panel: /<<<GROK-WORKFLOW-REPORT>>>/.test(document.body.innerText || '')
  }
})

const out = {
  stage: 'C8-r2',
  opened,
  scrolled,
  ...panel,
  transcript_has_ledger: /Model routes:|Deadline:/.test(text),
  tabs: await tabsInfo(p),
  crash_hits: crashHits(text)
}
mergeR2(out)
saveStage('stage-c8-r2.json', out)
log(out)
await b.close()
