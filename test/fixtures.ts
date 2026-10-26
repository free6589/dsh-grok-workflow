import type { ExecutionResult, NormalizedTask, VerificationResult } from '../src/types.js'

export function task(
  id: string,
  criteria?: string[],
  writesPaths: string[] | null = null,
): NormalizedTask {
  return {
    id,
    title: `Task ${id}`,
    objective: `Do ${id}`,
    expectedOutput: `Output ${id}`,
    acceptanceCriteria: criteria ?? [`${id} works`],
    context: '',
    constraints: [],
    writesPaths,
  }
}

/**
 * Task shaped as a tool caller passes it (TaskInput).
 *
 * The normalized fixture carries `writesPaths: null` ("the plan did not say"),
 * which is a report-side value; a caller either omits the field or names paths.
 */
export function callerTask(id: string, criteria?: string[], writesPaths?: string[]): Record<string, unknown> {
  const base = task(id, criteria)
  return {
    id: base.id,
    title: base.title,
    objective: base.objective,
    expectedOutput: base.expectedOutput,
    acceptanceCriteria: base.acceptanceCriteria,
    context: base.context,
    constraints: base.constraints,
    ...writesPaths === undefined ? {} : { writesPaths },
  }
}

export function execution(summary = 'done', overrides: Partial<ExecutionResult> = {}): ExecutionResult {
  return {
    summary,
    status: 'completed',
    deliverables: [{ description: 'deliverable', locator: 'file:///tmp/deliverable' }],
    evidence: [{ claim: 'implemented', source: 'src/index.ts' }],
    testsRun: [{ command: 'npm test', status: 'passed', detail: 'ok' }],
    filesChanged: ['src/index.ts'],
    uncertainties: [],
    ...overrides,
  }
}

export function verification(taskValue: NormalizedTask, overrides: Partial<VerificationResult> = {}): VerificationResult {
  return {
    verdict: 'pass',
    criteria: taskValue.acceptanceCriteria.map(criterion => ({
      criterion,
      met: true,
      evidence: `verified ${criterion} in file:///tmp/report`,
    })),
    checkedEvidence: [{ kind: 'file', locator: 'file:///tmp/report', finding: 'observed expected output' }],
    commandsRun: [{ command: 'npm test', status: 'passed', detail: 'ok' }],
    issues: [],
    confidence: 'high',
    ...overrides,
  }
}

export function failingVerification(taskValue: NormalizedTask, reason = 'missing evidence'): VerificationResult {
  return verification(taskValue, {
    verdict: 'fail',
    criteria: taskValue.acceptanceCriteria.map(criterion => ({ criterion, met: false, evidence: reason })),
    issues: [reason],
  })
}
