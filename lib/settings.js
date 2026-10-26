import { CONFIG_KEYS, Config } from './config.js';
/**
 * Read one optional service without assuming the context exposes `get`.
 *
 * Real cordis contexts always do; test doubles and minimal embeddings may not,
 * and a missing lookup must mean "cannot validate", never a crash on load.
 * @param ctx - plugin context.
 * @param name - service name.
 * @returns The service, or undefined when this context cannot look services up.
 */
function serviceOf(ctx, name) {
    try {
        const get = ctx.get;
        if (typeof get !== 'function')
            return undefined;
        return get.call(ctx, name);
    }
    catch {
        return undefined;
    }
}
/** Roles in report order, so messages are stable. */
const ROLE_ORDER = ['planner', 'worker', 'verifier', 'synthesizer'];
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
export function declareSettingsSurface(ctx) {
    try {
        const settings = serviceOf(ctx, 'settings');
        if (settings === undefined)
            return 'absent';
        if (typeof settings.configure !== 'function')
            return 'unsupported';
        settings.configure({ auto: true });
        return 'declared';
    }
    catch {
        return 'unsupported';
    }
}
/**
 * Read the model ids one provider's configuration enumerates.
 * @param provider - provider route id from a configured chain.
 * @param llm - the runtime's model service.
 * @param settings - the runtime's settings service.
 * @returns Declared model ids, or undefined when the provider enumerates none.
 */
function declaredModels(provider, llm, settings) {
    const dir = llm.listConfigurableProviders?.() ?? [];
    const entry = dir.find(item => item.provider === provider);
    if (entry === undefined || typeof settings.describe !== 'function')
        return undefined;
    const descriptor = settings.describe({ redactSecrets: true }).find(item => item.ns === entry.settingsNs);
    if (descriptor === undefined)
        return undefined;
    let node = descriptor.value;
    for (const key of entry.settingsPath ?? []) {
        if (node === null || typeof node !== 'object')
            return undefined;
        node = node[key];
    }
    if (node === null || typeof node !== 'object')
        return undefined;
    const models = node.models;
    if (!Array.isArray(models))
        return undefined;
    const ids = [];
    for (const model of models) {
        if (typeof model === 'string')
            ids.push(model);
        else if (model !== null && typeof model === 'object') {
            const id = model.id;
            if (typeof id === 'string' && id !== '')
                ids.push(id);
        }
    }
    return ids.length === 0 ? undefined : ids;
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
export function validateRoutes(ctx, config) {
    const errors = [];
    const notes = [];
    const llm = serviceOf(ctx, 'llm');
    const settings = serviceOf(ctx, 'settings');
    const configured = [];
    for (const role of ROLE_ORDER) {
        for (const route of config.roles[role])
            configured.push({ role, route });
    }
    if (configured.length === 0)
        return { errors, notes };
    if (llm === undefined || typeof llm.listProviders !== 'function') {
        notes.push('model routes were not validated: this runtime exposes no llm service');
        return { errors, notes };
    }
    const providers = llm.listProviders();
    if (providers.length === 0) {
        notes.push('model routes were not validated: the provider registry was empty at load');
        return { errors, notes };
    }
    const known = providers.map(item => item.id);
    for (const { role, route } of configured) {
        const provider = route.provider;
        if (provider === undefined || provider === '') {
            notes.push(`roles.${role} route ${route.model} inherits the run's provider; only the model id is checked by the engine`);
            continue;
        }
        if (!known.includes(provider)) {
            errors.push(`roles.${role} names provider "${provider}", which this runtime does not have; known providers: ${known.join(', ')}`);
            continue;
        }
        if (settings === undefined || typeof settings.describe !== 'function') {
            notes.push(`roles.${role} model "${route.model}" was not checked: this runtime exposes no settings service`);
            continue;
        }
        const models = declaredModels(provider, llm, settings);
        if (models === undefined) {
            notes.push(`roles.${role} model "${route.model}" was not checked: provider "${provider}" enumerates no models`);
            continue;
        }
        if (!models.includes(route.model)) {
            errors.push(`roles.${role} names model "${route.model}", which provider "${provider}" does not enumerate; ` +
                `declared: ${models.join(', ')}`);
        }
    }
    return { errors, notes };
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
export function describeSelf(ctx, entryIds) {
    try {
        const settings = serviceOf(ctx, 'settings');
        if (settings === undefined || typeof settings.describe !== 'function')
            return undefined;
        const descriptors = settings.describe({ redactSecrets: true });
        const ownUid = Config.toJSON().uid;
        const uidOf = (item) => item.schema?.uid;
        // Identification is layered, because no single signal survives every runtime:
        //  1. the Loader entry id, when the caller knows it;
        //  2. the schema uid, when the descriptor carries our own schema object;
        //  3. the projected value, when the runtime rebuilt the schema (a volatile form
        //     gets a fresh uid, so uid equality alone reports "not ours" - t30/F2).
        // A distinctive subset is used for (3): a config that happens to share one key
        // with us is not us.
        const distinctive = ['toolName', 'roles', 'switchOn'];
        const looksLikeUs = (item) => {
            const value = (item.value ?? {});
            return distinctive.every(key => key in value);
        };
        const pick = (candidates, test) => {
            for (const item of candidates) {
                if (test(item) !== undefined)
                    return { item, how: 'id' };
            }
            return undefined;
        };
        let found;
        if (entryIds !== undefined) {
            found = pick(descriptors.filter(item => entryIds.includes(item.ns)), () => true);
        }
        if (found === undefined && ownUid !== undefined) {
            const byUid = descriptors.find(item => uidOf(item) === ownUid);
            if (byUid !== undefined)
                found = { item: byUid, how: 'uid' };
        }
        if (found === undefined) {
            const byValue = descriptors.find(looksLikeUs);
            if (byValue !== undefined)
                found = { item: byValue, how: 'value' };
        }
        if (found === undefined)
            return undefined;
        const mine = found.item;
        return {
            ns: mine.ns,
            ...mine.autoGenerate === undefined ? {} : { autoGenerate: mine.autoGenerate },
            ...mine.applies === undefined ? {} : { applies: mine.applies },
            fields: [...CONFIG_KEYS],
            schemaMatches: ownUid !== undefined && uidOf(mine) === ownUid,
            matchedBy: found.how,
        };
    }
    catch {
        return undefined;
    }
}
/**
 * Describe the settings surface for the plugin's own diagnostics (R-004).
 *
 * "Is the settings page real?" is a question a user must be able to answer from
 * the log alone: this line states which namespace the page writes to, whether
 * the client may generate it, and how many fields it projects — or that there is
 * no settings service at all and the profile patch is the only surface.
 * @param ctx - plugin context.
 * @param entryIds - optional candidate entry ids; when omitted the descriptor is
 *   matched by its projected keys, so a renamed profile row still resolves.
 * @returns Message and severity.
 */
export function describeSurface(ctx, entryIds) {
    const declared = declareSettingsSurface(ctx);
    if (declared === 'absent') {
        return {
            text: 'settings surface: none in this runtime (no settings service); configure through the profile patch',
            level: 'warn',
        };
    }
    if (declared === 'unsupported') {
        return {
            text: 'settings surface: this runtime has a settings service without the automatic-page hook; configure through the profile patch',
            level: 'warn',
        };
    }
    const view = describeSelf(ctx, entryIds);
    if (view === undefined) {
        return {
            text: 'settings surface: declared auto, but no generated descriptor was readable yet; edits still land in the profile patch',
            level: 'info',
        };
    }
    const auto = view.autoGenerate === false ? 'page suppressed' : 'page auto-generated';
    const applies = view.applies === undefined ? 'applies unknown' : `applies ${view.applies}`;
    const identity = view.schemaMatches
        ? 'schema matches'
        : `schema not matched by uid, identified by ${view.matchedBy ?? 'nothing'}`;
    return {
        text: `settings surface: ${auto} for "${view.ns}" (${view.fields.length} field(s), ${applies}, ${identity}); edits apply to the next message`,
        level: 'info',
    };
}
//# sourceMappingURL=settings.js.map