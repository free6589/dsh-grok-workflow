import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { parseReportRound } from '../src/carryover.js'
import { assertWorkflowReport, failureReport, renderReport } from '../src/report.js'
import { AUDIT_MAX_CHARS, renderAuditTrail } from '../src/report-audit.js'
import { maxTotalAgentsFor } from '../src/script.js'
import type { WorkflowReport } from '../src/types.js'

const config = resolveConfig({ maxConcurrency: 2, maxRetries: 1, maxTasks: 6 })
const OBJECTIVE = 'Ship the verified result'
const CRITERIA = Array.from({ length: 14 }, (_, index) => `c${String(index + 1).padStart(2, '0')}`)

/**
 * A rich partial report: one verified task with a failed first attempt, one
 * failed task, a planner fallback provenance, a route trail with a switch and
 * a cross-run hint, a model synthesis with both a summary and an error, and a
 * 14-criterion evidence set (two more than the default view's 12-row slice, so
 * the audit layer must be the place where the whole set stays visible).
 */
function richReport(): Record<string, unknown> {
  const attempts = [
    {
      attempt: 1,
      execution: { summary: 'first cut', status: 'partial', deliverables: [], evidence: [], testsRun: [], filesChanged: [], uncertainties: [] },
      verification: null,
      passed: false,
      route: 'p1/w1',
      failure: { class: 'rate-limit', category: 'infrastructure', reason: '429 Too Many Requests' },
      error: '429 Too Many Requests',
    },
    {
      attempt: 2,
      execution: {
        summary: 'rewrote the retry loop',
        status: 'completed',
        deliverables: [{ description: 'the retry loop', locator: 'src/retry.ts' }],
        evidence: [{ claim: 'implemented the loop', source: 'src/retry.ts' }],
        testsRun: [{ command: 'npm test', status: 'passed', detail: 'ok' }],
        filesChanged: ['src/retry.ts'],
        uncertainties: ['loop timing varies by host'],
      },
      verification: {
        verdict: 'pass',
        criteria: CRITERIA.map(criterion => ({ criterion, met: true, evidence: `verified ${criterion}` })),
        checkedEvidence: [{ kind: 'file', locator: 'src/retry.ts', finding: 'observed the loop' }],
        commandsRun: [{ command: 'npm test', status: 'passed', detail: 'ok' }],
        issues: ['route 1 rate-limited once'],
        confidence: 'high',
      },
      passed: true,
      route: 'p1/w1',
      error: '',
    },
  ]
  const tasks = [
    {
      id: 'a',
      title: 'Task a',
      objective: 'Do a',
      expectedOutput: 'Output a',
      acceptanceCriteria: CRITERIA,
      context: 'shared fixture context',
      constraints: ['no network'],
      writesPaths: ['src/retry.ts'],
      originGoalId: 'goal-1',
      status: 'verified',
      attempts,
      error: '',
    },
    {
      id: 'b',
      title: 'Task b',
      objective: 'Do b',
      expectedOutput: 'Output b',
      acceptanceCriteria: ['b works'],
      context: '',
      constraints: [],
      writesPaths: [],
      status: 'failed',
      attempts: [{
        attempt: 1,
        execution: null,
        verification: {
          verdict: 'fail',
          criteria: [{ criterion: 'b works', met: false, evidence: 'no evidence for b works' }],
          checkedEvidence: [{ kind: 'test', locator: 'npm test', finding: 'no assertion for b works' }],
          commandsRun: [{ command: 'npm test', status: 'not_run', detail: '' }],
          issues: ['no evidence for b works'],
          confidence: 'low',
        },
        passed: false,
        failure: { class: 'verification-failed', category: 'quality', reason: 'verifier rejected the attempt' },
        error: 'verification failed',
      }],
      error: 'verification failed',
    },
  ]
  return {
    schemaVersion: 'grok-workflow/v1',
    status: 'partial',
    objective: OBJECTIVE,
    plan: {
      source: 'planner',
      tasks: tasks.map(task => ({
        id: task.id,
        title: task.title,
        objective: task.objective,
        expectedOutput: task.expectedOutput,
        acceptanceCriteria: task.acceptanceCriteria,
        context: task.context,
        constraints: task.constraints,
        writesPaths: task.writesPaths,
        originGoalId: task.originGoalId,
      })),
      error: 'planner refused the objective',
      failure: { class: 'format-error', category: 'quality', reason: 'planner payload was not valid JSON' },
    },
    tasks,
    confirmed: CRITERIA.map(criterion => ({ taskId: 'a', criterion, evidence: `verified ${criterion}` })),
    incomplete: [{ taskId: 'b', reason: 'verification failed for b', category: 'quality' }],
    errors: [{ phase: 'worker', message: 'route 1 exhausted', category: 'infrastructure' }],
    uncertainties: [
      { taskId: 'a', text: 'measured on one host only' },
      { taskId: 'b', text: 'benchmark data unverified' },
    ],
    routes: [
      {
        role: 'worker',
        chainIndex: 0,
        route: 'p1/w1',
        attempt: 1,
        outcome: 'failed',
        failureClass: 'rate-limit',
        reason: '429 Too Many Requests',
        queuedMs: 120,
        skippedBusy: ['p1/w2 (cross-run hint)'],
      },
      { role: 'worker', chainIndex: 0, route: 'p1/w1', attempt: 2, outcome: 'ok' },
      { role: 'verifier', chainIndex: 0, route: 'p1/v1', attempt: 1, outcome: 'ok' },
    ],
    routing: { planner: ['p1/m1'], worker: ['p1/w1'], verifier: ['p1/v1'], synthesizer: [] },
    synthesis: { mode: 'model', summary: 'The retry loop drops 0.42% of requests.', error: 'synthesizer refused' },
    limits: {
      maxConcurrency: 2,
      maxRetries: 1,
      maxTasks: 6,
      maxTotalAgents: maxTotalAgentsFor(2, 1),
      timeoutMs: config.timeoutMs,
    },
  }
}

function validatedRich(): WorkflowReport {
  return assertWorkflowReport(richReport(), OBJECTIVE, config)
}

describe('audit layer: the default view stays human (Section II-B)', () => {
  it('keeps the machine ledger out of the default answer', () => {
    const text = renderReport(validatedRich())
    // No ledger, no per-task rows, no audit trail in the default view.
    expect(text).not.toContain('Technical audit trail')
    expect(text).not.toContain('Audit trail complete.')
    expect(text).not.toContain('Model routes:')
    expect(text).not.toContain('Deadline:')
    expect(text).not.toContain('Route switches:')
    expect(text).not.toContain('Route overflows')
    expect(text).not.toContain('Deliverables')
    expect(text).not.toContain('Verification:')
    expect(text).not.toContain('- a: verified')
    expect(text).not.toContain('Plan failure:')
    expect(text).not.toContain('Synthesis: model narrative unavailable')
    // The human answer and the carry-over-parsed skeleton stay.
    expect(text).toContain('Grok workflow: PARTIAL')
    expect(text).toContain('Objective: Ship the verified result')
    expect(text).toContain('Failures: 1 infrastructure, 1 quality')
    expect(text).toContain('Confirmed evidence:')
    expect(text).toContain('Incomplete:')
    expect(text).toContain('- b (quality): verification failed for b')
    expect(text).toContain('Uncertainties:')
    expect(text).toContain('Final answer:')
    expect(text).toContain('The retry loop drops 0.42% of requests.')
  })

  it('slices the confirmed evidence to the readable twelve in the default view', () => {
    const text = renderReport(validatedRich())
    expect((text.match(/^- a: c/gm) ?? []).length).toBe(12)
  })
})

describe('audit layer: the complete record is retrievable on demand', () => {
  const audited = (): string => renderReport(validatedRich(), { showDiagnostics: true })

  it('keeps the diagnostics ledger on the opt-in switch', () => {
    const text = audited()
    expect(text).toContain('Model routes: planner=p1/m1; worker=p1/w1; verifier=p1/v1; synthesizer=inherit')
    expect(text).toContain(`Deadline: ${config.timeoutMs} ms per run (enforced by the plugin)`)
    expect(text).toContain('Route switches:')
    expect(text).toContain('- worker attempt 1 via p1/w1: rate-limit — 429 Too Many Requests')
    expect(text).toContain('Route overflows (cross-run hint):')
    expect(text).toContain('Synthesis: model narrative unavailable (synthesizer refused)')
  })

  it('renders the plan provenance and the splits', () => {
    const text = audited()
    expect(text).toContain('Status: PARTIAL')
    expect(text).toContain('Objective (full): Ship the verified result')
    expect(text).toContain('Plan: source=planner; tasks=2; planning error=planner refused the objective')
    expect(text).toContain('Plan failure: format-error (quality) — planner payload was not valid JSON')
    expect(text).toContain('Plan splits (2):')
    expect(text).toContain('plan task a "Task a": objective=Do a; expected output=Output a')
    expect(text).toContain('criteria: c01 | c02')
    expect(text).toContain('context=shared fixture context; constraints=no network; writes paths=src/retry.ts; origin goal=goal-1')
    expect(text).toContain('writes paths=none declared')
  })

  it('renders limits, chains and the full call trail including successful calls', () => {
    const text = audited()
    expect(text).toContain('Limits: maxConcurrency=2; maxRetries=1; maxTasks=6; maxTotalAgents=')
    expect(text).toContain(`deadline=${config.timeoutMs} ms`)
    expect(text).toContain('Chains: planner=p1/m1; worker=p1/w1; verifier=p1/v1; synthesizer=inherit')
    expect(text).toContain('Calls (3 recorded child calls, in order):')
    expect(text).toContain('- worker chain 0 attempt 1 via p1/w1 — failed rate-limit — 429 Too Many Requests — queued 120 ms — skipped busy: p1/w2 (cross-run hint)')
    expect(text).toContain('- worker chain 0 attempt 2 via p1/w1 — ok')
    expect(text).toContain('- verifier chain 0 attempt 1 via p1/v1 — ok')
    expect(text).toContain('Synthesis: mode=model; summary=The retry loop drops 0.42% of requests.; error=synthesizer refused')
  })

  it('renders every attempt with outcomes, judgments, evidence and tests', () => {
    const text = audited()
    expect(text).toContain('Tasks (2):')
    expect(text).toContain('Task a — Task a — VERIFIED')
    expect(text).toContain('  Task objective: Do a')
    expect(text).toContain('  Acceptance criteria (14): c01')
    expect(text).toContain('  Origin goal: goal-1')
    expect(text).toContain('  Attempt 1 — route p1/w1 — not passed')
    expect(text).toContain('    Execution: partial — first cut')
    expect(text).toContain('  Failure: rate-limit (infrastructure) — 429 Too Many Requests')
    expect(text).toContain('  Attempt error: 429 Too Many Requests')
    expect(text).toContain('  Attempt 2 — route p1/w1 — passed')
    expect(text).toContain('    Execution: completed — rewrote the retry loop')
    expect(text).toContain('    Deliverables (1):')
    expect(text).toContain('- the retry loop → src/retry.ts')
    expect(text).toContain('    Evidence (1):')
    expect(text).toContain('- implemented the loop ← src/retry.ts')
    expect(text).toContain('    Tests (1):')
    expect(text).toContain('- [passed] npm test — ok')
    expect(text).toContain('    Files changed (1):')
    expect(text).toContain('- src/retry.ts')
    expect(text).toContain('    Execution uncertainties (1):')
    expect(text).toContain('- loop timing varies by host')
    expect(text).toContain('    Verification: pass — confidence high')
    expect(text).toContain('    Criteria (14):')
    expect(text).toContain('- [met] c01 → verified c01')
    expect(text).toContain('    Checked evidence (1):')
    expect(text).toContain('- file src/retry.ts — observed the loop')
    expect(text).toContain('    Commands (1):')
    expect(text).toContain('    Issues (1):')
    expect(text).toContain('- route 1 rate-limited once')
    expect(text).toContain('Task b — Task b — FAILED')
    expect(text).toContain('  Writes paths: none declared')
    expect(text).toContain('    Verification: fail — confidence low')
    expect(text).toContain('- [not met] b works → no evidence for b works')
    expect(text).toContain('- [not_run] npm test')
    expect(text).toContain('  Failure: verification-failed (quality) — verifier rejected the attempt')
    expect(text).toContain('  Task error: verification failed')
  })

  it('renders the whole evidence set without the twelve-row slice', () => {
    const text = audited()
    expect(text).toContain('Confirmed evidence (14):')
    // The audit half carries all 14 rows; the default view above it keeps its 12.
    const auditPart = text.slice(text.indexOf('Technical audit trail'))
    expect((auditPart.match(/^- a: c/gm) ?? []).length).toBe(14)
    expect(text).toContain('- a: c14 → verified c14')
    expect(text).toContain('Incomplete (1):')
    expect(text).toContain('Errors (1):')
    expect(text).toContain('- worker: route 1 exhausted (infrastructure)')
    expect(text).toContain('Uncertainties (2):')
    expect(text).toContain('Audit trail complete.')
  })

  it('renderAuditTrail is available as the direct on-demand entry point', () => {
    const trail = renderAuditTrail(validatedRich())
    expect(trail).toContain('Technical audit trail')
    expect(trail).toContain('Confirmed evidence (14):')
    expect(trail).toContain('Audit trail complete.')
  })
})

describe('audit layer: hiding is display-only, never deletion', () => {
  it('cannot mutate the record it renders', () => {
    const record = validatedRich()
    const before = JSON.stringify(record)
    renderReport(record)
    renderReport(record, { showDiagnostics: true })
    renderAuditTrail(record)
    expect(JSON.stringify(record)).toBe(before)
  })

  it('keeps the carry-over contract intact in both views', () => {
    for (const text of [renderReport(validatedRich()), renderReport(validatedRich(), { showDiagnostics: true })]) {
      const round = parseReportRound(text)
      expect(round).not.toBeNull()
      expect(round!.status).toBe('partial')
      expect(round!.objective).toBe('Ship the verified result')
      expect(round!.confirmed.join(' ')).toContain('verified c01')
      expect(round!.incomplete.join(' ')).toContain('verification failed for b')
      expect(round!.uncertainties.join(' ')).toContain('measured on one host only')
      expect(round!.summary).toBe('The retry loop drops 0.42% of requests.')
    }
  })

  it('never lets the audit trail re-trigger a carry-over section or the answer line', () => {
    const text = renderReport(validatedRich(), { showDiagnostics: true })
    // Exactly one signature line and exactly one answer header per relayed report.
    expect((text.match(/^Grok workflow: PARTIAL$/gm) ?? []).length).toBe(1)
    expect((text.match(/^Final answer:$/gm) ?? []).length).toBe(1)
    // The audit sections differ from the parsed headers by their count suffix.
    expect(text).toContain('Confirmed evidence (14):')
    expect((text.match(/^Confirmed evidence:$/gm) ?? []).length).toBe(1)
    expect((text.match(/^Incomplete:$/gm) ?? []).length).toBe(1)
    expect((text.match(/^Uncertainties:$/gm) ?? []).length).toBe(1)
  })
})

describe('audit layer: failure reports are auditable too', () => {
  it('renders the complete failure record on demand', () => {
    const configured = resolveConfig({
      roles: { worker: [{ provider: 'bifrost-completions', model: 'wb/cn:deepseek-v4.1-flash' }] },
    })
    const failed = failureReport(OBJECTIVE, configured, 'Timeout', 'the deadline fired', 'infrastructure')
    const text = renderReport(failed, { showDiagnostics: true })
    expect(text).toContain('Status: FAILED')
    expect(text).toContain('Plan: source=unavailable; tasks=0; planning error=the deadline fired')
    expect(text).toContain('Chains: planner=inherit; worker=bifrost-completions/wb/cn:deepseek-v4.1-flash; verifier=inherit; synthesizer=inherit')
    expect(text).toContain(`deadline=${configured.timeoutMs} ms`)
    expect(text).toContain('Incomplete (1):')
    expect(text).toContain('- workflow (infrastructure): the deadline fired')
    expect(text).toContain('Errors (1):')
    expect(text).toContain('- Timeout: the deadline fired (infrastructure)')
    expect(text).toContain('Audit trail complete.')
    const plain = renderReport(failed)
    expect(plain).not.toContain('Technical audit trail')
    expect(plain).toContain('Grok workflow: FAILED')
    expect(plain).toContain('Incomplete:')
  })
})

describe('audit layer: a truncated trail says so instead of cutting silently', () => {
  it('marks the bound and points at the record when the trail exceeds its cap', () => {
    const longEvidence = 'x'.repeat(900)
    const criteria = Array.from({ length: 120 }, (_, index) => `c${String(index + 1).padStart(3, '0')}`)
    const tasks = [{
      id: 'a',
      title: 'Task a',
      objective: 'Do a',
      expectedOutput: 'Output a',
      acceptanceCriteria: criteria,
      context: '',
      constraints: [],
      writesPaths: [],
      status: 'verified',
      attempts: [{
        attempt: 1,
        execution: { summary: 'done', status: 'completed', deliverables: [], evidence: [], testsRun: [], filesChanged: ['src/a.ts'], uncertainties: [] },
        verification: {
          verdict: 'pass',
          criteria: criteria.map(criterion => ({ criterion, met: true, evidence: `verified ${criterion} ${longEvidence}` })),
          checkedEvidence: [{ kind: 'file', locator: 'src/a.ts', finding: 'observed' }],
          commandsRun: [],
          issues: [],
          confidence: 'high',
        },
        passed: true,
        error: '',
      }],
      error: '',
    }]
    const big = assertWorkflowReport({
      schemaVersion: 'grok-workflow/v1',
      status: 'completed',
      objective: OBJECTIVE,
      plan: {
        source: 'caller',
        tasks: tasks.map(task => ({
          id: task.id,
          title: task.title,
          objective: task.objective,
          expectedOutput: task.expectedOutput,
          acceptanceCriteria: task.acceptanceCriteria,
          context: task.context,
          constraints: task.constraints,
          writesPaths: task.writesPaths,
        })),
        error: '',
      },
      tasks,
      confirmed: criteria.map(criterion => ({ taskId: 'a', criterion, evidence: `verified ${criterion} ${longEvidence}` })),
      incomplete: [],
      errors: [],
      uncertainties: [],
      routing: { planner: [], worker: [], verifier: [], synthesizer: [] },
      synthesis: { mode: 'deterministic' },
      limits: { maxConcurrency: 2, maxRetries: 1, maxTasks: 6, maxTotalAgents: maxTotalAgentsFor(1, 1) },
    }, OBJECTIVE, config)
    const trail = renderAuditTrail(big)
    expect(trail.length).toBeGreaterThan(AUDIT_MAX_CHARS)
    expect(trail).toContain(`[audit trail truncated at ${AUDIT_MAX_CHARS} characters; the validated report object remains the complete record]`)
    expect(trail).not.toContain('Audit trail complete.')
    // The record itself is untouched by the display bound.
    expect(big.confirmed.length).toBe(120)
    // And the default view never grows to record size: it keeps its own cap.
    const plain = renderReport(big)
    expect(plain.length).toBeLessThanOrEqual(AUDIT_MAX_CHARS)
    expect(plain).not.toContain('Technical audit trail')
  })
})
