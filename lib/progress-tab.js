/**
 * The "进度" conversation tab: the pure half.
 *
 * The tab renders the four `tool-workflow/*` session events this plugin's own recorder
 * writes (`src/records.ts`, `createWorkflowProgressRecorder`) as one horizontal track of
 * stage nodes. This module is the fold, the state precedence, the percentage and the
 * detail provenance, with no React, no DOM, no clock and no estimate, so every rule the
 * browser half applies can be tested here; `src/client/index.js` carries the same rules
 * as hand-written JavaScript (the host serves that bundle verbatim, so it cannot import
 * this file) and `test/client.spec.ts` pins the two apart from drifting.
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
 */
/** The four event types the tab folds; every other type is ignored. */
export const PROGRESS_EVENT_TYPES = [
    'tool-workflow/run-start',
    'tool-workflow/agent-start',
    'tool-workflow/agent-end',
    'tool-workflow/run-end',
];
/** Registered conversation target of the progress view (namespaced so a collision throws). */
export const PROGRESS_VIEW_TARGET = 'grok-progress';
/** Conversation node kind owned by the tab (namespaced for the same reason). */
export const PROGRESS_NODE_KIND = 'grok-progress-run';
/** `localStorage` key holding the reader's zoom factor. */
export const PROGRESS_ZOOM_STORAGE_KEY = 'dsh.gw.progress.zoom';
/** The seven fields a settled stage reports, in render order. */
export const DETAIL_FIELDS = ['files', 'commands', 'result', 'evidence', 'risks', 'next', 'owner'];
/**
 * The track's fixed spine.
 *
 * It is the process template of a staged delivery job, not a claim about a run: a stage
 * whose token no recorded phase carries stays `pending` and its tooltip says it was not
 * reported. Recorded phases that match no token become real nodes of their own
 * ({@link ProgressNodeModel.kind} `extra`), so a run that does not follow the template
 * still shows every phase it declared.
 */
export const PROGRESS_STAGES = [
    { key: 'start', tokens: [], edge: true },
    { key: 'sync', tokens: ['同步', 'sync'], edge: false },
    { key: 'triage', tokens: ['排查', '诊断', 'triage'], edge: false },
    { key: 'fix', tokens: ['修复', 'fix'], edge: false },
    { key: 'ui', tokens: ['ui', '界面'], edge: false },
    { key: 'device', tokens: ['真机', '实机', 'device'], edge: false },
    { key: 'cleanup', tokens: ['清理', 'cleanup'], edge: false },
    { key: 'push', tokens: ['push', 'tag', '推送', '发布'], edge: false },
    { key: 'end', tokens: [], edge: true },
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
/** Read the known detail fields out of one record. */
function pickDetailFields(source) {
    const fields = {};
    for (const key of DETAIL_FIELDS) {
        const text = fieldText(source[key]);
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
            ...record.time === undefined ? {} : { startedAt: record.time },
        });
    }
    index = 0;
    for (const record of records) {
        const seq = typeof record.seq === 'number' && Number.isFinite(record.seq) ? record.seq : index;
        index += 1;
        const data = asRecord(record.data) ?? {};
        const runId = typeof data['runId'] === 'string' ? data['runId'] : undefined;
        if (runId === undefined || !PROGRESS_EVENT_TYPES.includes(record.type))
            continue;
        if (record.type === 'tool-workflow/run-start')
            continue;
        const draft = drafts.get(runId);
        if (draft === undefined)
            continue;
        if (seq < draft.anchorSeq)
            draft.anchorSeq = seq;
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
        const members = draft.order.map((memberSeq) => draft.members.get(memberSeq)).filter((member) => member !== undefined);
        runs.push({
            runId: draft.runId,
            name: draft.name,
            anchorSeq: draft.anchorSeq,
            members,
            ...draft.startedAt === undefined ? {} : { startedAt: draft.startedAt },
            ...draft.endedAt === undefined ? {} : { endedAt: draft.endedAt },
            ...draft.stopReason === undefined ? {} : { stopReason: draft.stopReason },
        });
    }
    return runs.sort((left, right) => left.anchorSeq - right.anchorSeq);
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
 * The state of one node, in the precedence the design fixes:
 * `failed` → `doing` → `done` → `blocked` → `cancelled` → `pending`.
 *
 * `blocked` is the only derived state: the run ended (or the engine reported an outcome
 * that is neither a completion nor a cancellation) while a row was still unsettled. The
 * stream cannot say why, so the node says "blocked" and its tooltip names the evidence.
 * @param members - rows aggregated by this node.
 * @param ended - whether `run-end` was seen for the run.
 * @returns the node state.
 */
export function nodeState(members, ended) {
    const settled = members.filter((member) => member.outcome !== undefined);
    const unsettled = members.length - settled.length;
    if (members.some((member) => member.outcome === 'failed'))
        return 'failed';
    if (!ended && unsettled > 0)
        return 'doing';
    if (members.length > 0 && settled.length === members.length && settled.every((member) => member.outcome === 'completed'))
        return 'done';
    if (ended && unsettled > 0)
        return 'blocked';
    if (members.some((member) => member.outcome === 'cancelled'))
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
/** The first spine stage whose token appears in the phase header. */
function stageForPhase(phase) {
    const haystack = phase.toLowerCase();
    for (const stage of PROGRESS_STAGES) {
        if (stage.edge)
            continue;
        if (stage.tokens.some((token) => haystack.includes(token.toLowerCase())))
            return stage;
    }
    return undefined;
}
/**
 * Derive the track one run renders.
 *
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
    const node = (definition, key, kind, members, phases, label) => {
        const state = definition !== undefined && definition.edge ? edgeState(definition.key) : nodeState(members, ended);
        const reason = state === 'blocked' ? blockedReason(members, ended) : undefined;
        return {
            key,
            kind,
            label: label ?? (definition === undefined ? key : labelFor(definition.key)),
            state,
            members,
            phases,
            derived: state === 'blocked',
            ...reason === undefined ? {} : { reason },
        };
    };
    const nodes = [];
    for (const stage of PROGRESS_STAGES) {
        nodes.push(node(stage, `stage:${stage.key}`, stage.edge ? 'edge' : 'stage', byStage.get(stage.key) ?? [], byStagePhases.get(stage.key) ?? []));
        // Extra phases are real plan tasks: they belong next to the work stages, before the
        // closing stages of the template, and in the order the run started them. A row that
        // declared no phase at all still gets a node (empty label = "unphased" copy), so the
        // percentage and the track never count different rows.
        if (stage.key === 'device') {
            for (const extra of extras)
                nodes.push(node(undefined, `phase:${extra.phase}`, 'extra', extra.members, [extra.phase], extra.phase));
            if (unphased.length > 0)
                nodes.push(node(undefined, 'phase:', 'extra', unphased, [], ''));
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
    };
}
/**
 * Parse a coordination block out of a child session's text.
 *
 * Only an explicit block is accepted: a fenced ` ```grok-coordination ` block, or a
 * fenced `json` block whose object carries a `coordination` object or at least two of the
 * seven known fields. Anything else is not a report, and the caller falls through to
 * "not reported" — the tab never treats prose as structured data.
 * @param text - child-session text that may contain a block.
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
        if (language !== 'grok-coordination' && language !== 'json')
            continue;
        let parsed;
        try {
            parsed = JSON.parse(body);
        }
        catch {
            continue;
        }
        const record = asRecord(parsed);
        if (record === undefined)
            continue;
        const nested = asRecord(record['coordination']);
        const source = nested ?? record;
        const fields = pickDetailFields(source);
        const known = Object.keys(fields).length;
        if (known === 0)
            continue;
        // A `json` fence is not a coordination report unless it carries the coordination
        // object or enough of the seven fields to be unmistakable; prose in a generic JSON
        // block must not be promoted into evidence.
        if (nested === undefined && language !== 'grok-coordination' && known < 2)
            continue;
        return { fields, raw: body.trim() };
    }
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