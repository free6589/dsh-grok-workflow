import type { Context } from '@deepseek-ai/cordis'
import type { ModelRoute, ResolvedConfig, RoleName } from './types.js'

/**
 * Settings surface and load-time route validation (阶段5, requirement D).
 *
 * Two facts decide what this module may do, both read from the installed
 * `@deepseek-ai/dsh@0.2.1-rc.2` packages (`dsh-settings`, `dsh-llm`):
 *
 * 1. **The settings page is generated, not written.** `ctx.settings`
 *    (`SettingsForms`, `dsh-settings/lib/types/index.d.ts`) projects every
 *    Loader entry's own `Config` schema into a form: `describe()` returns
 *    `{ ns: <profile entry id>, schema, value, base, user, revision,
 *    applies: 'live', autoGenerate }`, and `autoGenerate` is
 *    `presentations.get(fiber)?.auto ?? true`. A plugin therefore gets its
 *    settings page *from the schema it already exports* — this plugin exports
 *    `Config`, so the Web client can render and live-apply the very fields the
 *    run reads. There is nothing to hand-build, and a bespoke page that only
 *    displayed values would be exactly the fake the task forbids.
 * 2. **A model id can be checked only where the provider enumerates models.**
 *    `llm.listProviders()` returns `{id, name}` — routes, no models. Declared
 *    models live in the *provider's own* settings section (for `llm-pi-ai`:
 *    `providers.<id>.models[]`), reachable through
 *    `llm.listConfigurableProviders()` (`{provider, settingsNs, settingsPath}`)
 *    plus `settings.describe()`. When a provider enumerates nothing, the model
 *    id stays free-form (gateway routes) and this module says so instead of
 *    guessing.
 */

/** Minimal slice of `ctx.settings` this module uses. */
export interface SettingsFormsLike {
  configure?: (presentation: { auto?: boolean }) => unknown
  describe?: (options?: { redactSecrets?: boolean }) => SettingsDescriptorLike[]
}

/** One descriptor as `ctx.settings.describe()` returns it. */
export interface SettingsDescriptorLike {
  ns: string
  value?: unknown
  autoGenerate?: boolean
  revision?: number
}

/** One configurable-provider directory entry this module reads. */
export interface ConfigurableProviderLike {
  provider: string
  settingsNs: string
  settingsPath?: readonly string[]
}

/** Minimal slice of `ctx.llm` this module uses. */
export interface LlmRuntimeLike {
  listProviders?: () => { id: string; name?: string }[]
  listConfigurableProviders?: () => ConfigurableProviderLike[]
}

/** Outcome of the load-time check, reported by the caller. */
export interface RouteValidation {
  /** Problems that make the configuration unusable (the load must fail). */
  errors: string[]
  /** Things a user should know but that cannot be checked further. */
  notes: string[]
}

/**
 * Read one optional service without assuming the context exposes `get`.
 *
 * Real cordis contexts always do; test doubles and minimal embeddings may not,
 * and a missing lookup must mean "cannot validate", never a crash on load.
 * @param ctx - plugin context.
 * @param name - service name.
 * @returns The service, or undefined when this context cannot look services up.
 */
function serviceOf<T>(ctx: Context, name: string): T | undefined {
  try {
    const get = (ctx as unknown as { get?: unknown }).get
    if (typeof get !== 'function') return undefined
    return (get as (key: string) => unknown).call(ctx, name) as T | undefined
  } catch {
    return undefined
  }
}

/** Roles in report order, so messages are stable. */
const ROLE_ORDER: RoleName[] = ['planner', 'worker', 'verifier', 'synthesizer']

/**
 * Declare that this plugin wants the generated settings page.
 *
 * `auto` already defaults to true in `SettingsForms`, so this is intent, not
 * enablement: it makes the contract explicit, and it fails soft on a runtime
 * whose settings service has no `configure` (older build, or a headless app
 * with no client at all).
 * @param ctx - plugin context.
 * @returns How the runtime answered: `declared`, `absent` (no settings service —
 *   normal in a minimal app), or `unsupported` (service present, no policy hook).
 */
export function declareSettingsSurface(ctx: Context): 'declared' | 'absent' | 'unsupported' {
  try {
    const settings = serviceOf<SettingsFormsLike>(ctx, 'settings')
    if (settings === undefined) return 'absent'
    if (typeof settings.configure !== 'function') return 'unsupported'
    settings.configure({ auto: true })
    return 'declared'
  } catch {
    return 'unsupported'
  }
}

/**
 * Read the model ids one provider's configuration enumerates.
 * @param provider - provider route id from a configured chain.
 * @param llm - the runtime's model service.
 * @param settings - the runtime's settings service.
 * @returns Declared model ids, or undefined when the provider enumerates none.
 */
function declaredModels(provider: string, llm: LlmRuntimeLike, settings: SettingsFormsLike): string[] | undefined {
  const dir = llm.listConfigurableProviders?.() ?? []
  const entry = dir.find(item => item.provider === provider)
  if (entry === undefined || typeof settings.describe !== 'function') return undefined
  const descriptor = settings.describe({ redactSecrets: true }).find(item => item.ns === entry.settingsNs)
  if (descriptor === undefined) return undefined
  let node: unknown = descriptor.value
  for (const key of entry.settingsPath ?? []) {
    if (node === null || typeof node !== 'object') return undefined
    node = (node as Record<string, unknown>)[key]
  }
  if (node === null || typeof node !== 'object') return undefined
  const models = (node as Record<string, unknown>).models
  if (!Array.isArray(models)) return undefined
  const ids: string[] = []
  for (const model of models) {
    if (typeof model === 'string') ids.push(model)
    else if (model !== null && typeof model === 'object') {
      const id = (model as Record<string, unknown>).id
      if (typeof id === 'string' && id !== '') ids.push(id)
    }
  }
  return ids.length === 0 ? undefined : ids
}

/**
 * Validate every configured route against the live runtime.
 *
 * Only *definitive* answers fail the load: a provider the registry does not
 * have (the registry is non-empty, so it has settled), or a model a provider
 * itself enumerates. Everything else becomes a note, because inventing a
 * failure for a route the runtime cannot judge would block valid setups.
 * @param ctx - plugin context, used to read `llm` and `settings`.
 * @param config - resolved configuration with effective chains.
 * @returns Errors and notes for the caller to log or throw.
 */
export function validateRoutes(ctx: Context, config: ResolvedConfig): RouteValidation {
  const errors: string[] = []
  const notes: string[] = []
  const llm = serviceOf<LlmRuntimeLike>(ctx, 'llm')
  const settings = serviceOf<SettingsFormsLike>(ctx, 'settings')
  const configured: { role: RoleName; route: ModelRoute }[] = []
  for (const role of ROLE_ORDER) {
    for (const route of config.roles[role]) configured.push({ role, route })
  }
  if (configured.length === 0) return { errors, notes }
  if (llm === undefined || typeof llm.listProviders !== 'function') {
    notes.push('model routes were not validated: this runtime exposes no llm service')
    return { errors, notes }
  }
  const providers = llm.listProviders()
  if (providers.length === 0) {
    notes.push('model routes were not validated: the provider registry was empty at load')
    return { errors, notes }
  }
  const known = providers.map(item => item.id)
  for (const { role, route } of configured) {
    const provider = route.provider
    if (provider === undefined || provider === '') {
      notes.push(`roles.${role} route ${route.model} inherits the run's provider; only the model id is checked by the engine`)
      continue
    }
    if (!known.includes(provider)) {
      errors.push(`roles.${role} names provider "${provider}", which this runtime does not have; known providers: ${known.join(', ')}`)
      continue
    }
    if (settings === undefined || typeof settings.describe !== 'function') {
      notes.push(`roles.${role} model "${route.model}" was not checked: this runtime exposes no settings service`)
      continue
    }
    const models = declaredModels(provider, llm, settings)
    if (models === undefined) {
      notes.push(`roles.${role} model "${route.model}" was not checked: provider "${provider}" enumerates no models`)
      continue
    }
    if (!models.includes(route.model)) {
      errors.push(
        `roles.${role} names model "${route.model}", which provider "${provider}" does not enumerate; ` +
        `declared: ${models.join(', ')}`,
      )
    }
  }
  return { errors, notes }
}

/** What `describe()` reports for this plugin's own row, for diagnostics. */
export interface SettingsSelfView {
  /** Entry id the settings form is keyed by, when the runtime reports it. */
  ns?: string
  /** Whether the Web client may generate the page (default true upstream). */
  autoGenerate?: boolean
  /** Whether edits are live-applied. */
  applies?: string
  /** Top-level form fields the schema projects. */
  fields: string[]
}

/**
 * Read back this plugin's own settings descriptor.
 *
 * Used by the doctor/diagnostics path and by tests: it answers "does the
 * runtime offer a generated page for this plugin, and which fields would it
 * show?" without a browser.
 * @param ctx - plugin context.
 * @param entryIds - profile entry ids this plugin may have been loaded as.
 * @returns The self view, or undefined when the runtime cannot describe forms.
 */
export function describeSelf(ctx: Context, entryIds: readonly string[]): SettingsSelfView | undefined {
  try {
    const settings = serviceOf<SettingsFormsLike>(ctx, 'settings')
    if (settings === undefined || typeof settings.describe !== 'function') return undefined
    const descriptors = settings.describe({ redactSecrets: true })
    const mine = descriptors.find(item => entryIds.includes(item.ns))
    if (mine === undefined) return undefined
    const schema = (mine as unknown as { schema?: { properties?: Record<string, unknown> } }).schema
    return {
      ns: mine.ns,
      ...mine.autoGenerate === undefined ? {} : { autoGenerate: mine.autoGenerate },
      applies: 'live',
      fields: Object.keys(schema?.properties ?? {}),
    }
  } catch {
    return undefined
  }
}
