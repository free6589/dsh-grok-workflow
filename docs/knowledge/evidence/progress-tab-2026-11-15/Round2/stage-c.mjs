/**
 * Stage C — ④ node detail: the three sections this revision documents
 * (header / engine facts / stage report) on a stage that really carries engine rows;
 * ⑤ narrow viewport (480px bottom drawer) and dark theme, one shot each.
 *
 * The narrow case resizes the same live page instead of re-navigating: at 480px the view
 * tab strip is collapsed behind the overflow control, so the tab is selected first and the
 * viewport is then narrowed — the drawer assertion is still the real CSS media query.
 */
import { open, dismissNotice, shot, clickTab, openNodeDetail, loadState, saveState, enterSession, progressDom } from './lib.mjs'

const state = loadState()
const log = (...a) => console.log(...a)

// --- ④ desktop detail on a stage that has rows ---
{
  const { b, p } = await open()
  log('NOTICE=' + await dismissNotice(p))
  log('ENTER=' + await enterSession(p, state))
  await clickTab(p, 'Progress')
  await p.waitForTimeout(1500)
  const opened = await openNodeDetail(p, { preferState: 'done', requireRows: true })
  log('DETAIL_NODE_INDEX=' + opened.index)
  log('DETAIL_NODE_STATE=' + opened.state)
  log('DETAIL_ROWS=' + opened.rows)
  const dom = opened.dom
  log('DETAIL_HEADINGS=' + JSON.stringify(dom.detailHeadings))
  log('DETAIL_TITLE=' + JSON.stringify(dom.detailTitle))
  log('DETAIL_STATE=' + JSON.stringify(dom.detailState))
  log('DETAIL_RUN_ID=' + JSON.stringify(dom.detailRunId))
  log('DETAIL_FIELDS=' + JSON.stringify(dom.detailFields))
  log('DETAIL_SOURCES=' + JSON.stringify(dom.detailSources))
  log('DETAIL_TEXT=' + JSON.stringify(dom.detailText))
  log('DETAIL_SECTION_COUNT=' + (dom.detailHeadings.length + (dom.detailTitle ? 1 : 0)))
  log('DETAIL_FIELD_COUNT=' + dom.detailFields.length)
  log('DETAIL_ACTIONS=' + JSON.stringify(dom.actionButtons))
  await shot(p, '06-node-detail-three-sections.png')
  state.detail = {
    index: opened.index,
    state: opened.state,
    rows: opened.rows,
    headings: dom.detailHeadings,
    title: dom.detailTitle,
    stateText: dom.detailState,
    runId: dom.detailRunId,
    fields: dom.detailFields,
    sources: dom.detailSources,
    actions: dom.actionButtons,
    text: dom.detailText
  }
  saveState(state)

  // --- ⑤ narrow viewport on the same live page ---
  await p.setViewportSize({ width: 480, height: 900 })
  await p.waitForTimeout(2500)
  const narrow = await p.evaluate(() => {
    const d = document.querySelector('[data-progress-detail]')
    if (!d) return null
    const s = getComputedStyle(d)
    const field = d.querySelector('[data-gw-progress-field]')
    const track = document.querySelector('[data-gw-progress-track]')
    return {
      position: s.position,
      bottom: s.bottom,
      left: s.left,
      right: s.right,
      maxWidth: s.maxWidth,
      fieldColumns: field ? getComputedStyle(field).gridTemplateColumns : null,
      trackVisible: !!track && track.getBoundingClientRect().height > 0,
      viewport: { w: window.innerWidth, h: window.innerHeight }
    }
  })
  log('NARROW_DETAIL_CSS=' + JSON.stringify(narrow))
  const narrowDom = await progressDom(p)
  log('NARROW_NODE_COUNT=' + narrowDom.nodeCount)
  await shot(p, '07-narrow-480-drawer.png')
  state.narrow = narrow
  saveState(state)
  await b.close()
}

// --- ⑤ dark theme ---
{
  const { b, p } = await open({ colorScheme: 'dark' })
  await dismissNotice(p)
  log('ENTER_DARK=' + await enterSession(p, state))
  await clickTab(p, 'Progress')
  await p.waitForTimeout(1500)
  const opened = await openNodeDetail(p, { preferState: 'done', requireRows: true })
  const probe = await p.evaluate(() => ({
    dark: window.matchMedia('(prefers-color-scheme: dark)').matches,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    states: Array.from(document.querySelectorAll('[data-gw-progress-node]')).map((n) => n.getAttribute('data-state')),
    ringColors: Array.from(document.querySelectorAll('[data-gw-progress-node]')).slice(0, 5).map((n) => {
      const ring = n.querySelector('.gw-progress-ring')
      return ring ? getComputedStyle(ring).borderColor : null
    })
  }))
  log('DARK_PROBE=' + JSON.stringify(probe))
  log('DARK_DETAIL_OPEN=' + opened.dom.detailOpen)
  log('DARK_ROWS=' + opened.rows)
  log('DARK_HEADINGS=' + JSON.stringify(opened.dom.detailHeadings))
  await shot(p, '08-dark-theme-detail.png')
  state.dark = probe
  saveState(state)
  await b.close()
}
