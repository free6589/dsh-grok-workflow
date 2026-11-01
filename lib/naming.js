/** Shipped languages, in the order the settings page lists them. */
export const NAMING_LANGUAGES = ['zh', 'en'];
/**
 * Code points a task title may occupy inside a group header.
 *
 * 24 CJK characters fill the 42%-width `runTitle`/`phaseTitle` row on a 1280px
 * window; longer titles are ellipsised in the header and remain complete in the
 * report (`plan.tasks[].title`).
 */
export const TASK_TITLE_DISPLAY_LIMIT = 24;
/** Ellipsis appended to a truncated title (one code point, not three dots). */
export const TITLE_ELLIPSIS = '…';
/**
 * The two shipped dictionaries.
 *
 * Chinese is the key-set source of truth (the repo's other dictionaries follow the
 * same rule), and `en` carries the same keys with natural English copy — no
 * Chinese appears in the English table.
 */
export const NAMING_COPY = {
    zh: {
        workflow: '任务团队',
        roles: { planner: '规划助手', worker: '执行', verifier: '检查', synthesizer: '汇总助手' },
        taskGroup: '任务 {index} · {title}',
        attempt: '{role}（尝试 {n}）',
        phases: { plan: '规划', execute: '执行', verify: '检查', synthesize: '汇总', answer: '回答' },
        tasks: '{n} 个任务',
        callSubjects: {
            planner: '规划助手调用',
            worker: '执行代理',
            verifier: '检查调用',
            synthesizer: '汇总调用',
        },
        callStates: {
            running: '进行中',
            ended: '已结束',
            failed: '失败',
            cancelled: '已取消',
            interrupted: '已中断',
        },
        taskVerdicts: { verified: '任务通过', failed: '任务未通过' },
        runStates: {
            running: '运行中',
            completed: '已完成',
            failed: '失败',
            cancelled: '已取消',
            interrupted: '已中断',
        },
        unphased: '未分阶段',
    },
    en: {
        workflow: 'Task team',
        roles: { planner: 'Planner', worker: 'Execute', verifier: 'Check', synthesizer: 'Summarizer' },
        taskGroup: 'Task {index} · {title}',
        attempt: '{role} (attempt {n})',
        phases: { plan: 'Plan', execute: 'Execute', verify: 'Verify', synthesize: 'Synthesize', answer: 'Answer' },
        tasks: '{n} tasks',
        callSubjects: {
            planner: 'Planner call',
            worker: 'Execute agent',
            verifier: 'Check call',
            synthesizer: 'Summarizer call',
        },
        callStates: {
            running: 'running',
            ended: 'ended',
            failed: 'failed',
            cancelled: 'cancelled',
            interrupted: 'interrupted',
        },
        taskVerdicts: { verified: 'Task verified', failed: 'Task not verified' },
        runStates: {
            running: 'Running',
            completed: 'Completed',
            failed: 'Failed',
            cancelled: 'Cancelled',
            interrupted: 'Interrupted',
        },
        unphased: 'Unphased',
    },
};
/** Replace every `{key}` placeholder in one template. */
function fill(template, values) {
    return template.replace(/\{([a-zA-Z]+)\}/g, (match, key) => {
        const value = values[key];
        return value === undefined ? match : value;
    });
}
/**
 * Resolve the copy language from an untrusted value.
 *
 * Only `en` (or an `en-*` tag) selects English; anything else — an absent
 * preference, `zh`, a malformed tag — stays Chinese, which is the shipped default.
 * @param value - candidate language tag.
 * @returns the language to render.
 */
export function resolveNamingLanguage(value) {
    if (typeof value !== 'string')
        return 'zh';
    const lowered = value.trim().toLowerCase();
    if (lowered === 'en' || lowered.startsWith('en-') || lowered.startsWith('en_'))
        return 'en';
    return 'zh';
}
/**
 * Resolve the copy language from the Host's settings projection.
 *
 * The DSH locale plugin owns the settings namespace `locale` and stores the
 * selection in its `preference` field (`@deepseek-ai/dsh-client-locale/lib/index.js:4-14`).
 * Its own documentation says absence "delegates to the browser": a Host cannot
 * observe `navigator.language`, so an unset preference is reported as `zh` rather
 * than guessed at, and the panel therefore never shows a language the Host cannot
 * justify.
 * @param descriptors - `ctx.settings.describe()` output, or nothing.
 * @returns the language to render.
 */
export function namingLanguageFromSettings(descriptors) {
    if (descriptors === undefined)
        return 'zh';
    for (const descriptor of descriptors) {
        if (descriptor.ns !== 'locale')
            continue;
        const value = descriptor.value;
        if (typeof value !== 'object' || value === null)
            return 'zh';
        return resolveNamingLanguage(value.preference);
    }
    return 'zh';
}
/**
 * Truncate a task title for a group header.
 *
 * Counted in code points, so an emoji or a CJK character costs one unit and a
 * surrogate pair is never split. The result always ends with
 * {@link TITLE_ELLIPSIS} when it was cut, so a reader can tell a short title from
 * a truncated one; the untouched title stays available in the report.
 * @param title - the task title as planned.
 * @param limit - maximum code points before truncation.
 * @returns the display title.
 */
export function truncateTaskTitle(title, limit = TASK_TITLE_DISPLAY_LIMIT) {
    const text = typeof title === 'string' ? title.trim() : '';
    const characters = Array.from(text);
    const bounded = Math.max(1, Math.trunc(Number.isFinite(limit) ? limit : TASK_TITLE_DISPLAY_LIMIT));
    if (characters.length <= bounded)
        return characters.join('');
    return characters.slice(0, bounded).join('') + TITLE_ELLIPSIS;
}
/**
 * Build the group header for one task.
 *
 * The 1-based index is part of the header, which is what makes the sequence
 * stable and unique: two tasks whose titles are identical still get two distinct
 * headers, and the stock fold (which keys a group by the exact phase string)
 * therefore renders two groups instead of merging them.
 * @param index - 1-based plan position.
 * @param title - the task title as planned.
 * @param language - copy language.
 * @returns the phase string recorded for every member of that task.
 */
export function taskGroupTitle(index, title, language = 'zh') {
    const copy = NAMING_COPY[language];
    const position = Number.isFinite(index) && index > 0 ? Math.trunc(index) : 1;
    return fill(copy.taskGroup, { index: String(position), title: truncateTaskTitle(title) });
}
/**
 * Build the member label for one role call.
 *
 * `attempt` counts from 1, and only a repeated attempt is called out: the first
 * attempt of a worker reads `执行`, its retry reads `执行（尝试 2）`. Planner and
 * synthesizer run once per run, so they never carry an attempt suffix.
 * @param role - internal role name.
 * @param attempt - 1-based attempt number, or 0 for a single call.
 * @param language - copy language.
 * @returns the member label recorded for that child call.
 */
export function memberLabel(role, attempt = 0, language = 'zh') {
    const copy = NAMING_COPY[language];
    const base = copy.roles[role] ?? role;
    const count = Number.isFinite(attempt) ? Math.trunc(attempt) : 0;
    if (count <= 1)
        return base;
    if (role === 'planner' || role === 'synthesizer')
        return base;
    return fill(copy.attempt, { role: base, n: String(count) });
}
/**
 * Read one role back out of a user-visible member label.
 *
 * This is the plugin's own inverse of {@link memberLabel}: tests use it to decide
 * which role a fake child is answering, exactly as the real panel lets a user tell
 * them apart. It matches on the rendered name, so a label that lost its role word
 * is reported as unknown instead of being guessed at.
 * @param label - user-visible label.
 * @param language - copy language the label was written in.
 * @returns the role and attempt, or undefined when the label is not ours.
 */
export function parseMemberLabel(label, language = 'zh') {
    if (typeof label !== 'string')
        return undefined;
    const copy = NAMING_COPY[language];
    const roles = ['planner', 'worker', 'verifier', 'synthesizer'];
    for (const role of roles) {
        const base = copy.roles[role];
        if (label !== base && !label.startsWith(base))
            continue;
        const rest = label.slice(base.length);
        if (rest === '')
            return { role, attempt: 1 };
        // Build the attempt pattern from the *copy*, not from a hand-written regex: the
        // number is a placeholder so it survives the escaping pass below.
        const DIGITS = '\u0000';
        // `rest` is what follows the role word, so the attempt template contributes
        // only its own suffix (`（尝试 2）`), not the role it also carries.
        const escaped = fill(copy.attempt.replace('{role}', ''), { role: base, n: DIGITS })
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            .split(DIGITS)
            .join('(\\d+)');
        if (!new RegExp('^' + escaped + '$').test(rest))
            continue;
        const digits = rest.match(/\d+/);
        return { role, attempt: digits === null ? 1 : Number(digits[0]) };
    }
    return undefined;
}
/**
 * The workflow's own display name (the run container).
 * @param language - copy language.
 * @returns the name for that language.
 */
export function workflowDisplayName(language = 'zh') {
    return NAMING_COPY[language].workflow;
}
/**
 * Name one run as the panel will show it.
 *
 * The task count is appended only when it is known *before* the script runs: the
 * stock panel has no way to retract a number, so a guessed count would be a lie
 * for the whole run. That is the whole of P1-4's "activity counter" rule — the
 * count is a fact the Host holds, never an estimate.
 * @param language - copy language.
 * @param taskCount - caller-supplied task total, or undefined when unknown.
 * @returns the run title.
 */
export function runTitle(language, taskCount) {
    const name = workflowDisplayName(language);
    if (taskCount === undefined || !Number.isFinite(taskCount))
        return name;
    const count = Math.trunc(taskCount);
    if (count <= 0)
        return name;
    return `${name} · ${fill(NAMING_COPY[language].tasks, { n: String(count) })}`.slice(0, 80);
}
/**
 * Phase narration title for the guest script's `phase()` calls.
 * @param kind - which phase.
 * @param language - copy language.
 * @returns the title.
 */
export function phaseLabel(kind, language = 'zh') {
    return NAMING_COPY[language].phases[kind];
}
/**
 * Word one child **call** by its lifecycle state.
 *
 * This is the copy the panel uses for a row, and it is deliberately about the call:
 * `agent-end: completed` yields `执行代理已结束` / `检查调用已结束`, never `执行完成` or
 * `检查通过`. A row that reads as a passed task would be the P1-1 semantic error
 * this function exists to rule out.
 * @param role - internal role name.
 * @param state - lifecycle state of that call.
 * @param language - copy language.
 * @returns the row wording.
 */
export function callStateText(role, state, language = 'zh') {
    const copy = NAMING_COPY[language];
    const subject = copy.callSubjects[role] ?? role;
    const word = copy.callStates[state] ?? copy.callStates.running;
    return language === 'en' ? `${subject} ${word}` : `${subject}${word}`;
}
/**
 * Word one *task-level* verdict.
 *
 * Only a report task row can supply `verified` / `failed`, so this is the only place
 * a pass word exists: there is no input that would let a call produce it.
 * @param status - the task's status in the report.
 * @param language - copy language.
 * @returns the verdict wording.
 */
export function taskVerdictText(status, language = 'zh') {
    return NAMING_COPY[language].taskVerdicts[status];
}
/**
 * Word the run node's status.
 *
 * The key set is the stock dictionary's, so a projection of the recorded events and
 * the stock component cannot disagree about which statuses exist.
 * @param state - run status.
 * @param language - copy language.
 * @returns the status wording.
 */
export function runStateText(state, language = 'zh') {
    return NAMING_COPY[language].runStates[state];
}
/**
 * Header word for members that declared no phase.
 * @param language - copy language.
 * @returns the header.
 */
export function unphasedLabel(language = 'zh') {
    return NAMING_COPY[language].unphased;
}
/**
 * Render the naming table and its two formatters as script-realm JS source.
 *
 * The guest script cannot import host code, so this is generated from the single
 * table above — the same pattern `redactionRulesSource()` uses for redaction
 * rules. The emitted helpers must stay byte-for-byte equivalent to
 * {@link truncateTaskTitle}, {@link taskGroupTitle} and {@link memberLabel};
 * `test/naming.spec.ts` evaluates the source and compares the output.
 * @returns the source to interpolate into `WORKFLOW_SCRIPT`.
 */
export function namingSource() {
    return `const NAMING_COPY = ${JSON.stringify(NAMING_COPY)};
const NAMING_LANGUAGE = (function (value) {
  const tag = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (tag === 'en' || tag.indexOf('en-') === 0 || tag.indexOf('en_') === 0) return 'en';
  return 'zh';
})(args && args.naming ? args.naming.language : '');
const NAMING = NAMING_COPY[NAMING_LANGUAGE];
const NAMING_TITLE_LIMIT = ${TASK_TITLE_DISPLAY_LIMIT};
const NAMING_ELLIPSIS = ${JSON.stringify(TITLE_ELLIPSIS)};

function namingFill(template, values) {
  return template.replace(/\\{([a-zA-Z]+)\\}/g, function (match, key) {
    return values[key] === undefined ? match : values[key];
  });
}

function namingTruncate(title) {
  const text = typeof title === 'string' ? title.trim() : '';
  const characters = Array.from(text);
  if (characters.length <= NAMING_TITLE_LIMIT) return characters.join('');
  return characters.slice(0, NAMING_TITLE_LIMIT).join('') + NAMING_ELLIPSIS;
}

function taskGroupTitle(index, title) {
  const position = index > 0 ? Math.trunc(index) : 1;
  return namingFill(NAMING.taskGroup, { index: String(position), title: namingTruncate(title) });
}

function memberLabel(role, attempt) {
  const base = NAMING.roles[role] || role;
  const count = typeof attempt === 'number' && isFinite(attempt) ? Math.trunc(attempt) : 0;
  if (count <= 1) return base;
  if (role === 'planner' || role === 'synthesizer') return base;
  return namingFill(NAMING.attempt, { role: base, n: String(count) });
}

function phaseLabel(kind) {
  return NAMING.phases[kind] || NAMING.phases.execute;
}`;
}
//# sourceMappingURL=naming.js.map