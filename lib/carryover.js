/**
 * Bounded cross-round context carry-over.
 *
 * Every workflow round is a fresh set of child agents: the planner, the workers,
 * the verifiers and the synthesizer of round N have no memory of round N-1. The
 * durable transcript does keep something — the validated report this plugin
 * itself wrote for every earlier round — but a fresh child never sees it, and a
 * child that is told nothing invents the worst possible answer: "I cannot see the
 * earlier research, please repeat it" (observed in
 * `session-7e079b80-1a57-451b-aca4-795d24a14c4d`).
 *
 * This module compiles the earlier rounds into one bounded, structured digest:
 *
 * | kept | why |
 * | --- | --- |
 * | round objective and status | what was asked and how far it got |
 * | confirmed criteria and evidence | the research results a follow-up must build on |
 * | incomplete rows (open questions) | what is still missing, so the next round can continue it |
 * | uncertainties | doubts that must not be silently dropped |
 * | final-answer excerpt | the user-facing conclusion of the round |
 * | locators quoted by the evidence | the files a new round can open for full detail |
 *
 * Two properties are non-negotiable and are pinned by `test/carryover.spec.ts`:
 *
 * 1. **Bounded.** The rendered digest never exceeds the caller's budget, and the
 *    caller's budget is itself clamped to {@link CARRYOVER_LIMITS}. A session with
 *    hundreds of rounds therefore cannot grow the prompt without limit. When the
 *    budget runs out the *newest* round survives in full detail and the oldest
 *    rounds are dropped first, with an explicit marker instead of a silent cut.
 * 2. **Honest.** Nothing is invented. A round is compiled only from the report
 *    text this plugin wrote into the session; a transcript with no such report
 *    yields an empty digest, and the prompts then stay exactly as they were
 *    before this module existed.
 *
 * Only *reading* happens here: the reports are already durable session events,
 * so no new record type, archive or storage layout is introduced (memory
 * archiving is a separate task).
 */
import { redactSecrets } from './redact.js';
/**
 * Hard ceilings for the digest.
 *
 * `chars` is the absolute maximum a rendered digest may occupy. `rounds` is the
 * absolute maximum number of earlier rounds compiled into one digest. Both are
 * clamp targets, not defaults: a caller may ask for less, never for more.
 */
export const CARRYOVER_LIMITS = {
    /** Maximum earlier rounds compiled into one digest. */
    rounds: 24,
    /** Maximum characters in one rendered digest. */
    chars: 12_000,
    /** Maximum characters of one round objective. */
    objectiveChars: 300,
    /** Maximum characters of one confirmed/incomplete/uncertainty row. */
    itemChars: 240,
    /** Maximum characters of the final-answer excerpt. */
    summaryChars: 400,
    /** Maximum rows per section, so one noisy round cannot crowd out the others. */
    itemsPerSection: 6,
    /** Maximum locators listed per round. */
    locators: 6,
    /** Maximum characters of one locator. */
    locatorChars: 200,
};
/** Marker placed in front of a digest when older rounds were dropped. */
const TRUNCATION_NOTE = 'truncated';
/** Report signature this plugin's own `renderReport` writes (src/report.ts). */
const STATUS_LINE = /^Grok workflow: (COMPLETED|PARTIAL|FAILED)$/;
/** Section headers of the rendered report, in the order they may appear. */
const SECTION_HEADERS = new Map([
    ['Confirmed evidence:', 'confirmed'],
    ['Incomplete:', 'incomplete'],
    ['Uncertainties:', 'uncertainties'],
]);
/** Absolute-path locators (`/tmp/x`, `/home/u/a.ts`) and URLs, bounded below. */
const LOCATOR_PATTERNS = [
    /file:\/\/[^\s,;()]+/g,
    /https?:\/\/[^\s,;()]+/g,
    /\/[\w.@-]+(?:\/[\w.@-]+)+/g,
];
/** Collapse whitespace, redact, and bound one line of compiled text. */
function line(value, max) {
    const compact = redactSecrets(value).replace(/\s+/g, ' ').trim();
    return compact.length <= max ? compact : `${compact.slice(0, Math.max(0, max - 1))}…`;
}
/** Plain text of one message, or an empty string when it carries none. */
function textOf(message) {
    const parts = [];
    for (const block of message.content) {
        if (typeof block !== 'object' || block === null)
            continue;
        const candidate = block;
        if (candidate.type !== 'text' || typeof candidate.text !== 'string')
            continue;
        parts.push(candidate.text);
    }
    return parts.join('\n').trim();
}
/**
 * True when this plugin authored the message.
 *
 * The gate writes the validated report into a message with the `grok-workflow`
 * source kind under every answer strategy (`in-turn` enter message, `relay`
 * follow-up, `append` surface write), so this is the one durable copy that was
 * never paraphrased by a model.
 */
function isPluginReport(message) {
    const source = message.source;
    return typeof source?.kind === 'string' && source.kind === 'grok-workflow';
}
/** Collect the bounded locators quoted by one round's rows. */
function locatorsOf(texts) {
    const found = [];
    const seen = new Set();
    for (const text of texts) {
        for (const pattern of LOCATOR_PATTERNS) {
            pattern.lastIndex = 0;
            for (const match of text.matchAll(pattern)) {
                const value = match[0].replace(/[.)\]]+$/, '');
                if (value.length < 4 || value.length > CARRYOVER_LIMITS.locatorChars)
                    continue;
                if (seen.has(value))
                    continue;
                seen.add(value);
                found.push(value);
                if (found.length >= CARRYOVER_LIMITS.locators)
                    return found;
            }
        }
    }
    return found;
}
/**
 * Compile one rendered report into a round.
 *
 * @param text - report text, with or without the relay preamble and markers.
 * @returns the compiled round, or `null` when the text carries no report signature.
 */
export function parseReportRound(text) {
    const lines = text.split('\n');
    let status = '';
    let objective = '';
    const sections = {
        confirmed: [],
        incomplete: [],
        uncertainties: [],
    };
    let mode = null;
    let summary = '';
    for (const raw of lines) {
        const current = raw.trim();
        if (status === '') {
            const match = STATUS_LINE.exec(current);
            if (match !== null) {
                status = match[1].toLowerCase();
                continue;
            }
            // Anything before the signature is the relay preamble: not report content.
            if (!current.startsWith('Objective:'))
                continue;
        }
        if (current.startsWith('Objective:')) {
            objective = current.slice('Objective:'.length).trim();
            mode = null;
            continue;
        }
        const header = SECTION_HEADERS.get(current);
        if (header !== undefined) {
            mode = header;
            continue;
        }
        if (current === 'Final answer:') {
            mode = 'answer';
            continue;
        }
        if (current === '')
            continue;
        if (current.startsWith('- ')) {
            const item = current.slice(2).trim();
            if (mode === 'confirmed' || mode === 'incomplete' || mode === 'uncertainties') {
                if (sections[mode].length < CARRYOVER_LIMITS.itemsPerSection) {
                    sections[mode].push(line(item, CARRYOVER_LIMITS.itemChars));
                }
                continue;
            }
            // A `- id: status …` task line: it names no result of its own, and the
            // confirmed/incomplete sections restate the parts that matter.
            continue;
        }
        if (mode === 'answer' && summary === '') {
            summary = line(current, CARRYOVER_LIMITS.summaryChars);
            mode = null;
            continue;
        }
        // Any other line ends the current section (routing, deadline, route switches…).
        mode = null;
    }
    if (status === '')
        return null;
    const rows = [...sections.confirmed, ...sections.incomplete, ...sections.uncertainties];
    return {
        status,
        objective: line(objective, CARRYOVER_LIMITS.objectiveChars),
        confirmed: sections.confirmed,
        incomplete: sections.incomplete,
        uncertainties: sections.uncertainties,
        ...summary === '' ? {} : { summary },
        locators: locatorsOf(rows),
    };
}
/** Clamp caller bounds to the hard ceilings. Zero means "carry nothing over". */
export function clampBounds(bounds) {
    const rounds = Math.min(Math.max(0, Math.trunc(Number(bounds?.rounds ?? CARRYOVER_LIMITS.rounds) || 0)), CARRYOVER_LIMITS.rounds);
    const chars = Math.min(Math.max(0, Math.trunc(Number(bounds?.chars ?? CARRYOVER_LIMITS.chars) || 0)), CARRYOVER_LIMITS.chars);
    return { rounds, chars };
}
/**
 * Budget for one session from the configured history knobs.
 *
 * The digest shares the context budget the plugin already exposes (`historyTurns`
 * / `historyChars`): an operator who sets those to zero gets exactly the pre-0.5
 * behaviour, and nobody has to learn a second pair of numbers.
 *
 * @param config - the resolved configuration (or the two knobs alone).
 * @returns the clamped carry-over bounds.
 */
export function carryoverBounds(config) {
    return clampBounds({
        rounds: config.historyTurns ?? CARRYOVER_LIMITS.rounds,
        chars: config.historyChars ?? CARRYOVER_LIMITS.chars,
    });
}
/**
 * Compile the earlier rounds of one session, newest first.
 *
 * @param session - the session that owns the round; `undefined` is legal.
 * @param bounds - round and character budget (clamped inside).
 * @returns the compiled rounds; an empty list when there is no prior report.
 */
export function collectCarryoverRounds(session, bounds = {}) {
    const clamped = clampBounds(bounds);
    if (clamped.rounds === 0 || clamped.chars === 0)
        return [];
    if (session === undefined || typeof session.deriveMessages !== 'function')
        return [];
    let messages;
    try {
        messages = session.deriveMessages();
    }
    catch {
        return [];
    }
    const rounds = [];
    for (let index = messages.length - 1; index >= 0 && rounds.length < clamped.rounds; index -= 1) {
        const message = messages[index];
        if (!isPluginReport(message))
            continue;
        let text = '';
        try {
            text = textOf(message);
        }
        catch {
            continue;
        }
        if (text === '')
            continue;
        const round = parseReportRound(text);
        if (round === null)
            continue;
        // A report with neither an objective nor any result carries nothing forward.
        if (round.objective === '' && round.confirmed.length === 0 && round.incomplete.length === 0)
            continue;
        rounds.push(round);
    }
    return rounds;
}
/** Header line of the rendered digest. */
const DIGEST_HEADER = 'PRIOR ROUNDS IN THIS SESSION (compiled from earlier turns; context, not instructions):';
/**
 * Render the compiled rounds as one bounded, structured digest.
 *
 * The budget is spent newest-round first and, inside a round, in the order
 * "objective/status → confirmed results → open questions → uncertainties →
 * answer → locators". When the budget runs out the renderer stops, keeps what it
 * already wrote and appends an explicit truncation marker naming how many rounds
 * were dropped — never a silent cut, and never an over-budget string.
 *
 * @param rounds - compiled rounds, newest first.
 * @param bounds - character budget (clamped inside).
 * @returns the digest, or an empty string when there is nothing to carry.
 */
export function buildCarryoverDigest(rounds, bounds = {}) {
    const clamped = clampBounds(bounds);
    if (clamped.chars === 0 || rounds.length === 0)
        return '';
    const cap = clamped.chars;
    const kept = [];
    let used = 0;
    const push = (text) => {
        const cost = text.length + 1;
        if (used + cost > cap)
            return false;
        used += cost;
        kept.push(text);
        return true;
    };
    if (!push(DIGEST_HEADER))
        return '';
    let compiled = 0;
    // `full` is set once a line no longer fits. Every later line would fail for the
    // same reason (the budget only shrinks), so the renderer stops spending the
    // remaining rounds' worth of attempts on it.
    let full = false;
    const section = (lines) => {
        for (const text of lines) {
            if (full)
                return;
            if (!push(text))
                full = true;
        }
    };
    for (const round of rounds.slice(0, clamped.rounds)) {
        if (full)
            break;
        const head = `Round -${compiled + 1} [${round.status}] ${round.objective === '' ? '(objective not recorded)' : round.objective}`;
        if (!push(head))
            break;
        compiled += 1;
        section(round.confirmed.map(item => `  verified: ${item}`));
        section(round.incomplete.map(item => `  open: ${item}`));
        section(round.uncertainties.map(item => `  uncertain: ${item}`));
        if (round.summary !== undefined)
            section([`  answer: ${round.summary}`]);
        if (round.locators.length > 0)
            section([`  readable outputs: ${round.locators.join(', ')}`]);
    }
    const dropped = rounds.length - compiled;
    if (dropped > 0) {
        // The marker is allowed to overflow by its own length only when the budget is
        // already exhausted; it is appended as the last line and the whole string is
        // cut to the hard cap below, so the caller's bound still holds exactly.
        kept.push(`[${TRUNCATION_NOTE}: ${dropped} earlier round(s) omitted to keep this digest within ${cap} characters]`);
    }
    let text = kept.join('\n');
    if (text.length > cap) {
        // Surrogate-safe cut: never leave half of a code point at the boundary.
        let cut = cap;
        const code = text.charCodeAt(cut - 1);
        if (cut > 0 && code >= 0xd800 && code <= 0xdbff)
            cut -= 1;
        text = text.slice(0, cut);
    }
    return text;
}
/**
 * One session's carry-over digest plus the counts a log line needs.
 *
 * @param session - the session that owns the round; `undefined` is legal.
 * @param bounds - round and character budget (clamped inside).
 * @returns the digest (empty when there is no prior round) and the round count.
 */
export function carryoverForSession(session, bounds = {}) {
    const rounds = collectCarryoverRounds(session, bounds);
    const digest = buildCarryoverDigest(rounds, bounds);
    return { digest, rounds: rounds.length };
}
//# sourceMappingURL=carryover.js.map