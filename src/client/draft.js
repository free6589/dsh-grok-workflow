    const emptyRoles = () => ({ planner: [], worker: [], verifier: [], synthesizer: [], supervisor: [] })
    const clone = (value) => {
      // A stored document is JSON-shaped, but a hostile or corrupted mirror
      // value (BigInt, circular, function) would throw out of useState and
      // take the whole page down. Fall back to empty so the page stays up.
      try {
        return JSON.parse(JSON.stringify(value === undefined ? null : value))
      } catch {
        return value === undefined ? null : undefined
      }
    }
    const draftOf = (value) => {
      const out = { roles: emptyRoles() }
      for (const field of FIELDS) {
        const current = value === undefined ? undefined : value[field.key]
        out[field.key] = current === undefined ? clone(field.def) : clone(current)
      }
      if (value !== undefined && value.roles !== undefined && value.roles !== null && typeof value.roles === 'object' && !Array.isArray(value.roles)) out.roles = clone(value.roles)
      for (const role of ROLES) if (!Array.isArray(out.roles[role])) out.roles[role] = []
      return out
    }

    /**
     * Client-side checks the Host would otherwise only report as a refused write.
     *
     * Findings are locale-free data (`{ key, params }`) so the same draft is reported
     * identically in every language and tests assert on structure rather than prose;
     * `formatError` renders one finding through a `t`.
     * @param draft - the editable draft.
     * @returns findings in page order, empty when the draft is acceptable.
     */
    const validate = (draft) => {
      const errors = []
      for (const field of FIELDS) {
        if (field.kind === 'number') {
          const raw = draft[field.key]
          if (!Number.isSafeInteger(raw) || raw < field.min || raw > field.max) {
            errors.push({ key: 'error.number', params: { key: field.key, min: field.min, max: field.max } })
          }
        } else if (field.kind === 'boolean') {
          // A boolean row is a switch: anything else (a `'on'` string from an old
          // hand edit, a missing value) would be refused by the Host schema, so it
          // is refused here first with a row-level reason.
          if (typeof draft[field.key] !== 'boolean') {
            errors.push({ key: 'error.badBoolean', params: { key: field.key } })
          }
        } else if (field.kind === 'enum') {
          // A stored value outside the options (a legacy patch, a hand edit)
          // renders as its own first row so nothing is lost — but it must not
          // save: the Host schema rejects it and refuses the whole document.
          const known = field.options.map((option) => String(option))
          if (!known.includes(String(draft[field.key]))) {
            errors.push({ key: 'error.badEnum', params: { key: field.key } })
          }
        } else if (field.kind === 'textarea') {
          // The template is a free-text prompt, so only the length is checked
          // here (the same bound the Host's own open refuses at). A
          // whitespace-only template is legal: arming a heartbeat with one
          // falls back to the built-in default instead of storing an empty
          // prompt, so an unfinished edit can never break the switch.
          const raw = typeof draft[field.key] === 'string' ? draft[field.key] : ''
          if (raw.length > field.max) {
            errors.push({ key: 'error.badTemplate', params: { key: field.key, limit: field.max } })
          }
        } else if (field.kind === 'model') {
          // Q8: a single-route field. A blank model is the "off" value and is
          // legal (the Host reads it as unset); a filled one must stay inside
          // the same per-field bounds the chain routes obey.
          const route = draft[field.key]
          if (route !== undefined && route !== null && typeof route === 'object' && !Array.isArray(route)) {
            const model = String(route.model || '').trim()
            const provider = String(route.provider || '').trim()
            if (model.length > ROUTE_FIELD_LIMIT || provider.length > ROUTE_FIELD_LIMIT) {
              errors.push({ key: 'error.tooLong', params: { key: field.key, limit: ROUTE_FIELD_LIMIT } })
            }
          }
        }
      }
      // T5: the gate preset no longer exists (fixed internal behavior).
      const safeRoles = draft !== undefined && draft !== null && typeof draft.roles === 'object' && draft.roles !== null && !Array.isArray(draft.roles) ? draft.roles : {}
      for (const role of ROLES) {
        const chain = safeRoles[role] || []
        if (chain.length > CHAIN_LIMIT) errors.push({ key: 'error.chainTooLong', params: { role, limit: CHAIN_LIMIT } })
        const seen = new Set()
        chain.forEach((route, index) => {
          const model = String((route && route.model) || '').trim()
          const provider = String((route && route.provider) || '').trim()
          if (model === '') errors.push({ key: 'error.missingModel', params: { role, index: index + 1 } })
          if (model.length > ROUTE_FIELD_LIMIT || provider.length > ROUTE_FIELD_LIMIT) {
            errors.push({ key: 'error.tooLong', params: { role, index: index + 1, limit: ROUTE_FIELD_LIMIT } })
          }
          // Per-route in-flight ceiling: blank means unlimited. Anything typed
          // must be an integer in range, or the row cannot be saved.
          const capRaw = route === undefined || route === null ? undefined : route.maxInFlight
          if (capRaw !== undefined && capRaw !== null && String(capRaw).trim() !== '') {
            const cap = Number(capRaw)
            if (!Number.isSafeInteger(cap) || cap < ROUTE_INFLIGHT_MIN || cap > ROUTE_INFLIGHT_MAX) {
              errors.push({ key: 'error.badCap', params: { role, index: index + 1, min: ROUTE_INFLIGHT_MIN, max: ROUTE_INFLIGHT_MAX } })
            }
          }
          // Two blank routes are not duplicates: they are two unfinished rows.
          const key = `${provider}::${model}`
          if (model !== '' && seen.has(key)) errors.push({ key: 'error.duplicate', params: { role, index: index + 1 } })
          if (model !== '') seen.add(key)
        })
      }
      // T5: `switchOn` and `synthesis` are fixed internally since T4, so no
      // page-level cross-checks remain: only the two visible numbers, the two
      // enums, and the five chains are validated.
      return errors
    }

    /**
     * T5 removed: the long-chain-plus-retries heads-up died with `maxRetries`
     * (fixed at 1 since T4) and the Dangerous combo it warned about. The stub
     * stays (always false) so the removal site is explicit; the page no longer
     * calls it.
     * @param draft - the editable draft (unused).
     * @returns false, always.
     */
    function comboWarn(draft) {
      return false
    }

    /**
     * Heads-up (not a block) when a chain has 2+ finished routes but every cap
     * is blank: blank = unlimited = never yields, so no overflow can ever
     * happen on that chain. Only finished rows (non-blank model) count — two
     * blank unfinished rows are already `error.missingModel`, not this warning.
     * A capped route yields only when full inside one workflow run; counts are
     * never shared across runs. Rendered above the save button like `comboWarn`;
     * saving still works.
     * @param draft - the editable draft.
     * @returns true when the warning should show.
     */
    function emptyCapWarn(draft) {
      const safeRoles = draft !== undefined && draft !== null && typeof draft.roles === 'object' && draft.roles !== null && !Array.isArray(draft.roles) ? draft.roles : {}
      return ROLES.some((role) => {
        const finished = (safeRoles[role] || [])
          .filter((route) => String((route && route.model) || '').trim() !== '')
        if (finished.length < 2) return false
        return finished.every((route) => {
          const capRaw = route === undefined || route === null ? undefined : route.maxInFlight
          return capRaw === undefined || capRaw === null || String(capRaw).trim() === ''
        })
      })
    }

    /**
     * Heads-up (not a block) for a live document that already stores a number above
     * its hard maximum (B07, B02): `maxConcurrency` 8 or `maxRetries` 5 from a profile
     * patch written before v0.9.0 restored the 100 / 3 envelope, or any other limit in
     * the Host's clamp list.
     *
     * The Host repairs that at load — it clamps to the cap, warns once and activates
     * the row instead of refusing it — so the tool is usable but the stored number
     * still disagrees with what runs. This banner is the page half of that pair: it
     * names the stored value and the cap, and it reads the *stored* document rather
     * than the draft, because the draft is already what the reader is editing. Saving
     * a legal number re-publishes the document and the notice disappears on its own.
     *
     * It must read `entry.user`, not `entry.value` (B01). `describe()` publishes the
     * *effective* value — already through the schema clamp — so a banner that compared
     * `value` against the cap could never fire: it was dead code that made the whole
     * pair look like a page feature nobody could ever see. `user` is the document as
     * stored, which is exactly the number that disagrees. A namespace with no user
     * layer, and a bare document (a test fixture, a caller passing a value), fall back
     * to `value`, so the banner degrades to reporting the effective document instead of
     * disappearing.
     *
     * Only a numeric value above the maximum counts: a string, or a value below the
     * minimum, is a different defect and is already `error.number` (red, blocks Save).
     * @param entry - the namespace entry as the mirror publishes it (`{ value, user }`),
     *   or a plain settings document.
     * @returns one `{ key, live, cap }` finding per overrun, in field order.
     */
    function limitOverrunWarn(entry) {
      const findings = []
      if (entry === undefined || entry === null) return findings
      const projected = entry.value === undefined || entry.value === null ? entry : entry.value
      const stored = entry.user === undefined || entry.user === null ? projected : entry.user
      if (stored === undefined || stored === null) return findings
      for (const field of FIELDS) {
        if (field.kind !== 'number' || field.max === undefined) continue
        const live = stored[field.key]
        if (typeof live !== 'number' || !Number.isFinite(live) || live <= field.max) continue
        findings.push({ key: field.key, live, cap: field.max })
      }
      return findings
    }

    /** Exact Host route that publishes the removed keys this load still carries (D-155). */
    const CONFIG_NOTICES_ROUTE_PATH = '/grok-workflow/config-notices'

    /**
     * The removed keys the Host says this load is still carrying, as the page last read them.
     *
     * Why a route instead of the settings document (D-155): `settings/describe` publishes
     * `user` **projected through the namespace's schema** (`projectForm` walks the
     * schema's `dict`), and a removed key is by definition not in that schema — so an
     * `entry.user` scan can never see one. The plugin still sees the leftover in the raw
     * config, so it publishes the list over its own read-only route, the same mechanism
     * the workflow switch above uses. Reading the route is idempotent, which is what lets
     * the load log keep its own one-line-per-key announcement untouched.
     *
     * Deliberately a plain store rather than page state: the settings page mounts, the
     * settings *card* mounts, and a language switch re-renders — one read serves all
     * three, and a page that never mounts costs no request.
     */
    function createNoticesStore() {
      /** @type {string[]} */
      let value = []
      const listeners = new Set()
      return {
        /** @param {string[]} next */
        set(next) {
          const same = next.length === value.length && next.every((key, index) => key === value[index])
          value = next
          if (same) return
          for (const listener of listeners) listener()
        },
        /** @param {() => void} listener */
        subscribe(listener) {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        getSnapshot: () => value,
      }
    }

    const configNotices = createNoticesStore()

    /**
     * Read the notice route's answer into the keys this build knows are removed.
     *
     * The answer is `{ ok: true, notices: [{ key, message }] }`. Only the keys are taken:
     * the sentence is composed on this side from the page's own dictionary, so a language
     * switch re-renders the notice instead of stranding the other language's copy. A key
     * this build does not list as removed is dropped — the route is the Host's answer, but
     * the page still decides what it is willing to name.
     * @param payload - the parsed body, if any.
     * @returns the removed keys to name, in the order the route listed them.
     */
    function parseConfigNotices(payload) {
      if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return []
      if (payload.ok !== true || !Array.isArray(payload.notices)) return []
      const keys = []
      for (const notice of payload.notices) {
        const key = notice !== null && typeof notice === 'object' ? notice.key : undefined
        if (typeof key !== 'string' || !REMOVED_KEYS.includes(key) || keys.includes(key)) continue
        keys.push(key)
      }
      return keys
    }

    /**
     * Read the notice route once and publish what it says.
     *
     * Never throws and never surfaces a failure: a Host without the route (an older
     * composition, no `webServer`), a closed socket, a body that is not JSON — all of
     * them mean "no notice to show", not an error on a page whose job is editing
     * settings. The empty list is therefore also the failure answer.
     * @param fetchImpl - fetch to use; defaults to the page's own. Tests pass a fake.
     * @returns the keys that were published.
     */
    async function refreshConfigNotices(fetchImpl) {
      const answered = await getRoute(CONFIG_NOTICES_ROUTE_PATH, {}, fetchImpl)
      const keys = answered.failure === undefined && answered.status === 200 ? parseConfigNotices(answered.payload) : []
      configNotices.set(keys)
      return keys
    }

    /** Settings keys that have a row label, so a finding may name them in words. */
    const FIELD_KEYS = new Set(FIELDS.map((field) => field.key))

    /**
     * The name of one settings field, translated when it is a real field.
     *
     * A finding carries the field *key* (`historyTurns`), which is an identifier, not
     * copy: rendered raw it put an English camel-case key inside a Chinese sentence. The
     * label the row itself shows is the same fact in words, so it is reused here.
     * @param t - translator bound to this plugin's namespace.
     * @param key - the field key from a finding.
     * @returns the row label, or the key when it is not this page's field.
     */
    function fieldLabel(t, key) {
      return FIELD_KEYS.has(key) ? t(`field.${key}`) : key
    }

    /**
     * Render one validation finding in the active language.
     *
     * `role` params carry role ids, not prose: the role name is looked up here so a single
     * dictionary entry serves all four chains in both languages. `key` params carry a
     * settings key and go through {@link fieldLabel} for the same reason.
     * @param error - a finding from `validate`.
     * @param t - translator bound to this plugin's namespace.
     * @returns the message the user sees.
     */
    function formatError(error, t) {
      const source = error === undefined || error.params === undefined ? {} : error.params
      const params = { ...source }
      if (typeof params.role === 'string') params.role = t(`role.${params.role}`)
      if (typeof params.key === 'string') params.key = fieldLabel(t, params.key)
      return t(error.key, params)
    }

    /** Stable React key for one finding (the same text may repeat across rows). */
    const errorId = (error) => `${error.key}:${JSON.stringify(error.params || {})}`

    const opsFor = (draft, value) => {
      const ops = []
      for (const field of FIELDS) {
        const before = value === undefined ? undefined : value[field.key]
        if (JSON.stringify(before) === JSON.stringify(draft[field.key])) continue
        ops.push({ op: 'set', path: [field.key], value: draft[field.key] })
      }
      for (const role of ROLES) {
        const before = value && value.roles && typeof value.roles === 'object' && !Array.isArray(value.roles) ? value.roles[role] : undefined
        const after = draft !== undefined && draft !== null && typeof draft.roles === 'object' && draft.roles !== null && !Array.isArray(draft.roles) && Array.isArray(draft.roles[role]) ? draft.roles[role] : []
        if (JSON.stringify(before || []) === JSON.stringify(after)) continue
        ops.push({ op: 'set', path: ['roles', role], value: after })
      }
      return ops
    }

