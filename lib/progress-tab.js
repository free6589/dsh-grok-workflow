/**
 * The "进度" conversation tab: the pure half.
 *
 * The tab renders the four `tool-workflow/*` session events this plugin's own recorder
 * writes (`src/records.ts`, `createWorkflowProgressRecorder`) as one horizontal track of
 * stage nodes, plus the two optional payloads a stream may carry:
 * `tool-workflow/stage-detail` (field values) and `tool-workflow/summary-final` (which
 * summary draft the run actually shipped). Both only ever *add* to what a stream
 * without them renders. This module is the fold, the state precedence, the percentage and the detail
 * provenance, with no React, no DOM, no clock and no estimate, so every rule the browser
 * half applies can be tested here; `src/client/index.js` carries the same rules as
 * hand-written JavaScript (the host serves that bundle verbatim, so it cannot import this
 * file) and `test/client.spec.ts` pins the two apart from drifting.
 *
 * What the data can and cannot say (measured against DSH 0.2.1-rc.2, see
 * `docs/knowledge/DESIGN-progress-tab.md`):
 *
 * - `run-start` names the run; `agent-start` declares one child call (seq, label, phase,
 *   childId); `agent-end` settles one call by seq; `run-end` closes the run.
 * - Nothing in the stream declares a *plan*: there is no task total, no ETA, no verdict.
 *   The percentage is therefore settled rows over **declared rows** — the members the
 *   engine actually announced — and the copy says so. When no row was declared it is
 *   absent, never 0 %.
 * - A run that ended with a row it never settled is `blocked` and says so in its tooltip:
 *   the stream cannot tell a cancellation from a crash, so the tab does not guess one.
 * - `cancelled` is the engine's own outcome word, kept verbatim rather than re-derived.
 * - `failed` is a *current* failure. Attempts are rows, so a task that failed attempt 1 and
 *   verified on attempt 2 carries both rows; the later completion replaces the earlier
 *   failure for the aggregate (card, segment, bar) while the failed row keeps its own mark
 *   (`recoveredFailureSeqs`). Red therefore means "still broken now", never "was broken".
 */
import { NAMING_LANGUAGES, SYNTHESIS_FINAL_MARK, synthesisDraftLabel } from './naming.js';
/**
 * The eight progress and Guardian lifecycle events the tab folds — and, in the bundle, the
 * whitelist the host routes the tab by.
 *
 * One name, two homes, one list: this copy is what {@link foldProgressRuns} reads, and
 * `src/client/index.js` carries the same constant (served verbatim, so it cannot import this
 * table) where it serves both its mirror of the fold and the tab's event routing, which
 * drops any event this list does not name. The two must agree entry for entry, and neither
 * half can see the other: an event named only here is routed away before the fold ever sees
 * it, an event named only there is handed over and silently ignored. Both failures are
 * invisible on screen, so `test/progress-tab.spec.ts` compares the shipped list with this
 * one and fails on a single missing or extra entry.
 *
 * `tool-workflow/stage-detail` is deliberately **not** here: it only ever *adds* field
 * values to a node and never decides a state, so it is not a lifecycle event and does not
 * belong in the routing list ({@link PROGRESS_DETAIL_EVENT_TYPE}).
 */
export const PROGRESS_EVENT_TYPES = [
    'tool-workflow/run-start',
    'tool-workflow/agent-start',
    'tool-workflow/agent-end',
    'tool-workflow/summary-final',
    'tool-workflow/guardian-start',
    'tool-workflow/guardian-finding',
    'tool-workflow/guardian-end',
    'tool-workflow/run-end',
];
/**
 * The optional detail payload, kept apart from {@link PROGRESS_EVENT_TYPES} on purpose.
 *
 * Track state comes from progress lifecycle events; Guardian findings only populate its side lane. This
 * one only ever *adds* field values to a node, so a stream without it renders exactly
 * what it rendered before. `createWorkflowProgressRecorder` does not write it today; the
 * tab reads it so that a recorder (or another bundle) that does write it is used instead
 * of being ignored — the detail ladder's level 1 is a real read path, not a placeholder.
 */
export const PROGRESS_DETAIL_EVENT_TYPE = 'tool-workflow/stage-detail';
/**
 * The event that names the summary draft the run shipped.
 *
 * It is a member of {@link PROGRESS_EVENT_TYPES} — a tab the host never hands the event to
 * cannot mark the draft — but it is not a lifecycle step like the others: a chat row's label
 * is fixed at `agent-start` (the panel only ever matches an `agent-end` to it by `seq`), so
 * "this draft is the final one" cannot be said by renaming a row after the fact. It arrives
 * as its own fact once the gate has passed a draft, and the fold settles it onto the row
 * that landed. A stream without it renders exactly what it rendered before.
 */
export const PROGRESS_SUMMARY_FINAL_EVENT_TYPE = 'tool-workflow/summary-final';
/** Registered conversation target of the progress view (namespaced so a collision throws). */
export const PROGRESS_VIEW_TARGET = 'grok-progress';
/** Conversation node kind owned by the tab (namespaced for the same reason). */
export const PROGRESS_NODE_KIND = 'grok-progress-run';
/** The seven fields an AGENTS.md coordination block reports, in render order. */
export const DETAIL_FIELDS = [
    'workCommit',
    'changes',
    'testsRun',
    'results',
    'localRuntimeVerified',
    'blockers',
    'nextAction',
];
/**
 * The spellings one field is written as, folded to its canonical key.
 *
 * A coordination block is a shared format, not this tab's private schema: the labels
 * `AGENTS.md` prescribes are `WORK_COMMIT` / `CHANGES` / `TESTS_RUN` / `TEST_RESULTS` /
 * `LOCAL_RUNTIME_VERIFIED` / `BLOCKERS` / `NEXT_ACTION`, while a JSON block writes them
 * in camelCase. Both spell the same seven facts, so both resolve to one key and a reader
 * sees one row per fact.
 */
const DETAIL_FIELD_BY_TOKEN = {
    workcommit: 'workCommit',
    changes: 'changes',
    change: 'changes',
    testsrun: 'testsRun',
    tests: 'testsRun',
    results: 'results',
    result: 'results',
    testresults: 'results',
    localruntimeverified: 'localRuntimeVerified',
    blockers: 'blockers',
    blocker: 'blockers',
    nextaction: 'nextAction',
    next: 'nextAction',
};
/** Fold one written field name (`WORK_COMMIT`, `workCommit`, `next_action`) to its key. */
function canonicalDetailField(name) {
    return DETAIL_FIELD_BY_TOKEN[name.toLowerCase().replace(/[^a-z0-9]/g, '')];
}
/**
 * The track's fixed spine: this engine's own phases, in the order it runs them.
 *
 * The four work stages are the phase headers `src/naming.ts` actually emits for a staged
 * delivery job — `规划` / `执行` / `检查` / `汇总` (`phaseLabel`: plan, execute,
 * verify, synthesize) — plus one slot for the plan tasks themselves, which the
 * engine announces as `任务 n · 标题` (`taskGroupTitle`) and which land between `执行`
 * and `检查` because that is where the workers run. The final answer is relayed in the
 * turn's own message, never as a workflow child call,
 * so no `回答` event can ever reach this track — the spine does not list a stage no
 * event can fill. A stage whose token no recorded phase carries stays `pending` and
 * says it was not reported; a phase that names no stage becomes a node of its own, so
 * the spine never hides a declared phase.
 */
export const PROGRESS_STAGES = [
    { key: 'start', tokens: [], edge: true },
    { key: 'plan', tokens: ['规划', 'plan'], edge: false },
    { key: 'execute', tokens: ['执行', 'execute'], edge: false },
    { key: 'verify', tokens: ['检查', '核验', 'verify'], edge: false },
    { key: 'synthesize', tokens: ['汇总', 'synthesize'], edge: false },
    { key: 'end', tokens: [], edge: true },
];
/**
 * The fixed per-task chain, in render order: `执行` → `检查` → `复核`
 * (`worker` → `verifier` → `supervisor`).
 *
 * A task's rows arrive as role calls, so a card can say which gates a task actually
 * reached. The chain is fixed rather than derived from what arrived: a capsule no row
 * reached renders `pending` with a dashed border, because "the verify call never ran" is
 * a fact a reader needs, and a missing capsule would hide it.
 */
export const PROGRESS_CHAIN = [
    { key: 'execute', tokens: ['执行', 'execute', 'worker'] },
    { key: 'check', tokens: ['检查', '核验', 'verify', 'check', 'verifier'] },
    { key: 'review', tokens: ['复核', 'review', 'supervisor', 'reviewer'] },
];
/** Narrow an unknown value to a plain record. */
function asRecord(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return undefined;
    return value;
}
/** Normalize one field value to display text; empty values are "not reported". */
function fieldText(value) {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed === '' ? undefined : trimmed;
    }
    if (typeof value === 'number' && Number.isFinite(value))
        return String(value);
    if (typeof value === 'boolean')
        return value ? 'true' : 'false';
    if (Array.isArray(value)) {
        const parts = value.map(fieldText).filter((part) => part !== undefined);
        return parts.length === 0 ? undefined : parts.join(' · ');
    }
    return undefined;
}
/**
 * Read the known detail fields out of one record.
 *
 * Names are canonicalized first, so `WORK_COMMIT`, `workCommit` and `next_action` all
 * land on the field that owns them, and the first written spelling of a fact wins over a
 * later alias.
 * @param source - a `stage-detail` payload or a parsed coordination object.
 * @returns the fields it carried, keyed canonically.
 */
function pickDetailFields(source) {
    const fields = {};
    for (const [name, raw] of Object.entries(source)) {
        const key = canonicalDetailField(name);
        if (key === undefined || fields[key] !== undefined)
            continue;
        const text = fieldText(raw);
        if (text !== undefined)
            fields[key] = text;
    }
    return fields;
}
/**
 * Fold recorded events into runs.
 *
 * Order-insensitive and idempotent: a repeated `agent-start` does not add a second row, a
 * repeated `agent-end` cannot change an outcome twice (last settlement wins, as a replay
 * of the same event carries the same value), and an `agent-end` that arrives before its
 * own `agent-start` still settles the row once the start appears. A run with no
 * `run-start` is dropped: the node that opens the run is what the recorder writes first,
 * and inventing a run from a settlement would be a claim about work nobody announced.
 * @param records - recorded events, in any order.
 * @returns runs in ascending `anchorSeq` order.
 */
export function foldProgressRuns(records) {
    const drafts = new Map();
    let index = 0;
    /** Announce every run first: the fold is order-insensitive, so an `agent-start` that
     * arrives before its `run-start` still belongs to that run. */
    for (const record of records) {
        const seq = typeof record.seq === 'number' && Number.isFinite(record.seq) ? record.seq : index;
        index += 1;
        if (record.type !== 'tool-workflow/run-start')
            continue;
        const data = asRecord(record.data) ?? {};
        const runId = typeof data['runId'] === 'string' ? data['runId'] : undefined;
        if (runId === undefined || drafts.has(runId))
            continue;
        drafts.set(runId, {
            runId,
            name: typeof data['name'] === 'string' ? data['name'] : '',
            anchorSeq: seq,
            members: new Map(),
            order: [],
            settlements: new Map(),
            details: [],
            ...record.time === undefined ? {} : { startedAt: record.time },
        });
    }
    index = 0;
    for (const record of records) {
        const seq = typeof record.seq === 'number' && Number.isFinite(record.seq) ? record.seq : index;
        index += 1;
        const data = asRecord(record.data) ?? {};
        const runId = typeof data['runId'] === 'string' ? data['runId'] : undefined;
        const isDetail = record.type === PROGRESS_DETAIL_EVENT_TYPE;
        const isSummaryFinal = record.type === PROGRESS_SUMMARY_FINAL_EVENT_TYPE;
        if (!isDetail && !isSummaryFinal && !PROGRESS_EVENT_TYPES.includes(record.type))
            continue;
        if (runId === undefined)
            continue;
        if (record.type === 'tool-workflow/run-start')
            continue;
        const draft = drafts.get(runId);
        if (draft === undefined)
            continue;
        if (seq < draft.anchorSeq)
            draft.anchorSeq = seq;
        if (isDetail) {
            const fields = pickDetailFields(data);
            const coordinationText = typeof data['coordination'] === 'string' ? data['coordination'] : undefined;
            // An empty payload is not a report: it would add a row of dashes that claims the
            // stage was measured and found blank.
            if (Object.keys(fields).length === 0 && coordinationText === undefined)
                continue;
            const phase = typeof data['phase'] === 'string' ? data['phase'] : undefined;
            draft.details.push({
                fields,
                ...phase === undefined ? {} : { phase },
                ...coordinationText === undefined ? {} : { coordinationText },
            });
            continue;
        }
        if (isSummaryFinal) {
            // First valid claim wins: a duplicate is a no-op, and a later (different)
            // claim cannot move the mark off the draft that actually shipped.
            const draftNumber = Number(data['draft']);
            if (!Number.isFinite(draftNumber) || Math.trunc(draftNumber) < 1)
                continue;
            if (draft.summaryFinalDraft === undefined)
                draft.summaryFinalDraft = Math.trunc(draftNumber);
            continue;
        }
        if (record.type === 'tool-workflow/guardian-start') {
            const previous = draft.guardian;
            const budget = Number(data['budgetMs']);
            draft.guardian = {
                started: true,
                armed: data['armed'] === true,
                budgetMs: Number.isFinite(budget) && budget > 0 ? Math.trunc(budget) : 0,
                ended: previous?.ended ?? false,
                cancelled: previous?.cancelled ?? false,
                findings: previous?.findings ?? [],
            };
            continue;
        }
        if (record.type === 'tool-workflow/guardian-finding') {
            const memberSeq = Number(data['seq']);
            if (!Number.isFinite(memberSeq))
                continue;
            const guardian = draft.guardian ?? {
                started: false, armed: false, budgetMs: 0, ended: false, cancelled: false, findings: [],
            };
            guardian.findings.push({
                seq: memberSeq,
                label: typeof data['label'] === 'string' ? data['label'] : '',
                signal: data['signal'] === 'heartbeat-loss' ? 'heartbeat-loss' : 'timeout',
                action: data['action'] === 'rescue' ? 'rescue' : data['action'] === 'cancel-run' ? 'cancel-run' : 'observe',
                reason: typeof data['reason'] === 'string' ? data['reason'] : '',
                ...typeof data['atMs'] === 'number' && Number.isFinite(data['atMs']) ? { atMs: data['atMs'] } : {},
            });
            draft.guardian = guardian;
            continue;
        }
        if (record.type === 'tool-workflow/guardian-end') {
            const previous = draft.guardian ?? {
                started: false, armed: false, budgetMs: 0, ended: false, cancelled: false, findings: [],
            };
            draft.guardian = { ...previous, ended: true, cancelled: data['cancelled'] === true };
            continue;
        }
        if (record.type === 'tool-workflow/agent-start') {
            const memberSeq = Number(data['seq']);
            if (!Number.isFinite(memberSeq))
                continue;
            if (draft.members.has(memberSeq))
                continue;
            const phase = typeof data['phase'] === 'string' ? data['phase'] : undefined;
            draft.members.set(memberSeq, {
                seq: memberSeq,
                label: typeof data['label'] === 'string' ? data['label'] : '',
                childId: typeof data['childId'] === 'string' ? data['childId'] : '',
                order: draft.order.length,
                ...phase === undefined ? {} : { phase },
                ...record.time === undefined ? {} : { startedAt: record.time },
            });
            draft.order.push(memberSeq);
            continue;
        }
        if (record.type === 'tool-workflow/agent-end') {
            const memberSeq = Number(data['seq']);
            if (!Number.isFinite(memberSeq))
                continue;
            draft.settlements.set(memberSeq, typeof data['outcome'] === 'string' ? data['outcome'] : 'failed');
            const member = draft.members.get(memberSeq);
            if (member !== undefined && record.time !== undefined)
                member.endedAt = record.time;
            continue;
        }
        // run-end
        if (draft.stopReason === undefined) {
            draft.stopReason = typeof data['stopReason'] === 'string' ? data['stopReason'] : 'error';
            if (record.time !== undefined)
                draft.endedAt = record.time;
        }
    }
    const runs = [];
    for (const draft of drafts.values()) {
        for (const [memberSeq, outcome] of draft.settlements) {
            const member = draft.members.get(memberSeq);
            // Settle an already-declared row; an outcome for a row the stream never declared is
            // not a row (a row means a child call that started).
            if (member !== undefined)
                member.outcome = outcome;
        }
        if (draft.summaryFinalDraft !== undefined)
            markFinalDraft(draft.members.values(), draft.summaryFinalDraft);
        const members = draft.order.map((memberSeq) => draft.members.get(memberSeq)).filter((member) => member !== undefined);
        runs.push({
            runId: draft.runId,
            name: draft.name,
            anchorSeq: draft.anchorSeq,
            members,
            details: draft.details,
            ...draft.guardian === undefined ? {} : { guardian: draft.guardian },
            ...draft.startedAt === undefined ? {} : { startedAt: draft.startedAt },
            ...draft.endedAt === undefined ? {} : { endedAt: draft.endedAt },
            ...draft.stopReason === undefined ? {} : { stopReason: draft.stopReason },
            ...draft.summaryFinalDraft === undefined ? {} : { summaryFinalDraft: draft.summaryFinalDraft },
        });
    }
    return runs.sort((left, right) => left.anchorSeq - right.anchorSeq);
}
/**
 * Mark the row of the summary draft the run shipped.
 *
 * The rows are recognised by their own numbered name in either shipped language
 * (`汇总·第2稿` / `Summarize · draft 2`) and the mark is the naming table's, so the
 * two cannot disagree about what "final" looks like.
 *
 * That draft can have **two** rows: the first call and its same-draft resubmit (a
 * call that answered in prose and was asked once more). Only the later one lands —
 * the earlier row recorded nothing — so only the row with the highest `order` is
 * marked, and a reader never sees two "final" rows for one draft. A duplicate event,
 * an event that arrives before its rows, and a stream with no such event at all all
 * render exactly what they rendered before.
 * @param members - every folded row of the run.
 * @param draft - 1-based draft number the gate shipped.
 */
function markFinalDraft(members, draft) {
    for (const language of NAMING_LANGUAGES) {
        const name = synthesisDraftLabel(draft, language);
        let landed;
        for (const member of members) {
            if (member.label !== name)
                continue;
            if (landed === undefined || member.order > landed.order)
                landed = member;
        }
        if (landed === undefined)
            continue;
        landed.label = synthesisDraftLabel(draft, language, true);
        return;
    }
}
/**
 * Pick the run the tab shows: the latest announced run.
 *
 * A workflow can run more than once in one session, so the tab follows the newest
 * `run-start` (highest `anchorSeq`). When two runs share the anchor (impossible from the
 * recorder, possible from a hand-written session) the still-open one wins, because it is
 * the one a reader can still watch.
 * @param runs - folded runs.
 * @returns the active run, or undefined when the session has none.
 */
export function selectActiveRun(runs) {
    let best;
    for (const run of runs) {
        if (best === undefined) {
            best = run;
            continue;
        }
        if (run.anchorSeq > best.anchorSeq) {
            best = run;
            continue;
        }
        if (run.anchorSeq === best.anchorSeq && best.stopReason !== undefined && run.stopReason === undefined)
            best = run;
    }
    return best;
}
/**
 * The label a retry adds, taken back off: `<role>（尝试 2）` / `<role> (attempt 2)` → `<role>`.
 *
 * `naming.ts` `memberLabel` appends the attempt suffix and nothing else, so dropping a
 * trailing bracketed run that carries a digit folds the attempts of one call onto one
 * lane without re-parsing roles here. A label with no such suffix is its own base.
 * @param label - a recorded row label.
 * @returns the label without an attempt suffix.
 */
function attemptBaseLabel(label) {
    const text = typeof label === 'string' ? label.trim() : '';
    const match = /^(.*?)\s*[（(][^（()）]*\d[^（()）]*[)）]$/u.exec(text);
    if (match === null)
        return text;
    return (match[1] ?? '').trim();
}
/**
 * The unit one row belongs to: one task's one role call, across its attempts.
 *
 * Two rows share a unit when they name the same phase and the same role lane, which is
 * exactly what a retry keeps (`任务 2 · 标题` + `执行` on every attempt) and what tells two
 * different tasks apart — the worker rows of `任务 1` and `任务 2` share a label but not a
 * phase, so a completion in one task can never mark the other task's failure recovered.
 * @param member - one folded row.
 * @returns the unit key.
 */
function attemptUnitOf(member) {
    return `${member.phase ?? ''}\u0000${attemptBaseLabel(member.label)}`;
}
/**
 * The rows whose failure a later attempt of the same unit has already replaced.
 *
 * Red means *still broken now*, so a failure is only current while nothing later in its
 * own unit settled `completed` — a retry, or a resubmit that produced the structured
 * result the first call missed. A failure with a later attempt still running stays
 * current (it is not recovered yet); a failure in another unit, however recently that
 * other unit completed, stays current. The row itself keeps its own mark either way:
 * this decides what the card, the segment and the bar colour, not what the row says.
 * @param members - rows aggregated by one node.
 * @returns the `seq` of every recovered failure row.
 */
export function recoveredFailureSeqs(members) {
    const recovered = new Set();
    for (const member of members) {
        if (member.outcome !== 'failed')
            continue;
        const unit = attemptUnitOf(member);
        for (const later of members) {
            if (later.order <= member.order)
                continue;
            if (later.outcome !== 'completed')
                continue;
            if (attemptUnitOf(later) !== unit)
                continue;
            recovered.add(member.seq);
            break;
        }
    }
    return recovered;
}
/**
 * How many of a node's rows are failing *now* — recovered history excluded.
 *
 * This is the count the red badge shows. The failure badge names work that is still
 * broken; a failure a later attempt replaced is visible on its own row pill, which is
 * the row-level trace the card keeps.
 * @param members - rows aggregated by one node.
 * @returns the number of unrecovered failed rows.
 */
export function currentFailureCount(members) {
    const recovered = recoveredFailureSeqs(members);
    let count = 0;
    for (const member of members) {
        if (member.outcome === 'failed' && !recovered.has(member.seq))
            count += 1;
    }
    return count;
}
/**
 * The state of one node, in the precedence the design fixes:
 * `failed` → `doing` → `done` → `blocked` → `cancelled` → `pending`.
 *
 * `failed` is a *current* failure: a row whose failure a later attempt of the same unit
 * replaced no longer colours the aggregate (see {@link recoveredFailureSeqs}), because red
 * has to mean "still broken now" — one task that failed and then verified cleanly must not
 * dye the stage that ran it, the bar, or its own card. The row keeps its own red mark; only
 * the aggregate clears.
 *
 * `blocked` is the only derived state: the run ended (or the engine reported an outcome
 * that is neither a completion nor a cancellation) while a row was still unsettled. The
 * stream cannot say why, so the node says "blocked" and its tooltip names the evidence.
 * @param members - rows aggregated by this node.
 * @param ended - whether `run-end` was seen for the run.
 * @returns the node state.
 */
export function nodeState(members, ended) {
    const recovered = recoveredFailureSeqs(members);
    const current = recovered.size === 0 ? members : members.filter((member) => !recovered.has(member.seq));
    const settled = current.filter((member) => member.outcome !== undefined);
    const unsettled = current.length - settled.length;
    if (settled.some((member) => member.outcome === 'failed'))
        return 'failed';
    if (!ended && unsettled > 0)
        return 'doing';
    if (settled.length > 0 && settled.length === current.length && settled.every((member) => member.outcome === 'completed'))
        return 'done';
    if (ended && unsettled > 0)
        return 'blocked';
    if (settled.some((member) => member.outcome === 'cancelled'))
        return 'cancelled';
    if (settled.some((member) => member.outcome !== 'completed' && member.outcome !== 'cancelled'))
        return 'blocked';
    return 'pending';
}
/** Why a node is `blocked`, so the tooltip can name the evidence (never a guess). */
function blockedReason(members, ended) {
    const unsettled = members.length - members.filter((member) => member.outcome !== undefined).length;
    return ended && unsettled > 0 ? 'runEndedUnsettled' : 'outcomeUnsettled';
}
/**
 * Rows settled over rows declared.
 * @param members - any set of declared rows.
 * @returns the percentage, absent when nothing was declared.
 */
export function percentOf(members) {
    const declared = members.length;
    if (declared === 0)
        return undefined;
    const settled = members.filter((member) => member.outcome !== undefined).length;
    return { settled, declared, value: Math.round((settled / declared) * 100) };
}
/** Whether one character can continue a Latin word (so a token boundary is not here). */
function isWordChar(character) {
    return character !== '' && /[a-z0-9_]/i.test(character);
}
/**
 * Whether one phase header carries one stage token.
 *
 * A token made only of non-Latin characters is matched as a substring, which is what a
 * word means in a script without spaces (`规划` in `任务 1 · 规划`). A token with Latin
 * letters must sit on word boundaries: matched loosely, `ui` hits `build`, `tag` hits
 * `stage` and `target`, and `sync` hits `async`, which is how the old spine reported
 * stages that never ran. Both tests are done on the lowercased header.
 * @param haystack - the lowercased phase header.
 * @param token - one stage token.
 * @returns true when the header names the token.
 */
function phaseCarriesToken(haystack, token) {
    const needle = token.toLowerCase();
    if (needle === '')
        return false;
    if (!/[a-z0-9]/i.test(needle))
        return haystack.includes(needle);
    let from = 0;
    for (;;) {
        const at = haystack.indexOf(needle, from);
        if (at === -1)
            return false;
        const before = at === 0 ? '' : haystack.slice(at - 1, at);
        const after = haystack.slice(at + needle.length, at + needle.length + 1);
        if (!isWordChar(before) && !isWordChar(after))
            return true;
        from = at + 1;
    }
}
/** The first spine stage whose token the phase header carries.
 *
 * Numbered plan tasks (`任务 7 · 标题`) always win over stage tokens: a title that
 * mentions a stage word (`任务 7 · 合并为干净可并发执行计划`) names a plan task,
 * not the `执行` stage. Without this, the extra task lands as a stage row under
 * `规划`.
 */
export function stageForPhase(phase) {
    if (taskNumberIn(phase) !== undefined)
        return undefined;
    const haystack = phase.toLowerCase();
    for (const stage of PROGRESS_STAGES) {
        if (stage.edge)
            continue;
        if (stage.tokens.some((token) => phaseCarriesToken(haystack, token)))
            return stage;
    }
    return undefined;
}
/**
 * Role labels that name a work stage when a row's phase header does not.
 *
 * A recorded `agent-start` carries two different kinds of `phase`: the phase a role call
 * belongs to (`执行`, `检查`) for the fixed stages, and the plan-task group title
 * (`任务 1 · 标题`) for the worker and verifier calls that run *inside* a task. Matched by
 * phase alone, those rows name no stage — which is why the panel reported `执行` and
 * `检查`, the two stages every run performs, as never reported.
 *
 * The words here are role names, not free-form headers, so they are matched only against
 * a row's label and never against a phase: a task titled `检查登录` must keep binding by
 * its phase, and a task titled `check the build` must not become `检查` because of a
 * substring inside its own title.
 */
const STAGE_ROLE_LABELS = {
    // `规划` / `汇总` cover the numbered names a repeated leg carries
    // (`规划（第2次）`, `汇总·第2稿`); the bare role words still cover every
    // single-call leg and every history row.
    plan: ['规划助手', '规划', 'planner'],
    execute: ['执行', 'execute', 'worker'],
    verify: ['检查', '核验', 'verify', 'check', 'verifier'],
    synthesize: ['汇总助手', '汇总', 'summarize', 'synthesizer'],
};
/** The first spine stage whose role label names it, if a label names one. */
function stageForRoleLabel(label) {
    const haystack = label.toLowerCase();
    for (const stage of PROGRESS_STAGES) {
        const labels = STAGE_ROLE_LABELS[stage.key];
        if (labels === undefined)
            continue;
        if (labels.some((token) => phaseCarriesToken(haystack, token)))
            return stage;
    }
    return undefined;
}
/** The first chain capsule whose role label names it, if a label names one. */
function chainStageForLabel(label) {
    const haystack = label.toLowerCase();
    for (const slot of PROGRESS_CHAIN) {
        if (slot.tokens.some((token) => phaseCarriesToken(haystack, token)))
            return slot;
    }
    return undefined;
}
/**
 * The fixed chain of one task card: three capsules, in render order, filled by the rows
 * whose role label names them.
 *
 * The list is never shorter than {@link PROGRESS_CHAIN}: an unreached capsule is part of
 * the answer (`reached: false`, `pending`), not a gap. A row whose label names no capsule
 * — the planner, a synthesizer call, a child with no role word — stays in the card's
 * `members` and renders after the chain, so no declared row is dropped.
 * @param members - the card's rows, in plan order.
 * @param ended - whether `run-end` was seen, which turns an unsettled capsule into `blocked`.
 * @returns one slot per chain step.
 */
export function chainOf(members, ended) {
    const bySlot = new Map();
    for (const member of members) {
        const slot = chainStageForLabel(member.label);
        if (slot === undefined)
            continue;
        const list = bySlot.get(slot.key);
        if (list === undefined)
            bySlot.set(slot.key, [member]);
        else
            list.push(member);
    }
    return PROGRESS_CHAIN.map((slot) => {
        const rows = bySlot.get(slot.key) ?? [];
        return {
            key: slot.key,
            members: rows,
            state: rows.length === 0 ? 'pending' : nodeState(rows, ended),
            reached: rows.length > 0,
        };
    });
}
/**
 * The plan-task position a phase header names (`任务 3 · 标题` → 3, `Task 10 · x` → 10).
 *
 * This is the number the engine puts in `taskGroupTitle`, read back as a number so that
 * `任务 10` sorts after `任务 2` instead of before it.
 * @param phase - the recorded phase header.
 * @returns the position, or undefined when the header names none.
 */
export function taskNumberIn(phase) {
    if (typeof phase !== 'string')
        return undefined;
    const match = /^\s*(?:任务|task)\s*(\d+)/iu.exec(phase);
    if (match === null)
        return undefined;
    const value = Number(match[1]);
    return Number.isInteger(value) && value > 0 ? value : undefined;
}
/**
 * Whether a recorded phase (or label) names the guardian adjudication call.
 *
 * The engine records that call as `phase: 'Guardian'` / `label: 'guardian adjudication'`,
 * so it is a card of its own beside the plan tasks: not a numbered task, and not a step of
 * any task's chain. Matching is anchored, so a plan task that merely mentions the guardian
 * in its title (`任务 1 · Guardian 判停`) stays a plan task.
 * @param text - a phase header or a row label.
 * @returns whether this is the guardian card.
 */
export function isGuardianCard(text) {
    if (typeof text !== 'string')
        return false;
    return /^(?:guardian|守卫)/iu.test(text.trim());
}
/**
 * Order the task band: plan tasks by their number, then the guardian card, the rest where
 * they were.
 *
 * Three rules, applied in this order:
 *
 * 1. **Numbered cards sort by number.** The slots numbered cards already hold are refilled
 *    in ascending order, so `任务 10` follows `任务 2` and a run that announced its tasks out
 *    of order reads in plan order.
 * 2. **The guardian card sits after the numbered cards.** It is not a plan task, so it may
 *    not land between `任务 2` and `任务 3`.
 * 3. **An unnumbered card keeps its position.** A phase this build reads no number from (an
 *    unphased row, a phase of its own) stays where the run put it: moving it would claim an
 *    order the stream never declared.
 * @param cards - the band's cards, in arrival order.
 * @returns the cards in render order (the same card objects, never copies).
 */
export function orderTaskCards(cards) {
    const ordered = [...cards];
    const numbered = ordered
        .map((card, index) => ({ card, index, number: taskNumberIn(card.phase) }))
        .filter((entry) => entry.number !== undefined);
    numbered.sort((left, right) => left.number - right.number || left.index - right.index);
    numbered.forEach((entry, position) => { ordered[entry.index] = numbered[position].card; });
    const guardianAt = ordered.findIndex((card) => isGuardianCard(card.phase));
    const lastNumbered = ordered.reduce((last, card, index) => (taskNumberIn(card.phase) === undefined ? last : index), -1);
    // Removing the guardian first shifts `lastNumbered` down by one when it sat before the
    // guardian, so re-inserting at that index lands it directly after the last numbered card.
    if (guardianAt !== -1 && lastNumbered !== -1 && guardianAt < lastNumbered) {
        const [guardian] = ordered.splice(guardianAt, 1);
        if (guardian !== undefined)
            ordered.splice(lastNumbered, 0, guardian);
    }
    return ordered;
}
/**
 * Derive the track one run renders.
 * Every recorded phase is either aggregated into the spine stage it names or appended as
 * a node of its own. The spine therefore never hides a phase, and a template stage with
 * no recorded phase stays `pending` rather than borrowing a neighbour's state.
 * @param run - folded run facts.
 * @param options - copy resolver for spine labels.
 * @returns the track model.
 */
export function deriveTrack(run, options = {}) {
    const labelFor = options.labelFor ?? ((stageKey) => stageKey);
    const ended = run.stopReason !== undefined;
    const byStage = new Map();
    const byStagePhases = new Map();
    const evidenceByStage = new Map();
    const extras = [];
    const unphased = [];
    for (const member of run.members) {
        const phase = member.phase;
        if (phase === undefined) {
            unphased.push(member);
            continue;
        }
        const stage = stageForPhase(phase);
        if (stage === undefined) {
            const existing = extras.find((entry) => entry.phase === phase);
            if (existing === undefined)
                extras.push({ phase, members: [member] });
            else
                existing.members.push(member);
            // The row keeps its plan-task node above; this only cross-references it onto the
            // stage whose role ran it, so `执行`/`检查` report what happened instead of nothing.
            const roleStage = stageForRoleLabel(member.label);
            if (roleStage !== undefined) {
                const evidence = evidenceByStage.get(roleStage.key);
                if (evidence === undefined)
                    evidenceByStage.set(roleStage.key, [member]);
                else
                    evidence.push(member);
            }
            continue;
        }
        const list = byStage.get(stage.key);
        if (list === undefined) {
            byStage.set(stage.key, [member]);
            byStagePhases.set(stage.key, [phase]);
        }
        else {
            list.push(member);
            const phases = byStagePhases.get(stage.key);
            if (phases !== undefined && !phases.includes(phase))
                phases.push(phase);
        }
    }
    /** The two ends of the track report the run's own facts, not a member's. */
    const edgeState = (stageKey) => {
        if (stageKey === 'start')
            return 'done';
        if (!ended)
            return 'doing';
        if (run.stopReason === 'cancelled')
            return 'cancelled';
        if (run.stopReason === 'completed')
            return 'done';
        return 'failed';
    };
    /** Level-1 payloads by the phase they name; a phase-less one is the run's fallback. */
    const detailByPhase = new Map();
    let runDetail;
    for (const detail of Array.isArray(run.details) ? run.details : []) {
        if (detail === undefined)
            continue;
        if (detail.phase === undefined) {
            runDetail = detail;
            continue;
        }
        if (!detailByPhase.has(detail.phase))
            detailByPhase.set(detail.phase, detail);
    }
    const detailOf = (phases) => {
        for (const phase of phases) {
            const detail = detailByPhase.get(phase);
            if (detail !== undefined)
                return detail;
        }
        return undefined;
    };
    const node = (definition, key, kind, members, phases, label, evidence = []) => {
        // A stage's own rows are authoritative; its evidence speaks only when it has none.
        const rows = members.length > 0 ? members : evidence;
        const state = definition !== undefined && definition.edge ? edgeState(definition.key) : nodeState(rows, ended);
        const reason = state === 'blocked' ? blockedReason(rows, ended) : undefined;
        const detail = detailOf(phases);
        return {
            key,
            kind,
            label: label ?? (definition === undefined ? key : labelFor(definition.key)),
            state,
            members,
            evidence,
            phases,
            derived: state === 'blocked',
            ...reason === undefined ? {} : { reason },
            ...detail === undefined ? {} : { stageDetail: detail },
        };
    };
    /** One task-band card: a plan task, or the guardian call, with its own fixed chain. */
    const cardNode = (card) => {
        const phases = card.phase === '' ? [] : [card.phase];
        const base = node(undefined, `phase:${card.phase}`, 'extra', card.members, phases, card.phase);
        if (isGuardianCard(card.phase))
            return { ...base, guardian: true };
        const taskNumber = taskNumberIn(card.phase);
        return {
            ...base,
            ...taskNumber === undefined ? {} : { taskNumber },
            chain: chainOf(card.members, ended),
        };
    };
    const nodes = [];
    for (const stage of PROGRESS_STAGES) {
        nodes.push(node(stage, `stage:${stage.key}`, stage.edge ? 'edge' : 'stage', byStage.get(stage.key) ?? [], byStagePhases.get(stage.key) ?? [], undefined, evidenceByStage.get(stage.key) ?? []));
        // Extra phases are real plan tasks (`任务 n · 标题`): the engine announces them while
        // it executes the plan, so they belong between `执行` and `检查` — the template's
        // work slot. A row that declared no phase at all still gets a node (empty label =
        // "unphased" copy), so the percentage and the track never count different rows.
        // Numbered tasks sort by number, then the guardian card, then whatever named no
        // number where it arrived (`orderTaskCards`).
        if (stage.key === 'execute') {
            const cards = [...extras];
            if (unphased.length > 0)
                cards.push({ phase: '', members: unphased });
            for (const card of orderTaskCards(cards))
                nodes.push(cardNode(card));
        }
    }
    const percent = percentOf(run.members);
    return {
        runId: run.runId,
        name: run.name,
        ended,
        nodes,
        ...percent === undefined ? {} : { percent },
        ...run.stopReason === undefined ? {} : { stopReason: run.stopReason },
        ...runDetail === undefined ? {} : { stageDetail: runDetail },
    };
}
/**
 * The state of one declared call: the row-level half of {@link nodeState}.
 *
 * A row is the smallest thing the stream settles, so its own state is its outcome and
 * nothing else — an unsettled row is `doing` (`正在看`), and an outcome that is neither a
 * completion, a cancellation nor a failure stays `blocked` rather than being renamed.
 * @param member - one folded row.
 * @returns the row's own state.
 */
function rowState(member) {
    if (member.outcome === undefined)
        return 'doing';
    if (member.outcome === 'completed')
        return 'done';
    if (member.outcome === 'cancelled')
        return 'cancelled';
    if (member.outcome === 'failed')
        return 'failed';
    return 'blocked';
}
/**
 * The attempt number a label carries (`执行（尝试 2）` → 2, `执行` → 1).
 * @param label - a recorded row label.
 * @returns the 1-based attempt the label names.
 */
function attemptNumberOf(label) {
    const text = typeof label === 'string' ? label.trim() : '';
    const match = /[（(][^（()）]*?(\d+)[^（()）]*[)）]$/u.exec(text);
    if (match === null)
        return 1;
    const value = Number(match[1]);
    return Number.isInteger(value) && value > 0 ? value : 1;
}
/**
 * A label with its shipped-draft mark taken off.
 *
 * The mark says what the *row* is (the draft the gate shipped), not what role spoke, so it
 * must not end up in the role column beside the `交卷` word that already says it.
 * @param text - a label without its attempt suffix.
 * @returns the label without a trailing draft mark.
 */
function withoutFinalMark(text) {
    for (const language of NAMING_LANGUAGES) {
        const mark = SYNTHESIS_FINAL_MARK[language];
        const bare = mark.trim();
        for (const suffix of [mark, bare]) {
            if (suffix === '' || !text.endsWith(suffix))
                continue;
            return text.slice(0, text.length - suffix.length).trim();
        }
    }
    return text;
}
/**
 * The role a log line is spoken as: `执行（尝试 2）` → `执行`, `汇总·第2稿（定稿）` → `汇总·第2稿`.
 * @param member - one folded row.
 * @returns the role word, without the retry suffix or the shipped mark.
 */
function storyRoleOf(member) {
    return withoutFinalMark(attemptBaseLabel(member.label));
}
/**
 * The row `summary-final` names, read back off the rows the fold already marked.
 *
 * The fold writes the mark onto the row that landed (the highest `order` of that draft
 * name, in whichever language the label was written), so matching the marked name is the
 * same fact rather than a second guess at it. A stream whose rows were never marked — the
 * bare draft name is all it carries — still names its row here.
 * @param members - every folded row of the run.
 * @param draft - 1-based draft number the gate shipped.
 * @returns the row that carries the draft, or undefined when no row names it.
 */
function shippedDraftRow(members, draft) {
    const latestNamed = (name) => {
        let named;
        for (const member of members) {
            if (member.label !== name)
                continue;
            if (named === undefined || member.order > named.order)
                named = member;
        }
        return named;
    };
    for (const language of NAMING_LANGUAGES) {
        const marked = latestNamed(synthesisDraftLabel(draft, language, true));
        if (marked !== undefined)
            return marked;
    }
    for (const language of NAMING_LANGUAGES) {
        const bare = latestNamed(synthesisDraftLabel(draft, language));
        if (bare !== undefined)
            return bare;
    }
    return undefined;
}
/**
 * Derive the one-page story for one run (the pure half of the redesign, §19.2).
 *
 * Three screens out of the same facts the track already reads:
 *
 * - **waiting** — the run is open and no call was declared; the page says it is planning,
 *   and the track is empty because there is nothing to step through yet;
 * - **running / failed / cancelled** — one step per declared thing, the current step
 *   chosen by `doing` → `failed` → first unfinished → the last step;
 * - **done** — every declared row passed, so the headline stops naming a step.
 *
 * A step is a **plan task** when the run declared any (`任务 n · 标题`, not the guardian
 * card): those are the units a reader waits for. A run that planned nothing (a triage or
 * single-call run) steps through its declared calls instead, so the track's length is
 * always what the stream announced and never a plan nobody wrote down.
 *
 * @param run - folded run facts.
 * @returns the story model.
 */
export function deriveProgressStory(run) {
    const ended = run.stopReason !== undefined;
    const declared = run.members.length;
    const state = !ended
        ? (declared === 0 ? 'waiting' : 'running')
        : run.stopReason === 'completed' ? 'done' : run.stopReason === 'cancelled' ? 'cancelled' : 'failed';
    const track = deriveTrack(run);
    // A plan task is a numbered extra node: the guardian call is a node of its own and not
    // a step of the plan, so it stays in the history where its own card can speak for it.
    const planNodes = track.nodes.filter((node) => node.kind === 'extra' && node.taskNumber !== undefined && node.guardian !== true);
    const steps = planNodes.length > 0
        ? planNodes.map((node) => ({
            key: node.key,
            number: node.taskNumber,
            title: node.label,
            state: node.state,
            chain: node.chain ?? [],
            members: node.members,
        }))
        // A call step's own `seq` is its identity: two calls can share one stage (`规划（第1次）`
        // and `规划（第2次）`), so a node key would give two segments the same key.
        : [...run.members].sort((left, right) => left.seq - right.seq).map((member) => ({
            key: `seq:${member.seq}`,
            title: storyRoleOf(member),
            state: rowState(member),
            chain: [],
            members: [member],
        }));
    const total = steps.length;
    const firstOf = (predicate) => {
        const index = steps.findIndex(predicate);
        return index === -1 ? -1 : index + 1;
    };
    const doing = firstOf((step) => step.state === 'doing');
    const failed = firstOf((step) => step.state === 'failed');
    const open = firstOf((step) => step.state !== 'done');
    const at = total === 0 ? 0 : doing !== -1 ? doing : failed !== -1 ? failed : open !== -1 ? open : total;
    const current = at === 0 ? undefined : steps[at - 1];
    const now = state === 'waiting'
        ? { titleKey: 'planning', title: '' }
        : state === 'done'
            ? { titleKey: 'done', title: '' }
            : { title: current?.title ?? '' };
    if (state === 'running') {
        // The line a reader is waiting on: the current step's own open call, or — when the
        // current step is finished under a still-open run — the run's first unsettled one.
        const running = (current?.members ?? []).find((member) => member.outcome === undefined)
            ?? run.members.find((member) => member.outcome === undefined);
        if (running !== undefined)
            now.role = storyRoleOf(running);
    }
    let attempt;
    if (current !== undefined) {
        const recovered = recoveredFailureSeqs(current.members);
        const broken = current.members.find((member) => member.outcome === 'failed' && !recovered.has(member.seq));
        if (broken !== undefined) {
            const unit = attemptUnitOf(broken);
            let n = 1;
            for (const member of current.members) {
                if (attemptUnitOf(member) !== unit)
                    continue;
                n = Math.max(n, attemptNumberOf(member.label));
            }
            attempt = { n, retrying: !ended };
        }
    }
    const rest = [];
    for (const step of steps.slice(at)) {
        if (rest[rest.length - 1] === step.title)
            continue;
        rest.push(step.title);
    }
    const shipped = run.summaryFinalDraft === undefined ? undefined : shippedDraftRow(run.members, run.summaryFinalDraft);
    const log = [...run.members]
        .sort((left, right) => left.seq - right.seq)
        .map((member) => ({
        seq: member.seq,
        ...member.startedAt === undefined ? {} : { at: member.startedAt },
        role: storyRoleOf(member),
        title: member.phase ?? '',
        state: rowState(member),
        ...member === shipped ? { shipped: true } : {},
    }));
    const shippedLine = log.find((row) => shipped !== undefined && row.seq === shipped.seq);
    const final = run.summaryFinalDraft === undefined || shippedLine === undefined
        ? undefined
        : { draft: run.summaryFinalDraft, label: shippedLine.title, row: shippedLine };
    const dock = state === 'waiting' ? 'start' : state === 'done' ? 'accept' : 'quiet';
    return {
        state,
        steps,
        at,
        total,
        now,
        ...attempt === undefined ? {} : { attempt },
        rest,
        log,
        ...final === undefined ? {} : { final },
        dock,
    };
}
/** One `LABEL: value` line of a coordination block (`WORK_COMMIT: abc1234`). */
const COORDINATION_LABEL_LINE = /^[ \t>*_`-]*([A-Za-z][A-Za-z_ -]*?)[ \t]*[:：][ \t]*(.*?)[ \t]*$/;
/** Read the labelled form of a block (`WORK_COMMIT: abc1234`), one fact per line. */
function labelledFieldValues(body) {
    const fields = {};
    for (const line of body.split(/\r?\n/)) {
        const match = COORDINATION_LABEL_LINE.exec(line);
        if (match === null)
            continue;
        const key = canonicalDetailField(match[1] ?? '');
        if (key === undefined || fields[key] !== undefined)
            continue;
        // A value wrapped in backticks is still that value; the block is copied verbatim so
        // the fences a writer adds for readability must not leak into the cell.
        const value = (match[2] ?? '').replace(/^`+|`+$/g, '').trim();
        if (value !== '')
            fields[key] = value;
    }
    return fields;
}
/** Read the JSON form of a fenced block, when that fence is one. */
function jsonFieldValues(language, body) {
    if (language !== 'grok-coordination' && language !== 'json')
        return undefined;
    let parsed;
    try {
        parsed = JSON.parse(body);
    }
    catch {
        return undefined;
    }
    const record = asRecord(parsed);
    if (record === undefined)
        return undefined;
    const nested = asRecord(record['coordination']);
    const fields = pickDetailFields(nested ?? record);
    const known = Object.keys(fields).length;
    if (known === 0)
        return undefined;
    // A `json` fence is not a coordination report unless it carries the coordination object
    // or enough of the seven fields to be unmistakable; prose in a generic JSON block must
    // not be promoted into evidence.
    if (nested === undefined && language !== 'grok-coordination' && known < 2)
        return undefined;
    return fields;
}
/**
 * Parse a coordination block out of a stage's text.
 *
 * Three shapes are accepted, and nothing else:
 *
 * 1. a fenced `json` / `grok-coordination` block carrying the canonical fields (or a
 *    `coordination` object) — at least two fields, unless the language says it is one;
 * 2. any fenced block whose body is a labelled block — the `LABEL: value` form `AGENTS.md`
 *    prescribes (`WORK_COMMIT: …`, `CHANGES: …`, `BLOCKERS: …`) — with at least two
 *    known labels;
 * 3. an unfenced labelled block, because the coordination protocol is posted as the
 *    message body itself and not always inside a fence.
 *
 * Prose that merely mentions a field is not a report: the caller falls through to "not
 * reported" and the tab never treats text as structured data.
 * @param text - child-session or stage text that may contain a block.
 * @returns the parsed block, or undefined when no well-formed block exists.
 */
export function parseCoordinationBlock(text) {
    if (typeof text !== 'string' || text === '')
        return undefined;
    const fenced = /```([A-Za-z-]*)[^\n]*\n([\s\S]*?)```/g;
    let match;
    while ((match = fenced.exec(text)) !== null) {
        const language = (match[1] ?? '').toLowerCase();
        const body = match[2] ?? '';
        const fromJson = jsonFieldValues(language, body);
        if (fromJson !== undefined)
            return { fields: fromJson, raw: body.trim() };
        const fromLabels = labelledFieldValues(body);
        if (Object.keys(fromLabels).length >= 2)
            return { fields: fromLabels, raw: body.trim() };
    }
    const unfenced = labelledFieldValues(text);
    if (Object.keys(unfenced).length >= 2)
        return { fields: unfenced, raw: text.trim() };
    return undefined;
}
/**
 * Resolve the seven detail fields, strongest source first.
 *
 * 1. a `tool-workflow/stage-detail` payload (the recorder writes none today; when it
 *    does, this is the authoritative source);
 * 2. a coordination block parsed out of the child session's text;
 * 3. "not reported" — the value is absent and the row renders an em dash plus the source
 *    badge, because a blank would read as "nothing happened" rather than "no evidence".
 * @param sources - available sources.
 * @returns one row per field, plus the copyable block when there was one.
 */
export function detailFor(sources = {}) {
    const stageDetail = sources.stageDetail === undefined ? undefined : pickDetailFields(sources.stageDetail);
    const coordination = parseCoordinationBlock(sources.coordinationText);
    const fields = [];
    for (const key of DETAIL_FIELDS) {
        const fromEvent = stageDetail === undefined ? undefined : stageDetail[key];
        if (fromEvent !== undefined) {
            fields.push({ key, value: fromEvent, source: 'stage-detail' });
            continue;
        }
        const fromBlock = coordination === undefined ? undefined : coordination.fields[key];
        if (fromBlock !== undefined) {
            fields.push({ key, value: fromBlock, source: 'coordination' });
            continue;
        }
        fields.push({ key, source: 'not-reported' });
    }
    return {
        fields,
        ...coordination === undefined ? {} : { coordinationRaw: coordination.raw },
    };
}
/**
 * Where one node's detail values actually come from.
 *
 * A view cannot read a child session's text, so the ladder is fed from the only channel
 * that exists in the stream: the run's own `stage-detail` payloads, matched to the node by
 * the phase they name, with a phase-less payload standing in for the whole run. A caller
 * that *can* read a child session passes its own source in `injected`, which wins over the
 * payload for the level it supplies — so wiring a stronger source later needs no UI change.
 * @param track - the derived track (its phase-less payload is the fallback).
 * @param node - the selected node.
 * @param injected - a caller-supplied source, strongest where it speaks.
 * @returns the sources the ladder resolves.
 */
export function detailSourcesOf(track, node, injected = {}) {
    const payload = node.stageDetail ?? track.stageDetail;
    const stageDetail = injected.stageDetail ?? payload?.fields;
    const coordinationText = injected.coordinationText ?? payload?.coordinationText;
    return {
        ...stageDetail === undefined ? {} : { stageDetail },
        ...coordinationText === undefined ? {} : { coordinationText },
    };
}
/** Format one duration in milliseconds for the engine-facts section (`1.2 s`, `2 m 3 s`). */
export function formatDuration(ms) {
    if (ms === undefined || !Number.isFinite(ms) || ms < 0)
        return undefined;
    if (ms < 1000)
        return `${Math.round(ms)} ms`;
    const seconds = ms / 1000;
    if (seconds < 60)
        return `${seconds.toFixed(1)} s`;
    const minutes = Math.floor(seconds / 60);
    const rest = Math.round(seconds - minutes * 60);
    return `${minutes} m ${rest} s`;
}
//# sourceMappingURL=progress-tab.js.map