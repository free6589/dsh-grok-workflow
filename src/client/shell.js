    /** Required services for the page: the slot registry and the shared config forms. */
    const inject = ['slots', 'configForms']

    /**
     * Register the settings entry for one namespace, in both places it belongs.
     *
     * Two registrations, one component:
     *
     * - `plugins.item` is the card in the Plugins page. The plugin manager renders it
     *   twice (card and detail page), and it is the discoverable path: a reader looking
     *   for "what does this plugin add" starts there.
     * - `settings.section` is the left column of the Host's own Settings panel, a peer
     *   of 通用 / 模型 / 内置插件, labelled `Workflow` in both languages. It renders the
     *   same component as the whole page: it passes no `view`, so the `summary` branch
     *   never runs, and it never reads `close`.
     *
     * Both are bound to `ns` — the namespace that actually projects this plugin's
     * fields, which is normally the shipped id and otherwise the renamed Loader row —
     * and both share one `inject`, so the page cannot see two different faces.
     *
     * `locale: NS` is added only when the composition really installs a locale face:
     * the renderer throws a `SlotAssemblyError` for an entry that declares a namespace
     * while no face is installed, and a page in the wrong language beats no page.
     * @param ctx - the browser plugin context.
     * @param face - the settings mirror.
     * @param ns - namespace to bind the page to.
     * @param i18n - live locale binding: `locale` is the service when present, `t` the
     *   translator the card label and the page fallback resolve through.
     * @returns a disposer that unmounts both registrations.
     */
    function mountPage(ctx, face, ns, i18n) {
      const options = {
        name: 'plugins.item',
        id: ns,
        order: 60,
        // Re-evaluated by the plugin manager on every locale revision, so the card title
        // follows a language switch even before the seat below exists.
        label: () => i18n.t('card.title'),
        inject: () => ({
          face,
          defaultNs: ns,
          translateOwn: i18n.t,
          getForm: (name) => ctx.configForms.get(name),
          // Why the "进度" tab is not on screen, as a live observable: the tab's services
          // arrive (or never do) after this page is mounted, so a snapshot read only at
          // mount time could not report the case the reader actually hits.
          progressStatus: i18n.progress,
        }),
      }
      // Same component, same inject, same id: the Settings left column is an entry point
      // to this page, not a second page. `order: 60` matches the card's.
      const section = {
        name: 'settings.section',
        id: ns,
        order: 60,
        label: () => i18n.t('section.label'),
        inject: options.inject,
      }
      if (i18n.locale !== undefined) {
        options.locale = NS
        section.locale = NS
      }
      const disposeCard = ctx.slots.inject('plugins.item', () => ctx.slots.register(options, GrokWorkflowPage))
      const disposeSection = ctx.slots.inject('settings.section', () => ctx.slots.register(section, GrokWorkflowPage))
      return () => {
        if (typeof disposeSection === 'function') disposeSection()
        if (typeof disposeCard === 'function') disposeCard()
      }
    }

    /**
     * Register the settings tab while the Host serves this plugin's namespace.
     *
     * Everything the page depends on is captured through `i18n`, so a locale service that
     * arrives (or leaves) later only requires a restart of these two effects, not a
     * different code path: `start()` is the single mounting routine.
     * @param ctx - the browser plugin context.
     * @param face - the settings mirror.
     * @param i18n - live locale binding.
     * @returns a disposer that unmounts both registrations.
     */
    function startPages(ctx, face, i18n) {
      const mountServed = () => ctx.configForms.whileServed([NS], () => mountPage(ctx, face, NS, i18n))
      const served = ctx.effect(() => {
        const dispose = mountServed()
        return typeof dispose === 'function' ? dispose : () => {}
      }, 'grok-workflow: settings page')
      // The shipped namespace id is only the default: if a profile renames the
      // Loader row, the same fields project under another id. Re-bind there and say
      // so, rather than leaving the page silently missing (t34 residual risk). When
      // nothing projects our fields the plugin is disabled or did not activate — the
      // case that swallowed the whole feature in t33 — so name it in the console.
      const identity = ctx.effect(() => {
        let announced = undefined
        let unmount = undefined
        const check = () => {
          const snapshot = face.getSnapshot()
          const resolved = resolveNamespace(snapshot.view, NS)
          if (resolved.how === 'value') {
            if (announced !== resolved.ns) {
              announced = resolved.ns
              console.warn(`[grok-workflow] settings namespace is "${resolved.ns}", not the shipped "${NS}": the Loader row id differs. The page follows the row that projects this plugin's fields.`)
              if (unmount !== undefined) { unmount(); unmount = undefined }
              unmount = mountPage(ctx, face, resolved.ns, i18n)
            }
            return
          }
          if (resolved.how === 'missing' && snapshot.status === 'ready' && announced !== 'missing') {
            announced = 'missing'
            console.warn('[grok-workflow] no settings namespace projects this plugin\'s fields: the row is disabled, renamed with an unreadable projection, or did not activate (see docs/LOCAL-TESTING.md#enable). The Grok workflow page cannot appear until it does.')
          }
        }
        const off = typeof face.subscribe === 'function' ? face.subscribe(check) : undefined
        check()
        return () => {
          if (typeof off === 'function') off()
          if (unmount !== undefined) unmount()
        }
      }, 'grok-workflow: namespace identity')
      return () => {
        if (typeof served === 'function') served()
        if (typeof identity === 'function') identity()
      }
    }

    /**
     * Mount the settings page and bind it to the composition's language setting.
     *
     * The language service is *optional and late*: it is reached through a nested
     * `ctx.inject(['locale'], …)` fiber rather than through this bundle's own `inject`.
     * A required injection would leave the whole plugin `pending` in a composition
     * without a language setting — and DSH reports pending entries as a boot failure,
     * which is a far worse outcome than English copy. When the service is there (the
     * shipped web composition always has it), this bundle registers its dictionary and
     * remounts the page with `locale: NS`, so the framework seats a live `t` that
     * re-renders on every switch — the same source Settings → General writes to.
     * @param ctx - the browser plugin context.
     */
    function apply(ctx) {
      const face = ctx.configForms.describe()
      /** Live locale binding; English until the service has been injected. */
      const i18n = { locale: undefined, t: translator(FALLBACK_LOCALE), progress: createProgressStatus() }
      ctx.effect(() => { face.ensure().catch(() => undefined) }, 'grok-workflow: settings mirror read')

      let stop = startPages(ctx, face, i18n)
      /**
       * Disposer of the composer tool-row switch.
       *
       * Mounted unconditionally, unlike the panel and the tab: the switch needs nothing
       * but the slot registry this bundle already requires, and a missing switch would
       * silently take away the only user path to a loop. It is remounted with the page
       * when the locale face arrives, because that is what seats a live `t`.
       */
      let stopSwitch
      /** Whether a switch registration was attempted: the initial mount must happen once. */
      let switchMounted = false
      /** The `uiWorkspace` service once injected: the task panel opens child sessions with it. */
      let workspace
      /** Disposer of the current task-panel registration, if any. */
      let stopPanel
      /** The `uiConversation` + `sessions` faces once injected: the progress tab's data. */
      let progressServices
      /** Disposer of the current progress-tab registrations, if any. */
      let stopProgress
      /**
       * Whether every registration this bundle owns has been dropped.
       *
       * Set by {@link teardown} and read by {@link startPanel}: once a scope the bundle
       * depended on is gone, nothing may be mounted again. Cordis disposes a fiber's
       * nested scopes before their own disposers run, so a disposer that mounts is a
       * mount into a dying scope — the registrations land nowhere, `ctx.effect` never
       * runs, and the bundle keeps a stop function for an entry that does not exist.
       */
      let disposed = false
      /** Mount the task panel under the current locale binding (no-op without a workspace). */
      const startPanel = () => {
        if (disposed) return
        if (workspace === undefined) return
        stopPanel = mountPanel(ctx, workspace, i18n)
      }
      /** Drop the current panel registration and mount it again. */
      const restartPanel = () => {
        if (typeof stopPanel === 'function') stopPanel()
        stopPanel = undefined
        startPanel()
      }
      /**
       * Mount the progress tab under the current locale binding.
       *
       * It needs both faces: `uiConversation` owns the view/event registries and the
       * per-target snapshot, and `sessions` resolves a child session for the "open child"
       * action. Without them the tab is not registered, and `i18n.progress` says why the
       * settings page shows no third tab.
       */
      const startProgress = () => {
        if (disposed) return
        if (progressServices === undefined) return
        stopProgress = mountProgress(ctx, progressServices, i18n, i18n.progress, () => workspace)
      }
      /** Drop the current progress-tab registrations and mount them again. */
      const restartProgress = () => {
        if (typeof stopProgress === 'function') stopProgress()
        stopProgress = undefined
        startProgress()
      }
      /**
       * Mount the composer tool-row switches under the current locale binding.
       *
       * Three are mounted: the auto-continue loop switch, beside it the self-iterate
       * switch, and after them the workflow switch (`/grok on|off` in button form). Each
       * is remounted (rather than mounted once) for the same reason the page is: the
       * registration carries `locale: NS` only once a locale face exists, and that is
       * what makes the framework seat a `t` that repaints on a language switch.
       */
      const startSwitch = () => {
        if (disposed) return
        switchMounted = true
        stopSwitch = startComposerSwitches(ctx, i18n)
      }
      /** Drop the current switch registration and mount it again. */
      const restartSwitch = () => {
        if (typeof stopSwitch === 'function') stopSwitch()
        stopSwitch = undefined
        startSwitch()
      }
      /**
       * Drop every registration this bundle owns. Idempotent, and it never mounts.
       *
       * This is the `locale` scope's disposer *and* the plugin's own: both want the same
       * thing — the copy is back to English, the page and the panel are gone, nothing is
       * left registered. The difference that matters is what the old version did here: it
       * called `startPages` (and `restartPanel`) again, rebuilding page slots and an
       * `ctx.effect` from inside a disposer, in a scope the framework had already torn
       * down. Rebuilding there could not succeed; it could only leak a registration whose
       * disposer belonged to a dead fiber. So this function only ever takes away.
       *
       * Dropping the page is deliberate, not incidental: a slot left mounted while its
       * `locale: NS` dictionary registration is gone would be handed a `t` that answers
       * with key ids (`guardedTranslator` is the belt to this braces, this is the fix).
       * In the shipped web composition the locale face never leaves, so this path runs on
       * unload and on a locale-plugin reload, never mid-session.
       */
      const teardown = () => {
        if (disposed) return
        disposed = true
        i18n.locale = undefined
        i18n.t = translator(FALLBACK_LOCALE)
        if (typeof stop === 'function') stop()
        stop = () => {}
        if (typeof stopSwitch === 'function') stopSwitch()
        stopSwitch = undefined
        if (typeof stopPanel === 'function') stopPanel()
        stopPanel = undefined
        if (typeof stopProgress === 'function') stopProgress()
        stopProgress = undefined
        progressServices = undefined
        offerModeSessions(undefined)
        workspace = undefined
      }

      if (typeof ctx.inject === 'function') {
        ctx.inject(['locale'], (scope) => {
          const locale = scope.locale
          i18n.locale = locale
          i18n.t = typeof locale.bind === 'function' ? locale.bind(NS) : translator(activeLocale(locale))
          ctx.effect(() => locale.register(NS, { zh: ZH, en: EN }), 'grok-workflow: dictionaries')
          ctx.effect(() => locale.register(PANEL_NS, PANEL_DICT), 'grok-workflow: task panel dictionaries')
          // Remount so the slot carries `locale: NS`: the framework then seats a `t` the
          // renderer re-derives on every locale revision, and the page repaints in place.
          stop()
          stop = startPages(ctx, face, i18n)
          restartPanel()
          restartProgress()
          // Last, so the switch joins the list after the page and the panel: the slot is
          // additive, and the entries that existed before keep their positions.
          restartSwitch()
          return teardown
        })
        // `uiWorkspace` is optional and late for the same reason `locale` is: a required
        // injection would leave the plugin pending in a composition that has no workspace
        // service, and DSH reports a pending entry as a boot failure. Without it the task
        // panel is simply not registered and the stock renderer keeps the key.
        ctx.inject(['uiWorkspace'], (scope) => {
          workspace = scope.uiWorkspace
          startPanel()
          return () => {
            if (typeof stopPanel === 'function') stopPanel()
            stopPanel = undefined
            workspace = undefined
          }
        })
        // The progress tab's services are optional and late for exactly the same reason:
        // requiring them would make the whole bundle pending in a composition that has no
        // conversation service, and a missing third tab is a far smaller loss than a
        // plugin that never boots. `status.progressMissing` names the absence on the page.
        ctx.inject(['uiConversation', 'sessions'], (scope) => {
          progressServices = { uiConversation: scope.uiConversation, sessions: scope.sessions }
          // The workflow switch follows the same face for a different reason: it is how a
          // record `/grok off` wrote reaches an already-mounted button. Two readers of one
          // injection, so no second optional dependency is added to the graph.
          offerModeSessions(scope.sessions)
          // `conversation` is the tab's *optional* third face: it is the only way to write
          // the input box (§19.4), so it is asked for on its own fiber — inside the outer
          // one, like `uiWorkspace` — rather than added to the list above. Requiring it in
          // the outer list would leave the whole tab pending in a composition that has no
          // conversation service, and a missing draft face must cost the button, not the
          // page. The tab is remounted when it arrives or leaves, so the dock follows it.
          const stopConversation = scope.inject(['conversation'], (inner) => {
            progressServices = { ...progressServices, conversation: inner.conversation }
            restartProgress()
            return () => {
              if (progressServices !== undefined) {
                const rest = { ...progressServices }
                delete rest.conversation
                progressServices = rest
              }
              restartProgress()
            }
          })
          startProgress()
          return () => {
            if (typeof stopConversation === 'function') stopConversation()
            if (typeof stopProgress === 'function') stopProgress()
            stopProgress = undefined
            progressServices = undefined
            offerModeSessions(undefined)
            // The face that served the tab is gone: say so, so the page does not keep a
            // "mounted" claim about a tab nobody can open.
            i18n.progress.set('unmounted')
          }
        })
      } else {
        console.warn('[grok-workflow] this composition cannot inject services: the settings page keeps its English copy.')
      }
      // The switch needs no optional service, so it is mounted here — after the fiber-bound
      // entries — and stays mounted for the life of the plugin. `disposed` guards the one
      // case that matters: a disposer that runs before this line must not be followed by a
      // registration nobody can drop. When the locale fiber already mounted it (that path
      // runs first), `switchMounted` keeps this from registering a second copy.
      if (!switchMounted) startSwitch()
      return teardown
    }

    exports.apply = apply
    exports.inject = inject
    exports.NS = NS
    exports.GROK_WORKFLOW_FIELDS = FIELDS
    exports.GROK_WORKFLOW_READ_ONLY = READ_ONLY
    exports.GROK_WORKFLOW_ROLES = ROLES
    // T5: kept for the bundle shape; always empty since T4 (`switchOn` fixed).
    exports.GROK_WORKFLOW_SWITCHABLE_CLASSES = []
    exports.GROK_WORKFLOW_GROUPS = GROUPS
    exports.GROK_WORKFLOW_LOCALES = LOCALES
    exports.GROK_WORKFLOW_DICT = DICT
    // D-155: the removed-key list duplicated for the browser; `test/client.spec.ts`
    // pins it equal to `REMOVED_CONFIG_KEYS` item by item.
    exports.GROK_WORKFLOW_REMOVED_KEYS = REMOVED_KEYS
    exports.GROK_WORKFLOW_CHAIN_LIMIT = CHAIN_LIMIT
    exports.GROK_WORKFLOW_ROUTE_INFLIGHT_MIN = ROUTE_INFLIGHT_MIN
    exports.GROK_WORKFLOW_ROUTE_INFLIGHT_MAX = ROUTE_INFLIGHT_MAX
    /** Internals pinned by test/client.spec.ts (no runtime caller). */
    exports.GROK_WORKFLOW_INTERNALS = {
      validate, formatError, fieldLabel, opsFor, draftOf, resolveNamespace, translate, translator, activeLocale,
      comboWarn, emptyCapWarn, limitOverrunWarn, parseConfigNotices, refreshConfigNotices, configNotices,
      CONFIG_NOTICES_ROUTE_PATH, EnumField, ROLE_ORDER, UpdateCard,
      PLUGIN_VERSION, UPDATE_LATEST, UPDATE_COMMAND,
      // The upgrade card's route verbs, so `test/update-entry.spec.ts` drives the same
      // normalisation the button does instead of a copy of it.
      UPDATE_ROUTE_PATH, checkUpdate, installUpdate, isNewerVersion,
    }
    exports.GROK_WORKFLOW_UPDATE = {
      version: PLUGIN_VERSION,
      latest: UPDATE_LATEST,
      command: UPDATE_COMMAND,
      state: UPDATE_UP_TO_DATE ? 'latest' : 'newer',
    }
    /** Task panel: the `workflow-run` node renderer this bundle registers in place of the stock one. */
    exports.GROK_WORKFLOW_PANEL = {
      NS: PANEL_NS,
      DICT: PANEL_DICT,
      component: WorkflowRunPanel,
      mount: mountPanel,
      translate: panelTranslate,
      translator: panelTranslator,
      memberMode: panelMemberMode,
      openableKey: panelOpenableKey,
      openableMap: panelOpenableMap,
      runMode: panelRunMode,
      phaseSummary: panelPhaseSummary,
      statusKey: PANEL_STATUS_KEY,
    }
    /**
     * Progress tab: everything `test/client.spec.ts` pins, so the hand-written
     * JavaScript here and the typed rules in `src/progress-tab.ts` are compared rather
     * than assumed to agree.
     */
    exports.GROK_WORKFLOW_PROGRESS = {
      target: PROGRESS_TARGET,
      kind: PROGRESS_KIND,
      viewId: PROGRESS_VIEW_ID,
      viewOrder: PROGRESS_VIEW_ORDER,
      eventTypes: PROGRESS_EVENT_TYPES,
      detailEventType: PROGRESS_DETAIL_EVENT_TYPE,
      summaryFinalEventType: PROGRESS_SUMMARY_FINAL_EVENT_TYPE,
      summaryRejectedEventType: PROGRESS_SUMMARY_REJECTED_EVENT_TYPE,
      stages: PROGRESS_STAGES,
      detailFields: PROGRESS_DETAIL_FIELDS,
      chipKey: PROGRESS_CHIP_KEY,
      planKey: PROGRESS_PLAN_KEY,
      logStateKey: PROGRESS_LOG_STATE_KEY,
      logRoleKey: PROGRESS_LOG_ROLE_KEY,
      css: PROGRESS_CSS,
      component: ProgressView,
      eventDefinition: progressEventDefinition,
      viewDefinition: progressViewDefinition,
      Builder: ProgressSnapshotBuilder,
      mount: mountProgress,
      fold: foldProgressEvents,
      selectActiveRun,
      nodeState: progressNodeState,
      recoveredFailures: progressRecoveredFailures,
      currentFailureCount: progressCurrentFailureCount,
      percent: progressPercent,
      deriveTrack: deriveProgressTrack,
      deriveProgressFlow,
      derivePanelGraph,
      panelMermaid,
      parsePanelMermaid,
      layoutPanelGraph,
      revealSheet: progressPanelReveal,
      detailFor: progressDetailFor,
      detailSources: progressDetailSources,
      detailField: progressDetailField,
      parseCoordination: parseProgressCoordination,
      createStatus: createProgressStatus,
    }
    /**
     * Exports.GROK_WORKFLOW_LOOP points into {@link LOOP_SWITCH}; the bundle object is
     * the same shape the factory returns, so the tests drive exactly what mounts.
     */
    exports.GROK_WORKFLOW_LOOP = LOOP_SWITCH
    /**
     * Composer-tool-row self-iteration switch: the browser half of the iterate route.
     * Pinned by `test/client.spec.ts` against `ITERATE_ROUTE_PATH` in `src/loop.ts`
     * and against the identity separation in `test/iterate.spec.ts`, so the two
     * switches cannot drift into sharing a slot.
     */
    exports.GROK_WORKFLOW_ITERATE = ITERATE_SWITCH
    /**
     * Composer-tool-row workflow switch: `/grok on|off` as a button. Pinned by
     * `test/client.spec.ts` against the mode route's path, action list and answer
     * shape, so the button and the slash command cannot drift into two switches.
     */
    exports.GROK_WORKFLOW_MODE = MODE_SWITCH
    return module.exports
  },
})
