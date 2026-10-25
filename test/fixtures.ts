import type { ExecutionResult, NormalizedTask, VerificationResult } from '../src/types.js'

export function task(id: string, criteria?: string[]): NormalizedTask {
  return {
    id,
    title: `Task ${id}`,
    objective: `Do ${id}`,
    expectedOutput: `Output ${id}`,
    acceptanceCriteria: criteria ?? [`${id} works`],
    context: '',
    constraints: [],
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
