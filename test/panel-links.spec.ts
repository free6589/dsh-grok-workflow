import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The chat task list: a finished subtask must stay clickable.
 *
 * Why this file exists (user report, Round 27): in the chat task list a *running* subtask
 * row (`任务 1 · <title>`) was a link, but every finished row — the planner row
 * `规划助手已完成`, a task's `执行` / `检查` rows — was inert text, so the output of a
 * completed subtask could not be opened at all. The stock renderer
 * (`@deepseek-ai/dsh-client-ui-workflow-run`) gates that link on
 * `member.status === 'running'`; the plugin's own renderer, registered in place of it
 * through the `conversation.chat.node` keyed slot, gates it on "the child session can be
 * opened" instead — which is true after the subtask completes.
 *
 * These tests are deterministic: they load the shipped browser bundle with a recording
 * React stub, call the renderer as a plain function, and read the element tree it returns.
 * No model, no network, no browser.
 */

type Element = { type: unknown, props: Record<string, unknown>, children: unknown[] }

interface PanelBundle {
  NS: string
  DICT: Record<string, Record<string, string>>
  component: (props: Record<string, unknown>) => Element
  mount: (ctx: unknown, workspace: unknown, i18n: unknown) => (() => void) | undefined
  translate: (locale: string, key: string, params?: Record<string, unknown>) => string
  translator: (locale: string) => (key: string, params?: Record<string, unknown>) => string
  memberMode: (child: unknown, identity: unknown, parentSessionId: unknown) => string | undefined
  openableKey: (sessions: unknown, phases: unknown, parentSessionId: unknown) => string
  openableMap: (key: string) => Map<string, string>
  runMode: (data: unknown) => string
  phaseSummary: (members: unknown, t: (key: string, params?: Record<string, unknown>) => string) => string
  statusKey: Record<string, string>
}

interface Bundle {
  apply(ctx: unknown): void
  GROK_WORKFLOW_PANEL: PanelBundle
}

/**
 * Load the browser bundle the way the host does, with a React stub that records elements.
 * Hooks are called outside a renderer, so each one returns its initial value: the panel
 * is a pure function of its props for the purpose of these assertions.
 */
function loadBundle(): Bundle {
  const source = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')
  let registration: { id: string, factory: (require: (id: string) => unknown) => Bundle } | undefined
  const globalRecord = globalThis as unknown as { window?: { __ModuleLoader__?: { load(spec: never): void } } | undefined }
  const previous = globalRecord.window
  globalRecord.window = { __ModuleLoader__: { load: (spec) => { registration = spec } } }
  try {
    new Function(source)()
  } finally {
    globalRecord.window = previous
  }
  expect(registration?.id).toBe('dsh-grok-workflow')
  const react = {
    createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => ({
      type,
      props: props ?? {},
      children: children.flat(Infinity) as unknown[],
    }),
    // Hooks are delegated to the harness of the render in progress, so a test can click a
    // disclosure and re-render the way React would (see `render`).
    useState: (initial: unknown) => current().useState(initial),
    useEffect: () => {},
    useMemo: (factory: () => unknown) => factory(),
    useSyncExternalStore: () => undefined,
  }
  return registration!.factory((id) => {
    if (id === 'react') return react
    throw new Error(`the bundle must not require ${id} at load time`)
  })
}

const bundle = loadBundle()
const panel = bundle.GROK_WORKFLOW_PANEL
const zh = panel.translator('zh')
const en = panel.translator('en')

const PARENT = 's-run'
const PLANNER = 'c-plan'
const WORKER = 'c-work'

/** The stock projection's node data shape, as `dsh-client-ui-workflow-run` builds it. */
function runData(status: string, memberStatus: string): Record<string, unknown> {
  return {
    name: '任务团队 · 2 个任务',
    status,
    phases: [
      { key: 'value:2:规划', phase: '规划', members: [{ seq: 1, label: '规划助手', childId: PLANNER, status: memberStatus }] },
      { key: 'value:2:执行', phase: '执行', members: [{ seq: 2, label: '执行', childId: WORKER, status: memberStatus }] },
    ],
  }
}

/** Sessions projection: both children belong to this run's session and project a mode. */
function sessions(modeFor: Record<string, string | undefined> = { [PLANNER]: 'one-shot', [WORKER]: 'continuable' }): Record<string, unknown> {
  const byId: Record<string, unknown> = {}
  const projectionsBySession: Record<string, unknown> = {}
  for (const [childId, mode] of Object.entries(modeFor)) {
    byId[childId] = { id: childId, parentId: PARENT, running: false }
    projectionsBySession[childId] = mode === undefined ? { values: {} } : { values: { subagent: { mode } } }
  }
  return { byId, projectionsBySession }
}

/** The minimum hook runtime the panel needs: ordered cells that survive a re-render. */
type Harness = { index: number, cells: unknown[], useState(initial: unknown): unknown[] }

let harness: Harness | undefined

/** The harness of the render in progress. */
function current(): Harness {
  if (harness === undefined) throw new Error('the panel rendered outside a harness')
  return harness
}

/** Every element in the returned tree, depth first. */
function walk(node: unknown, out: Element[] = []): Element[] {
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const child of node) walk(child, out)
    return out
  }
  const element = node as Element
  if ('type' in element && 'props' in element) {
    out.push(element)
    walk(element.children, out)
  }
  return out
}

/**
 * Render the panel the way the framework would, then expand it if it starts collapsed.
 *
 * A finished run starts collapsed (the stock panel does the same), so a test that wants to
 * click a finished row has to open the run first — which is what a reader does too.
 */
function render(data: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  const opened: unknown[] = []
  const props: Record<string, unknown> = {
    node: { kind: 'workflow-run', data },
    sessionId: PARENT,
    useSessions: (selector: (value: unknown) => unknown) => selector(overrides['sessions'] ?? sessions()),
    openSession: (target: unknown) => { opened.push(target) },
    t: zh,
    ...overrides,
  }
  const cells: unknown[] = []
  const local: Harness = {
    index: 0,
    cells,
    useState(initial) {
      const at = this.index++
      if (at >= this.cells.length) this.cells[at] = typeof initial === 'function' ? (initial as () => unknown)() : initial
      const set = (next: unknown) => {
        this.cells[at] = typeof next === 'function' ? (next as (value: unknown) => unknown)(this.cells[at]) : next
      }
      return [this.cells[at], set]
    },
  }
  const previous = harness
  harness = local
  const run = () => {
    local.index = 0
    return panel.component(props)
  }
  let element: Element
  try {
    element = run()
    const toggle = walk(element).find(node => node.props['data-run-toggle'] === true)
    if (toggle !== undefined && toggle.props['aria-expanded'] === false) {
      ;(toggle.props['onClick'] as () => void)()
      element = run()
    }
  } finally {
    harness = previous
  }
  const rows = walk(element).filter(node => node.props['data-member-status'] !== undefined)
  return { element, rows, opened }
}

describe('chat task list: a finished subtask stays clickable', () => {
  it('renders the planner row as a link when it is still running (parity with the stock panel)', () => {
    const { rows } = render(runData('running', 'running'))
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.type).toBe('button')
      expect(row.props['data-member-openable']).toBe('true')
    }
  })

  it('keeps the link on a completed subtask (the reported regression)', () => {
    const { rows } = render(runData('completed', 'completed'))
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.type).toBe('button')
      expect(row.props['data-member-openable']).toBe('true')
      expect(row.props['data-member-status']).toBe('completed')
    }
    const planner = rows[0]!
    expect(planner.props['aria-label']).toBe('打开 规划助手')
  })

  it('keeps the link on a failed, cancelled or interrupted subtask', () => {
    for (const status of ['failed', 'cancelled', 'interrupted']) {
      const { rows } = render(runData('failed', status))
      expect(rows).toHaveLength(2)
      for (const row of rows) {
        expect(row.type).toBe('button')
        expect(row.props['data-member-status']).toBe(status)
      }
    }
  })

  it('preserves the link reference across the running → completed → failed transitions', () => {
    const keyFor = (status: string) => panel.openableKey(sessions(), (runData(status, status)['phases'] as unknown[]), PARENT)
    const running = keyFor('running')
    const completed = keyFor('completed')
    const failed = keyFor('failed')
    // The child sessions are the same objects in all three states: only their status moved,
    // so the navigation reference must not move at all.
    expect(completed).toBe(running)
    expect(failed).toBe(running)
    expect(panel.openableMap(running).get(PLANNER)).toBe('one-shot')
    expect(panel.openableMap(running).get(WORKER)).toBe('continuable')
    // …and the row really is still a link in each state, not merely equal on paper.
    for (const status of ['running', 'completed', 'failed']) {
      const { rows } = render(runData(status, status))
      expect(rows.every(row => row.type === 'button')).toBe(true)
    }
  })

  it('opens the completed subtask with its own child session and mode', () => {
    const { rows, opened } = render(runData('completed', 'completed'))
    ;(rows[0]!.props['onClick'] as () => void)()
    ;(rows[1]!.props['onClick'] as () => void)()
    expect(opened).toEqual([
      { parentSessionId: PARENT, childSessionId: PLANNER, mode: 'one-shot' },
      { parentSessionId: PARENT, childSessionId: WORKER, mode: 'continuable' },
    ])
  })

  it('leaves a row inert when its child cannot be opened', () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ['no projection', { sessions: sessions({ [PLANNER]: undefined, [WORKER]: undefined }) }],
      ['external child', { sessions: sessions({ [PLANNER]: 'external', [WORKER]: 'external' }) }],
      ['unknown mode', { sessions: sessions({ [PLANNER]: 'unknown', [WORKER]: 'unknown' }) }],
      ['another parent', { sessionId: 's-other' }],
    ]
    for (const [label, overrides] of cases) {
      const { rows } = render(runData('completed', 'completed'), overrides)
      expect(rows, label).toHaveLength(2)
      for (const row of rows) {
        expect(row.type, label).toBe('div')
        expect(row.props['data-member-openable'], label).toBe('false')
        expect(row.props['onClick'], label).toBeUndefined()
      }
    }
  })

  it('never opens a child that belongs to a different run session', () => {
    expect(panel.memberMode({ id: PLANNER, parentId: 's-elsewhere' }, { mode: 'one-shot' }, PARENT)).toBeUndefined()
    expect(panel.memberMode({ id: PLANNER, parentId: PARENT }, { mode: 'one-shot' }, PARENT)).toBe('one-shot')
    expect(panel.memberMode(undefined, { mode: 'one-shot' }, PARENT)).toBeUndefined()
    expect(panel.memberMode({ id: PLANNER, parentId: PARENT }, undefined, PARENT)).toBeUndefined()
  })
})

describe('chat task list: wording and disclosure', () => {
  it('words every status in both shipped languages', () => {
    expect(panel.statusKey).toEqual({
      running: 'status.running',
      completed: 'status.completed',
      failed: 'status.failed',
      cancelled: 'status.cancelled',
      interrupted: 'status.interrupted',
    })
    expect(zh('status.completed')).toBe('已完成')
    expect(en('status.completed')).toBe('Completed')
    expect(zh('member.open', { name: '规划助手' })).toBe('打开 规划助手')
    expect(en('member.open', { name: 'Planner' })).toBe('Open Planner')
    // No Chinese leaks into the English dictionary.
    for (const [key, value] of Object.entries(panel.DICT['en']!)) {
      expect(/[\u4e00-\u9fff]/.test(value), key).toBe(false)
    }
  })

  it('summarises a phase the way the stock panel does', () => {
    const completed = [{ status: 'completed' }, { status: 'completed' }]
    expect(panel.phaseSummary(completed, zh)).toBe('已完成 2')
    const mixed = [{ status: 'completed' }, { status: 'running' }]
    expect(panel.phaseSummary(mixed, zh)).toBe('运行中 1')
    const interrupted = [{ status: 'completed' }, { status: 'interrupted' }]
    expect(panel.phaseSummary(interrupted, zh)).toBe('已完成 1 · 已中断 1')
  })

  it('folds run status into a disclosure mode', () => {
    expect(panel.runMode(runData('running', 'running'))).toBe('running')
    expect(panel.runMode(runData('completed', 'completed'))).toBe('clean')
    expect(panel.runMode(runData('failed', 'failed'))).toBe('abnormal')
    expect(panel.runMode(runData('cancelled', 'cancelled'))).toBe('abnormal')
  })

  it('renders the run header with its member count and status', () => {
    const { element } = render(runData('completed', 'completed'))
    const texts = walk(element)
      .map(node => node.children.filter(child => typeof child === 'string'))
      .flat()
    expect(texts).toContain('任务团队 · 2 个任务')
    expect(texts).toContain('2 个成员')
    expect(texts).toContain('已完成')
  })
})

describe('chat task list: slot registration', () => {
  type Captured = { options: Record<string, unknown>, component: unknown }

  function fakeSlots(fail = false) {
    const captured: Captured[] = []
    return {
      captured,
      slots: {
        inject: (_name: string, factory: () => unknown) => factory(),
        register: (options: Record<string, unknown>, component: unknown) => {
          if (fail) throw new Error('duplicate key')
          captured.push({ options, component })
          return () => {}
        },
      },
    }
  }

  it('re-registers the workflow-run key of the chat node slot', () => {
    const { slots, captured } = fakeSlots()
    const opened: unknown[] = []
    const dispose = panel.mount({ slots }, { openSession: (target: unknown) => { opened.push(target) } }, { locale: 'zh', t: zh })
    expect(typeof dispose).toBe('function')
    expect(captured).toHaveLength(1)
    expect(captured[0]!.options['name']).toBe('conversation.chat.node')
    expect(captured[0]!.options['key']).toBe('workflow-run')
    // The runtime shadows a keyed entry by priority: the same key at the *same*
    // priority throws (and fails the other registrant's whole plugin boot), and
    // "lowest renders". The stock renderer registers at the default 0, so this
    // registration must sit strictly below it (measured: without the priority the
    // stock `dsh-client-ui-workflow-run` boot failed on a real Web GUI).
    expect(captured[0]!.options['priority']).toBe(-1)
    // A locale face is present, so the entry names its namespace and gets a live `t`.
    expect(captured[0]!.options['locale']).toBe('grok-workflow-panel')
    expect(captured[0]!.component).toBe(panel.component)
    const face = (captured[0]!.options['inject'] as () => Record<string, unknown>)()
    ;(face['openSession'] as (target: unknown) => void)({ parentSessionId: PARENT, childSessionId: PLANNER, mode: 'one-shot' })
    expect(opened).toEqual([{ parentSessionId: PARENT, childSessionId: PLANNER, mode: 'one-shot' }])
    expect((face['panelT'] as (key: string) => string)('status.completed')).toBe('已完成')
  })

  it('omits the locale namespace when the composition has no locale face', () => {
    const { slots, captured } = fakeSlots()
    panel.mount({ slots }, { openSession: () => {} }, { locale: undefined, t: en })
    expect(captured[0]!.options['locale']).toBeUndefined()
    const face = (captured[0]!.options['inject'] as () => Record<string, unknown>)()
    expect((face['panelT'] as (key: string) => string)('status.completed')).toBe('Completed')
  })

  it('keeps the plugin alive when the registration is refused', () => {
    const { slots } = fakeSlots(true)
    const warn = console.warn
    const warnings: string[] = []
    console.warn = (message: string) => { warnings.push(String(message)) }
    try {
      expect(panel.mount({ slots }, { openSession: () => {} }, { locale: 'zh', t: zh })).toBeUndefined()
    } finally {
      console.warn = warn
    }
    expect(warnings.join('\n')).toContain('workflow-run task panel could not be registered')
  })
})
