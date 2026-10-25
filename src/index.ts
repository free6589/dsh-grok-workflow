import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { resolveConfig } from './config.js'
import { installGate } from './gate.js'
import { normalizeCallerTasks, GrokWorkflowInputError, TASK_LIMITS } from './input.js'
import { renderReport } from './report.js'
import { createActiveState, disposeActiveState, runWorkflow } from './run.js'
import type { ActiveState } from './run.js'
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

/** Install the workflow tool and its lifetime-scoped state. */
export function apply(ctx: Context, rawConfig: GrokWorkflowConfig = {}): void {
  const config = resolveConfig(rawConfig)
  const logger = ctx.logger('dsh-grok-workflow')
  const state: ActiveState = createActiveState()

  ctx.effect(() => async () => {
    await disposeActiveState(state)
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
      const { agent } = exec
      if (!agent) {
        throw new Error(`${config.toolName} requires a calling agent (exec.agent was undefined)`)
      }
      const sessionHeader = agent.session?.header
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
      const outcome = await runWorkflow({
        ctx,
        config,
        state,
        logger,
        agent,
        objective,
        signals: [exec.signal],
        ...callerTasks === undefined ? {} : { callerTasks },
        failureMode: 'throw',
      })
      return outcome.report as never
    },
  })

  ctx.tools.register(tool)

  if (config.enforceGate) {
    installGate({ ctx, config, state, logger })
  }
}
