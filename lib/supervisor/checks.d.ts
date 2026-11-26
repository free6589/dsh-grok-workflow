/**
 * The six checks that run **before** the supervisor model is asked anything.
 *
 * A supervisor call costs a child and a verdict; these six checks cost nothing and
 * they answer the questions a model must never be asked, because a model would answer
 * them plausibly instead of correctly:
 *
 * | check | question | why it cannot be a model's job |
 * | --- | --- | --- |
 * | 1 计划覆盖 | was a task split reported at all, and does every acceptance criterion have a task (or a handoff line) answering it? | it is set membership over text the caller already wrote |
 * | 2 证据非空 | is the evidence line real text, not blanks? | a blank is not evidence, and a model asked about blanks writes an opinion |
 * | 3 产物可解析 | do the declared paths exist and do their pointers parse? | the filesystem is the authority; a model cannot see it |
 * | 4 范围 ⊆ 批准 | is every written path inside the scope the user approved? | this is the approval contract, not a judgement call |
 * | 5 依赖悬空 | does `dependsOn` name a sibling that is really accepted? | the ledger is the authority on what was accepted |
 * | 6 交接四行 | does the handoff carry its four non-empty lines? | a missing line is a missing line |
 *
 * A failure here is a veto with **zero** model calls (`src/supervisor/index.ts` returns
 * before it reaches the engine), which is the point: the expensive judge is spent on
 * judgement, never on bookkeeping.
 *
 * ## Paths are read in the directory the block was approved in
 *
 * A declared write path is relative to the caller's session directory, not to wherever
 * the plugin process happens to stand — a host may launch it anywhere. So the checks
 * take that directory as `root` and resolve every declared path against it; with no
 * `root` they keep the historical behaviour and hand the string through untouched.
 *
 * Both sides of the scope comparison are canonicalised first, so two spellings that
 * reach the same file compare equal: `link/a.md` through a symlink is `real/a.md`. A
 * verdict still quotes the path the caller wrote — an absolute canonical path is the
 * checker's own working value and never appears in `criterion` or `evidence`.
 */
import type { BlockEntry, BlockRow, BlockTaskRow, VerdictReason } from '../block/index.js';
/** The criterion label the scope check uses, so an override can name it exactly. */
export declare const SCOPE_CRITERION = "\u8303\u56F4 \u2286 \u6279\u51C6";
/** The four handoff lines, in the order the contract asks for them. */
export declare const HANDOFF_LINES: readonly ["做了什么", "证据", "没做", "下一步"];
/** What the deterministic pass is given. */
export interface BlockCheckInput {
    /** The approved row the block belongs to (for siblings and approved scope). */
    row: BlockRow;
    /** The block being closed. */
    block: BlockEntry;
    /** The four-line handoff the caller wrote. */
    handoff: string;
    /** The task split reported at close; falls back to the block's own tasks. */
    tasks?: BlockTaskRow[];
    /**
     * Filesystem seam. Defaults to the real `existsSync`/`statSync`; a test injects a
     * set so "the artifact exists" is a stated fact rather than a property of the
     * developer's machine.
     */
    exists?: (path: string) => boolean;
    /**
     * The absolute directory the declared write paths are relative to (the session /
     * approval directory). Absent means the historical behaviour: resolve against the
     * process cwd.
     */
    root?: string;
}
/** Outcome of the deterministic pass. */
export interface BlockCheckResult {
    ok: boolean;
    failures: VerdictReason[];
    warnings: string[];
}
/**
 * Split a declared path into its base path and its pointer.
 *
 * Accepted pointer spellings are the ones this repository already uses in its own
 * documents: `path:12`, `path:12-30`, `path#L12`, `path#L12-L30`. Anything else after
 * a colon is part of the path (a Windows drive letter is kept whole).
 * @param declared - the path as the caller wrote it.
 * @returns The base path and the pointer text (`''` when there is none).
 */
export declare function splitPointer(declared: string): {
    base: string;
    pointer: string;
};
/**
 * Run the six checks.
 *
 * @param input - the block, its row, the handoff, and the task split.
 * @returns `ok` only when every check passed; `failures` names each one that did not.
 */
export declare function runDeterministicChecks(input: BlockCheckInput): BlockCheckResult;
//# sourceMappingURL=checks.d.ts.map