/**
 * The five block tools, registered only when `blockIntake` is on.
 *
 * The shape of the surface is the shape of the work: a user previews a split, says
 * yes in their own words, one block is claimed by a dispatcher, the dispatcher reports a
 * four-line handoff, and an independent judge decides. Every tool here is one step of
 * that loop, and none of them is a place where the plugin makes a judgement of its own
 * except `grok_close_block`, which defers to `src/supervisor/`.
 *
 * Two rules run through all of them:
 *
 * - **The ledger is the truth.** Every tool re-reads the row it is about; none of them
 *   caches a status, because a second process (or a second session) may have appended a
 *   version in between.
 * - **The caller gets plain words, not internals.** A refusal names the code and the
 *   next step; the supervisor's prompt, its raw output and the routing are never
 *   returned. What comes back is a verdict, its reasons, and where the record is.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ActiveState } from '../run.js';
import type { ResolvedConfig } from '../types.js';
/** Tool names, exported so the flag test and the docs can name them once. */
export declare const BLOCK_TOOL_NAMES: {
    readonly open: "grok_open_block";
    readonly accept: "grok_accept_block";
    readonly close: "grok_close_block";
    readonly status: "grok_block_status";
    readonly steer: "grok_steer";
    readonly stop: "grok_stop";
};
/** A refusal a caller can act on: the code, the ledger's own words, and the next step. */
export declare class BlockToolError extends Error {
    readonly code: string;
    constructor(code: string, detail: string);
}
/** Dependencies of the tool layer. */
export interface BlockToolDeps {
    ctx: Context;
    logger: {
        warn(message: string): void;
        info?(message: string): void;
    };
    readConfig: () => ResolvedConfig;
    /** Live runs, so `grok_stop` can cancel the one a block is executing in. */
    state?: ActiveState;
    /** Clock override, for tests. */
    now?: () => number;
}
/**
 * Register the block tools.
 *
 * Called from `apply()` only when `readConfig().blockIntake === true`, so an off profile
 * has none of these names in its tool list.
 * @param deps - context, logger, configuration reader and the live-run set.
 */
export declare function registerBlockTools(deps: BlockToolDeps): void;
//# sourceMappingURL=tools.d.ts.map