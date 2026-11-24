/**
 * Audit-layer renderer: the complete machine record, on demand.
 *
 * `renderReport` renders the concise view every caller already parses; this
 * module renders *every* field of the validated `WorkflowReport` — plan
 * provenance, the wave partition, the boundary ledger, per-attempt outcomes,
 * verifier judgments, evidence, test commands, the full call trail, dead
 * routes, the limits and all five chains — so nothing the run captured is lost
 * at the display layer.
 *
 * The record is the validated report object: the host checks it with
 * `assertWorkflowReport`, the memory recorder archives it as structured events,
 * and it ships as the canonical tool result. Rendering here is a pure read, so a
 * trail that is never asked for is display-only and can never delete the record.
 *
 * The output deliberately avoids the exact line shapes `src/carryover.ts`
 * parses out of the report (`Grok workflow: STATUS`, `Objective:`,
 * `Confirmed evidence:`, `Incomplete:`, `Uncertainties:`, `Final answer:`, and
 * the `- id: status (N attempts) — title` task rows), so an audit section
 * appended to a rendered report cannot corrupt the cross-round digest.
 */
/**
 * Upper bound on one audit trail. Generous by design — the point of the audit
 * layer is zero record loss — but not unbounded: a hostile or pathological
 * record cannot balloon the rendered message. When the bound fires, the trail
 * says so explicitly instead of ending silently.
 */
export const AUDIT_MAX_CHARS = 96_000;
/** Per-line clip. Long record values stay visible up to this bound. */
const AUDIT_LINE_CHARS = 2_000;
/** Closing line of an untruncated trail; its absence is the truncation tell. */
const COMPLETE_NOTE = 'Audit trail complete.';
/**
 * Every role the record can carry a chain for, in the order the report names
 * them. `supervisor` sits before `synthesizer` because that is the order the
 * run calls them in — and because "every field" is false if a role that
 * inherits silently vanishes from the list.
 */
const ROLES = ['planner', 'worker', 'verifier', 'supervisor', 'synthesizer'];
/** Clip one record value onto a single bounded line. */
function clip(value, max = AUDIT_LINE_CHARS) {
    const compact = value.replace(/\s+/g, ' ').trim();
    return compact.length <= max ? compact : `${compact.slice(0, Math.max(0, max - 1))}…`;
}
/** Id list as one value: `none` says the run changed nothing there. */
function ids(values) {
    return values.length === 0 ? 'none' : values.map(value => clip(value, 200)).join(', ');
}
/**
 * Append one `header (count):` section with `- ` rows.
 *
 * Empty sections are skipped: nothing to show, and the closing note below still
 * certifies the trail covered the whole record.
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
    if (entry.taskId !== undefined)
        parts.push(`task ${clip(entry.taskId, 200)}`);
    if (entry.reason !== undefined && entry.reason !== '')
        parts.push(clip(entry.reason));
    if (entry.queuedMs !== undefined && entry.queuedMs > 0)
        parts.push(`queued ${entry.queuedMs} ms`);
    if (entry.skippedBusy !== undefined && entry.skippedBusy.length > 0) {
        parts.push(`skipped busy: ${entry.skippedBusy.map(label => clip(label, 300)).join(', ')}`);
    }
    return parts.join(' — ');
}
/** Render one dead route: the label, the transport family, the streak. */
function deadRoute(entry) {
    return `${clip(entry.route, 300)}: ${entry.class} (${entry.streak} in a row)`;
}
/** Render one attempt's executor payload: every field the worker declared. */
function execution(out, indent, payload) {
    out.push(`${indent}Execution: ${payload.status} — ${clip(payload.summary)}`);
    const deeper = `${indent}  `;
    section(out, deeper, 'Deliverables', payload.deliverables.map(item => `${clip(item.description, 600)} → ${clip(item.locator, 600)}`));
    section(out, deeper, 'Evidence', payload.evidence.map(item => `${clip(item.claim)} ← ${clip(item.source, 600)}`));
    section(out, deeper, 'Tests', payload.testsRun.map(item => `[${item.status}] ${clip(item.command, 600)}${item.detail === '' ? '' : ` — ${clip(item.detail, 600)}`}`));
    section(out, deeper, 'Files changed', payload.filesChanged.map(item => clip(item, 600)));
    section(out, deeper, 'Execution uncertainties', payload.uncertainties.map(item => clip(item)));
}
/** Render one attempt's verifier payload: every judgment and its evidence. */
function verification(out, indent, payload) {
    out.push(`${indent}Verification: ${payload.verdict} — confidence ${payload.confidence}`);
    const deeper = `${indent}  `;
    section(out, deeper, 'Criteria', payload.criteria.map(item => `[${item.met ? 'met' : 'not met'}] ${clip(item.criterion, 600)} → ${clip(item.evidence)}`));
    section(out, deeper, 'Checked evidence', payload.checkedEvidence.map(item => `${clip(item.kind, 200)} ${clip(item.locator, 600)} — ${clip(item.finding)}`));
    section(out, deeper, 'Commands', payload.commandsRun.map(item => `[${item.status}] ${clip(item.command, 600)}${item.detail === '' ? '' : ` — ${clip(item.detail, 600)}`}`));
    section(out, deeper, 'Issues', payload.issues.map(item => clip(item)));
}
/** Render one attempt: outcome, both payloads, the classified failure, the error. */
function attempt(out, entry) {
    const head = [`Attempt ${entry.attempt}`];
    if (entry.route !== undefined)
        head.push(`route ${clip(entry.route, 300)}`);
    // Both flags say how this attempt reached its payload, which the outcome alone
    // cannot: a resubmit is not a retry, and a re-fired judge did not re-run the work.
    if (entry.resubmitted === true)
        head.push('same-attempt resubmit');
    if (entry.judgeRetried === true)
        head.push('judge re-fired');
    head.push(entry.passed ? 'passed' : 'not passed');
    out.push(`  ${head.join(' — ')}`);
    if (entry.execution !== null)
        execution(out, '    ', entry.execution);
    if (entry.verification !== null)
        verification(out, '    ', entry.verification);
    if (entry.failure !== undefined) {
        const category = entry.failure.category === undefined ? '' : ` (${entry.failure.category})`;
        out.push(`  Failure: ${entry.failure.class}${category} — ${clip(entry.failure.reason || '(no reason recorded)')}`);
    }
    if (entry.error !== undefined && entry.error !== '')
        out.push(`  Attempt error: ${clip(entry.error)}`);
}
/** Render one task: its declared shape and the full attempt history. */
function task(out, entry) {
    out.push(`Task ${entry.id} — ${clip(entry.title, 200)} — ${entry.status.toUpperCase()}`);
    // Not `Objective:` — `src/carryover.ts` compiles the digest objective from
    // any line with that prefix, so a task line would overwrite the round's.
    out.push(`  Task objective: ${clip(entry.objective)}`);
    out.push(`  Expected output: ${clip(entry.expectedOutput)}`);
    out.push(`  Acceptance criteria (${entry.acceptanceCriteria.length}): ${entry.acceptanceCriteria.map(item => clip(item, 300)).join(' | ')}`);
    if (entry.context !== '')
        out.push(`  Context: ${clip(entry.context)}`);
    if (entry.constraints.length > 0)
        out.push(`  Constraints: ${entry.constraints.map(item => clip(item, 300)).join('; ')}`);
    if (entry.writesPaths === null)
        out.push('  Writes paths: unlisted (the plan did not say)');
    else if (entry.writesPaths.length === 0)
        out.push('  Writes paths: none declared');
    else
        out.push(`  Writes paths: ${entry.writesPaths.map(item => clip(item, 300)).join('; ')}`);
    if (entry.originGoalId !== undefined)
        out.push(`  Origin goal: ${clip(entry.originGoalId, 200)}`);
    if (entry.error !== undefined && entry.error !== '')
        out.push(`  Task error: ${clip(entry.error)}`);
    for (const row of entry.attempts)
        attempt(out, row);
}
/** Render one plan task: its declared shape and its schedule position. */
function planTask(out, entry) {
    out.push(`- plan task ${clip(entry.id, 64)} "${clip(entry.title, 200)}": objective=${clip(entry.objective)}; expected output=${clip(entry.expectedOutput)}`);
    const extras = [];
    if (entry.acceptanceCriteria.length > 0) {
        extras.push(`criteria: ${entry.acceptanceCriteria.map(criterion => clip(criterion, 300)).join(' | ')}`);
    }
    if (entry.context !== '')
        extras.push(`context=${clip(entry.context)}`);
    if (entry.constraints.length > 0)
        extras.push(`constraints=${entry.constraints.map(item => clip(item, 300)).join('; ')}`);
    if (entry.writesPaths === undefined || entry.writesPaths === null)
        extras.push('writes paths=unlisted (the plan did not say)');
    else if (entry.writesPaths.length === 0)
        extras.push('writes paths=none declared');
    else
        extras.push(`writes paths=${entry.writesPaths.map(item => clip(item, 300)).join('; ')}`);
    // The scheduler reads both of these; a record that drops them cannot explain
    // why a task ran where it ran. `assertWorkflowReport` does not echo them onto
    // the validated plan today, so they appear only when the record carries them.
    if (entry.wave !== undefined)
        extras.push(`wave=${entry.wave + 1}`);
    if (entry.dependsOn !== undefined && entry.dependsOn.length > 0) {
        extras.push(`depends on=${entry.dependsOn.map(item => clip(item, 200)).join(', ')}`);
    }
    if (entry.originGoalId !== undefined)
        extras.push(`origin goal=${clip(entry.originGoalId, 200)}`);
    if (extras.length > 0)
        out.push(`  ${extras.join('; ')}`);
}
/** Render one wave-boundary decision: what it saw, what it changed. */
function replan(entry) {
    return [
        `version ${entry.version} at wave ${entry.wave}`,
        entry.decision,
        clip(entry.reason || '(no reason recorded)'),
        `added: ${ids(entry.addedTaskIds)}`,
        `updated: ${ids(entry.updatedTaskIds)}`,
        `removed: ${ids(entry.removedTaskIds)}`,
        `reordered: ${entry.reordered ? 'yes' : 'no'}`,
    ].join(' — ');
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
    const plan = [`source=${report.plan.source}`, `tasks=${report.plan.tasks.length}`];
    if (report.plan.waves !== undefined)
        plan.push(`waves=${report.plan.waves.length}`);
    if (report.plan.version !== undefined)
        plan.push(`version=${report.plan.version}`);
    if (report.plan.error !== undefined && report.plan.error !== '') {
        plan.push(`planning error=${clip(report.plan.error)}`);
    }
    const out = [
        'Technical audit trail (complete machine record; display-only copy — hiding this section never deletes the validated report it renders):',
        `Status: ${report.status.toUpperCase()}`,
        `Objective (full): ${clip(report.objective)}`,
        `Schema: ${report.schemaVersion}`,
        `Plan: ${plan.join('; ')}`,
    ];
    if (report.plan.failure !== undefined && report.plan.failure !== null) {
        const category = report.plan.failure.category === undefined ? '' : ` (${report.plan.failure.category})`;
        out.push(`Plan failure: ${report.plan.failure.class}${category} — ${clip(report.plan.failure.reason || '(no reason recorded)')}`);
    }
    if (report.plan.tasks.length > 0) {
        out.push(`Plan splits (${report.plan.tasks.length}):`);
        for (const item of report.plan.tasks)
            planTask(out, item);
    }
    if (report.plan.waves !== undefined) {
        section(out, '', 'Plan waves', report.plan.waves.map((wave, index) => `wave ${index + 1}: ${wave.length === 0 ? '(empty)' : wave.map(id => clip(id, 64)).join(', ')}`));
    }
    if (report.plan.replans !== undefined) {
        section(out, '', 'Plan replans', report.plan.replans.map(row => replan(row)));
    }
    const limits = [
        `maxConcurrency=${report.limits.maxConcurrency}`,
        `maxRetries=${report.limits.maxRetries}`,
        `maxTasks=${report.limits.maxTasks}`,
        `maxTotalAgents=${report.limits.maxTotalAgents}`,
    ];
    if (report.limits.timeoutMs !== undefined)
        limits.push(`deadline=${report.limits.timeoutMs} ms`);
    if (report.limits.childTimeoutMs !== undefined)
        limits.push(`child budget=${report.limits.childTimeoutMs} ms`);
    out.push(`Limits: ${limits.join('; ')}`);
    out.push(`Chains: ${ROLES.map(role => `${role}=${report.routing[role].length === 0 ? 'inherit' : report.routing[role].join(' → ')}`).join('; ')}`);
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
    if (report.synthesis.review !== undefined)
        synthesis.push(`review=${clip(report.synthesis.review)}`);
    out.push(`Synthesis: ${synthesis.join('; ')}`);
    // The run-level settlement the answer states in prose, as data.
    if (report.stop !== undefined)
        out.push(`Stop cause: ${report.stop.cause}`);
    if (report.guard !== undefined) {
        out.push(`Guard settlement: ${report.guard.findings} finding(s), ${report.guard.terminated} subagent(s) terminated`);
    }
    if (report.tasks.length > 0) {
        out.push(`Tasks (${report.tasks.length}):`);
        for (const entry of report.tasks)
            task(out, entry);
    }
    if (report.deadRoutes !== undefined) {
        section(out, '', 'Dead routes', report.deadRoutes.map(entry => deadRoute(entry)));
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