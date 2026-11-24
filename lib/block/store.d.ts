/**
 * The block-intake ledger on disk: two append-only JSONL files.
 *
 * ## Model
 *
 * - `blocks.jsonl` holds one line per **version** of an intake row. Starting the
 *   same row again appends `version + 1`; nothing is ever rewritten in place, so
 *   the ledger is a log of what was accepted, not a mutable table. The version
 *   is not the caller's to invent: the writer computes `上一版 + 1` and refuses
 *   a line that claims anything else, which is what makes "the 21st version" a
 *   real, checkable limit rather than a convention.
 * - `verdicts.jsonl` holds one line per supervisor verdict. Append-only, with
 *   no update and no delete path anywhere in this module: a veto that was later
 *   overridden is still part of the record.
 * - Every block row carries `rowHash` — the sha-256 of its own canonical JSON
 *   with `rowHash` removed. Writing validates it; reading re-derives it. A
 *   hand-edited or torn line is therefore detectable.
 *
 * ## Durability
 *
 * The same recipe as `src/taskboard/store.ts`: read the current file, build the
 * next body in memory, write it to a hidden `*.tmp` file in the same directory,
 * `fsync` it, and only then `rename` it over the target. A reader never sees a
 * half-written file, and a failed write leaves the previous file byte-identical
 * — the temporary file is removed on every failure path.
 *
 * ## Corrupt lines
 *
 * Reading never throws on a bad line. One torn or hand-edited line must not make
 * the rest of the ledger unreadable, so a bad line is skipped and reported in
 * `skipped` (line number, reason, and a truncated copy of the text) next to the
 * rows that did parse. Writing is the strict side: a row that does not validate
 * is refused before any byte is written.
 *
 * ## What this module does not do
 *
 * It takes no lock. Two processes appending to the same ledger at the same
 * instant could both read the same "last version" and append the same number;
 * the second rename wins and the first line is lost. The caller in this plugin
 * is one session's tool layer, and the idempotency check in `startBlock` means
 * a retry does not append at all — but a multi-writer deployment would need the
 * lock the task board uses, and that is a deliberate, documented boundary here.
 */
import { type BlockLedgerOptions } from './paths.js';
import { type BlockRow, type VerdictRow } from './types.js';
/** Where the ledger lives; `dir` wins over the environment (see `./paths.ts`). */
export type BlockStoreOptions = BlockLedgerOptions;
/** One line the reader could not use, kept so the caller can say why. */
export interface SkippedLedgerLine {
    /** 1-based line number in the file. */
    line: number;
    /** Why it was skipped, in one sentence. */
    reason: string;
    /** The first 200 characters of the line, so a human can find it again. */
    text: string;
}
/** Rows that parsed, plus the lines that did not (an array, so `rows[0]` still works). */
export type BlockRowsRead = BlockRow[] & {
    skipped: SkippedLedgerLine[];
};
/** Same shape as `BlockRowsRead`, for the verdicts file. */
export type VerdictRowsRead = VerdictRow[] & {
    skipped: SkippedLedgerLine[];
};
/** Sort object keys so a hash is reproducible offline, with no spaces anywhere. */
export declare function canonicalJson(value: unknown): string;
/** Lower-case hex sha-256 of a UTF-8 string. */
export declare function sha256Hex(text: string): string;
/**
 * The row's own hash: sha-256 over its canonical JSON with `rowHash` removed.
 * @param row - the row to hash; its current `rowHash` is ignored.
 */
export declare function rowHashOf(row: BlockRow): string;
/**
 * Append one version of an intake row.
 *
 * The writer owns the version: it is `上一版 + 1`, and a row claiming any other
 * number is refused (`invalid`) rather than silently renumbered, because a
 * caller that read a stale version must be told, not guessed around. Above
 * `versionsPerBlock` appended versions the ledger refuses with `version-limit`.
 *
 * `rowHash` may be left empty (the writer stamps it) but, when supplied, it must
 * already be the hash of the row as written.
 * @param row - the row to append; `version` must be the next one for its id.
 * @param options - ledger directory.
 * @returns The row as written, `rowHash` stamped.
 */
export declare function appendBlockRow(row: BlockRow, options?: BlockStoreOptions): Promise<BlockRow>;
/** Every usable block row, in file order, plus the lines that were skipped. */
export declare function readBlockRows(options?: BlockStoreOptions): Promise<BlockRowsRead>;
/** The current (highest-version) row for this session + split, if one was accepted. */
export declare function findBlockBySplit(sessionId: string, splitHash: string, options?: BlockStoreOptions): Promise<BlockRow | undefined>;
/** The current (highest-version) row for one block id, if it exists. */
export declare function getBlockRow(blockId: string, options?: BlockStoreOptions): Promise<BlockRow | undefined>;
/**
 * Append one supervisor verdict.
 *
 * Append-only by construction: this module has no update or delete path for
 * verdicts, so a second verdict on the same attempt is a second line, and the
 * first line stays byte-identical.
 */
export declare function appendVerdictRow(row: VerdictRow, options?: BlockStoreOptions): Promise<VerdictRow>;
/** Every usable verdict row, in file order, plus the lines that were skipped. */
export declare function readVerdictRows(options?: BlockStoreOptions): Promise<VerdictRowsRead>;
/** One block's verdicts, oldest attempt first. */
export declare function verdictsFor(blockId: string, options?: BlockStoreOptions): Promise<VerdictRow[]>;
//# sourceMappingURL=store.d.ts.map