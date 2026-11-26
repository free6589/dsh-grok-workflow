/**
 * Preview → start: the two halves of the intake desk.
 *
 * ## Preview is pure, start is the only writer
 *
 * `previewBlocks` computes what the user will see and remembers it in memory
 * for `previewTtlMs`. It writes nothing: a preview is a question, not a
 * decision. `startBlock` is the only function here that touches the ledger, and
 * it does so only after five things hold.
 *
 * ## The split hash is the contract
 *
 * `splitHash` is the sha-256 of the *normalized* split (objective, blocks,
 * constraints, non-goals) serialized with `canonicalJson`. Normalization is
 * what makes it stable: trimmed text, no blank entries, write paths run through
 * `normalizeWritePath`. Two previews of the same split therefore hash
 * identically — and any real edit changes the hash, which is exactly how a
 * "start" against a stale preview is caught.
 *
 * `verify` is outside that fingerprint on purpose (see `normalizeSplit`): it is
 * how the work is checked, not what the work is. `root` is outside it for the same
 * reason — it is the tree the work lives in, not the work — so the same split
 * approved from another directory is still the same split, not an edited one.
 *
 * ## Why start checks in a fixed order
 *
 * 1. the preview exists (else `not-found`);
 * 2. it has not expired (else `preview-expired`);
 * 3. the submitted `splitHash` is byte-identical to the preview's (else
 *    `split-changed`);
 * 4. one of the messages after the preview contains the approval quote
 *    verbatim (else `approval-required`);
 * 5. `approved === true` (else `not-approval`).
 *
 * The order is the user's story: "you never saw this" outranks "you saw it but
 * it changed", which outranks "you changed it but did not say yes". A caller
 * that gets `approval-required` therefore knows the words are missing, not that
 * the split moved underneath it.
 *
 * ## Idempotency comes first, before all five
 *
 * Starting the same split twice must hand back the same `blockId` and must not
 * append a second line. So `startBlock` looks the split up in the ledger before
 * it validates anything: a retry after a crash — or after the preview expired,
 * or after the plugin restarted and lost its in-memory previews — still returns
 * the block that already exists. Nothing is re-approved and nothing is
 * rewritten; `reused: true` says which case the caller is in.
 */
import { type BlockLedgerOptions } from './paths.js';
import { type ApprovalKind, type BlockExecution, type BlockPreview, type BlockStartResult } from './types.js';
/** One block as the caller proposes it. */
export interface BlockEntryInput {
    title: string;
    objective: string;
    deliverable: string;
    acceptance: string[];
    writesPaths?: string[];
    /** Titles of other blocks in the same split this block waits on. */
    dependsOn?: string[];
    execution?: BlockExecution;
    owner?: string;
}
/** What a caller hands to `previewBlocks`. */
export interface PreviewInput {
    sessionId: string;
    objective: string;
    blocks: BlockEntryInput[];
    constraints?: string[];
    nonGoals?: string[];
    verify?: {
        blockSupervisor?: boolean;
    };
    /**
     * The absolute directory this split is being approved in (the calling session's
     * directory). Recorded on the preview and carried onto the row, so a close in a
     * different session — or after a restart — resolves declared write paths against the
     * tree the work really lives in. A relative or empty value is dropped, never refused.
     */
    root?: string;
    /** Clock override, in epoch milliseconds. */
    now?: number;
}
/** What a caller hands to `startBlock` once the user has said yes. */
export interface StartInput {
    sessionId: string;
    previewId: string;
    splitHash: string;
    approval: {
        kind: ApprovalKind;
        quote: string;
        sourceMessageId?: string;
    };
    /** The user's messages since the preview; the quote must appear in one of them. */
    messagesAfterPreview: string[];
    approved: boolean;
    /** Clock override, in epoch milliseconds. */
    now?: number;
}
/** One block after normalization — this is what the hash is taken over. */
export interface NormalizedBlock {
    title: string;
    objective: string;
    deliverable: string;
    acceptance: string[];
    writesPaths: string[];
    dependsOn: string[];
    execution: BlockExecution;
    owner?: string;
}
/** The normalized split: the only thing `splitHash` is computed from. */
export interface BlockSplit {
    objective: string;
    blocks: NormalizedBlock[];
    constraints: string[];
    nonGoals: string[];
}
/** A live preview plus what `startBlock` needs to know about it. */
export interface StoredPreview {
    previewId: string;
    sessionId: string;
    splitHash: string;
    render: string;
    warnings: string[];
    expiresAt: string;
    /** Epoch milliseconds of `expiresAt`, so the check needs no date parsing. */
    expiresAtMs: number;
    createdAtMs: number;
    split: BlockSplit;
    /** The intake-time verification switches; kept beside the split, not in it. */
    verify?: {
        blockSupervisor?: boolean;
    };
    /** The canonical directory this split was approved in, when one was recorded. */
    root?: string;
}
/**
 * The one rule for turning a directory into the value the ledger records.
 *
 * Only a non-empty absolute path is accepted, then it is canonicalised so two
 * spellings of one tree compare equal: the real path when the directory exists (a
 * symlinked checkout, a `..` in the middle), the resolved path when it does not,
 * because a preview may be recorded before the tree is created. Everything else — a
 * relative path, an empty string, a non-string — is `undefined`.
 *
 * Dropping instead of refusing is deliberate: a preview must stay total and cheap. A
 * directory that cannot be named is not a reason to fail a split, and inventing one
 * would record a fact nobody stated.
 * @param value - the caller's directory, of unknown shape.
 * @returns The canonical absolute directory, or `undefined` when none was given.
 */
export declare function canonicalDirectory(value: unknown): string | undefined;
/**
 * Validate and normalize a proposed split. Pure: no disk, no memory, no clock.
 *
 * `verify` is intentionally *not* part of the returned split, so it never
 * reaches `splitHash`. The hash answers "is this the work the user approved?",
 * and the supervisor switch is an execution policy laid on top of that work:
 * folding it in would make "the user turned the judge off" look like "the user
 * changed the order", and `startBlock` would refuse a preview nobody edited.
 * The switch still has to survive — it rides on the row via `BlockRow.verify`
 * — but it rides beside the fingerprint, not inside it.
 * @param input - the caller's proposal.
 * @returns The normalized split the hash is taken over.
 */
export declare function normalizeSplit(input: PreviewInput): BlockSplit;
/**
 * The split's fingerprint: sha-256 over its canonical JSON.
 * @param split - a normalized split.
 */
export declare function splitHashOf(split: BlockSplit): string;
/**
 * Compute a preview and remember it for this session.
 *
 * Nothing is written to disk: this is the question, not the answer.
 * @param input - the proposed split.
 * @param options - ledger location (reserved; a preview never reads or writes it).
 * @returns The preview, including the hash `startBlock` will demand back.
 */
export declare function previewBlocks(input: PreviewInput, options?: BlockLedgerOptions): BlockPreview;
/**
 * Look up a live (or expired) preview. Expired entries are still returned on
 * purpose: `startBlock` can then say "this preview expired" instead of the
 * misleading "no such preview".
 */
export declare function previewById(previewId: string): StoredPreview | undefined;
/** Forget every remembered preview. For tests and for an explicit session reset. */
export declare function resetPreviews(): void;
/**
 * Turn an approved preview into a ledger row.
 *
 * Idempotent by split: a split already in the ledger is returned as-is
 * (`reused: true`) before any validation runs, so a retry never appends a
 * second line and never bumps the version.
 * @param input - the preview id, the hash the user approved, the quote, and the
 *   messages since the preview.
 * @param options - ledger directory.
 * @returns The block id, its status, where it was written, and the dispatch line.
 */
export declare function startBlock(input: StartInput, options?: BlockLedgerOptions): Promise<BlockStartResult>;
//# sourceMappingURL=preview.d.ts.map