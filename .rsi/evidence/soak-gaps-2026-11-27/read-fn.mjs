const READ = () => {
  const count = (s) => document.querySelectorAll(s).length
  const textOf = (s) => {
    const n = document.querySelector(s)
    return n === null ? null : n.innerText.trim()
  }
  const attrOf = (s, a) => {
    const n = document.querySelector(s)
    return n === null ? null : n.getAttribute(a)
  }
  const rectOf = (node) => {
    if (node === null || node === undefined) return null
    const b = node.getBoundingClientRect()
    return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }
  }
  const overlapArea = (a, b) => {
    if (a === null || b === null) return 0
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
    return w > 0 && h > 0 ? Math.round(w * h * 100) / 100 : 0
  }
  const round = (v) => Math.round(v * 100) / 100
  const cards = [...document.querySelectorAll('[data-gw-progress-pnode]')].map((card) => ({
    id: card.getAttribute('data-gw-progress-pnode'),
    kind: card.getAttribute('data-kind'),
    rect: rectOf(card),
  }))
  const sheetNode = document.querySelector('[data-gw-progress-sheet]')
  const sheetRect = rectOf(sheetNode)
  const dockNode = document.querySelector('[data-gw-progress-dock]')
  const dockRect = rectOf(dockNode)
  const fillNode = document.querySelector('[data-gw-progress-dock-fill]')
  const roomNode = document.querySelector('.gw-progress-sheet-room')
  const composer = (() => {
    const at = document.elementFromPoint(Math.floor(window.innerWidth / 2), window.innerHeight - 6)
    if (at === null) return null
    let node = at
    let pinned = null
    while (node !== null && node !== document.documentElement) {
      const p = getComputedStyle(node).position
      if (p === 'fixed' || p === 'sticky') { pinned = node; break }
      node = node.parentElement
    }
    const t = pinned ?? at
    const b = t.getBoundingClientRect()
    return { pinned: pinned !== null, top: round(b.top), height: round(b.height) }
  })()
  // matchMedia change 监听：源码已删监听（只剩 CSS 断点）——读一次 listeners 证明无 JS 断点态。
  // 页面无直接钩子，这里读 resize 监听数做旁证（面板自带一个 window resize draw）。
  const sheet = sheetNode
  // guardian 四块
  const gblocks = [...document.querySelectorAll('[data-gw-progress-guardian-block]')].map((n) => ({
    name: n.getAttribute('data-gw-progress-guardian-block'),
    text: n.innerText.trim().slice(0, 80),
  }))
  return {
    mounted: document.querySelector('[data-gw-progress]') !== null,
    w: window.innerWidth,
    chip: textOf('[data-gw-progress-chip]'),
    chipState: attrOf('[data-gw-progress-chip]', 'data-state'),
    line: textOf('[data-gw-progress-line]'),
    dock: textOf('[data-gw-progress-dock]'),
    dockState: attrOf('[data-gw-progress-dock]', 'data-state'),
    dockBtn: textOf('[data-gw-progress-dock-fill]'),
    dockFillCount: count('[data-gw-progress-dock-fill]'),
    filledLine: textOf('[data-gw-progress-filled]'),
    stuck: textOf('[data-gw-progress-stuck]'),
    stuckPresent: document.querySelector('[data-gw-progress-stuck]') !== null,
    guardianPresent: document.querySelector('[data-gw-progress-guardian]') !== null,
    guardianState: attrOf('[data-gw-progress-guardian]', 'data-state'),
    guardianBlocks: gblocks,
    pnodes: count('[data-gw-progress-pnode]'),
    cards: cards.map((c) => ({ id: c.id, kind: c.kind })),
    nodeCalls: count('[data-gw-progress-node-calls]'),
    callRows: count('[data-gw-progress-node-calls] [data-gw-progress-log-row]'),
    traceActive: count('[data-trace="active"]'),
    traceDim: count('[data-trace="dim"]'),
    sheetCount: count('[data-gw-progress-sheet]'),
    sheetRect,
    sheetRows: count('[data-gw-progress-sheet] [data-gw-progress-log-row]'),
    sheetGroups: count('[data-gw-progress-sheet] .gw-progress-sheet-group'),
    sheetTitle: sheet === null ? null : (sheet.innerText.split('\n')[0] ?? '').trim(),
    roomPresent: roomNode !== null,
    roomHeight: roomNode === null ? null : round(roomNode.getBoundingClientRect().height),
    composerTop: composer === null ? null : composer.top,
    sheetBottom: sheetRect === null ? null : round(sheetRect.bottom),
    gap: sheetRect === null || composer === null ? null : round(composer.top - sheetRect.bottom),
    aboveComposer: sheetRect === null || composer === null ? null : sheetRect.bottom <= composer.top,
    inViewport: sheetRect === null ? null : (sheetRect.top >= 0 && sheetRect.bottom <= window.innerHeight),
    overlapAreaTotal: sheetRect === null ? null : round(cards.reduce((s, c) => s + overlapArea(sheetRect, c.rect), 0)),
    dockOverlap: overlapArea(sheetRect, dockRect),
    mq720: window.matchMedia('(max-width: 720px)').matches,
    mq480: window.matchMedia('(max-width: 480px)').matches,
    mq721: window.matchMedia('(min-width: 721px)').matches,
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
    noHS: document.documentElement.scrollWidth === document.documentElement.clientWidth,
    // 重试虚线：attempt 节点 + 失败行（真机失败态才有）
    edges: count('[data-gw-progress-edge]'),
    edgeKinds: [...document.querySelectorAll('[data-gw-progress-edge]')].map((e) => e.getAttribute('data-kind')).join(','),
    attemptDots: count('[data-gw-progress-pnode-attempt], [data-gw-progress-pnode-retry]'),
    failedRows: [...document.querySelectorAll('[data-gw-progress-log-row]')].filter((r) => /没过|失败|fail/i.test(r.innerText)).length,
  }
}
