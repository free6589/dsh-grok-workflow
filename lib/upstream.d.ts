/**
 * Upstream evidence hand-off between the waves of one plan.
 *
 * A downstream task declares `dependsOn`, and the scheduler only starts it when
 * every dependency verified (S2b). Verification alone is not enough to build on:
 * the downstream child has to receive what the upstream actually produced, or it
 * would be working from a task title and a guess. This module builds that block
 * and, together with the scheduler, enforces the hard half of S4 — a downstream
 * task whose dependency carries no evidence at all is failed instead of being
 * run against nothing.
 *
 * "Evidence" here is deliberately narrower than "the upstream said it was done".
 * A verified upstream whose execution carries only a prose summary produced no
 * artifact: the summary is the child's own account, and `AGENTS.md` says a
 * child's self-report is not verification. Such an upstream satisfies its own
 * acceptance criteria (the report's answer-only path) but cannot hand anything
 * downstream, so the dependents are failed rather than fed a self-report.
 *
 * The generated workflow script cannot import host code, so `upstreamDigestSource()`
 * renders this one implementation (and its limits) into script-realm JS, the same
 * way `shardsSource()` and `namingSource()` do. The function below must therefore
 * stay self-contained: no module-level references, no optional chaining, no
 * template literals, no arrow functions closing over outer scope.
 */
/** Budget for the upstream block. Bounds mirror the script realm, pinned by test/upstream.spec.ts. */
export declare const UPSTREAM_LIMITS: {
    /** One dependency's block: the whole point is a summary, not a transcript. */
    readonly perTaskChars: 2000;
    /** Every dependency of one task together (S3's double budget, wired into one prompt). */
    readonly totalChars: 12000;
    /** Items copied per kind, so one verbose child cannot crowd out the others. */
    readonly items: 4;
};
/** One dependency's verified execution, as the scheduler can observe it. */
export interface UpstreamEvidenceSource {
    readonly id: string;
    readonly summary: string;
    readonly deliverables?: readonly {
        readonly description: string;
        readonly locator: string;
    }[];
    readonly evidence?: readonly {
        readonly claim: string;
        readonly source: string;
    }[];
    readonly filesChanged?: readonly string[];
    readonly testsRun?: readonly {
        readonly command: string;
        readonly status: string;
        readonly detail?: string;
    }[];
}
/** What the downstream receives: the block to embed, and the dependencies with nothing to hand over. */
export interface UpstreamDigest {
    readonly text: string;
    readonly missing: readonly string[];
}
/** The first line of the block, so a reader (and a test) can find it in a prompt. */
export declare const UPSTREAM_HEADER = "UPSTREAM EVIDENCE (produced by tasks this run already verified; build on it, and never treat it as evidence for your own acceptance criteria):";
/**
 * Build the upstream block for one task.
 *
 * Every declared dependency gets a fair share of the total budget rather than the
 * first ones taking all of it: a truncated block for the last dependency would
 * look like "that upstream had nothing", which is the state this module exists to
 * report as `missing`, not to fabricate. Only real artifacts count as usable —
 * a summary alone is a self-report, so it lands in `missing`.
 * @param entries - verified dependencies of this task, in declaration order.
 * @param declared - every id the task declares in `dependsOn`.
 * @param limits - budget, passed in because the script realm has no imports.
 * @returns the block (empty when nothing is usable) and the ids with no evidence.
 */
export declare function upstreamDigest(entries: readonly UpstreamEvidenceSource[], declared: readonly string[], limits: {
    readonly perTaskChars: number;
    readonly totalChars: number;
    readonly items: number;
}): UpstreamDigest;
/**
 * Render the block builder above into script-realm JS source.
 * @returns the `UPSTREAM_HEADER`, `UPSTREAM_LIMITS` and `upstreamDigest` declarations.
 */
export declare function upstreamDigestSource(): string;
//# sourceMappingURL=upstream.d.ts.map