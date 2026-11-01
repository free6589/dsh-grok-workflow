/**
 * Real DSH GUI driver for Issue #22 Phase 1 evidence.
 *
 * Run against a throwaway DSH instance that boots this branch's build:
 *   DSH_URL='http://127.0.0.1:<port>/?token=<t>' node gui.mjs <scenario>
 *
 * The access token is read from the environment on purpose: it is a live
 * credential of that instance and never belongs in the repository.
 */
import { open, dismissNotice, send } from './lib.mjs'

const APP = process.env.DSH_URL
const OUT = new URL('.', import.meta.url).pathname
const shot = (p, name) => p.screenshot({ path: `${OUT}${name}`, fullPage: false })
const body = p => p.locator('body').innerText()
const log = (...a) => console.log(...a)

async function waitText(p, needle, ms = 180000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const t = await body(p)
    if (t.includes(needle)) return true
    await p.waitForTimeout(2000)
  }
  return false
}

async function openSession(p, title) {
  const row = p.getByText(title, { exact: false }).first()
  if (await row.count() === 0) return false
  await row.click()
  await p.waitForTimeout(5000)
  return true
}

const scenario = process.argv[2]

if (scenario === 'p01') {
  const { b, p } = await open(APP)
  await dismissNotice(p)
  await send(p, '用一句话解释什么是二分查找')
  const ok = await waitText(p, '档位')
  log('REPORT_SEEN=' + ok)
  await p.waitForTimeout(8000)
  await shot(p, '01-p01-before-reload.png')
  const before = await body(p)
  log('ORIGINAL_IN_TRANSCRIPT=' + before.includes('用一句话解释什么是二分查找'))
  log('REPORT_IN_TRANSCRIPT=' + (before.includes('档位') || before.includes('GROK-WORKFLOW')))
  log('ANSWER_TAIL=' + JSON.stringify(before.slice(-600)))
  // Reload: the transcript has to come back from the persisted session, not from
  // the page's own memory.
  await p.goto(APP, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(8000)
  await dismissNotice(p)
  await openSession(p, '一句话解释二分查找')
  await p.waitForTimeout(3000)
  await shot(p, '02-p01-after-reload.png')
  const after = await body(p)
  log('AFTER_RELOAD_ORIGINAL=' + after.includes('用一句话解释什么是二分查找'))
  log('AFTER_RELOAD_REPORT=' + (after.includes('档位') || after.includes('GROK-WORKFLOW')))
  const count = (after.match(/用一句话解释什么是二分查找/g) || []).length
  log('AFTER_RELOAD_OCCURRENCES=' + count)
  await b.close()
}

if (scenario === 'p02sim') {
  const { b, p } = await open(APP)
  await dismissNotice(p)
  await send(p, '把这个改一下')
  log('ASKED=' + await waitText(p, '要动用团队吗', 120000))
  await shot(p, '03-p02-question.png')
  log('QUESTION_BODY=' + JSON.stringify((await body(p)).slice(-500)))
  await send(p, '简单')
  await p.waitForTimeout(4000)
  let done = false
  for (let i = 0; i < 60; i++) {
    const t = await body(p)
    if (t.includes('只派了一个工人') || t.includes('could not answer') || t.includes('没有待回答')) { done = true; break }
    await p.waitForTimeout(2000)
  }
  log('ANSWERED=' + done)
  await p.waitForTimeout(3000)
  await shot(p, '04-p02-simple-answer.png')
  log('---TAIL---')
  log((await body(p)).slice(-1400))
  await b.close()
}

if (scenario === 'p02team') {
  const { b, p } = await open(APP)
  await dismissNotice(p)
  await send(p, '把这个改一下')
  log('ASKED=' + await waitText(p, '要动用团队吗', 120000))
  await send(p, '团队')
  await p.waitForTimeout(35000)
  await shot(p, '05-p02-team-running.png')
  log('RUNNING_BODY=' + JSON.stringify((await body(p)).slice(-700)))
  const stop = p.locator('button[aria-label*="Stop" i],button[aria-label*="停止"],button[title*="Stop" i]')
  log('STOP_BUTTONS=' + await stop.count())
  if (await stop.count() > 0) {
    await stop.first().click()
    log('CLICKED_STOP')
  }
  await p.waitForTimeout(20000)
  await shot(p, '06-p04-cancelled.png')
  log('---AFTER CANCEL---')
  log((await body(p)).slice(-1600))
  await p.goto(APP, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(8000)
  await dismissNotice(p)
  await openSession(p, '把这个改一下')
  await p.waitForTimeout(3000)
  await shot(p, '07-p04-cancelled-after-reload.png')
  const after = await body(p)
  log('RELOAD_HAS_ORIGINAL=' + after.includes('把这个改一下'))
  log('RELOAD_HAS_CANCEL=' + (after.includes('取消') || after.includes('cancelled') || after.includes('Stopped')))
  log('---AFTER RELOAD---')
  log(after.slice(-1200))
  await b.close()
}

if (scenario === 'p03') {
  const { b, p } = await open(APP)
  await dismissNotice(p)
  await send(p, '先跑类型检查，再打包，最后发灰度')
  const seen = await waitText(p, 'END-GROK-WORKFLOW-REPORT', 240000)
  log('TERMINAL_SEEN=' + seen)
  await p.waitForTimeout(3000)
  await shot(p, '08-p03-error-terminal.png')
  const t = await body(p)
  log('HAS_ORIGINAL=' + t.includes('先跑类型检查，再打包，最后发灰度'))
  log('HAS_SUCCESS_WORDING=' + /已开启|已关闭|COMPLETED/.test(t))
  log('---TAIL---')
  log(t.slice(-1500))
  await b.close()
}
