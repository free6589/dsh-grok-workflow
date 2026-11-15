/**
 * Discovery probe (not a deliverable): what the isolated instance really renders.
 * Confirms the transcript's own message selectors and the settings entry point
 * before the stage scripts are written against them.
 */
import { open, dismissNotice, domSurvey, assistantTexts, tabsInfo, log, APP } from '../lib.mjs'

const { b, p } = await open()
log({ step: 'opened', app_redacted: String(APP).replace(/token=[^&]+/, 'token=<redacted>') })
log({ step: 'notice', dismissed: await dismissNotice(p) })
await p.waitForTimeout(3000)

const survey = await domSurvey(p)
log({ step: 'survey', tabs: survey.tabs, top: survey.top.slice(0, 40) })
log({ step: 'buttons', buttons: survey.buttons.slice(0, 40) })

for (const sel of ['[data-message-role]', '[data-role]', '[class*="message"]', '[class*="Message"]', '[class*="turn"]', '[class*="bubble"]']) {
  const n = await p.locator(sel).count()
  log({ step: 'selector', sel, count: n })
}

log({ step: 'assistantTexts', ...(await assistantTexts(p)) })
log({ step: 'tabsInfo', tabsInfo: await tabsInfo(p) })
log({ step: 'bodyHead', text: (await p.locator('body').innerText()).slice(0, 1500) })

await b.close()
