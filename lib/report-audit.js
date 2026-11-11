/**
 * Audit-layer renderer (Section II-B).
 *
 * `renderReport` shows the human answer by default; the machine ledger is
 * opt-in. This module is the opt-in record itself: it renders *every* field of
 * the validated `WorkflowReport` — plan splits, per-attempt outcomes, verifier
 * judgments, evidence, test commands, incompletes, uncertainties and routing
 * diagnostics — so nothing the run captured is lost from the display layer.
 *
 * The record is the validated report object: the host checks it with
 * `assertWorkflowReport`, the memory recorder archives it as structured
 * events, and it ships as the canonical tool result. Rendering here is a pure
 * read, so hiding the audit layer is display-only and can never delete the
 * record. The output deliberately avoids the exact line shapes
 * `src/carryover.ts` parses out of the default report view (`Grok workflow:
 * STATUS`, `Objective:`, `Confirmed evidence:`, `Incomplete:`,
 * `Uncertainties:`, `Final answer:`), so an audit section appended to a
 * relayed report cannot corrupt the cross-round digest.
 */
/**
 * Upper bound on one audit trail. Generous by design — the point of the audit
 * layer is zero record loss — but not unbounded: a hostile or pathological
 * record cannot balloon the relayed message. When the bound fires, the trail
 * says so explicitly instead of ending silently.
 */
export const AUDIT_MAX_CHARS = 96_000;
/** Per-line clip. Long record values stay visible up to this bound. */
const AUDIT_LINE_CHARS = 2_000;
/** Closing line of an untruncated trail; its absence is the truncation tell. */
const COMPLETE_NOTE = 'Audit trail complete.';
/** Clip one record value onto a single bounded line. */
function clip(value, max = AUDIT_LINE_CHARS) {
    const compact = value.replace(/\s+/g, ' ').trim();
    return compact.length <= max ? compact : `${compact.slice(0, Math.max(0, max - 1))}…`;
}
/**
 * Append one `header (count):` section with `- ` rows at the given indent.
 *
 * Empty sections are skipped: nothing to show, and the closing note below
 * still certifies the trail covered the whole record.
 */
function section(out, indent, header, rows) {
    if (rows.length === 0)
        return;
    out.push(`${indent}${header} (${rows.length}):`);
    for (const row of rows)
        out.push(`${indent}- ${row}`);
}
/** Render one recorded child call with every diagnostic field it carried. */
function callTrail(entry) {
    const parts = [
        `${entry.role} chain ${entry.chainIndex} attempt ${entry.attempt} via ${clip(entry.route, 300)}`,
        entry.outcome === 'failed' ? `failed ${entry.failureClass ?? 'unknown'}` : 'ok',
    ];
    if (entry.reason !== undefined && entry.reason !== '')
        parts.push(clip(entry.reason));
    if (entry.queuedMs !== undefined && entry.queuedMs > 0)
        parts.push(`queued ${entry.queuedMs} ms`);
    if (entry.skippedBusy !== undefined && entry.skippedBusy.length > 0) {
        parts.push(`skipped busy: ${entry.skippedBusy.map(label => clip(label, 300)).join(', ')}`);
    }
    return parts.join(' — ');
}
/** Render one attempt's executor payload: every field the worker declared. */
function execution(out, indent, execution) {
    out.push(`${indent}Execution: ${execution.status} — ${clip(execution.summary)}`);
    const deeper = `${indent}  `;
    section(out, deeper, 'Deliverables', execution.deliverables.map(item => `${clip(item.description, 600)} → ${clip(item.locator, 600)}`));
    section(out, deeper, 'Evidence', execution.evidence.map(item => `${clip(item.claim)} ← ${clip(item.source, 600)}`));
    section(out, deeper, 'Tests', execution.testsRun.map(item => `[${item.status}] ${clip(item.command, 600)}${item.detail === '' ? '' : ` — ${clip(item.detail, 600)}`}`));
    section(out, deeper, 'Files changed', execution.filesChanged.map(item => clip(item, 600)));
    section(out, deeper, 'Execution uncertainties', execution.uncertainties.map(item => clip(item)));
}
/** Render one attempt's verifier payload: every judgment and its evidence. */
function verification(out, indent, verification) {
    out.push(`${indent}Verification: ${verification.verdict} — confidence ${verification.confidence}`);
    const deeper = `${indent}  `;
    section(out, deeper, 'Criteria', verification.criteria.map(item => `[${item.met ? 'met' : 'not met'}] ${clip(item.criterion, 600)} → ${clip(item.evidence)}`));
    section(out, deeper, 'Checked evidence', verification.checkedEvidence.map(item => `${clip(item.kind, 200)} ${clip(item.locator, 600)} — ${clip(item.finding)}`));
    section(out, deeper, 'Commands', verification.commandsRun.map(item => `[${item.status}] ${clip(item.command, 600)}${item.detail === '' ? '' : ` — ${clip(item.detail, 600)}`}`));
    section(out, deeper, 'Issues', verification.issues.map(item => clip(item)));
}
/** Render one attempt: outcome, both payloads, the classified failure, the error. */
function attempt(out, attempt) {
    const head = [`Attempt ${attempt.attempt}`];
    if (attempt.route !== undefined)
        head.push(`route ${clip(attempt.route, 300)}`);
    head.push(attempt.passed ? 'passed' : 'not passed');
    out.push(`  ${head.join(' — ')}`);
    if (attempt.execution !== null)
        execution(out, '    ', attempt.execution);
    if (attempt.verification !== null)
        verification(out, '    ', attempt.verification);
    if (attempt.failure !== undefined) {
        const category = attempt.failure.category === undefined ? '' : ` (${attempt.failure.category})`;
        out.push(`  Failure: ${attempt.failure.class}${category} — ${clip(attempt.failure.reason || '(no reason recorded)')}`);
    }
    if (attempt.error !== undefined && attempt.error !== '')
        out.push(`  Attempt error: ${clip(attempt.error)}`);
}
/** Render one task: its declared shape and the full attempt history. */
function task(out, task) {
    out.push(`Task ${task.id} — ${clip(task.title, 200)} — ${task.status.toUpperCase()}`);
    // Not `Objective:` — `src/carryover.ts` compiles the digest objective from
    // any line with that prefix, so a task line would overwrite the round's.
    out.push(`  Task objective: ${clip(task.objective)}`);
    out.push(`  Expected output: ${clip(task.expectedOutput)}`);
    out.push(`  Acceptance criteria (${task.acceptanceCriteria.length}): ${task.acceptanceCriteria.map(item => clip(item, 300)).join(' | ')}`);
    if (task.context !== '')
        out.push(`  Context: ${clip(task.context)}`);
    if (task.constraints.length > 0)
        out.push(`  Constraints: ${task.constraints.map(item => clip(item, 300)).join('; ')}`);
    if (task.writesPaths === null)
        out.push('  Writes paths: unlisted (the plan did not say)');
    else if (task.writesPaths.length === 0)
        out.push('  Writes paths: none declared');
    else
        out.push(`  Writes paths: ${task.writesPaths.map(item => clip(item, 300)).join('; ')}`);
    if (task.originGoalId !== undefined)
        out.push(`  Origin goal: ${clip(task.originGoalId, 200)}`);
    if (task.error !== undefined && task.error !== '')
        out.push(`  Task error: ${clip(task.error)}`);
    for (const entry of task.attempts)
        attempt(out, entry);
}
/**
 * Render the complete technical record of a validated report.
 *
 * Deterministic, pure, and ordered like the report itself. Bounded by
 * {@link AUDIT_MAX_CHARS}; a truncated trail ends with an explicit marker
 * naming the bound and pointing at the record object, never a silent cut.
 *
 * @param report - the validated report whose record is rendered in full.
 * @returns the audit trail text.
 */
export function renderAuditTrail(report) {
    const out = [
        'Technical audit trail (complete machine record; display-only copy — hiding this section never deletes the validated report it renders):',
        `Status: ${report.status.toUpperCase()}`,
        `Objective (full): ${clip(report.objective)}`,
        `Schema: ${report.schemaVersion}`,
        `Plan: source=${report.plan.source}; tasks=${report.plan.tasks.length}${report.plan.error === undefined || report.plan.error === '' ? '' : `; planning error=${clip(report.plan.error)}`}`,
    ];
    if (report.plan.failure !== undefined && report.plan.failure !== null) {
        const category = report.plan.failure.category === undefined ? '' : ` (${report.plan.failure.category})`;
        out.push(`Plan failure: ${report.plan.failure.class}${category} — ${clip(report.plan.failure.reason || '(no reason recorded)')}`);
    }
    if (report.plan.tasks.length > 0) {
        out.push(`Plan splits (${report.plan.tasks.length}):`);
        for (const item of report.plan.tasks) {
            out.push(`- plan task ${item.id} "${clip(item.title, 200)}": objective=${clip(item.objective)}; expected output=${clip(item.expectedOutput)}`);
            const extras = [];
            if (item.acceptanceCriteria.length > 0) {
                extras.push(`criteria: ${item.acceptanceCriteria.map(criterion => clip(criterion, 300)).join(' | ')}`);
            }
            if (item.context !== '')
                extras.push(`context=${clip(item.context)}`);
            if (item.constraints.length > 0)
                extras.push(`constraints=${item.constraints.map(item => clip(item, 300)).join('; ')}`);
            if (item.writesPaths === undefined || item.writesPaths === null)
                extras.push('writes paths=unlisted (the plan did not say)');
            else if (item.writesPaths.length === 0)
                extras.push('writes paths=none declared');
            else
                extras.push(`writes paths=${item.writesPaths.map(item => clip(item, 300)).join('; ')}`);
            if (item.originGoalId !== undefined)
                extras.push(`origin goal=${clip(item.originGoalId, 200)}`);
            if (extras.length > 0)
                out.push(`  ${extras.join('; ')}`);
        }
    }
    const limits = [
        `maxConcurrency=${report.limits.maxConcurrency}`,
        `maxRetries=${report.limits.maxRetries}`,
        `maxTasks=${report.limits.maxTasks}`,
        `maxTotalAgents=${report.limits.maxTotalAgents}`,
    ];
    if (report.limits.timeoutMs !== undefined)
        limits.push(`deadline=${report.limits.timeoutMs} ms`);
    out.push(`Limits: ${limits.join('; ')}`);
    const roles = ['planner', 'worker', 'verifier', 'synthesizer'];
    out.push(`Chains: ${roles.map(role => `${role}=${report.routing[role].length === 0 ? 'inherit' : report.routing[role].join(' → ')}`).join('; ')}`);
    if (report.routes.length > 0) {
        out.push(`Calls (${report.routes.length} recorded child calls, in order):`);
        for (const entry of report.routes)
            out.push(`- ${callTrail(entry)}`);
    }
    const synthesis = [`mode=${report.synthesis.mode}`];
    if (report.synthesis.summary !== undefined)
        synthesis.push(`summary=${clip(report.synthesis.summary)}`);
    if (report.synthesis.error !== undefined)
        synthesis.push(`error=${clip(report.synthesis.error)}`);
    out.push(`Synthesis: ${synthesis.join('; ')}`);
    if (report.tasks.length > 0) {
        out.push(`Tasks (${report.tasks.length}):`);
        for (const entry of report.tasks)
            task(out, entry);
    }
    section(out, '', 'Confirmed evidence', report.confirmed.map(item => `${item.taskId}: ${clip(item.criterion, 600)} → ${clip(item.evidence)}`));
    section(out, '', 'Incomplete', report.incomplete.map(item => `${item.taskId}${item.category === undefined ? '' : ` (${item.category})`}: ${clip(item.reason)}`));
    section(out, '', 'Errors', report.errors.map(item => `${item.phase}: ${clip(item.message)}${item.category === undefined ? '' : ` (${item.category})`}`));
    section(out, '', 'Uncertainties', report.uncertainties.map(item => `${item.taskId}: ${clip(item.text)}`));
    const text = out.join('\n');
    if (text.length <= AUDIT_MAX_CHARS)
        return `${text}\n${COMPLETE_NOTE}`;
    return `${text.slice(0, AUDIT_MAX_CHARS)}\n[audit trail truncated at ${AUDIT_MAX_CHARS} characters; the validated report object remains the complete record]`;
}
//# sourceMappingURL=report-audit.js.map