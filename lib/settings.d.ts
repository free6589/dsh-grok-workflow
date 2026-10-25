import type { Context } from '@deepseek-ai/cordis';
import type { ResolvedConfig } from './types.js';
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
    configure?: (presentation: {
        auto?: boolean;
    }) => unknown;
    describe?: (options?: {
        redactSecrets?: boolean;
    }) => SettingsDescriptorLike[];
}
/** One descriptor as `ctx.settings.describe()` returns it. */
export interface SettingsDescriptorLike {
    ns: string;
    value?: unknown;
    autoGenerate?: boolean;
    revision?: number;
}
/** One configurable-provider directory entry this module reads. */
export interface ConfigurableProviderLike {
    provider: string;
    settingsNs: string;
    settingsPath?: readonly string[];
}
/** Minimal slice of `ctx.llm` this module uses. */
export interface LlmRuntimeLike {
    listProviders?: () => {
        id: string;
        name?: string;
    }[];
    listConfigurableProviders?: () => ConfigurableProviderLike[];
}
/** Outcome of the load-time check, reported by the caller. */
export interface RouteValidation {
    /** Problems that make the configuration unusable (the load must fail). */
    errors: string[];
    /** Things a user should know but that cannot be checked further. */
    notes: string[];
}
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
export declare function declareSettingsSurface(ctx: Context): 'declared' | 'absent' | 'unsupported';
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
export declare function validateRoutes(ctx: Context, config: ResolvedConfig): RouteValidation;
/** What `describe()` reports for this plugin's own row, for diagnostics. */
export interface SettingsSelfView {
    /** Entry id the settings form is keyed by, when the runtime reports it. */
    ns?: string;
    /** Whether the Web client may generate the page (default true upstream). */
    autoGenerate?: boolean;
    /** Whether edits are live-applied. */
    applies?: string;
    /** Top-level form fields the schema projects. */
    fields: string[];
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
export declare function describeSelf(ctx: Context, entryIds: readonly string[]): SettingsSelfView | undefined;
//# sourceMappingURL=settings.d.ts.map