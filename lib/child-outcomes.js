/**
 * What each child run actually ended as, and the one report repair it enables.
 *
 * Why this module exists (T1, the null-semantics collapse): the published PTC
 * engine's guest returns `null` for *every* child that did not finish normally —
 * a dead provider, a timed-out child, a cancelled child and a child that merely
 * never submitted its structured result are one value there
 * (`WorkflowExecution.agent()`), and the host's `childResult()` forwards only
 * `{output, stopReason, structured}`, so the child's own failure detail never
 * reaches the script. The generated script therefore has one shape to describe
 * both cases, and it describes both as `format-error`.
 *
 * Measured (agent-99, 3691 child calls over 21 runs): 530 transport, auth and
 * timeout deaths were filed as format errors against 25 real ones.
 *
 * The engine stays untouched. What the plugin *can* see is the other side of the
 * same seam: `subagents.startActivation` hands back the child's run handle, whose
 * `result` settles with the real `stopReason` and provider `diagnostic`
 * (`src/team-engine.ts` records those into a bounded ledger). With that evidence
 * the host rewrites the null-collapse rows of the report it assembled, so the
 * report, the answer and the memory archive name the cause the child died of.
 *
 * Two limits are deliberate, and both are honest rather than convenient:
 *
 * - The repair is *reporting only*. The script's own routing decision was already
 *   taken on a null it could not explain, so this module never claims to have
 *   changed which route answered, how many attempts ran or whether a resubmit
 *   fired. Telling the script the cause needs a channel it does not have yet
 *   (`docs/knowledge/DECISIONS.md`, T1 step 2).
 * - A row is rewritten only when the evidence for it is unambiguous: every child
 *   of that role in the run must have died of the same class, and no child of that
 *   role may have *completed* without a structured result. A mixed run keeps the
 *   script's own wording, because a guess here would be the same defect in a new
 *   place.
 *
 * @module dsh-grok-workflow/child-outcomes
 */
import { parseMemberLabel } from './naming.js';
/** Child outcomes kept per context; older entries are dropped (bounded memory). */
export const CHILD_OUTCOME_LIMIT = 512;
/** Longest cause line this module writes into a report. */
export const CHILD_CAUSE_CHARS = 200;
/** The guest's null-collapse reason, as `src/script.ts` writes it. */
export const NULL_COLLAPSE_REASON = 'no valid structured result';
/**
 * The prefix the twin engine's refusal carries into the guest's `agent()` error.
 *
 * The engine's guest returns `null` for a child that did not finish cleanly, and
 * nothing else about that child crosses the worker boundary: `childResult()`
 * projects `{output, stopReason, structured}`. So a rejection is the only channel
 * the host has left for "this route's provider answered 503 twice" — the message
 * the engine renders into that rejection is what the guest can read. The script
 * parses the same marker back out of it (`src/script.ts` `childDeathCause`, pinned
 * equal by `test/dead-routes.spec.ts`).
 */
export const CHILD_DEATH_MARKER = 'CHILD_DEATH:';
/**
 * The families a child's death may be forwarded to the script for.
 *
 * Mirrors the guest's own read-back gate (`CHILD_DEATH_FAMILIES` in `src/script.ts`,
 * pinned equal by `test/dead-routes.spec.ts`). It is not the dead-route table: the
 * script counts only the four transport families (`ROUTE_HEALTH_FAMILIES`), so a
 * refused key advances the route chain and is never written down as a dead route —
 * what that needs is a key, not another route. Everything else keeps the null shape
 * it had: a cancelled run and a genuine format gap are not evidence about the route,
 * and the report repair (`reclassifyNullCollapses`) remains the only path that names
 * them.
 */
export const CHILD_DEATH_FAMILIES = ['timeout', 'connection', 'server-error', 'rate-limit', 'model-unavailable'];
/**
 * What this module says about a child that died with nothing in its log to name
 * the cause. It is deliberately a statement about the record, not about the child:
 * the old wording named a missing form ("no valid structured result"), which read
 * as "send it again" and was wrong for every dead child.
 */
export const CHILD_CAUSE_UNKNOWN = 'the child ended abnormally (cause unknown)';
/** A log that records nothing, for a context with no observed engine. */
const EMPTY_LOG = {
    mark: () => 0,
    since: () => [],
    of: () => undefined,
    add: () => { },
};
/**
 * Create a bounded child-outcome log.
 * @returns The log; all operations are synchronous and never throw.
 */
export function createChildOutcomeLog() {
    const entries = [];
    let seq = 0;
    let base = 0;
    return {
        mark: () => base + entries.length,
        since(mark) {
            const from = Math.max(0, mark - base);
            return entries.slice(from);
        },
        of(childId) {
            for (let index = entries.length - 1; index >= 0; index -= 1) {
                if (entries[index].childId === childId)
                    return entries[index];
            }
            return undefined;
        },
        add(outcome) {
            seq += 1;
            entries.push({ ...outcome, seq });
            if (entries.length > CHILD_OUTCOME_LIMIT) {
                const drop = entries.length - CHILD_OUTCOME_LIMIT;
                entries.splice(0, drop);
                base += drop;
            }
        },
    };
}
/** The log used when nothing observed the engine (non-PTC engine, bare tests). */
export function emptyChildOutcomeLog() {
    return EMPTY_LOG;
}
/**
 * The failure class a provider-neutral machine code names, when it names one
 * unambiguously.
 *
 * The codes are `@deepseek-ai/dsh-llm`'s `LlmFailure.code` vocabulary, which the
 * child session commits verbatim in its `turn/end`. They are a better basis than
 * the message text: a gateway that answers `401` with prose in another language,
 * or with no prose at all, still files the same code. Only clear mappings are
 * listed; anything else falls back to the shared message table, so an unknown
 * code cannot manufacture a class.
 * @param code - the failure code, when the log carried one.
 * @returns The class that code means, or `undefined` when it does not decide one.
 */
export function failureClassForCode(code) {
    if (code === undefined)
        return undefined;
    const byCode = {
        // This route cannot answer: another model or another credential may.
        AUTH: 'model-unavailable',
        INVALID_CREDENTIAL: 'model-unavailable',
        MISSING_CREDENTIAL: 'model-unavailable',
        NO_CREDENTIAL_STORE: 'model-unavailable',
        ACCOUNT_SIGN_IN_REQUIRED: 'model-unavailable',
        ACCOUNT_TOKEN_INVALID: 'model-unavailable',
        MODEL_UNSUPPORTED: 'model-unavailable',
        UNKNOWN_MODEL: 'model-unavailable',
        NO_ADAPTER: 'model-unavailable',
        INVALID_MODEL_CONTEXT: 'model-unavailable',
        INVALID_MODEL_MAX_TOKENS: 'model-unavailable',
        INVALID_MODEL_REASONING: 'model-unavailable',
        DISCOVERY_UNSUPPORTED: 'model-unavailable',
        // The route is throttled or out of budget: the same route may work later.
        RATE_LIMIT: 'rate-limit',
        QUOTA: 'rate-limit',
        ACCOUNT_QUOTA: 'rate-limit',
        TIMEOUT: 'timeout',
        SERVER: 'server-error',
        TRANSPORT: 'connection',
        STREAM_CLOSED: 'connection',
        ABORTED: 'cancelled',
    };
    const exact = byCode[code];
    if (exact !== undefined)
        return exact;
    const http = /^HTTP_(\d{3})$/.exec(code);
    if (http === null)
        return undefined;
    const status = Number(http[1]);
    if (status === 401 || status === 403 || status === 404)
        return 'model-unavailable';
    if (status === 408 || status === 504)
        return 'timeout';
    if (status === 429)
        return 'rate-limit';
    if (status >= 500)
        return 'server-error';
    return undefined;
}
/**
 * The failure class a child's terminal state means.
 *
 * `completed` is the only state that belongs to the format-error family: the
 * child finished and simply never submitted a structured result. Every other
 * state is a death, classified first from the provider's machine code and then
 * from its own words with the same table the script uses for a thrown failure
 * (`classifyChildFailureText`, pinned equal by `test/null-collapse.spec.ts`).
 * @param outcome - the child's terminal state.
 * @returns The class that state belongs to.
 */
export function childFailureClass(outcome) {
    const stop = outcome.stopReason;
    if (stop === 'completed')
        return 'format-error';
    if (stop === 'aborted' || stop === 'cancelled')
        return 'cancelled';
    if (stop === 'max-tokens' || stop === 'refusal')
        return 'unknown';
    return failureClassForCode(outcome.code) ?? classifyChildFailureText(outcome.diagnostic);
}
/**
 * Mirror of the generated script's `classifyFailureText` (src/script.ts).
 *
 * Mirrored rather than shared because the script is source text evaluated in the
 * engine's own realm; the two tables are pinned equal by a test that extracts the
 * guest function and compares verdicts on every message below. Keep the order and
 * the patterns identical: a class that changes on one side only would make the
 * pre-call and post-call wordings disagree.
 * @param value - failure text (a diagnostic, an error message, or anything).
 * @returns The class that text names, or `unknown`.
 */
export function classifyChildFailureText(value) {
    const message = String(value ?? '');
    if (/rate.?limit|too many requests|\b429\b|quota exceeded|resource[_ ]exhausted/i.test(message))
        return 'rate-limit';
    if (/\b5\d{2}\b|internal server error|bad gateway|service unavailable|gateway time|overloaded/i.test(message))
        return 'server-error';
    if (/ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|network error|fetch failed|connection (reset|refused|closed|dropped)/i.test(message))
        return 'connection';
    if (/timed? ?out|timeout|deadline exceeded|aborted/i.test(message))
        return 'timeout';
    if (/model .*(not found|not available|does not exist|is unavailable)|unknown model|no adapter|NO_ADAPTER|unsupported model|model_not_found/i.test(message))
        return 'model-unavailable';
    // Credential and permission refusals are the same conclusion for a reader: this
    // route cannot answer, so another model or route may. Without this arm a 403
    // lands in `unknown`, which reads as "we do not know what happened".
    if (/\b40[13]\b|unauthorized|forbidden|invalid api key|invalid_api_key|permission denied/i.test(message))
        return 'model-unavailable';
    if (/structured[_ ]output|schema (violation|mismatch|mismatched)|invalid (json|output|response)|could not parse|format error|expected ','|expected '}'|expected ':'|expected double-quoted property name|unexpected (end of json|token)/i.test(message))
        return 'format-error';
    return 'unknown';
}
/**
 * The rejection message for a child whose death the route may be blamed for, or
 * `undefined` when the null shape must stand.
 *
 * A route that keeps dying is worth skipping, but the script can only skip what
 * it can see. This is the one fact the host can put in front of it: the class the
 * child's own settlement named, in a message the guest parses. It is deliberately
 * narrow — a `completed` child that never submitted is a real format gap and a
 * cancellation is not the route's fault, so those keep arriving as `null` and keep
 * being repaired in the report instead. A refused key travels too, as
 * `model-unavailable`: the script has to stop resubmitting a call the gateway will
 * refuse identically, but its bookkeeping never counts that class as a dead route.
 * @param outcome - the child's terminal state.
 * @returns The one-line rejection message, or `undefined` to leave the null.
 */
export function childDeathRejection(outcome) {
    if (outcome.stopReason === 'completed')
        return undefined;
    const failureClass = childFailureClass(outcome);
    if (CHILD_DEATH_FAMILIES.indexOf(failureClass) === -1)
        return undefined;
    return `${CHILD_DEATH_MARKER} ${failureClass}: ${childStopPhrase(outcome)}`;
}
/** Who has to fix a failure of this class (mirrors `failureCategory` in the script). */
export function categoryForFailureClass(failureClass) {
    if (failureClass === 'cancelled')
        return 'cancelled';
    if (failureClass === 'task-failed' || failureClass === 'verification-failed')
        return 'quality';
    if (failureClass === 'budget-exhausted')
        return 'configuration';
    if (failureClass === 'unknown')
        return 'unknown';
    return 'infrastructure';
}
/** Collapse any text to one bounded line, without inventing content. */
function oneLine(value, limit = CHILD_CAUSE_CHARS) {
    const text = String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim();
    if (text.length <= limit)
        return text;
    return `${text.slice(0, Math.max(0, limit - 1))}…`;
}
/**
 * The plain-language cause of one child's death, for a report reason or a memory
 * entry. The stop reason leads (it is the engine's own word); the provider's
 * diagnostic follows when there is one.
 *
 * A death with no recorded detail says so. It never says the child "returned no
 * valid structured result": that sentence describes a missing form, so a reader
 * of a refused key or an expired deadline was told to do the wrong thing. The
 * wording of the empty case is {@link CHILD_CAUSE_UNKNOWN} for the same reason.
 * @param outcome - the child's terminal state.
 * @returns One bounded line naming the cause.
 */
export function childStopPhrase(outcome) {
    const stop = outcome.stopReason;
    const detail = oneLine(outcome.diagnostic, CHILD_CAUSE_CHARS - 40);
    let cause;
    if (stop === 'aborted' || stop === 'cancelled')
        cause = 'the child run was cancelled';
    else if (stop === 'max-tokens')
        cause = 'the child hit its own token ceiling';
    else if (stop === 'refusal')
        cause = 'the child declined the task';
    else if (stop === 'completed')
        cause = 'the child finished without submitting a structured result';
    else if (detail === '')
        return CHILD_CAUSE_UNKNOWN;
    else if (/timed? ?out|timeout|deadline exceeded/i.test(detail))
        cause = 'the child run timed out';
    else
        cause = 'the child run ended abnormally';
    return detail === '' ? cause : `${cause} (${detail})`;
}
/**
 * The reason line this module writes over a null-collapse row.
 * @param role - the role the row belongs to.
 * @param outcome - the child's terminal state.
 * @returns One bounded, redaction-friendly line.
 */
export function childFailureReason(role, outcome) {
    return oneLine(`${role} call produced no result: ${childStopPhrase(outcome)}`);
}
/** Whether a report row is the guest's null-collapse wording. */
function isCollapse(failureClass, reason) {
    return failureClass === 'format-error' && typeof reason === 'string' && reason.includes(NULL_COLLAPSE_REASON);
}
/** The role the guest's own reason line starts with, when it names one. */
function roleFromReason(reason) {
    const match = /^(planner|worker|verifier|supervisor|synthesizer)\b/.exec(reason.trim());
    return match === null ? undefined : match[1];
}
/** Normalize an attempt number to the 1-based numbering both sides use. */
function attemptKey(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 1)
        return 1;
    return Math.trunc(number);
}
function groupOutcomes(outcomes) {
    const attempt = new Map();
    const role = new Map();
    for (const outcome of outcomes) {
        if (outcome.role === undefined)
            continue;
        for (const [map, key] of [
            [attempt, `${outcome.role}|${attemptKey(outcome.attempt)}`],
            [role, outcome.role],
        ]) {
            const bucket = map.get(key);
            if (bucket === undefined)
                map.set(key, [outcome]);
            else
                bucket.push(outcome);
        }
    }
    return { attempt, role };
}
/**
 * The replacement a group of outcomes justifies, or `undefined` when the evidence
 * is not unanimous (see the module note: a guess is the defect this repairs).
 * @param role - the role being resolved, for the reason line.
 * @param entries - every outcome of that role (or of that role and attempt).
 * @returns The failure to write, or `undefined` to leave the row alone.
 */
function resolveGroup(role, entries) {
    if (entries.length === 0)
        return undefined;
    // A child that finished without submitting is a real format gap: the resubmit
    // path exists for exactly that case, so the group keeps its original wording.
    if (entries.some(entry => entry.stopReason === 'completed'))
        return undefined;
    const classes = new Set(entries.map(entry => childFailureClass(entry)));
    if (classes.size !== 1)
        return undefined;
    const failureClass = [...classes][0];
    // Prefer the entry that actually said something for the wording.
    const spoken = entries.find(entry => typeof entry.diagnostic === 'string' && entry.diagnostic.trim() !== '') ?? entries[0];
    return {
        class: failureClass,
        reason: childFailureReason(role, spoken),
        category: categoryForFailureClass(failureClass),
    };
}
/** Resolve one (role, attempt) pair against the group maps. */
function resolveOutcome(groups, role, attempt) {
    const exact = groups.attempt.get(`${role}|${attemptKey(attempt)}`);
    if (exact !== undefined)
        return resolveGroup(role, exact);
    const byRole = groups.role.get(role);
    return byRole === undefined ? undefined : resolveGroup(role, byRole);
}
/**
 * Rewrite every occurrence of a repaired reason — and the `[format-error]` class
 * marker the guest puts beside it — in one prose line.
 * @param value - the prose to repair, if the report has one.
 * @param repairs - the repairs already applied to the structured rows.
 * @returns The repaired prose, and the category to stamp when the line changed.
 */
function repairText(value, repairs) {
    if (value === undefined || repairs.length === 0)
        return { text: value };
    let text = value;
    let category;
    for (const repair of repairs) {
        if (!text.includes(repair.before))
            continue;
        text = text.split(repair.before).join(repair.after).split('[format-error]').join(`[${repair.class}]`);
        category = repair.category;
    }
    return category === undefined ? { text } : { text, category };
}
/**
 * Rewrite the null-collapse rows of an assembled report with the cause each child
 * actually died of.
 *
 * The report is repaired in place (its rows, its prose and the category a reader
 * uses to tell "the service failed" from "the work fell short"); the return value
 * is how many rows changed, so a caller can log the fact instead of trusting it.
 * @param report - the validated report to repair.
 * @param outcomes - the child settlements recorded during this run.
 * @returns How many structured rows were rewritten.
 */
export function reclassifyNullCollapses(report, outcomes) {
    const groups = groupOutcomes(outcomes);
    if (groups.attempt.size === 0)
        return 0;
    const repairs = [];
    /** The repair each task row earned, so the answer's own lines can be rebuilt. */
    const byTask = new Map();
    let rewritten = 0;
    for (const entry of report.routes) {
        if (!isCollapse(entry.failureClass, entry.reason))
            continue;
        const next = resolveOutcome(groups, entry.role, entry.attempt);
        if (next === undefined)
            continue;
        repairs.push({ before: entry.reason, after: next.reason, class: next.class, category: next.category ?? 'unknown' });
        entry.failureClass = next.class;
        entry.reason = next.reason;
        rewritten += 1;
    }
    for (const task of report.tasks) {
        for (const attempt of task.attempts) {
            const failure = attempt.failure;
            if (failure === undefined || !isCollapse(failure.class, failure.reason))
                continue;
            const role = roleFromReason(failure.reason) ?? 'worker';
            const next = resolveOutcome(groups, role, attempt.attempt);
            if (next === undefined)
                continue;
            repairs.push({ before: failure.reason, after: next.reason, class: next.class, category: next.category ?? 'unknown' });
            attempt.failure = next;
            byTask.set(task.id, next);
            rewritten += 1;
        }
    }
    const planFailure = report.plan.failure;
    if (planFailure !== undefined && planFailure !== null && isCollapse(planFailure.class, planFailure.reason)) {
        const next = resolveOutcome(groups, 'planner', 1);
        if (next !== undefined) {
            repairs.push({ before: planFailure.reason, after: next.reason, class: next.class, category: next.category ?? 'unknown' });
            report.plan.failure = next;
            rewritten += 1;
        }
    }
    if (rewritten === 0)
        return 0;
    // The prose a reader actually sees. The guest composed these lines from the
    // failure it saw, so they carry the very wording just repaired.
    for (const item of report.incomplete) {
        const repaired = repairText(item.reason, repairs);
        item.reason = repaired.text ?? item.reason;
        if (repaired.category !== undefined)
            item.category = repaired.category;
    }
    for (const item of report.errors) {
        const repaired = repairText(item.message, repairs);
        item.message = repaired.text ?? item.message;
        if (repaired.category !== undefined)
            item.category = repaired.category;
    }
    for (const task of report.tasks) {
        const taskText = repairText(task.error, repairs).text;
        if (taskText !== undefined)
            task.error = taskText;
        for (const attempt of task.attempts) {
            const attemptText = repairText(attempt.error, repairs).text;
            if (attemptText !== undefined)
                attempt.error = attemptText;
        }
    }
    const planText = repairText(report.plan.error, repairs).text;
    if (planText !== undefined)
        report.plan.error = planText;
    const synthesisText = repairText(report.synthesis.error, repairs).text;
    if (synthesisText !== undefined)
        report.synthesis.error = synthesisText;
    // The delivered answer carries its own copy of the same rows: the generated
    // script copied the *pre-repair* reason into its report-notes block, and the
    // delivery prints that block verbatim. Matching it by sentence failed on every
    // real run (`report.incomplete[].reason` and `failure.reason` are not the same
    // string), so the block is rebuilt by task id instead.
    const answered = repairAnswerNotes(report.synthesis.summary, byTask, repairs);
    if (answered !== undefined)
        report.synthesis.summary = answered;
    return rewritten;
}
/** The marker lines the generated script writes above its incomplete bullets. */
const INCOMPLETE_MARKERS = ['仍未完成（来自报告）', 'Still incomplete (from the report)'];
/** The bound the generated script applies to one reason inside the notes block. */
const NOTES_REASON_CHARS = 160;
/** Bound one reason the way the generated script's `clip` does. */
function boundCause(reason) {
    const raw = reason.trim();
    if (raw.length <= NOTES_REASON_CHARS)
        return raw;
    return `${raw.slice(0, Math.max(0, NOTES_REASON_CHARS - 1))}…`;
}
/**
 * Rebuild the answer's "still incomplete" bullets from the repaired rows.
 *
 * The answer is model prose with a machine block appended after it, so the block's
 * bullets are deterministic text the host can rewrite exactly. The match is by
 * task id (and by the block's own marker), not by the reason sentence: the reason
 * in the answer was copied before the repair and may also be clipped, so a
 * sentence-level `includes()` is the wrong key — measured: zero of the delivered
 * lines matched while every structured row had been repaired.
 *
 * A sentence-level pass runs first, which covers every line whose wording was
 * copied verbatim. A block that cannot be found, or a bullet whose task was not
 * repaired, is left exactly as written.
 * @param summary - the answer text, when the report has one.
 * @param rows - the repair each task earned, by task id.
 * @param repairs - every repair applied to the structured rows.
 * @returns The rebuilt answer, or `undefined` when the report has none.
 */
function repairAnswerNotes(summary, rows, repairs) {
    if (summary === undefined)
        return undefined;
    const exact = repairText(summary, repairs).text ?? summary;
    if (rows.size === 0)
        return exact;
    const lines = exact.split('\n');
    let inBlock = false;
    let changed = false;
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const trimmed = line.trim();
        if (INCOMPLETE_MARKERS.some(marker => trimmed.startsWith(marker))) {
            inBlock = true;
            continue;
        }
        if (!inBlock)
            continue;
        // The block ends at its first line that is not one of its own bullets.
        if (!trimmed.startsWith('-')) {
            inBlock = false;
            continue;
        }
        const match = /^(\s*-\s*(?:任务|task)\s+)(\S+?)(\s*[：:]\s*)(.*)$/u.exec(line);
        if (match === null)
            continue;
        const next = rows.get(match[2]);
        if (next === undefined)
            continue;
        const rebuilt = `${match[1]}${match[2]}${match[3]}${boundCause(next.reason)}`;
        if (rebuilt === line)
            continue;
        lines[index] = rebuilt;
        changed = true;
    }
    return changed ? lines.join('\n') : exact;
}
/**
 * Re-exported so a caller can name the role of a title line the same way here.
 *
 * A task child's title is `角色 · 任务标题`, so the head before the separator is the
 * role — but a numbered summary draft is `汇总·第1稿`, where the separator is part of
 * the name. The whole line is therefore tried first and the head second.
 */
export function roleOfChildTitle(title) {
    const head = title.split('·')[0]?.trim() ?? '';
    return parseMemberLabel(title.trim(), 'zh')
        ?? parseMemberLabel(title.trim(), 'en')
        ?? parseMemberLabel(head, 'zh')
        ?? parseMemberLabel(head, 'en');
}
//# sourceMappingURL=child-outcomes.js.map