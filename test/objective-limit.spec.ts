/**
 * Boundary matrix for the workflow objective limit.
 *
 * Four lengths — 4 000, 4 001, 32 000 admitted, 32 001 refused — on the two paths
 * a request can take since M3.3 deleted the message gate:
 *
 *   1. `tool`     — the workflow tool's direct call path. Nothing is in front of it
 *                   and the declared tool schema has no `maxLength`, so `execute()`
 *                   itself is the only guard.
 *   2. `fallback` — the plan the generated workflow script builds when the
 *                   planner fails, reached through the same direct tool call so
 *                   the objective has already passed entry validation.
 *
 * The third path this file used to cover — `agent/pre-step` refusing an over-long
 * message — no longer exists: no listener refuses a user message any more, and
 * `test/block-flag-baseline.spec.ts` pins the pass-through that replaced it.
 *
 * Every row is deterministic and offline: the workflow engine is faked, the
 * real generated script runs in a VM with scripted child answers, and no model
 * API is called.
 */
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import { resolveConfig } from '../src/config.js'
import { apply } from '../src/index.js'
import { parseMemberLabel } from '../src/naming.js'
import { assertWorkflowReport } from '../src/report.js'
import { WORKFLOW_SCRIPT } from '../src/script.js'
import type { WorkflowReport } from '../src/types.js'
import { execution, task, verification } from './fixtures.js'
import { roleOf, runWorkflowScript, taskFromPrompt, type ScriptAgent } from './helpers.js'

/** Mirrors TASK_LIMITS.objectiveChars in src/input.ts and src/script.ts. */
const OBJECTIVE_LIMIT = 32_000

/* ------------------------------------------------------------------ engine -- */

type PlannerMode = 'plan' | 'fail'

interface EngineResult {
  value: unknown
  stopReason: string
  agentsStarted: number
}

class FakeRun {
  readonly id = 'run-limit'
  readonly meta: WorkflowStartRequest['meta']
  readonly dispose = vi.fn(async () => {})
  readonly result: Promise<EngineResult>
  private resolve!: (value: EngineResult) => void

  readonly cancel = vi.fn((_reason?: string) => {
    this.resolve({ value: null, stopReason: 'cancelled', agentsStarted: 0 })
  })

  constructor(request: WorkflowStartRequest) {
    this.meta = request.meta
    this.result = new Promise(resolve => { this.resolve = resolve })
  }

  complete(value: unknown): void {
    this.resolve({ value, stopReason: 'completed', agentsStarted: 2 })
  }
}

/**
 * Workflow engine double that runs the REAL generated script with scripted
 * children. `planner: 'fail'` makes the planner throw on every route, which is
 * what forces the script onto its fallback plan.
 */
class FakeEngine {
  readonly startCalls: WorkflowStartRequest[] = []
  readonly childCalls: { label: string; prompt: string }[] = []
  planner: PlannerMode = 'plan'

  async start(request: WorkflowStartRequest): Promise<FakeRun> {
    this.startCalls.push(request)
    const run = new FakeRun(request)
    const planned = [task('a')]
    const scriptAgent: ScriptAgent = async (prompt, options) => {
      this.childCalls.push({ label: options.label, prompt })
      // Roles are read back from the user-visible label: since the task-grouped
      // progress panel (PR #24) the script emits `规划助手` / `执行` / `检查`
      // instead of `grok-planner` / `grok-worker-*`, and this double was written
      // against the machine names. `parseMemberLabel` is the plugin's own inverse
      // of `memberLabel`, so the two cannot drift apart again.
      const member = parseMemberLabel(options.label)
      if (member?.role === 'planner') {
        if (this.planner === 'fail') throw new Error('planner unavailable')
        return { tasks: planned }
      }
      if (member?.role === 'worker') return execution('work done')
      if (member?.role === 'verifier') {
        // Answer the task that was actually handed over: the fallback plan words
        // its criteria per segment, and a real verifier copies them verbatim.
        return this.planner === 'fail'
          ? verification(taskFromPrompt(prompt))
          : verification(planned[0]!)
      }
      throw new Error(`unexpected label ${options.label}`)
    }
    const result = await runWorkflowScript(request.script, request.args as Record<string, unknown>, scriptAgent)
    run.complete(result.report)
    return run
  }
}

/* ----------------------------------------------------------------- context -- */

type Handler = (payload: unknown, next: () => Promise<unknown>) => Promise<unknown>

interface ExecutableTool {
  name: string
  parameters: { properties?: Record<string, Record<string, unknown>> }
  execute(args: Record<string, unknown>, exec: Record<string, unknown>): Promise<unknown>
}

class FakeContext {
  readonly warnings: string[] = []
  readonly handlers = new Map<string, Handler>()
  readonly promptSections: unknown[] = []
  readonly registeredTools: ExecutableTool[] = []
  readonly engine = new FakeEngine()
  readonly disposers: (() => Promise<void> | void)[] = []
  readonly tools = {
    register: (tool: unknown) => {
      this.registeredTools.push(tool as ExecutableTool)
      return () => {}
    },
  }

  readonly systemPrompt = {
    section: (section: unknown) => { this.promptSections.push(section); return () => {} },
    getSectionOrder: () => 2600,
  }

  readonly workflowEngine = this.engine
  readonly logger = () => ({ warn: (message: string) => { this.warnings.push(message) } })

  /**
   * Bound, like cordis's own `on`.
   *
   * `src/block/brakes.ts` reads `ctx.on` into a local and calls it, so a method that
   * relied on its receiver would throw there; the real context binds its methods.
   */
  readonly on = (event: string, handler: Handler): (() => void) => {
    this.handlers.set(event, handler)
    return () => { this.handlers.delete(event) }
  }

  effect(installer: () => () => Promise<void> | void): () => Promise<void> | void {
    const disposer = installer()
    this.disposers.push(disposer)
    return disposer
  }

  preStep(): Handler {
    const handler = this.handlers.get('agent/pre-step')
    if (handler === undefined) throw new Error('gate did not register agent/pre-step')
    return handler
  }

  get tool(): ExecutableTool {
    const tool = this.registeredTools[0]
    if (tool === undefined) throw new Error('workflow tool was not registered')
    return tool
  }

  async dispose(): Promise<void> {
    for (const disposer of this.disposers.splice(0).reverse()) await disposer()
  }
}

/* ------------------------------------------------------------------ helpers -- */

const contexts: FakeContext[] = []

function newContext(overrides: Record<string, unknown> = {}): FakeContext {
  const ctx = new FakeContext()
  contexts.push(ctx)
  // These tests are about the objective limit, not about tiering, and the answer
  // strategy stays at its default (`in-turn`).
  // `grokDefault: 'on'` on purpose: grok mode is a per-session toggle whose
  // default is `off`, and an off session passes every batch through as normal
  // chat (`mode-off`). These tests are about *admitted* batches, so they opt in.
  apply(ctx as never, { grokDefault: 'on', ...overrides })
  return ctx
}

function exec(): Record<string, unknown> {
  return {
    agent: { session: { header: { delegationDepth: 0 } } },
    signal: new AbortController().signal,
    callId: 'call-limit',
    rootCallId: 'call-limit',
    name: 'grok_workflow',
    token: {},
  }
}

/** Capture a rejection without swallowing it: the error is the assertion target. */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(() => undefined, (error: unknown) => error)
}

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.dispose()
})

/* --------------------------------------------- 2. the direct tool-call path -- */

describe('objective limit — direct tool-call path (no gate)', () => {
  it('declares no schema-level maxLength, so execute() is the only direct-call guard', () => {
    const ctx = newContext()
    const objective = ctx.tool.parameters.properties?.['objective']

    expect(objective).toBeDefined()
    expect(objective!['type']).toBe('string')
    expect(objective!['maxLength']).toBeUndefined()
    expect(String(objective!['description'])).toContain('32000')
  })

  it.each([4_000, 4_001, 32_000])(
    'accepts a %i-character objective and returns a report carrying it whole',
    async (chars) => {
      const ctx = newContext()
      const objective = 'x'.repeat(chars)
      const report = await ctx.tool.execute({ objective }, exec()) as WorkflowReport

      expect(report.objective).toBe(objective)
      expect(report.objective).toHaveLength(chars)
      expect(report.status).toBe('completed')
      expect(ctx.engine.startCalls).toHaveLength(1)
    },
  )

  it('rejects a 32 001-character objective with the 32 000 limit before the engine starts', async () => {
    const ctx = newContext()
    const error = await rejectionOf(ctx.tool.execute({ objective: 'x'.repeat(OBJECTIVE_LIMIT + 1) }, exec()))

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('32000')
    expect((error as Error).message).toMatch(/objective must be at most 32000 characters/)
    expect(ctx.engine.startCalls).toHaveLength(0)
  })
})

/* -------------------------------------------- 3. the planner-failure fallback -- */

describe('objective limit — planner-failure fallback path', () => {
  it.each([4_000, 4_001, 32_000])(
    'builds a fallback plan from the whole %i-character objective when the planner fails',
    async (chars) => {
      const ctx = newContext()
      ctx.engine.planner = 'fail'
      const objective = 'x'.repeat(chars)
      const report = await ctx.tool.execute({ objective }, exec()) as WorkflowReport

      expect(report.plan.source).toBe('fallback')
      expect(report.plan.error ?? '').toContain('planner failed')
      expect(report.status).toBe('partial')
      // The fallback carries the objective whole. How it is packed into tasks is
      // the script's business (one task, or contiguous segments that respect the
      // per-task bound); what must never change is that concatenating the planned
      // objectives reproduces the original byte for byte — no truncation.
      expect(report.objective).toBe(objective)
      expect(report.plan.tasks.length).toBeGreaterThanOrEqual(1)
      expect(report.plan.tasks.map(item => item.objective).join('')).toBe(objective)
      expect(report.tasks).toHaveLength(report.plan.tasks.length)
      for (let index = 0; index < report.plan.tasks.length; index += 1) {
        expect(report.plan.tasks[index]!.objective.length).toBeGreaterThan(0)
        expect(report.tasks[index]!.objective).toBe(report.plan.tasks[index]!.objective)
      }
      // The whole objective reached the planner that failed, and every fallback
      // worker received its own piece of it, unshortened.
      expect(ctx.engine.childCalls.find(call => roleOf(call.label) === 'planner')?.prompt.includes(objective)).toBe(true)
      const workerPrompts = ctx.engine.childCalls
        .filter(call => roleOf(call.label) === 'worker')
        .map(call => call.prompt)
      expect(workerPrompts).toHaveLength(report.plan.tasks.length)
      for (const planned of report.plan.tasks) {
        expect(workerPrompts.some(prompt => prompt.includes(planned.objective))).toBe(true)
      }      // Host validation accepts a fallback report at this length.
      const config = resolveConfig({
        maxConcurrency: report.limits.maxConcurrency,
        maxTasks: report.limits.maxTasks,
      })
      expect(() => assertWorkflowReport(report, objective, config)).not.toThrow()
    },
  )

  it('refuses a 32 001-character objective before any plan or fallback can be built', async () => {
    const ctx = newContext()
    ctx.engine.planner = 'fail'
    const error = await rejectionOf(ctx.tool.execute({ objective: 'x'.repeat(OBJECTIVE_LIMIT + 1) }, exec()))

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('32000')
    expect((error as Error).message).toMatch(/objective must be at most 32000 characters/)
    // No engine start and no planner/worker child call: the over-limit objective
    // never reaches planning, so there is no fallback plan to build from it.
    expect(ctx.engine.startCalls).toHaveLength(0)
    expect(ctx.engine.childCalls).toHaveLength(0)
  })
})

/* ------------------------------------------------- built-artifact parity -- */

describe('built artifacts agree with the source constants', () => {
  function source(relative: string): string {
    return readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')
  }

  it('lib/script-parts carries objectiveChars 32000 and no 4000 objective cap', () => {
    // Since the script split (fix/split-script-30), lib/script.js is a re-export
    // shell; the guest text lives in lib/script-parts/*.js (concatenated at
    // runtime by assembleWorkflowScript, pinned byte-identical to the old bundle).
    const script = source('lib/script-parts/routing.js') + source('lib/script-parts/prompts.js')
    expect(script).toContain('objectiveChars: 32000')
    expect(script).not.toMatch(/objectiveChars:\s*4_?000/)
    expect(script).not.toContain('objective <= 4000')
    expect(script).toContain('workflow objective <= 32000 chars')
  })

  it('lib/input.js and lib/intake.js carry the same 32000 limit', () => {
    expect(source('lib/input.js')).toContain('objectiveChars: 32_000')
    // The tool path asks the intake pass, and the intake pass takes its bound from
    // `TASK_LIMITS.objectiveChars`. Asserting the seam instead of the literal
    // expression keeps the parity check pointed at where the decision lives.
    expect(source('lib/intake.js')).toContain('promptChars: TASK_LIMITS.objectiveChars')
  })

  it('the generated script and the host agree on the objective limit used at runtime', () => {
    // WORKFLOW_SCRIPT is the exact text the host hands to the engine.
    expect(WORKFLOW_SCRIPT).toContain('objectiveChars: 32000')
    expect(WORKFLOW_SCRIPT).not.toMatch(/objectiveChars:\s*4_?000/)
  })
})
