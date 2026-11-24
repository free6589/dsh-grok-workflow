/**
 * One block's verdict: deterministic checks first, the judge second, one appended row.
 *
 * The order is the whole contract:
 *
 * 1. **Deterministic checks** (`./checks.ts`). A failure here is a veto and the model
 *    is never asked — bookkeeping is not a judgement, and a judge asked about
 *    bookkeeping answers plausibly.
 * 2. **Same evidence, same verdict.** A re-submit whose evidence hash matches the last
 *    verdict returns that verdict with `evidence-unchanged` and appends nothing. A veto
 *    is a fact about an attempt, so a second identical attempt must not manufacture a
 *    second fact.
 * 3. **One judge call**, retried once in the same attempt on a transport or format
 *    failure (D-123). Two failures are a veto whose reason is `监工调用失败` — an
 *    honest "no verdict", never a pass by default.
 * 4. **Append only.** A veto writes one verdict line and changes nothing else: the
 *    block row keeps its status, its tasks and its plan id exactly as they were.
 *
 * `override` exists for exactly one class of veto — the scope check — because that is
 * the one a human can legitimately overrule ("yes, I approved that file too"). It is
 * recorded in the verdict row, so the record says who overruled what and why.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { BlockEntry, BlockRow, BlockTaskRow, VerdictReason, VerdictRow } from '../block/index.js';
import type { WorkflowLogger } from '../run.js';
import type { ResolvedConfig } from '../types.js';
/** What the caller asks the supervisor to do. */
export interface BlockSupervisorInput {
    ctx: Context;
    config: ResolvedConfig;
    logger: WorkflowLogger;
    /** The calling agent; the judge child is attributed to it. */
    agent: Agent;
    /** The approved row the block belongs to. */
    row: BlockRow;
    /** The block being closed. */
    block: BlockEntry;
    /** The four-line handoff. */
    handoff: string;
    /** The task split reported at close (falls back to the block's own tasks). */
    tasks?: BlockTaskRow[];
    /**
     * A human's overrule of the scope check only. Anything else in `failures` still
     * vetoes, and the overrule is recorded in the verdict row.
     */
    override?: {
        who: string;
        why: string;
    };
    /**
     * `false` skips the judge (`verify.blockSupervisor: false`). The deterministic
     * checks still run, the returned verdict is still appended, and the outcome says
     * `judged: false` so no caller can read it as a model pass.
     */
    judge?: boolean;
    /** Filesystem seam for the artifact check (tests inject a set of paths). */
    exists?: (path: string) => boolean;
    signal?: AbortSignal;
    /** Ledger directory; defaults to the environment-aware block ledger dir. */
    dir?: string;
    /** Clock override, for tests. */
    now?: number;
}
/** What the caller gets back. */
export interface BlockSupervisorOutcome {
    outcome: 'pass' | 'veto';
    verdict: VerdictRow;
    /** True when this call returned an earlier verdict instead of writing a new one. */
    evidenceUnchanged: boolean;
    /** True when the model was actually asked. */
    judged: boolean;
    /** The deterministic failures that fed the veto (empty on a pass). */
    failures: VerdictReason[];
    warnings: string[];
    ledgerPath: string;
}
/**
 * Judge one finished block.
 *
 * @param input - the block, its handoff, and the seams a test needs.
 * @returns the verdict that was written (or the one already on file).
 */
export declare function runBlockSupervisor(input: BlockSupervisorInput): Promise<BlockSupervisorOutcome>;
//# sourceMappingURL=index.d.ts.map