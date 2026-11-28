    // ─── Composer tool row: the two heartbeat switches ──────────────────────────
    //
    // The repeat-run heartbeat is the user's to start, and these switches are the user's
    // half of that rule. They are not a second implementation: every request goes to the
    // Host route named by `LOOP_ROUTE_PATH` / `ITERATE_ROUTE_PATH` in `src/loop.ts`, and
    // each route dispatches to the same `LoopService` methods the `grok_loop` tool calls —
    // `status`, `open`, `close`. What differs is the caller: a browser request carries no
    // acting Agent, which is exactly the condition `LoopService.open` requires, while the
    // tool always has one and is refused for it. The authorization is therefore
    // structural, not a UI courtesy: there is no path from an Agent to these POSTs.
    // `test/client.spec.ts` pins each file's path and action list against `src/loop.ts`
    // and the tool's own schema, so the switches cannot drift into "one switch opens one
    // thing and the tool reads another".
    //
    // Two switches, one factory, two slots: **Auto-continue** owns the loop route, whose
    // service stores a `Loop heartbeat` task; **Self-iterate** owns the iterate route,
    // whose service stores an `RSI heartbeat` task. Each service filters every read,
    // write and delete by its own reserved title, so one switch can never create, report
    // or delete the other's row. The iterate open sends no prompt and no interval: the
    // template persisted in the profile (`iterateTemplate`) is the one source of the
    // stored prompt, which is what keeps the settings page's textarea and the armed
    // heartbeat from disagreeing.
    //
    // They sit in the composer tool row, in the `list` slot the shell renders immediately
    // before the model selector ({@link SWITCH_SLOT}). The model-selector control itself
    // belongs to model selection and stays untouched: no switch reads or moves it, and no
    // code here reaches for its DOM.
    const LOOP_ROUTE_PATH = '/grok-workflow/loop'
    const ITERATE_ROUTE_PATH = '/grok-workflow/iterate'
    // The workflow switch is not a heartbeat: it flips the same session record `/grok
    // on|off` writes (`plugin:grok-workflow/mode` in `src/mode.ts`), which is the record
    // `src/gate.ts` already honors. One truth source, two callers — the switch here and
    // the command there — so no second `masterEnabled` field is invented anywhere.
    const MODE_ROUTE_PATH = '/grok-workflow/mode'
    // The record the switch follows in the session's own event window: the exact string
    // `src/mode.ts` appends, so a write the *command* makes is visible to the button
    // without a second route, a new host channel or a timer.
    const MODE_RECORD = 'plugin:grok-workflow/mode'
    // The upgrade card's two verbs ride a Host route (`src/update-surface.ts`): a browser
    // click cannot run `dsh plugin`, so the Host does the install and this bundle only
    // asks — `GET ?action=status` to read, `POST {action:'install', tag}` to move. Same
    // fence, same never-throws transport as the switches below.
    const UPDATE_ROUTE_PATH = '/grok-workflow/update'
    const LOOP_SWITCH_ORDER = 90
    const ITERATE_SWITCH_ORDER = 91
    const MODE_SWITCH_ORDER = 92
    /**
     * The one slot all three switches register into.
     *
     * `conversation.input.right` is the tool row's own `list` slot — "compact controls
     * before the composer submit action" — and the shell renders it ahead of the
     * model-selector seat, so an entry here sits immediately left of that selector rather
     * than in the ambient strip under the card. Two consequences matter: the row's render
     * gate is `sessionId !== undefined` (the model selector's own gate, not the dock's
     * `variant === 'composer'`), so the switches appear in the hero composer of a new
     * session as well; and the slot's stock occupancy is empty, so a fresh id appends
     * rather than replacing anything.
     */
    const SWITCH_SLOT = 'conversation.input.right'
    /** The actions both routes dispatch; pinned against the tool schema by the spec. */
    const LOOP_ACTIONS = ['status', 'close', 'open']
    /** The actions the mode route dispatches: read the record, or write it on/off. */
    const MODE_ACTIONS = ['status', 'set']

    /**
     * Absolute URL of one Host route.
     *
     * Relative to `document.baseURI`, so a switch keeps working behind a path prefix or a
     * desktop carrier that serves the page from a subdirectory. Without a `document`
     * (unit tests, a non-page evaluator) the bare path is returned and the caller decides.
     * @param routePath - the Host's exact path.
     * @returns the URL to POST to.
     */
    function routeUrl(routePath) {
      if (typeof document === 'undefined' || typeof document.baseURI !== 'string') return routePath
      try {
        return new URL(routePath, document.baseURI).href
      } catch {
        return routePath
      }
    }

    /**
     * POST one JSON body to a Host route and read the answer.
     *
     * `credentials: 'include'` and a same-origin path are what make the composition's
     * connection fence accept the call: these routes are guarded by the Host's own
     * Host/Origin + browser-authentication check, the same fence DSH's shipped routes
     * use, so a switch needs no credential of its own and stores none.
     *
     * Never throws: a missing `fetch`, a closed socket and a body that is not JSON all
     * come back as `failure` (with no status), and each switch turns that into its own
     * failure code and sentence.
     * @param routePath - the Host's exact path.
     * @param body - the one JSON body shape that route accepts.
     * @param fetchImpl - fetch to use; defaults to the page's own. Tests pass a fake.
     * @returns `{ status, payload }`, or `{ failure }` when there was no answer at all.
     */
    async function postRoute(routePath, body, fetchImpl) {
      const post = fetchImpl !== undefined ? fetchImpl : (typeof fetch === 'function' ? fetch : undefined)
      if (typeof post !== 'function') {
        return { failure: 'this page has no fetch to reach the Host with' }
      }
      let response
      try {
        response = await post(routeUrl(routePath), {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
      } catch (error) {
        return { failure: error && error.message ? error.message : String(error) }
      }
      let payload
      try {
        payload = await response.json()
      } catch {
        payload = undefined
      }
      return { status: response.status, payload }
    }

    /**
     * GET one Host route with query parameters and read the answer.
     *
     * Only the switch's read uses it: the route accepts `?action=status&sessionId=…`,
     * so a middle box that refuses POST cannot leave the button permanently blank.
     * Same fence and same never-throws contract as {@link postRoute}.
     * @param routePath - the Host's exact path.
     * @param params - query parameters to append.
     * @param fetchImpl - fetch to use; defaults to the page's own. Tests pass a fake.
     * @returns `{ status, payload }`, or `{ failure }` when there was no answer at all.
     */
    async function getRoute(routePath, params, fetchImpl) {
      const send = fetchImpl !== undefined ? fetchImpl : (typeof fetch === 'function' ? fetch : undefined)
      if (typeof send !== 'function') {
        return { failure: 'this page has no fetch to reach the Host with' }
      }
      const query = Object.entries(params)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        .join('&')
      let response
      try {
        response = await send(`${routeUrl(routePath)}?${query}`, { method: 'GET', credentials: 'include' })
      } catch (error) {
        return { failure: error && error.message ? error.message : String(error) }
      }
      let payload
      try {
        payload = await response.json()
      } catch {
        payload = undefined
      }
      return { status: response.status, payload }
    }

    // ─── The upgrade card's route calls ─────────────────────────────────────────
    //
    // `src/update-surface.ts` answers two verbs on {@link UPDATE_ROUTE_PATH}: a status read
    // (installed version, newest known release, whether this Host can install at all) and
    // an install for one exact tag. The page normalises both answers into one shape so the
    // card never has to look at an HTTP status, and so every silence — no `fetch`, a dead
    // socket, a body that is not JSON — comes back as a *stated* code instead of a thrown
    // exception. The precedent is `parseModePayload`: a refusal that arrives with a code is
    // reported with that code, and a refusal that arrives without one gets this page's own.

    /**
     * Whether `candidate` is a strictly newer release than `installed`.
     *
     * Both sides are `X.Y.Z`, the shape `PLUGIN_VERSION` / `UPDATE_LATEST` and the route
     * all use. A value that is not a version is never treated as an upgrade, so a Host that
     * answers nonsense cannot make the card offer an install for it.
     * @param candidate - the release that might be newer.
     * @param installed - what is installed now.
     * @returns true only when `candidate` is strictly greater.
     */
    function isNewerVersion(candidate, installed) {
      const parts = (value) => {
        if (typeof value !== 'string') return undefined
        const pieces = value.split(/[.+-]/)
        if (pieces.length < 3) return undefined
        const numbers = []
        for (let at = 0; at < 3; at += 1) {
          const number = Number.parseInt(pieces[at], 10)
          if (!Number.isFinite(number)) return undefined
          numbers.push(number)
        }
        return numbers
      }
      const next = parts(candidate)
      const now = parts(installed)
      if (next === undefined || now === undefined) return false
      for (let at = 0; at < 3; at += 1) {
        if (next[at] > now[at]) return true
        if (next[at] < now[at]) return false
      }
      return false
    }

    /**
     * One version field of a status answer, or null when the Host has no opinion.
     * @param value - the field as it arrived.
     * @returns the version string, or null.
     */
    function updateVersion(value) {
      return typeof value === 'string' && /^\d+\.\d+\.\d+/.test(value) ? value : null
    }

    /**
     * Read one status answer's `update` block, keeping every unknown as "unknown".
     *
     * A field the Host did not send is *not* filled in from this page's constants here —
     * the card decides how to fall back, because the difference between "the Host says
     * 0.13.31" and "this page was built as 0.13.31" is the difference between a fact and a
     * baseline.
     * @param update - the `update` block, if any.
     * @returns the normalised block, or undefined when the answer carried none.
     */
    function readStatusUpdate(update) {
      if (update === null || typeof update !== 'object' || Array.isArray(update)) return undefined
      return {
        current: updateVersion(update.current),
        latest: updateVersion(update.latest),
        latestSource: update.latestSource === 'remote' ? 'remote' : 'none',
        canInstall: update.canInstall === true,
        reason: typeof update.reason === 'string' && update.reason !== '' ? update.reason : undefined,
        command: typeof update.command === 'string' ? update.command : '',
      }
    }

    /**
     * Read one refused answer into the card's vocabulary.
     *
     * A 403 is the composition's fence (the request carried no accepted user credential);
     * a 405 is the method refused somewhere in front of the route. Both have their own
     * code, because "the route did not answer" would send the reader looking in the wrong
     * place.
     * @param payload - the parsed body, if any.
     * @param status - HTTP status of the answer.
     * @returns the stated failure.
     */
    function parseUpdateFailure(payload, status) {
      const answered = `the update route answered HTTP ${String(status)}`
      const refused = status === 403 ? 'update/user-only' : status === 405 ? 'update/method' : 'update/response'
      const isObject = payload !== null && typeof payload === 'object' && !Array.isArray(payload)
      if (!isObject) return { ok: false, code: refused, error: answered }
      const code = typeof payload.code === 'string' && payload.code !== '' ? payload.code : refused
      const error = typeof payload.error === 'string' && payload.error !== '' ? payload.error : answered
      return { ok: false, code, error }
    }

    /**
     * Read the update status without writing anything.
     * @param fetchImpl - fetch to use; defaults to the page's own. Tests pass a fake.
     * @returns `{ ok: true, update }`, or `{ ok: false, code, error }` — never a throw.
     */
    async function checkUpdate(fetchImpl) {
      const answered = await getRoute(UPDATE_ROUTE_PATH, { action: 'status' }, fetchImpl)
      if (answered.failure !== undefined) return { ok: false, code: 'update/transport', error: answered.failure }
      const payload = answered.payload
      const isObject = payload !== null && typeof payload === 'object' && !Array.isArray(payload)
      if (isObject && payload.ok === true) {
        const update = readStatusUpdate(payload.update)
        if (update !== undefined) return { ok: true, update }
        return { ok: false, code: 'update/response', error: 'the update route answered without a status block' }
      }
      return parseUpdateFailure(payload, answered.status)
    }

    /**
     * Ask the Host to install one exact tag.
     *
     * The tag is built here (`v` + the version the card is offering) rather than taken
     * from the status answer, so the install is pinned to the release the reader saw on
     * screen and never to "whatever resolves today".
     * @param tag - the exact tag, e.g. `v0.13.32`.
     * @param fetchImpl - fetch to use; defaults to the page's own. Tests pass a fake.
     * @returns `{ ok: true, installed }`, or `{ ok: false, code, error, rolledBack, restored }`.
     */
    async function installUpdate(tag, fetchImpl) {
      const answered = await postRoute(UPDATE_ROUTE_PATH, { action: 'install', tag }, fetchImpl)
      if (answered.failure !== undefined) {
        return { ok: false, code: 'update/transport', error: answered.failure, rolledBack: false, restored: undefined }
      }
      const payload = answered.payload
      const isObject = payload !== null && typeof payload === 'object' && !Array.isArray(payload)
      if (isObject && payload.ok === true) {
        const installed = payload.installed
        // `to` is what the Host read back from the installed row, not what it asked for:
        // without it the card could not tell an install that landed from one that did not.
        if (installed !== null && typeof installed === 'object' && typeof installed.to === 'string' && installed.to !== '') {
          return {
            ok: true,
            installed: {
              from: updateVersion(installed.from),
              to: installed.to,
              spec: typeof installed.spec === 'string' ? installed.spec : '',
              saveExact: installed.saveExact === true,
            },
          }
        }
        return { ok: false, code: 'update/response', error: 'the update route answered without a read-back version', rolledBack: false, restored: undefined }
      }
      const failure = parseUpdateFailure(payload, answered.status)
      return {
        ...failure,
        rolledBack: isObject && payload.rolledBack === true,
        restored: isObject ? updateVersion(payload.restored) : null,
      }
    }

    /**
     * Build one composer-tool-row heartbeat switch.
     *
     * The two switches differ in exactly four facts — the route path, the registration
     * id, the slot order and the copy prefix — and nothing else: the same state machine,
     * the same transport rules and the same DOM contract apply to both, so one factory
     * keeps them from drifting apart.
     * @param config - `routePath` (the exact Host route), `switchId` (the slot
     *   registration id), `switchOrder`, `dataAttr` (the `data-<attr>-toggle` DOM key,
     *   distinct per switch so a test can drive one without catching the other) and
     *   `textPrefix` (the dictionary prefix, `loop.switch.*` or `iterate.switch.*`).
     * @returns the bundle object the exports pin and the tests drive.
     */
    function makeHeartbeatSwitch(config) {
      const { routePath, switchId, switchOrder, dataAttr, textPrefix } = config

      /**
       * Absolute URL of this switch's route.
       *
       * Relative to `document.baseURI`, so the switch keeps working behind a path prefix
       * or a desktop carrier that serves the page from a subdirectory. Without a
       * `document` (unit tests, a non-page evaluator) the bare path is returned and the
       * caller decides.
       * @returns the URL to POST to.
       */
      function switchUrl() {
        return routeUrl(routePath)
      }

      /**
       * Read one route answer into the switch's own vocabulary.
       *
       * The route always answers JSON with `ok` plus either `loop` or `code`/`error`; a
       * proxy or a refusal that answers something else must not be reported as a state
       * change, so an unrecognized body becomes `loop/response` and the switch shows a
       * failure instead of pretending the loop moved.
       * @param payload - the parsed body, if any.
       * @param status - HTTP status of the answer.
       * @returns the loop snapshot, or the stated failure.
       */
      function parsePayload(payload, status) {
        const isObject = payload !== null && typeof payload === 'object' && !Array.isArray(payload)
        if (isObject && payload.ok === true && payload.loop !== undefined) {
          return { ok: true, loop: payload.loop }
        }
        const answered = `the heartbeat route answered HTTP ${String(status)}`
        // A 403 is the user-only refusal whichever body came with it: the status is the
        // composition's own fence saying the request carried no accepted user credential.
        const refused = status === 403 ? 'loop/user-only' : 'loop/response'
        if (!isObject) return { ok: false, code: refused, error: answered }
        const code = typeof payload.code === 'string' && payload.code !== '' ? payload.code : refused
        const error = typeof payload.error === 'string' && payload.error !== '' ? payload.error : answered
        return { ok: false, code, error }
      }

      /**
       * POST one heartbeat request to the Host route.
       *
       * The transport (same-origin path, `credentials: 'include'`, never a throw) is
       * {@link postRoute}, shared with the workflow switch so the two cannot drift into
       * two different ideas of how a browser reaches a Host route.
       * @param body - `{ action, sessionId }`, the one body shape the route accepts.
       * @param fetchImpl - fetch to use; defaults to the page's own. Tests pass a fake.
       * @returns the snapshot, or the stated failure — never a throw.
       */
      async function send(body, fetchImpl) {
        const answered = await postRoute(routePath, body, fetchImpl)
        if (answered.failure !== undefined) {
          return { ok: false, code: 'loop/transport', error: answered.failure }
        }
        return parsePayload(answered.payload, answered.status)
      }

      /** Read this session's heartbeat without writing: the same `status` the tool may call. */
      function read(sessionId, fetchImpl) {
        return send({ action: 'status', sessionId }, fetchImpl)
      }

      /** Open the heartbeat. Only reachable from a click: see the authorization note above. */
      function open(sessionId, fetchImpl) {
        return send({ action: 'open', sessionId }, fetchImpl)
      }

      /** Delete the heartbeat task; like the tool's `close`, this leaves nothing behind. */
      function close(sessionId, fetchImpl) {
        return send({ action: 'close', sessionId }, fetchImpl)
      }

      /** The one line under the switch, for one state, in one language. */
      function switchText(t, state) {
        const loop = state.loop
        if (state.phase === 'reading') return t(`${textPrefix}.switch.reading`)
        if (state.phase === 'busy') return t(`${textPrefix}.switch.busy`)
        if (state.phase === 'no-session') return t(`${textPrefix}.switch.noSession`)
        if (state.phase === 'failed') return failureText(t, state.code, state.error)
        if (loop === undefined || loop.open !== true) return t(`${textPrefix}.switch.off`)
        const minutes = typeof loop.intervalMinutes === 'number' ? String(loop.intervalMinutes) : '?'
        return typeof loop.rounds === 'number'
          ? t(`${textPrefix}.switch.on`, { minutes, rounds: String(loop.rounds) })
          : t(`${textPrefix}.switch.onUnbounded`, { minutes })
      }

      /**
       * One failure in the switch's words.
       *
       * The two codes a person can act on get their own sentence — "only you may open
       * this" and "this Host has no scheduler" are not the same problem as "the request
       * failed" — and everything else carries the Host's own message, which is already
       * redacted there.
       */
      function failureText(t, code, error) {
        if (code === 'loop/user-only') return t(`${textPrefix}.switch.userOnly`)
        if (code === 'loop/unavailable') return t(`${textPrefix}.switch.unavailable`)
        return t(`${textPrefix}.switch.failed`, { message: error === undefined ? '?' : String(error) })
      }

      /**
       * The switch itself: one button, one status line, no hidden writes.
       *
       * It reads on mount and never on a timer: a heartbeat's state is a fact the Host
       * owns, and polling it from the composer of every session would be work nobody
       * asked for. A click flips the state it last read — while it is still reading, the
       * switch is disabled rather than guessing, because a click on an unknown state
       * would open a heartbeat that may already exist (harmless) or report "off" over a
       * live task (not).
       * @param props - slot runtime props: `sessionId`, the seated `t`, and an optional
       *   transport override (`loopSend`, or `<dataAttr>Send`; tests pass a fake
       *   fetch-shaped stand-in; production uses the page's own fetch — never `send`
       *   itself, which already takes the request-body shape).
       */
      function Switch(props) {
        const t = guardedTranslator(props.t, translator(FALLBACK_LOCALE))
        const sessionId = typeof props.sessionId === 'string' && props.sessionId !== '' ? props.sessionId : undefined
        const override = typeof props[`${dataAttr}Send`] === 'function'
          ? props[`${dataAttr}Send`]
          : (typeof props.loopSend === 'function' ? props.loopSend : undefined)
        const send1 = override !== undefined
          ? override
          : (typeof fetch === 'function' ? fetch.bind(undefined) : send)
        const [state, setState] = useState(() => ({
          phase: sessionId === undefined ? 'no-session' : 'reading',
          loop: undefined,
          code: undefined,
          error: undefined,
        }))
        useEffect(() => {
          if (sessionId === undefined) return undefined
          let live = true
          read(sessionId, send1).then((result) => {
            // The composer can be recycled onto another session while the read is in
            // flight; a late answer about the old session must not repaint the new one.
            if (!live) return
            setState(result.ok === true
              ? { phase: 'ready', loop: result.loop, code: undefined, error: undefined }
              : { phase: 'failed', loop: undefined, code: result.code, error: result.error })
          })
          return () => { live = false }
        }, [sessionId])
        const flip = () => {
          if (sessionId === undefined || state.phase === 'busy' || state.phase === 'reading') return
          const closing = state.loop !== undefined && state.loop.open === true
          setState((current) => ({ ...current, phase: 'busy' }))
          const answered = closing ? close(sessionId, send1) : open(sessionId, send1)
          void answered.then((result) => {
            setState(result.ok === true
              ? { phase: 'ready', loop: result.loop, code: undefined, error: undefined }
              // A refused open leaves the previous state in place: the switch shows what it
              // last knew plus why the click did nothing, instead of flipping anyway.
              : { phase: 'failed', loop: state.loop, code: result.code, error: result.error })
          })
        }
        const openNow = state.phase === 'ready' && state.loop !== undefined && state.loop.open === true
        const disabled = state.phase === 'reading' || state.phase === 'busy' || state.phase === 'no-session'
        return h('div', { style: styles.loopDock, [`data-${dataAttr}-switch`]: switchId, [`data-${dataAttr}-state`]: state.phase },
          h('span', { style: styles.loopLabel }, t(`${textPrefix}.switch.label`)),
          h('button', {
            type: 'button', role: 'switch', 'aria-checked': openNow,
            'aria-label': t(`${textPrefix}.switch.aria`), title: t(`${textPrefix}.switch.aria`),
            [`data-${dataAttr}-toggle`]: true, disabled,
            style: openNow ? styles.switchOn : styles.switch,
            onClick: flip,
          }, h('span', { 'data-switch-thumb': true, 'aria-hidden': 'true', style: styles.switchThumb })),
          h('span', {
            style: state.phase === 'failed' ? styles.error : styles.hint,
            [`data-${dataAttr}-note`]: state.phase,
          }, switchText(t, state)))
      }

      /**
       * Register the switch in the composer tool row.
       *
       * `locale: NS` is added only when the composition installs a locale face — the same
       * rule the settings page follows, for the same reason: a registration that names a
       * namespace the renderer cannot seat throws, and a switch in the wrong language
       * beats no switch. The registration is additive (`list` slot, own id), so nothing
       * the stock composer renders is replaced.
       * @param ctx - the browser plugin context.
       * @param i18n - live locale binding.
       * @returns a disposer, or `undefined` when the registry refused the entry.
       */
      function start(ctx, i18n) {
        const options = {
          name: SWITCH_SLOT,
          id: switchId,
          order: switchOrder,
        }
        if (i18n.locale !== undefined) options.locale = NS
        try {
          return ctx.slots.inject(SWITCH_SLOT, () => ctx.slots.register(options, Switch))
        } catch (error) {
          const message = error && error.message ? error.message : String(error)
          console.warn(`[grok-workflow] the ${textPrefix} switch could not be registered (${message}); settings are unaffected.`)
          return undefined
        }
      }

      return {
        routePath, switchId, switchOrder, dataAttr, actions: LOOP_ACTIONS.slice(),
        component: Switch, mount: start, send, read, open, close,
        parsePayload, text: switchText, failureText, url: switchUrl,
      }
    }

    /** Auto-continue: the loop route, whose service owns the `Loop heartbeat` slot. */
    const LOOP_SWITCH = makeHeartbeatSwitch({
      routePath: LOOP_ROUTE_PATH, switchId: 'grok-workflow-loop', switchOrder: LOOP_SWITCH_ORDER,
      dataAttr: 'loop', textPrefix: 'loop',
    })
    /** Self-iterate: the iterate route, whose service owns the `RSI heartbeat` slot. */
    const ITERATE_SWITCH = makeHeartbeatSwitch({
      routePath: ITERATE_ROUTE_PATH, switchId: 'grok-workflow-iterate', switchOrder: ITERATE_SWITCH_ORDER,
      dataAttr: 'iterate', textPrefix: 'iterate',
    })

    /**
     * The workflow switch: the `/grok on|off` toggle, in button form.
     *
     * This is deliberately *not* a third `makeHeartbeatSwitch`. A heartbeat has an
     * interval, a round budget and a Schedule task; this one has a single persisted
     * boolean in the session record `src/mode.ts` owns, and the same record
     * `src/gate.ts` reads to decide whether a message is workflow work at all. The
     * switch therefore has no `open`/`close` pair and no interval: `set(true)` is
     * `/grok on`, `set(false)` is `/grok off`, and the copy reports the session's own
     * record — a session with no record has decided nothing and says so ("not set yet"),
     * even though the route still folds the deployment `grokDefault` into its answer for
     * `/grok status` and the settings page. The intake reads the record only, so the
     * switch must not repeat the default as if it were a decision (D-154).
     *
     * It is a browser surface for the same reason the heartbeats are: the record is the
     * user's toggle, and a tool call from an Agent would be a model switching its own
     * gate. The route refuses a request that carries no accepted user credential
     * (`mode/session`), and nothing here has a tool counterpart.
     */

    /**
     * Read one mode-route answer into the switch's own vocabulary.
     *
     * The route answers `{ ok: true, action, mode }` with the record as written
     * (`{ v, enabled, turn, setBy, workflowMode? }`), or `{ ok: false, code, error }`.
     * A body that says `ok` but carries no boolean is a refusal to report, not a state:
     * the switch shows a failure instead of inventing an enabled flag.
     * @param payload - the parsed body, if any.
     * @param status - HTTP status of the answer.
     * @returns the record's enabled flag, or the stated failure.
     */
    function parseModePayload(payload, status) {
      const isObject = payload !== null && typeof payload === 'object' && !Array.isArray(payload)
      const answered = `the mode route answered HTTP ${String(status)}`
      if (isObject && payload.ok === true) {
        const mode = payload.mode
        if (mode !== null && typeof mode === 'object' && typeof mode.enabled === 'boolean') {
          return { ok: true, mode }
        }
        return { ok: false, code: 'mode/internal', error: 'the mode route answered without an enabled flag' }
      }
      // A 403 is the composition's fence saying this request carried no accepted user
      // credential — the same refusal `/grok` itself would not need, because a command
      // always runs inside a user turn. A 405 with no code is the method being refused
      // somewhere in front of this route: that has its own sentence and its own code,
      // because "the route did not answer" sent the operator looking in the wrong place.
      const refused = status === 403 ? 'mode/session' : status === 405 ? 'mode/method' : 'mode/internal'
      if (!isObject) return { ok: false, code: refused, error: answered }
      const code = typeof payload.code === 'string' && payload.code !== '' ? payload.code : refused
      const error = typeof payload.error === 'string' && payload.error !== '' ? payload.error : answered
      return { ok: false, code, error }
    }

    /** POST one mode request: `{ action: 'status' }`, or `{ action: 'set', enabled }`. */
    async function sendMode(body, fetchImpl) {
      const answered = await postRoute(MODE_ROUTE_PATH, body, fetchImpl)
      if (answered.failure !== undefined) {
        return { ok: false, code: 'mode/transport', error: answered.failure }
      }
      // A refused method on a read is worth one retry over GET: the route reads that way
      // too, so a middle box that refuses POST costs the button a round-trip instead of
      // its state. A write is never retried — the POST is the only way to move the switch.
      if (answered.status === 405 && body.action === 'status') {
        const retried = await getRoute(
          MODE_ROUTE_PATH,
          { action: 'status', sessionId: body.sessionId },
          fetchImpl,
        )
        if (retried.failure === undefined) return parseModePayload(retried.payload, retried.status)
      }
      return parseModePayload(answered.payload, answered.status)
    }

    /** Read this session's toggle without writing; the route also fills in `grokDefault`. */
    function readMode(sessionId, fetchImpl) {
      return sendMode({ action: 'status', sessionId }, fetchImpl)
    }

    /** Write the toggle — `/grok on` (`true`) or `/grok off` (`false`). Click-only. */
    function setModeEnabled(sessionId, enabled, fetchImpl) {
      return sendMode({ action: 'set', sessionId, enabled }, fetchImpl)
    }

    /**
     * Whether the switch shows one mode answer as on.
     *
     * Only a record the session itself carries and switched on counts. A `source` of
     * `'default'` is the route's way of saying "this session has no record; here is the
     * deployment default it would fall back to" — the intake does not honour that default
     * (`canAcceptBlock` reads the record), so neither does the pill, the lamp or the click.
     * A missing `source` is an older answer about a record: read as before.
     * @param mode - the `mode` object from one route answer, if any.
     * @returns true when the switch may show this session as on.
     */
    function modeShownOn(mode) {
      return mode !== undefined && mode.enabled === true && mode.source !== 'default'
    }

    /** The one line under the workflow switch, for one state, in one language. */
    function modeSwitchText(t, state) {
      if (state.phase === 'reading') return t('mode.switch.reading')
      if (state.phase === 'busy') return t('mode.switch.busy')
      if (state.phase === 'no-session') return t('mode.switch.noSession')
      if (state.phase === 'failed') return modeFailureText(t, state.error)
      // No record yet is its own answer, in both directions of the deployment default:
      // "not set yet" is what the session did, not "on" (what the default would allow) and
      // not "off" (a decision nobody made).
      if (state.mode !== undefined && state.mode.source === 'default') return t('mode.switch.notOn')
      return modeShownOn(state.mode) ? t('mode.switch.on') : t('mode.switch.off')
    }

    /** One failure in the switch's words: the Host's own message is already redacted. */
    function modeFailureText(t, error) {
      return t('mode.switch.failed', { message: error === undefined ? '?' : String(error) })
    }

    /**
     * The `sessions` face, once this composition has one: the switch's only view of a record
     * a *command* wrote.
     *
     * `/grok off` runs in the Host, inside a user turn. Its write answers the command, not
     * this button, so the button's own state can only learn about it from something both
     * sides share — the session log, which `sessions.binding(id).eventSource` streams to the
     * browser. The face is optional and late for the same reason `locale` and `uiWorkspace`
     * are: requiring it would leave the whole bundle pending in a composition without it, and
     * the switch has always worked with no face at all (it reads and writes over the route).
     *
     * Hence the two halves. The face itself, and the switches that mounted before it arrived:
     * the composer is registered before `apply`'s injection resolves, so "look at mount" alone
     * loses the subscription to injection order. A waiter is called once, when the face lands,
     * which makes subscribing early and subscribing late the same thing.
     */
    let modeSessions
    /** Switches waiting for {@link modeSessions}; each is called once, with the face. */
    const modeSessionWaiters = new Set()

    /**
     * Announce the `sessions` face to the switch — `undefined` when it leaves.
     *
     * A departure wakes nobody: the face is coming back only in a composition that re-adds
     * the service, and a switch already subscribed keeps the window it holds. Nothing here
     * waits on a face, so nothing can pend on one.
     * @param face - the injected `sessions` service, or `undefined` when its scope is gone.
     */
    function offerModeSessions(face) {
      modeSessions = face
      if (face === undefined) return
      const waiters = Array.from(modeSessionWaiters)
      modeSessionWaiters.clear()
      for (const waiter of waiters) waiter(face)
    }

    /**
     * One session's live event window, or `undefined` when this composition cannot give it.
     *
     * `binding` is the sessions face's own door and answers only for a session the client has
     * materialized; an older face may not carry it at all. Both, plus a window without the
     * snapshot/subscribe pair, read as "no window", which the switch treats as "never refresh
     * in the background" — not as a failure, because the switch is complete without any of it.
     * @param face - the `sessions` service, if one was injected.
     * @param sessionId - the session the switch is seated on.
     * @returns the event source to follow, if any.
     */
    function modeEventWindow(face, sessionId) {
      if (face === undefined || face === null || typeof face.binding !== 'function') return undefined
      const binding = face.binding(sessionId)
      if (binding === undefined || binding === null) return undefined
      const source = binding.eventSource
      if (source === undefined || source === null) return undefined
      if (typeof source.getSnapshot !== 'function' || typeof source.subscribe !== 'function') return undefined
      return source
    }

    /**
     * The newest `seq` among this plugin's mode records in one event window, if any.
     *
     * The window holds every durable event of the session, this plugin's records included: they
     * carry `ignorable: true`, which keeps them away from the model, not from the browser. The
     * `seq` is what dedupes — a redelivered window, a replayed page or a second subscriber
     * names the same record, so the same record may never cost a second read.
     * @param snapshot - one `SessionEventWindow` snapshot.
     * @returns the highest record seq in the window, or `undefined` when it holds none.
     */
    function newestModeSeq(snapshot) {
      const entries = snapshot === undefined || snapshot === null || !Array.isArray(snapshot.entries) ? [] : snapshot.entries
      let newest
      for (const entry of entries) {
        if (entry === null || typeof entry !== 'object' || entry.type !== 'event') continue
        const event = entry.event
        if (event === null || typeof event !== 'object' || event.type !== MODE_RECORD) continue
        const seq = event.seq
        if (typeof seq !== 'number' || !Number.isFinite(seq)) continue
        if (newest === undefined || seq > newest) newest = seq
      }
      return newest
    }

    /**
     * The workflow switch itself: one button and one state line.
     *
     * It reads once on mount and never polls — the toggle is a fact the session owns, and
     * a composer that re-read it on a timer would be work nobody asked for. A click is
     * refused while the state is unknown or the write is in flight: flipping what it has
     * not read would be guessing at a gate. After a failed read the click retries the
     * read rather than writing blind.
     *
     * The one other read is an answer to a change it was told about: a new mode record in
     * the session's event window (a command wrote the toggle) gets exactly one re-read, and
     * the same record never gets a second one. That read is not a poll — no timer, no
     * per-event read — and it is silent about failure, because the person at the keyboard
     * did nothing to fail.
     * @param props - slot runtime props: `sessionId`, the seated `t`, and an optional
     *   transport override (`modeSend`; tests pass a fetch-shaped stand-in; production
     *   uses the page's own fetch).
     */
    function ModeSwitch(props) {
      const t = guardedTranslator(props.t, translator(FALLBACK_LOCALE))
      const sessionId = typeof props.sessionId === 'string' && props.sessionId !== '' ? props.sessionId : undefined
      const override = typeof props.modeSend === 'function' ? props.modeSend : undefined
      const send1 = override !== undefined ? override : (typeof fetch === 'function' ? fetch.bind(undefined) : undefined)
      const [state, setState] = useState(() => ({
        phase: sessionId === undefined ? 'no-session' : 'reading',
        mode: undefined,
        error: undefined,
      }))
      /** Read the toggle and repaint; shared by mount and by the retry after a failure. */
      const readNow = (live) => {
        readMode(sessionId, send1).then((result) => {
          if (live !== undefined && !live()) return
          setState(result.ok === true
            ? { phase: 'ready', mode: result.mode, error: undefined }
            : { phase: 'failed', mode: undefined, error: result.error })
        })
      }
      useEffect(() => {
        if (sessionId === undefined) return undefined
        let alive = true
        readNow(() => alive)
        return () => { alive = false }
      }, [sessionId])
      useEffect(() => {
        if (sessionId === undefined) return undefined
        let alive = true
        let stop
        /** The newest record seq already accounted for: the wall against reading twice. */
        let seen
        const follow = (source) => {
          if (!alive) return
          // What the window already carried was covered by the mount read; only a record
          // that arrives afterwards is news. Baselines per subscription, so a re-subscribe
          // cannot replay history as a burst of reads.
          seen = newestModeSeq(source.getSnapshot())
          const stopThis = source.subscribe(() => {
            if (!alive) return
            const seq = newestModeSeq(source.getSnapshot())
            if (seq === undefined || (seen !== undefined && seq <= seen)) return
            seen = seq
            readMode(sessionId, send1).then((result) => {
              // Nothing repaints a switch the user did not touch with a failure: a refused
              // or lost background read leaves the last known state and its line alone.
              if (!alive || result.ok !== true) return
              setState({ phase: 'ready', mode: result.mode, error: undefined })
            })
          })
          stop = typeof stopThis === 'function' ? stopThis : undefined
        }
        const attach = (face) => {
          const source = modeEventWindow(face, sessionId)
          if (source !== undefined) follow(source)
        }
        const known = modeEventWindow(modeSessions, sessionId)
        if (known !== undefined) follow(known)
        // No face yet is the normal case at mount: the injection resolves after the composer
        // is registered, so the waiter is what keeps that order from deciding whether the
        // switch ever follows the session.
        else modeSessionWaiters.add(attach)
        return () => {
          alive = false
          modeSessionWaiters.delete(attach)
          if (typeof stop === 'function') stop()
        }
      }, [sessionId])
      const flip = () => {
        if (sessionId === undefined || state.phase === 'busy' || state.phase === 'reading') return
        // Nothing was read, so nothing may be written: retry the read instead.
        if (state.phase === 'failed') {
          setState((current) => ({ ...current, phase: 'reading' }))
          readNow()
          return
        }
        const next = !modeShownOn(state.mode)
        setState((current) => ({ ...current, phase: 'busy' }))
        void setModeEnabled(sessionId, next, send1).then((result) => {
          setState(result.ok === true
            ? { phase: 'ready', mode: result.mode, error: undefined }
            // A refused write leaves the last known state on screen and says why the click
            // did nothing, instead of repainting a toggle that was never persisted.
            : { phase: 'failed', mode: state.mode, error: result.error })
        })
      }
      // What is known, not what was hoped for: after a refused write the last state the
      // Host reported stays on screen (with the failure line beside it), so the pill never
      // swings to a value that was never persisted. `known` is false only when no read has
      // succeeded yet — then there is no lamp and the note is the failure itself.
      // `enabledNow` is the same judgement as the state line, from the same helper: a pill
      // lit green beside "not set yet" would be the lie this change removes, and the click
      // reads its target from here too, so "not set yet" + one click means `set(true)`.
      const known = state.mode !== undefined
      const enabledNow = modeShownOn(state.mode)
      const disabled = state.phase === 'reading' || state.phase === 'busy' || state.phase === 'no-session'
      return h('div', { style: styles.loopDock, 'data-mode-switch': 'grok-workflow-mode', 'data-mode-state': state.phase },
        h('span', { style: styles.loopLabel }, t('mode.switch.label')),
        h('button', {
          type: 'button', role: 'switch', 'aria-checked': enabledNow,
          'aria-label': t('mode.switch.aria'), title: t('mode.switch.aria'),
          'data-mode-toggle': true, disabled,
          style: enabledNow ? styles.switchOn : styles.switch,
          onClick: flip,
        }, h('span', { 'data-switch-thumb': true, 'aria-hidden': 'true', style: styles.switchThumb })),
        // The lamp is the non-textual half of "off": a filled green dot when the session
        // runs workflow work, a hollow ring when it does not, so a grey pill is never the
        // only signal and nobody reads an off switch as "still running".
        known
          ? h('span', { 'data-mode-lamp': enabledNow ? 'on' : 'off', 'aria-hidden': 'true', style: enabledNow ? styles.dockDot : styles.dockDotOff })
          : null,
        h('span', {
          style: state.phase === 'failed' ? styles.error : styles.hint,
          'data-mode-note': state.phase,
        }, modeSwitchText(t, state)))
    }

    /**
     * Register the workflow switch in the composer tool row.
     *
     * Same rule as the heartbeats: `locale: NS` only when a locale face exists, additive
     * own id, and a refusing registry costs this switch and nothing else.
     * @param ctx - the browser plugin context.
     * @param i18n - live locale binding.
     * @returns a disposer, or `undefined` when the registry refused the entry.
     */
    function startModeSwitch(ctx, i18n) {
      const options = {
        name: SWITCH_SLOT,
        id: 'grok-workflow-mode',
        order: MODE_SWITCH_ORDER,
      }
      if (i18n.locale !== undefined) options.locale = NS
      try {
        return ctx.slots.inject(SWITCH_SLOT, () => ctx.slots.register(options, ModeSwitch))
      } catch (error) {
        const message = error && error.message ? error.message : String(error)
        console.warn(`[grok-workflow] the mode switch could not be registered (${message}); settings are unaffected.`)
        return undefined
      }
    }

    /** The workflow switch, as one object: what mounts, plus the seams the specs drive. */
    const MODE_SWITCH = {
      routePath: MODE_ROUTE_PATH, switchId: 'grok-workflow-mode', switchOrder: MODE_SWITCH_ORDER,
      dataAttr: 'mode', actions: MODE_ACTIONS.slice(),
      component: ModeSwitch, mount: startModeSwitch,
      send: sendMode, read: readMode, set: setModeEnabled,
      parsePayload: parseModePayload, text: modeSwitchText, failureText: modeFailureText,
      url: () => routeUrl(MODE_ROUTE_PATH),
      // The door `apply` uses to hand the switch the sessions face. Exported because it is
      // the same door the specs drive: a switch told about a face in a test is told the way
      // the running page tells it, not through a test-only prop.
      offerSessions: offerModeSessions,
    }

    /**
     * Mount the three tool-row switches and return one disposer that takes them away.
     *
     * Auto-continue and self-iterate are heartbeats; the workflow switch is the session
     * toggle `/grok on|off` writes. They share a slot and nothing else: each owns a
     * route, an id and a state line, so one switch can never create, report or delete
     * another's state.
     *
     * Each mount is additive and fails soft on its own: a registry that refuses one
     * registration costs that switch and still keeps the others, and a disposer that
     * only owns the registrations that actually landed never takes down a neighbor's.
     * @param ctx - the browser plugin context.
     * @param i18n - live locale binding.
     * @returns a combined disposer, or `undefined` when nothing was registered.
     */
    function startComposerSwitches(ctx, i18n) {
      const landed = [LOOP_SWITCH.mount(ctx, i18n), ITERATE_SWITCH.mount(ctx, i18n), MODE_SWITCH.mount(ctx, i18n)]
        .filter((disposer) => typeof disposer === 'function')
      if (landed.length === 0) return undefined
      return () => {
        for (const dispose of landed) dispose()
      }
    }

