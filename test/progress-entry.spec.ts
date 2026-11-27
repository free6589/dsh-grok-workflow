import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Wave3 P1②: the 390 px entry stays one click away.
 *
 * The host folds the tab strip by width (`dsh-client-ui-conversation`,
 * `skeleton/ConversationSession.tsx`): `visibleViewLimit = max(1,
 * floor((rowWidth - 48) / 120))`, the preferred order is chat first then every
 * other entry in slot (`order`) sequence, and only the first `limit` entries
 * stay on the strip — the rest fold into the "更多会话视图" menu (two clicks).
 * At 390 the budget is 2, so whoever ranks third is hidden.
 *
 * The only thing this package controls is its own rank. The stock chat is
 * order 0 and the trajectory view order 10, so second place — strictly
 * between the two — is the smallest change that keeps the entry on the 390
 * strip without touching the default tab (chat) or the trajectory order.
 *
 * These cases pin reachability only: the entry exists, ranks second, and the
 * host budget keeps it visible at 390. They never name the overflow menu or
 * its path, so that path may change without breaking this contract.
 */

const SOURCE = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')

/** The progress bundle, loaded the way the host loads it, with a stub React. */
function loadProgress(): Record<string, any> {
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
    useMemo: (factory: () => unknown) => factory(),
    useRef: (value: unknown) => ({ current: value }),
    useSyncExternalStore: () => undefined,
  }
  const bundle = registration!.factory(() => react) as Record<string, any>
  const progress = bundle['GROK_WORKFLOW_PROGRESS']
  expect(progress, 'the bundle must export GROK_WORKFLOW_PROGRESS').toBeDefined()
  return progress
}

const progress = loadProgress()

/**
 * The host's width budget, quoted from `ConversationSession.tsx`:
 * `setVisibleViewLimit(Math.max(1, Math.floor((row.clientWidth - 48) / 120)))`,
 * preferred = chat first, then the rest in slot order, visible = first `limit`.
 * @param rowWidth - the tab row's own width, in CSS px.
 * @param entries - the strip's entries with this package's own rank included.
 * @returns the ids that stay on the strip (one click); the rest fold away.
 */
function visibleIdsAt(rowWidth: number, entries: Array<{ id: string, order: number }>): string[] {
  const limit = Math.max(1, Math.floor((rowWidth - 48) / 120))
  const ordered = [...entries].sort((left, right) => left.order - right.order)
  const chat = ordered.find((entry) => entry.id === 'chat')
  expect(chat, 'the stock chat tab anchors the strip').toBeDefined()
  const preferred = [chat!, ...ordered.filter((entry) => entry.id !== 'chat')]
  return preferred.slice(0, limit).map((entry) => entry.id)
}

/** The stock strip this package joins: chat 0, trajectory 10 (host-owned). */
const STOCK = [
  { id: 'chat', order: 0 },
  { id: 'trajectory', order: 10 },
]

describe('progress tab: the 390 entry stays one click away', () => {
  it('ranks the progress entry second, between chat and trajectory', () => {
    expect(progress.viewId).toBe('grok-progress')
    // Second place is the whole fix: the 390 strip keeps two entries, so the
    // third rank is the one that folds. Neither neighbour moves.
    expect(progress.viewOrder).toBeGreaterThan(0)
    expect(progress.viewOrder).toBeLessThan(10)
  })

  it('keeps the entry on the strip at 390: the host budget holds the first two', () => {
    const entries = [...STOCK, { id: progress.viewId as string, order: progress.viewOrder as number }]
    expect(visibleIdsAt(390, entries)).toContain('grok-progress')
    // The model reproduces the reported defect: at the old rank the entry folds.
    expect(visibleIdsAt(390, [...STOCK, { id: 'grok-progress', order: 20 }])).not.toContain('grok-progress')
  })

  it('still registers a plain list entry: no priority, no self-selection', () => {
    const slots: Array<{ options: Record<string, unknown>, disposed: boolean }> = []
    const ctx = {
      slots: {
        inject: (_name: string, fn: () => unknown) => fn(),
        register: (options: Record<string, unknown>) => {
          slots.push({ options, disposed: false })
          return () => {}
        },
      },
    }
    const fakeConversation = {
      events: { register: () => () => {} },
      views: { register: () => () => {} },
      binding: () => ({ target: () => ({ getSnapshot: () => undefined, subscribe: () => () => {} }) }),
    }
    const dispose = progress.mount(
      ctx,
      { uiConversation: fakeConversation, sessions: { binding: (id: string) => ({ sessionId: id }) } },
      { locale: undefined, t: (key: string) => key },
      { set: () => {} },
      () => undefined,
    )
    expect(dispose, 'the tab must mount').toBeTypeOf('function')
    expect(slots).toHaveLength(1)
    const entry = slots[0]!.options
    expect(entry['name']).toBe('conversation.view')
    expect(entry['id']).toBe('grok-progress')
    expect(entry['order']).toBe(progress.viewOrder)
    // A list slot orders by `order`; `priority` would claim a shadow that
    // does not exist, and any selection key would steal the default from chat.
    expect('priority' in entry).toBe(false)
    for (const key of ['selected', 'default', 'view', 'active']) {
      expect(key in entry, key).toBe(false)
    }
  })
})
