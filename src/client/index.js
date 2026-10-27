// Browser half of dsh-grok-workflow: the Settings → Plugins → "Grok workflow" page.
//
// Why this file exists at all (measured, t32): the Host serves this plugin's settings
// namespace (`settings/describe` → ns "grok-workflow", autoGenerate: true, 17 volatile
// fields) but the stock web client renders *no* page for a namespace on its own. Every
// feature ships a client bundle that registers a `plugins.item` tab and is kept alive by
// `configForms.whileServed([ns])`, so without one the plugin is invisible in the GUI
// (this was NR-7). The file is a browser module in the host's `__ModuleLoader__` format:
// plain ESM would load without registering and be rejected.
window.__ModuleLoader__.load({
  id: 'dsh-grok-workflow',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useMemo, useSyncExternalStore } = React

    const NS = 'grok-workflow'

    // The Host projects only the volatile fields into its settings form, so these four
    // structural keys are shown read-only: they decide whether the plugin and the gate
    // exist at all, and are edited in the profile patch, not in a live form.
    const READ_ONLY = ['toolName', 'enforceGate', 'gateRequired', 'configVersion']

    const FIELDS = [
      { key: 'gateScope', group: 'gate', kind: 'enum', options: ['process', 'preset'], def: 'process' },
      { key: 'gatePreset', group: 'gate', kind: 'text', def: '' },
      { key: 'answerStrategy', group: 'gate', kind: 'enum', options: ['in-turn', 'relay', 'append'], def: 'in-turn' },
      { key: 'historyTurns', group: 'limits', kind: 'number', min: 0, max: 20, def: 4 },
      { key: 'historyChars', group: 'limits', kind: 'number', min: 0, max: 8000, def: 4000 },
      { key: 'maxQueuedMessages', group: 'limits', kind: 'number', min: 0, max: 8, def: 4 },
      { key: 'maxConcurrency', group: 'limits', kind: 'number', min: 1, max: 6, def: 3 },
      { key: 'maxRetries', group: 'limits', kind: 'number', min: 0, max: 3, def: 1 },
      { key: 'maxTasks', group: 'limits', kind: 'number', min: 1, max: 12, def: 6 },
      { key: 'timeoutMs', group: 'limits', kind: 'number', min: 1000, max: 86400000, def: 1800000 },
      { key: 'maxActiveRuns', group: 'limits', kind: 'number', min: 1, max: 4, def: 2 },
      { key: 'subagentProvider', group: 'limits', kind: 'text', def: '' },
      { key: 'synthesis', group: 'output', kind: 'enum', options: ['deterministic', 'model'], def: 'deterministic' },
      { key: 'switchOn', group: 'output', kind: 'classes', def: [] },
      { key: 'recordRuns', group: 'output', kind: 'boolean', def: true },
      { key: 'recordLimit', group: 'output', kind: 'number', min: 0, max: 256, def: 64 },
    ]

    // Mirrors SWITCHABLE_CLASSES in src/config.ts; test/client.spec.ts pins the parity.
    const SWITCHABLE_CLASSES = [
      'rate-limit', 'server-error', 'connection', 'timeout',
      'model-unavailable', 'format-error', 'agent-start-failed',
    ]
    const ROLES = ['planner', 'worker', 'verifier', 'synthesizer']

    // The four structural keys never reach the settings document, so the page cannot read
    // their live values; it names their defaults instead of printing `undefined`.
    const READ_ONLY_VALUES = {
      toolName: 'grok_workflow（注册即固定 / fixed at registration）',
      enforceGate: 'true（默认，profile patch 可改 / default, patch-editable）',
      gateRequired: 'false（默认，profile patch 可改 / default, patch-editable）',
      configVersion: '1（wire 契约 / wire contract）',
    }
    const CHAIN_LIMIT = 3

    const GROUPS = [
      { id: 'gate', title: '入口与门禁 / Gate' },
      { id: 'limits', title: '上下文与并发 / Context and concurrency' },
      { id: 'roles', title: '按角色模型链 / Per-role model chains' },
      { id: 'output', title: '综合、切换与记录 / Synthesis, switching, records' },
      { id: 'structural', title: '结构性字段（只读）/ Structural fields (read-only)' },
    ]

    const emptyRoles = () => ({ planner: [], worker: [], verifier: [], synthesizer: [] })
    const clone = (value) => JSON.parse(JSON.stringify(value === undefined ? null : value))
    const draftOf = (value) => {
      const out = { roles: emptyRoles() }
      for (const field of FIELDS) {
        const current = value === undefined ? undefined : value[field.key]
        out[field.key] = current === undefined ? clone(field.def) : clone(current)
      }
      if (value !== undefined && value.roles !== undefined) out.roles = clone(value.roles)
      for (const role of ROLES) if (!Array.isArray(out.roles[role])) out.roles[role] = []
      return out
    }

    /** Client-side checks the Host would otherwise only report as a refused write. */
    const validate = (draft) => {
      const errors = []
      for (const field of FIELDS) {
        if (field.kind !== 'number') continue
        const raw = draft[field.key]
        if (!Number.isSafeInteger(raw) || raw < field.min || raw > field.max) {
          errors.push(`${field.key} 必须是 ${field.min} 到 ${field.max} 之间的整数`)
        }
      }
      if (draft.gateScope === 'preset' && String(draft.gatePreset || '').trim() === '') {
        errors.push('gateScope=preset 时必须填写 gatePreset')
      }
      for (const role of ROLES) {
        const chain = draft.roles[role] || []
        if (chain.length > CHAIN_LIMIT) errors.push(`${role} 备用链最多 ${CHAIN_LIMIT} 条`)
        const seen = new Set()
        chain.forEach((route, index) => {
          const model = String((route && route.model) || '').trim()
          const provider = String((route && route.provider) || '').trim()
          if (model === '') errors.push(`${role} 第 ${index + 1} 条缺少 model`)
          if (model.length > 120 || provider.length > 120) errors.push(`${role} 第 ${index + 1} 条的 provider/model 超过 120 字符`)
          // Two blank routes are not duplicates: they are two unfinished rows.
          const key = `${provider}::${model}`
          if (model !== '' && seen.has(key)) errors.push(`${role} 第 ${index + 1} 条与前面的路由重复`)
          if (model !== '') seen.add(key)
        })
      }
      for (const entry of draft.switchOn || []) {
        if (!SWITCHABLE_CLASSES.includes(entry)) errors.push(`switchOn 不认识 ${entry}`)
      }
      return errors
    }

    const opsFor = (draft, value) => {
      const ops = []
      for (const field of FIELDS) {
        const before = value === undefined ? undefined : value[field.key]
        if (JSON.stringify(before) === JSON.stringify(draft[field.key])) continue
        ops.push({ op: 'set', path: [field.key], value: draft[field.key] })
      }
      for (const role of ROLES) {
        const before = value && value.roles ? value.roles[role] : undefined
        if (JSON.stringify(before || []) === JSON.stringify(draft.roles[role] || [])) continue
        ops.push({ op: 'set', path: ['roles', role], value: draft.roles[role] })
      }
      return ops
    }

    const styles = {
      page: { display: 'flex', flexDirection: 'column', gap: '20px', padding: '4px 2px 24px', fontSize: '13px', lineHeight: 1.5 },
      section: { display: 'flex', flexDirection: 'column', gap: '10px' },
      heading: { fontSize: '13px', fontWeight: 600, margin: 0 },
      row: { display: 'grid', gridTemplateColumns: 'minmax(180px, 240px) 1fr', gap: '12px', alignItems: 'center' },
      label: { display: 'flex', flexDirection: 'column', gap: '2px' },
      hint: { opacity: 0.65, fontSize: '11px' },
      input: { width: '100%', padding: '5px 8px', borderRadius: '6px', border: '1px solid rgba(128,128,128,0.45)', background: 'transparent', color: 'inherit', font: 'inherit' },
      narrow: { maxWidth: '160px' },
      chain: { display: 'flex', flexDirection: 'column', gap: '6px', borderLeft: '2px solid rgba(128,128,128,0.25)', paddingLeft: '10px' },
      route: { display: 'flex', gap: '6px', alignItems: 'center' },
      button: { padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(128,128,128,0.45)', background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit' },
      primary: { padding: '5px 14px', borderRadius: '6px', border: '1px solid transparent', background: '#3b6ef6', color: '#fff', cursor: 'pointer', font: 'inherit' },
      footer: { display: 'flex', gap: '8px', alignItems: 'center', position: 'sticky', bottom: 0, padding: '10px 0', background: 'var(--dsh-settings-footer-bg, transparent)' },
      error: { color: '#e5484d' },
      ok: { color: '#2f9e44' },
      mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '12px' },
    }

    /**
     * Read one namespace out of the settings mirror.
     *
     * The Host serves two faces of the same document: `configForms.describe()` is the
     * subscribable mirror every settings surface derives from, and
     * `configForms.get(ns)` is that namespace's write queue (`{ state, mutate }`). The
     * page reads the mirror (so a Host invalidation repaints it) and writes through the
     * queue (so writes are ordered, revision-fenced and recovered by the settings owner
     * rather than by this bundle).
     */
    /**
     * Locate this plugin's settings namespace in the Host mirror.
     *
     * The namespace name is the Loader row id: `grok-workflow` in the shipped
     * composition, but *whatever the profile patch calls the row*. A renamed row
     * moves the namespace, and a page bound to the literal string would silently
     * vanish (t34 residual risk). Identification is therefore layered like the
     * Host's own: the shipped id first, then the projected value — `roles` and
     * `switchOn` are volatile and together specific enough to be this plugin.
     * @param view - the mirror's namespace view, when the Host published one.
     * @param defaultNs - the shipped namespace id.
     * @returns the namespace to bind to and how it was found.
     */
    function resolveNamespace(view, defaultNs) {
      const namespaces = view === undefined || view.namespaces === undefined ? [] : view.namespaces
      const byId = namespaces.find((item) => item.ns === defaultNs)
      if (byId !== undefined) return { ns: defaultNs, how: 'id' }
      const distinctive = ['roles', 'switchOn']
      const byValue = namespaces.find((item) => {
        const value = item.value !== undefined && item.value !== null ? item.value : {}
        return distinctive.every((key) => key in value)
      })
      if (byValue !== undefined) return { ns: byValue.ns, how: 'value' }
      return { ns: defaultNs, how: view === undefined ? 'default' : 'missing' }
    }

    function useNamespace(face, defaultNs) {
      const snapshot = useSyncExternalStore(
        (listener) => face.subscribe(listener),
        () => face.getSnapshot(),
        () => face.getSnapshot(),
      )
      const view = snapshot.view
      const resolved = resolveNamespace(view, defaultNs)
      const entry = view === undefined ? undefined : view.namespaces.find((candidate) => candidate.ns === resolved.ns)
      return {
        status: entry === undefined ? (snapshot.status === 'ready' ? 'unavailable' : 'loading') : 'ready',
        entry,
        error: snapshot.error,
        ns: resolved.ns,
        how: resolved.how,
      }
    }

    function ScalarField(props) {
      const { field, draft, disabled, onChange } = props
      const value = draft[field.key]
      if (field.kind === 'boolean') {
        return h('input', {
          type: 'checkbox', checked: value === true, disabled,
          onChange: (event) => onChange(field.key, event.target.checked),
          'data-field': field.key,
        })
      }
      if (field.kind === 'enum') {
        return h('select', {
          style: { ...styles.input, ...styles.narrow }, value: String(value), disabled,
          onChange: (event) => onChange(field.key, event.target.value),
          'data-field': field.key,
        }, field.options.map((option) => h('option', { key: option, value: option }, option)))
      }
      if (field.kind === 'number') {
        return h('input', {
          type: 'number', style: { ...styles.input, ...styles.narrow }, value: String(value), disabled,
          min: field.min, max: field.max, step: 1,
          onChange: (event) => onChange(field.key, event.target.value === '' ? '' : Number(event.target.value)),
          'data-field': field.key,
        })
      }
      return h('input', {
        type: 'text', style: styles.input, value: String(value), disabled,
        onChange: (event) => onChange(field.key, event.target.value),
        'data-field': field.key,
      })
    }

    function ClassPicker(props) {
      const selected = new Set(props.value || [])
      return h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '10px' } },
        SWITCHABLE_CLASSES.map((name) => h('label', { key: name, style: { display: 'flex', gap: '4px', alignItems: 'center' } },
          h('input', {
            type: 'checkbox', checked: selected.has(name), disabled: props.disabled,
            'data-switch-class': name,
            onChange: () => {
              const next = new Set(selected)
              if (next.has(name)) next.delete(name)
              else next.add(name)
              props.onChange(SWITCHABLE_CLASSES.filter((entry) => next.has(entry)))
            },
          }),
          h('span', null, name))))
    }

    function RoleChain(props) {
      const { role, chain, disabled, onChange } = props
      const update = (index, patch) => {
        const next = chain.map((route, position) => (position === index ? { ...route, ...patch } : route))
        onChange(next)
      }
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
          h('strong', { style: { minWidth: '110px' } }, role),
          h('span', { style: styles.hint }, `${chain.length}/${CHAIN_LIMIT} 条路由`),
          h('button', {
            type: 'button', style: styles.button, disabled: disabled || chain.length >= CHAIN_LIMIT,
            onClick: () => onChange([...chain, { provider: '', model: '' }]),
            'data-add-route': role,
          }, '+ 添加路由')),
        h('div', { style: styles.chain },
          chain.length === 0
            ? h('span', { style: styles.hint }, '未配置：该角色使用会话默认模型')
            : chain.map((route, index) => h('div', { key: `${role}-${index}`, style: styles.route },
              h('span', { style: { ...styles.hint, minWidth: '18px' } }, `${index + 1}`),
              h('input', {
                type: 'text', placeholder: 'provider（可空）', value: String(route.provider || ''), disabled,
                style: styles.input, 'data-route-provider': `${role}-${index}`,
                onChange: (event) => update(index, { provider: event.target.value }),
              }),
              h('input', {
                type: 'text', placeholder: 'model（必填）', value: String(route.model || ''), disabled,
                style: styles.input, 'data-route-model': `${role}-${index}`,
                onChange: (event) => update(index, { model: event.target.value }),
              }),
              h('button', {
                type: 'button', style: styles.button, disabled,
                onClick: () => onChange(chain.filter((_route, position) => position !== index)),
                'data-remove-route': `${role}-${index}`,
              }, '删除')))))
    }

    function GrokWorkflowPage(props) {
      // The plugin manager renders this same registration twice: once as the card's
      // one-line description (`view: 'summary'`) and once as the detail page.
      if (props.view === 'summary') {
        return '每条消息的强制工作流：入口门禁、按角色模型链、并发与运行记录。'
      }
      const namespace = useNamespace(props.face, props.defaultNs === undefined ? NS : props.defaultNs)
      const form = props.getForm(namespace.ns)
      const entry = namespace.entry
      const value = entry === undefined ? undefined : entry.value
      const [draft, setDraft] = useState(() => draftOf(value))
      const [saving, setSaving] = useState(false)
      const [message, setMessage] = useState(undefined)
      // Re-seed the draft whenever the Host publishes a different document revision.
      const revision = entry === undefined ? undefined : entry.revision
      const stamp = `${String(revision)}:${namespace.status}`
      useEffect(() => { setDraft(draftOf(value)) }, [stamp])
      const errors = useMemo(() => validate(draft), [draft])
      const ops = useMemo(() => opsFor(draft, value), [draft, value])
      const disabled = saving || namespace.status !== 'ready' || entry === undefined || entry.writable === false
      const onChange = (key, next) => setDraft((current) => ({ ...current, [key]: next }))
      const setChain = (role, next) => setDraft((current) => ({ ...current, roles: { ...current.roles, [role]: next } }))
      const save = async () => {
        if (errors.length > 0 || ops.length === 0) return
        setSaving(true)
        setMessage(undefined)
        try {
          const accepted = await form.mutate(ops, revision)
          setMessage(accepted
            ? { kind: 'ok', text: '已保存，下一条消息生效 / Saved; applies to the next message' }
            : { kind: 'error', text: 'Host 拒绝了这次写入（字段值不合法或该键不可写）/ The Host refused this write' })
        } catch (error) {
          setMessage({ kind: 'error', text: `写入失败：${(error && error.message) || error}` })
        } finally {
          setSaving(false)
        }
      }

      if (namespace.status === 'unavailable') {
        return h('p', { style: styles.hint }, 'Host 未提供 grok-workflow 设置命名空间（插件未激活？）/ The Host does not serve the grok-workflow namespace (is the plugin active?).')
      }
      if (namespace.status === 'loading' || value === undefined) {
        return h('p', { style: styles.hint }, '读取中… / Loading…')
      }

      const groupOf = (id) => GROUPS.find((group) => group.id === id)
      const rowsFor = (id) => FIELDS.filter((field) => field.group === id)
      return h('div', { style: styles.page, 'data-page': 'grok-workflow' },
        h('div', null,
          h('h2', { style: { fontSize: '15px', margin: '0 0 4px' } }, 'Grok workflow'),
          h('p', { style: { ...styles.hint, margin: 0 } },
            '每条用户消息都会走一遍 计划 → 执行 → 验证 → 综合；本页控制入口、按角色模型链、并发上限与运行记录。',
            h('br'),
            'Every user message runs plan → execute → verify → synthesise; this page controls the gate, per-role model chains, concurrency limits and run records.')),
        ...['gate', 'limits', 'output'].map((groupId) => h('section', { key: groupId, style: styles.section },
          h('h3', { style: styles.heading }, groupOf(groupId).title),
          rowsFor(groupId).map((field) => h('div', { key: field.key, style: styles.row },
            h('span', { style: styles.label },
              h('code', { style: styles.mono }, field.key),
              field.kind === 'number' ? h('span', { style: styles.hint }, `${field.min} – ${field.max}，默认 ${field.def}`) : null),
            field.kind === 'classes'
              ? h(ClassPicker, { value: draft[field.key], disabled, onChange: (next) => onChange(field.key, next) })
              : h(ScalarField, { field, draft, disabled, onChange }))))),
        h('section', { style: styles.section },
          h('h3', { style: styles.heading }, groupOf('roles').title),
          h('p', { style: { ...styles.hint, margin: 0 } },
            '每条链最多 3 条路由，按顺序故障转移；留空表示该角色使用会话默认模型。',
            h('br'),
            'Up to 3 routes per chain, tried in order; empty means the session default model.'),
          ROLES.map((role) => h(RoleChain, {
            key: role, role, chain: draft.roles[role] || [], disabled,
            onChange: (next) => setChain(role, next),
          }))),
        h('section', { style: styles.section },
          h('h3', { style: styles.heading }, groupOf('structural').title),
          h('p', { style: { ...styles.hint, margin: 0 } },
            '这四个键不进可编辑表单（改动它们等于换掉插件或门禁本身），请改 profile patch 后重启。',
            h('br'),
            'These keys are not part of the live form; change them in the profile patch and restart.'),
          READ_ONLY.map((key) => h('div', { key, style: styles.row },
            h('code', { style: styles.mono }, key),
            h('span', { style: styles.mono, 'data-readonly-key': key }, READ_ONLY_VALUES[key])))),
        errors.length > 0
          ? h('ul', { style: { ...styles.error, margin: 0, paddingLeft: '18px' } }, errors.map((text) => h('li', { key: text }, text)))
          : null,
        message !== undefined
          ? h('p', { style: { ...(message.kind === 'error' ? styles.error : styles.ok), margin: 0 } }, message.text)
          : null,
        h('div', { style: styles.footer },
          h('button', {
            type: 'button', style: styles.primary, disabled: disabled || errors.length > 0 || ops.length === 0,
            onClick: save, 'data-action': 'save',
          }, saving ? '保存中… / Saving…' : `保存${ops.length > 0 ? ` (${ops.length})` : ''} / Save`),
          h('button', {
            type: 'button', style: styles.button, disabled: disabled || ops.length === 0,
            onClick: () => { setDraft(draftOf(value)); setMessage(undefined) }, 'data-action': 'discard',
          }, '放弃修改 / Discard'),
          h('span', { style: styles.hint }, `revision ${String(revision)}`)))
    }

    /** Required services for the page: the slot registry and the shared config forms. */
    const inject = ['slots', 'configForms']

    /**
     * Register the settings entry for one namespace.
     *
     * The plugin manager renders each `plugins.item` registration twice (card and
     * detail page), so this is the only registration the bundle needs. It is bound
     * to `ns` — the namespace that actually projects this plugin's fields, which is
     * normally the shipped id and otherwise the renamed Loader row.
     * @param ctx - the browser plugin context.
     * @param face - the settings mirror.
     * @param ns - namespace to bind the page to.
     * @returns a disposer for the registration.
     */
    function mountPage(ctx, face, ns) {
      return ctx.slots.inject('plugins.item', () => ctx.slots.register({
        name: 'plugins.item',
        id: ns,
        order: 60,
        label: () => 'Grok workflow',
        inject: () => ({
          face,
          defaultNs: ns,
          getForm: (name) => ctx.configForms.get(name),
        }),
      }, GrokWorkflowPage))
    }

    /**
     * Register the settings tab while the Host serves this plugin's namespace.
     * @param ctx - the browser plugin context.
     */
    function apply(ctx) {
      const face = ctx.configForms.describe()
      ctx.effect(() => { face.ensure().catch(() => undefined) }, 'grok-workflow: settings mirror read')
      ctx.effect(() => ctx.configForms.whileServed([NS], () => mountPage(ctx, face, NS)), 'grok-workflow: settings page')
      // The shipped namespace id is only the default: if a profile renames the
      // Loader row, the same fields project under another id. Re-bind there and say
      // so, rather than leaving the page silently missing (t34 residual risk). When
      // nothing projects our fields the plugin is disabled or did not activate — the
      // case that swallowed the whole feature in t33 — so name it in the console.
      ctx.effect(() => {
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
              unmount = mountPage(ctx, face, resolved.ns)
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
      return () => {}
    }

    exports.apply = apply
    exports.inject = inject
    exports.NS = NS
    exports.GROK_WORKFLOW_FIELDS = FIELDS
    exports.GROK_WORKFLOW_READ_ONLY = READ_ONLY
    exports.GROK_WORKFLOW_ROLES = ROLES
    exports.GROK_WORKFLOW_SWITCHABLE_CLASSES = SWITCHABLE_CLASSES
    exports.GROK_WORKFLOW_READ_ONLY_VALUES = READ_ONLY_VALUES
    /** Internals pinned by test/client.spec.ts (no runtime caller). */
    exports.GROK_WORKFLOW_INTERNALS = {
      validate, opsFor, draftOf, resolveNamespace,
    }
    return module.exports
  },
})
