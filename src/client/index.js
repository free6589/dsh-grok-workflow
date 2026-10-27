// Browser half of dsh-grok-workflow: the Settings → Plugins → "Grok workflow" page.
//
// Why this file exists at all (measured, t32): the Host serves this plugin's settings
// namespace (`settings/describe` → ns "grok-workflow", autoGenerate: true, 17 volatile
// fields) but the stock web client renders *no* page for a namespace on its own. Every
// feature ships a client bundle that registers a `plugins.item` tab and is kept alive by
// `configForms.whileServed([ns])`, so without one the plugin is invisible in the GUI
// (this was NR-7). The file is a browser module in the host's `__ModuleLoader__` format:
// plain ESM would load without registering and be rejected.
//
// Copy is bilingual (t42). The language is *not* sniffed from `navigator`: every string
// resolves through the composition's own locale plugin (`@deepseek-ai/dsh-client-locale`),
// the same source that drives Settings → General → Language and `<html lang>`. Two
// mechanisms, both from that package: `ctx.locale.register(ns, { zh, en })` publishes this
// plugin's dictionary, and a slot registration carrying `locale: NS` receives the
// framework's `t` seat, which the renderer re-derives whenever the locale revision moves
// (so a language switch repaints the open page, the card title and the one-line summary
// without a reload). `t` is a hard product of that plugin, so it stays out of `inject`:
// the page must not fail to mount in a composition without a locale service.
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
      { key: 'timeoutMs', group: 'limits', kind: 'number', min: 1000, max: 86400000, def: 3600000 },
      { key: 'maxActiveRuns', group: 'limits', kind: 'number', min: 1, max: 4, def: 2 },
      { key: 'maxActiveRunsTotal', group: 'limits', kind: 'number', min: 1, max: 16, def: 8 },
      { key: 'subagentProvider', group: 'limits', kind: 'text', def: '' },
      { key: 'synthesis', group: 'output', kind: 'enum', options: ['deterministic', 'model'], def: 'deterministic' },
      { key: 'switchOn', group: 'output', kind: 'classes', def: [] },
      { key: 'recordRuns', group: 'output', kind: 'boolean', def: true },
      { key: 'showProgress', group: 'output', kind: 'boolean', def: true },
      { key: 'recordLimit', group: 'output', kind: 'number', min: 0, max: 256, def: 64 },
    ]

    // Mirrors SWITCHABLE_CLASSES in src/config.ts; test/client.spec.ts pins the parity.
    const SWITCHABLE_CLASSES = [
      'rate-limit', 'server-error', 'connection', 'timeout',
      'model-unavailable', 'format-error', 'agent-start-failed',
    ]
    const ROLES = ['planner', 'worker', 'verifier', 'synthesizer']

    const CHAIN_LIMIT = 3
    const ROUTE_FIELD_LIMIT = 120

    const GROUPS = ['gate', 'limits', 'roles', 'output', 'structural']
    const GROUPS_WITH_FIELDS = ['gate', 'limits', 'output']

    // ---------------------------------------------------------------------------
    // Dictionaries. Keys are the contract between this table and every render site;
    // test/client.spec.ts fails the suite when the two locales disagree about a key.
    // Both locales are mandatory: `ctx.locale.register` requires the shipped pair, and
    // the locale plugin's own fallback chain terminates at `en`.
    // ---------------------------------------------------------------------------

    const EN = {
      'card.title': 'Grok workflow',
      'card.summary': 'A mandatory workflow for every message: entry gate, per-role model chains, concurrency and run records.',

      'page.intro': 'Every user message runs plan → execute → verify → synthesise. This page controls the entry gate, the per-role model chains, the concurrency limits and the run records.',

      'group.gate': 'Entry and gate',
      'group.limits': 'Context and concurrency',
      'group.roles': 'Per-role model chains',
      'group.output': 'Synthesis, switching and records',
      'group.structural': 'Structural fields (read-only)',

      'field.gateScope': 'Gate scope',
      'field.gatePreset': 'Gate preset name',
      'field.answerStrategy': 'Answer strategy',
      'field.historyTurns': 'History turn limit',
      'field.historyChars': 'History character limit',
      'field.maxQueuedMessages': 'Queued message limit',
      'field.maxConcurrency': 'Concurrent task limit',
      'field.maxRetries': 'Retries per task',
      'field.maxTasks': 'Task count limit',
      'field.timeoutMs': 'Run timeout (ms)',
      'field.maxActiveRuns': 'Active runs per session',
      'field.maxActiveRunsTotal': 'Active runs across all sessions',
      'field.subagentProvider': 'Subagent provider',
      'field.synthesis': 'Synthesis mode',
      'field.switchOn': 'Failure classes that switch models',
      'field.recordRuns': 'Record runs',
      'field.showProgress': 'Show run progress',
      'field.recordLimit': 'Run record limit',
      'field.range': '{min} – {max}, default {def}',

      'readonly.toolName': 'Tool name',
      'readonly.enforceGate': 'Enforce gate',
      'readonly.gateRequired': 'Gate required',
      'readonly.configVersion': 'Config version',
      'readonlyValue.toolName': 'grok_workflow (fixed at registration)',
      'readonlyValue.enforceGate': 'true (default; editable in the profile patch)',
      'readonlyValue.gateRequired': 'false (default; editable in the profile patch)',
      'readonlyValue.configVersion': '1 (wire contract)',

      'role.planner': 'planner',
      'role.worker': 'worker',
      'role.verifier': 'verifier',
      'role.synthesizer': 'synthesizer',

      'roles.hint': 'Up to {limit} routes per chain, tried in order; empty means this role uses the session default model.',
      'roles.count': '{count}/{limit} routes',
      'roles.add': '+ Add route',
      'roles.remove': 'Remove',
      'roles.empty': 'Not configured: this role uses the session default model',
      'roles.providerPlaceholder': 'provider (optional)',
      'roles.modelPlaceholder': 'model (required)',

      'structural.hint': 'These keys are not part of the live form; change them in the profile patch and restart.',

      'action.save': 'Save',
      'action.saveCount': 'Save ({count})',
      'action.saving': 'Saving…',
      'action.discard': 'Discard',

      'status.saved': 'Saved; applies to the next message.',
      'status.refused': 'The Host refused this write (invalid value or a read-only key).',
      'status.writeFailed': 'Write failed: {message}',
      'status.loading': 'Loading…',
      'status.unavailable': 'The Host does not serve the grok-workflow settings namespace (is the plugin active?)',
      'status.revision': 'revision {revision}',

      'error.number': '{key} must be an integer between {min} and {max}',
      'error.presetNeeded': 'gatePreset is required when gateScope=preset',
      'error.chainTooLong': '{role} may have at most {limit} routes',
      'error.missingModel': '{role} route {index} has no model',
      'error.tooLong': '{role} route {index}: provider/model exceeds {limit} characters',
      'error.duplicate': '{role} route {index} repeats an earlier route',
      'error.unknownClass': 'switchOn does not accept {entry}',
    }

    const ZH = {
      'card.title': 'Grok workflow',
      'card.summary': '每条消息的强制工作流：入口门禁、按角色模型链、并发与运行记录。',

      'page.intro': '每条用户消息都会走一遍 计划 → 执行 → 验证 → 综合。本页控制入口门禁、按角色模型链、并发上限与运行记录。',

      'group.gate': '入口与门禁',
      'group.limits': '上下文与并发',
      'group.roles': '按角色模型链',
      'group.output': '综合、切换与记录',
      'group.structural': '结构性字段（只读）',

      'field.gateScope': '门禁范围',
      'field.gatePreset': '门禁预设名',
      'field.answerStrategy': '回答策略',
      'field.historyTurns': '历史轮数上限',
      'field.historyChars': '历史字符上限',
      'field.maxQueuedMessages': '排队消息上限',
      'field.maxConcurrency': '并发任务上限',
      'field.maxRetries': '每条任务重试次数',
      'field.maxTasks': '任务数上限',
      'field.timeoutMs': '单次运行超时（毫秒）',
      'field.maxActiveRuns': '每会话活跃运行上限',
      'field.maxActiveRunsTotal': '全部会话活跃运行上限',
      'field.subagentProvider': '子代理 provider',
      'field.synthesis': '综合方式',
      'field.switchOn': '触发切换的失败类别',
      'field.recordRuns': '记录运行',
      'field.showProgress': '显示运行进度',
      'field.recordLimit': '运行记录条数上限',
      'field.range': '{min} – {max}，默认 {def}',

      'readonly.toolName': '工具名',
      'readonly.enforceGate': '强制门禁',
      'readonly.gateRequired': '门禁必需',
      'readonly.configVersion': '配置版本',
      'readonlyValue.toolName': 'grok_workflow（注册即固定）',
      'readonlyValue.enforceGate': 'true（默认；可在 profile patch 中改）',
      'readonlyValue.gateRequired': 'false（默认；可在 profile patch 中改）',
      'readonlyValue.configVersion': '1（wire 契约）',

      'role.planner': '规划者',
      'role.worker': '执行者',
      'role.verifier': '验证者',
      'role.synthesizer': '综合者',

      'roles.hint': '每条链最多 {limit} 条路由，按顺序故障转移；留空表示该角色使用会话默认模型。',
      'roles.count': '{count}/{limit} 条路由',
      'roles.add': '+ 添加路由',
      'roles.remove': '删除',
      'roles.empty': '未配置：该角色使用会话默认模型',
      'roles.providerPlaceholder': 'provider（可空）',
      'roles.modelPlaceholder': 'model（必填）',

      'structural.hint': '这四个键不进可编辑表单（改动它们等于换掉插件或门禁本身），请改 profile patch 后重启。',

      'action.save': '保存',
      'action.saveCount': '保存 ({count})',
      'action.saving': '保存中…',
      'action.discard': '放弃修改',

      'status.saved': '已保存，下一条消息生效。',
      'status.refused': 'Host 拒绝了这次写入（字段值不合法或该键不可写）。',
      'status.writeFailed': '写入失败：{message}',
      'status.loading': '读取中…',
      'status.unavailable': 'Host 未提供 grok-workflow 设置命名空间（插件未激活？）',
      'status.revision': 'revision {revision}',

      'error.number': '{key} 必须是 {min} 到 {max} 之间的整数',
      'error.presetNeeded': 'gateScope=preset 时必须填写 gatePreset',
      'error.chainTooLong': '{role} 备用链最多 {limit} 条',
      'error.missingModel': '{role} 第 {index} 条缺少 model',
      'error.tooLong': '{role} 第 {index} 条的 provider/model 超过 {limit} 字符',
      'error.duplicate': '{role} 第 {index} 条与前面的路由重复',
      'error.unknownClass': 'switchOn 不认识 {entry}',
    }

    /** Shipped locales, in the order the locale plugin registers them. */
    const LOCALES = ['zh', 'en']
    const DICT = { zh: ZH, en: EN }
    /** Terminal fallback of the locale plugin's chains; also this plugin's own. */
    const FALLBACK_LOCALE = 'en'

    /**
     * Resolve one key, mirroring `LocaleRuntime.translate` in `@deepseek-ai/dsh-client-locale`:
     * walk the requested locale then its `en` fallback, interpolate `{name}` params, and
     * return the key itself when no dictionary carries it.
     *
     * This exists for two callers that have no locale face: unit tests, and a composition
     * whose locale plugin is absent (where the page still has to render *something*).
     * @param locale - locale id such as `zh` or `en`.
     * @param key - dictionary key.
     * @param params - optional `{name}` substitutions.
     * @returns the translated string, or `key` when untranslated.
     */
    function translate(locale, key, params) {
      let template
      for (const id of [locale, FALLBACK_LOCALE]) {
        const dict = DICT[id]
        if (dict !== undefined && dict[key] !== undefined) {
          template = dict[key]
          break
        }
      }
      if (template === undefined) return key
      if (params === undefined) return template
      return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
    }

    /** Bind one locale id into a `t(key, params)` function (the shape of the `t` seat). */
    function translator(locale) {
      return (key, params) => translate(locale, key, params)
    }

    /**
     * The active locale id, defaulting to the English fallback.
     * @param locale - the locale service, when the composition has one.
     * @returns the id the page should render in.
     */
    function activeLocale(locale) {
      if (locale === undefined || locale === null || typeof locale.getSnapshot !== 'function') return FALLBACK_LOCALE
      const snapshot = locale.getSnapshot()
      return snapshot === undefined || snapshot.active === undefined ? FALLBACK_LOCALE : snapshot.active
    }

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
        if (field.kind !== 'number') continue
        const raw = draft[field.key]
        if (!Number.isSafeInteger(raw) || raw < field.min || raw > field.max) {
          errors.push({ key: 'error.number', params: { key: field.key, min: field.min, max: field.max } })
        }
      }
      if (draft.gateScope === 'preset' && String(draft.gatePreset || '').trim() === '') {
        errors.push({ key: 'error.presetNeeded' })
      }
      for (const role of ROLES) {
        const chain = draft.roles[role] || []
        if (chain.length > CHAIN_LIMIT) errors.push({ key: 'error.chainTooLong', params: { role, limit: CHAIN_LIMIT } })
        const seen = new Set()
        chain.forEach((route, index) => {
          const model = String((route && route.model) || '').trim()
          const provider = String((route && route.provider) || '').trim()
          if (model === '') errors.push({ key: 'error.missingModel', params: { role, index: index + 1 } })
          if (model.length > ROUTE_FIELD_LIMIT || provider.length > ROUTE_FIELD_LIMIT) {
            errors.push({ key: 'error.tooLong', params: { role, index: index + 1, limit: ROUTE_FIELD_LIMIT } })
          }
          // Two blank routes are not duplicates: they are two unfinished rows.
          const key = `${provider}::${model}`
          if (model !== '' && seen.has(key)) errors.push({ key: 'error.duplicate', params: { role, index: index + 1 } })
          if (model !== '') seen.add(key)
        })
      }
      for (const entry of draft.switchOn || []) {
        if (!SWITCHABLE_CLASSES.includes(entry)) errors.push({ key: 'error.unknownClass', params: { entry } })
      }
      return errors
    }

    /**
     * Render one validation finding in the active language.
     *
     * `role` params carry role ids, not prose: the role name is looked up here so a single
     * dictionary entry serves all four chains in both languages.
     * @param error - a finding from `validate`.
     * @param t - translator bound to this plugin's namespace.
     * @returns the message the user sees.
     */
    function formatError(error, t) {
      const source = error === undefined || error.params === undefined ? {} : error.params
      const params = { ...source }
      if (typeof params.role === 'string') params.role = t(`role.${params.role}`)
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
      const { role, chain, disabled, onChange, t } = props
      const update = (index, patch) => {
        const next = chain.map((route, position) => (position === index ? { ...route, ...patch } : route))
        onChange(next)
      }
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
          h('strong', { style: { minWidth: '110px' } }, t(`role.${role}`)),
          h('span', { style: styles.hint }, t('roles.count', { count: chain.length, limit: CHAIN_LIMIT })),
          h('button', {
            type: 'button', style: styles.button, disabled: disabled || chain.length >= CHAIN_LIMIT,
            onClick: () => onChange([...chain, { provider: '', model: '' }]),
            'data-add-route': role,
          }, t('roles.add'))),
        h('div', { style: styles.chain },
          chain.length === 0
            ? h('span', { style: styles.hint }, t('roles.empty'))
            : chain.map((route, index) => h('div', { key: `${role}-${index}`, style: styles.route },
              h('span', { style: { ...styles.hint, minWidth: '18px' } }, `${index + 1}`),
              h('input', {
                type: 'text', placeholder: t('roles.providerPlaceholder'), value: String(route.provider || ''), disabled,
                style: styles.input, 'data-route-provider': `${role}-${index}`,
                onChange: (event) => update(index, { provider: event.target.value }),
              }),
              h('input', {
                type: 'text', placeholder: t('roles.modelPlaceholder'), value: String(route.model || ''), disabled,
                style: styles.input, 'data-route-model': `${role}-${index}`,
                onChange: (event) => update(index, { model: event.target.value }),
              }),
              h('button', {
                type: 'button', style: styles.button, disabled,
                onClick: () => onChange(chain.filter((_route, position) => position !== index)),
                'data-remove-route': `${role}-${index}`,
              }, t('roles.remove'))))))
    }

    function GrokWorkflowPage(props) {
      // `t` is the framework's locale seat when the registration declared `locale: NS`
      // (it re-derives on every locale revision), and the bundle's own translator when the
      // composition has no locale plugin.
      const t = typeof props.t === 'function'
        ? props.t
        : (typeof props.translateOwn === 'function' ? props.translateOwn : translator('en'))
      // The plugin manager renders this same registration twice: once as the card's
      // one-line description (`view: 'summary'`) and once as the detail page.
      if (props.view === 'summary') {
        return t('card.summary')
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
          // The message is stored as a key, not as prose, so a language switch mid-session
          // re-renders it in the new language instead of stranding the old one.
          setMessage(accepted === true ? { kind: 'ok', key: 'status.saved' } : { kind: 'error', key: 'status.refused' })
        } catch (error) {
          setMessage({ kind: 'error', key: 'status.writeFailed', params: { message: (error && error.message) || error } })
        } finally {
          setSaving(false)
        }
      }

      if (namespace.status === 'unavailable') {
        return h('p', { style: styles.hint }, t('status.unavailable'))
      }
      if (namespace.status === 'loading' || value === undefined) {
        return h('p', { style: styles.hint }, t('status.loading'))
      }

      const rowsFor = (id) => FIELDS.filter((field) => field.group === id)
      return h('div', { style: styles.page, 'data-page': 'grok-workflow' },
        h('div', null,
          h('h2', { style: { fontSize: '15px', margin: '0 0 4px' } }, t('card.title')),
          h('p', { style: { ...styles.hint, margin: 0 } }, t('page.intro'))),
        ...GROUPS_WITH_FIELDS.map((groupId) => h('section', { key: groupId, style: styles.section },
          h('h3', { style: styles.heading }, t(`group.${groupId}`)),
          rowsFor(groupId).map((field) => h('div', { key: field.key, style: styles.row },
            h('span', { style: styles.label },
              h('span', null, t(`field.${field.key}`)),
              h('code', { style: styles.mono }, field.key),
              field.kind === 'number'
                ? h('span', { style: styles.hint }, t('field.range', { min: field.min, max: field.max, def: field.def }))
                : null),
            field.kind === 'classes'
              ? h(ClassPicker, { value: draft[field.key], disabled, onChange: (next) => onChange(field.key, next) })
              : h(ScalarField, { field, draft, disabled, onChange }))))),
        h('section', { style: styles.section },
          h('h3', { style: styles.heading }, t('group.roles')),
          h('p', { style: { ...styles.hint, margin: 0 } }, t('roles.hint', { limit: CHAIN_LIMIT })),
          ROLES.map((role) => h(RoleChain, {
            key: role, role, t, chain: draft.roles[role] || [], disabled,
            onChange: (next) => setChain(role, next),
          }))),
        h('section', { style: styles.section },
          h('h3', { style: styles.heading }, t('group.structural')),
          h('p', { style: { ...styles.hint, margin: 0 } }, t('structural.hint')),
          READ_ONLY.map((key) => h('div', { key, style: styles.row },
            h('span', { style: styles.label },
              h('span', null, t(`readonly.${key}`)),
              h('code', { style: styles.mono }, key)),
            h('span', { style: styles.mono, 'data-readonly-key': key }, t(`readonlyValue.${key}`))))),
        errors.length > 0
          ? h('ul', { style: { ...styles.error, margin: 0, paddingLeft: '18px' } },
            errors.map((error) => h('li', { key: errorId(error) }, formatError(error, t))))
          : null,
        message !== undefined
          ? h('p', { style: { ...(message.kind === 'error' ? styles.error : styles.ok), margin: 0 } }, t(message.key, message.params))
          : null,
        h('div', { style: styles.footer },
          h('button', {
            type: 'button', style: styles.primary, disabled: disabled || errors.length > 0 || ops.length === 0,
            onClick: save, 'data-action': 'save',
          }, saving ? t('action.saving') : (ops.length > 0 ? t('action.saveCount', { count: ops.length }) : t('action.save'))),
          h('button', {
            type: 'button', style: styles.button, disabled: disabled || ops.length === 0,
            onClick: () => { setDraft(draftOf(value)); setMessage(undefined) }, 'data-action': 'discard',
          }, t('action.discard')),
          h('span', { style: styles.hint }, t('status.revision', { revision: String(revision) }))))
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
     *
     * `locale: NS` is added only when the composition really installs a locale face:
     * the renderer throws a `SlotAssemblyError` for an entry that declares a namespace
     * while no face is installed, and a page in the wrong language beats no page.
     * @param ctx - the browser plugin context.
     * @param face - the settings mirror.
     * @param ns - namespace to bind the page to.
     * @param i18n - live locale binding: `locale` is the service when present, `t` the
     *   translator the card label and the page fallback resolve through.
     * @returns a disposer for the registration.
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
        }),
      }
      if (i18n.locale !== undefined) options.locale = NS
      return ctx.slots.inject('plugins.item', () => ctx.slots.register(options, GrokWorkflowPage))
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
      const i18n = { locale: undefined, t: translator(FALLBACK_LOCALE) }
      ctx.effect(() => { face.ensure().catch(() => undefined) }, 'grok-workflow: settings mirror read')

      let stop = startPages(ctx, face, i18n)
      const bound = () => {
        i18n.locale = undefined
        i18n.t = translator(FALLBACK_LOCALE)
        stop()
        stop = startPages(ctx, face, i18n)
      }

      if (typeof ctx.inject === 'function') {
        ctx.inject(['locale'], (scope) => {
          const locale = scope.locale
          i18n.locale = locale
          i18n.t = typeof locale.bind === 'function' ? locale.bind(NS) : translator(activeLocale(locale))
          ctx.effect(() => locale.register(NS, { zh: ZH, en: EN }), 'grok-workflow: dictionaries')
          // Remount so the slot carries `locale: NS`: the framework then seats a `t` the
          // renderer re-derives on every locale revision, and the page repaints in place.
          stop()
          stop = startPages(ctx, face, i18n)
          return () => bound()
        })
      } else {
        console.warn('[grok-workflow] this composition cannot inject services: the settings page keeps its English copy.')
      }
      return () => { stop() }
    }

    exports.apply = apply
    exports.inject = inject
    exports.NS = NS
    exports.GROK_WORKFLOW_FIELDS = FIELDS
    exports.GROK_WORKFLOW_READ_ONLY = READ_ONLY
    exports.GROK_WORKFLOW_ROLES = ROLES
    exports.GROK_WORKFLOW_SWITCHABLE_CLASSES = SWITCHABLE_CLASSES
    exports.GROK_WORKFLOW_GROUPS = GROUPS
    exports.GROK_WORKFLOW_LOCALES = LOCALES
    exports.GROK_WORKFLOW_DICT = DICT
    exports.GROK_WORKFLOW_CHAIN_LIMIT = CHAIN_LIMIT
    /** Internals pinned by test/client.spec.ts (no runtime caller). */
    exports.GROK_WORKFLOW_INTERNALS = {
      validate, formatError, opsFor, draftOf, resolveNamespace, translate, translator, activeLocale,
    }
    return module.exports
  },
})
