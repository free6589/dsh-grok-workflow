/**
 * The technical audit trail — the complete machine record, on demand.
 *
 * Taken from `feat/audit-layer` @ `7626233` (`src/report-audit.ts` + this spec)
 * and adapted to 0.13.32. That branch flipped the *default* view to the human
 * answer and put the ledger behind `showDiagnostics`; this half keeps the
 * default view exactly as it is and attaches the trail through its own
 * `auditTrail` opt-in (D-131). Hence: the branch's three default-view examples
 * are not here (the default view is not changing in this half), and neither is
 * its diagnostics-ledger example (`test/report.spec.ts` already covers it).
 *
 * What is proven here:
 *  - the trail renders every field of a validated report the report itself drops
 *    or slices (plan splits, waves, replans, every attempt, every evidence row,
 *    dead routes, the child budget, all five chains),
 *  - it is reachable two ways: the `auditTrail` option on `renderReport` and the
 *    direct `renderAuditTrail` entry point,
 *  - rendering is a pure read (the record cannot be mutated by it),
 *  - the exact line shapes `src/carryover.ts` parses are never re-emitted,
 *  - a truncated trail says so instead of cutting silently,
 *  - the host tool entry (`src/index.ts`) attaches the trail only when the run
 *    did not complete, so a completed run's text is byte-for-byte today's.
 */
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { resolveConfig } from '../src/config.js'
import { parseReportRound } from '../src/carryover.js'
import { apply } from '../src/index.js'
import { assertWorkflowReport, failureReport, guardLine, renderReport } from '../src/report.js'
import { AUDIT_MAX_CHARS, renderAuditTrail } from '../src/report-audit.js'
import { maxTotalAgentsFor } from '../src/script.js'
import type { NormalizedTask, WorkflowReport } from '../src/types.js'

// `maxRetries` became a fixed limit (not a config key) after this spec's source
// branch was written: it is read off the resolved config instead of being set.
// `maxRetries` became a fixed limit (not a config key) after this spec's source
// branch was written: it is read off the resolved config instead of being set.
// An explicit deadline keeps the `deadline=` line meaningful: the default is 0
// (unlimited), which the report omits from the record entirely.
const config = resolveConfig({ maxConcurrency: 2, maxTasks: 6, timeoutMs: 900_000 })
const OBJECTIVE = 'Ship the verified result'
const CRITERIA = Array.from({ length: 14 }, (_, index) => `c${String(index + 1).padStart(2, '0')}`)

/**
 * A rich partial report: one verified task with a failed first attempt, one
 * failed task, a two-wave planner plan that was replanned once, a route trail
 * with a switch and a cross-run hint, a dead route, a model synthesis with both
 * a summary, an error and a review verdict, the child budget, and a 14-criterion
 * evidence set (two more than the report's 12-row slice, so the audit layer must
 * be the place where the whole set stays visible).
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
      // Two waves, replanned once: the plan surface the report itself never
      // prints beyond one `Wave reason:` sentence.
      waves: [['a'], ['b']],
      version: 2,
      replans: [{
        version: 2,
        wave: 1,
        decision: 'applied',
        reason: 'a new demand arrived',
        addedTaskIds: ['b'],
        updatedTaskIds: [],
        removedTaskIds: [],
        reordered: false,
      }],
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
    deadRoutes: [{ route: 'p1/w9', class: 'timeout', streak: 2 }],
    routing: { planner: ['p1/m1'], worker: ['p1/w1'], verifier: ['p1/v1'], synthesizer: [] },
    synthesis: {
      mode: 'model',
      summary: 'The retry loop drops 0.42% of requests.',
      error: 'synthesizer refused',
      review: 'check=pass verify=pass drafts=1',
    },
    limits: {
      maxConcurrency: 2,
      maxRetries: config.maxRetries,
      maxTasks: 6,
      maxTotalAgents: maxTotalAgentsFor(2, config.maxRetries),
      timeoutMs: config.timeoutMs,
      // Must agree with what the plugin enforces, or validation rejects it.
      childTimeoutMs: config.childTimeoutMs,
    },
  }
}

function validatedRich(): WorkflowReport {
  return assertWorkflowReport(richReport(), OBJECTIVE, config)
}

/** A validated completed report: one verified task, nothing open. */
function completedReport(): WorkflowReport {
  const task = {
    id: 'a',
    title: 'Task a',
    objective: 'Do a',
    expectedOutput: 'Output a',
    acceptanceCriteria: ['a works'],
    context: '',
    constraints: [],
    writesPaths: [],
    status: 'verified',
    attempts: [{
      attempt: 1,
      execution: {
        summary: 'done',
        status: 'completed',
        deliverables: [{ description: 'the artifact', locator: 'src/a.ts' }],
        evidence: [{ claim: 'implemented it', source: 'src/a.ts' }],
        testsRun: [],
        filesChanged: ['src/a.ts'],
        uncertainties: [],
      },
      verification: {
        verdict: 'pass',
        criteria: [{ criterion: 'a works', met: true, evidence: 'observed a' }],
        checkedEvidence: [{ kind: 'file', locator: 'src/a.ts', finding: 'observed' }],
        commandsRun: [],
        issues: [],
        confidence: 'high',
      },
      passed: true,
      error: '',
    }],
    error: '',
  }
  return assertWorkflowReport({
    schemaVersion: 'grok-workflow/v1',
    status: 'completed',
    objective: OBJECTIVE,
    plan: {
      source: 'caller',
      tasks: [{
        id: task.id,
        title: task.title,
        objective: task.objective,
        expectedOutput: task.expectedOutput,
        acceptanceCriteria: task.acceptanceCriteria,
        context: task.context,
        constraints: task.constraints,
        writesPaths: task.writesPaths,
      }],
      error: '',
    },
    tasks: [task],
    confirmed: [{ taskId: 'a', criterion: 'a works', evidence: 'observed a' }],
    incomplete: [],
    errors: [],
    uncertainties: [],
    routing: { planner: [], worker: [], verifier: [], synthesizer: [] },
    synthesis: { mode: 'deterministic', summary: 'The work is done.' },
    limits: { maxConcurrency: 2, maxRetries: config.maxRetries, maxTasks: 6, maxTotalAgents: maxTotalAgentsFor(1, config.maxRetries) },
  }, OBJECTIVE, config)
}

describe('audit trail: the complete record is retrievable on demand', () => {
  const audited = (): string => renderReport(validatedRich(), { auditTrail: true })

  it('renders the plan provenance and the splits', () => {
    const text = audited()
    expect(text).toContain('Status: PARTIAL')
    expect(text).toContain('Objective (full): Ship the verified result')
    expect(text).toContain('Plan: source=planner; tasks=2; waves=2; version=2; planning error=planner refused the objective')
    expect(text).toContain('Plan failure: format-error (quality) — planner payload was not valid JSON')
    expect(text).toContain('Plan splits (2):')
    expect(text).toContain('plan task a "Task a": objective=Do a; expected output=Output a')
    expect(text).toContain('criteria: c01 | c02')
    expect(text).toContain('context=shared fixture context; constraints=no network; writes paths=src/retry.ts; origin goal=goal-1')
    expect(text).toContain('writes paths=none declared')
    // The wave partition and the boundary ledger are record fields the report
    // itself only ever summarises in one sentence.
    expect(text).toContain('Plan waves (2):')
    expect(text).toContain('- wave 1: a')
    expect(text).toContain('- wave 2: b')
    expect(text).toContain('Plan replans (1):')
    expect(text).toContain('- version 2 at wave 1 — applied — a new demand arrived — added: b — updated: none — removed: none — reordered: no')
    // The schedule inputs a plan declares, when the record carries them. The
    // validator does not echo `dependsOn`/`wave` onto the validated plan today,
    // so this is proven on the display path itself instead of through a fixture
    // the validator would strip.
    const carried = validatedRich()
    const second = carried.plan.tasks[1] as NormalizedTask
    second.dependsOn = ['a']
    second.wave = 1
    const trail = renderAuditTrail(carried)
    expect(trail).toContain('writes paths=none declared; wave=2; depends on=a')
  })

  it('renders limits, chains and the full call trail including successful calls', () => {
    const text = audited()
    expect(text).toContain(`Limits: maxConcurrency=2; maxRetries=${config.maxRetries}; maxTasks=6; maxTotalAgents=`)
    expect(text).toContain(`deadline=${config.timeoutMs} ms`)
    // t47 put the child stall budget on the record; the trail names it too.
    expect(text).toContain(`child budget=${config.childTimeoutMs} ms`)
    // All five roles: `supervisor` is a real chain and cannot vanish from a
    // "complete" record just because it inherits.
    expect(text).toContain('Chains: planner=p1/m1; worker=p1/w1; verifier=p1/v1; supervisor=inherit; synthesizer=inherit')
    expect(text).toContain('Calls (3 recorded child calls, in order):')
    expect(text).toContain('- worker chain 0 attempt 1 via p1/w1 — failed rate-limit — 429 Too Many Requests — queued 120 ms — skipped busy: p1/w2 (cross-run hint)')
    expect(text).toContain('- worker chain 0 attempt 2 via p1/w1 — ok')
    expect(text).toContain('- verifier chain 0 attempt 1 via p1/v1 — ok')
    expect(text).toContain('Synthesis: mode=model; summary=The retry loop drops 0.42% of requests.; error=synthesizer refused; review=check=pass verify=pass drafts=1')
    expect(text).toContain('Dead routes (1):')
    expect(text).toContain('- p1/w9: timeout (2 in a row)')
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
    // The record half carries all 14 rows; the answer above it keeps its 12.
    const auditPart = text.slice(text.indexOf('Technical audit trail'))
    expect((auditPart.match(/^- a: c/gm) ?? []).length).toBe(14)
    expect(auditPart.match(/^- a: c/gm)).toHaveLength(14)
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
    // Same bytes as the appended section: one renderer, two entries.
    const appended = renderReport(validatedRich(), { auditTrail: true })
    expect(appended.slice(appended.indexOf('Technical audit trail'))).toBe(trail)
  })
})

describe('audit trail: hiding is display-only, never deletion', () => {
  it('cannot mutate the record it renders', () => {
    const record = validatedRich()
    const before = JSON.stringify(record)
    renderReport(record)
    renderReport(record, { auditTrail: true })
    renderAuditTrail(record)
    expect(JSON.stringify(record)).toBe(before)
  })

  it('keeps the carry-over contract intact in both views', () => {
    const rounds = [renderReport(validatedRich()), renderReport(validatedRich(), { auditTrail: true })].map(text => {
      const round = parseReportRound(text)
      expect(round).not.toBeNull()
      return round!
    })
    for (const round of rounds) {
      expect(round.status).toBe('partial')
      expect(round.objective).toBe('Ship the verified result')
      expect(round.confirmed.join(' ')).toContain('verified c01')
      expect(round.incomplete.join(' ')).toContain('verification failed for b')
      expect(round.uncertainties.join(' ')).toContain('measured on one host only')
      expect(round.summary).toBe('The retry loop drops 0.42% of requests.')
    }
    // The trail may not change the parsed scalars or the task rows at all.
    const [plain, audited] = rounds as [typeof rounds[0], typeof rounds[0]]
    expect(audited.status).toBe(plain.status)
    expect(audited.objective).toBe(plain.objective)
    expect(audited.summary).toBe(plain.summary)
    expect(audited.tasks).toEqual(plain.tasks)
  })

  it('never lets the audit trail re-trigger a carry-over section or the answer line', () => {
    const text = renderReport(validatedRich(), { auditTrail: true })
    // Exactly one signature line and exactly one answer header per rendered report.
    expect((text.match(/^Grok workflow: PARTIAL$/gm) ?? []).length).toBe(1)
    expect((text.match(/^Final answer:$/gm) ?? []).length).toBe(1)
    // The trail's sections differ from the parsed headers by their count suffix.
    expect(text).toContain('Confirmed evidence (14):')
    expect((text.match(/^Confirmed evidence:$/gm) ?? []).length).toBe(1)
    expect((text.match(/^Incomplete:$/gm) ?? []).length).toBe(1)
    expect((text.match(/^Uncertainties:$/gm) ?? []).length).toBe(1)
    // Nor a second `Objective:` line, nor an `- id: status (N attempts)` row.
    expect((text.match(/^Objective:/gm) ?? []).length).toBe(1)
    expect(text).toContain('Objective (full): Ship the verified result')
    expect(text).toContain('Task objective: Do a')
    expect((text.match(/^- \S+: (?:verified|failed|blocked) \(\d+ attempts?\) — /gm) ?? []).length).toBe(2)
    const trail = text.slice(text.indexOf('Technical audit trail'))
    expect((trail.match(/^- \S+: (?:verified|failed|blocked) \(\d+ attempts?\) — /gm) ?? []).length).toBe(0)
  })
})

describe('audit trail: failure reports are auditable too', () => {
  it('renders the complete failure record on demand', () => {
    const configured = resolveConfig({
      roles: { worker: [{ provider: 'bifrost-completions', model: 'wb/cn:deepseek-v4.1-flash' }] },
      timeoutMs: 1_200_000,
    })
    const failed = failureReport(OBJECTIVE, configured, 'Timeout', 'the deadline fired', 'infrastructure')
    const text = renderReport(failed, { auditTrail: true })
    expect(text).toContain('Status: FAILED')
    expect(text).toContain('Plan: source=unavailable; tasks=0; planning error=the deadline fired')
    expect(text).toContain('Chains: planner=inherit; worker=bifrost-completions/wb/cn:deepseek-v4.1-flash; verifier=inherit; supervisor=inherit; synthesizer=inherit')
    expect(text).toContain(`deadline=${configured.timeoutMs} ms`)
    expect(text).toContain(`child budget=${configured.childTimeoutMs} ms`)
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

describe('audit trail: a truncated trail says so instead of cutting silently', () => {
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
      limits: { maxConcurrency: 2, maxRetries: config.maxRetries, maxTasks: 6, maxTotalAgents: maxTotalAgentsFor(1, config.maxRetries) },
    }, OBJECTIVE, config)
    const trail = renderAuditTrail(big)
    expect(trail.length).toBeGreaterThan(AUDIT_MAX_CHARS)
    expect(trail).toContain(`[audit trail truncated at ${AUDIT_MAX_CHARS} characters; the validated report object remains the complete record]`)
    expect(trail).not.toContain('Audit trail complete.')
    // The record itself is untouched by the display bound.
    expect(big.confirmed.length).toBe(120)
    // Two independent bounds: the answer keeps MAX_RENDER_CHARS, the trail keeps
    // its own, and the answer half is unchanged by attaching the trail.
    const plain = renderReport(big)
    const attached = renderReport(big, { auditTrail: true })
    expect(attached.startsWith(plain)).toBe(true)
    expect(plain.length).toBeLessThanOrEqual(AUDIT_MAX_CHARS)
    expect(plain).not.toContain('Technical audit trail')
    // The section is still whole on its own: the base answer is not what got cut
    // out of it, the trail is.
    expect(attached.slice(plain.length)).toContain('audit trail truncated at')
  })
})

describe('audit trail: the entry — off by default, attached at the tail on demand', () => {
  it('adds nothing at all unless the caller asks for it', () => {
    const record = validatedRich()
    const plain = renderReport(record)
    expect(plain).not.toContain('Technical audit trail')
    expect(plain).not.toContain('Audit trail complete.')
    // Explicit `false` is the same bytes as the absent option: the default view
    // is what every existing caller and suite already sees.
    expect(renderReport(record, { auditTrail: false })).toBe(plain)
    expect(renderReport(record, {})).toBe(plain)
  })

  it('appends the section after the guard line, as the report tail', () => {
    const record = validatedRich()
    const guard = { findings: 2, terminated: 1, by: 'none' as const }
    const plain = renderReport(record, { guard })
    const text = renderReport(record, { guard, auditTrail: true })
    const guardText = guardLine(guard, 'en')
    // Last line of the answer, first line of the trail: exactly one separator.
    expect(plain.endsWith(guardText)).toBe(true)
    expect(text.startsWith(plain)).toBe(true)
    expect(text.slice(plain.length)).toBe(`\n\n${renderAuditTrail(record)}`)
    expect(text.endsWith('Audit trail complete.')).toBe(true)
    expect(text.indexOf('Technical audit trail')).toBeGreaterThan(text.indexOf(guardText))
  })

  it('the host tool attaches the trail for a non-completed run and not for a completed one', () => {
    // The real entry `apply()` on a real cordis context, with the same shim shape
    // `test/command.spec.ts` uses: the registered tool object is the real one.
    const ctx = new Context()
    const tools: { output: { render(args: unknown, value: unknown): { type: string; text: string }[] } }[] = []
    const shim = {
      on: (event: string, handler: unknown) => ctx.on(event as never, handler as never),
      effect: (installer: () => () => void) => installer(),
      logger: () => ({ warn: () => {}, info: () => {}, debug: () => {} }),
      tools: { register: (tool: unknown) => { tools.push(tool as never); return () => {} } },
      systemPrompt: { section: () => () => {}, getSectionOrder: () => 2600 },
      workflowEngine: { start: async () => { throw new Error('not used') } },
      inject: (deps: string[], callback: (injected: unknown) => void) =>
        ctx.inject(deps as never, callback as never),
    }
    apply(shim as never, {})
    const render = (report: WorkflowReport): string => {
      const tool = tools[0]
      expect(tool, 'the plugin must register its tool on the real registry').toBeDefined()
      return tool!.output.render({}, report).map(block => block.text).join('\n')
    }
    // A run that did not complete comes back with the complete record attached.
    expect(render(validatedRich())).toContain('Technical audit trail')
    expect(render(validatedRich())).toContain('Audit trail complete.')
    // A completed run's text is exactly what it is today.
    const done = completedReport()
    expect(render(done)).toBe(renderReport(done))
    expect(render(done)).not.toContain('Technical audit trail')
  })
})
