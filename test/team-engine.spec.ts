import { describe, expect, it } from 'vitest'
import { childLabelFromPrompt, rewriteActivationLabel, teamWorkflowEngine } from '../src/team-engine.js'
import { WORKFLOW_SCRIPT } from '../src/script.js'
import { createEngineHarness } from './engine-harness.js'
import { execution, task, verification } from './fixtures.js'
import { roleOf, runWorkflowScript, taskFromPrompt, type ScriptAgent } from './helpers.js'

/**
 * The durable display-name seam (fix_child_names).
 *
 * The workflow guest drops agent()'s label option before the host starts the
 * child, and the PTC host hardcodes `<run name> child N` as the child's durable
 * descriptor label — the field the Web GUI team panel renders as the child's
 * primary name. The plugin's fix has two halves, both covered here:
 *
 * 1. every child prompt opens with that child's display title (the guest
 *    builders in src/script.ts), asserted against the real WORKFLOW_SCRIPT;
 * 2. the team engine (a twin of the runtime's own PTC engine over a
 *    label-rewriting context view) propagates that first line into the
 *    `startActivation` label — the value `startLocal` snapshots into the
 *    child's durable `subagent/descriptor` event — asserted against the REAL
 *    engine class with the harness's fake subagent seam.
 */

const TEXT_ANSWER = { output: [{ type: 'text' as const, text: 'ok' }] }

function firstLine(prompt: string): string {
  const cut = prompt.indexOf('\n')
  return cut === -1 ? prompt : prompt.slice(0, cut)
}

describe('childLabelFromPrompt', () => {
  it('uses the first line, trimmed', () => {
    expect(childLabelFromPrompt('核查本地与远程仓库状态（阶段一）\nbody', 'f')).toBe('核查本地与远程仓库状态（阶段一）')
    expect(childLabelFromPrompt('  规划助手  \nrest', 'f')).toBe('规划助手')
  })

  it('caps at 48 code points with an ellipsis, never splitting a surrogate pair', () => {
    expect(childLabelFromPrompt('核'.repeat(60), 'f')).toBe('核'.repeat(48) + '…')
    expect(childLabelFromPrompt('🚀'.repeat(50), 'f')).toBe('🚀'.repeat(48) + '…')
  })

  it('keeps a single-line prompt whole', () => {
    expect(childLabelFromPrompt('汇总助手', 'f')).toBe('汇总助手')
  })

  it('falls back when the first line is blank or the prompt is not text', () => {
    expect(childLabelFromPrompt('   \nbody', 'f')).toBe('f')
    expect(childLabelFromPrompt('', 'f')).toBe('f')
    expect(childLabelFromPrompt(undefined, 'f')).toBe('f')
    expect(childLabelFromPrompt(42, 'f')).toBe('f')
  })
})

describe('rewriteActivationLabel', () => {
  it('rewrites the label from the prompt and preserves every other field', () => {
    const spec = {
      label: '任务团队 child 3',
      provider: 'spawn',
      delivery: 'caller' as const,
      request: { prompt: [{ type: 'text', text: '核查标题行\nbody' }] },
    }
    const rewritten = rewriteActivationLabel(spec)
    expect(rewritten.label).toBe('核查标题行')
    expect(rewritten).toEqual({ ...spec, label: '核查标题行' })
  })

  it('keeps the engine label, identity included, when the prompt has no usable first line', () => {
    const blank = { label: '任务团队 child 1', request: { prompt: [{ type: 'text', text: '   \nbody' }] } }
    expect(rewriteActivationLabel(blank)).toBe(blank)
    const missing = { label: '任务团队 child 2', request: {} }
    expect(rewriteActivationLabel(missing)).toBe(missing)
  })
})

describe('teamWorkflowEngine', () => {
  it('returns a non-PTC injected engine unchanged', () => {
    const fake = { start: async () => { throw new Error('not used') } }
    const ctx = { workflowEngine: fake } as never
    expect(teamWorkflowEngine(ctx)).toBe(fake)
  })

  it('returns a fake class instance unchanged instead of re-invoking its constructor', () => {
    class FakeTeamEngine {
      calls: unknown[] = []
      async start(request: unknown): Promise<never> {
        this.calls.push(request)
        throw new Error('fake engine')
      }
    }
    const engine = new FakeTeamEngine()
    const ctx = { workflowEngine: engine } as never
    const resolved = teamWorkflowEngine(ctx)
    expect(resolved).toBe(engine)
    expect((resolved as unknown as FakeTeamEngine).calls).toHaveLength(0)
  })

  it('returns the injected engine as-is when the context provides none (old failure mode)', () => {
    expect(teamWorkflowEngine({} as never)).toBeUndefined()
  })

  it('runs the real engine on a view that gives every child its prompt-first-line label, and leaves the injected engine untouched', async () => {
    const harness = createEngineHarness(() => TEXT_ANSWER)
    try {
      // The raw engine, exactly as shipped before this fix: `<run name> child N`.
      await harness.run("return await agent('核查本地与远程仓库状态（阶段一）\\nbody one', { label: '执行' });")
      expect(harness.children[0]!.label).toBe('contract child 1')

      // The twin: the same engine class over the same services, label seam rewritten.
      const twin = teamWorkflowEngine(harness.ctx)
      expect(twin).not.toBe(harness.ctx.workflowEngine)
      const run = twin.start({
        script: [
          `const a = await agent('核查本地与远程仓库状态（阶段一）\\nbody two', { label: '执行' });`,
          `const b = await agent('规划助手\\nbody three', {});`,
          `const c = await agent('${'长'.repeat(60)}\\nbody four', { label: '执行' });`,
          `return { a: a, b: b, c: c };`,
        ].join('\n'),
        meta: { name: '任务团队', description: 'team twin run' },
        parent: { session: { header: {}, id: 'contract-parent' } } as never,
      })
      const result = await run.result
      await run.dispose()
      expect(result.stopReason).toBe('completed')
      expect(harness.children[1]!.label).toBe('核查本地与远程仓库状态（阶段一）')
      expect(harness.children[2]!.label).toBe('规划助手')
      expect(harness.children[2]!.label).not.toBe('任务团队 child 2')
      expect(harness.children[3]!.label).toBe('长'.repeat(48) + '…')
      // The prompt itself is untouched — only the label view changes.
      expect(harness.children[1]!.prompt).toBe('核查本地与远程仓库状态（阶段一）\nbody two')
      // The injected engine's own seam is unchanged: a later raw run still records
      // the engine-chosen label (the child counter is per run, so it reads
      // `child 1` again — the point is that it is the raw engine's label, not
      // the twin's derived one).
      await harness.run("return await agent('另一行\\nbody five', { label: '执行' });")
      expect(harness.children[4]!.label).toBe('contract child 1')
      // One twin per injected engine.
      expect(teamWorkflowEngine(harness.ctx)).toBe(twin)
    } finally {
      await harness.dispose()
    }
  })
})

describe('every workflow child prompt opens with its display title', () => {
  const scriptedAgent = (language: 'zh' | 'en'): ScriptAgent => async (prompt, options) => {
    const role = roleOf(options.label, language)
    if (role === 'planner') return { tasks: [task('a'), task('b')] }
    if (role === 'worker') return execution('done')
    if (role === 'verifier') return verification(taskFromPrompt(prompt))
    return { summary: 'ok' }
  }

  it('titles the planner, each worker by its task, each verifier by role and task', async () => {
    const { calls } = await runWorkflowScript(WORKFLOW_SCRIPT, {
      objective: 'Ship it',
      maxConcurrency: 1,
      maxRetries: 0,
      maxTasks: 6,
    }, scriptedAgent('zh'))
    const planner = calls.filter(call => roleOf(call.label) === 'planner')
    expect(planner).toHaveLength(1)
    expect(firstLine(planner[0]!.prompt)).toBe('规划助手')
    const workers = calls.filter(call => roleOf(call.label) === 'worker')
    expect(workers.map(call => firstLine(call.prompt))).toEqual(['Task a', 'Task b'])
    const verifiers = calls.filter(call => roleOf(call.label) === 'verifier')
    expect(verifiers.map(call => firstLine(call.prompt))).toEqual(['检查 · Task a', '检查 · Task b'])
    // No child opens with its persona line any more: the title comes first.
    for (const call of calls) expect(firstLine(call.prompt)).not.toMatch(/^(You are the|You write)/)
  })

  it('uses the English copy when the naming language is en', async () => {
    const { calls } = await runWorkflowScript(WORKFLOW_SCRIPT, {
      objective: 'Ship it',
      maxConcurrency: 1,
      maxRetries: 0,
      maxTasks: 6,
      naming: { language: 'en' },
    }, scriptedAgent('en'))
    const planner = calls.filter(call => roleOf(call.label, 'en') === 'planner')
    expect(firstLine(planner[0]!.prompt)).toBe('Planner')
    const verifiers = calls.filter(call => roleOf(call.label, 'en') === 'verifier')
    expect(verifiers.map(call => firstLine(call.prompt))).toEqual(['Check · Task a', 'Check · Task b'])
  })
})
