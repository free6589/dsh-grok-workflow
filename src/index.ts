import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { createConfigReader, describeResolvedConfig } from './config.js'
import { describeSurface, validateRoutes } from './settings.js'
import { installGate } from './gate.js'
import { installShutdownProbe } from './records.js'
import { normalizeCallerTasks, GrokWorkflowInputError, TASK_LIMITS } from './input.js'
import { renderReport } from './report.js'
import { redactError } from './redact.js'
import { createActiveState, disposeActiveState, runWorkflow } from './run.js'
import type { ActiveState } from './run.js'
import type { GrokWorkflowConfig, ResolvedConfig, TaskInput, WorkflowReport } from './types.js'

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
  const logger = ctx.logger('dsh-grok-workflow')
  // One reader, re-validated per admission (DD-9 1-2): a settings edit applies to
  // the next message, and a run that already started keeps the snapshot it was
  // given, so its limits cannot move under it.
  const reader = createConfigReader(rawConfig as Record<string, unknown>, logger)
  // t47: every effective-configuration change is announced once. The t46 round could
  // not tell a settings save from a profile-patch edit — and could not read the
  // deadline the run actually used — because both lived only in memory.
  let configSignature = ''
  const readConfig = (): ResolvedConfig => {
    const next = reader.read()
    const signature = describeResolvedConfig(next)
    if (signature !== configSignature) {
      configSignature = signature
      logger.info?.(`configuration in effect: ${signature}`)
    }
    return next
  }
  const config = readConfig()
  const state: ActiveState = createActiveState()

  // Settings surface: the generated form comes from the `Config` schema this
  // module exports, so the fields a user edits in the Web UI are the fields the
  // run reads. Declaring it is intent, not enablement (auto defaults to true);
  // the diagnostics line below makes "the page is real" answerable from the log
  // alone, and says what the only surface is when there is none (R-004).
  const surface = describeSurface(ctx)
  if (surface.level === 'warn') logger.warn(surface.text)
  else logger.info?.(surface.text)
  // Route validation (D): fail the load on a provider or enumerated model that
  // the runtime does not have, because a silently ignored chain looks like
  // routing that works. Anything the runtime cannot judge becomes a warning.
  const routes = validateRoutes(ctx, config)
  for (const note of routes.notes) logger.warn(note)
  if (routes.errors.length > 0) throw new Error(routes.errors.join('; '))

  // t45: remember shutdown signals, so the dispose record can say "the process is
  // shutting down" instead of "cause unknown". Removed again on reload.
  ctx.effect(() => installShutdownProbe(state))

  ctx.effect(() => async () => {
    // The disposer is where the t41 blind spot lived: two runs in two workspaces
    // were cancelled 573 ms apart with no way to tell who unloaded the plugin.
    // The raw stack is captured here, at the only place that knows the answer,
    // and `disposeActiveState` records what it attributes it to (t45, P0-1).
    await disposeActiveState(state, {
      logger,
      ...new Error('dsh-grok-workflow disposer').stack === undefined
        ? {}
        : { callSite: String(new Error('dsh-grok-workflow disposer').stack) },
    })
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
          writesPaths: {
            type: 'array' as const,
            description: 'File or directory paths this task writes. Overlapping tasks are serialized (they share one working directory); omit when unknown.',
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
      // Read at execution time, not at registration: a settings edit applies to
      // the next call. An invalid edit is reported as the reason the call cannot
      // run (never silently replaced by defaults).
      let live: ResolvedConfig
      try {
        live = readConfig()
      } catch (error) {
        throw new Error(`${config.toolName} cannot run: the current configuration is invalid: ${redactError(error)}`)
      }
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
      const callerTasks = normalizeCallerTasks(args.tasks as TaskInput[] | undefined, live.maxTasks)
      const outcome = await runWorkflow({
        ctx,
        config: live,
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
    installGate({
      ctx,
      config,
      state,
      logger,
      readConfig,
      lastGoodConfig: () => reader.lastGood(),
    })
  }
}
