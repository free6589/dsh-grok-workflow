import type { RoleName } from './types.js';
/**
 * User-visible naming for the workflow progress panel (Issue #22, Phase 2).
 *
 * The stock Web GUI renders a workflow run as `workflow-run` node whose groups are
 * the *exact* `phase` string of each member and whose rows are the member `label`
 * (`@deepseek-ai/dsh-client-ui-workflow-run/lib/client.js:591-640` folds,
 * `WorkflowRunPanel` renders `readablePhase`/`readableMember` verbatim). Nothing in
 * that component maps an internal id to a display name, so every user-visible
 * string must already be final when the plugin records it. This module is that
 * single source of truth, and it exists twice by construction:
 *
 * - the host functions below build `meta.name`, `meta.phases` and the run title;
 * - {@link namingSource} emits the *same* table and the *same* two formatters as
 *   script-realm JS, because the guest script (src/script.ts) is the only place
 *   that knows the per-task index and the current attempt when it calls `agent()`.
 *
 * `test/naming.spec.ts` evaluates the emitted guest source and asserts it agrees
 * with the host functions for a matrix of inputs, so the two copies cannot drift.
 *
 * Rules encoded here (Issue #22, P1-1 / P1-3):
 *
 * - A task group is `任务 1 · <标题>`; the index is the plan position, so it is
 *   stable for the run and unique even when two tasks share a title (the stock
 *   fold keys a group by the whole phase string, so identical titles never merge).
 * - A member is `执行` / `检查` / `规划助手` / `汇总助手`, with `（尝试 2）` appended
 *   from the second attempt on. Provider-fallback suffixes (`-r1`), internal task
 *   ids and run ids never appear: the fallback route stays in the report's
 *   `routes` trail, and the internal task id stays in the report's task rows.
 * - Titles longer than {@link TASK_TITLE_DISPLAY_LIMIT} code points are truncated
 *   for the group header; the complete title is still in the report.
 */
/** Languages this plugin ships copy for (the DSH client ships the same two ids). */
export type NamingLanguage = 'zh' | 'en';
/** Shipped languages, in the order the settings page lists them. */
export declare const NAMING_LANGUAGES: readonly NamingLanguage[];
/**
 * Code points a task title may occupy inside a group header.
 *
 * 24 CJK characters fill the 42%-width `runTitle`/`phaseTitle` row on a 1280px
 * window; longer titles are ellipsised in the header and remain complete in the
 * report (`plan.tasks[].title`).
 */
export declare const TASK_TITLE_DISPLAY_LIMIT = 24;
/** Ellipsis appended to a truncated title (one code point, not three dots). */
export declare const TITLE_ELLIPSIS = "\u2026";
interface NamingCopy {
    /** Workflow name shown where the run itself is named. */
    readonly workflow: string;
    /** Role display names, keyed by the internal role name. */
    readonly roles: Record<RoleName, string>;
    /** Group header template; `{index}` is the 1-based plan position. */
    readonly taskGroup: string;
    /** Attempt suffix template, appended from attempt 2 on. */
    readonly attempt: string;
    /** Phase narration titles used by the guest script's `phase()` calls. */
    readonly phases: Record<'plan' | 'execute' | 'verify' | 'synthesize' | 'answer', string>;
    /** Task-count suffix of the run title; `{n}` is the known task total. */
    readonly tasks: string;
}
/**
 * The two shipped dictionaries.
 *
 * Chinese is the key-set source of truth (the repo's other dictionaries follow the
 * same rule), and `en` carries the same keys with natural English copy — no
 * Chinese appears in the English table.
 */
export declare const NAMING_COPY: Record<NamingLanguage, NamingCopy>;
/**
 * Resolve the copy language from an untrusted value.
 *
 * Only `en` (or an `en-*` tag) selects English; anything else — an absent
 * preference, `zh`, a malformed tag — stays Chinese, which is the shipped default.
 * @param value - candidate language tag.
 * @returns the language to render.
 */
export declare function resolveNamingLanguage(value: unknown): NamingLanguage;
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
export declare function namingLanguageFromSettings(descriptors: readonly {
    ns?: unknown;
    value?: unknown;
}[] | undefined): NamingLanguage;
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
export declare function truncateTaskTitle(title: unknown, limit?: number): string;
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
export declare function taskGroupTitle(index: number, title: unknown, language?: NamingLanguage): string;
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
export declare function memberLabel(role: RoleName, attempt?: number, language?: NamingLanguage): string;
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
export declare function parseMemberLabel(label: unknown, language?: NamingLanguage): {
    role: RoleName;
    attempt: number;
} | undefined;
/**
 * The workflow's own display name (the run container).
 * @param language - copy language.
 * @returns the name for that language.
 */
export declare function workflowDisplayName(language?: NamingLanguage): string;
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
export declare function runTitle(language: NamingLanguage, taskCount: number | undefined): string;
/**
 * Phase narration title for the guest script's `phase()` calls.
 * @param kind - which phase.
 * @param language - copy language.
 * @returns the title.
 */
export declare function phaseLabel(kind: 'plan' | 'execute' | 'verify' | 'synthesize' | 'answer', language?: NamingLanguage): string;
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
export declare function namingSource(): string;
export {};
//# sourceMappingURL=naming.d.ts.map