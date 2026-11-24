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
import type { WorkflowReport } from './types.js';
/**
 * Upper bound on one audit trail. Generous by design — the point of the audit
 * layer is zero record loss — but not unbounded: a hostile or pathological
 * record cannot balloon the rendered message. When the bound fires, the trail
 * says so explicitly instead of ending silently.
 */
export declare const AUDIT_MAX_CHARS = 96000;
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
export declare function renderAuditTrail(report: WorkflowReport): string;
//# sourceMappingURL=report-audit.d.ts.map