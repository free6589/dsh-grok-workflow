import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Settings-page upgrade entry: the page shows the installed plugin version next to
 * the newest known release, and the upgrade reuses the existing install channel
 * (`dsh plugin add`) instead of a second installer.
 *
 * The first block asserts the additive surface that predates the button: no
 * FIELDS/GROUPS/ROLES shape, no dictionary key set outside the `update.*` keys, and no
 * save-path behavior is pinned here — those stay owned by `test/client.spec.ts` and
 * `test/i18n-parity.spec.ts`.
 *
 * The second block drives the card the way a reader does: real hook cells, a click, a
 * re-render. The install verb rides the Host route `GET/POST /grok-workflow/update`
 * (`src/update-surface.ts`), because a browser click cannot run `dsh plugin`; the
 * transport here is an injected fake, so nothing in this file touches a socket.
 */

const SOURCE = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')

/** The package version this worktree ships. */
const PKG = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }

/** The route the card talks to; the Host lane owns the other end of it. */
const UPDATE_ROUTE = '/grok-workflow/update'

function loadBundle(): Record<string, any> {
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
    createElement: (...args: unknown[]) => ({ args }),
    useState: (value: unknown) => [value, () => {}],
    useEffect: () => {},
    useMemo: (factory: () => unknown) => factory(),
    useRef: (value: unknown) => ({ current: value }),
    useSyncExternalStore: () => undefined,
  }
  return registration!.factory(() => react)
}

const bundle = loadBundle()

const isVersion = (value: unknown): value is string =>
  typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value)

/** The seven keys the read-only card shipped with, verbatim. */
const BASELINE_KEYS = [
  'update.title', 'update.body', 'update.copy', 'update.current',
  'update.state.latest', 'update.state.newer', 'update.terminal',
]

/** The six keys the button adds, in both languages. */
const BUTTON_KEYS = [
  'update.check', 'update.install', 'update.installing',
  'update.refresh', 'update.unavailable', 'update.failed',
]

describe('settings-page upgrade entry', () => {
  it('exposes the installed and latest versions plus the plugin-add command', () => {
    const update = bundle['GROK_WORKFLOW_UPDATE'] as { version: unknown, latest: unknown, command: unknown }
    expect(isVersion(update.version), String(update.version)).toBe(true)
    expect(isVersion(update.latest), String(update.latest)).toBe(true)
    expect(update.version).toBe(PKG.version)
    expect(typeof update.command).toBe('string')
    // The only supported channel: the README's `plugin add` line, never a
    // second installer.
    expect(update.command as string).toContain('dsh plugin')
    expect(update.command as string).toContain('add github:free6589/dsh-grok-workflow#v')
  })

  it('states whether an upgrade is needed instead of leaving two numbers to compare', () => {
    const update = bundle['GROK_WORKFLOW_UPDATE'] as { version: string, latest: string, state: unknown }
    const upToDate = update.version === update.latest
    expect(update.state).toBe(upToDate ? 'latest' : 'newer')
  })

  it('carries the seven upgrade keys in both languages, with different prose', () => {
    for (const key of BASELINE_KEYS) {
      const zh = bundle['GROK_WORKFLOW_DICT']['zh'][key] as unknown
      const en = bundle['GROK_WORKFLOW_DICT']['en'][key] as unknown
      expect(typeof zh, `zh ${key}`).toBe('string')
      expect(typeof en, `en ${key}`).toBe('string')
      expect((zh as string).length, `zh ${key}`).toBeGreaterThan(0)
      expect((en as string).length, `en ${key}`).toBeGreaterThan(0)
      expect(zh, key).not.toBe(en)
    }
    expect(bundle['GROK_WORKFLOW_DICT']['en']['update.body']).toContain('{current}')
    expect(bundle['GROK_WORKFLOW_DICT']['en']['update.body']).toContain('{target}')
    expect(bundle['GROK_WORKFLOW_DICT']['zh']['update.body']).toContain('{current}')
    expect(bundle['GROK_WORKFLOW_DICT']['zh']['update.body']).toContain('{target}')
  })

  it('renders the upgrade card outside the save form (read-only, additive)', () => {
    const { UpdateCard } = bundle['GROK_WORKFLOW_INTERNALS'] as { UpdateCard: (props: unknown) => unknown }
    expect(typeof UpdateCard).toBe('function')
    const zhT = bundle['GROK_WORKFLOW_INTERNALS'].translator('zh') as (key: string, params?: Record<string, unknown>) => string
    const rendered = JSON.stringify((UpdateCard as (props: unknown) => unknown)({ t: zhT }))
    expect(rendered).toContain('data-gw-update')
    expect(rendered).toContain('data-gw-update-command')
    // The verdict and the "this page cannot install for you" note are part of the
    // card (manual item Sec.2-4), not a separate save-path surface.
    expect(rendered).toContain('data-gw-update-state')
    expect(rendered).toContain('data-gw-update-terminal')
    expect(rendered).toContain('data-action')
    expect(rendered).toContain('update-copy')
    // No form field: the card never joins draft/ops/save.
    expect(rendered).not.toContain('data-field')
  })

  it('the card copy never renders a dictionary key id', () => {
    const internals = bundle['GROK_WORKFLOW_INTERNALS'] as {
      translator(locale: string): (key: string, params?: Record<string, unknown>) => string
      UpdateCard(props: unknown): unknown
    }
    for (const locale of ['zh', 'en']) {
      const t = internals.translator(locale)
      const rendered = JSON.stringify(internals.UpdateCard({ t }))
      for (const key of BASELINE_KEYS) {
        expect(rendered, `${locale} ${key}`).not.toContain(key)
      }
    }
  })
})

/* ------------------------------------------------------------ the harness ---- */

type Element = { type: unknown, props: Record<string, unknown>, children: unknown[] }

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

/**
 * The hook cells of the render in progress.
 *
 * A phase is only real if a click repaints, so the stub below keeps the same ordered
 * cells React keeps and replays them on every render. Modelled on `test/client.spec.ts`
 * `mountSwitch`, minus the mount effect: this card deliberately does nothing on mount.
 */
type Frame = { cells: unknown[], index: number }

let frame: Frame | undefined

const clickReact = {
  createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): unknown => {
    const element: Element = { type, props: props ?? {}, children: children.flat(Infinity) as unknown[] }
    return typeof type === 'function' ? (type as (props: Record<string, unknown>) => unknown)(element.props) : element
  },
  useState: (initial: unknown): unknown[] => {
    const live = frame
    const seed = (): unknown => (typeof initial === 'function' ? (initial as () => unknown)() : initial)
    if (live === undefined) return [seed(), () => {}]
    const at = live.index++
    if (at >= live.cells.length) live.cells[at] = seed()
    return [live.cells[at], (next: unknown) => {
      live.cells[at] = typeof next === 'function' ? (next as (value: unknown) => unknown)(live.cells[at]) : next
    }]
  },
  useEffect: () => {},
  useRef: (initial: unknown) => ({ current: initial === undefined ? null : initial }),
  useMemo: (factory: () => unknown) => factory(),
  useSyncExternalStore: () => undefined,
}

/** The bundle again, loaded with {@link clickReact}. */
const clickable = ((): Record<string, any> => {
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
  return registration!.factory((id) => {
    if (id === 'react') return clickReact
    throw new Error(`the bundle must not require ${id} at load time`)
  })
})()

const internals = clickable['GROK_WORKFLOW_INTERNALS'] as Record<string, any>
const dicts = clickable['GROK_WORKFLOW_DICT'] as { zh: Record<string, string>, en: Record<string, string> }
const en = internals.translator('en') as (key: string, params?: Record<string, unknown>) => string
const zh = internals.translator('zh') as (key: string, params?: Record<string, unknown>) => string

/** Render the card with real cells, so a click is a real second render. */
function mountCard(props: Record<string, unknown>) {
  const local: Frame = { cells: [], index: 0 }
  const run = (): unknown => {
    const before = frame
    frame = local
    local.index = 0
    try {
      return (internals.UpdateCard as (props: Record<string, unknown>) => unknown)(props)
    } finally {
      frame = before
    }
  }
  // Resolved promises plus the handler's own chain: a macrotask flush is enough and,
  // unlike a fixed number of microtasks, does not depend on how many `then`s were added.
  const settle = async (): Promise<void> => {
    for (let turn = 0; turn < 4; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0))
  }
  const click = async (action: string): Promise<unknown> => {
    const button = walk(run()).find((element) => element.props['data-action'] === action)
    expect(button, `the card renders a ${action} button`).toBeDefined()
    await (button!.props['onClick'] as (() => unknown) | undefined)?.()
    await settle()
    return run()
  }
  return { run, click, settle }
}

/** One element of the tree that carries `key`, or a loud failure. */
function elementWith(tree: unknown, key: string): Element {
  const element = walk(tree).find((candidate) => candidate.props[key] !== undefined)
  expect(element, `an element carrying ${key}`).toBeDefined()
  return element!
}

/** The value of one attribute the card is pinned on. */
function attr(tree: unknown, key: string): unknown {
  return elementWith(tree, key).props[key]
}

/** The text of the `data-gw-update-command` node: the line the reader can paste. */
function commandLine(tree: unknown): string {
  return elementWith(tree, 'data-gw-update-command').children
    .filter((child) => typeof child === 'string')
    .join('')
}

/** Every `data-action` the tree renders, in document order. */
function actions(tree: unknown): unknown[] {
  return walk(tree)
    .filter((element) => element.props['data-action'] !== undefined)
    .map((element) => element.props['data-action'])
}

/** The element a `data-action` names, or undefined (for the "must not exist" cases). */
function actionElement(tree: unknown, action: string): Element | undefined {
  return walk(tree).find((element) => element.props['data-action'] === action)
}

type Call = { url: string, method: string, body: Record<string, unknown> | undefined }
type Answer = { status?: number, body?: unknown, throws?: boolean, holds?: boolean }

/**
 * A fetch stand-in: records every call and answers from a script, one answer per call.
 *
 * `holds` keeps the answer pending until `release()`, which is the window a test needs to
 * see the in-flight phase; `throws` is a socket that closed. No answer left means the
 * card made a call the test did not expect, which fails loudly instead of hanging.
 */
function queueFetch(script: Answer[]) {
  const calls: Call[] = []
  const held: Array<() => void> = []
  const fetchImpl = async (url: string, init: Record<string, unknown>): Promise<{ status: number, json: () => Promise<unknown> }> => {
    const body = typeof init['body'] === 'string' ? JSON.parse(init['body']) as Record<string, unknown> : undefined
    calls.push({ url, method: String(init['method'] ?? 'GET'), body })
    const answer = script.shift()
    if (answer === undefined) throw new Error(`the card made an unscripted call: ${String(init['method'])} ${url}`)
    if (answer.holds === true) await new Promise<void>((resolve) => { held.push(resolve) })
    if (answer.throws === true) throw new Error('socket closed')
    return { status: answer.status ?? 200, json: async () => answer.body }
  }
  return {
    calls,
    release: () => { for (const open of held.splice(0)) open() },
    fetchImpl,
  }
}

/** A status answer: a newer release this Host says it can install. */
const NEWER = {
  ok: true,
  action: 'status',
  update: {
    current: '0.13.31', latest: '0.13.32', latestSource: 'remote', canInstall: true,
    command: 'dsh plugin --profile web add github:free6589/dsh-grok-workflow#v0.13.32',
  },
}

/**
 * The command line the Host names for the release it just reported, verbatim.
 *
 * Same shape as the static `UPDATE_COMMAND`, different version: it is what the card must
 * print, interpolate and copy once this answer has landed.
 */
const NEWEST_COMMAND = 'dsh plugin --profile web add github:free6589/dsh-grok-workflow#v0.13.32'

/** A status answer from a Host with no plugin manager: nothing can be installed here. */
const UNAVAILABLE = {
  ok: true,
  action: 'status',
  update: {
    current: '0.13.31', latest: '0.13.32', latestSource: 'remote', canInstall: false,
    reason: 'update/unavailable', command: 'dsh plugin add github:free6589/dsh-grok-workflow#v0.13.32',
  },
}

/** The install answer, read back at the version that was asked for. */
const INSTALLED = {
  ok: true,
  action: 'install',
  installed: { from: '0.13.31', to: '0.13.32', spec: 'github:free6589/dsh-grok-workflow#v0.13.32', saveExact: true },
}

/** Run `body` with a clipboard the test can read, then put `navigator` back. */
async function withClipboard(body: (copied: string[]) => Promise<void>): Promise<void> {
  const copied: string[] = []
  const record = globalThis as unknown as Record<string, unknown>
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: { writeText: async (text: string) => { copied.push(text) } } },
    configurable: true,
    writable: true,
  })
  try {
    await body(copied)
  } finally {
    if (descriptor === undefined) Reflect.deleteProperty(globalThis, 'navigator')
    else Object.defineProperty(globalThis, 'navigator', descriptor)
    void record
  }
}

/* ------------------------------------------------------------ the button ---- */

describe('settings-page upgrade card: the button and its four phases', () => {
  it('rests in the check phase and asks nobody: a mount is zero fetch calls', async () => {
    const net = queueFetch([])
    const card = mountCard({ t: en, updateFetch: net.fetchImpl })
    const tree = card.run()
    await card.settle()
    expect(net.calls).toHaveLength(0)
    expect(attr(tree, 'data-gw-update-phase')).toBe('check')
    expect(actions(tree)).toContain('update-check')
    expect(actions(tree)).toContain('update-copy')
    // The honest baseline is on screen before anything is asked: both numbers and the
    // command a reader can paste anywhere.
    const rendered = JSON.stringify(tree)
    expect(rendered).toContain(internals.PLUGIN_VERSION as string)
    expect(rendered).toContain(internals.UPDATE_LATEST as string)
    expect(rendered).toContain(internals.UPDATE_COMMAND as string)
    expect(rendered).toContain(String(dicts.en['update.check']))
  })

  it('reads the status on click and turns the same button into an install offer', async () => {
    const net = queueFetch([{ body: NEWER }])
    const card = mountCard({ t: en, updateFetch: net.fetchImpl })
    const tree = await card.click('update-check')
    expect(net.calls).toHaveLength(1)
    expect(net.calls[0]!.url).toBe(`${UPDATE_ROUTE}?action=status`)
    expect(net.calls[0]!.method).toBe('GET')
    // Still `check`: the button changed meaning, the phase did not jump ahead.
    expect(attr(tree, 'data-gw-update-phase')).toBe('check')
    const install = actionElement(tree, 'update-install')
    expect(install, 'the primary button now installs').toBeDefined()
    expect(JSON.stringify(install)).toContain('0.13.32')
    expect(attr(tree, 'data-gw-update-state')).toBe('newer')
    expect(JSON.stringify(tree)).toContain('0.13.32')
    // A read is a read: no install was posted to find this out.
    expect(net.calls.every((call) => call.method === 'GET')).toBe(true)
  })

  it('prints, interpolates and copies the command the Host named, not the stale bundled one', async () => {
    const net = queueFetch([{ body: NEWER }])
    const card = mountCard({ t: en, updateFetch: net.fetchImpl })
    const tree = await card.click('update-check')
    // 1. The command line itself.
    expect(commandLine(tree)).toBe(NEWEST_COMMAND)
    // 2. The body sentence: it names the release the command installs. `{current}` is
    //    legitimately the installed 0.13.31, so the old version is ruled out by tag, not
    //    by the bare number.
    const sentences = walk(tree)
      .map((element) => element.children.filter((child) => typeof child === 'string').join(''))
      .filter((text) => text.includes('latest release'))
    expect(sentences).toHaveLength(1)
    expect(sentences[0]).toContain('latest release 0.13.32')
    expect(sentences[0]).toContain('#v0.13.32')
    expect(sentences[0]).not.toContain('#v0.13.31')
    // 3. The clipboard.
    await withClipboard(async (copied) => {
      await card.click('update-copy')
      expect(copied).toEqual([NEWEST_COMMAND])
    })
  })

  it('keeps the static command byte for byte when no Host answer ever lands', async () => {
    const net = queueFetch([{ throws: true }])
    const card = mountCard({ t: en, updateFetch: net.fetchImpl })
    // First paint: nobody has been asked.
    expect(commandLine(card.run())).toBe(internals.UPDATE_COMMAND)
    // A dead socket: still the baseline, and still what a copy puts on the clipboard.
    const failed = await card.click('update-check')
    expect(commandLine(failed)).toBe(internals.UPDATE_COMMAND)
    await withClipboard(async (copied) => {
      await card.click('update-copy')
      expect(copied).toEqual([internals.UPDATE_COMMAND])
    })
  })

  it('treats a status answer without a usable command as no command at all', async () => {
    const net = queueFetch([{
      body: {
        ok: true,
        action: 'status',
        update: { current: '0.13.31', latest: '0.13.32', latestSource: 'remote', canInstall: true, command: '' },
      },
    }])
    const card = mountCard({ t: en, updateFetch: net.fetchImpl })
    const tree = await card.click('update-check')
    // An empty string must not blank the line out: the baseline is the fallback.
    expect(commandLine(tree)).toBe(internals.UPDATE_COMMAND)
  })

  it('installs with one POST, shows the in-flight phase, then lands on latest', async () => {
    const net = queueFetch([{ body: NEWER }, { holds: true, body: INSTALLED }])
    const card = mountCard({ t: en, updateFetch: net.fetchImpl })
    await card.click('update-check')
    const pending = await card.click('update-install')
    expect(attr(pending, 'data-gw-update-phase')).toBe('installing')
    const busy = elementWith(pending, 'data-gw-update-busy')
    expect(busy.props['disabled']).toBe(true)
    expect(JSON.stringify(busy)).toContain(dicts.en['update.installing']!)
    // The command line never goes away: it is the fallback when the click cannot finish.
    // It now carries the Host's own line for the release on screen, not the frozen one.
    expect(JSON.stringify(pending)).toContain(NEWEST_COMMAND)
    const posts = net.calls.filter((call) => call.method === 'POST')
    expect(posts).toHaveLength(1)
    expect(posts[0]!.url).toBe(UPDATE_ROUTE)
    expect(posts[0]!.body).toEqual({ action: 'install', tag: 'v0.13.32' })

    net.release()
    await card.settle()
    const done = card.run()
    expect(attr(done, 'data-gw-update-phase')).toBe('latest')
    // The version on the card is the read-back one, not the one that was asked for.
    expect(attr(done, 'data-gw-update-current')).toBe('0.13.32')
    // …and the verdict follows the read-back too: "newer" next to a finished install would
    // be the card contradicting itself.
    expect(attr(done, 'data-gw-update-state')).toBe('latest')
    expect(elementWith(done, 'data-gw-update-refresh')).toBeDefined()
    expect(JSON.stringify(done)).toContain(dicts.en['update.refresh']!)
    // Exactly two calls for the whole cycle: one GET and one POST. Nothing reloaded.
    expect(net.calls).toHaveLength(2)
    expect(actions(done)).not.toContain('update-install')
  })

  it('states a refused install with its code and keeps the copy path working', async () => {
    const net = queueFetch([
      { body: NEWER },
      { status: 500, body: { ok: false, code: 'update/readback', error: 'the plugin row still reads 0.13.31', rolledBack: true, restored: '0.13.31' } },
    ])
    const card = mountCard({ t: en, updateFetch: net.fetchImpl })
    await card.click('update-check')
    const failed = await card.click('update-install')
    expect(attr(failed, 'data-gw-update-phase')).toBe('failed')
    expect(attr(failed, 'data-gw-update-error-code')).toBe('update/readback')
    expect(String(attr(failed, 'data-gw-update-error'))).toContain('the plugin row still reads 0.13.31')
    expect(JSON.stringify(elementWith(failed, 'data-gw-update-error'))).toContain(dicts.en['update.failed']!.replace('{message}', ''))
    // Retry goes back to a fresh read, and the copyable command is still there.
    expect(actions(failed)).toContain('update-check')
    expect(actions(failed)).toContain('update-copy')
    await withClipboard(async (copied) => {
      await card.click('update-copy')
      // The Host already named this release, so the button copies *that* line, never the
      // static baseline the build was frozen on.
      expect(copied).toEqual([NEWEST_COMMAND])
    })
    // A rollback that names the version it restored puts that version back on screen.
    expect(JSON.stringify(failed)).toContain('0.13.31')
  })

  it('offers no install where the Host has no plugin manager, and says why', async () => {
    const net = queueFetch([{ body: UNAVAILABLE }])
    const card = mountCard({ t: en, updateFetch: net.fetchImpl })
    const tree = await card.click('update-check')
    expect(attr(tree, 'data-gw-update-phase')).toBe('check')
    expect(actions(tree)).not.toContain('update-install')
    expect(attr(tree, 'data-gw-update-can-install')).toBe('no')
    expect(actions(tree)).toContain('update-copy')
    const note = elementWith(tree, 'data-gw-update-unavailable')
    expect(note.props['data-gw-update-reason']).toBe('update/unavailable')
    expect(JSON.stringify(note)).toContain(dicts.en['update.unavailable']!)
    // The newer release is still true, so the verdict does not pretend otherwise.
    expect(attr(tree, 'data-gw-update-state')).toBe('newer')
  })

  it('survives a Host that answers nothing and keeps the read-only fallback', async () => {
    const net = queueFetch([{ throws: true }])
    const card = mountCard({ t: en, updateFetch: net.fetchImpl })
    expect(() => card.run()).not.toThrow()
    const failed = await card.click('update-check')
    expect(attr(failed, 'data-gw-update-phase')).toBe('failed')
    expect(attr(failed, 'data-gw-update-error-code')).toBe('update/transport')
    expect(actions(failed)).toContain('update-check')
    expect(actions(failed)).toContain('update-copy')
    const rendered = JSON.stringify(failed)
    expect(rendered).toContain(internals.PLUGIN_VERSION as string)
    expect(rendered).toContain(internals.UPDATE_LATEST as string)
    expect(rendered).toContain(internals.UPDATE_COMMAND as string)
  })

  it('never posts twice for one install, even when the button is pressed again', async () => {
    const net = queueFetch([{ body: NEWER }, { holds: true, body: INSTALLED }])
    const card = mountCard({ t: en, updateFetch: net.fetchImpl })
    await card.click('update-check')
    const pending = await card.click('update-install')
    const busy = actionElement(pending, 'update-install')!
    // A disabled button in a carrier that still delivers the click must not install twice.
    const again = busy.props['onClick'] as (() => unknown) | undefined
    await again?.()
    await card.settle()
    expect(net.calls.filter((call) => call.method === 'POST')).toHaveLength(1)
    net.release()
    await card.settle()
    expect(net.calls.filter((call) => call.method === 'POST')).toHaveLength(1)
  })

  it('never reloads or navigates the page: the refresh is the reader\'s', async () => {
    // Source level: no such call exists in the bundle at all, in any phase.
    expect(SOURCE).not.toMatch(/\blocation\.(?:reload|href|assign|replace)\b/)
    // Behaviour level: a location that records any touch, over a whole install cycle.
    const touched: string[] = []
    const trap = new Proxy({}, {
      get: (_target, key) => { touched.push(String(key)); throw new Error(`the card read location.${String(key)}`) },
      set: (_target, key) => { touched.push(String(key)); throw new Error(`the card wrote location.${String(key)}`) },
    })
    const record = globalThis as unknown as { window?: unknown }
    const previous = record.window
    record.window = { location: trap }
    try {
      const net = queueFetch([{ body: NEWER }, { body: INSTALLED }])
      const card = mountCard({ t: en, updateFetch: net.fetchImpl })
      await card.click('update-check')
      const done = await card.click('update-install')
      expect(attr(done, 'data-gw-update-phase')).toBe('latest')
      expect(touched).toEqual([])
    } finally {
      record.window = previous
    }
  })

  it('carries the six button keys in both languages, with different prose', () => {
    for (const key of BUTTON_KEYS) {
      const zhText = dicts.zh[key]
      const enText = dicts.en[key]
      expect(typeof zhText, `zh ${key}`).toBe('string')
      expect(typeof enText, `en ${key}`).toBe('string')
      expect((zhText as string).length, `zh ${key}`).toBeGreaterThan(0)
      expect((enText as string).length, `en ${key}`).toBeGreaterThan(0)
      expect(zhText, key).not.toBe(enText)
    }
    for (const locale of ['zh', 'en']) {
      expect(dicts[locale as 'zh' | 'en']['update.install']).toContain('{target}')
      expect(dicts[locale as 'zh' | 'en']['update.failed']).toContain('{message}')
    }
  })

  it('never renders an upgrade key id, in any phase', async () => {
    const net = queueFetch([
      { body: NEWER },
      { status: 500, body: { ok: false, code: 'update/install', error: 'the install exited 1', rolledBack: false } },
    ])
    const card = mountCard({ t: zh, updateFetch: net.fetchImpl })
    const trees: unknown[] = [card.run()]
    trees.push(await card.click('update-check'))
    trees.push(await card.click('update-install'))
    for (const tree of trees) {
      const rendered = JSON.stringify(tree)
      for (const key of [...BASELINE_KEYS, ...BUTTON_KEYS]) {
        expect(rendered, `${String(attr(tree, 'data-gw-update-phase'))} ${key}`).not.toContain(key)
      }
    }
  })
})

describe('the update route, as the card calls it', () => {
  it('pins the path the Host lane mounts, and exports the two verbs', () => {
    expect(internals.UPDATE_ROUTE_PATH).toBe(UPDATE_ROUTE)
    expect(typeof internals.checkUpdate).toBe('function')
    expect(typeof internals.installUpdate).toBe('function')
  })

  it('turns every silent transport into a stated code, and never throws', async () => {
    const check = internals.checkUpdate as (fetchImpl?: unknown) => Promise<Record<string, unknown>>
    const install = internals.installUpdate as (tag: string, fetchImpl?: unknown) => Promise<Record<string, unknown>>

    // No fetch to reach the Host with.
    await expect(check(undefined)).resolves.toMatchObject({ ok: false, code: 'update/transport' })
    // A dead socket.
    await expect(check(async () => { throw new Error('socket closed') })).resolves.toMatchObject({ ok: false, code: 'update/transport' })
    // A body that is not JSON.
    await expect(check(async () => ({ status: 200, json: async () => { throw new Error('not json') } }))).resolves.toMatchObject({ ok: false, code: 'update/response' })
    // An `ok` body with no status block is a refusal to report, not a state.
    await expect(check(async () => ({ status: 200, json: async () => ({ ok: true }) }))).resolves.toMatchObject({ ok: false, code: 'update/response' })
    // A 403 is the composition's fence; a 405 is the method refused in front of the route.
    await expect(check(async () => ({ status: 403, json: async () => undefined }))).resolves.toMatchObject({ ok: false, code: 'update/user-only' })
    await expect(check(async () => ({ status: 405, json: async () => undefined }))).resolves.toMatchObject({ ok: false, code: 'update/method' })
    // The route's own code is reported as-is, never re-worded by the page.
    await expect(check(async () => ({ status: 500, json: async () => ({ ok: false, code: 'update/discover', error: 'the release feed is unreachable' }) })))
      .resolves.toMatchObject({ ok: false, code: 'update/discover', error: 'the release feed is unreachable' })

    // A normalised status keeps every field the card renders.
    await expect(check(async () => ({ status: 200, json: async () => NEWER })))
      .resolves.toMatchObject({ ok: true, update: { current: '0.13.31', latest: '0.13.32', canInstall: true } })
    // A rollback answer carries its flag and the version it restored.
    await expect(install('v0.13.32', async () => ({
      status: 500,
      json: async () => ({ ok: false, code: 'update/unknown-tag', error: 'no such tag', rolledBack: true, restored: '0.13.31' }),
    }))).resolves.toMatchObject({ ok: false, code: 'update/unknown-tag', rolledBack: true, restored: '0.13.31' })
    await expect(install('v0.13.32', undefined)).resolves.toMatchObject({ ok: false, code: 'update/transport' })
  })
})
