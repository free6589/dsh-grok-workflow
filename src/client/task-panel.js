    // ─── Chat task panel: the `workflow-run` node, re-registered ────────────────
    //
    // The chat task list is not drawn by this plugin. It is the stock `workflow-run`
    // chat node of `@deepseek-ai/dsh-client-ui-workflow-run`, folding the
    // `plugin:grok-workflow/progress/*` records this plugin writes. That renderer makes a member row
    // openable only while the member is *running*: its `navigableMembers()` requires
    // `member.status === 'running'` together with a live child session, so every
    // finished row — the planner row `规划助手已完成`, a task's `执行` / `检查` rows —
    // rendered as inert text and could not be opened at all.
    //
    // The `conversation.chat.node` slot is keyed by `ChatNodeKind`, and its declared
    // contract is "reusing a key replaces that node renderer"
    // (`@deepseek-ai/dsh-client-ui-chat`, `lib/types/client/contract/slots.d.ts`,
    // `'conversation.chat.node'`). The runtime implements that replacement by
    // priority shadowing: a keyed slot throws on the same key *at the same*
    // priority, and "lowest renders" — the first entry of the slot's
    // priority-sorted entries wins the key (`SlotCore.register`'s duplicate
    // check plus `entriesOfSlot`'s per-key dedupe, `dsh-cordis-client-runner` /
    // the served web bundle). The stock renderer registers without a priority
    // (`priority ?? 0`), so this bundle re-registers the `workflow-run` key at
    // `priority: -1`: both registrations succeed, the stock renderer stays
    // live-but-shadowed (and resumes on plugin unload), and no client plugin
    // fails its boot fiber. Measured before the priority was added: the second
    // registrant's whole plugin failed with "web boot: 1 entry did not
    // activate / @deepseek-ai/dsh-client-ui-workflow-run: failed".
    //
    // The re-registered renderer keeps the same projection and the same wording,
    // with one deliberate difference: a member row is a link whenever its child
    // session can be opened — running, completed, failed, cancelled or
    // interrupted — because a finished subtask is exactly the one a reader wants
    // to inspect.
    //
    // Nothing about status is invented here. The rows still come from the stock
    // projection (`node.data`), whose member status is folded from the engine's own
    // `agent-start`/`agent-end` events; only the *decision to open* stopped depending
    // on liveness. A row whose child session cannot be resolved stays inert text rather
    // than opening the wrong session.
    //
    // Costs, stated rather than hidden: the plugin now owns the look of every
    // `workflow-run` node in this composition (including runs that are not its own),
    // and the stock disclosure's focus-deferral is simplified to open/collapse.
    const PANEL_NS = 'grok-workflow-panel'

    /** Panel copy. Same words the stock dictionary uses, in both shipped languages. */
    const PANEL_DICT = {
      zh: {
        'run.members.one': '{count} 个成员',
        'run.members.other': '{count} 个成员',
        'run.empty': '没有启动成员',
        'phase.unassigned': '未分阶段',
        'phase.empty': '空阶段名',
        'status.running': '运行中',
        'status.completed': '已完成',
        'status.failed': '未通过',
        'status.cancelled': '已取消',
        'status.interrupted': '已中断',
        // A status outside the five above is one this panel does not word: it says so
        // rather than printing the engine's own token in the middle of the sentence.
        'status.unknown': '状态未知',
        'statusCount.running': '运行中 {count}',
        'statusCount.completed': '已完成 {count}',
        'statusCount.failed': '未通过 {count}',
        'statusCount.cancelled': '已取消 {count}',
        'statusCount.interrupted': '已中断 {count}',
        'statusCount.unknown': '状态未知 {count}',
        'member.empty': '空成员名',
        'member.open': '打开 {name}',
      },
      en: {
        'run.members.one': '{count} member',
        'run.members.other': '{count} members',
        'run.empty': 'No members started',
        'phase.unassigned': 'Unassigned',
        'phase.empty': 'Empty phase',
        'status.running': 'Running',
        'status.completed': 'Completed',
        'status.failed': 'Not passed',
        'status.cancelled': 'Cancelled',
        'status.interrupted': 'Interrupted',
        // A status outside the five above is one this panel does not word; it says so
        // instead of printing the engine's own token in the middle of the sentence.
        'status.unknown': 'Unknown',
        'statusCount.running': 'Running {count}',
        'statusCount.completed': 'Completed {count}',
        'statusCount.failed': 'Not passed {count}',
        'statusCount.cancelled': 'Cancelled {count}',
        'statusCount.interrupted': 'Interrupted {count}',
        'statusCount.unknown': 'Unknown {count}',
        'member.empty': 'Empty member name',
        'member.open': 'Open {name}',
      },
    }

    /**
     * Dictionary key per status the stock fold can emit, plus the one it never does.
     *
     * `unknown` is the fallback for a status this bundle does not word — a stock fold
     * that grew a sixth state, or a session written by a newer engine. It resolves to
     * copy (`状态未知` / `Unknown`), never to the engine's own token: a reader gets a
     * sentence, not `queued`.
     */
    const PANEL_STATUS_KEY = {
      running: 'status.running',
      completed: 'status.completed',
      failed: 'status.failed',
      cancelled: 'status.cancelled',
      interrupted: 'status.interrupted',
      unknown: 'status.unknown',
    }

    /** Dictionary key for a status the fold did not word (see {@link PANEL_STATUS_KEY}). */
    const PANEL_UNKNOWN_STATUS = 'unknown'

    /**
     * The wording for one status, including the one no dictionary carries.
     * @param status - the stock fold's member/run status.
     * @param t - translator (the guard already keeps a bare key off the screen).
     * @returns the status word.
     */
    function panelStatusText(status, t) {
      return t(PANEL_STATUS_KEY[status] === undefined ? PANEL_STATUS_KEY[PANEL_UNKNOWN_STATUS] : PANEL_STATUS_KEY[status])
    }

    /**
     * Dot colour per status, through the same design tokens the settings page uses.
     *
     * The stock component colours these five with the primitives `StateDot`
     * (`running → ongoing`, `completed → done`, `failed → error`, `cancelled`/
     * `interrupted → warning`), which is the same five-token palette reached from the
     * other side; an unrecognized status takes the idle token rather than a hard-coded
     * grey, so a theme switch moves it too.
     */
    const PANEL_STATUS_COLOR = {
      running: STATUS_COLOR.doing,
      completed: STATUS_COLOR.done,
      // Amber, not red: the progress page's own rule (§19.2) is that red is not a word
      // this plugin uses for a task that did not pass, and the chat card speaks the same
      // vocabulary as the tab it summarizes.
      failed: STATUS_COLOR.blocked,
      cancelled: STATUS_COLOR.blocked,
      interrupted: STATUS_COLOR.blocked,
    }

    /** The dot colour for one status; an unknown status is the idle/pending state. */
    function panelStatusColor(status) {
      return PANEL_STATUS_COLOR[status] === undefined ? STATUS_COLOR.pending : PANEL_STATUS_COLOR[status]
    }

    /**
     * Translate one panel key, walking the requested locale then `en`.
     * @param locale - locale id such as `zh` or `en`.
     * @param key - dictionary key.
     * @param params - optional `{name}` substitutions.
     * @returns the translated string, or `key` when untranslated.
     */
    function panelTranslate(locale, key, params) {
      let template
      for (const id of [locale, FALLBACK_LOCALE]) {
        const dict = PANEL_DICT[id]
        if (dict !== undefined && dict[key] !== undefined) {
          template = dict[key]
          break
        }
      }
      if (template === undefined) return key
      if (params === undefined) return template
      const safePanelParams = params !== null && typeof params === 'object' ? params : {}
      return template.replace(/\{(\w+)\}/g, (match, name) => (name in safePanelParams ? String(safePanelParams[name]) : match))
    }

    /** Bind one locale id into a `t(key, params)` function for the panel. */
    function panelTranslator(locale) {
      return (key, params) => panelTranslate(locale, key, params)
    }

    /** Whether a status is the run's own kind of bad news (drives the disclosure mode). */
    function panelAbnormal(status) {
      return status === 'failed' || status === 'cancelled' || status === 'interrupted'
    }

    /** Fold one run's statuses into the disclosure mode `abnormal` | `running` | `clean`. */
    function panelRunMode(data) {
      if (panelAbnormal(data.status)) return 'abnormal'
      if (data.status === 'running') return 'running'
      const members = []
      for (const phase of data.phases) for (const member of phase.members) members.push(member.status)
      if (members.some(panelAbnormal)) return 'abnormal'
      return members.includes('running') ? 'running' : 'clean'
    }

    /**
     * The navigation mode one member row may use, or `undefined` when it must stay inert.
     *
     * This is the whole fix in one function: the stock renderer additionally required the
     * member to be `running`, which is why a finished row had no link. What a row really
     * needs in order to be openable is a child session that belongs to *this* run's
     * parent and a known subagent mode to open it with — both of which survive the
     * member's completion. Nothing here reads the member's status.
     * @param child - the child session record from the sessions projection, if any.
     * @param identity - `projectionsBySession[childId].values.subagent`, if projected.
     * @param parentSessionId - the session that owns this workflow run.
     * @returns `'continuable'`, `'one-shot'`, or `undefined` for an inert row.
     */
    function panelMemberMode(child, identity, parentSessionId) {
      if (child === undefined || child === null || typeof child !== 'object') return undefined
      if (typeof parentSessionId === 'string' && child.parentId !== parentSessionId) return undefined
      if (identity === undefined || identity === null || typeof identity !== 'object') return undefined
      const mode = identity.mode
      // `external` children belong to another owner and cannot be opened from here; an
      // unknown mode would open a session the UI cannot resume, so it stays inert too.
      if (mode !== 'continuable' && mode !== 'one-shot') return undefined
      return mode
    }

    /**
     * Encode the openable member rows of one run as a single stable string.
     *
     * The slot's session store hook compares its selector result by identity, so the
     * selector returns a primitive: two renders of the same sessions produce the same
     * string, and a changed string is the only thing that re-renders the panel.
     * @param sessions - `{ byId, projectionsBySession }` from the sessions projection.
     * @param phases - the run's projected phases.
     * @param parentSessionId - the session that owns this workflow run.
     * @returns `childId=mode` entries joined by a separator; `''` when nothing is openable.
     */
    function panelOpenableKey(sessions, phases, parentSessionId) {
      const byId = sessions !== undefined && sessions !== null && sessions.byId !== undefined ? sessions.byId : {}
      const projections = sessions !== undefined && sessions !== null && sessions.projectionsBySession !== undefined
        ? sessions.projectionsBySession
        : {}
      const parts = []
      for (const phase of phases) {
        for (const member of phase.members) {
          const projection = projections[member.childId]
          const identity = projection === undefined || projection === null || projection.values === undefined
            ? undefined
            : projection.values.subagent
          const mode = panelMemberMode(byId[member.childId], identity, parentSessionId)
          if (mode !== undefined) parts.push(`${member.childId}=${mode}`)
        }
      }
      return parts.join('\u0000')
    }

    /** Decode {@link panelOpenableKey} into a `childId -> mode` map. */
    function panelOpenableMap(key) {
      const map = new Map()
      if (typeof key !== 'string' || key === '') return map
      for (const part of key.split('\u0000')) {
        const at = part.lastIndexOf('=')
        if (at > 0) map.set(part.slice(0, at), part.slice(at + 1))
      }
      return map
    }

    /** `已完成 2 · 运行中 1` for one phase header, in the reader's language. */
    function panelPhaseSummary(members, t) {
      const counts = new Map()
      for (const member of members) {
        const status = PANEL_STATUS_KEY[member.status] === undefined ? PANEL_UNKNOWN_STATUS : member.status
        counts.set(status, (counts.get(status) ?? 0) + 1)
      }
      const count = (status) => counts.get(status) ?? 0
      const active = ['running', 'failed', 'cancelled', 'interrupted', PANEL_UNKNOWN_STATUS].filter((status) => count(status) > 0)
      if (active.length === 0) return t('statusCount.completed', { count: count('completed') })
      const ordered = active.includes('interrupted') && count('completed') > 0 ? ['completed', ...active] : active
      return ordered.map((status) => t(`statusCount.${status}`, { count: count(status) })).join(' · ')
    }

    /** Inline styles for the panel: the stock CSS module is not reachable from here. */
    const panelStyles = {
      root: { width: '100%', minWidth: 0 },
      header: {
        boxSizing: 'border-box', width: '100%', height: '32px', display: 'flex', alignItems: 'center',
        gap: '6px', padding: '0 8px', border: 0, borderRadius: '8px', background: 'transparent',
        color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer',
      },
      chevron: { width: '16px', flex: 'none', textAlign: 'center', fontSize: '11px', opacity: 0.7 },
      runTitle: { maxWidth: '42%', fontSize: '13px', fontWeight: 510, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
      separator: { width: '2px', height: '2px', borderRadius: '50%', background: 'currentColor', opacity: 0.5, flex: 'none' },
      runSummary: { minWidth: 0, flex: 1, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
      statusTail: { height: '20px', flex: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 510 },
      // `min()` is the only width-dependent value available to an inline style: it keeps
      // the stock 16px indent and the stock 132px/64px status columns on a normal window
      // and lets them shrink instead of overflowing one (the stock CSS module does the
      // same at <=560px, which a stylesheet can express and an inline style cannot).
      phaseList: { display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0, padding: '4px 0 0 min(16px, 4vw)' },
      phase: { minWidth: 0 },
      phaseHeader: {
        boxSizing: 'border-box', width: '100%', height: '32px', display: 'flex', alignItems: 'center',
        gap: '6px', padding: 0, border: 0, borderRadius: '8px', background: 'transparent',
        color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer',
      },
      phaseTitle: { minWidth: 0, maxWidth: '42%', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
      phaseCount: { minWidth: 0, flex: 1, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
      phaseStatus: { width: 'min(132px, 38vw)', flex: 'none', textAlign: 'right', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
      members: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, padding: '0 0 0 min(16px, 4vw)' },
      memberRow: {
        width: '100%', minWidth: 0, minHeight: '24px', display: 'flex', alignItems: 'center',
        gap: '12px', padding: 0, border: 0, background: 'transparent', color: 'inherit', font: 'inherit',
        textAlign: 'left', opacity: 0.85,
      },
      memberButton: {
        width: '100%', minWidth: 0, minHeight: '24px', display: 'flex', alignItems: 'center',
        gap: '12px', padding: 0, border: 0, borderRadius: '6px', background: 'transparent',
        color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer',
      },
      dotSlot: { width: '16px', flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
      dot: { width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block' },
      memberLabel: { minWidth: 0, flex: 1, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
      memberLabelLink: {
        minWidth: 0, flex: 1, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        color: 'var(--dsw-alias-link, #2f6fed)', fontWeight: 500, textDecoration: 'underline', textUnderlineOffset: '3px',
      },
      memberStatus: { width: 'min(64px, 20vw)', flex: 'none', textAlign: 'right', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.85 },
      empty: { fontSize: '13px', opacity: 0.7, padding: 0 },
    }

    /**
     * One member row: a link whenever its child session can be opened, text otherwise.
     * @param member - projected member (`seq`, `label`, `childId`, `status`).
     * @param mode - navigation mode from {@link panelOpenableMap}, or `undefined`.
     * @param sessionId - the session that owns this run.
     * @param openSession - the slot's navigation face.
     * @param t - translator.
     * @returns the row element.
     */
    function PanelMemberRow(member, mode, sessionId, openSession, t) {
      const name = member.label === '' || member.label === undefined ? t('member.empty') : member.label
      const statusText = panelStatusText(member.status, t)
      const content = [
        h('span', { key: 'dot', style: panelStyles.dotSlot },
          h('span', { style: { ...panelStyles.dot, background: panelStatusColor(member.status) } })),
        h('span', {
          key: 'label',
          style: mode === undefined ? panelStyles.memberLabel : panelStyles.memberLabelLink,
          'data-member-label': true,
        }, name),
        h('span', { key: 'status', style: panelStyles.memberStatus, 'data-member-status-text': true }, statusText),
      ]
      if (mode === undefined) {
        return h('div', {
          key: member.seq,
          style: panelStyles.memberRow,
          'data-member-status': member.status,
          'data-member-openable': 'false',
        }, content)
      }
      return h('button', {
        key: member.seq,
        type: 'button',
        style: panelStyles.memberButton,
        'data-member-status': member.status,
        'data-member-openable': 'true',
        'aria-label': t('member.open', { name }),
        onClick: () => openSession({ parentSessionId: sessionId, childSessionId: member.childId, mode }),
      }, content)
    }

    /**
     * The chat task list for one workflow run.
     *
     * Same props the stock renderer takes (`node`, `sessionId`, `useSessions`,
     * `openSession`, `t`), so replacing the key needs no change on the Host side.
     * @param props - keyed Chat node props plus the injected `openSession` face.
     * @returns the run's section element.
     */
    function WorkflowRunPanel(props) {
      const data = props.node.data
      // `props.t` is the framework seat for namespace `grok-workflow-panel`; `panelT` is
      // this bundle's own translator for the same keys, injected by `mountPanel`. The seat
      // wins, and the guard keeps the one failure mode the seat has — answering with the
      // key itself when its dictionary is not registered — off the screen.
      const t = guardedTranslator(props.t, props.panelT)
      // A primitive selector result: the store compares by identity, and a fresh Map on
      // every notification would re-render (and warn) instead of settling.
      const openKey = props.useSessions((sessions) => panelOpenableKey(sessions, data.phases, props.sessionId))
      const navigable = useMemo(() => panelOpenableMap(openKey), [openKey])
      // A run that is still moving is open; a run read back from an old session starts
      // collapsed. Once open it stays open — collapsing a run at the moment it finishes is
      // exactly when the reader wants to click a finished row.
      const [open, setOpen] = useState(() => panelRunMode(data) !== 'clean')
      const [collapsed, setCollapsed] = useState(() => new Set())
      const total = data.phases.reduce((count, phase) => count + phase.members.length, 0)
      const togglePhase = (key) => setCollapsed((current) => {
        const next = new Set(current)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
      const phaseSection = (phase) => {
        const phaseOpen = !collapsed.has(phase.key)
        const title = phase.phase === null ? t('phase.unassigned') : (phase.phase === '' ? t('phase.empty') : phase.phase)
        return h('div', { key: phase.key, style: panelStyles.phase },
          h('button', {
            type: 'button',
            style: panelStyles.phaseHeader,
            'data-phase-toggle': true,
            'aria-expanded': phaseOpen,
            onClick: () => togglePhase(phase.key),
          },
          h('span', { style: panelStyles.chevron }, phaseOpen ? '▾' : '▸'),
          h('span', { style: panelStyles.phaseTitle, 'data-phase-title': true }, title),
          h('span', { style: panelStyles.separator }),
          h('span', { style: panelStyles.phaseCount, 'data-phase-count': true },
            t(phase.members.length === 1 ? 'run.members.one' : 'run.members.other', { count: phase.members.length })),
          h('span', { style: panelStyles.phaseStatus, 'data-phase-status-text': true }, panelPhaseSummary(phase.members, t))),
          phaseOpen
            ? h('div', { style: panelStyles.members },
              phase.members.map((member) => PanelMemberRow(member, navigable.get(member.childId), props.sessionId, props.openSession, t)))
            : null)
      }
      return h('section', {
        style: panelStyles.root,
        'data-workflow-run': true,
        'data-run-status': data.status,
        'data-grok-workflow-panel': true,
      },
      h('button', {
        type: 'button',
        style: panelStyles.header,
        'data-run-toggle': true,
        'aria-expanded': open,
        onClick: () => setOpen(!open),
      },
      h('span', { style: panelStyles.chevron }, open ? '▾' : '▸'),
      h('span', { style: panelStyles.runTitle, 'data-run-title': true }, data.name),
      h('span', { style: panelStyles.separator }),
      h('span', { style: panelStyles.runSummary, 'data-run-summary': true },
        t(total === 1 ? 'run.members.one' : 'run.members.other', { count: total })),
      h('span', { style: panelStyles.statusTail, 'data-run-status-text': true },
        h('span', { style: { ...panelStyles.dot, background: panelStatusColor(data.status) } }),
        h('span', { style: { marginLeft: '4px' } },
          panelStatusText(data.status, t)))),
      open
        ? h('div', { style: panelStyles.phaseList },
          data.phases.length === 0
            ? h('span', { style: panelStyles.empty }, t('run.empty'))
            : data.phases.map(phaseSection))
        : null)
    }

    /**
     * Register the panel renderer for the stock `workflow-run` chat node.
     *
     * `conversation.chat.node` is keyed by node kind; a reused key replaces that
     * renderer through priority shadowing, so this registration carries
     * `priority: -1` — below the stock renderer's default 0 — and is the whole
     * integration: no Host change, no fork of the stock plugin, and the stock
     * renderer's own registration still succeeds (it stays live but shadowed).
     * The registration carries `locale: PANEL_NS` only when the composition
     * really installs a locale face (an entry naming a namespace without one throws
     * `SlotAssemblyError`); otherwise the renderer reads the injected `panelT` fallback.
     * @param ctx - the browser plugin context.
     * @param workspace - the `uiWorkspace` service (source of `openSession`).
     * @param i18n - live locale binding.
     * @returns a disposer, or `undefined` when the registration was refused.
     */
    function mountPanel(ctx, workspace, i18n) {
      const options = {
        name: 'conversation.chat.node',
        key: 'workflow-run',
        priority: -1,
        inject: () => ({
          openSession: (target) => { workspace.openSession(target) },
          panelT: i18n.t,
        }),
      }
      if (i18n.locale !== undefined) options.locale = PANEL_NS
      try {
        return ctx.slots.inject('conversation.chat.node', () => ctx.slots.register(options, WorkflowRunPanel))
      } catch (error) {
        // A composition that keeps the stock renderer must still get its settings page:
        // the panel is a fix for a link, not a precondition for the plugin.
        console.warn(`[grok-workflow] the workflow-run task panel could not be registered (${error && error.message ? error.message : error}); the stock panel stays in place and finished rows keep their stock behaviour.`)
        return undefined
      }
    }

