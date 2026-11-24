/**
 * The block-intake ledger: shapes and bounds.
 *
 * A "block intake" is one user-approved split of an objective into 1..3 blocks.
 * The ledger is append-only and lives next to the task board
 * (`$DSH_HOME/taskboards/grok-workflow`), in three files:
 *
 * - `blocks.jsonl` — one line per *version* of one intake row. Re-reading the
 *   same row id later appends a higher `version`; nothing is ever rewritten in
 *   place, so "who accepted what, when" survives every restart.
 * - `verdicts.jsonl` — one line per supervisor verdict. Append-only, never
 *   updated, never deleted: a veto is a fact about an attempt, not a mutable
 *   status.
 * - `heartbeats.jsonl` — one line per heartbeat delivery observed on a session
 *   that still owes block work (written by `./brakes.ts`, which also owns the
 *   file's name and reader; capped at `HEARTBEAT_OBSERVATION_LIMIT` = 200 lines
 *   because a beat is not a decision). It is kept out of the other two on
 *   purpose: `verdicts.jsonl` records judgements, and a beat is not one, while a
 *   `blocks.jsonl` version slot is capped at `versionsPerBlock` (20), so charging
 *   heartbeats against it would retire a real block after 20 beats.
 *
 * Every row carries a `rowHash` (block rows) so a hand-edited or torn line is
 * detectable, and the reader skips such a line instead of failing the whole
 * ledger (see `./store.ts`).
 *
 * This module holds no logic — only the vocabulary the store, the preview, and
 * the tool layer share.
 */
/** Ledger schema tag; a row carrying anything else is not this ledger's row. */
export const BLOCK_LEDGER_VERSION = 1;
/**
 * Hard bounds for one intake. They exist so a malformed or hostile preview
 * cannot make an unbounded ledger row, an unbounded prompt, or an unbounded
 * number of live previews.
 */
export const BLOCK_INTAKE_LIMITS = {
    /** Blocks one preview may hold. */
    blocksPerPreview: 3,
    /** How long a preview stays startable. */
    previewTtlMs: 600_000,
    /** Live previews remembered per session; the oldest is dropped first. */
    previewsPerSession: 20,
    /** Appended versions per block id before the ledger refuses more. */
    versionsPerBlock: 20,
    titleChars: 120,
    objectiveChars: 2_000,
    deliverableChars: 2_000,
    criteriaPerBlock: 8,
    criterionChars: 300,
    writesPathsPerBlock: 16,
    pathChars: 300,
    quoteChars: 2_000,
    ownerChars: 80,
};
/** The one error type of this subsystem, with a stable `code`. */
export class BlockIntakeError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'BlockIntakeError';
        this.code = code;
    }
}
//# sourceMappingURL=types.js.map