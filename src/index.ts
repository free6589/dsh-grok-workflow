import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { WorkflowRun, WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import { resolveConfig } from './config.js'
import { normalizeCallerTasks, GrokWorkflowInputError, TASK_LIMITS } from './input.js'
import { assertWorkflowReport, failureReport, renderReport } from './report.js'
import { buildWorkflowRequest } from './script.js'
import { redactDeep, redactError, redactSecrets } from './redact.js'
import type { GrokWorkflowConfig, TaskInput, WorkflowReport } from './types.js'

export { Config, HARD_LIMITS } from './config.js'
export { GrokWorkflowInputError } from './input.js'
export type {
  AttemptReport,
  ConfirmedEvidence,
  CriterionVerification,
  ExecutionResult,
  FinalStatus,
  GrokWorkflowConfig,
  IncompleteItem,
  NormalizedTask,
  PlanReport,
  ReportError,
  TaskInput,
  TaskReport,
  UncertaintyItem,
  VerificationResult,
  WorkflowReport,
} from './types.js'

/** Unique plugin name for DSH diagnostics. */
export const name = 'dsh-grok-workflow'

/** Required DSH services. The base/web/headless bundles provide them. */
export const inject = ['tools', 'workflowEngine', 'systemPrompt'] as const

interface ActiveState {
  disposed: boolean
  pending: number
  readonly controller: AbortController
  readonly runs: Set<WorkflowRun>
}

/** Combine signals without depending on AbortSignal.any availability. */
function anySignal(signals: AbortSignal[]): AbortSignal {
  const anyFn = (AbortSignal as unknown as { any?: (values: AbortSignal[]) => AbortSignal }).any
  if (typeof anyFn === 'function') return anyFn(signals)
  const controller = new AbortController()
  const abort = (): void => controller.abort()
  for (const signal of signals) {
    if (signal.aborted) {
      abort()
      break
    }
    signal.addEventListener('abort', abort, { once: true })
  }
  return controller.signal
}

/** Install the workflow tool and its lifetime-scoped state. */
export function apply(ctx: Context, rawConfig: GrokWorkflowConfig = {}): void {
  const config = resolveConfig(rawConfig)
  const logger = ctx.logger('dsh-grok-workflow')
  const state: ActiveState = {
    disposed: false,
    pending: 0,
    controller: new AbortController(),
    runs: new Set<WorkflowRun>(),
  }

  ctx.effect(() => async () => {
    state.disposed = true
    state.controller.abort('grok-workflow plugin unloaded')
    const runs = [...state.runs]
    state.runs.clear()
    await Promise.allSettled(runs.map(async run => {
      run.cancel('grok-workflow plugin unloaded')
      await run.dispose()
    }))
  }, 'dsh-grok-workflow: active runs')

  ctx.systemPrompt.section({
    name: 'tool:grok-workflow',
    order: ctx.systemPrompt.getSectionOrder('TOOL_WORKFLOW'),
    text: [
      `Use ${config.toolName} for substantial objectives that benefit from decomposition, independent subtasks, explicit verification, and a bounded retry policy.`,
      'It plans first when no tasks are supplied, runs independent tasks concurrently, verifies every acceptance criterion with evidence, and reports completed/partial/failed honestly.',
      'Do not use it for a single trivial lookup or a task whose result cannot be checked.',
    ].join(' '),
  })

  const parameters = {
    objective: {
      type: 'string' as const,
      required: true as const,
      description: 'The complete objective to plan, execute, verify, and report. Be specific about scope and desired deliverable.',
    },
    tasks: {
      type: 'array' as const,
      description: 'Optional independent plan. When omitted, a planner child decomposes the objective. Caller tasks must not depend on each other.',
      items: {
        type: 'object' as const,
        additionalProperties: false as const,
        properties: {
          id: { type: 'string' as const, description: 'Stable id; generated as task-N when omitted. Unique within the plan.' },
          title: { type: 'string' as const, required: true as const, description: 'Short task title.' },
          objective: { type: 'string' as const, required: true as const, description: 'Outcome this task must achieve.' },
          expectedOutput: { type: 'string' as const, required: true as const, description: 'Concrete expected output.' },
          acceptanceCriteria: {
            type: 'array' as const,
            required: true as const,
            description: 'Non-empty testable acceptance checks; the verifier must cite evidence for each one.',
            items: { type: 'string' as const },
          },
          context: { type: 'string' as const, description: 'Optional context the worker needs.' },
          constraints: {
            type: 'array' as const,
            description: 'Optional constraints and non-goals.',
            items: { type: 'string' as const },
          },
        },
      },
    },
  }

  const tool = defineTool({
    name: config.toolName,
    description: [
      'Plan, execute, independently verify, retry within a bounded limit, and synthesize a complex objective.',
      'Use for multi-step work with independent subtasks and concrete acceptance checks.',
      'Returns a canonical report with status completed, partial, or failed; never infer success from a worker self-report.',
    ].join(' '),
    parameters,
    output: {
      schema: { type: 'json' as const },
      render: (_args, value) => [{
        type: 'text' as const,
        text: renderReport(value as unknown as WorkflowReport),
      }],
    },
    timeoutMs: Math.min(config.timeoutMs + 60_000, 86_400_000),
    isConcurrencySafe: () => false,
    async execute(args, exec: ToolRunContext) {
      if (!exec.agent) {
        throw new Error(`${config.toolName} requires a calling agent (exec.agent was undefined)`)
      }
      const sessionHeader = exec.agent.session?.header
      const delegationDepth = sessionHeader?.delegationDepth ?? 0
      if (sessionHeader?.origin === 'subagent' || delegationDepth > 0) {
        throw new Error(`${config.toolName} cannot be invoked from a subagent (delegation depth ${delegationDepth})`)
      }
      if (state.disposed) {
        throw new Error(`${config.toolName} is unavailable: plugin has been unloaded`)
      }
      if (exec.signal.aborted) {
        throw new Error(`${config.toolName} cancelled before start`)
      }
      const objective = args.objective.trim()
      if (!objective) throw new GrokWorkflowInputError('objective must be a non-empty string')
      if (objective.length > TASK_LIMITS.objectiveChars) {
        throw new GrokWorkflowInputError(`objective must be at most ${TASK_LIMITS.objectiveChars} characters`)
      }
      const callerTasks = normalizeCallerTasks(args.tasks as TaskInput[] | undefined, config.maxTasks)
      const request = buildWorkflowRequest(objective, callerTasks, config)
      if (state.runs.size + state.pending >= config.maxActiveRuns) {
        throw new Error(`${config.toolName} already has ${state.runs.size + state.pending} active run(s); maxActiveRuns is ${config.maxActiveRuns}`)
      }

      const timeoutController = new AbortController()
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        timeoutController.abort()
      }, config.timeoutMs)
      timer.unref?.()
      const signal = anySignal([exec.signal, state.controller.signal, timeoutController.signal])
      const timeoutReport = () => redactDeep(failureReport(
        objective,
        config,
        'Timeout',
        `workflow exceeded the ${config.timeoutMs} ms deadline and was cancelled`,
      )) as never
      state.pending += 1
      let run: WorkflowRun | undefined
      try {
        try {
          const start: WorkflowStartRequest = {
            script: request.script,
            meta: request.meta,
            args: request.args,
            parent: exec.agent,
            signal,
            maxTotalAgents: request.maxTotalAgents,
            ...config.subagentProvider === undefined ? {} : { subagentProvider: config.subagentProvider },
          }
          try {
            run = await ctx.workflowEngine.start(start)
          } catch (error) {
            if (timedOut) return timeoutReport()
            throw error
          }
          if (state.disposed) {
            run.cancel('grok-workflow plugin unloaded')
            throw new Error(`${config.toolName} cancelled: plugin unloaded`)
          }
          state.runs.add(run)
          if (timedOut) {
            run.cancel('workflow deadline exceeded during startup')
            return timeoutReport()
          }
        } finally {
          state.pending -= 1
        }

        const activeRun = run
        if (activeRun === undefined) throw new Error('workflow engine did not return a run')
        const result = await activeRun.result
        if (timedOut) return timeoutReport()
        if (result.stopReason === 'completed') {
          const validated = assertWorkflowReport(result.value, objective, config)
          return redactDeep(validated) as never
        }
        if (result.stopReason === 'cancelled') {
          throw new Error(`${config.toolName} cancelled`)
        }
        throw new Error(redactSecrets(`${config.toolName} engine error: ${result.error ?? 'unknown workflow failure'}`))
      } finally {
        clearTimeout(timer)
        if (run !== undefined) {
          state.runs.delete(run)
          try {
            await run.dispose()
          } catch (error) {
            logger.warn(`run disposal failed: ${redactError(error)}`)
          }
        }
      }
    },
  })

  ctx.tools.register(tool)
}
