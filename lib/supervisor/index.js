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
import { randomUUID } from 'node:crypto';
import { appendVerdictRow, verdictsFor, verdictsFile } from '../block/index.js';
import { runDeterministicChecks, SCOPE_CRITERION } from './checks.js';
import { SUPERVISOR_FAILED, callBlockSupervisor, evidenceHashOf, reasonsFromCriteria, supervisorPrompt } from './verdict.js';
/** The ledger options for one call. */
function ledgerOptions(dir) {
    return dir === undefined ? {} : { dir };
}
/**
 * Judge one finished block.
 *
 * @param input - the block, its handoff, and the seams a test needs.
 * @returns the verdict that was written (or the one already on file).
 */
export async function runBlockSupervisor(input) {
    const { row, block, handoff, ctx, logger, agent } = input;
    const options = ledgerOptions(input.dir);
    const at = new Date(input.now ?? Date.now()).toISOString();
    const tasks = input.tasks ?? block.tasks;
    const evidenceHash = evidenceHashOf({ blockId: row.id, acceptance: block.acceptance, tasks, handoff });
    // 1. Bookkeeping first, and the model is never spent on it.
    const checks = runDeterministicChecks({
        row,
        block,
        handoff,
        tasks,
        ...input.exists === undefined ? {} : { exists: input.exists },
        ...input.root === undefined ? {} : { root: input.root },
    });
    // 2. The same evidence never earns a second verdict line.
    const existing = await verdictsFor(row.id, options);
    const last = existing[existing.length - 1];
    if (last !== undefined && last.evidenceHash === evidenceHash) {
        return {
            outcome: last.outcome,
            verdict: last,
            evidenceUnchanged: true,
            judged: false,
            failures: last.outcome === 'veto' ? last.reasons : [],
            warnings: ['同一份证据已经判过，没有写第二条判决'],
            ledgerPath: verdictsFile(options),
        };
    }
    const attempt = existing.length + 1;
    const write = async (rowToWrite) => {
        const written = await appendVerdictRow(rowToWrite, options);
        return {
            outcome: written.outcome,
            verdict: written,
            evidenceUnchanged: false,
            judged: rowToWrite.route !== 'deterministic',
            failures: written.outcome === 'veto' ? written.reasons : [],
            warnings: checks.warnings,
            ledgerPath: verdictsFile(options),
        };
    };
    const base = {
        v: 1,
        verdictId: randomUUID(),
        blockId: row.id,
        attempt,
        kind: 'supervisor',
        at,
        by: 'plugin:block-supervisor',
        evidenceHash,
    };
    // A scope-only veto is the one a human may overrule; anything else is not overridable.
    const scopeOnly = checks.failures.length > 0 && checks.failures.every(failure => failure.criterion === SCOPE_CRITERION);
    const overridden = scopeOnly && input.override !== undefined;
    if (!checks.ok && !overridden) {
        return await write({
            ...base,
            route: 'deterministic',
            outcome: 'veto',
            criteria: block.acceptance.map(text => ({ text, met: false, evidence: [] })),
            reasons: checks.failures,
        });
    }
    const override = overridden ? { override: { who: input.override.who, why: input.override.why } } : {};
    // 3. The judge. Skipped only when the caller said so, and then the verdict says so.
    if (input.judge === false) {
        return await write({
            ...base,
            route: 'deterministic',
            outcome: 'pass',
            criteria: block.acceptance.map(text => ({ text, met: true, evidence: ['未过监工：按调用方要求跳过（verify.blockSupervisor=false）'] })),
            reasons: [],
            ...override,
        });
    }
    const prompt = supervisorPrompt(block, tasks, handoff);
    const answer = await callBlockSupervisor({
        ctx,
        logger,
        agent,
        prompt,
        routes: input.config.roles.supervisor,
        criteria: block.acceptance,
        ...input.signal === undefined ? {} : { signal: input.signal },
    });
    if (!answer.ok) {
        // Two attempts, no verdict: reported as a failed judge, never as a judgement.
        return await write({
            ...base,
            route: answer.route,
            outcome: 'veto',
            criteria: block.acceptance.map(text => ({ text, met: false, evidence: [] })),
            reasons: [{
                    criterion: '监工',
                    evidence: answer.reason.slice(0, 300),
                    why: `${SUPERVISOR_FAILED}：两次尝试都没有拿到可解析的逐条判断，这次不算通过`,
                }],
            ...override,
        });
    }
    const reasons = reasonsFromCriteria(answer.criteria);
    return await write({
        ...base,
        route: answer.route,
        outcome: reasons.length === 0 ? 'pass' : 'veto',
        criteria: answer.criteria,
        reasons,
        ...override,
    });
}
//# sourceMappingURL=index.js.map