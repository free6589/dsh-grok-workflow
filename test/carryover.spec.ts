import { describe, expect, it } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Message } from '@deepseek-ai/dsh-llm'
import {
  CARRYOVER_LIMITS,
  buildCarryoverDigest,
  carryoverBounds,
  carryoverForSession,
  clampBounds,
  collectCarryoverRounds,
  parseReportRound,
} from '../src/carryover.js'
import { renderReport } from '../src/report.js'
import { buildWorkflowRequest, maxTotalAgentsFor, WORKFLOW_SCRIPT } from '../src/script.js'
import { resolveConfig } from '../src/config.js'
import type { WorkflowReport } from '../src/types.js'
import { execution, task, verification } from './fixtures.js'
import { idOfPhase, roleOf, runWorkflowScript } from './helpers.js'

/**
 * Cross-round context carry-over (v0.5).
 *
 * Boundary of this file: everything here is deterministic and offline. The only
 * fakes are the subagent hook (scripted answers, no model) and the session
 * surface (a `deriveMessages()` that returns fixtures). The prompt builders, the
 * generated script and the digest compiler are the real ones.
 */

/** Distinctive research result used to prove it survives into the next round. */
const FINDING = 'PYTEST-EVIDENCE-9f3c: the retry loop fails at 0.42% under load'

/** A report shaped like the ones the plugin validates and renders. */
function reportFixture(overrides: {
  objective?: string
  status?: 'completed' | 'partial' | 'failed'
  criterion?: string
  evidence?: string
  incomplete?: { taskId: string, reason: string }[]
  uncertainties?: { taskId: string, text: string }[]
  summary?: string
} = {}): WorkflowReport {
  const criterion = overrides.criterion ?? 'a works'
  const evidence = overrides.evidence ?? 'verified a works in /tmp/round1/report.txt'
  return {
    schemaVersion: 'grok-workflow/v1',
    status: overrides.status ?? 'completed',
    objective: overrides.objective ?? 'Research the retry behaviour',
    plan: { source: 'caller', tasks: [task('a', [criterion])] } as never,
    tasks: [{
      id: 'a',
      title: 'Task a',
      attempts: [{
        attempt: 1,
        status: 'verified',
        execution: execution('done'),
        verification: verification(task('a', [criterion]), {
          criteria: [{ criterion, met: true, evidence }],
        }),
      }],
      status: 'verified',
      evidence: [{ criterion, met: true, evidence }],
    }] as never,
    confirmed: [{ taskId: 'a', criterion, evidence }],
    incomplete: (overrides.incomplete ?? []) as never,
    errors: [],
    uncertainties: (overrides.uncertainties ?? []) as never,
    routes: [],
    routing: { planner: [], worker: [], verifier: [], synthesizer: [] },
    synthesis: overrides.summary === undefined ? { mode: 'deterministic' } : { mode: 'deterministic', summary: overrides.summary },
    limits: { maxConcurrency: 2, maxRetries: 1, maxTasks: 6, maxTotalAgents: 10 },
  } as unknown as WorkflowReport
}

/** A session-ish object whose derivation returns the given messages. */
function sessionWith(messages: readonly Message[]): never {
  return { id: 'sess-carryover', deriveMessages: () => messages } as never
}

/** One plugin-authored report message, the way the gate writes it. */
function reportMessage(text: string): Message {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'grok-workflow' } as never }) as Message
}

/** One ordinary user message. */
function userMessage(text: string): Message {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } as never }) as Message
}

/** Script args mirroring the request builder (caller plan, no planner). */
function scriptArgs(tasks: unknown[], carryover?: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    objective: 'Ship the verified result',
    tasks,
    maxConcurrency: 2,
    maxRetries: 0,
    maxTasks: 6,
    maxTotalAgents: maxTotalAgentsFor(tasks.length, 0),
    ...carryover === undefined ? {} : { carryover },
  }
  return base
}

describe('carry-over: compiling one round', () => {
  it('parses the rendered report back into objective, results, open questions and locators', () => {
    const text = renderReport(reportFixture({
      evidence: `${FINDING} (see /tmp/round1/report.txt)`,
      incomplete: [{ taskId: 'b', reason: 'benchmark under 1000 qps never ran' }],
      uncertainties: [{ taskId: 'a', text: 'only measured on one host' }],
      summary: 'The retry loop drops 0.42% of requests under load.',
    }))
    const round = parseReportRound(text)
    expect(round).not.toBeNull()
    expect(round!.status).toBe('completed')
    expect(round!.objective).toBe('Research the retry behaviour')
    expect(round!.confirmed.join(' ')).toContain('PYTEST-EVIDENCE-9f3c')
    expect(round!.incomplete.join(' ')).toContain('benchmark under 1000 qps never ran')
    expect(round!.uncertainties.join(' ')).toContain('only measured on one host')
    expect(round!.summary).toBe('The retry loop drops 0.42% of requests under load.')
    expect(round!.locators).toContain('/tmp/round1/report.txt')
  })

  it('accepts the relay envelope (preamble and markers) around the report', () => {
    const envelope = [
      'The mandatory workflow gate finished and the workflow produced the report below.',
      '<<<GROK-WORKFLOW-REPORT>>>',
      renderReport(reportFixture({ status: 'partial', evidence: FINDING })),
      '<<<END-GROK-WORKFLOW-REPORT>>>',
    ].join('\n')
    const round = parseReportRound(envelope)
    expect(round).not.toBeNull()
    expect(round!.status).toBe('partial')
    expect(round!.objective).toBe('Research the retry behaviour')
    expect(round!.confirmed.join(' ')).toContain('PYTEST-EVIDENCE-9f3c')
  })

  it('refuses text that carries no report signature instead of inventing a round', () => {
    expect(parseReportRound('just an ordinary assistant answer with no report')).toBeNull()
    expect(parseReportRound('')).toBeNull()
  })

  it('only compiles plugin-authored report messages', () => {
    const report = renderReport(reportFixture({ evidence: FINDING }))
    const session = sessionWith([
      userMessage('research the retry behaviour'),
      userMessage('an assistant that merely mentions Grok workflow: COMPLETED and nothing else'),
      reportMessage(report),
    ])
    const rounds = collectCarryoverRounds(session, { rounds: 5, chars: 4_000 })
    expect(rounds).toHaveLength(1)
    expect(rounds[0]!.confirmed.join(' ')).toContain('PYTEST-EVIDENCE-9f3c')
  })

  it('redacts credentials that appear in a prior report', () => {
    const report = renderReport(reportFixture({ evidence: 'used api key sk-abcdef0123456789abcdef to call it' }))
    const rounds = collectCarryoverRounds(sessionWith([reportMessage(report)]), { rounds: 2, chars: 4_000 })
    const digest = buildCarryoverDigest(rounds, { chars: 4_000 })
    expect(digest).not.toContain('sk-abcdef0123456789abcdef')
  })
})

describe('carry-over: graceful degradation', () => {
  it('renders nothing when there is no prior round', () => {
    expect(buildCarryoverDigest([], { rounds: 5, chars: 5_000 })).toBe('')
    expect(collectCarryoverRounds(undefined, { rounds: 5, chars: 5_000 })).toEqual([])
    expect(carryoverForSession(undefined, { rounds: 5, chars: 5_000 })).toEqual({ digest: '', rounds: 0 })
    expect(carryoverForSession(sessionWith([]), { rounds: 5, chars: 5_000 })).toEqual({ digest: '', rounds: 0 })
  })

  it('survives a session whose derivation throws', () => {
    const broken = { deriveMessages: () => { throw new Error('session unavailable') } } as never
    expect(collectCarryoverRounds(broken, { rounds: 5, chars: 5_000 })).toEqual([])
  })

  it('carries nothing when the configured budget is zero', () => {
    const session = sessionWith([reportMessage(renderReport(reportFixture()))])
    expect(collectCarryoverRounds(session, { rounds: 0, chars: 5_000 })).toEqual([])
    expect(collectCarryoverRounds(session, { rounds: 5, chars: 0 })).toEqual([])
    expect(carryoverBounds({ historyTurns: 0, historyChars: 0 })).toEqual({ rounds: 0, chars: 0 })
  })

  it('takes its budget from the configured history knobs, clamped to the hard ceilings', () => {
    expect(carryoverBounds({ historyTurns: 3, historyChars: 900 })).toEqual({ rounds: 3, chars: 900 })
    expect(carryoverBounds({ historyTurns: 10_000, historyChars: 9_999_999 })).toEqual({
      rounds: CARRYOVER_LIMITS.rounds,
      chars: CARRYOVER_LIMITS.chars,
    })
    expect(clampBounds({ rounds: -5, chars: -5 })).toEqual({ rounds: 0, chars: 0 })
  })
})

describe('carry-over: the digest is hard-capped', () => {
  /** Many verbose rounds, newest first, the way a long session produces them. */
  function manyRounds(count: number): ReturnType<typeof collectCarryoverRounds> {
    const rounds = []
    for (let index = count; index >= 1; index -= 1) {
      rounds.push({
        status: 'completed',
        objective: `Round ${index} objective `.repeat(10).trim(),
        confirmed: Array.from({ length: CARRYOVER_LIMITS.itemsPerSection }, (_, row) => `criterion ${index}-${row}: ${'evidence '.repeat(40)}`.trim()),
        incomplete: [`open question ${index}`],
        uncertainties: [`uncertainty ${index}`],
        summary: `summary ${index} ${'detail '.repeat(50)}`.trim(),
        locators: ['/tmp/round/report.txt'],
      })
    }
    return rounds
  }

  it('never exceeds the configured cap, even when the caller asks for far more', () => {
    const rounds = manyRounds(40)
    for (const chars of [400, 1_000, 4_000, 11_999, 12_000, 1_000_000]) {
      const digest = buildCarryoverDigest(rounds, { rounds: 100, chars })
      expect(digest.length, `chars=${chars}`).toBeLessThanOrEqual(Math.min(chars, CARRYOVER_LIMITS.chars))
    }
  })

  it('never exceeds the hard ceiling when no budget is given at all', () => {
    const digest = buildCarryoverDigest(manyRounds(40))
    expect(digest.length).toBeLessThanOrEqual(CARRYOVER_LIMITS.chars)
    expect(digest.length).toBeGreaterThan(0)
  })

  it('keeps the newest round and says how much it dropped', () => {
    const rounds = manyRounds(40)
    const digest = buildCarryoverDigest(rounds, { rounds: 100, chars: 1_200 })
    expect(digest.length).toBeLessThanOrEqual(1_200)
    // Newest first: the newest objective is inside, the oldest is not.
    expect(digest).toContain('Round -1 [completed] Round 40 objective')
    expect(digest).not.toContain('Round 1 objective')
    expect(digest).toMatch(/truncated: \d+ earlier round\(s\) omitted/)
  })

  it('honours the round cap as well as the character cap', () => {
    const digest = buildCarryoverDigest(manyRounds(10), { rounds: 3, chars: 12_000 })
    expect(digest).toContain('Round -3 ')
    expect(digest).not.toContain('Round -4 ')
    expect(digest).toMatch(/truncated: 7 earlier round\(s\) omitted/)
  })

  it('never splits a surrogate pair at the cut', () => {
    const rounds = [{
      status: 'completed',
      objective: '🪸'.repeat(200),
      confirmed: [],
      incomplete: [],
      uncertainties: [],
      locators: [],
    }]
    const digest = buildCarryoverDigest(rounds, { chars: 61 })
    expect(digest.length).toBeLessThanOrEqual(61)
    expect(digest).not.toMatch(/[\uD800-\uDBFF]$/)
  })
})

describe('carry-over: the real prompt path', () => {
  /**
   * Round 1: run the real generated script, producing a report whose verified
   * evidence is the research result a follow-up must build on.
   */
  async function roundOne(): Promise<WorkflowReport> {
    const callerTasks = [task('a', ['the retry behaviour is measured'])]
    const agent = async (_prompt: string, options: { label: string, phase?: string }) => {
      if (roleOf(options.label) === 'worker') return execution('measured the retry loop')
      if (roleOf(options.label) === 'verifier') {
        return verification(callerTasks.find(item => item.id === idOfPhase(options.phase))!, {
          criteria: [{ criterion: 'the retry behaviour is measured', met: true, evidence: FINDING }],
        })
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const { report } = await runWorkflowScript(WORKFLOW_SCRIPT, scriptArgs(callerTasks), agent)
    expect(report.status).toBe('completed')
    expect(report.confirmed[0]!.evidence).toContain('PYTEST-EVIDENCE-9f3c')
    return report as unknown as WorkflowReport
  }

  it('puts the earlier research result into the next round\'s prompts without the user repeating it', async () => {
    // The gate writes the rendered report into the session; the digest is
    // compiled from exactly that text.
    const round1 = await roundOne()
    const digest = buildCarryoverDigest(
      collectCarryoverRounds(sessionWith([userMessage('measure the retry loop'), reportMessage(renderReport(round1))]), { rounds: 6, chars: 6_000 }),
      { rounds: 6, chars: 6_000 },
    )
    expect(digest).toContain('PYTEST-EVIDENCE-9f3c')
    expect(digest).toContain('Ship the verified result')

    // Round 2: a follow-up whose own words never mention the finding.
    const followUp = 'now write the summary my manager asked for'
    expect(followUp).not.toContain('PYTEST-EVIDENCE')
    const round2Tasks = [task('b', ['the summary cites the measured failure rate'])]
    const prompts: { role: string | undefined, prompt: string }[] = []
    const agent = async (prompt: string, options: { label: string, phase?: string }) => {
      prompts.push({ role: roleOf(options.label), prompt })
      if (roleOf(options.label) === 'planner') return { tasks: round2Tasks }
      if (roleOf(options.label) === 'worker') return execution('wrote the summary')
      if (roleOf(options.label) === 'verifier') {
        return verification(round2Tasks.find(item => item.id === idOfPhase(options.phase))!, {
          criteria: [{ criterion: 'the summary cites the measured failure rate', met: true, evidence: 'line 3 cites 0.42%' }],
        })
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const { report } = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      { ...scriptArgs([], digest), objective: followUp, tasks: null, maxTasks: 6, maxTotalAgents: maxTotalAgentsFor(6, 0) },
      agent,
    )
    expect(report.status).toBe('completed')
    const planner = prompts.find(entry => entry.role === 'planner')
    const worker = prompts.find(entry => entry.role === 'worker')
    const verifier = prompts.find(entry => entry.role === 'verifier')
    expect(planner?.prompt).toContain('PRIOR ROUNDS')
    expect(planner?.prompt).toContain('PYTEST-EVIDENCE-9f3c')
    expect(worker?.prompt).toContain('PRIOR ROUNDS')
    expect(worker?.prompt).toContain('PYTEST-EVIDENCE-9f3c')
    expect(verifier?.prompt).toContain('PYTEST-EVIDENCE-9f3c')
    // The verifier is told the earlier work is not evidence for this task.
    expect(verifier?.prompt).toContain('never evidence for this task')
    // The digest is the carrier: the planner sees the follow-up words, the worker
    // sees only its task plus the digest — and the finding is in the digest.
    expect(planner?.prompt).toContain(followUp)
    expect(worker?.prompt).not.toContain(followUp)
    // And no child is invited to ask the user to repeat it.
    expect(worker?.prompt).toContain('never ask the user to repeat information')
  })

  it('keeps first-round prompts unchanged (no carry-over block at all)', async () => {
    const callerTasks = [task('a')]
    const prompts: string[] = []
    const agent = async (prompt: string, options: { label: string, phase?: string }) => {
      prompts.push(prompt)
      if (roleOf(options.label) === 'worker') return execution('work done')
      if (roleOf(options.label) === 'verifier') return verification(callerTasks[0]!)
      throw new Error(`unexpected label ${options.label}`)
    }
    const { report } = await runWorkflowScript(WORKFLOW_SCRIPT, scriptArgs(callerTasks), agent)
    expect(report.status).toBe('completed')
    expect(prompts.length).toBeGreaterThan(0)
    for (const prompt of prompts) {
      expect(prompt).not.toContain('PRIOR ROUNDS')
    }
  })

  it('clamps an oversized digest inside the script before it reaches a child', async () => {
    const callerTasks = [task('a')]
    let workerPrompt = ''
    const agent = async (prompt: string, options: { label: string, phase?: string }) => {
      if (roleOf(options.label) === 'worker') {
        workerPrompt = prompt
        return execution('work done')
      }
      if (roleOf(options.label) === 'verifier') return verification(callerTasks[0]!)
      throw new Error(`unexpected label ${options.label}`)
    }
    const oversized = `PRIOR ROUNDS IN THIS SESSION\n${'x'.repeat(200_000)}`
    const { report } = await runWorkflowScript(WORKFLOW_SCRIPT, scriptArgs(callerTasks, oversized), agent)
    expect(report.status).toBe('completed')
    expect(workerPrompt).toContain('PRIOR ROUNDS')
    // The injected block is the JSON string literal, so it is at most the hard
    // ceiling plus the escaping of a single unbroken line (none here).
    const start = workerPrompt.indexOf('PRIOR ROUNDS (compiled')
    expect(start).toBeGreaterThan(-1)
    const block = workerPrompt.slice(start)
    expect(block.length).toBeLessThan(CARRYOVER_LIMITS.chars + 1_000)
    expect(block.length).toBeGreaterThan(1_000)
  })

  it('pins the script ceiling to CARRYOVER_LIMITS.chars', () => {
    expect(WORKFLOW_SCRIPT).toContain(`const CARRYOVER_MAX_CHARS = ${CARRYOVER_LIMITS.chars};`)
  })
})

describe('carry-over: the request payload', () => {
  const config = resolveConfig({ maxConcurrency: 2, maxRetries: 1, maxTasks: 3 })

  it('ships the digest in args when there is one', () => {
    const request = buildWorkflowRequest('objective', undefined, config, 'en', 'PRIOR ROUNDS IN THIS SESSION: …')
    expect(request.args.carryover).toBe('PRIOR ROUNDS IN THIS SESSION: …')
  })

  it('omits the key entirely when there is nothing to carry (byte-identical first round)', () => {
    for (const value of [undefined, '', '   ']) {
      const request = buildWorkflowRequest('objective', undefined, config, 'en', value)
      expect('carryover' in request.args).toBe(false)
    }
  })

  it('clamps an oversized digest on the host side too', () => {
    const request = buildWorkflowRequest('objective', undefined, config, 'en', 'y'.repeat(100_000))
    expect(request.args.carryover!.length).toBeLessThanOrEqual(CARRYOVER_LIMITS.chars)
  })
})
