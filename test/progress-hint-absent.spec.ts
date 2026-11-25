import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The progress page never explains a change in advance, and never explains itself.
 *
 * A plan that moves — tasks added, re-ordered, re-owned — is redrawn, and the figure is the
 * whole message. Nothing on the page may tell the reader that an earlier result, number, or
 * plan may be followed by a different page, and a removed promise may not come back as a
 * shortened form, a softened disclaimer, an `i` badge, a tooltip, or a reader label. The
 * copy table is the copy: a string that is only hidden, conditionally rendered, or parked as
 * an empty placeholder still fails here, because the page and the table must agree on absence.
 *
 * The flowchart made this rule sharper: the page's visible words are a run name, a chip, the
 * leg words, the badges, the count line, the dock's button and the lines a reader opens. A
 * sentence about what a node means, or why a leg is grey, has nowhere to stand — and the
 * node's own accessibility label carries the leg, the visit and the state word, which must
 * therefore stay words and not turn into a reading of the figure.
 *
 * The checks read the shipped bundle (`src/client/index.js`), both dictionaries, and the
 * rendered tree — visible text, `title`, and the accessibility attributes a screen reader
 * speaks — so a family member cannot survive by moving to a surface the eye does not read.
 */

const SOURCE = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')

type Dict = Record<string, string>

/** One element of the stub tree: the bundle renders through plain `h()` calls. */
type Element = { type: unknown, props: Record<string, unknown>, children: unknown[] }

interface ProgressMember {
  seq: number
  label: string
  phase?: string
  childId: string
  order: number
  startedAt?: number
  endedAt?: number
  outcome?: string
}

/** One liveness intervention the Guardian recorded (a fact about the run, not a verdict). */
interface ProgressGuardianFinding {
  seq: number
  label: string
  signal: 'timeout' | 'heartbeat-loss'
  action: 'rescue' | 'observe' | 'cancel-run'
  reason: string
  atMs?: number
}

interface ProgressRun {
  runId: string
  name: string
  anchorSeq: number
  members: ProgressMember[]
  stopReason?: string
  /** Present only when the stream recorded a `guardian-start` for this run. */
  guardian?: {
    started: boolean
    armed: boolean
    budgetMs: number
    ended: boolean
    cancelled: boolean
    findings: ProgressGuardianFinding[]
  }
}

type Translator = (key: string, params?: Record<string, unknown>) => string

interface Bundle {
  GROK_WORKFLOW_DICT: Record<string, Dict>
  GROK_WORKFLOW_PANEL: { DICT: Record<string, Dict> }
  GROK_WORKFLOW_PROGRESS: { component: (props: Record<string, unknown>) => unknown }
  GROK_WORKFLOW_INTERNALS: { translator: (locale: string) => Translator }
}

/** The hook cells of the render in progress: React keeps them across a re-render. */
let rendering: { index: number, cells: unknown[] } | undefined

/**
 * Load the bundle the way the host does, with a stub React that calls function components.
 *
 * The progress tab reads no host service: its run facts arrive through `useGrokProgress`, so
 * the stub only has to be shaped like the hooks the page touches. When `stateful` is true
 * the hook set remembers its cells, because a node's calls only exist after a click and a
 * no-op setter would make every "after the click" assertion a photograph of the tree before
 * it.
 * @param stateful - whether `useState` survives the next render.
 * @returns the bundle the host would serve.
 */
function loadBundle(stateful = false): Bundle {
  let registration: { id: string, factory: (require: (id: string) => unknown) => Bundle } | undefined
  const record = globalThis as unknown as { window?: { __ModuleLoader__?: { load(spec: never): void } } | undefined }
  const previous = record.window
  record.window = { __ModuleLoader__: { load: (spec) => { registration = spec } } }
  try {
    new Function(SOURCE)()
  } finally {
    record.window = previous
  }
  expect(registration?.id).toBe('dsh-grok-workflow')
  const react = {
    createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): unknown => {
      const element: Element = { type, props: props ?? {}, children: children.flat(Infinity) as unknown[] }
      return typeof type === 'function' ? (type as (value: Record<string, unknown>) => unknown)(element.props) : element
    },
    useState: (initial: unknown) => {
      const value = typeof initial === 'function' ? (initial as () => unknown)() : initial
      // Outside a render there is no cell to keep, so the hook degrades to a constant.
      if (!stateful || rendering === undefined) return [value, () => {}]
      const cells = rendering
      const at = cells.index++
      if (at >= cells.cells.length) cells.cells[at] = value
      return [cells.cells[at], (next: unknown) => {
        cells.cells[at] = typeof next === 'function' ? (next as (value: unknown) => unknown)(cells.cells[at]) : next
      }]
    },
    useEffect: () => {},
    useMemo: (factory: () => unknown) => factory(),
    useRef: (initial: unknown) => ({ current: initial === undefined ? null : initial }),
    useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
  }
  return registration!.factory((id) => {
    if (id === 'react') return react
    throw new Error(`the bundle must not require ${id} at load time`)
  })
}

/** Every element of a stub tree, depth first. */
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

/** Every visible string of a stub tree, in document order. */
function visible(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') {
    if (node.trim() !== '') out.push(node)
    return out
  }
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const child of node) visible(child, out)
    return out
  }
  const element = node as Element
  if ('children' in element) visible(element.children, out)
  return out
}

/** The attributes a reader hears or a pointer reveals, which copy can hide in. */
const SPOKEN = ['title', 'aria-label', 'aria-description', 'alt', 'placeholder'] as const

/** Every string carried by a spoken or hover attribute of a stub tree. */
function spoken(node: unknown, out: string[] = []): string[] {
  for (const element of walk(node)) {
    for (const attribute of SPOKEN) {
      const value = element.props[attribute]
      if (typeof value === 'string' && value.trim() !== '') out.push(value)
    }
  }
  return out
}

/**
 * The wording family this page must not carry, one entry per form the rule names.
 *
 * The first seven patterns are about *change promised after the fact*. The last three are
 * the other half of the same rule, added by the one-page redesign (§19.3): a gloss that
 * tells the reader what a number or a gap *means* ("this is not a task verdict", "not
 * reported in the events", "the state is derived") is an explanation standing where the
 * figure should speak. A state word, a grey node, or the amber one says those things
 * without a sentence, so the sentences went. What stays allowed is copy that *names* a
 * state (`没过`, `取消`): naming is not explaining.
 */
const FAMILY: ReadonlyArray<{ form: string, pattern: RegExp }> = [
  {
    form: 'an earlier change makes later content change',
    pattern: /(?:结果|进度|计划|前面|上面)[^。；\n]{0,16}(?:一变|变了|改动|变化)[^。；\n]{0,20}(?:后面|之后|随后|跟着|随之)[^。；\n]{0,20}(?:变|改|动)/,
  },
  {
    form: 'what follows may move with it',
    pattern: /(?:后面|之后|随后|后续)[^。；\n]{0,12}(?:跟着|随之|可能)(?:会)?(?:变|改|动|更新)/,
  },
  {
    form: 'a hedged future change',
    pattern: /(?:可能|或许|也许|或将)[^。；\n]{0,8}(?:调整|变化|改动|更新|变动)/,
  },
  {
    form: 'a shortened form',
    pattern: /(?:以后|将来|后续|之后)(?:还)?或有(?:变化|调整|改动)/,
  },
  {
    form: 'a softened disclaimer standing in for it',
    pattern: /(?:以最新|以最终|以最后一版)[^。；\n]{0,6}为准|仅供参考|可能随(?:进度|计划)更新/,
  },
  {
    form: 'an update announcement',
    pattern: /已更新|更新完成|旧\s*(?:→|->|至)\s*新/,
  },
  {
    form: 'the English equivalents',
    pattern: /(?:may|might|could|will)\s+(?:still\s+)?(?:change|vary|adjust|update|differ)|subject to change|for reference only|final results? (?:may|might) differ/,
  },
  // The one-page redesign (§19.3) deleted the explanation families below. They are read
  // here as well as in `test/i18n-parity.spec.ts` because a *reading* of the figure is a
  // sentence about the page, not a word of it: "this is not a task verdict" and "not
  // reported in the events" both told the reader what to make of a number or a gap
  // instead of letting the mark say it.
  {
    form: 'a count glossed as a verdict',
    pattern: /(?:不是|并不代表|不等于|不代表)[^。；\n]{0,10}(?:任务通过|通过率|通过数)|not a task verdict|isn['’]?t a task verdict/iu,
  },
  {
    form: 'a gap narrated as missing evidence',
    pattern: /事件中没有报告|not reported in the events/iu,
  },
  {
    form: 'a derived state explained instead of shown',
    pattern: /状态是推导出来的|推导出来的，不是事件里写的|按阻塞显示|the state is derived|shown as blocked/iu,
  },
]

/** Every family form one string matches. */
function forms(text: string): string[] {
  return FAMILY.filter((entry) => entry.pattern.test(text)).map((entry) => entry.form)
}

/** The word-like strings of a stub tree: glyphs and separators are not copy. */
function words(node: unknown): string[] {
  return visible(node).filter((text) => /[\p{Script=Han}]|[A-Za-z]{2}/u.test(text))
}

/** What `next` carries that `previous` does not, counting repeats. */
function addedText(next: readonly string[], previous: readonly string[]): string[] {
  const rest = [...previous]
  return next.filter((text) => {
    const at = rest.indexOf(text)
    if (at === -1) return true
    rest.splice(at, 1)
    return false
  })
}

/** One row of a run, with its plan phase and settlement. */
function member(seq: number, phase: string, outcome: string, label = '执行'): ProgressMember {
  return { seq, label, phase, childId: `c${seq}`, order: seq - 1, startedAt: 1_000 * seq, endedAt: 1_000 * seq + 500, outcome }
}

/** One run, in the shape the host hands the tab. */
function runOf(members: ProgressMember[], stopReason?: string, guardian?: ProgressRun['guardian']): ProgressRun {
  return {
    runId: 'r-hint',
    name: '任务团队',
    anchorSeq: 1,
    members,
    ...stopReason === undefined ? {} : { stopReason },
    ...guardian === undefined ? {} : { guardian },
  }
}

describe('progress page: the change explanation stays deleted', () => {
  const bundle = loadBundle()
  const stateful = loadBundle(true)
  const t = bundle.GROK_WORKFLOW_INTERNALS.translator('zh')

  /** Render the tab against one run, the way the Host hands it over. */
  function page(run: ProgressRun | undefined): unknown {
    const snapshot = run === undefined ? { runs: [], activeRun: undefined } : { runs: [run], activeRun: run }
    return bundle.GROK_WORKFLOW_PROGRESS.component({
      t,
      progressT: t,
      useGrokProgress: (select: (value: unknown) => unknown) => select(snapshot),
    })
  }

  /** The tab again, with hook cells that survive the clicks that open every node. */
  function clickablePage(run: ProgressRun): () => unknown {
    const cells: unknown[] = []
    const props = {
      t,
      progressT: t,
      useGrokProgress: (select: (value: unknown) => unknown) => select({ runs: [run], activeRun: run }),
    }
    return () => {
      const before = rendering
      const local = { index: 0, cells }
      rendering = local
      try {
        return stateful.GROK_WORKFLOW_PROGRESS.component(props)
      } finally {
        rendering = before
      }
    }
  }

  /** The page with every node that holds calls opened, drawn by the stateful bundle. */
  function openedPage(run: ProgressRun): unknown {
    const render = clickablePage(run)
    let page = render()
    for (const toggle of walk(page).filter((element) => element.props['data-gw-progress-node-toggle'] !== undefined)) {
      ;(toggle.props['onClick'] as () => void)()
      page = render()
    }
    return page
  }

  /** A run with a recorded Guardian, a planner and one task through both gates. */
  function guardedRun(): ProgressRun {
    return runOf([
      member(1, '规划', 'completed', '规划助手'),
      member(2, '任务 1 · 搭建', 'completed'),
      member(3, '任务 1 · 搭建', 'completed', '检查'),
    ], 'completed', {
      started: true,
      armed: true,
      budgetMs: 240_000,
      ended: true,
      cancelled: false,
      findings: [{ seq: 2, label: '执行 · 任务 1 · 搭建', signal: 'timeout', action: 'rescue', reason: '子任务心跳停了', atMs: 60_000 }],
    })
  }

  it('ships no copy in either language that promises a later repaint', () => {
    const tables: Array<{ table: string, dict: Dict }> = [
      { table: 'GROK_WORKFLOW_DICT.zh', dict: bundle.GROK_WORKFLOW_DICT['zh']! },
      { table: 'GROK_WORKFLOW_DICT.en', dict: bundle.GROK_WORKFLOW_DICT['en']! },
      { table: 'GROK_WORKFLOW_PANEL.DICT.zh', dict: bundle.GROK_WORKFLOW_PANEL.DICT['zh']! },
      { table: 'GROK_WORKFLOW_PANEL.DICT.en', dict: bundle.GROK_WORKFLOW_PANEL.DICT['en']! },
    ]
    const offenders: string[] = []
    for (const { table, dict } of tables) {
      for (const [key, value] of Object.entries(dict)) {
        const matched = forms(value)
        if (matched.length > 0) offenders.push(`${table} ${key}: ${matched.join(', ')} → ${value}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('leaves nothing on the page, in a tooltip, or in a reader label', () => {
    // A finished flow, a flow still working, and a flow with a failed leg and an open one:
    // the three states that carry the most copy (the count line, the state words, the legs).
    const trees = [
      page(runOf([member(1, '任务 1 · 搭建', 'completed'), member(2, '任务 2 · 收尾', 'completed')], 'completed')),
      page(runOf([member(1, '任务 1 · 搭建', 'completed'), member(2, '任务 2 · 收尾', '')])),
      page(runOf([member(1, '任务 1 · 搭建', 'failed'), member(2, '任务 2 · 收尾', 'completed', '检查')])),
      // …and the widest page the design can draw: every node opened, with its calls.
      openedPage(guardedRun()),
    ]
    for (const tree of trees) {
      const families = [...visible(tree), ...spoken(tree)].map((text) => ({ text, matched: forms(text) }))
        .filter((entry) => entry.matched.length > 0)
      expect(families).toEqual([])
    }
  })

  it('adds no copy when the plan changes: the figure redraws, the words stay', () => {
    // The same two tasks, re-owned: task 1 takes the work task 2 used to hold and vice versa.
    // The planner's own word names no gate, so its lines print the task title beside it —
    // which is what makes the re-owned plan visible without a sentence about the swap.
    const before = page(runOf([member(1, '任务 1 · 搭建', 'completed', '规划助手'), member(2, '任务 2 · 收尾', 'completed', '规划助手')], 'completed'))
    const after = page(runOf([member(1, '任务 1 · 收尾', 'completed', '规划助手'), member(2, '任务 2 · 搭建', 'completed', '规划助手')], 'completed'))
    // A collapsed node prints no task title at all, so the two figures say exactly the same
    // words: the legs, their badges and the count. The change is the figure, not a sentence.
    expect(visible(after)).toEqual(visible(before))
    // The titles are inside the nodes, and only there: opening both shows the new plan, and
    // nothing but the plan's own names arrived with it.
    const openedBefore = openedPage(runOf([member(1, '任务 1 · 搭建', 'completed', '规划助手'), member(2, '任务 2 · 收尾', 'completed', '规划助手')], 'completed'))
    const openedAfter = openedPage(runOf([member(1, '任务 1 · 收尾', 'completed', '规划助手'), member(2, '任务 2 · 搭建', 'completed', '规划助手')], 'completed'))
    expect(addedText(visible(openedAfter), visible(openedBefore)).sort())
      .toEqual(['任务 1 · 收尾', '任务 2 · 搭建'].sort())
    expect([...visible(openedAfter), ...spoken(openedAfter)].filter((text) => forms(text).length > 0)).toEqual([])
  })

  it('deletes it instead of hiding it: no drawn string sits behind a hidden rule', () => {
    // The rule is a deletion, not a veil. Copy that CSS hides, an `opacity: 0` corner, or a
    // paragraph pulled out of the accessibility tree is still shipped and comes back on the
    // next restyle, so the page may not carry text it does not show.
    const tree = openedPage(guardedRun())
    const hidden = walk(tree).filter((element) => {
      const style = element.props['style'] as Record<string, unknown> | undefined
      if (style === undefined || style === null) return false
      const veiled = style['display'] === 'none' || style['visibility'] === 'hidden' || style['opacity'] === 0 || style['opacity'] === '0'
      return veiled && words(element).length > 0
    })
    expect(hidden).toEqual([])
    // The same rule for a reader: a label taken out of the accessibility tree hides the
    // copy from one audience while shipping it to the other. The node's dot is decoration
    // and carries no word; the wire layer carries no word either.
    const muzzled = walk(tree)
      .filter((element) => element.props['aria-hidden'] === 'true' && words(element).length > 0)
    expect(muzzled).toEqual([])
  })

  it('keeps the empty page and a not-yet-reached node free of it', () => {
    // No run at all, and a run whose only call is still open: both render the flow the
    // recorder has, which is where a note about "what may change later" would otherwise be
    // tempting to add.
    const trees = [
      page(undefined),
      page(runOf([{ seq: 1, label: '执行', phase: '任务 1 · 搭建', childId: 'c1', order: 0 }])),
      page(runOf([])),
    ]
    for (const tree of trees) {
      expect([...visible(tree), ...spoken(tree)].filter((text) => forms(text).length > 0)).toEqual([])
    }
  })

  it('reserves no key for it: change-note copy has no home in the table', () => {
    // A key named after a change is a slot reserved for the sentence, even while empty:
    // the next copy pass fills it instead of asking whether the page needs it. The
    // coordination report's own field labels (`progress.field.*`) name delivered work, not
    // a note about the page, so they are a different namespace and stay.
    const reserved = Object.keys(bundle.GROK_WORKFLOW_DICT['zh']!)
      .filter((key) => key.startsWith('progress.'))
      .filter((key) => /(?:change|update|replan|drift)/i.test(key))
    expect(reserved).toEqual([])
    // And nothing is parked as a blank value: an empty string is a placeholder that renders
    // as a gap, which is the "hidden" version of the same deletion.
    const blank = Object.entries(bundle.GROK_WORKFLOW_DICT['zh']!)
      .filter(([key]) => key.startsWith('progress.'))
      .filter(([, value]) => value.trim() === '')
      .map(([key]) => key)
    expect(blank).toEqual([])
  })

  it('keeps the row control’s one word free of every form', () => {
    // The dictionary walk above reads every value of all four tables, so this key is
    // already covered the moment it exists. This test names it, so the coverage is a stated
    // fact and not an accident of that loop.
    for (const locale of ['zh', 'en']) {
      const dict = bundle.GROK_WORKFLOW_DICT[locale]!
      const value = dict['progress.task.detail']
      expect(value, `${locale} progress.task.detail is missing`).toBeTypeOf('string')
      expect(value!.trim(), `${locale} progress.task.detail is blank`).not.toBe('')
      expect(forms(value!), `${locale} progress.task.detail → ${value}`).toEqual([])
    }
    // And the whole progress namespace stays clean of the family, which is the half of the
    // page a reader is most likely to be told a story about.
    const offenders: string[] = []
    for (const locale of ['zh', 'en']) {
      for (const [key, value] of Object.entries(bundle.GROK_WORKFLOW_DICT[locale]!)) {
        if (!key.startsWith('progress.')) continue
        const matched = forms(value)
        if (matched.length > 0) offenders.push(`${locale} ${key}: ${matched.join(', ')} → ${value}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
