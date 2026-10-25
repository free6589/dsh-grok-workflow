import { defineTool } from '@deepseek-ai/dsh-tools';
import { resolveConfig } from './config.js';
import { declareSettingsSurface, validateRoutes } from './settings.js';
import { installGate } from './gate.js';
import { normalizeCallerTasks, GrokWorkflowInputError, TASK_LIMITS } from './input.js';
import { renderReport } from './report.js';
import { createActiveState, disposeActiveState, runWorkflow } from './run.js';
export { Config, HARD_LIMITS } from './config.js';
export { GrokWorkflowInputError } from './input.js';
/** Unique plugin name for DSH diagnostics. */
export const name = 'dsh-grok-workflow';
/** Required DSH services. The base/web/headless bundles provide them. */
export const inject = ['tools', 'workflowEngine', 'systemPrompt'];
/** Install the workflow tool and its lifetime-scoped state. */
export function apply(ctx, rawConfig = {}) {
    const config = resolveConfig(rawConfig);
    const logger = ctx.logger('dsh-grok-workflow');
    const state = createActiveState();
    // Settings surface: the generated form comes from the `Config` schema this
    // module exports, so the fields a user edits in the Web UI are the fields the
    // run reads. Declaring it is intent, not enablement (auto defaults to true).
    if (declareSettingsSurface(ctx) === 'unsupported') {
        logger.warn('this runtime has a settings service without the automatic-page hook: configure this plugin through the profile patch instead');
    }
    // Route validation (D): fail the load on a provider or enumerated model that
    // the runtime does not have, because a silently ignored chain looks like
    // routing that works. Anything the runtime cannot judge becomes a warning.
    const routes = validateRoutes(ctx, config);
    for (const note of routes.notes)
        logger.warn(note);
    if (routes.errors.length > 0)
        throw new Error(routes.errors.join('; '));
    ctx.effect(() => async () => {
        await disposeActiveState(state);
    }, 'dsh-grok-workflow: active runs');
    ctx.systemPrompt.section({
        name: 'tool:grok-workflow',
        order: ctx.systemPrompt.getSectionOrder('TOOL_WORKFLOW'),
        text: [
            `Use ${config.toolName} for substantial objectives that benefit from decomposition, independent subtasks, explicit verification, and a bounded retry policy.`,
            'It plans first when no tasks are supplied, runs independent tasks concurrently, verifies every acceptance criterion with evidence, and reports completed/partial/failed honestly.',
            'Do not use it for a single trivial lookup or a task whose result cannot be checked.',
        ].join(' '),
    });
    const parameters = {
        objective: {
            type: 'string',
            required: true,
            description: 'The complete objective to plan, execute, verify, and report. Be specific about scope and desired deliverable.',
        },
        tasks: {
            type: 'array',
            description: 'Optional independent plan. When omitted, a planner child decomposes the objective. Caller tasks must not depend on each other.',
            items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    id: { type: 'string', description: 'Stable id; generated as task-N when omitted. Unique within the plan.' },
                    title: { type: 'string', required: true, description: 'Short task title.' },
                    objective: { type: 'string', required: true, description: 'Outcome this task must achieve.' },
                    expectedOutput: { type: 'string', required: true, description: 'Concrete expected output.' },
                    acceptanceCriteria: {
                        type: 'array',
                        required: true,
                        description: 'Non-empty testable acceptance checks; the verifier must cite evidence for each one.',
                        items: { type: 'string' },
                    },
                    context: { type: 'string', description: 'Optional context the worker needs.' },
                    constraints: {
                        type: 'array',
                        description: 'Optional constraints and non-goals.',
                        items: { type: 'string' },
                    },
                },
            },
        },
    };
    const tool = defineTool({
        name: config.toolName,
        description: [
            'Plan, execute, independently verify, retry within a bounded limit, and synthesize a complex objective.',
            'Use for multi-step work with independent subtasks and concrete acceptance checks.',
            'Returns a canonical report with status completed, partial, or failed; never infer success from a worker self-report.',
        ].join(' '),
        parameters,
        output: {
            schema: { type: 'json' },
            render: (_args, value) => [{
                    type: 'text',
                    text: renderReport(value),
                }],
        },
        timeoutMs: Math.min(config.timeoutMs + 60_000, 86_400_000),
        isConcurrencySafe: () => false,
        async execute(args, exec) {
            const { agent } = exec;
            if (!agent) {
                throw new Error(`${config.toolName} requires a calling agent (exec.agent was undefined)`);
            }
            const sessionHeader = agent.session?.header;
            const delegationDepth = sessionHeader?.delegationDepth ?? 0;
            if (sessionHeader?.origin === 'subagent' || delegationDepth > 0) {
                throw new Error(`${config.toolName} cannot be invoked from a subagent (delegation depth ${delegationDepth})`);
            }
            if (state.disposed) {
                throw new Error(`${config.toolName} is unavailable: plugin has been unloaded`);
            }
            if (exec.signal.aborted) {
                throw new Error(`${config.toolName} cancelled before start`);
            }
            const objective = args.objective.trim();
            if (!objective)
                throw new GrokWorkflowInputError('objective must be a non-empty string');
            if (objective.length > TASK_LIMITS.objectiveChars) {
                throw new GrokWorkflowInputError(`objective must be at most ${TASK_LIMITS.objectiveChars} characters`);
            }
            const callerTasks = normalizeCallerTasks(args.tasks, config.maxTasks);
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
            });
            return outcome.report;
        },
    });
    ctx.tools.register(tool);
    if (config.enforceGate) {
        installGate({ ctx, config, state, logger });
    }
}
//# sourceMappingURL=index.js.map