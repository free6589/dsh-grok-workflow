    /**
     * Locate this plugin's settings namespace in the Host mirror.
     *
     * The namespace name is the Loader row id: `grok-workflow` in the shipped
     * composition, but *whatever the profile patch calls the row*. A renamed row
     * moves the namespace, and a page bound to the literal string would silently
     * vanish (t34 residual risk). Identification is therefore layered like the
     * Host's own: the shipped id first, then the projected value — `roles` is
     * volatile and specific enough to be this plugin (T5: `switchOn` is gone,
     * fixed internally since T4).
     * @param view - the mirror's namespace view, when the Host published one.
     * @param defaultNs - the shipped namespace id.
     * @returns the namespace to bind to and how it was found.
     */
    // Rename-safe: the shipped id wins; a renamed row is recognized by all
    // its volatile keys, not by one (T5: `roles` alone under-determines —
    // the Host serves volatile `roles` for other plugins too).
    function resolveNamespace(view, defaultNs) {
      const namespaces = view === undefined || view.namespaces === undefined ? [] : view.namespaces
      const byId = namespaces.find((item) => item.ns === defaultNs)
      if (byId !== undefined) return { ns: defaultNs, how: 'id' }
      // T5: the page only owns the FIELDS scalars plus `roles` chains, so the
      // renamed-row signature is all of them — `roles` must carry the five T5
      // chains, and every visible scalar must be present.
      const byValue = namespaces.find((item) => {
        const value = item.value !== undefined && item.value !== null ? item.value : {}
        if (value.roles === undefined || value.roles === null || typeof value.roles !== 'object') return false
        if (!ROLES.every((role) => Array.isArray(value.roles[role]))) return false
        return FIELDS.every((field) => field.key in value)
      })
      if (byValue !== undefined) return { ns: byValue.ns, how: 'value' }
      return { ns: defaultNs, how: view === undefined ? 'default' : 'missing' }
    }

    /**
     * Resolve this plugin's namespace out of the settings mirror, as four states.
     *
     * The mirror (`@deepseek-ai/dsh-client-ui-settings`' `SettingsDescribeMirror`) reports
     * `{ status: 'idle'|'loading'|'ready', view, error }`, and a failed `describe()` leaves
     * `status: 'idle'` (or `'ready'` with the last good view) together with `error`. Reading
     * only the status therefore turns a Host that is *broken* into a page that says "loading"
     * forever, which is what this function used to do. The four states the page renders:
     * `loading` — no answer yet; `error` — the last answer was a failure and nothing usable
     * is held; `unavailable` — a good answer that does not carry this namespace; `ready`.
     * @param face - the settings mirror.
     * @param defaultNs - the shipped namespace id.
     * @returns the state, the namespace entry (when there is one) and how it was found.
     */
    function useNamespace(face, defaultNs) {
      const snapshot = useSyncExternalStore(
        (listener) => face.subscribe(listener),
        () => face.getSnapshot(),
        () => face.getSnapshot(),
      )
      const view = snapshot.view
      const resolved = resolveNamespace(view, defaultNs)
      const entry = view === undefined ? undefined : view.namespaces.find((candidate) => candidate.ns === resolved.ns)
      const failure = snapshot.error === undefined || snapshot.error === null ? undefined : String(snapshot.error)
      let status = 'ready'
      if (entry === undefined) {
        if (failure !== undefined) status = 'error'
        else status = snapshot.status === 'ready' ? 'unavailable' : 'loading'
      }
      return {
        status,
        entry,
        error: failure,
        ns: resolved.ns,
        how: resolved.how,
      }
    }

    /**
     * Read the runtime's model catalog from the settings mirror: provider ids to
     * their declared model ids. Mirrors the host-side reader in `src/settings.ts`
     * (`llm.listConfigurableProviders` + `settings.describe`), but against the
     * browser face shape (`{ namespaces: [{ ns, value }] }`).
     *
     * Returns undefined when the runtime exposes nothing usable; every dropdown
     * caller falls back to a free-text input in that case.
     * @param face - the settings mirror.
     * @returns provider ids and their model lists, or undefined.
     */
    function readCatalog(face) {
      try {
        if (face === undefined || face === null || typeof face.getSnapshot !== 'function') return undefined
        const snapshot = face.getSnapshot()
        const namespaces = snapshot === undefined || snapshot.view === undefined || snapshot.view.namespaces === undefined
          ? []
          : snapshot.view.namespaces
        // Provider sections live under their own namespaces (e.g. `llm-p1` with
        // `value.providers.p1.models`); collect every `models` list found there.
        const catalog = {}
        let found = false
        for (const item of namespaces) {
          const value = item === undefined || item.value === undefined || item.value === null ? {} : item.value
          const providers = value.providers
          if (providers === undefined || providers === null || typeof providers !== 'object') continue
          for (const [provider, entry] of Object.entries(providers)) {
            if (entry === undefined || entry === null || typeof entry !== 'object') continue
            const models = entry.models
            if (!Array.isArray(models)) continue
            const ids = []
            for (const model of models) {
              if (typeof model === 'string' && model !== '') ids.push(model)
              else if (model !== null && typeof model === 'object' && typeof model.id === 'string' && model.id !== '') ids.push(model.id)
            }
            if (ids.length > 0) { catalog[provider] = ids; found = true }
          }
        }
        return found ? catalog : undefined
      } catch {
        return undefined
      }
    }

    /**
     * One form row: label on the left, control on the right.
     * T5 carries no usage hints (the mock has none): title only.
     * The raw field key is never rendered; it survives only as `data-field`.
     */
    function FieldRow(props) {
      const { fieldKey, title, control } = props
      return h('div', { style: styles.row, className: 'gw-row', 'data-field': fieldKey },
        h('span', { style: styles.label },
          h('span', { style: styles.labelTitle }, title)),
        h('div', { style: styles.control }, control))
    }

    function Toggle(props) {
      const { on, disabled, onFlip, label } = props
      return h('span', { style: { display: 'inline-flex', gap: '8px', alignItems: 'center' } },
        h('button', {
          type: 'button', role: 'switch', 'aria-checked': on === true,
          style: on === true ? styles.switchOn : styles.switch, disabled,
          onClick: () => onFlip(!on),
        },
        // The thumb is what makes the state visible at a glance; the pill alone is a block.
        h('span', { 'data-switch-thumb': true, 'aria-hidden': 'true', style: styles.switchThumb })),
        h('span', null, label))
    }

    function EnumField(props) {
      const { field, value, disabled, onChange, t } = props
      const optionKey = (option) => `option.${field.key}.${option}`
      const known = new Set(field.options.map((option) => String(option)))
      const current = String(value)
      // An out-of-range stored value (a legacy patch, a hand edit) must stay
      // selectable: a bare <select> would render blank and drop the value on
      // the next save. Show it as its own first row so nothing is lost.
      const rows = known.has(current) ? field.options : [current, ...field.options]
      return h('select', {
        style: { ...styles.input, ...styles.narrow, width: 'auto' }, value: current, disabled,
        onChange: (event) => onChange(field.key, event.target.value),
        'data-field': field.key,
      }, rows.map((option) => {
        const label = translate(undefined, optionKey(option)) === optionKey(option)
          ? option
          : t(optionKey(option))
        return h('option', { key: option, value: option }, label)
      }))
    }

    /**
     * One route row: provider dropdown + model dropdown, with free-text fallback.
     *
     * The catalog comes from the runtime's settings mirror (provider sections
     * declare their models); when the runtime exposes nothing, both controls
     * degrade to text inputs so the page never depends on a hard-coded list.
     */
    function RouteRow(props) {
      const { role, index, route, disabled, onUpdate, onRemove, catalog, t, invalid } = props
      const provider = String((route && route.provider) || '')
      const model = String((route && route.model) || '')
      const capRaw = route === undefined || route === null ? undefined : route.maxInFlight
      const capText = capRaw === undefined || capRaw === null ? '' : String(capRaw)
      const providers = catalog !== undefined && catalog !== null && typeof catalog === 'object' ? Object.keys(catalog) : []
      const models = provider !== '' && catalog !== undefined && catalog[provider] !== undefined ? catalog[provider] : []
      const knownProvider = provider === '' || providers.includes(provider)
      const knownModel = model === '' || models.includes(model)
      const missingModel = model.trim() === ''
      const badCap = capRaw !== undefined && capRaw !== null && String(capRaw).trim() !== '' &&
        (!Number.isSafeInteger(Number(capRaw)) || Number(capRaw) < ROUTE_INFLIGHT_MIN || Number(capRaw) > ROUTE_INFLIGHT_MAX)
      const rowInvalid = invalid === true || missingModel || badCap
      const badStyle = rowInvalid ? { borderColor: STATUS_COLOR.failed } : null
      const providerControl = providers.length === 0 || !knownProvider
        ? h('input', {
          type: 'text', placeholder: t('roles.manualProvider'), value: provider, disabled,
          style: badStyle === null ? styles.input : { ...styles.input, ...badStyle }, 'data-route-provider': `${role}-${index}`,
          onChange: (event) => onUpdate({ provider: event.target.value }),
        })
        : h('select', {
          style: badStyle === null ? styles.input : { ...styles.input, ...badStyle }, value: provider, disabled,
          'data-route-provider': `${role}-${index}`,
          onChange: (event) => onUpdate({ provider: event.target.value, model: '' }),
        },
        h('option', { key: '', value: '' }, t('roles.providerPlaceholder')),
        providers.map((name) => h('option', { key: name, value: name }, name)))
      const modelControl = models.length === 0 || !knownModel
        ? h('input', {
          type: 'text', placeholder: t('roles.modelPlaceholder'), value: model, disabled,
          style: badStyle === null ? styles.input : { ...styles.input, ...badStyle }, 'data-route-model': `${role}-${index}`,
          onChange: (event) => onUpdate({ model: event.target.value }),
        })
        : h('select', {
          style: badStyle === null ? styles.input : { ...styles.input, ...badStyle }, value: model, disabled,
          'data-route-model': `${role}-${index}`,
          onChange: (event) => onUpdate({ model: event.target.value }),
        },
        h('option', { key: '', value: '' }, t('roles.modelPlaceholder')),
        models.map((name) => h('option', { key: name, value: name }, name)))
      return h('div', { key: `${role}-${index}`, style: styles.route },
        h('span', { style: { ...styles.hint, minWidth: '18px', textAlign: 'center' } }, `${index + 1}`),
        h('span', { style: { flex: '1 1 0', minWidth: 0 } }, providerControl),
        h('span', { style: { flex: '1 1 0', minWidth: 0 } }, modelControl),
        h('span', { style: { flex: '0 0 64px', minWidth: 0 }, title: t('roles.capLabel') },
          h('input', {
            type: 'number', placeholder: t('roles.capPlaceholder'), value: capText, disabled,
            style: badCap ? { ...styles.input, textAlign: 'center', borderColor: STATUS_COLOR.failed } : { ...styles.input, textAlign: 'center' }, min: ROUTE_INFLIGHT_MIN, max: ROUTE_INFLIGHT_MAX, step: 1,
            'data-route-cap': `${role}-${index}`,
            'aria-label': t('roles.capLabel'),
            onChange: (event) => onUpdate({ maxInFlight: event.target.value === '' ? undefined : Number(event.target.value) }),
          })),
        h('button', {
          type: 'button', style: { ...styles.button, flex: 'none' }, disabled,
          onClick: onRemove,
          'data-remove-route': `${role}-${index}`,
        }, t('roles.remove')))
    }

    const ROLE_ORDER = { planner: 1, worker: 2, verifier: 3, supervisor: 4, synthesizer: 5 }

    /**
     * The guardian model row (Q8): one route, not a chain, first in the roles
     * group. Its failure modes differ from a chain on purpose — the adjudicator
     * has no fallback, so the row is a single provider/model pair and a blank
     * model reads as "off" (adjudication disabled, timeouts fail straight to
     * the task's bounded retry).
     *
     * `data-field` mirrors the FieldRow contract: this is a declared field whose
     * control is not a FieldRow, and the page-wide "every declared field has a
     * row" guard in test/client.spec.ts reads that attribute to see it.
     */
    function GuardianModelRow(props) {
      const { route, disabled, catalog, t, onChangeRoute } = props
      const provider = String((route && route.provider) || '')
      const model = String((route && route.model) || '')
      const providers = catalog !== undefined && catalog !== null && typeof catalog === 'object' ? Object.keys(catalog) : []
      const models = provider !== '' && catalog !== undefined && catalog[provider] !== undefined ? catalog[provider] : []
      const knownProvider = provider === '' || providers.includes(provider)
      const knownModel = model === '' || models.includes(model)
      const providerControl = providers.length === 0 || !knownProvider
        ? h('input', {
          type: 'text', placeholder: t('roles.manualProvider'), value: provider, disabled,
          style: styles.input, 'data-route-provider': 'guardianModel',
          onChange: (event) => onChangeRoute({ provider: event.target.value, model }),
        })
        : h('select', {
          style: styles.input, value: provider, disabled, 'data-route-provider': 'guardianModel',
          onChange: (event) => onChangeRoute({ provider: event.target.value, model: '' }),
        },
        h('option', { key: '', value: '' }, t('roles.providerPlaceholder')),
        providers.map((name) => h('option', { key: name, value: name }, name)))
      const modelControl = models.length === 0 || !knownModel
        ? h('input', {
          type: 'text', placeholder: t('roles.modelPlaceholder'), value: model, disabled,
          style: styles.input, 'data-route-model': 'guardianModel',
          onChange: (event) => onChangeRoute({ provider, model: event.target.value }),
        })
        : h('select', {
          style: styles.input, value: model, disabled, 'data-route-model': 'guardianModel',
          onChange: (event) => onChangeRoute({ provider, model: event.target.value }),
        },
        h('option', { key: '', value: '' }, t('roles.modelPlaceholder')),
        models.map((name) => h('option', { key: name, value: name }, name)))
      return h('div', { style: styles.roleCard, 'data-gw-guardian': true, 'data-field': 'guardianModel' },
        h('div', { style: styles.roleHead },
          h('span', { style: styles.roleIndex }, '·'),
          h('strong', null, t('field.guardianModel'))),
        h('p', { style: styles.hint, 'data-gw-guardian-hint': true }, t('field.guardianModel.hint')),
        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
          h('span', { style: { flex: '1 1 0', minWidth: 0 } }, providerControl),
          h('span', { style: { flex: '1 1 0', minWidth: 0 } }, modelControl)))
    }

    function RoleChain(props) {
      const { role, chain, disabled, onChange, catalog, t, badRows } = props
      const update = (index, patch) => {
        const next = chain.map((route, position) => (position === index ? { ...route, ...patch } : route))
        onChange(next)
      }
      return h('div', { style: styles.roleCard },
        h('div', { style: styles.roleHead },
          h('span', { style: styles.roleIndex }, String(ROLE_ORDER[role] || '·')),
          h('strong', null, t(`role.${role}`))),
        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
          h('span', { style: styles.hint }, t('roles.count', { count: chain.length, limit: CHAIN_LIMIT })),
          h('button', {
            type: 'button', style: styles.button, disabled: disabled || chain.length >= CHAIN_LIMIT,
            onClick: () => onChange([...chain, { provider: '', model: '' }]),
            'data-add-route': role,
          }, t('roles.add'))),
        h('div', { style: styles.chain, className: 'gw-chain' },
          chain.length === 0
            ? h('span', { style: { ...styles.hint, ...styles.empty } }, t('roles.empty'))
            : chain.map((route, index) => h(RouteRow, {
              key: `${role}-${index}`, role, index, route, disabled, catalog, t,
              invalid: badRows !== undefined && badRows.has(`${role}-${index}`),
              onUpdate: (patch) => update(index, patch),
              onRemove: () => onChange(chain.filter((_route, position) => position !== index)),
            }))))
    }

    /**
     * The version/upgrade card: installed version, newest release, and the one button
     * that can actually move it.
     *
     * The static `PLUGIN_VERSION` / `UPDATE_LATEST` pair plus the copyable command stay the
     * honest baseline: they are what this page knows without asking anyone, they are what a
     * reader gets in a composition with no update route at all, and they never go away.
     * Once the Host has answered, its `update.command` replaces the frozen baseline in all
     * three places the command appears (the body sentence, the command line, the copy
     * button) — a static line pointing at `#v0.13.31` next to "0.13.32 is available" would
     * install the older release, which is the mistake this button exists to end.
     * The button adds a Host answer on top — `src/update-surface.ts` is the only place a
     * browser click can reach an install, because `dsh plugin add` is a system command this
     * page cannot run.
     *
     * Four phases, each rendered as `data-gw-update-phase`:
     *
     * - `check` — the resting state. The primary button reads the route
     *   (`data-action="update-check"`); once the answer says a strictly newer release is
     *   available *and* this Host can install, the same button becomes
     *   `data-action="update-install"` and names the target. A Host that answers
     *   `canInstall: false` keeps the copy line and says so instead of offering a button.
     * - `installing` — one POST in flight; the primary button is disabled, and the copy
     *   line stays visible because that is the fallback if the click never finishes.
     * - `latest` — nothing newer, or an install whose read-back equals the target. The
     *   card shows the read-back version and says that a page refresh is what activates the
     *   build. It never reloads or navigates: that is the reader's decision.
     * - `failed` — the failure sentence with the code as an attribute, and the read again.
     *
     * Nothing runs on mount: no GET, no POST on first paint. A failed install is retried
     * from a fresh read, never by re-posting the same request blindly.
     * @param props - `{ t }`, the guarded translator, plus an optional `updateFetch` (tests
     *   pass a fake; production uses the page's own fetch).
     */
    function UpdateCard(props) {
      const { t } = props
      const fetchImpl = typeof props.updateFetch === 'function'
        ? props.updateFetch
        : (typeof fetch === 'function' ? fetch.bind(undefined) : undefined)
      const [copied, setCopied] = useState(false)
      /**
       * The card's one state cell.
       *
       * `status` (the last Host answer) survives a failure on purpose: the numbers on
       * screen should not vanish because a later call went wrong. `checking` is a read in
       * flight inside the `check` phase; `installed` is what an install read back and
       * `restored` is the version a rollback put back.
       */
      const [state, setState] = useState(() => ({
        phase: 'check',
        status: undefined,
        checking: false,
        installed: undefined,
        restored: undefined,
        code: undefined,
        error: undefined,
      }))
      const known = state.status
      /**
       * The one command line the card prints, copies and interpolates.
       *
       * The Host answers `update.command` in exactly the shape of `UPDATE_COMMAND`, built
       * from the release it just named. Preferring it is the whole point: a build frozen on
       * 0.13.31 that is told 0.13.32 is out would otherwise hand the reader a `#v0.13.31`
       * line next to a "0.13.32 is available" verdict, and copying it installs the older
       * release. With no answer — first paint, a dead socket, a Host that sends nothing or
       * sends an empty string — the static baseline is still byte for byte what is shown.
       */
      const command = known !== undefined && typeof known.command === 'string' && known.command !== ''
        ? known.command
        : UPDATE_COMMAND
      const copy = () => {
        try {
          const done = () => setCopied(true)
          if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            Promise.resolve(navigator.clipboard.writeText(command)).then(done, done)
          } else {
            done()
          }
        } catch {
          setCopied(true)
        }
      }
      // What is on disk, in the order the page can know it: an install's read-back, the
      // version a rollback restored, the Host's own reading, and only then the version this
      // build shipped as. The body sentence and the verdict both follow it, so the card
      // cannot say "installed 0.13.31, latest 0.13.32" next to "you are on the latest".
      const readback = state.installed !== undefined
        ? state.installed.to
        : (state.restored !== undefined && state.restored !== null
          ? state.restored
          : (known !== undefined && known.current !== null ? known.current : PLUGIN_VERSION))
      const target = known !== undefined && known.latest !== null ? known.latest : UPDATE_LATEST
      const newer = isNewerVersion(target, readback)
      const canInstall = known !== undefined && known.canInstall === true && newer

      /** Paint one status answer, or the reason there is none. */
      const applyStatus = (result) => {
        if (result.ok !== true) {
          setState((live) => ({ ...live, phase: 'failed', checking: false, code: result.code, error: result.error }))
          return
        }
        const update = result.update
        const latest = update.latest !== null ? update.latest : UPDATE_LATEST
        const installedNow = update.current !== null ? update.current : PLUGIN_VERSION
        setState({
          // "Nothing newer" is the Host's verdict and is shown as such; a newer release
          // this Host cannot install stays in `check`, where the note explains why.
          phase: isNewerVersion(latest, installedNow) ? 'check' : 'latest',
          status: update,
          checking: false,
          installed: undefined,
          restored: undefined,
          code: undefined,
          error: undefined,
        })
      }

      /** Read the route and repaint. The only thing that ever calls {@link checkUpdate}. */
      const runCheck = () => {
        setState((live) => ({ ...live, phase: 'check', checking: true, code: undefined, error: undefined }))
        void checkUpdate(fetchImpl).then(applyStatus)
      }

      /** One install, pinned to the release on screen. */
      const install = () => {
        // One POST per click: a second press while the first is in flight is a no-op, not
        // a second install, even in a carrier that still delivers the event.
        if (state.phase !== 'check' || !canInstall) return
        const wanted = target
        setState((live) => ({ ...live, phase: 'installing', checking: false, code: undefined, error: undefined }))
        void installUpdate(`v${wanted}`, fetchImpl).then((result) => {
          if (result.ok !== true) {
            setState((live) => ({
              ...live,
              phase: 'failed',
              code: result.code,
              error: result.error,
              restored: result.restored,
            }))
            return
          }
          setState((live) => ({
            ...live,
            // `latest` is a claim about the disk, so it is only made when the read-back
            // equals the tag that was asked for. Any other number stays in `check` with
            // that number on screen, and the next press reads the Host again.
            phase: result.installed.to === wanted ? 'latest' : 'check',
            installed: result.installed,
            code: undefined,
            error: undefined,
          }))
        })
      }

      const primary = state.phase === 'installing'
        ? h('button', {
          type: 'button', style: styles.primary, disabled: true, onClick: install,
          'data-action': 'update-install', 'data-gw-update-busy': true,
        }, t('update.installing'))
        : state.phase === 'latest'
          ? h('button', {
            type: 'button', style: styles.button, disabled: true, 'data-action': 'update-check',
          }, t('update.state.latest'))
          : state.phase === 'check' && canInstall
            ? h('button', {
              type: 'button', style: styles.primary, disabled: state.checking === true, onClick: install,
              'data-action': 'update-install',
            }, t('update.install', { target }))
            // `check` before anything was asked, and `failed` on the way back in: both read
            // the route, and neither installs anything.
            : h('button', {
              type: 'button', style: styles.button, disabled: state.checking === true, onClick: runCheck,
              'data-action': 'update-check',
            }, t('update.check'))

      return h('div', {
        style: styles.card,
        'data-gw-update': `${PLUGIN_VERSION}:${UPDATE_LATEST}`,
        'data-gw-update-phase': state.phase,
        'data-gw-update-can-install': canInstall ? 'yes' : 'no',
      },
        h('h3', { style: styles.groupTitle }, t('update.title')),
        h('p', { style: styles.hint }, t('update.body', { current: readback, target, command })),
        h('p', { style: styles.mono, 'data-gw-update-command': true }, command),
        // The verdict is suppressed in `failed`: "you are on the latest release" printed
        // next to "we could not ask" is a contradiction a reader cannot resolve.
        state.phase === 'failed'
          ? null
          : h('p',
            { style: styles.hint, 'data-gw-update-state': newer ? 'newer' : 'latest' },
            newer ? t('update.state.newer', { target }) : t('update.state.latest')),
        // Degraded mode: a newer release exists but this Host cannot install it (no plugin
        // manager, or it cannot read the installed row). The reason rides along as an
        // attribute so the sentence stays one sentence.
        known !== undefined && known.canInstall !== true && newer
          ? h('p',
            {
              style: styles.warn,
              'data-gw-update-unavailable': true,
              'data-gw-update-reason': known.reason === undefined ? 'update/unavailable' : known.reason,
            },
            t('update.unavailable'))
          : null,
        state.phase === 'latest'
          ? h('p', { style: styles.hint, 'data-gw-update-refresh': true }, t('update.refresh'))
          : null,
        state.phase === 'failed'
          ? h('p',
            {
              style: styles.error,
              'data-gw-update-error': state.error === undefined ? '' : String(state.error),
              'data-gw-update-error-code': state.code === undefined ? 'update/response' : String(state.code),
            },
            t('update.failed', { message: state.error === undefined ? '?' : String(state.error) }))
          : null,
        h('p', { style: styles.hint, 'data-gw-update-terminal': true }, t('update.terminal')),
        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
          h('span', { style: styles.hint, 'data-gw-update-current': readback }, `${t('update.current')}: ${readback}`),
          primary,
          h('button', { type: 'button', style: styles.button, onClick: copy, 'data-action': 'update-copy' }, t('update.copy'))))
    }

    /**
     * The live one-line status under the intro, derived from the current draft:
     * the value a session with no `/grok` record reports. It is a default, not a
     * router — admitting a reviewed block stays the session's own record's job.
     * It follows the draft in real time and is never saved.
     */
    function StatusLine(props) {
      const { draft, t } = props
      const on = draft.grokDefault === 'on'
      const key = on ? 'status.on' : 'status.off'
      const detailKey = `${key}.detail`
      const dot = on ? STATUS_COLOR.done : STATUS_COLOR.pending
      return h('div', { style: on ? styles.statusOn : styles.statusOff },
        h('span', { style: { ...styles.statusDot, background: dot } }),
        h('strong', null, t(key)),
        h('span', { style: { marginLeft: '8px', opacity: 0.75, fontSize: '12px' } }, t(detailKey)))
    }

    function GrokWorkflowPage(props) {
      // `t` is the framework's locale seat when the registration declared `locale: NS`
      // (it re-derives on every locale revision), and the bundle's own translator when the
      // composition has no locale plugin. Either way the guard below refuses to render a
      // key: a seat whose dictionary is not registered answers with the key itself, and
      // `field.maxConcurrency` is not something this page may show a reader.
      const t = guardedTranslator(props.t, typeof props.translateOwn === 'function' ? props.translateOwn : translator(FALLBACK_LOCALE))
      // The plugin manager renders this same registration twice: once as the card's
      // one-line description (`view: 'summary'`) and once as the detail page.
      if (props.view === 'summary') {
        return t('card.summary')
      }
      const namespace = useNamespace(props.face, props.defaultNs === undefined ? NS : props.defaultNs)
      // Whether the "进度" tab is mounted is a page-visible fact, not a console detail:
      // the tab needs `uiConversation`/`sessions`, and in a composition without them the
      // reader sees no third tab and no reason for its absence — so the reason is here.
      // The store is read through the same snapshot mechanism the form uses, so the note
      // appears the moment the tab's services resolve (or fail).
      const progressStore = props.progressStatus === undefined ? PROGRESS_STATUS_UNKNOWN : props.progressStatus
      const progressState = useSyncExternalStore(progressStore.subscribe, progressStore.getSnapshot)
      const progressNote = progressState === 'unknown' || progressState === 'mounted'
        ? null
        : h('p', { style: styles.warn, 'data-progress-note': progressState },
          progressState === 'failed'
            ? t('status.progressFailed', { message: String(progressStore.getMessage === undefined ? '' : progressStore.getMessage() || '') })
            : t('status.progressMissing'))
      const form = props.getForm(namespace.ns)
      const entry = namespace.entry
      const value = entry === undefined ? undefined : entry.value
      const [draft, setDraft] = useState(() => draftOf(value))
      const [saving, setSaving] = useState(false)
      const [message, setMessage] = useState(undefined)
      const [retrying, setRetrying] = useState(false)
      // Re-seed the draft whenever the Host publishes a different document revision.
      const revision = entry === undefined ? undefined : entry.revision
      const stamp = `${String(revision)}:${namespace.status}`
      useEffect(() => { setDraft(draftOf(value)) }, [stamp])
      const errors = useMemo(() => validate(draft), [draft])
      // Row-level error marks: `missingModel`/`tooLong`/`duplicate`/`badCap`
      // carry `{ role, index }` (1-based) — the chain marks exactly those rows
      // red so the reader sees which row blocks the save.
      const badRows = useMemo(() => {
        const marks = new Set()
        for (const error of errors) {
          const params = error === undefined || error.params === undefined ? {} : error.params
          if (typeof params.role === 'string' && Number.isSafeInteger(params.index)) {
            marks.add(`${params.role}-${Number(params.index) - 1}`)
          }
        }
        return marks
      }, [errors])
      const ops = useMemo(() => opsFor(draft, value), [draft, value])
      const warnEmptyCap = useMemo(() => emptyCapWarn(draft), [draft])
      // Keyed on the live document, not the draft: an overrun is a fact about what is
      // stored, and it stops being one when the save lands (the revision bumps and the
      // draft is re-seeded from the new value). The entry is passed whole so the banner
      // can read the stored `user` layer instead of the clamped `value` (B01).
      const warnLimits = useMemo(() => limitOverrunWarn(entry), [entry, value, stamp])
      // D-155: the removed keys come from the plugin's own read-only route, not from the
      // settings document — the Host projects `user` through the namespace's schema, so a
      // leftover key is never in `entry.user`. Read once per mount, silently: a Host
      // without the route simply has nothing to say, and that is not a page error.
      const warnRemoved = useSyncExternalStore(configNotices.subscribe, configNotices.getSnapshot)
      useEffect(() => { void refreshConfigNotices() }, [])
      const disabled = saving || namespace.status !== 'ready' || entry === undefined || entry.writable === false
      const onChange = (key, next) => setDraft((current) => ({ ...current, [key]: next }))
      const setChain = (role, next) => setDraft((current) => ({ ...current, roles: { ...current.roles, [role]: next } }))
      const catalog = useMemo(() => readCatalog(props.face), [props.face, stamp])
      const save = async () => {
        if (errors.length > 0 || ops.length === 0) return
        setSaving(true)
        setMessage(undefined)
        try {
          const accepted = await form.mutate(ops, revision)
          // The message is stored as a key, not as prose, so a language switch mid-session
          // re-renders it in the new language instead of stranding the old one.
          setMessage(accepted === true ? { kind: 'ok', key: 'status.saved' } : { kind: 'error', key: 'status.refused' })
        } catch (error) {
          setMessage({ kind: 'error', key: 'status.writeFailed', params: { message: (error && error.message) || error } })
        } finally {
          setSaving(false)
        }
      }

      /**
       * Ask the Host for the settings document again.
       *
       * `load()` is the mirror's own refresh entry point (`SettingsDescribeMirror.load`,
       * the one `ensure()` calls when it is idle) and is the only documented way for a
       * plugin to retry a failed `describe()`. A composition that does not expose it
       * simply gets no retry button, which is why the button is built from the face
       * rather than assumed to exist.
       */
      const retry = typeof props.face !== 'undefined' && props.face !== null && typeof props.face.load === 'function'
        ? () => {
          setRetrying(true)
          Promise.resolve()
            .then(() => props.face.load())
            .catch(() => undefined)
            .then(() => setRetrying(false))
        }
        : undefined

      // Three states, kept apart on purpose: a page that is still reading, a read that
      // failed (with one way out), and a Host that answers but does not serve this
      // namespace (the plugin is off — retrying cannot help, so no button is offered).
      if (namespace.status === 'loading' || (entry !== undefined && value === undefined)) {
        return h('div', { style: styles.state, 'data-settings-state': 'loading' },
          h('p', { style: styles.hint }, t('status.loading')))
      }
      if (namespace.status === 'error' || namespace.status === 'unavailable') {
        const failed = namespace.status === 'error'
        const reload = failed ? retry : undefined
        return h('div', { style: styles.state, 'data-settings-state': namespace.status },
          h('p', { style: failed ? styles.error : styles.hint },
            failed
              ? t('status.loadError', { message: namespace.error })
              : t('status.unavailable')),
          reload === undefined
            ? null
            : h('button', {
              type: 'button', style: styles.button, 'data-action': 'retry',
              disabled: retrying, onClick: reload,
            }, t('action.retry')))
      }

      // T5: no usage hints anywhere on the page (mock has none).
      const fieldByKey = (key) => FIELDS.find((field) => field.key === key)
      // Number input with a unit suffix (paired `unit.*` dict keys).
      // The FIELDS min/max/def stay untouched.
      // Q9 (v0.13): a field whose stored unit differs from the unit it is edited in.
      // The value stays milliseconds everywhere else (schema, validation, report);
      // only the control converts, so nothing downstream has to know about minutes.
      const NUMBER_SCALES = { timeoutMs: 60000, childTimeoutMs: 60000 }
      const NUMBER_UNITS = {
        maxConcurrency: 'unit.jobs',
        maxTasks: 'unit.tasks',
        timeoutMs: 'unit.deadlineMinutes',
        childTimeoutMs: 'unit.childMinutes',
        loopMaxRounds: 'unit.rounds',
        loopFailStreak: 'unit.failures',
        loopIntervalMin: 'unit.minutes',
        iterateIntervalMin: 'unit.minutes',
      }
      const numberRow = (key) => {
        const field = fieldByKey(key)
        const unitKey = NUMBER_UNITS[key]
        const raw = draft[key]
        const scale = NUMBER_SCALES[key] || 1
        // The control shows `stored / scale`; every write multiplies back, so the
        // stored value never leaves milliseconds.
        const shown = raw === '' || raw === undefined ? '' : String(Number(raw) / scale)
        // Both bounds are whole numbers of the shown unit: a reader never sees a
        // fractional maximum, and the top step still lands inside the stored bound.
        const shownMin = Math.ceil(field.min / scale)
        const shownMax = Math.floor(field.max / scale)
        const step = (delta) => {
          const base = raw === '' || raw === undefined || !Number.isSafeInteger(Number(raw))
            ? field.def / scale
            : Number(raw) / scale
          const next = (base + delta) * scale
          onChange(key, Math.min(field.max, Math.max(field.min, Math.round(next))))
        }
        return h(FieldRow, {
          key, fieldKey: key, title: t(`field.${key}`),
          control: h('span', null,
            h('span', { style: { display: 'inline-flex', gap: '8px', alignItems: 'center' } },
              h('button', {
                type: 'button', style: styles.step, disabled: disabled || raw === '' || Number(raw) / scale <= shownMin,
                onClick: () => step(-1), 'aria-label': '−', 'data-step': `${key}-down`,
              }, '−'),
              h('input', {
                type: 'number', style: { ...styles.input, ...styles.narrow, textAlign: 'center' }, value: shown, disabled,
                min: shownMin, max: shownMax, step: 1,
                onChange: (event) => onChange(key, event.target.value === '' ? '' : Math.round(Number(event.target.value) * scale)),
                'data-field': key,
              }),
              h('button', {
                type: 'button', style: styles.step, disabled: disabled || raw === '' || Number(raw) / scale >= shownMax,
                onClick: () => step(1), 'aria-label': '＋', 'data-step': `${key}-up`,
              }, '＋'),
              unitKey === undefined ? null : h('span', { style: styles.hint }, t(unitKey)))),
        })
      }

      return h('div', { style: styles.page, 'data-page': 'grok-workflow' },
        h(PageStyle, null),
        h('div', null,
          h('h2', { style: styles.title }, t('card.title')),
          h('p', { style: { ...styles.hint, margin: '0 0 12px', fontSize: '13px' } }, t('page.intro')),
          h(StatusLine, { draft, t }),
          progressNote),
        // --- 1 · 会话默认 (what a session reports before /grok) ---
        h('div', { style: styles.card },
          h('h3', { style: styles.groupTitle }, t('group.mode')),
          h(FieldRow, {
            key: 'grokDefault', fieldKey: 'grokDefault',
            title: t('field.grokDefault'),
            control: h(Toggle, {
              on: draft.grokDefault === 'on', disabled,
              onFlip: (next) => onChange('grokDefault', next ? 'on' : 'off'),
              label: t(draft.grokDefault === 'on' ? 'option.grokDefault.on' : 'option.grokDefault.off'),
            }),
          })),
        // --- 2 · 谁来干 (the guardian judge, then the five role chains) ---
        h('div', { style: styles.card },
          h('h3', { style: styles.groupTitle }, t('group.roles')),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
            // Q8: the guardian judge sits before the role chains it protects.
            h(GuardianModelRow, {
              route: draft.guardianModel,
              disabled, catalog, t,
              onChangeRoute: (next) => onChange('guardianModel', { provider: '', model: '', ...next }),
            }),
            // The 429 switch (Sec.3-2): the last declared field without a control.
            // The state word reuses the page's existing On/Off pair (`option.replan.on`
            // / `option.replan.off`, plain "开/关" in both languages): the page ships
            // one On/Off string per language already, and adding
            // `option.switchOnRateLimit.*` would duplicate two strings per language,
            // which this round forbids (no new copy keys).
            h(FieldRow, {
              key: 'switchOnRateLimit', fieldKey: 'switchOnRateLimit',
              title: t('field.switchOnRateLimit'),
              control: h(Toggle, {
                on: draft.switchOnRateLimit === true, disabled,
                onFlip: (next) => onChange('switchOnRateLimit', next),
                label: t(draft.switchOnRateLimit === true ? 'option.replan.on' : 'option.replan.off'),
              }),
            }),
            h('p', { style: styles.hint, 'data-gw-ratelimit-hint': true }, t('field.switchOnRateLimit.hint')),
            ROLES.map((role) => h(RoleChain, {
              key: role, role, chain: draft.roles[role] || [], disabled, catalog, t, badRows,
              onChange: (next) => setChain(role, next),
            })))),
        // --- 3 · 下多大力气 (three numbers) ---
        h('div', { style: styles.card },
          h('h3', { style: styles.groupTitle }, t('group.limits')),
          numberRow('maxConcurrency'),
          numberRow('maxTasks'),
          numberRow('timeoutMs'),
          // Q9: the reader reported "there is no deadline setting", because a
          // millisecond number with a terse label reads as an internal knob. The
          // hint says the default and what 0 means, in the same place the control is.
          h('p', { style: styles.hint, 'data-gw-timeout-hint': true }, t('field.timeoutMs.hint')),
          numberRow('childTimeoutMs'),
          h('p', { style: styles.hint, 'data-gw-child-timeout-hint': true }, t('field.childTimeoutMs.hint'))),
        // --- 4 · 自动接着干 (the repeat-run switch and its three bounds) ---
        h('div', { style: styles.card },
          h('h3', { style: styles.groupTitle }, t('group.loop')),
          h(FieldRow, {
            key: 'loopEnabled', fieldKey: 'loopEnabled',
            title: t('field.loopEnabled'),
            control: h(Toggle, {
              on: draft.loopEnabled === true, disabled,
              onFlip: (next) => onChange('loopEnabled', next),
              label: t(draft.loopEnabled === true ? 'option.loopEnabled.on' : 'option.loopEnabled.off'),
            }),
          }),
          h(FieldRow, {
            key: 'replan', fieldKey: 'replan',
            title: t('field.replan'),
            control: h(Toggle, {
              on: draft.replan === true, disabled,
              onFlip: (next) => onChange('replan', next),
              label: t(draft.replan === true ? 'option.replan.on' : 'option.replan.off'),
            }),
          }),
          h('p', { style: styles.hint, 'data-gw-replan-hint': true }, t('field.replan.hint')),
          numberRow('loopMaxRounds'),
          numberRow('loopFailStreak'),
          numberRow('loopIntervalMin')),
        // --- 5 · 自迭代 (the self-iteration heartbeat's interval and prompt template) ---
        h('div', { style: styles.card },
          h('h3', { style: styles.groupTitle }, t('group.iterate')),
          numberRow('iterateIntervalMin'),
          h(FieldRow, {
            key: 'iterateTemplate', fieldKey: 'iterateTemplate',
            title: t('field.iterateTemplate'),
            control: h('textarea', {
              style: { ...styles.input, width: '100%', minHeight: '160px', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 },
              value: String(draft.iterateTemplate === undefined || draft.iterateTemplate === null ? '' : draft.iterateTemplate),
              disabled, rows: 8, spellCheck: false,
              onChange: (event) => onChange('iterateTemplate', event.target.value),
              'data-field': 'iterateTemplate',
            }),
          }),
          h('p', { style: styles.hint, 'data-gw-template-hint': true }, t('field.iterateTemplate.hint'))),
        // --- 6 · 插件版本 (read-only upgrade entry: current vs latest, copy the
        // `dsh plugin add` line — never a second installer) ---
        h(UpdateCard, { t }),
        warnEmptyCap
          ? h('div', { style: styles.warn },
            h('strong', null, t('warn.emptyCap.title')),
            h('div', null, t('warn.emptyCap.detail')))
          : null,
        warnLimits.length > 0
          ? h('div', { style: styles.warn, 'data-warn': 'limits' },
            h('strong', null, t('warn.limit.title')),
            warnLimits.map((item) => h('div', { key: item.key, 'data-warn-key': item.key },
              t('warn.limit.detail', { field: t(`field.${item.key}`), live: String(item.live), cap: String(item.cap) }))))
          : null,
        warnRemoved.length > 0
          ? h('div', { style: styles.warn, 'data-warn': 'removed' },
            h('strong', null, t('warn.removed.title')),
            warnRemoved.map((key) => h('div', { key, 'data-warn-key': key },
              t('warn.removed.detail', { key }))))
          : null,
        // One live region for both outcomes: a save that failed and a save that went
        // through are the two things a reader who is not looking at the footer must
        // hear. It is always mounted (empty when there is nothing to say) so that
        // *inserting* text is what announces, not a region appearing with text in it.
        h('div', { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true', 'data-gw-live': true },
          errors.length > 0
            ? h('div', { style: styles.errorBox },
              h('ul', { style: { ...styles.error, margin: 0, paddingLeft: '18px' } },
                errors.map((error) => h('li', { key: errorId(error) }, formatError(error, t)))))
            : null,
          message !== undefined
            ? h('p', { style: { ...(message.kind === 'error' ? styles.error : styles.ok), margin: 0 } }, t(message.key, message.params))
            : null),
        h('div', { style: styles.footer },
          h('button', {
            type: 'button', style: styles.primary, disabled: disabled || errors.length > 0 || ops.length === 0,
            onClick: save, 'data-action': 'save',
          }, saving ? t('action.saving') : t('action.save')),
          h('button', {
            type: 'button', style: styles.button, disabled: disabled || ops.length === 0,
            onClick: () => { setDraft(draftOf(value)); setMessage(undefined) }, 'data-action': 'discard',
          }, t('action.discard')),
          h('span', { style: { ...styles.hint, marginLeft: 'auto' } }, t('status.revision', { revision: String(revision) }))))
    }

