import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { parseMemberLabel, plannerCallLabel, synthesisDraftLabel } from '../src/naming.js'
import { assertWorkflowReport, renderReport, shippedSummaryDraft } from '../src/report.js'
import { buildWorkflowRequest } from '../src/script.js'
import { teamWorkflowEngine } from '../src/team-engine.js'
import type { NormalizedTask, WorkflowReport } from '../src/types.js'
import { createEngineHarness, type ChildAnswer, type ChildCall } from './engine-harness.js'
import { execution, task, verification } from './fixtures.js'
import { settledWithin, taskFromPrompt } from './helpers.js'

/**
 * Numbered names for the calls a run repeats.
 *
 * Two legs of a run make more than one call under the same phase: the summary gate
 * writes up to three drafts (a first draft plus bounded rewrites, each with its own
 * same-call resubmit), and the planning leg plans once at the start and again at
 * every wave boundary. Both used to carry one name (`汇总助手`, `规划助手`), so a
 * reader could not tell draft 1 from draft 2 or the opening plan from a replan.
 *
 * These cases drive the *real* engine — `@deepseek-ai/dsh-workflow-ptc`, its script
 * VM, the plugin's own twin (`src/team-engine.ts`, which derives every child's
 * durable label from its prompt's first line) and the real generated script — and
 * assert the strings the panel would show. The model is scripted; nothing is
 * online.
 *
 * The third block pins the replan submission contract: the boundary prompt asks for
 * a structured result the way the engine really records one (a tool call), and a
 * child that answered in prose gets one same-boundary resubmit instead of losing
 * the merge.
 */

const OBJECTIVE = 'Ship the verified result'

/** The probe's own bound on a run's settle (the child budget here is real but unused). */
const SETTLE_BUDGET_MS = 15_000

function config(overrides: Record<string, unknown> = {}): ReturnType<typeof resolveConfig> {
  return resolveConfig({ maxConcurrency: 1, maxTasks: 4, childTimeoutMs: 7_200_000, ...overrides })
}

/**
 * The role a child belongs to, read the way the panel reads it.
 *
 * The twin rewrites each activation's label from the prompt's first line, and a
 * task child's first line is `角色 · 任务标题`, so the whole line is tried first and
 * the head before the `·` second. That order is what lets a numbered name that
 * itself carries a `·` (`汇总·第1稿`) be recognised at all.
 */
function roleOfCall(call: { prompt: string }): string {
  const head = call.prompt.split('\n')[0]!.trim()
  return parseMemberLabel(head, 'zh')?.role
    ?? parseMemberLabel(head.split('·')[0]!.trim(), 'zh')?.role
    ?? ''
}

interface RealRun {
  report: WorkflowReport
  children: ChildCall[]
  events: string[]
  stopReason: string
}

/** Run the generated script over the real engine and the plugin's twin. */
async function runReal(
  answer: (call: ChildCall) => ChildAnswer,
  cfg: ReturnType<typeof resolveConfig>,
  options: { tasks?: NormalizedTask[], replanToken?: string } = {},
): Promise<RealRun> {
  const harness = createEngineHarness(async call => answer(call))
  try {
    const payload = buildWorkflowRequest(
      OBJECTIVE,
      options.tasks,
      cfg,
      'zh',
      undefined,
      undefined,
      undefined,
      options.replanToken,
    )
    const engine = teamWorkflowEngine(harness.ctx as never, { warn() {} })
    const run = engine.start({
      script: payload.script,
      meta: { name: '任务团队', description: 'numbered names run' },
      args: payload.args,
      parent: { session: { header: {}, id: 'naming-sequence-parent' } } as never,
      maxTotalAgents: payload.maxTotalAgents,
    })
    const result = await settledWithin(run.result, SETTLE_BUDGET_MS, 'the numbered-names twin run')
    await run.dispose()
    return {
      report: assertWorkflowReport(result.value, OBJECTIVE, cfg),
      children: harness.children,
      events: harness.events,
      stopReason: result.stopReason,
    }
  } finally {
    await harness.dispose()
  }
}

/** Every child whose first line names the given role. */
function callsOf(children: ChildCall[], role: string): ChildCall[] {
  return children.filter(call => roleOfCall(call) === role)
}

/** The first line of a prompt: the display title the twin lifts into the label. */
function titleOf(call: ChildCall): string {
  return call.prompt.split('\n')[0]!.trim()
}

describe('a summary that takes two drafts names each draft', () => {
  it('labels the drafts 汇总·第1稿 and 汇总·第2稿, and keeps the resubmit on its own draft', async () => {
    // Draft 1 answers in prose first (so its own resubmit runs), then cites a path
    // the report never produced (so the gate rejects it and asks for draft 2);
    // draft 2 is clean and ships.
    let synthCalls = 0
    const run = await runReal(call => {
      const role = roleOfCall(call)
      if (role === 'synthesizer') {
        synthCalls += 1
        if (synthCalls === 1) return { output: [{ type: 'text' as const, text: '任务 a 已处理。' }], stopReason: 'completed' }
        if (synthCalls === 2) return { structured: { summary: '结果已核验，详见 `out/never-produced.bin`。' } }
        return { structured: { summary: '任务 a 已完成，证据已核验。' } }
      }
      if (role === 'worker') return { structured: execution('did the work') }
      return { structured: verification(taskFromPrompt(call.prompt)) }
    }, config({ synthesis: 'layered', roles: { synthesizer: [{ model: 'writer' }] } }), { tasks: [task('a')] })

    const synthesizer = callsOf(run.children, 'synthesizer')
    expect(synthesizer).toHaveLength(3)
    // The row labels the panel shows — the twin derived them from each prompt's
    // first line, which is the same string the script passed as `agent()`'s label.
    expect(synthesizer.map(call => call.label)).toEqual([
      synthesisDraftLabel(1),
      synthesisDraftLabel(1),
      synthesisDraftLabel(2),
    ])
    expect(synthesizer.map(titleOf)).toEqual(['汇总·第1稿', '汇总·第1稿', '汇总·第2稿'])
    // The names are the plugin's own: they parse back to the role a reader sees.
    for (const call of synthesizer) expect(parseMemberLabel(call.label)).toEqual({ role: 'synthesizer', attempt: 1 })

    // Two drafts really were reviewed, and the shipped narrative is draft 2's.
    expect(run.report.synthesis.review).toBe('check=pass verify=pass drafts=2')
    expect(run.report.synthesis.summary ?? '').toContain('任务 a 已完成')
    expect(run.report.synthesis.summary ?? '').not.toContain('never-produced.bin')
    expect(run.stopReason).toBe('completed')
    // The gate says which draft it shipped, in a machine-readable line the host turns
    // into the panel's 「（定稿）」 mark. Draft 1 was rejected, so nothing marks it.
    expect(run.events.filter(event => event.includes('gw-summary-final'))).toEqual(['workflow/log:gw-summary-final 2'])
    // The ledger tells the reader which draft the answer came from, without touching
    // the machine string the host reads.
    expect(renderReport(run.report)).toContain('Summary review: check=pass verify=pass drafts=2 · final: draft 2')
  })

  it('says nothing about a final draft when the gate never passed one', async () => {
    // The polish cites a path the report never produced every time, so the gate
    // rejects every draft and the deterministic narrative ships. Nothing is marked.
    const run = await runReal(call => {
      const role = roleOfCall(call)
      if (role === 'synthesizer') return { structured: { summary: '结果已核验，详见 `out/never-produced.bin`。' } }
      if (role === 'worker') return { structured: execution('did the work') }
      return { structured: verification(taskFromPrompt(call.prompt)) }
    }, config({ synthesis: 'layered', roles: { synthesizer: [{ model: 'writer' }] } }), { tasks: [task('a')] })

    expect(callsOf(run.children, 'synthesizer')).toHaveLength(3)
    expect(run.events.some(event => event.includes('gw-summary-final'))).toBe(false)
    expect(shippedSummaryDraft(run.report.synthesis.review)).toBeUndefined()
    expect(renderReport(run.report)).not.toContain('final: draft')
  })
})

describe('the planning leg numbers its two kinds of call', () => {
  it('numbers the opening plan 1 and each wave boundary after it', async () => {
    const run = await runReal(call => {
      const role = roleOfCall(call)
      if (role === 'planner') {
        if (call.prompt.includes('REPLAN:')) return { structured: { action: 'none', reason: 'nothing queued' } }
        return { structured: { waves: [[task('a')], [task('b')], [task('c')]] } }
      }
      if (role === 'worker') return { structured: execution('did the work') }
      return { structured: verification(taskFromPrompt(call.prompt)) }
    }, config({ maxConcurrency: 2, maxTasks: 8, replan: true }), { replanToken: 'tok-naming' })

    const planner = callsOf(run.children, 'planner')
    expect(planner).toHaveLength(3)
    expect(planner.map(call => call.label)).toEqual([
      plannerCallLabel(1),
      plannerCallLabel(2),
      plannerCallLabel(3),
    ])
    // One source, one string: the durable label is the prompt's own opening line.
    expect(planner.map(titleOf)).toEqual(['规划（第1次）', '规划（第2次）', '规划（第3次）'])
    for (const call of planner) expect(parseMemberLabel(call.label)).toEqual({ role: 'planner', attempt: 1 })

    // Both replans stay on the plan stage, one per boundary.
    expect(planner.slice(1).map(call => call.prompt.includes('BOUNDARY: wave 1 has settled') ? 'wave-1' : 'wave-2'))
      .toEqual(['wave-1', 'wave-2'])
    expect(run.report.plan.replans?.map(row => row.decision)).toEqual(['none', 'none'])
    // A version of 1 is omitted from the report on purpose (an unchanged plan stays
    // byte-identical to a run that never replanned), so it reads as 1 here.
    expect(run.report.plan.version ?? 1).toBe(1)
    expect(run.report.status).toBe('completed')
    expect(run.events.some(event => event.includes('replan at wave 1 boundary'))).toBe(true)
  })
})

describe('a boundary replan submits through the structured result tool', () => {
  /** Three waves, one boundary reached in the cases below. */
  const waves = { waves: [[task('a')], [task('b')]] }

  it('asks for the tool call, not for "the structured result only"', async () => {
    const run = await runReal(call => {
      const role = roleOfCall(call)
      if (role === 'planner') {
        if (call.prompt.includes('REPLAN:')) return { structured: { action: 'none', reason: 'nothing queued' } }
        return { structured: waves }
      }
      if (role === 'worker') return { structured: execution('did the work') }
      return { structured: verification(taskFromPrompt(call.prompt)) }
    }, config({ replan: true }), { replanToken: 'tok-naming' })

    const boundary = callsOf(run.children, 'planner').find(call => call.prompt.includes('REPLAN:'))
    expect(boundary).toBeDefined()
    // The old closing line contradicted the engine's hard requirement (structured
    // output only arrives through the tool), so a literal child never produced one.
    expect(boundary!.prompt).not.toContain('Answer with the structured result only')
    expect(boundary!.prompt).toContain('structured result tool')
    expect(boundary!.prompt).toContain('{"action":"none"|"apply"')
    expect(boundary!.label).toBe(plannerCallLabel(2))
  })

  it('resubmits the same boundary once when the child prose-answered, and the merge lands', async () => {
    let boundaryCalls = 0
    const run = await runReal(call => {
      const role = roleOfCall(call)
      if (role === 'planner') {
        if (!call.prompt.includes('REPLAN:')) return { structured: waves }
        boundaryCalls += 1
        if (boundaryCalls === 1) return { output: [{ type: 'text' as const, text: '我看了队列，先不改计划。' }], stopReason: 'completed' }
        return { structured: { action: 'apply', reason: 'the queue asked for d', edits: [{ action: 'add', task: task('d') }] } }
      }
      if (role === 'worker') return { structured: execution('did the work') }
      return { structured: verification(taskFromPrompt(call.prompt)) }
    }, config({ replan: true }), { replanToken: 'tok-naming' })

    const boundary = callsOf(run.children, 'planner').filter(call => call.prompt.includes('REPLAN:'))
    // Same boundary, same name: the resubmit is not a new planning call. The merge
    // appends task `d` as a wave of its own, so a later boundary is asked too — the
    // resubmit count below is what proves the first one asked only once more.
    expect(boundary[0]!.label).toBe(plannerCallLabel(2))
    expect(boundary[1]!.label).toBe(plannerCallLabel(2))
    expect(boundary.filter(call => call.prompt.includes('RESUBMISSION (same boundary call, no retry spent)'))).toHaveLength(1)
    expect(boundary[1]!.prompt).toContain('RESUBMISSION (same boundary call, no retry spent)')
    expect(boundary[1]!.prompt).toContain('structured result tool')

    // The merge the second answer carried really landed.
    expect(run.report.plan.version).toBe(2)
    expect(run.report.plan.replans?.[0]?.decision).toBe('applied')
    expect(run.report.plan.replans?.[0]?.addedTaskIds).toEqual(['d'])
    expect(run.report.plan.tasks.map(row => row.id)).toContain('d')
    expect(run.events.some(event => event.includes('replan resubmitted a structured answer in the same boundary call'))).toBe(true)
    expect(run.stopReason).toBe('completed')
  })

  it('refuses the merge and leaves the plan untouched when neither answer submits', async () => {
    const run = await runReal(call => {
      const role = roleOfCall(call)
      if (role === 'planner') {
        if (!call.prompt.includes('REPLAN:')) return { structured: waves }
        return { output: [{ type: 'text' as const, text: '没问题。' }], stopReason: 'completed' }
      }
      if (role === 'worker') return { structured: execution('did the work') }
      return { structured: verification(taskFromPrompt(call.prompt)) }
    }, config({ replan: true }), { replanToken: 'tok-naming' })

    expect(callsOf(run.children, 'planner').filter(call => call.prompt.includes('REPLAN:'))).toHaveLength(2)
    expect(run.report.plan.version ?? 1).toBe(1)
    expect(run.report.plan.replans?.map(row => row.decision)).toEqual(['rejected'])
    expect(run.report.plan.replans?.[0]?.reason ?? '').toContain('no valid structured result')
    expect(run.report.plan.waves).toEqual([['a'], ['b']])
    expect(run.report.plan.tasks.map(row => row.id)).toEqual(['a', 'b'])
    expect(run.report.status).toBe('completed')
  })
})
