// One real three-task workflow in the isolated instance (web-clone profile, port 3412),
// captured at the states this block asks for: running, done, one node opened, at 1500 and at
// 390. Nothing here is mocked: the page is the shipped build installed into the clone, the run
// is a live model calling grok_workflow, and every number written to readings.json was read
// out of the DOM by one evaluate issued for the screenshot next to it.
import { writeFileSync, mkdirSync } from 'node:fs'
import { chromium } from '/home/fish/.local/share/mise/installs/node/26.8.1/lib/node_modules/@playwright/cli/node_modules/playwright/index.mjs'

const [url, outDir] = process.argv.slice(2)
const SOAK = outDir
mkdirSync(SOAK, { recursive: true })

const PROMPT = [
  '用 grok_workflow 工具跑一个工作流，拆成三个互相独立、可以并行的任务，每个任务都要真的写一个文件：',
  '任务一：写 notes.md，内容是三行安装步骤；',
  '任务二：写 test.txt，内容是一行 hello；',
  '任务三：写 third.txt，内容是一行 bye。',
  '三个任务并行跑，不要串行；跑完把每个任务写了什么汇总一下。',
].join('')

const consoleErrors = []
const pageErrors = []
const log = (...parts) => console.log(new Date().toISOString().slice(11, 23), ...parts)

// Every reading is one evaluate: counts, per-card lights, the graph text parsed here, and the
// layout numbers, so they all belong to the same instant as the screenshot beside them.
const READ = () => {
  const all = (sel) => [...document.querySelectorAll(sel)]
  const q = (sel) => all(sel).length
  const textOf = (sel) => {
    const node = document.querySelector(sel)
    return node === null ? null : node.innerText.trim()
  }
  const rings = all('[data-gw-progress-ring]').map((n) => ({
    key: n.getAttribute('data-gw-progress-ring'),
    state: n.getAttribute('data-state'),
  }))
  const checks = all('[data-gw-progress-check]').map((n) => ({
    key: n.getAttribute('data-gw-progress-check'),
    state: n.getAttribute('data-state'),
  }))
  const cards = all('[data-gw-progress-pnode]').map((n) => ({
    id: n.getAttribute('data-gw-progress-pnode'),
    kind: n.getAttribute('data-kind'),
    level: n.getAttribute('data-level'),
    state: n.getAttribute('data-state'),
    current: n.getAttribute('data-current'),
    task: n.getAttribute('data-task'),
    subtask: n.getAttribute('data-subtask'),
    label: (n.querySelector('[data-gw-progress-pnode-word]') || {}).textContent || null,
    rings: [...n.querySelectorAll('[data-gw-progress-ring]')].map((r) => ({ key: r.getAttribute('data-gw-progress-ring'), state: r.getAttribute('data-state') })),
    checks: [...n.querySelectorAll('[data-gw-progress-check]')].map((c) => ({ key: c.getAttribute('data-gw-progress-check'), state: c.getAttribute('data-state') })),
    open: n.querySelector('[data-gw-progress-pnode-open]') !== null,
    calls: [...n.querySelectorAll('[data-gw-progress-node-calls] [data-gw-progress-log-row]')].length,
    traced: n.getAttribute('data-trace'),
  }))
  const graph = document.querySelector('[data-gw-progress-graph]')
  const source = graph === null ? null : graph.getAttribute('data-gw-progress-source')
  const lines = source === null ? [] : source.split(/\r?\n/)
  const decl = new Set()
  const adj = new Map()
  const edgePairs = []
  const nodeLines = []
  const edgeLines = []
  let badLines = []
  let header = null
  const firstMeaningful = lines.map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('%%'))[0]
  if (firstMeaningful !== undefined) header = firstMeaningful
  for (const raw of lines) {
    const line = raw.trim()
    if (line === '' || line.startsWith('%%')) continue
    if (/^(?:flowchart|graph)\s+[A-Za-z]+$/i.test(line)) continue
    const edge = /^([A-Za-z0-9_]+)\s*-->\s*([A-Za-z0-9_]+)$/.exec(line)
    if (edge !== null) {
      edgePairs.push([edge[1], edge[2]])
      edgeLines.push(line)
      for (const [a, b] of [[edge[1], edge[2]]]) {
        if (!adj.has(a)) adj.set(a, new Set())
        if (!adj.has(b)) adj.set(b, new Set())
        adj.get(a).add(b)
        adj.get(b).add(a)
      }
      continue
    }
    const node = /^([A-Za-z0-9_]+)\s*(\(\[|\[|\()\s*"([\s\S]*)"\s*(\]\)|\]|\))$/.exec(line)
    if (node !== null) {
      nodeLines.push({ id: node[1], shape: node[2], label: node[3] })
      decl.add(node[1])
      if (!adj.has(node[1])) adj.set(node[1], new Set())
      continue
    }
    badLines.push(line)
  }
  // Component count over every declared id, ignoring direction: one picture, one component.
  const seen = new Set()
  let components = 0
  for (const id of adj.keys()) {
    if (seen.has(id)) continue
    components += 1
    const stack = [id]
    seen.add(id)
    while (stack.length > 0) {
      const at = stack.pop()
      for (const next of adj.get(at)) if (!seen.has(next)) { seen.add(next); stack.push(next) }
    }
  }
  const danglingEdgeEnds = edgePairs.filter(([a, b]) => !decl.has(a) || !decl.has(b))
  const figure = document.querySelector('[data-gw-progress-figure]')
  const tracedEdges = all('[data-gw-progress-edge]').map((n) => ({
    from: n.getAttribute('data-from'), to: n.getAttribute('data-to'),
    kind: n.getAttribute('data-kind'), trace: n.getAttribute('data-trace'),
  }))
  return {
    mounted: document.querySelector('[data-gw-progress]') !== null,
    runName: textOf('[data-gw-progress-run]'),
    chip: textOf('[data-gw-progress-chip]'),
    chipState: (document.querySelector('[data-gw-progress-chip]') || {}).getAttribute
      ? document.querySelector('[data-gw-progress-chip]').getAttribute('data-state')
      : null,
    line: textOf('[data-gw-progress-line]'),
    dockText: textOf('[data-gw-progress-dock]'),
    dockState: (document.querySelector('[data-gw-progress-dock]') || {}).getAttribute
      ? document.querySelector('[data-gw-progress-dock]').getAttribute('data-state')
      : null,
    dockFill: q('[data-gw-progress-dock-fill]'),
    stuckPresent: document.querySelector('[data-gw-progress-stuck]') !== null,
    stuckText: textOf('[data-gw-progress-stuck]'),
    pnodes: q('[data-gw-progress-pnode]'),
    edges: q('[data-gw-progress-edge]'),
    current: q('[data-current="true"]'),
    currentNode: (document.querySelector('[data-current="true"]') || {}).getAttribute
      ? document.querySelector('[data-current="true"]').getAttribute('data-gw-progress-pnode')
      : null,
    rings,
    ringCount: rings.length,
    checks,
    checkCount: checks.length,
    cards,
    nodeCallsCount: q('[data-gw-progress-node-calls]'),
    traceActive: q('[data-trace="active"]'),
    traceDim: q('[data-trace="dim"]'),
    srcHeader: header,
    srcNodeLines: nodeLines.length,
    srcEdgeLines: edgeLines.length,
    srcBadLines: badLines,
    srcComponents: components,
    srcDanglingEdges: danglingEdgeEnds.length,
    srcDeclared: [...decl],
    srcEdgePairs: edgePairs,
    srcText: source,
    edgeAttrs: tracedEdges,
    docScrollWidth: document.documentElement.scrollWidth,
    docClientWidth: document.documentElement.clientWidth,
    figureScrollWidth: figure === null ? null : figure.scrollWidth,
    figureClientWidth: figure === null ? null : figure.clientWidth,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
  }
}

const readings = {}
const record = async (page, key, file, at, extra = {}) => {
  const value = await page.evaluate(READ)
  const withChecks = {
    screenshot: file,
    at,
    ...extra,
    ...value,
    assert: {
      headerIsFlowchartLR: value.srcHeader === 'flowchart LR',
      srcNodeLinesEqDomPnodes: value.srcNodeLines === value.pnodes,
      srcEdgeLinesEqDomEdges: value.srcEdgeLines === value.edges,
      srcOneComponent: value.srcComponents === 1,
      srcNoDanglingEdges: value.srcDanglingEdges === 0,
      srcNoBadLines: value.srcBadLines.length === 0,
      currentNodeCountIsOne: value.current === 1,
      taskCardsCarrySixRings: value.cards.filter((c) => c.kind === 'task').every((c) => c.rings.length === 6),
      ringsAreSixPerTask: value.rings.length === 6 * value.cards.filter((c) => c.kind === 'task').length,
      acceptCarriesFiveChecks: value.checkCount === 5
        && value.cards.filter((c) => c.kind === 'accept').length === 1
        && (value.cards.find((c) => c.kind === 'accept') || { checks: [] }).checks.length === 5,
      noPageSidewaysScroll: value.docScrollWidth === value.docClientWidth,
    },
  }
  readings[key] = withChecks
  log('reading', key, JSON.stringify({
    chip: value.chip, pnodes: value.pnodes, edges: value.edges, rings: value.ringCount,
    checks: value.checkCount, dock: value.dockFill, sw: value.docScrollWidth, cw: value.docClientWidth,
    fig: [value.figureScrollWidth, value.figureClientWidth], assert: withChecks.assert,
  }))
  return withChecks
}

const resize = async (page, width, height) => {
  await page.setViewportSize({ width, height })
  await page.waitForTimeout(1200)
}

// The 进度 view at a phone width sits behind the host's 更多会话视图 menu; take that path when
// the tab itself is not on the strip.
let tabPath = null
const openProgress = async (page) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const tab = page.getByRole('tab', { name: '进度' })
    if (await tab.count()) {
      await tab.first().click({ timeout: 3000 }).catch(() => {})
      if (tabPath === null) tabPath = 'tab'
      await page.waitForTimeout(400)
      return true
    }
    const overflow = page.getByRole('button', { name: '更多会话视图' })
    if (await overflow.count()) {
      await overflow.first().click({ timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(600)
      const item = page.getByRole('menuitem', { name: /进度/ })
      const loose = (await item.count()) ? item : page.getByText('进度', { exact: true })
      if (await loose.count()) {
        await loose.first().click({ timeout: 3000 }).catch(() => {})
        if (tabPath === null) tabPath = 'overflow-menu'
        await page.waitForTimeout(600)
        return true
      }
      await page.keyboard.press('Escape').catch(() => {})
    }
    const looseTab = page.getByText('进度', { exact: true })
    if (await looseTab.count()) {
      await looseTab.first().click({ timeout: 3000 }).catch(() => {})
      if (tabPath === null) tabPath = 'text'
      await page.waitForTimeout(400)
      return true
    }
    await page.waitForTimeout(400)
  }
  return false
}

// The tab's view is a scroller; a fresh mount can leave it part-way down, so every shot
// starts from the top of the panel rather than wherever the last render left it.
const scrollTop = async (target) => {
  await target.evaluate(() => {
    window.scrollTo(0, 0)
    let node = document.querySelector('[data-gw-progress]')
    while (node !== null && node !== undefined) {
      if (node.scrollHeight > node.clientHeight + 4) node.scrollTop = 0
      node = node.parentElement
    }
    document.scrollingElement ? (document.scrollingElement.scrollTop = 0) : null
  })
  await target.waitForTimeout(400)
}

const browser = await chromium.launch({ executablePath: '/home/fish/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome' })
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1600 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`desktop: ${m.text()}`) })
page.on('pageerror', (e) => pageErrors.push(`desktop: ${String(e)}`))

await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(7000)

const composer = page.locator('[contenteditable="true"][role="textbox"]').first()
await composer.waitFor({ timeout: 60000 })
await composer.click()
await page.keyboard.type(PROMPT, { delay: 2 })
const sentAt = Date.now()
await page.keyboard.press('Enter')
log('sent')

const opened = await openProgress(page)
log('progress view opened:', opened, 'via', tabPath)
await page.screenshot({ path: `${SOAK}/desktop-1500-opened.png` })

let sessionUrl = null
const saved = {}
const shot = async (name, key, extra) => {
  await scrollTop(page)
  await page.screenshot({ path: `${SOAK}/${name}.png` })
  const at = (Date.now() - sentAt) / 1000
  await record(page, key, `${name}.png`, at, extra)
  saved[key] = { file: `${name}.png`, at, chip: readings[key].chip }
  log('shot', name, 'at', at.toFixed(2), 's')
}

const deadline = Date.now() + 13 * 60 * 1000
let doneSeenAt = null
while (Date.now() < deadline) {
  let s
  try { s = await page.evaluate(READ) } catch { await page.waitForTimeout(200); continue }
  if (!s.mounted) { await page.waitForTimeout(200); continue }

  if (s.chip === '进行中' && s.pnodes > 0 && saved['desktop-1500-running'] === undefined) {
    await shot('desktop-1500-running', 'desktop-1500-running', { width: 1500 })
    await resize(page, 390, 844)
    const stillThere = await page.evaluate(() => document.querySelector('[data-gw-progress]') !== null)
    if (!stillThere) await openProgress(page)
    await page.waitForTimeout(600)
    await shot('phone-390-running', 'phone-390-running', { width: 390 })
    await resize(page, 1500, 1600)
  }

  if (s.chip === '已完成' || s.chip === '未通过' || s.chip === '出错' || s.chip === '已取消') {
    if (doneSeenAt === null) {
      doneSeenAt = Date.now()
      await page.waitForTimeout(2500)
      await shot('desktop-1500-done', 'desktop-1500-done', { width: 1500 })
    }
    break
  }
  await page.waitForTimeout(200)
}

sessionUrl = page.url()
log('session url', sessionUrl.replace(/token=[^&]+/, 'token=<redacted>'))

// The done page at 390 before anything is clicked: the plain finished state, same DOM resized.
const shoot390 = async (name, key, extra) => {
  await resize(page, 390, 844)
  const there = await page.evaluate(() => document.querySelector('[data-gw-progress]') !== null)
  if (!there) await openProgress(page)
  await scrollTop(page)
  await page.screenshot({ path: `${SOAK}/${name}.png` })
  const at = (Date.now() - sentAt) / 1000
  await record(page, key, `${name}.png`, at, { width: 390, ...extra })
  saved[key] = { file: `${name}.png`, at, chip: readings[key].chip }
  log('shot', name, 'at', at.toFixed(2), 's', 'width 390')
  await resize(page, 1500, 1600)
}

if (readings['desktop-1500-done'] !== undefined) {
  await shoot390('phone-390-done', 'phone-390-done', {})

  // One node opened at 1500: the click opens its call list and lights the wires that touch it.
  const taskNode = page.locator('[data-gw-progress-pnode][data-kind="task"]').first()
  const nodeId = await taskNode.getAttribute('data-gw-progress-pnode')
  log('opening node', nodeId)
  await taskNode.locator('button').first().click({ timeout: 5000 })
  await page.waitForTimeout(900)
  await scrollTop(page)
  await page.screenshot({ path: `${SOAK}/desktop-1500-node-open.png` })
  await record(page, 'desktop-1500-node-open', 'desktop-1500-node-open.png', (Date.now() - sentAt) / 1000, { width: 1500, openedNode: nodeId })
  saved['desktop-1500-node-open'] = { file: 'desktop-1500-node-open.png', at: (Date.now() - sentAt) / 1000, chip: readings['desktop-1500-node-open'].chip }
  writeFileSync(`${SOAK}/interaction.json`, JSON.stringify({ nodeId, nodeIdType: typeof nodeId, tabPath }, null, 1))

  // …and the same opened state at 390.
  await shoot390('phone-390-node-open', 'phone-390-node-open', { openedNode: nodeId })
}

// A phone-native page load of the same session: a real 390x844 mobile context, the session
// opened from the sidebar, and the 进度 view reached through the strip's overflow menu.
const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const phonePage = await phoneCtx.newPage()
phonePage.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`phone-native: ${m.text()}`) })
phonePage.on('pageerror', (e) => pageErrors.push(`phone-native: ${String(e)}`))
await phonePage.goto(url, { waitUntil: 'domcontentloaded' })
await phonePage.waitForTimeout(8000)
let nativePath = null
const sideToggle = phonePage.getByRole('button', { name: '打开侧边栏' })
if (await sideToggle.count()) {
  await sideToggle.first().click({ timeout: 5000 }).catch(() => {})
  await phonePage.waitForTimeout(1500)
  const entry = phonePage.getByText(/grok_workflow 工具跑一个工作/).first()
  if (await entry.count()) {
    await entry.click({ timeout: 5000 }).catch(() => {})
    await phonePage.waitForTimeout(5000)
    nativePath = 'sidebar-toggle+entry'
  }
}
const nativeOpened = await openProgress(phonePage)
log('phone-native progress opened:', nativeOpened, 'via', nativePath, 'tabPath', tabPath)
await phonePage.waitForTimeout(1200)
await scrollTop(phonePage)
await phonePage.screenshot({ path: `${SOAK}/phone-native-390-done.png` })
const nativeReading = await record(phonePage, 'phone-native-390-done', 'phone-native-390-done.png', (Date.now() - sentAt) / 1000, { width: 390, native: true, nativePath, nativeOpened })
saved['phone-native-390-done'] = { file: 'phone-native-390-done.png', at: (Date.now() - sentAt) / 1000, chip: nativeReading.chip }
writeFileSync(`${SOAK}/phone-native.json`, JSON.stringify({ nativePath, nativeOpened, tabPath, url: phonePage.url().replace(/token=[^&]+/, 'token=<redacted>') }, null, 1))

const sidebar = await page.evaluate(() => [...document.querySelectorAll('aside button, aside a, nav button, nav a')]
  .map((n) => n.innerText.trim()).filter((x) => x !== '').slice(0, 40))

writeFileSync(`${SOAK}/readings.json`, JSON.stringify({
  note: 'Every number below was read from the DOM by one evaluate issued at the moment of the screenshot named in the same entry, next to it. Nothing is derived, estimated or carried over: pnodes/edges/current/rings/checks are querySelectorAll counts, the graph assertions parse the data-gw-progress-source text that same evaluate returned, and the widths are the document\'s own scrollWidth/clientWidth. `assert` is the comparison of those raw numbers against the block\'s expectations, computed in the same evaluate result.',
  url: url.replace(/token=[^&]+/, 'token=<redacted>'),
  sessionUrl: sessionUrl.replace(/token=[^&]+/, 'token=<redacted>'),
  profile: 'web-clone (isolated DSH_HOME .tmp/soak-fork/dsh-home)',
  port: 3412,
  widths: { desktop: 1500, phone: 390 },
  sentAt,
  sentAtLocal: new Date(sentAt).toISOString(),
  tabPath,
  saved,
  entries: readings,
}, null, 1))
writeFileSync(`${SOAK}/console.json`, JSON.stringify({ consoleErrors, pageErrors }, null, 1))
log('CONSOLE', JSON.stringify({ consoleErrors, pageErrors }))
await browser.close()
