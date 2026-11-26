import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { DEFAULT_ITERATE_TEMPLATE, FIXED_HISTORY_CHARS, FIXED_HISTORY_TURNS, FIXED_UNLOAD_DRAIN_MS,
  FIXED_UNLOAD_DRAIN_QUIET_MS, FIXED_UNLOAD_DRAIN_STEP_MS, MAX_TIMER_DELAY_MS, createConfigReader, describeResolvedConfig,
  limitOverrunWarning, removedKeyWarning, repairLimitOverruns, repairSynthesisInconsistency, resolveConfig, snapshotConfig,
  takeLimitOverruns, takeRemovedKeys } from './config.js'
import { describeSurface, validateRoutes } from './settings.js'
import { carryoverBounds, carryoverForSession } from './carryover.js'
import { registerGrokCommand } from './command.js'
import { installHeartbeatBrakes } from './block/brakes.js'
import { registerBlockTools } from './block/tools.js'
import { installForceTeam } from './force-team.js'
import { installHeartbeatListen } from './heartbeat-listen.js'
import { createLoopBrakes } from './loop-brakes.js'
import { ITERATE_TASK_TITLE, createLoopService, loopPolicyFromConfig, scheduleServiceOf } from './loop.js'
import { installLoop } from './loop-surface.js'
import type { LoopHostContext } from './loop-surface.js'
import { installModeRoute } from './mode-surface.js'
import type { ModeHostContext } from './mode-surface.js'
import { installConfigNoticesRoute } from './config-notices-surface.js'
import type { ConfigNoticesHostContext } from './config-notices-surface.js'
import { installShutdownProbe } from './records.js'
import { normalizeCallerTasks, GrokWorkflowInputError, TASK_LIMITS } from './input.js'
import { renderReport } from './report.js'
import { STEERING_TOOL_NAME, closeAllSteering, pullSteering } from './steering.js'
import { installSteeringInbox } from './steering-inbox.js'
import { redactError } from './redact.js'
import { createActiveState, disposeActiveState, runWorkflow } from './run.js'
import type { ActiveState } from './run.js'
import type { GrokWorkflowConfig, ResolvedConfig, TaskInput, WorkflowReport } from './types.js'
import { installUpdateRoute } from './update-surface.js'
import type { UpdateHostContext } from './update-surface.js'

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
  const reader = createConfigReader(rawConfig as Record<string, unknown>)
  // t47: every effective-configuration change is announced once. The t46 round could
  // not tell a settings save from a profile-patch edit — and could not read the
  // deadline the run actually used — because both lived only in memory.
  //
  // P1 (synthesis fallback) and B07 (stored limit over the hard maximum): only those
  // recoverable shapes are repaired at load, and on every later read too, so the tool
  // keeps working after a bad settings save or a stale pre-v0.9.0 patch. Everything
  // else still throws (R-06), and the cap itself is never widened.
  //
  // The limit half is normally repaired *earlier* than this function: the host
  // validates the profile patch against the exported `Config` schema before the plugin
  // is called, so `Config` clamps the overrun and leaves a note here (a schema has no
  // logger). Announcing that note is what makes the repair visible, and the map below
  // is per load, so a document the host re-parses on every settings read cannot turn
  // one overrun into a warning per message.
  const announcedOverruns = new Set<string>()
  const announceOverruns = (): void => {
    for (const overrun of takeLimitOverruns()) {
      const key = `${overrun.field}:${overrun.stored}`
      if (announcedOverruns.has(key)) continue
      announcedOverruns.add(key)
      logger.warn(limitOverrunWarning(overrun))
    }
  }
  // D-155: a patch that still carries a removed key (`mode`, `legacyGate`, …) loads, and
  // its leftovers are named once instead of taking the row down with them. Same shape as
  // the overruns above and for the same reason: the check runs inside `resolveConfig`,
  // which the host may reach before `apply()` and which has no logger, and a read happens
  // per message — so the buffer records, this drains, and the set keeps one line per key.
  const announcedRemovedKeys = new Set<string>()
  const announceRemovedKeys = (): void => {
    for (const key of takeRemovedKeys()) {
      if (announcedRemovedKeys.has(key)) continue
      announcedRemovedKeys.add(key)
      logger.warn(removedKeyWarning(key))
    }
  }
  let configSignature = ''
  const readConfig = (): ResolvedConfig => {
    announceOverruns()
    try {
      const next = reader.read()
      // The leftover keys are recorded *by* this read (the check runs inside
      // `resolveConfig`), so this drain sits after it, unlike the overruns' which the
      // schema clamp fills before `apply()` is ever called.
      announceRemovedKeys()
      const signature = describeResolvedConfig(next)
      if (signature !== configSignature) {
        configSignature = signature
        logger.info?.(`configuration in effect: ${signature}`)
      }
      return next
    } catch (error) {
      const snap = snapshotConfig(rawConfig as Record<string, unknown>)
      // Two load-time repairs, in a fixed order so a config carrying both defects is
      // repaired by one round instead of needing two restarts. Both are the D-031
      // "configurable mistake must not remove the page you would fix it on" path; the
      // repairs themselves never validate, and anything else still throws (R-06).
      // The limit repair is the backstop for a caller whose config never met the
      // schema (a programmatic `apply()`, a stale `lib/`): on the host path the schema
      // has already clamped, so this branch finds nothing to do there.
      const synthesis = repairSynthesisInconsistency(snap)
      const limits = repairLimitOverruns(synthesis.repaired)
      const warnings = [...synthesis.warnings, ...limits.warnings]
      if (warnings.length === 0) throw error
      // A repaired shape may still hide another defect: resolving it must succeed
      // before any warning is emitted, otherwise the non-repairable error stays a
      // hard fail and no "repaired" line is ever logged for a config that cannot run.
      const fixed = resolveConfig(limits.repaired)
      // `limits.repaired` still carries the leftover removed keys, so this resolve
      // recorded them again: announce them here as well, or a config that needed a
      // repair would keep its leftover note until some later read.
      announceRemovedKeys()
      if (synthesis.warnings.length > 0) fixed.synthesisRepaired = true
      for (const warning of synthesis.warnings) logger.warn(warning)
      // The limit half is announced through the same set as the schema clamp (B04):
      // `repairLimitOverruns` only *records* what it clamped, so the wording is the
      // schema path's own sentence and a read that keeps landing here — this branch
      // runs once per message while another defect keeps failing — warns once, not
      // once per message. `limits.warnings` still decides that a repair happened.
      announceOverruns()
      const signature = describeResolvedConfig(fixed)
      if (signature !== configSignature) {
        configSignature = signature
        logger.info?.(`configuration in effect: ${signature}`)
      }
      return fixed
    }
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
    // The steering queues die with the run; an unload closes them explicitly so a
    // reloaded plugin cannot hand an old token to a new boundary child.
    closeAllSteering()
    // The drain window is stated here, at the plugin boundary, because this is
    // where "an unload is cheap" used to be decided: an in-process reload cut a
    // ten-minute child call that was about to report. `disposeActiveState` still
    // owns the mechanics and reads the same fixed values by default; passing them
    // explicitly keeps the policy visible to whoever reads the entry point, and a
    // `kill -9` is unaffected either way.
    await disposeActiveState(state, {
      logger,
      drain: {
        maxMs: FIXED_UNLOAD_DRAIN_MS,
        quietMs: FIXED_UNLOAD_DRAIN_QUIET_MS,
        stepMs: FIXED_UNLOAD_DRAIN_STEP_MS,
      },
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

  // `/grok [on|off]`: the per-session toggle command. Lazy `commands` mount,
  // exactly like plan-mode's `/plan` — interactive UIs only; headless surfaces
  // compose no commands service and stay governed by `grokDefault`.
  registerGrokCommand(ctx, logger)

  const parameters = {
    objective: {
      type: 'string' as const,
      required: true as const,
      description: `The complete objective to plan, execute, verify, and report. At most ${TASK_LIMITS.objectiveChars} characters. Be specific about scope and desired deliverable.`,
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
      render: (_args, value) => {
        // T4: diagnostics always off — the relay text carries the human block,
        // the PTC render path renders the same report without the ledger.
        void readConfig
        // D-132: a run that did not complete comes back with its complete
        // machine record attached (`src/report-audit.ts`), so the caller of a
        // failed or partial run holds every field the record captured. A
        // completed run's text stays exactly what it is today — the audit tail
        // is an addition for the reader who has something to investigate, not
        // a new shape for every answer.
        const report = value as unknown as WorkflowReport
        return [{
          type: 'text' as const,
          text: renderReport(report, { auditTrail: report.status !== 'completed' }),
        }]
      },
    },
    // DSH `defineTool({timeoutMs})` requires a positive finite number and throws
    // otherwise, so an unlimited (0) or overflow (> MAX_TIMER_DELAY_MS) deadline
    // omits the field entirely (no DSH-side deadline); otherwise the tool gets
    // the run deadline plus 60 s of headroom, never past the setTimeout ceiling.
    ...config.timeoutMs <= 0 || config.timeoutMs > MAX_TIMER_DELAY_MS
      ? {}
      : { timeoutMs: Math.min(config.timeoutMs + 60_000, MAX_TIMER_DELAY_MS) },
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
      // Cross-round carry-over (v0.5): a tool call is also a new round inside the
      // session, so it gets the same bounded digest of the earlier rounds that a
      // message-driven run gets. Empty when the session has none.
      const carryover = carryoverForSession(agent.session, carryoverBounds({ historyTurns: FIXED_HISTORY_TURNS, historyChars: FIXED_HISTORY_CHARS }))
      // L2 live steering: a demand that arrives while this run works is resolved by
      // the conversation it arrived in (`grok_steer` looks the queue up by session
      // id), and this is the only frame that knows which conversation the call
      // belongs to. The run mints the token, hands it to the boundary planner and
      // closes the queue when it settles; the `replan` switch still decides whether
      // a channel exists at all.
      const steeringSessionId = String(agent.session?.id ?? '').trim()
      const outcome = await runWorkflow({
        ctx,
        config: live,
        state,
        logger,
        agent,
        objective,
        signals: [exec.signal],
        ...callerTasks === undefined ? {} : { callerTasks },
        ...carryover.digest === '' ? {} : { carryover: carryover.digest },
        ...steeringSessionId === '' ? {} : { steering: { sessionId: steeringSessionId } },
        failureMode: 'throw',
      })
      return outcome.report as never
    },
  })

  ctx.tools.register(tool)

  // Mid-run replan channel (L2): the boundary planner child of a running workflow
  // pulls the demands queued for its run with this tool. The run token is the only
  // credential: an unknown token answers an empty list, so a stale child costs one
  // call instead of the run. Registered always, inert until a run with `replan` on
  // opens a queue.
  const replanTool = defineTool({
    name: STEERING_TOOL_NAME,
    description: [
      'Pull the user demands queued for the running plan identified by the token.',
      'Only a workflow boundary planner should call this, once, with the run token from its prompt.',
    ].join(' '),
    parameters: {
      token: {
        type: 'string' as const,
        required: true as const,
        description: 'Run token quoted in the boundary prompt. Consumes every queued demand exactly once.',
      },
    },
    output: {
      schema: { type: 'json' as const },
      render: (_args, value) => [{ type: 'text' as const, text: JSON.stringify(value) }],
    },
    isConcurrencySafe: () => true,
    async execute(args) {
      return pullSteering(args.token) as never
    },
  })
  ctx.tools.register(replanTool)

  // Mid-run steering entrance (D-162): the message that arrives while this session's
  // workflow is working is queued for that run by the Host's own inbox event, not by the
  // turn that is busy. It opens nothing — no live queue means the message is ignored —
  // and it leaves the message itself in the inbox, so the same words are still answered
  // as an ordinary turn afterwards. Disposed with the rest of the plugin surface.
  ctx.effect(() => installSteeringInbox({ ctx, logger }))

  // Repeat-run driver (Host loop service). A loop is one durable Schedule rrule task
  // whose delivery target is the same session; this plugin owns no timer, so an open
  // loop survives a plugin reload and an unload deletes it (no ownerless work). The
  // policy is read at open time, so a settings edit reaches the next switch flip rather
  // than the next restart; `loopEnabled` stays the deployment default for a future
  // automatic driver, and the composer switch is the session's explicit override.
  const loop = createLoopService({
    schedule: () => scheduleServiceOf(ctx),
    logger,
    policy: () => {
      const live = readConfig()
      return loopPolicyFromConfig(live.timeoutMs, live.loopIntervalMin, live.loopMaxRounds, live.loopFailStreak)
    },
  })

  // Self-iteration driver: a second service instance over the same Schedule, bound to
  // the `RSI heartbeat` slot instead of the loop slot, so the two switches can never
  // adopt, charge or delete each other's row. Its prompt is the editable template
  // persisted in the profile (`iterateTemplate`), so a settings edit reaches the next
  // open; a whitespace-only template falls back to the built-in default. No routing
  // marker and no unload sweep: these deliveries route as ordinary schedule messages
  // and the beat is the repository's own (docs/knowledge/HEARTBEATS.md §1).
  const iterate = createLoopService({
    schedule: () => scheduleServiceOf(ctx),
    logger,
    identity: {
      title: ITERATE_TASK_TITLE,
      defaultPrompt: () => {
        const template = readConfig().iterateTemplate.trim()
        return template === '' ? DEFAULT_ITERATE_TEMPLATE : template
      },
    },
    policy: () => {
      const live = readConfig()
      return loopPolicyFromConfig(live.timeoutMs, live.iterateIntervalMin, live.loopMaxRounds, live.loopFailStreak)
    },
  })

  installLoop({ ctx: ctx as unknown as LoopHostContext, loop, logger, iterate })

  // The composer's master switch rides the same durable mode record `/grok`
  // writes: a browser click has no commanding agent, so it gets one exact route
  // (`POST /grok-workflow/mode`) instead of a second store. `status` reports the
  // live `grokDefault` fallback, which is what a session with no record reads — the
  // default is stated once, never copied into the button.
  // D-155, page half: the settings page cannot read a removed key out of
  // `settings/describe` — the Host projects `user` through the namespace's schema, and a
  // removed key is by definition not in it. So the list travels over the plugin's own
  // read-only route, read off the same per-load set the load log drains (reading, never
  // draining: the warning must still be announced once, whatever the page does).
  installConfigNoticesRoute({
    ctx: ctx as unknown as ConfigNoticesHostContext,
    leftovers: () => [...announcedRemovedKeys],
    logger,
  })

  installModeRoute({
    ctx: ctx as unknown as ModeHostContext,
    fallback: () => {
      try {
        return readConfig().grokDefault === 'on'
      } catch {
        // A broken live edit must not make "is the workflow on?" unanswerable:
        // the load-time snapshot is the same fallback a session with no record reads.
        return config.grokDefault === 'on'
      }
    },
    logger,
  })

  // The settings card's upgrade button needs a Host verb: a browser cannot run the
  // `dsh plugin add` line the card prints. The install spec is built host-side from this
  // repository's own release tag, so the browser can never name a package; the route is
  // mounted inside `effect`, so an unload withdraws it with the rest of the surface.
  installUpdateRoute({ ctx: ctx as unknown as UpdateHostContext, logger })

  // The narrow heartbeat listener is the only brake owner, so it is installed
  // unconditionally — outside the intake's own switch. Tying it to `blockIntake` would
  // leave a profile with the intake off and no owner of a beat at all: a stopped loop
  // would keep running with nobody left to stop it. It goes in first so it is the
  // outermost `agent/pre-step` listener: it answers `reject` without calling `next()`,
  // so a beat it stops never reaches the intake's own observer.
  installHeartbeatListen({
    ctx,
    logger,
    enabled: true,
    config,
    readConfig,
    loop: createLoopBrakes({
      schedule: () => scheduleServiceOf(ctx as unknown as { get?: (name: string) => unknown }),
      logger,
      disposed: () => state.disposed,
    }),
  })

  // Forced team routing (强制路由): a keyword in the user's message buys a fixed hard
  // instruction on the model-facing text, and a turn that then answers alone is
  // refused once. A load-time switch like `blockIntake` — off registers no listener,
  // which is what makes "off is the pre-feature chain" a testable claim
  // (`test/force-team.spec.ts`). Installed after the narrow heartbeat listener, so a
  // beat the brakes stopped never reaches this one; the intake's observer goes in
  // after it, and it only ever observes what it is handed (`src/block/brakes.ts`).
  installForceTeam({
    ctx,
    logger,
    enabled: config.forceTeamRouting === true,
    config,
    readConfig,
  })

  // Block intake (接单台子): a load-time switch, read from the load-time snapshot
  // because every half is a registration — the six tools and the observer — and a
  // registration cannot appear without a reload. It is on by default; off registers
  // **nothing from the intake**: no tool name and no observer, which is what makes
  // "off is the intake-free tree" a testable claim instead of a promise
  // (`test/block-flag.spec.ts`).
  //
  // Listener counts on `agent/pre-step`, by registration: the narrow heartbeat
  // listener always (1); the forced-team route when `forceTeamRouting` is on (2, the
  // default); the intake's own observer when `blockIntake` is on (3, the default). So
  // a default load carries three listeners, an intake-off load two and a load with
  // both switches off one, and nothing else in this plugin registers one.
  if (config.blockIntake === true) {
    // The intake's own observer records which blocks a beat found open. It writes its
    // own file (`heartbeats.jsonl`) and the narrow listener writes
    // `heartbeats-listen.jsonl`: two files, one writer each, so one beat is one line in
    // each and "how many beats arrived" stays answerable.
    installHeartbeatBrakes({ ctx, logger, enabled: true })
    registerBlockTools({ ctx, logger, readConfig, state })
  }
}
