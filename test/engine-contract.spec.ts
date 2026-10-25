/**
 * Real-engine contract tests. See test/engine-harness.ts for the exact boundary:
 * the workflow engine, script VM, guest program and result materialization are
 * real; process confinement, sandbox policy and the model are faked.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { MaterializeError, materializeFromRealm } from '@deepseek-ai/dsh-workflow-ptc'
import { resolveConfig } from '../src/config.js'
import { assertWorkflowReport } from '../src/report.js'
import { WORKFLOW_SCRIPT } from '../src/script.js'
import type { NormalizedTask } from '../src/types.js'
import { createEngineHarness, type EngineHarness } from './engine-harness.js'

const harnesses: EngineHarness[] = []

function harness(answer: Parameters<typeof createEngineHarness>[0]): EngineHarness {
  const created = createEngineHarness(answer)
  harnesses.push(created)
  return created
}

afterEach(async () => {
  for (const created of harnesses.splice(0)) await created.dispose()
})

const OBJECT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { summary: { type: 'string' } },
  required: ['summary'],
}

describe('agent() structured output contract', () => {
  it('returns result.structured to the script when a schema is passed', async () => {
    const engine = harness(call => ({
      structured: call.outputSchema === undefined ? undefined : { summary: 'structured answer' },
      output: [{ type: 'text', text: 'ignored when structured is present' }],
    }))
    const result = await engine.run(
      `const value = await agent('do the work', { schema: ${JSON.stringify(OBJECT_SCHEMA)}, label: 'worker' });
       return { value: value };`,
    )
    expect(result.stopReason).toBe('completed')
    expect(result.value).toEqual({ value: { summary: 'structured answer' } })
    expect(engine.children).toHaveLength(1)
    expect(engine.children[0]!.outputSchema).toEqual(OBJECT_SCHEMA)
    expect(result.agentsStarted).toBe(1)
  })

  it('resolves null when the provider honors the schema but returns no structured value', async () => {
    // The engine maps "schema requested, no structured" to a null item instead of
    // throwing, which is what makes the plugin retry the task rather than abort.
    const engine = harness(() => ({ output: [{ type: 'text', text: 'prose only' }] }))
    const result = await engine.run(
      `const value = await agent('do the work', { schema: ${JSON.stringify(OBJECT_SCHEMA)} });
       return { isNull: value === null, value: value };`,
    )
    expect(result.stopReason).toBe('completed')
    expect(result.value).toEqual({ isNull: true, value: null })
  })

  it('returns concatenated text when no schema is passed', async () => {
    const engine = harness(() => ({
      output: [{ type: 'text', text: 'part one ' }, { type: 'text', text: 'part two' }],
    }))
    const result = await engine.run(`return { value: await agent('say something') };`)
    expect(result.stopReason).toBe('completed')
    expect(result.value).toEqual({ value: 'part one part two' })
  })

  it('plumbs label, phase, provider and model into the child activation', async () => {
    const engine = harness(() => ({ structured: { summary: 'ok' } }))
    await engine.run(
      `phase('Execute');
       await agent('work', { schema: ${JSON.stringify(OBJECT_SCHEMA)}, label: 'labelled', provider: 'other', model: 'model-x' });
       return { done: true };`,
      { subagentProvider: 'contract-fake' },
    )
    expect(engine.children[0]!.provider).toBe('other')
    expect(engine.children[0]!.model).toBe('model-x')
    expect(engine.events).toContain('workflow/phase:Execute')
    expect(engine.events.some(event => event.startsWith('workflow/agent-start'))).toBe(true)
    expect(engine.events.some(event => event.startsWith('workflow/agent-end'))).toBe(true)
  })

  it('exposes the start request args as the script global and narrates log()', async () => {
    const engine = harness(() => ({ output: [{ type: 'text', text: 'x' }] }))
    const result = await engine.run(
      `log('objective is ' + args.objective);
       return { objective: args.objective, count: args.count };`,
      { args: { objective: 'from args', count: 3 } },
    )
    expect(result.value).toEqual({ objective: 'from args', count: 3 })
    expect(engine.events).toContain('workflow/log:objective is from args')
  })
})

describe('result materialization contract', () => {
  it('rejects a nested undefined value and names its path', () => {
    expect(() => materializeFromRealm({ a: undefined }, 'workflow result'))
      .toThrow(MaterializeError)
    expect(() => materializeFromRealm({ a: undefined }, 'workflow result'))
      .toThrow(/workflow result\.a: undefined is not JSON data/)
  })

  it('rejects sparse arrays', () => {
    const sparse: number[] = [1]
    sparse[3] = 4
    expect(() => materializeFromRealm(sparse, 'workflow result'))
      .toThrow(/sparse arrays are not JSON data/)
  })

  it('rejects non-finite numbers', () => {
    expect(() => materializeFromRealm({ n: Number.POSITIVE_INFINITY }, 'workflow result'))
      .toThrow(/non-finite numbers are not JSON data/)
    expect(() => materializeFromRealm({ n: Number.NaN }, 'workflow result'))
      .toThrow(/non-finite numbers are not JSON data/)
  })

  it('does NOT reject negative zero — a report validator cannot rely on it', () => {
    // Deliberate: materializeFromRealm only rejects non-finite numbers. The
    // lossless-JSON check that also refuses -0 lives in dsh-util-values
    // (snapshotJsonValue), which the workflow seam does not use here. So -0
    // crosses the boundary and later collapses to 0 under JSON.stringify.
    const materialized = materializeFromRealm({ n: -0 }, 'workflow result') as { n: number }
    expect(Object.is(materialized.n, -0)).toBe(true)
    expect(JSON.stringify(materialized)).toBe('{"n":0}')
  })

  it('turns an unserializable return value into an engine error, not a partial report', async () => {
    const engine = harness(() => ({ output: [{ type: 'text', text: 'x' }] }))
    const result = await engine.run(`return { value: undefined };`)
    expect(result.stopReason).toBe('error')
    expect(result.value).toBeNull()
    expect(result.error).toContain('not plain JSON data')
  })
})

describe('fatal error propagation contract (current behaviour)', () => {
  it('aborts the whole run and drops earlier work when the agent cap trips', async () => {
    // Current, asserted-as-is behaviour: a fatal WorkflowError re-thrown by the
    // script settles the run as stopReason 'error' with value null, so any task
    // already verified in the same run is lost. Preserving partial results on
    // the fatal path is tracked separately; this test pins today's contract so
    // that change is deliberate.
    const engine = harness(() => ({ structured: { summary: 'ok' } }))
    const result = await engine.run(
      `const first = await agent('first', { schema: ${JSON.stringify(OBJECT_SCHEMA)} });
       let fatal = false;
       try {
         await agent('second', { schema: ${JSON.stringify(OBJECT_SCHEMA)} });
       } catch (error) {
         fatal = Boolean(error && error.fatal === true);
         if (fatal) throw error;
       }
       return { first: first, fatal: fatal };`,
      { maxTotalAgents: 1 },
    )
    expect(result.stopReason).toBe('error')
    expect(result.value).toBeNull()
    expect(result.error).toContain('total agent cap')
    // The first child did run; its verified result is simply not reported.
    expect(result.agentsStarted).toBe(1)
    expect(engine.children).toHaveLength(1)
  })

  it('rejects an unsupported agent() option as a fatal run error', async () => {
    const engine = harness(() => ({ output: [{ type: 'text', text: 'x' }] }))
    const result = await engine.run(`return { value: await agent('work', { effort: 'high' }) };`)
    expect(result.stopReason).toBe('error')
    expect(result.value).toBeNull()
    expect(result.error).toContain('effort')
  })

  it('rejects a schema outside the enforced JSON Schema subset', async () => {
    const engine = harness(() => ({ structured: { summary: 'ok' } }))
    const result = await engine.run(
      `return { value: await agent('work', { schema: { type: 'object', properties: { a: { type: 'string', minLength: 3 } } } }) };`,
    )
    expect(result.stopReason).toBe('error')
    expect(result.error).toContain('schema is outside the supported subset')
  })
})

/**
 * The plugin's own generated script, executed by the real engine. This is the
 * seam the earlier test suite could not reach: WORKFLOW_SCRIPT runs inside the
 * engine's script VM, `agent()` returns structured payloads through the real
 * guest program, and the resulting report is the one the host validator sees.
 */
describe('generated workflow script on the real engine', () => {
  function taskFromPrompt(prompt: string): NormalizedTask {
    const match = /TASK:\n(\{[\s\S]*?\})\n\n/.exec(prompt)
    if (match === null) throw new Error(`prompt has no task JSON: ${prompt.slice(0, 120)}`)
    return JSON.parse(match[1]!) as NormalizedTask
  }

  const executionResult = (summary: string) => ({
    summary,
    status: 'completed',
    deliverables: [{ description: 'output', locator: 'file:///tmp/out' }],
    evidence: [{ claim: 'implemented', source: 'src/index.ts' }],
    testsRun: [{ command: 'npm test', status: 'passed', detail: 'ok' }],
    filesChanged: [],
    uncertainties: [],
  })

  const verificationResult = (task: NormalizedTask, met = true) => ({
    verdict: met ? 'pass' : 'fail',
    criteria: task.acceptanceCriteria.map(criterion => ({
      criterion,
      met,
      evidence: met ? `checked ${criterion}` : '',
    })),
    checkedEvidence: [{ kind: 'file', locator: 'file:///tmp/out', finding: 'observed output' }],
    commandsRun: [{ command: 'npm test', status: 'passed', detail: 'ok' }],
    issues: met ? [] : ['criterion not met'],
    confidence: 'high',
  })

  function runArgs(tasks: NormalizedTask[], overrides: Record<string, unknown> = {}) {
    return {
      objective: 'Ship the verified result',
      tasks,
      maxConcurrency: 2,
      maxRetries: 1,
      maxTasks: 6,
      ...overrides,
    }
  }

  const callerTask: NormalizedTask = {
    id: 'a',
    title: 'Task a',
    objective: 'Do a',
    expectedOutput: 'Output a',
    acceptanceCriteria: ['a works'],
    context: '',
    constraints: [],
  }

  it('plans, executes, verifies and reports through the real engine', async () => {
    const engine = harness(call => {
      if (call.prompt.includes('You are the execution agent')) {
        return { structured: executionResult('worker done') }
      }
      return { structured: verificationResult(taskFromPrompt(call.prompt)) }
    })
    const args = { ...runArgs([callerTask]), maxTotalAgents: 7 }
    const result = await engine.run(WORKFLOW_SCRIPT, { args })
    expect(result.stopReason).toBe('completed')
    const validated = assertWorkflowReport(result.value, 'Ship the verified result', resolveConfig({ maxConcurrency: 2, maxRetries: 1, maxTasks: 6 }))
    expect(validated.status).toBe('completed')
    expect(validated.tasks[0]!.status).toBe('verified')
    expect(validated.confirmed).toEqual([{ taskId: 'a', criterion: 'a works', evidence: 'checked a works' }])
    expect(engine.children).toHaveLength(2)
  })

  it('retries once on a failing verification and reports partial on the real engine', async () => {
    const engine = harness(call => {
      if (call.prompt.includes('You are the execution agent')) {
        return { structured: executionResult('worker done') }
      }
      return { structured: verificationResult(taskFromPrompt(call.prompt), false) }
    })
    const args = { ...runArgs([callerTask]), maxTotalAgents: 7 }
    const result = await engine.run(WORKFLOW_SCRIPT, { args })
    expect(result.stopReason).toBe('completed')
    const validated = assertWorkflowReport(result.value, 'Ship the verified result', resolveConfig({ maxConcurrency: 2, maxRetries: 1, maxTasks: 6 }))
    expect(validated.status).toBe('failed')
    expect(validated.tasks[0]!.attempts).toHaveLength(2)
    expect(validated.incomplete).toEqual([{
      taskId: 'a',
      reason: expect.stringContaining('verifier verdict was fail'),
      category: 'quality',
    }])
    // one worker + one verifier per attempt, two attempts
    expect(engine.children).toHaveLength(4)
  })
})
