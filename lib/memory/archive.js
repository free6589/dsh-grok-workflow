/**
 * Incremental memory archive: the durable, append-only record of what each
 * workflow round and each child agent actually produced.
 *
 * The defect this module removes (VALIDATION.md Round 22, DECISIONS.md D-036):
 * this plugin's durable memory was the transcript
 * plus the operator's hand-written `docs/knowledge/*.md`, both of which are only
 * written *at the end of a session*. A later round that "checked memory" mid-way
 * therefore found nothing — `查了记忆，最近也没有存档` — and a long task lost its
 * thread even though the work had already happened. A round that finished is a
 * durable fact the moment it finishes, so it is appended then, not at exit.
 *
 * Design rules, in the order they constrain the code:
 *
 * 1. **Append-only.** The file is opened `a` and one complete JSON line is
 *    written per entry. No entry is ever edited, reordered or compacted in
 *    place, so a reader that saw entry *k* keeps seeing the same bytes.
 * 2. **Idempotent.** Every entry carries a deterministic `id`
 *    (`run:<runId>`, `run:<runId>:agent:<seq>`), and an append whose id already
 *    exists in the file is a no-op that reports `duplicate`. A retried
 *    settlement, a replayed event, or two plugin instances recording the same
 *    run therefore cannot produce a second entry.
 * 3. **Never fatal.** Every failure path (unwritable directory, full disk, a
 *    reader racing a writer, malformed JSON on disk) returns a result object
 *    instead of throwing: archiving is a memory aid and must never break the
 *    workflow it is recording.
 * 4. **No credentials.** Every text field passes through `redactSecrets` and the
 *    per-field bounds before it is serialised, so a token that a child echoed
 *    into its result cannot land on disk.
 * 5. **Session-free reads.** `readArchive` needs nothing but the directory: no
 *    live session, no plugin state, no engine. That is what makes the archive
 *    answerable from a process that was started afterwards.
 *
 * @module dsh-grok-workflow/memory/archive
 */
import { closeSync, mkdirSync, openSync, readSync, statSync, writeSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { redactError, redactSecrets } from '../redact.js';
/** Bounds applied to every entry before it is written. */
export const ARCHIVE_LIMITS = {
    /** Characters kept from one round objective or agent label. */
    objectiveChars: 300,
    /** Characters kept from one entry's `summary` (the actual finding). */
    summaryChars: 4_000,
    /** Characters kept from one evidence locator. */
    evidenceChars: 400,
    /** Evidence locators kept per entry. */
    evidenceItems: 8,
    /** Characters kept from an entry id (identity, never content). */
    idChars: 200,
    /** Entries returned by one read when no limit is given. */
    readLimit: 50,
    /**
     * Bytes scanned from the tail of the file to build the id set for
     * de-duplication and for reads. A bounded tail keeps a long-lived archive
     * cheap to consult while still covering far more entries than one session
     * can produce.
     */
    scanBytes: 4 * 1024 * 1024,
};
/**
 * Resolve the archive directory.
 *
 * The environment override exists because a test, an e2e lane and a real
 * operator all need to point the archive at a scratch directory without a
 * config key (and without writing into a user's `$HOME`).
 * @param options - caller options; `dir` wins over the environment.
 * @returns The absolute archive directory.
 */
export function archiveDir(options = {}) {
    if (options.dir !== undefined && options.dir.trim() !== '')
        return options.dir;
    const override = process.env.GROK_WORKFLOW_MEMORY_DIR;
    if (override !== undefined && override.trim() !== '')
        return override;
    const home = process.env.DSH_HOME;
    const base = home !== undefined && home.trim() !== '' ? home : join(homedir(), '.dsh');
    return join(base, 'memory', 'grok-workflow');
}
/** The append-only JSONL file this module owns. */
export function archiveFile(options = {}) {
    return join(archiveDir(options), 'archive.jsonl');
}
/** Clamp one text field and redact it; `undefined` stays `undefined`. */
function clampText(value, limit) {
    if (value === undefined)
        return undefined;
    const redacted = redactSecrets(value);
    if (redacted.length <= limit)
        return redacted;
    return `${redacted.slice(0, limit)}…[truncated ${redacted.length - limit} chars]`;
}
/**
 * Normalize one entry into exactly what will be serialised.
 *
 * Called on the way in *and* on the way out, because an entry written by an
 * older build is as untrusted as one a caller passes now.
 * @param input - candidate entry.
 * @returns The sanitized entry, or `undefined` when it has no usable identity
 *   or summary (an entry without either is not a memory, it is noise).
 */
export function sanitizeEntry(input) {
    const id = clampText(typeof input.id === 'string' ? input.id.trim() : undefined, ARCHIVE_LIMITS.idChars);
    if (id === undefined || id === '')
        return undefined;
    const summary = clampText(input.summary, ARCHIVE_LIMITS.summaryChars);
    if (summary === undefined || summary.trim() === '')
        return undefined;
    const atMs = Number.isFinite(input.atMs) && input.atMs > 0 ? Math.floor(input.atMs) : Date.now();
    const at = clampText(typeof input.at === 'string' && input.at !== '' ? input.at : new Date(atMs).toISOString(), 40);
    const kind = input.kind === 'round' || input.kind === 'agent' || input.kind === 'note' ? input.kind : 'note';
    const objective = clampText(input.objective, ARCHIVE_LIMITS.objectiveChars);
    const label = clampText(input.label, ARCHIVE_LIMITS.objectiveChars);
    const phase = clampText(input.phase, ARCHIVE_LIMITS.objectiveChars);
    const status = clampText(input.status, 40);
    const evidence = input.evidence === undefined
        ? undefined
        : input.evidence
            .filter(item => typeof item === 'string' && item.trim() !== '')
            .slice(0, ARCHIVE_LIMITS.evidenceItems)
            .map(item => clampText(item, ARCHIVE_LIMITS.evidenceChars) ?? '')
            .filter(item => item !== '');
    return {
        v: 1,
        id,
        kind,
        at: at ?? new Date(atMs).toISOString(),
        atMs,
        summary,
        ...input.sessionId === undefined ? {} : { sessionId: clampText(input.sessionId, ARCHIVE_LIMITS.idChars) },
        ...input.runId === undefined ? {} : { runId: clampText(input.runId, ARCHIVE_LIMITS.idChars) },
        ...input.turn === undefined ? {} : { turn: input.turn },
        ...input.seq === undefined ? {} : { seq: input.seq },
        ...phase === undefined ? {} : { phase },
        ...label === undefined ? {} : { label },
        ...status === undefined ? {} : { status },
        ...objective === undefined ? {} : { objective },
        ...evidence === undefined || evidence.length === 0 ? {} : { evidence },
    };
}
/**
 * Read the tail of the archive file as complete lines.
 *
 * A file at or under {@link ARCHIVE_LIMITS.scanBytes} is read whole. A larger
 * one is read from `size - scanBytes`, and the first (possibly partial) line is
 * dropped, because half a JSON line is not a record. Nothing throws: a missing
 * file, a directory where a file should be, or an unreadable file all read as
 * "no lines yet".
 * @param file - absolute archive path.
 * @returns Complete lines, oldest first.
 */
function tailLines(file) {
    try {
        const size = statSync(file).size;
        if (size === 0)
            return [];
        const start = Math.max(0, size - ARCHIVE_LIMITS.scanBytes);
        const length = size - start;
        const buffer = Buffer.alloc(length);
        const fd = openSync(file, 'r');
        try {
            readSync(fd, buffer, 0, length, start);
        }
        finally {
            closeSync(fd);
        }
        const text = buffer.toString('utf8');
        const lines = text.split('\n');
        if (start > 0)
            lines.shift();
        return lines;
    }
    catch {
        return [];
    }
}
/** Parse one stored line into an entry, or `undefined` when it is not one. */
function parseLine(line) {
    const trimmed = line.trim();
    if (trimmed === '')
        return undefined;
    try {
        const value = JSON.parse(trimmed);
        if (value === null || typeof value !== 'object')
            return undefined;
        if (value.v !== 1)
            return undefined;
        if (typeof value.id !== 'string' || typeof value.summary !== 'string')
            return undefined;
        if (typeof value.kind !== 'string' || typeof value.at !== 'string')
            return undefined;
        if (typeof value.atMs !== 'number')
            return undefined;
        // Re-sanitize: a line written by an older build is untrusted input here.
        return sanitizeEntry(value);
    }
    catch {
        return undefined;
    }
}
/** The ids already present in the archive, for de-duplication. */
export function archivedIds(options = {}) {
    const ids = new Set();
    for (const line of tailLines(archiveFile(options))) {
        const entry = parseLine(line);
        if (entry !== undefined)
            ids.add(entry.id);
    }
    return ids;
}
/**
 * Append one entry to the durable archive.
 *
 * The write is a single `write(2)` of a complete line through an `O_APPEND`
 * descriptor, so concurrent appenders interleave at line granularity rather
 * than corrupting each other, and a reader never observes a half-written
 * entry from the same process. The de-duplication check reads before it
 * writes; two *processes* racing on the same new id can in principle both
 * write it, which is why readers de-duplicate by id as well (see
 * {@link readArchive}) — the archive stays correct either way, and no entry is
 * ever lost or rewritten.
 * @param input - the fact to record.
 * @param options - archive directory, logger and clock.
 * @returns Whether the entry was written, and why not when it was not.
 */
export function appendArchiveEntry(input, options = {}) {
    const file = archiveFile(options);
    const entry = sanitizeEntry(input);
    if (entry === undefined) {
        options.logger?.warn('memory archive skipped an entry with no id or no summary');
        return { written: false, id: typeof input.id === 'string' ? input.id : '', reason: 'invalid', path: file };
    }
    if (archivedIds(options).has(entry.id)) {
        return { written: false, id: entry.id, reason: 'duplicate', path: file };
    }
    try {
        mkdirSync(archiveDir(options), { recursive: true });
        const fd = openSync(file, 'a', 0o600);
        try {
            writeSync(fd, `${JSON.stringify(entry)}\n`);
        }
        finally {
            closeSync(fd);
        }
        return { written: true, id: entry.id, path: file };
    }
    catch (error) {
        const detail = redactError(error);
        options.logger?.warn(`memory archive write failed: ${detail}`);
        return { written: false, id: entry.id, reason: 'write-failed', detail, path: file };
    }
}
/**
 * Read the archive, newest first — the query a later session makes.
 *
 * Needs nothing but the directory, so it answers identically in the process
 * that wrote the entries, in a fresh process started afterwards, and in a
 * later DSH session. Duplicate ids (the cross-process race described in
 * {@link appendArchiveEntry}) collapse to their first occurrence, and lines
 * this module cannot parse are skipped rather than failing the read.
 * @param options - directory, limit, kind and time filters.
 * @returns Entries newest first, at most `limit`.
 */
export function readArchive(options = {}) {
    const limit = options.limit !== undefined && options.limit > 0 ? Math.floor(options.limit) : ARCHIVE_LIMITS.readLimit;
    const kinds = options.kinds === undefined ? undefined : new Set(options.kinds);
    const seen = new Set();
    const entries = [];
    for (const line of tailLines(archiveFile(options))) {
        const entry = parseLine(line);
        if (entry === undefined)
            continue;
        if (seen.has(entry.id))
            continue;
        seen.add(entry.id);
        if (kinds !== undefined && !kinds.has(entry.kind))
            continue;
        if (options.sinceMs !== undefined && entry.atMs < options.sinceMs)
            continue;
        entries.push(entry);
    }
    entries.sort((left, right) => right.atMs - left.atMs);
    return entries.slice(0, limit);
}
/**
 * Render one entry as the lines a reader (human or model) needs.
 * @param entry - a sanitized archive entry.
 * @returns Multi-line plain text, one fact per line where possible.
 */
export function formatArchiveEntry(entry) {
    const head = [
        `[${entry.at}]`,
        entry.kind,
        entry.status ?? '',
        entry.label === undefined ? '' : `· ${entry.label}`,
        entry.id,
    ].filter(part => part !== '').join(' ');
    const lines = [head];
    if (entry.phase !== undefined)
        lines.push(`  phase: ${entry.phase}`);
    if (entry.objective !== undefined)
        lines.push(`  objective: ${entry.objective}`);
    lines.push(`  summary: ${entry.summary.replace(/\s*\n\s*/g, ' ⏎ ')}`);
    if (entry.evidence !== undefined)
        lines.push(`  evidence: ${entry.evidence.join(' | ')}`);
    return lines.join('\n');
}
/**
 * Render the newest entries as one digest — the text a fresh session prints or
 * quotes when it asks "what has already been archived?".
 * @param options - same filters as {@link readArchive}.
 * @returns The digest, or an explicit "nothing archived" line.
 */
export function recentArchiveDigest(options = {}) {
    const entries = readArchive(options);
    if (entries.length === 0) {
        return `memory archive: no entries in ${archiveFile(options)}`;
    }
    return [
        `memory archive: ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} from ${archiveFile(options)} (newest first)`,
        ...entries.map(entry => formatArchiveEntry(entry)),
    ].join('\n');
}
//# sourceMappingURL=archive.js.map