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
/** What one archive entry describes. */
export type ArchiveKind = 'round' | 'agent' | 'note';
/** Bounds applied to every entry before it is written. */
export declare const ARCHIVE_LIMITS: {
    /** Characters kept from one round objective or agent label. */
    readonly objectiveChars: 300;
    /** Characters kept from one entry's `summary` (the actual finding). */
    readonly summaryChars: 4000;
    /** Characters kept from one evidence locator. */
    readonly evidenceChars: 400;
    /** Evidence locators kept per entry. */
    readonly evidenceItems: 8;
    /** Characters kept from an entry id (identity, never content). */
    readonly idChars: 200;
    /** Entries returned by one read when no limit is given. */
    readonly readLimit: 50;
    /**
     * Bytes scanned from the tail of the file to build the id set for
     * de-duplication and for reads. A bounded tail keeps a long-lived archive
     * cheap to consult while still covering far more entries than one session
     * can produce.
     */
    readonly scanBytes: number;
};
/** One durable memory entry: a round, a child agent, or a free-standing note. */
export interface ArchiveEntry {
    /** Entry schema version owned by this module. */
    v: 1;
    /**
     * Deterministic identity, and therefore the de-duplication key:
     * `run:<runId>` for one round, `run:<runId>:agent:<seq>` for one child, and
     * `note:<sessionId>:<n>` for a note. Re-archiving the same fact is a no-op.
     */
    id: string;
    kind: ArchiveKind;
    /** When the fact happened (ISO 8601, host clock). */
    at: string;
    /** Epoch milliseconds of `at`; ordering never depends on parsing `at`. */
    atMs: number;
    /** Session that owned the round, when the runtime exposed one. */
    sessionId?: string;
    /** Engine run id; correlates the entry with a report and the GUI node. */
    runId?: string;
    /** Round turn number in the owning session, when known. */
    turn?: number;
    /** 1-based `agent()` sequence number within the run (agent entries). */
    seq?: number;
    /** Progress phase (the task group) the child belonged to. */
    phase?: string;
    /** Child label, or the workflow name for a round. */
    label?: string;
    /** Outcome word: `completed` / `partial` / `failed` / `cancelled`. */
    status?: string;
    /** Redacted, bounded round objective. */
    objective?: string;
    /** The finding itself, redacted and bounded. This is the field a reader quotes. */
    summary: string;
    /** File/URL locators the finding rested on, redacted and bounded. */
    evidence?: string[];
}
/** Arguments accepted by {@link appendArchiveEntry} (id and summary required). */
export type ArchiveEntryInput = ArchiveEntry;
/** Where the archive lives and how failures are reported. */
export interface ArchiveOptions {
    /** Explicit archive directory; overrides the environment. */
    dir?: string;
    /** Destination for one-line warnings; archiving never throws, so this is the only channel. */
    logger?: {
        warn(message: string): void;
    };
    /** Clock injection for deterministic tests. */
    now?: () => number;
}
/** One append attempt's result. Never thrown — always returned. */
export interface ArchiveAppendResult {
    /** True when this call is what put the entry on disk. */
    written: boolean;
    /** Entry id that was considered (empty when the input had no usable id). */
    id: string;
    /** Why nothing was written; absent on success. */
    reason?: 'duplicate' | 'invalid' | 'write-failed';
    /** Redacted detail for `write-failed`. */
    detail?: string;
    /** Absolute path of the archive file considered. */
    path?: string;
}
/**
 * Resolve the archive directory.
 *
 * The environment override exists because a test, an e2e lane and a real
 * operator all need to point the archive at a scratch directory without a
 * config key (and without writing into a user's `$HOME`).
 * @param options - caller options; `dir` wins over the environment.
 * @returns The absolute archive directory.
 */
export declare function archiveDir(options?: ArchiveOptions): string;
/** The append-only JSONL file this module owns. */
export declare function archiveFile(options?: ArchiveOptions): string;
/**
 * Normalize one entry into exactly what will be serialised.
 *
 * Called on the way in *and* on the way out, because an entry written by an
 * older build is as untrusted as one a caller passes now.
 * @param input - candidate entry.
 * @returns The sanitized entry, or `undefined` when it has no usable identity
 *   or summary (an entry without either is not a memory, it is noise).
 */
export declare function sanitizeEntry(input: ArchiveEntry): ArchiveEntry | undefined;
/** The ids already present in the archive, for de-duplication. */
export declare function archivedIds(options?: ArchiveOptions): Set<string>;
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
export declare function appendArchiveEntry(input: ArchiveEntry, options?: ArchiveOptions): ArchiveAppendResult;
/** Filters for {@link readArchive}. */
export interface ArchiveReadOptions extends ArchiveOptions {
    /** Maximum entries returned (newest first). */
    limit?: number;
    /** Only entries of these kinds; all kinds when absent. */
    kinds?: readonly ArchiveKind[];
    /** Only entries at or after this epoch-ms instant. */
    sinceMs?: number;
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
export declare function readArchive(options?: ArchiveReadOptions): ArchiveEntry[];
/**
 * Render one entry as the lines a reader (human or model) needs.
 * @param entry - a sanitized archive entry.
 * @returns Multi-line plain text, one fact per line where possible.
 */
export declare function formatArchiveEntry(entry: ArchiveEntry): string;
/**
 * Render the newest entries as one digest — the text a fresh session prints or
 * quotes when it asks "what has already been archived?".
 * @param options - same filters as {@link readArchive}.
 * @returns The digest, or an explicit "nothing archived" line.
 */
export declare function recentArchiveDigest(options?: ArchiveReadOptions): string;
//# sourceMappingURL=archive.d.ts.map