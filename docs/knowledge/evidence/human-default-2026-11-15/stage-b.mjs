/**
 * Stage B — shot 03 (narrow) and shot 04 (dark), on the default-form report.
 *
 * Narrow is a real viewport change on the same live page (`setViewportSize`, not a
 * second render path) taken after the session is open: at 480 px the sidebar collapses,
 * so the session has to be selected at full width first. Dark is a real
 * `prefers-color-scheme` context. Colours and boxes are read back from the live DOM, so
 * "it turned dark" and "the strip is still there" are measured, not assumed.
 */
import { open, dismissNotice, openSession, waitText, scrollReportStart, shot, tabsInfo, look, mergeState, log } from './lib.mjs'

const out = { stage: 'B' }

// --- 03: narrow 480x900, resized live ---------------------------------------
{
  const { b, p } = await open({ w: 1440, h: 900 })
  await dismissNotice(p)
  const opened = await openSession(p, 'scratch')
  await waitText(p, '下一步：', 60000)
  await p.setViewportSize({ width: 480, height: 900 })
  await p.waitForTimeout(2500)
  const scrolled = await scrollReportStart(p)
  await p.waitForTimeout(1400)
  await shot(p, '03-narrow-480-report.png')
  out.narrow = { opened, scrolled, ...(await look(p)), tabs: await tabsInfo(p) }
  await b.close()
}

// --- 04: dark ----------------------------------------------------------------
{
  const { b, p } = await open({ w: 1440, h: 900, colorScheme: 'dark' })
  await dismissNotice(p)
  const opened = await openSession(p, 'scratch')
  await waitText(p, '下一步：', 60000)
  const scrolled = await scrollReportStart(p)
  await p.waitForTimeout(1400)
  await shot(p, '04-dark-report.png')
  out.dark = { opened, scrolled, ...(await look(p)), tabs: await tabsInfo(p) }
  await b.close()
}

mergeState(out)
log(out)
