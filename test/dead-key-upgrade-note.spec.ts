import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Wave1 task 5 (dead-key): retire the dead `progress.flow.visit` key, mark the
 * unnumbered branch with its owning card, and record the no-downgrade note.
 *
 * RED first: every assertion below describes the world AFTER the fix. On the
 * unmodified tree each of them fails for a concrete reason (dead key still in
 * both dicts, unnumbered branch carries no owner marker, no upgrade note yet).
 * Deterministic, no network: reads only the checked-in bundle, fixtures and CHANGELOG.
 */
const SOURCE = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')
const CHANGELOG = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8')

type Dict = Record<string, string>
type Element = { type: unknown, props: Record<string, unknown>, children: unknown[] }
type Translator = (key: string, params?: Record<string, unknown>) => string

/** The plugin dictionary pair the bundle ships, loaded the way the host loads it. */
function loadDicts(): { zh: Dict, en: Dict } {
  let registration: { id: string, factory: (require: (id: string) => unknown) => Record<string, any> } | undefined
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
    createElement: () => null,
    useState: (value: unknown) => [value, () => {}],
    useEffect: () => {},
    useRef: (value: unknown) => ({ current: value }),
    useSyncExternalStore: () => undefined,
  }
  const bundle = registration!.factory(() => react) as Record<string, any>
  return bundle['GROK_WORKFLOW_DICT'] as { zh: Dict, en: Dict }
}

interface Bundle {
  GROK_WORKFLOW_DICT: Record<string, Dict>
  GROK_WORKFLOW_INTERNALS: { translator: (locale: string) => Translator }
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

/** Every element carrying one data hook, in document order. */
function hooksOf(tree: unknown, name: string): Element[] {
  return walk(tree).filter((element) => Object.prototype.hasOwnProperty.call(element.props, name))
}

/** One attribute as the DOM would spell it. */
function attr(element: Element, name: string): string | undefined {
  const value = element.props[name]
  if (value === undefined || value === null) return undefined
  return String(value)
}

describe('wave1-05 dead key retirement and upgrade note', () => {
  it('drops progress.flow.visit from both dictionaries and keeps the source free of it', () => {
    // The visit badge retired with the old edition: no code reads this key anymore
    // (grep the bundle: only the two dict lines name it), so both tables lose it.
    // Why this matters: a key nobody reads is a slot reserved for a sentence the
    // page no longer says, and the next reader has to guess whether it is live.
    const dict = loadDicts()
    expect('progress.flow.visit' in dict.zh, 'zh still carries the dead key').toBe(false)
    expect('progress.flow.visit' in dict.en, 'en still carries the dead key').toBe(false)
    expect(SOURCE).not.toContain('progress.flow.visit')
  })

  it('marks every unnumbered branch with the owning u1 card', () => {
    // A run with work but no plan number shares one card (`u1`); its branches hang
    // under that card, so a branch with no number must still carry `data-task="u1"`.
    // Why: without the owner id the DOM names the call but not the card it belongs
    // to, and a reader of the markup cannot tell whose call it is.
    let registration: { id: string, factory: (require: (id: string) => unknown) => any } | undefined
    const record = globalThis as unknown as { window?: { __ModuleLoader__?: { load(spec: never): void } } | undefined }
    const previous = record.window
    record.window = { __ModuleLoader__: { load: (spec) => { registration = spec } } }
    try {
      new Function(SOURCE)()
    } finally {
      record.window = previous
    }
    const react = {
      createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): unknown => {
        const element: Element = { type, props: props ?? {}, children: children.flat(Infinity) as unknown[] }
        return typeof type === 'function' ? (type as (value: Record<string, unknown>) => unknown)(element.props) : element
      },
      useState: (initial: unknown) => [initial, () => {}],
      useEffect: () => {},
      useMemo: (factory: () => unknown) => factory(),
      useRef: (initial: unknown) => ({ current: initial === undefined ? null : initial }),
      useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
    }
    const bundle = registration!.factory((id: string) => {
      if (id === 'react') return react
      throw new Error(`the bundle must not require ${id} at load time`)
    }) as Bundle & { GROK_WORKFLOW_PROGRESS: { component: (props: Record<string, unknown>) => unknown, derivePanelGraph: (run: never, t?: Translator) => { nodes: Array<{ id: string, kind: string, subtask?: { taskId: string, seq: number } }> } } }
    const zh = bundle.GROK_WORKFLOW_INTERNALS.translator('zh')
    const progress = bundle.GROK_WORKFLOW_PROGRESS
    const base = new Date(2026, 10, 25, 8, 2).getTime()
    const member = (seq: number, label: string, phase: string, outcome?: string) => ({
      seq, label, phase, childId: `child-${seq}`, order: seq - 1,
      startedAt: base + seq * 60_000, endedAt: base + seq * 60_000 + 20_000,
      ...outcome === undefined ? {} : { outcome },
    })
    const run = {
      runId: 'r-loose', name: '任务团队 · 没有任务号', anchorSeq: 1,
      members: [
        member(1, '规划助手', '规划', 'completed'),
        member(2, '执行', '执行', 'completed'),
        member(3, '执行', '执行'),
      ],
      details: [],
    }
    const graph = progress.derivePanelGraph(run as never, zh)
    const subs = graph.nodes.filter((node) => node.kind === 'sub')
    expect(subs.length).toBeGreaterThan(0)
    // The model names the owner card even when there is no plan number.
    for (const sub of subs) expect(sub.subtask?.taskId).toBe('u1')
    const page = progress.component({
      t: zh,
      progressT: zh,
      useGrokProgress: (select: (value: unknown) => unknown) => select({ runs: [run], activeRun: run }),
    })
    const branches = hooksOf(page, 'data-gw-progress-pnode').filter((node) => node.props['data-kind'] === 'sub')
    expect(branches.length).toBeGreaterThan(0)
    // The DOM carries the same owner the model reports: `u1_s2` says whose it is.
    for (const branch of branches) {
      expect(attr(branch, 'data-gw-progress-pnode')?.startsWith('u1_s')).toBe(true)
      expect(attr(branch, 'data-task'), 'unnumbered branch drops its owner card').toBe('u1')
    }
  })

  it('records the no-downgrade upgrade note', () => {
    // An old build reading a new record skips the row it does not know instead of
    // failing the whole read: the [Unreleased] note says so in both languages, so
    // nobody expects a downgrade to keep working.
    const unreleased = CHANGELOG.slice(CHANGELOG.indexOf('## [Unreleased]'), CHANGELOG.indexOf('## [0.13.54]'))
    expect(unreleased).toContain('旧读新跳过')
    expect(unreleased).toContain('progress.flow.visit')
  })
})
