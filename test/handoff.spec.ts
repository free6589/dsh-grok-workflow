import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'
import {
  HANDOFF_ERRORS,
  HandoffContractError,
  assertHandoffContract,
  isHandoffContract,
  renderHandoff,
  renderHandoffSection,
} from '../src/handoff/index.js'
import type { HandoffContract } from '../src/handoff/index.js'
import { assertWorkflowReport, renderReport } from '../src/report.js'
import { maxTotalAgentsFor } from '../src/script.js'

const config = resolveConfig({ maxConcurrency: 2, maxTasks: 6 })
const OBJECTIVE = 'Ship the verified result'

function validContract(): HandoffContract {
  return {
    conclusion: 'The handoff contract renders and validates.',
    evidence: [{ path: 'checkpoints/run-1.json', checksum: 'abcdef1234567890' }],
    openQuestions: ['Does the next runner need the old checkpoint layout?'],
    nextSteps: ['Read the contract, then continue the task.'],
  }
}

function validReport(): Record<string, unknown> {
  return {
    schemaVersion: 'grok-workflow/v1',
    status: 'completed',
    objective: OBJECTIVE,
    plan: {
      source: 'caller',
      tasks: [{
        id: 'a',
        title: 'Task a',
        objective: 'Do a',
        expectedOutput: 'Output a',
        acceptanceCriteria: ['a works'],
        context: '',
        constraints: [],
      }],
      error: '',
    },
    tasks: [{
      id: 'a',
      title: 'Task a',
      objective: 'Do a',
      expectedOutput: 'Output a',
      acceptanceCriteria: ['a works'],
      context: '',
      constraints: [],
      status: 'verified',
      attempts: [{
        attempt: 1,
        execution: {
          summary: 'done',
          status: 'completed',
          deliverables: [{ description: 'file', locator: 'file:///tmp/out' }],
          evidence: [{ claim: 'implemented', source: 'src/index.ts' }],
          testsRun: [{ command: 'npm test', status: 'passed', detail: 'ok' }],
          filesChanged: ['src/index.ts'],
          uncertainties: [],
        },
        verification: {
          verdict: 'pass',
          criteria: [{ criterion: 'a works', met: true, evidence: 'verified a works' }],
          checkedEvidence: [{ kind: 'file', locator: 'file:///tmp/out', finding: 'observed' }],
          commandsRun: [{ command: 'npm test', status: 'passed', detail: 'ok' }],
          issues: [],
          confidence: 'high',
        },
        passed: true,
        error: '',
      }],
      error: '',
    }],
    confirmed: [{ taskId: 'a', criterion: 'a works', evidence: 'verified a works' }],
    incomplete: [],
    errors: [],
    uncertainties: [],
    limits: {
      maxConcurrency: 2,
      maxRetries: 1,
      maxTasks: 6,
      maxTotalAgents: maxTotalAgentsFor(1, 1),
    },
  }
}

describe('handoff contract: four lines pass', () => {
  it('accepts a complete contract with checksum evidence', () => {
    const contract = assertHandoffContract(validContract())
    expect(contract.conclusion).toBe('The handoff contract renders and validates.')
    expect(contract.evidence).toHaveLength(1)
  })

  it('accepts a line-number-only evidence pointer', () => {
    const contract = assertHandoffContract({
      ...validContract(),
      evidence: [{ path: 'src/report.ts', line: 911 }],
    })
    expect(contract.evidence[0]!.line).toBe(911)
  })

  it('accepts a checkpoint path with checksum and line', () => {
    expect(isHandoffContract({
      ...validContract(),
      evidence: [{ path: '/tmp/checkpoints/run-7.json', checksum: '0123456789abcdef', line: 12 }],
    })).toBe(true)
  })
})

describe('handoff contract: missing rows are rejected', () => {
  it('rejects a missing conclusion with a bilingual error', () => {
    try {
      assertHandoffContract({ ...validContract(), conclusion: '   ' })
      expect.unreachable('missing conclusion must fail closed')
    } catch (error) {
      expect(error).toBeInstanceOf(HandoffContractError)
      const contractError = error as HandoffContractError
      expect(contractError.field).toBe('handoff.conclusion')
      expect(contractError.zh).toContain('结论')
      expect(contractError.en).toContain('conclusion')
      expect(contractError.message).toContain(HANDOFF_ERRORS.MISSING_CONCLUSION.zh)
      expect(contractError.message).toContain(HANDOFF_ERRORS.MISSING_CONCLUSION.en)
    }
  })

  it('rejects missing evidence with a bilingual error', () => {
    try {
      assertHandoffContract({ ...validContract(), evidence: [] })
      expect.unreachable('missing evidence must fail closed')
    } catch (error) {
      expect(error).toBeInstanceOf(HandoffContractError)
      const contractError = error as HandoffContractError
      expect(contractError.field).toBe('handoff.evidence')
      expect(contractError.message).toContain(HANDOFF_ERRORS.MISSING_EVIDENCE.zh)
      expect(contractError.message).toContain(HANDOFF_ERRORS.MISSING_EVIDENCE.en)
    }
  })

  it('rejects missing open questions with a bilingual error', () => {
    try {
      assertHandoffContract({ ...validContract(), openQuestions: [] })
      expect.unreachable('missing open questions must fail closed')
    } catch (error) {
      expect(error).toBeInstanceOf(HandoffContractError)
      expect((error as HandoffContractError).field).toBe('handoff.openQuestions')
      expect((error as Error).message).toContain(HANDOFF_ERRORS.MISSING_OPEN_QUESTIONS.zh)
      expect((error as Error).message).toContain(HANDOFF_ERRORS.MISSING_OPEN_QUESTIONS.en)
    }
  })

  it('rejects missing next steps with a bilingual error', () => {
    try {
      assertHandoffContract({ ...validContract(), nextSteps: [] })
      expect.unreachable('missing next steps must fail closed')
    } catch (error) {
      expect(error).toBeInstanceOf(HandoffContractError)
      expect((error as HandoffContractError).field).toBe('handoff.nextSteps')
      expect((error as Error).message).toContain(HANDOFF_ERRORS.MISSING_NEXT_STEPS.zh)
      expect((error as Error).message).toContain(HANDOFF_ERRORS.MISSING_NEXT_STEPS.en)
    }
  })
})

describe('handoff contract: unverifiable evidence is rejected', () => {
  it('rejects bare prose with no check bit', () => {
    try {
      assertHandoffContract({
        ...validContract(),
        evidence: [{ path: 'somebody said it works' }],
      })
      expect.unreachable('bare prose evidence must fail closed')
    } catch (error) {
      expect(error).toBeInstanceOf(HandoffContractError)
      expect((error as Error).message).toContain(HANDOFF_ERRORS.EVIDENCE_NOT_VERIFIABLE.zh)
      expect((error as Error).message).toContain(HANDOFF_ERRORS.EVIDENCE_NOT_VERIFIABLE.en)
    }
  })

  it('rejects a file path without checksum or line', () => {
    expect(isHandoffContract({
      ...validContract(),
      evidence: [{ path: 'src/report.ts' }],
    })).toBe(false)
  })

  it('rejects a malformed checksum', () => {
    expect(isHandoffContract({
      ...validContract(),
      evidence: [{ path: 'src/report.ts', checksum: 'not-hex!!' }],
    })).toBe(false)
  })
})

describe('handoff render: fixed four lines, bilingual', () => {
  it('renders four labelled lines in order (zh)', () => {
    const lines = renderHandoff(validContract(), 'zh').split('\n')
    expect(lines).toHaveLength(4)
    expect(lines[0]).toMatch(/^结论：/)
    expect(lines[1]).toMatch(/^证据指针：/)
    expect(lines[2]).toMatch(/^未决问题：/)
    expect(lines[3]).toMatch(/^下一步：/)
  })

  it('renders four labelled lines in order (en)', () => {
    const lines = renderHandoff(validContract(), 'en').split('\n')
    expect(lines).toHaveLength(4)
    expect(lines[0]).toMatch(/^Conclusion:/)
    expect(lines[1]).toMatch(/^Evidence:/)
    expect(lines[2]).toMatch(/^Open questions:/)
    expect(lines[3]).toMatch(/^Next steps:/)
  })

  it('renders the section wrapper with the contract lines', () => {
    const section = renderHandoffSection(validContract(), 'zh')
    expect(section).toContain('交接契约：')
    expect(section).toContain('结论：')
    expect(section).toContain('checkpoints/run-1.json')
  })
})

describe('report: handoff block is appended without changing the main flow', () => {
  it('renders all four handoff rows (zh and en)', () => {
    const report = assertWorkflowReport(validReport(), OBJECTIVE, config)
    const contract = validContract()
    const text = renderReport(report, { handoff: contract, handoffEn: contract })
    expect(text).toContain('Grok workflow: COMPLETED')
    expect(text).toContain('交接契约：')
    expect(text).toContain('结论：')
    expect(text).toContain('证据指针：')
    expect(text).toContain('未决问题：')
    expect(text).toContain('下一步：')
    expect(text).toContain('Handoff:')
    expect(text).toContain('Conclusion:')
  })

  it('renders no handoff block when no contract is attached', () => {
    const report = assertWorkflowReport(validReport(), OBJECTIVE, config)
    const text = renderReport(report)
    expect(text).toContain('Grok workflow: COMPLETED')
    expect(text).not.toContain('交接契约：')
    expect(text).not.toContain('Handoff:')
  })
})
