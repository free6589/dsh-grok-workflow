import { describe, expect, it } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import {
  buildCarryoverDigest,
  buildInheritanceDigest,
  CARRYOVER_LIMITS,
  INHERITANCE_HEADER,
  INHERITANCE_LIMITS,
  INHERITANCE_PREFIX,
  inheritanceForSession,
  parseReportRound,
  resumeDecisions,
} from '../src/carryover.js'
import type { CarryoverRound } from '../src/carryover.js'
import { resolveConfig } from '../src/config.js'
import { composeObjective } from '../src/history.js'
import { buildWorkflowRequest, WORKFLOW_SCRIPT } from '../src/script.js'
import { execution, task, verification } from './fixtures.js'
import { roleOf, runWorkflowScript, taskFromPrompt } from './helpers.js'

/**
 * L1 inheritance (Q2 / A1): a new round carries what an earlier round verified and
 * does not redo it, under its own 8K budget, with a generation guard so an older
 * round's verdict can never outvote a newer one.
 *
 * The rules under test are the ones the thin design fixes
 * (`docs/knowledge/DESIGN-dynamic-steering-semantics.md` §4):
 * retain / redrive / reverify / replan, the two-budget truncation order, and the
 * generation guard.
 */

const RENDERED_PARTIAL = [
  'Grok workflow: PARTIAL',
  'Objective: Ship the parser',
  'Plan: planner; 3 task(s); 1 verified',
  '- a: verified (1 attempt) — Lexer',
  '- b: failed (2 attempts) — Parser',
  '  incomplete (quality): parser does not accept the new syntax',
  '- c: blocked (1 attempt) — Codegen',
  '  incomplete: blocked: upstream task b did not verify, so this task did not run',
  'Confirmed evidence:',
  '- a: tokenizes input → verified tokenizes input in src/lexer.ts',
  'Final answer:',
  'Lexer landed; parser still open.',
].join('\n')

function round(overrides: Partial<CarryoverRound> = {}): CarryoverRound {
  return {
    status: 'partial',
    objective: 'Ship the parser',
    confirmed: [],
    incomplete: [],
    uncertainties: [],
    locators: [],
    ...overrides,
  }
}

describe('reading task rows out of an earlier round', () => {
  it('reads id, status, title and the row reason', () => {
    const parsed = parseReportRound(RENDERED_PARTIAL)
    expect(parsed).not.toBeNull()
    expect(parsed!.tasks?.map(row => [row.id, row.status])).toEqual([
      ['a', 'verified'],
      ['b', 'failed'],
      ['c', 'blocked'],
    ])
    expect(parsed!.tasks?.[1]?.conclusion).toContain('does not accept the new syntax')
    expect(parsed!.tasks?.[2]?.conclusion).toContain('upstream task b did not verify')
    // The task rows do not disturb the sections the conversation digest reads.
    expect(parsed!.confirmed).toHaveLength(1)
    expect(parsed!.summary).toContain('Lexer landed')
  })
})

describe('resume decisions', () => {
  const rounds: CarryoverRound[] = [round({
    tasks: [
      { id: 'a', status: 'verified', title: 'Lexer', conclusion: 'tokenizes input' },
      { id: 'b', status: 'failed', title: 'Parser' },
      { id: 'c', status: 'blocked', title: 'Codegen' },
    ],
  })]

  it('retains verified work, redrives the rest, and advances the generation', () => {
    const decisions = resumeDecisions(rounds)
    const byId = new Map(decisions.map(decision => [decision.taskId, decision]))
    expect(byId.get('a')?.decision).toBe('retain')
    expect(byId.get('a')?.generation).toBe(1)
    expect(byId.get('a')?.reason).toContain('carried forward')
    expect(byId.get('b')?.decision).toBe('redrive')
    expect(byId.get('b')?.generation).toBe(2)
    expect(byId.get('c')?.decision).toBe('redrive')
    expect(byId.get('c')?.reason).toContain('blocked')
  })

  it('marks changed work for reverification and a changed requirement for replanning', () => {
    const reverified = resumeDecisions(rounds, { reverify: ['a'] })
    expect(reverified.find(decision => decision.taskId === 'a')?.decision).toBe('reverify')
    const replanned = resumeDecisions(rounds, { replan: true })
    expect(replanned.every(decision => decision.decision === 'replan')).toBe(true)
    expect(replanned[0]?.reason).toContain('requirement changed')
  })

  it('lets the newest round decide: an older verified row cannot outvote a newer failure', () => {
    const older = round({ tasks: [{ id: 'a', status: 'verified', title: 'Lexer' }] })
    const newer = round({ status: 'failed', tasks: [{ id: 'a', status: 'failed', title: 'Lexer' }] })
    // Newest first, as the collector returns them.
    const decisions = resumeDecisions([newer, older])
    expect(decisions).toHaveLength(1)
    expect(decisions[0]?.decision).toBe('redrive')
    // Newest round is generation 1; a redrive starts the next generation.
    expect(decisions[0]?.generation).toBe(2)
  })

  it('gives all four decisions a reason and a bounded changed-field list', () => {
    const all = [
      ...resumeDecisions(rounds),
      ...resumeDecisions(rounds, { reverify: ['a'] }),
      ...resumeDecisions(rounds, { replan: true }),
    ]
    // Every branch is present exactly once in that set.
    expect(new Set(all.map(decision => decision.decision))).toEqual(
      new Set(['retain', 'redrive', 'reverify', 'replan']),
    )
    for (const decision of all) {
      expect(decision.reason.trim()).not.toBe('')
      expect(Array.isArray(decision.changedFields)).toBe(true)
    }
    // Only a replan quotes the requirement fields this round changed; the other
    // branches must not claim a change they were not told about.
    for (const decision of all.filter(entry => entry.decision !== 'replan')) {
      expect(decision.changedFields).toEqual([])
    }
    const replanned = resumeDecisions(rounds, {
      replan: true,
      changedFields: ['  acceptance criteria ', 'objective', 'objective', '   ', 'x'.repeat(200)],
    })
    // Trimmed, de-duplicated, per-field bounded, and stated in the reason too.
    expect(replanned[0]?.changedFields).toEqual(['acceptance criteria', 'objective', 'x'.repeat(48)])
    expect(replanned[0]?.reason).toContain('acceptance criteria, objective')
    // The list itself is bounded, so one noisy caller cannot flood the summary.
    const flooded = resumeDecisions(rounds, {
      replan: true,
      changedFields: Array.from({ length: 12 }, (_, index) => `field${index}`),
    })
    expect(flooded[0]?.changedFields).toHaveLength(8)
  })
})

describe('the inheritance budget', () => {
  it('stays inside its own 8K ceiling and does not borrow the conversation budget', () => {
    expect(INHERITANCE_LIMITS.chars).toBe(8_000)
    // Two physically separate budgets: the conversation digest keeps its own.
    expect(CARRYOVER_LIMITS.chars).toBe(12_000)
    expect(WORKFLOW_SCRIPT).toContain('const INHERITANCE_MAX_CHARS = 8000;')
    expect(WORKFLOW_SCRIPT).toContain('const CARRYOVER_MAX_CHARS = 12000;')
  })

  it('keeps the verified list and drops details when the budget runs out', () => {
    const many = Array.from({ length: 40 }, (_, index) => ({
      id: `t${index}`,
      status: 'verified',
      title: `Task ${index}`,
      conclusion: 'x'.repeat(400),
    }))
    const digest = buildInheritanceDigest([round({ tasks: many })], { chars: 6_000 })
    expect(digest.length).toBeLessThanOrEqual(6_000)
    // Every decision line is present: the list of what is done is the part that
    // must survive (Q2: details are cut first).
    for (let index = 0; index < 40; index += 1) expect(digest).toContain(`t${index} —`)
    expect(digest).toContain('[truncated')
  })

  it('keeps every decision line at the hard maximum of 100 tasks', () => {
    // The engine's task cap is 100, so this is the largest a round can be. The
    // compact rendering exists for exactly this case: the full prose form does not
    // fit, but the *list* of what is done must still be complete.
    const many = Array.from({ length: 100 }, (_, index) => ({
      id: `t${index}`,
      status: 'verified',
      title: `Task ${index}`,
      conclusion: 'y'.repeat(400),
    }))
    const digest = buildInheritanceDigest([round({ tasks: many })])
    expect(digest.length).toBeLessThanOrEqual(INHERITANCE_LIMITS.chars)
    for (let index = 0; index < 100; index += 1) {
      // Every task is named: not one verified decision is silently dropped.
      expect(digest).toContain(`t${index} `)
    }
    // Nothing was dropped, so nothing claims it was. A marker here would be a lie
    // in the other direction, and a sliced marker would be unreadable.
    expect(digest).not.toContain('oldest')
  })

  it('drops the oldest lines first and states the gap in full when even compact is over budget', () => {
    // 1_600 characters cannot hold 60 decision lines in either rendering, so the
    // drop order is what matters: the newest lines survive, the oldest go, and the
    // reader is told exactly how many.
    const many = Array.from({ length: 60 }, (_, index) => ({
      id: `k${String(index).padStart(2, '0')}`,
      status: index % 2 === 0 ? 'verified' : 'failed',
      title: `Task ${index}`,
    }))
    const digest = buildInheritanceDigest([round({ tasks: many })], { chars: 1_600 })
    expect(digest.length).toBeLessThanOrEqual(1_600)
    // Oldest dropped, newest kept (按旧到新砍).
    expect(digest).not.toContain('k00 ')
    expect(digest).toContain('k59 ')
    // The marker is a complete sentence ending in its own bracket, never a slice.
    expect(digest).toContain('[truncated: the oldest')
    expect(digest.trimEnd().endsWith(']')).toBe(true)
    // Verified lines go last: at this size the newest verified line is still there.
    expect(digest).toContain('k58 ')
  })

  it('renders nothing when there is no earlier task row', () => {
    expect(buildInheritanceDigest([round()])).toBe('')
    expect(inheritanceForSession(undefined)).toBe('')
    // The conversation digest is unaffected by the inheritance machinery.
    expect(buildCarryoverDigest([round({ confirmed: ['a: b'] })])).toContain('Round -1')
  })
})

describe('the objective the gate composes carries the inherited work', () => {
  it('attaches the digest under its own budget and keeps the request whole', () => {
    const digest = buildInheritanceDigest([round({
      tasks: [
        { id: 'a', status: 'verified', title: 'Lexer', conclusion: 'tokenizes input' },
        { id: 'b', status: 'failed', title: 'Parser' },
      ],
    })])
    const composed = composeObjective('Conversation so far:\nUser: earlier', 'now do the rest', 4_000, digest)!
    expect(composed).toContain(INHERITANCE_PREFIX)
    expect(composed).toContain('retain (generation 1): a')
    // Order is oldest → newest: inherited work, then history, then the request.
    expect(composed.indexOf(INHERITANCE_PREFIX)).toBeLessThan(composed.indexOf('Conversation so far'))
    expect(composed.indexOf('Conversation so far')).toBeLessThan(composed.indexOf('Current request:'))
    expect(composed.endsWith('now do the rest')).toBe(true)
    expect(composed.length).toBeLessThanOrEqual(4_000)
  })

  it('gives way with the oldest block first: history shrinks before an inherited line', () => {
    const digest = buildInheritanceDigest([round({
      tasks: [{ id: 'keepme', status: 'verified', title: 'Lexer', conclusion: 'tokenizes input' }],
    })])
    const history = 'Conversation so far (context only):\n' + Array.from({ length: 60 }, (_, index) => `User: line ${index} ${'z'.repeat(60)}`).join('\n')
    const composed = composeObjective(history, 'finish it', 4_000, digest)!
    expect(composed.length).toBeLessThanOrEqual(4_000)
    // The inherited decision survives the squeeze; the transcript is the block cut.
    expect(composed).toContain('keepme')
    expect(composed).toContain('retain (generation 1): keepme')
    expect(composed).toContain('…')
    expect(composed.endsWith('finish it')).toBe(true)
  })

  it('never shortens the request to make room for inherited work', () => {
    const digest = buildInheritanceDigest([round({
      tasks: Array.from({ length: 40 }, (_, index) => ({
        id: `n${String(index).padStart(2, '0')}`,
        status: 'verified' as const,
        title: `Task ${index}`,
      })),
    })])
    const request = 'r'.repeat(3_500)
    const composed = composeObjective('h'.repeat(1_000), request, 4_000, digest)!
    // The request is the block that must arrive whole; the inherited block is what
    // gives way, and it is trimmed from its old end, never cut mid-line.
    expect(composed.endsWith(request)).toBe(true)
    expect(composed.length).toBeLessThanOrEqual(4_000)
    expect(composed).toContain(INHERITANCE_PREFIX)
    expect(composed).toContain('n39 ')
    expect(composed).not.toContain('n00 ')
    for (const lineText of composed.split('\n')) {
      expect(lineText.length).toBeLessThanOrEqual(4_000)
    }
  })

  it('keeps the inherited header identical in the host digest and the generated script', () => {
    // Both sides ask "does the objective already carry this block?" — a drifted
    // prefix would make the planner print the same list twice.
    expect(INHERITANCE_HEADER.startsWith(INHERITANCE_PREFIX)).toBe(true)
    expect(WORKFLOW_SCRIPT).toContain(`const INHERITANCE_PREFIX = '${INHERITANCE_PREFIX}';`)
  })
})

describe('A1: a steering round carries the verified work instead of redoing it', () => {
  it('compiles the summary out of the transcript the new round runs in', () => {
    // The end-to-end input a real round sees: the plugin-authored report message
    // in the session, parsed back into task rows. This is the wiring behind
    // `runWorkflow`'s `inheritanceForSession(sessionOfAgent(agent))`.
    const session = {
      id: 'sess-inherit',
      deriveMessages: () => [createUserMessage({
        content: [{ type: 'text', text: RENDERED_PARTIAL }],
        source: { kind: 'grok-workflow' } as never,
      })],
    }
    const digest = inheritanceForSession(session as never)
    expect(digest).toContain('INHERITED WORK FROM EARLIER ROUNDS')
    expect(digest).toContain('retain (generation 1): a')
    expect(digest).toContain('redrive (generation 2): b')
    // The conversation digest reads the same session; the two budgets are separate.
    expect(buildCarryoverDigest([round({ confirmed: ['a: tokenizes input'] })])).toContain('Round -1')
  })

  it('puts the inheritance block into the planner and worker prompts', async () => {
    const config = resolveConfig({ maxConcurrency: 2, maxTasks: 4 })
    const request = buildWorkflowRequest('Ship the parser', [task('a')], config)
    const inheritance = buildInheritanceDigest([round({
      tasks: [{ id: 'a', status: 'verified', title: 'Lexer', conclusion: 'tokenizes input' }],
    })])
    expect(inheritance).toContain('retain')
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      { ...request.args, inheritance },
      async (prompt, options) => {
        const taskValue = taskFromPrompt(prompt)
        return roleOf(options.label) === 'worker' ? execution('done') : verification(taskValue as never)
      },
    )
    const workerPrompt = run.calls.find(call => roleOf(call.label) === 'worker')!.prompt
    expect(workerPrompt).toContain('INHERITED WORK')
    expect(workerPrompt).toContain('retain (generation 1): a')
    expect(workerPrompt).toContain('do not redo them')
    expect(run.report.status).toBe('completed')
  })

  it('prints the inherited block once per prompt, whichever carrier the round uses', async () => {
    const config = resolveConfig({ maxConcurrency: 2, maxTasks: 4 })
    const digest = buildInheritanceDigest([round({
      tasks: [{ id: 'a', status: 'verified', title: 'Lexer', conclusion: 'tokenizes input' }],
    })])
    // The gate shape: the digest is inside the objective (composeObjective) *and*
    // travels as an arg for the worker prompt. The planner reads the objective, so
    // the arg must not be printed a second time there.
    const objective = composeObjective('', 'Ship the parser', 32_000, digest)!
    expect(objective).toContain(INHERITANCE_PREFIX)
    // No caller tasks: the planner runs and plans `a`, so both prompts exist.
    const request = buildWorkflowRequest(objective, undefined, config)
    const planned = {
      waves: [[{
        id: 'a',
        title: 'Lexer',
        objective: 'Do a',
        expectedOutput: 'Output a',
        acceptanceCriteria: ['a works'],
        context: '',
        constraints: [],
      }]],
    }
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      { ...request.args, inheritance: digest },
      async (prompt, options) => {
        if (roleOf(options.label) === 'planner') return planned
        const taskValue = taskFromPrompt(prompt)
        return roleOf(options.label) === 'worker' ? execution('done') : verification(taskValue as never)
      },
    )
    const count = (prompt: string): number => prompt.split(INHERITANCE_PREFIX).length - 1
    const planner = run.calls.find(call => roleOf(call.label) === 'planner')!
    const worker = run.calls.find(call => roleOf(call.label) === 'worker')!
    expect(count(planner.prompt)).toBe(1)
    expect(count(worker.prompt)).toBe(1)
    expect(run.report.status).toBe('completed')
  })

  it('ships no inheritance key at all on a first round', () => {
    const config = resolveConfig({ maxConcurrency: 2, maxTasks: 4 })
    const request = buildWorkflowRequest('Ship the parser', [task('a')], config)
    expect('inheritance' in request.args).toBe(false)
  })

  it('clamps an over-long inheritance summary before it reaches a prompt', () => {
    const config = resolveConfig({ maxConcurrency: 2, maxTasks: 4 })
    const oversized = 'y'.repeat(INHERITANCE_LIMITS.chars + 5_000)
    const request = buildWorkflowRequest('Ship the parser', [task('a')], config, 'zh', undefined, undefined, oversized)
    expect(request.args.inheritance?.length).toBe(INHERITANCE_LIMITS.chars)
  })
})
