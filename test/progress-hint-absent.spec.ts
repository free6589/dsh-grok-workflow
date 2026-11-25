import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The progress page never explains a change in advance.
 *
 * A plan that moves — tasks added, re-ordered, re-owned — is redrawn, and the figure is the
 * whole message. Nothing on the page may tell the reader that an earlier result, number, or
 * plan may be followed by a different page, and a removed promise may not come back as a
 * shortened form, a softened disclaimer, an `i` badge, a tooltip, or a reader label. The
 * copy table is the copy: a string that is only hidden, conditionally rendered, or parked as
 * an empty placeholder still fails here, because the page and the table must agree on absence.
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

interface ProgressRun {
  runId: string
  name: string
  anchorSeq: number
  members: ProgressMember[]
  stopReason?: string
}

type Translator = (key: string, params?: Record<string, unknown>) => string

interface Bundle {
  GROK_WORKFLOW_DICT: Record<string, Dict>
  GROK_WORKFLOW_PANEL: { DICT: Record<string, Dict> }
  GROK_WORKFLOW_PROGRESS: { component: (props: Record<string, unknown>) => unknown }
  GROK_WORKFLOW_INTERNALS: { translator: (locale: string) => Translator }
}

/**
 * Load the bundle the way the host does, with a stub React that calls function components.
 * The progress tab reads no host service: its run facts arrive through `useGrokProgress`, so
 * the stub only has to be shaped like the hooks the page touches.
 */
function loadBundle(): Bundle {
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
    useState: (initial: unknown) => [typeof initial === 'function' ? (initial as () => unknown)() : initial, () => {}],
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
 * figure should speak. A state word, a grey segment, or the amber bar says those things
 * without a sentence, so the sentences went. What stays allowed is copy that *names* a
 * state (`没过`, `取消`, `这一轮没有交卷稿`): naming is not explaining.
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
function words(node: unknown, out: string[] = []): string[] {
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

describe('progress page: the change explanation stays deleted', () => {
  const bundle = loadBundle()
  const t = bundle.GROK_WORKFLOW_INTERNALS.translator('zh')

  /** Render the tab against one run, the way the Host hands it over. */
  function page(runs: ProgressRun[], activeRun: ProgressRun | undefined): unknown {
    return bundle.GROK_WORKFLOW_PROGRESS.component({
      t,
      progressT: t,
      useGrokProgress: (select: (value: unknown) => unknown) => select({ runs, activeRun }),
    })
  }

  /** Render one run, ended or still working. */
  function runPage(members: ProgressMember[], stopReason?: string): unknown {
    const run: ProgressRun = {
      runId: 'r-hint',
      name: '任务团队',
      anchorSeq: 1,
      members,
      ...stopReason === undefined ? {} : { stopReason },
    }
    return page([run], run)
  }

  /** The plan-task names in the order the page draws them. */
  function cardNames(tree: unknown): string[] {
    return walk(tree)
      .filter((element) => element.props['data-gw-progress-task-name'] === true)
      .flatMap((element) => visible(element))
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
    // A finished plan, a plan still working, and a plan with a failed row: the three states
    // that carry the most copy (settle legend, live percentage, derived tooltips).
    const trees = [
      runPage([member(1, '任务 1 · 搭建', 'completed'), member(2, '任务 2 · 收尾', 'completed')], 'completed'),
      runPage([member(1, '任务 1 · 搭建', 'completed'), member(2, '任务 2 · 收尾', '')]),
      runPage([member(1, '任务 1 · 搭建', 'failed'), member(2, '任务 2 · 收尾', 'completed', '检查')]),
    ]
    for (const tree of trees) {
      const families = [...visible(tree), ...spoken(tree)].map((text) => ({ text, matched: forms(text) }))
        .filter((entry) => entry.matched.length > 0)
      expect(families).toEqual([])
    }
  })

  it('adds no copy when the plan changes: the figure redraws, the words stay', () => {
    // The same two tasks, re-owned: task 1 takes the work task 2 used to hold and vice versa.
    const before = runPage([member(1, '任务 1 · 搭建', 'completed'), member(2, '任务 2 · 收尾', 'completed')], 'completed')
    const after = runPage([member(1, '任务 1 · 收尾', 'completed'), member(2, '任务 2 · 搭建', 'completed')], 'completed')
    // The figure is the new plan, not the old one kept for comparison.
    expect(cardNames(before)).toEqual(['任务 1 · 搭建', '任务 2 · 收尾'])
    expect(cardNames(after)).toEqual(['任务 1 · 收尾', '任务 2 · 搭建'])
    // The only words that changed are the plan's own task names: no sentence arrived to
    // explain the swap, and none left a "before → after" trace behind. Each changed name
    // appears exactly **twice**, because the one-page redesign draws a task's title on two
    // faces — one line in the step list, one line in 「经过」 (`ProgressPlan` and
    // `ProgressLog`). The count is the guard: a third copy, a duplicate line, or any
    // sentence about the re-plan still fails here, and so does a face that silently stops
    // printing the title.
    expect(addedText(visible(after), visible(before)).sort())
      .toEqual(['任务 1 · 收尾', '任务 1 · 收尾', '任务 2 · 搭建', '任务 2 · 搭建'].sort())
    expect(addedText(visible(before), visible(after)).sort())
      .toEqual(['任务 1 · 搭建', '任务 1 · 搭建', '任务 2 · 收尾', '任务 2 · 收尾'].sort())
    expect([...visible(after), ...spoken(after)].filter((text) => forms(text).length > 0)).toEqual([])
  })

  it('deletes it instead of hiding it: no drawn string sits behind a hidden rule', () => {
    // The rule is a deletion, not a veil. Copy that CSS hides, an `opacity: 0` corner, or a
    // paragraph pulled out of the accessibility tree is still shipped and comes back on the
    // next restyle, so the page may not carry text it does not show.
    const tree = runPage([member(1, '任务 1 · 搭建', 'completed'), member(2, '任务 2 · 收尾', '')])
    const hidden = walk(tree).filter((element) => {
      const style = element.props['style'] as Record<string, unknown> | undefined
      if (style === undefined || style === null) return false
      const veiled = style['display'] === 'none' || style['visibility'] === 'hidden' || style['opacity'] === 0 || style['opacity'] === '0'
      return veiled && words(element).length > 0
    })
    expect(hidden).toEqual([])
    // The same rule for a reader: a label taken out of the accessibility tree hides the
    // copy from one audience while shipping it to the other. A state glyph (`✓`, `!`) is
    // not copy — it repeats a state the page already speaks — so words are what count.
    const muzzled = walk(tree)
      .filter((element) => element.props['aria-hidden'] === 'true' && words(element).length > 0)
    expect(muzzled).toEqual([])
  })

  it('keeps the empty page and a not-yet-reached slot free of it', () => {
    // No run at all, and a run whose rows have not started: both render placeholders, which
    // is where a note about "what may change later" would otherwise be tempting to add.
    const trees = [
      page([], undefined),
      runPage([{ seq: 1, label: '执行', phase: '任务 1 · 搭建', childId: 'c1', order: 0 }]),
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
      .filter((key) => key.startsWith('progress.') && !key.startsWith('progress.field.'))
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
})
