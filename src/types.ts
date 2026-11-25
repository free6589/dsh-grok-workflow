declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** A validated workflow report relayed by the plugin's own relay turn. */
    'grok-workflow': { kind: 'grok-workflow' }
  }
}

import type { ReplanDecision } from './replan.js'

/** Public and report types for dsh-grok-workflow. */

/** Final workflow status. These are the only values the plugin may report. */
export type FinalStatus = 'completed' | 'partial' | 'failed'

/**
 * One task's terminal status.
 *
 * `verified` and `failed` say the task ran; `blocked` says it did not run because a
 * task it depends on did not verify (see
 * `docs/knowledge/DESIGN-dynamic-steering-semantics.md` §1). A `blocked` task spends
 * no retry and is never counted as a verifier mistake, and no report that contains
 * one may be `completed`.
 */
export type TaskStatus = 'verified' | 'failed' | 'blocked'

/** A plan task supplied by the caller (all work is independent). */
export interface TaskInput {
  /** Stable task id. Generated as `task-N` when omitted. */
  id?: string
  title: string
  objective: string
  expectedOutput: string
  acceptanceCriteria: string[]
  context?: string
  constraints?: string[]
  /**
   * Paths this task writes (U-4), so overlapping tasks are serialized. Omit it
   * when unknown — the scheduler then treats the task as possibly writing
   * anything. `[]` declares a task that writes nothing.
   */
  writesPaths?: string[]
  /**
   * Task ids this task depends on (v0.13 DAG). A dependency must point at a task in
   * an earlier wave; the plan is rejected, naming the offending task, when it does
   * not. A task whose dependency did not verify is reported `blocked`, never run.
   */
  dependsOn?: string[]
}

/** Fully normalized task used inside the generated workflow. */
export interface NormalizedTask {
  id: string
  title: string
  objective: string
  expectedOutput: string
  acceptanceCriteria: string[]
  context: string
  constraints: string[]
  /**
   * Normalized write paths, or `null` when the plan did not say (U-4). `[]` means
   * the task declared that it writes nothing.
   */
  writesPaths: string[] | null
  /** Validated dependency ids; absent when the task declared none. */
  dependsOn?: string[]
  /**
   * 0-based wave this task belongs to. Only present on plans that declared waves;
   * a flat plan is one wave and carries no field (an absent value reads as 0).
   */
  wave?: number
  /**
   * Original goal id shared by every shard of a planner-failure fallback plan.
   * Absent for caller and planner plans, which have no synthetic shards.
   */
  originGoalId?: string
}

/**
 * How the mandatory-entry gate delivers the validated report to the user.
 *
 * `relay` opens a new turn with the plugin's own message source (the verified
 * default). `append` writes the answer directly after the turn closed; it is a
 * degraded, experimental switch (no stream/usage, non-zero exit on a blocked
 * turn) kept because the answer route is not finally decided (U-1).
 */
/** Front-desk routing mode (t52). */
export type TriageMode = 'full' | 'triage'

/** Front-desk classifier: pure rules, or rules with one model fallback for unclear cases. */
export type TriageClassifier = 'rules' | 'hybrid'

export type AnswerStrategy = 'relay' | 'append' | 'in-turn'

/**
 * Which agents the gate polices.
 *
 * `process` covers every agent in the process (blast radius: everything).
 * `preset` restricts it to sessions composed from `gatePreset`, which is the
 * smallest scope an external plugin can express (U-7).
 */
export type GateScope = 'process' | 'preset'

/** The five roles a workflow run assigns model routes to. */
export type RoleName = 'planner' | 'worker' | 'verifier' | 'synthesizer' | 'supervisor'

/**
 * One entry of an ordered fallback chain.
 *
 * `provider` is a subagent/provider route id registered in the deployment;
 * `model` is the model id that adapter understands. Both cross the workflow
 * boundary as plain data (`agent({provider, model})`), which is why the guest
 * never needs to know how a provider is resolved.
 */
export interface ModelRoute {
  /** Provider route id; omitted means "inherit the run's provider". */
  provider?: string
  /** Model id interpreted by that provider adapter. */
  model: string
  /**
   * Maximum child calls simultaneously in flight on this route. When full,
   * the call overflows to the next route in the chain instead of waiting on
   * this one. Absent means unlimited. A full route is not a failure: it
   * never advances the failure fallback, counts no attempt, and is recorded
   * in the trail (`skippedBusy` / `queuedMs`) instead of the failure fields.
   */
  maxInFlight?: number
}

/** Per-role ordered chains. An absent role inherits the run's route. */
export type RoleRouting = Partial<Record<RoleName, ModelRoute[]>>

/**
 * Who writes the final answer narrative (U-3).
 *
 * Policy values (`GrokWorkflowConfig.synthesis`): `deterministic` keeps the
 * current behaviour (the host renders the aggregated report); `model` adds one
 * bounded synthesizer call that writes a narrative summary on top of the same
 * aggregations; `layered` keeps the verified report as the only source of fact
 * and answers from a deterministic natural-language summary built in the
 * script, with one constrained polish call only when a synthesizer chain is
 * configured. Report values (`WorkflowReport.synthesis.mode`): `deterministic`
 * or `model` only — they say whether a polish call was in play, never the
 * policy. A layered run that polishes reports `model`, otherwise
 * `deterministic`.
 */
export type SynthesisPolicy = 'deterministic' | 'model' | 'layered'

export type SynthesisMode = 'deterministic' | 'model'

/**
 * Plugin configuration (also the DSH Schemastery schema shape).
 *
 * The settings page exposes 16 keys. A **removed** key (the 25 in
 * `REMOVED_CONFIG_KEYS`) is ignored and named once at load (D-155): the row activates,
 * the stored value takes effect as the fixed internal value it always did (see FIXED_*
 * in `src/config.ts`), and the load log plus the settings page say which line to delete.
 * Only a key this build never knew — a misspelling — is rejected as an unknown key
 * (R-06), with a closest-key suggestion.
 */
export interface GrokWorkflowConfig {
  /** Model-facing tool name. */
  toolName?: string
  /** Config-level default for the per-session grok-mode toggle (`off` = normal chat). */
  grokDefault?: 'on' | 'off'
  /** Per-role ordered model chains (planner/worker/verifier/synthesizer/supervisor). */
  roles?: RoleRouting
  /**
   * Single guardian model route (Q8), not a chain: the model that judges a
   * stalled child before the script kills it (`wait` extends by 5 minutes at
   * most twice, never past the run deadline; `kill` settles the call as a
   * failure the task's bounded retry continues). An empty/absent model disables
   * adjudication — a timed-out call then fails straight to retry, exactly as it
   * did before the guardian existed.
   */
  guardianModel?: ModelRoute
  /** Final-answer policy: `layered` (markdown direct output, default) or one model call. */
  synthesis?: SynthesisPolicy
  /** Configuration surface version; unknown/newer versions are refused. */
  configVersion?: number
  /** Maximum concurrent child agents per workflow run. Hard maximum 100. */
  maxConcurrency?: number
  /** Maximum tasks accepted from a caller or planner. Hard maximum 100. */
  maxTasks?: number
  /**
   * Run deadline in milliseconds. 0 = unlimited (no timer is armed).
   * No hard upper limit: any non-negative safe integer is accepted.
   */
  timeoutMs?: number
  /**
   * Per child-call stall budget in milliseconds. Default 120 minutes,
   * hard ceiling 120 minutes. `0` is not allowed: a call with no bound is
   * the stall the watchdog exists to stop, so an unusable value falls back
   * to the default. The run deadline still caps the whole run (rule B).
   */
  childTimeoutMs?: number
  /**
   * Mid-run replan switch (`false` by default, `DEFAULT_REPLAN`): keep every
   * message its own round, or open the main-session channel (`src/channel.ts`):
   * a message typed while a run is working is answered at once, and it either
   * stops that run (a bare "停"/"stop"/"取消") or joins its remaining plan at
   * the next wave boundary through `src/steering.ts` + `src/replan.ts`, so work
   * already in flight is neither cancelled nor redone. Editable on the settings
   * page ("自动接着干" group), same boolean-switch shape as `loopEnabled`.
   */
  replan?: boolean
  /**
   * Whether a rate-limited (429) route advances to the next model in the chain.
   * Default on; off names the six other classes explicitly (manual item Sec.3-2).
   */
  switchOnRateLimit?: boolean
  /**
   * Repeat-run switch. `false` (default) means one run per message; `true` lets a
   * repeat-run driver start another round when the previous one ended unfinished.
   */
  loopEnabled?: boolean
  /** Round cap for a repeat run. Hard maximum 100. */
  loopMaxRounds?: number
  /** Consecutive failed rounds that stop a repeat run. Hard maximum 20. */
  loopFailStreak?: number
  /**
   * Minutes to wait between rounds. `0` asks for the loop's floor: never under one
   * worst-case round, never under 60 minutes. Hard maximum 10080 (seven days).
   */
  loopIntervalMin?: number
  /**
   * Minutes between self-iteration heartbeats. `0` asks for the same floor as
   * `loopIntervalMin`. Hard maximum 10080 (seven days).
   */
  iterateIntervalMin?: number
  /**
   * Prompt template stored in the self-iteration heartbeat task. Whitespace-only
   * falls back to the built-in default; hard maximum 4000 characters, the same
   * bound the loop prompt has.
   */
  iterateTemplate?: string
  /**
   * Block intake (接单台子) switch. A load-time switch, not a live one: off means
   * the feature does not exist in this load — the six tools and the heartbeat
   * listener are never registered — so it cannot be a `volatile()` field. On by
   * default.
   */
  blockIntake?: boolean
}

/** Fully resolved configuration. Everything not listed here is a fixed internal value. */
export interface ResolvedConfig {
  toolName: string
  /** Config-level default for the per-session grok-mode toggle (`off` = normal chat). */
  grokDefault: 'on' | 'off'
  /** Effective per-role chains; an empty array means "inherit the run's route". */
  roles: Record<RoleName, ModelRoute[]>
  /**
   * The configured guardian route (Q8), or `undefined` when none is set: a run
   * without one adjudicates nothing and a timed-out call fails straight to the
   * task's bounded retry, exactly as it did before the guardian existed.
   */
  guardianModel?: ModelRoute
  synthesis: SynthesisPolicy
  /**
   * True when the load-time repair (`repairSynthesisInconsistency`) rewrote
   * `synthesis` so a recoverable synthesis/synthesizer mismatch could still
   * activate. Set by the caller after repairing, never by `resolveConfig`
   * itself (which keeps failing hard on the mismatch, R-06). Surfaced by
   * `describeResolvedConfig` as `synthesis=<mode> (repaired)`.
   */
  synthesisRepaired?: boolean
  maxConcurrency: number
  maxRetries: number
  maxTasks: number
  /** Run deadline in milliseconds. 0 = unlimited (no timer is armed). */
  timeoutMs: number
  /** Per child-call stall budget in milliseconds (default 120 min, ceiling 120 min). */
  childTimeoutMs: number
  /** Mid-run replan switch (default on, settings page has a visible switch): merge new demands at a wave boundary. */
  replan: boolean
  /**
   * Whether a rate-limited (429) route advances to the next model in the chain.
   * Default on (the built-in policy); off names the six other classes explicitly,
   * so the 429 keeps its route and the task's bounded retry decides.
   */
  switchOnRateLimit: boolean
  /**
   * Repeat-run surface, resolved and validated. These are carried here so a
   * repeat-run driver reads them from exactly one shape; `resolveConfig` does not
   * start, schedule or stop any round itself.
   */
  loopEnabled: boolean
  loopMaxRounds: number
  loopFailStreak: number
  loopIntervalMin: number
  /** Self-iteration heartbeat interval, resolved like `loopIntervalMin`. */
  iterateIntervalMin: number
  /** Self-iteration heartbeat prompt template, resolved to a bounded string. */
  iterateTemplate: string
  /**
   * Block intake (接单台子) switch. A load-time switch, not a live one: off means
   * the feature does not exist in this load — the six tools and the heartbeat
   * listener are never registered — so it is not a `volatile()` field. On by
   * default.
   */
  blockIntake: boolean
  configVersion: number
}

/** One evidence item confirmed by a verifier. */
export interface ConfirmedEvidence {
  taskId: string
  criterion: string
  evidence: string
}

/** One incomplete item in the final report. */
export interface IncompleteItem {
  taskId: string
  reason: string
  /** Failure kind of the task that produced this item (G-4). */
  category?: FailureCategory
}

/** One workflow-level error. */
export interface ReportError {
  phase: string
  message: string
  /** Failure kind, so infrastructure faults are not read as quality failures. */
  category?: FailureCategory
}

/** One unresolved uncertainty reported by a worker or verifier. */
export interface UncertaintyItem {
  taskId: string
  text: string
}

/** Structured execution result returned by a worker child. */
export interface ExecutionResult {
  summary: string
  status: 'completed' | 'partial' | 'failed'
  deliverables: { description: string; locator: string }[]
  evidence: { claim: string; source: string }[]
  testsRun: { command: string; status: 'passed' | 'failed' | 'not_run'; detail: string }[]
  filesChanged: string[]
  uncertainties: string[]
}

/** Per-criterion verifier result. */
export interface CriterionVerification {
  criterion: string
  met: boolean
  evidence: string
}

/** Structured verifier result returned by a verifier child. */
export interface VerificationResult {
  verdict: 'pass' | 'fail'
  criteria: CriterionVerification[]
  checkedEvidence: { kind: string; locator: string; finding: string }[]
  commandsRun: { command: string; status: 'passed' | 'failed' | 'not_run'; detail: string }[]
  issues: string[]
  confidence: 'high' | 'medium' | 'low'
}

/**
 * Failure classes a single child call can be mapped to.
 *
 * The first six are *route* failures: another model may succeed, so the chain
 * advances. `task-failed` and `verification-failed` are content failures: a
 * different model would see the same evidence, so the same route is retried.
 * `budget-exhausted` and `unknown` are reported honestly and never silently
 * treated as success.
 */
export type FailureClass =
  | 'rate-limit'
  | 'server-error'
  | 'connection'
  | 'timeout'
  | 'model-unavailable'
  | 'format-error'
  | 'task-failed'
  | 'verification-failed'
  | 'agent-start-failed'
  | 'budget-exhausted'
  /**
   * The child was stopped on purpose: the caller cancelled the run, or the plugin
   * was unloaded underneath it (t14). Not a form error and not a provider fault,
   * so a reader must not be told to resend or to switch models.
   */
  | 'cancelled'
  | 'unknown'

/**
 * Who has to fix a failure (G-4). `infrastructure` = the model service, the
 * network or a deadline failed, so a retry, another route or a later run may
 * succeed; `quality` = the work or its verification fell short, so the same
 * route must retry with the same evidence; `configuration` = caps, options or
 * schemas are wrong, so no retry can help; `unknown` = unclassified.
 */
export type FailureCategory =
  | 'infrastructure'
  | 'quality'
  | 'configuration'
  /** Stopped on purpose: the caller cancelled, or the plugin was unloaded (t14). */
  | 'cancelled'
  | 'unknown'

/** One classified failure attached to an attempt or a route switch. */
export interface AttemptFailure {
  class: FailureClass
  /** Redacted, bounded human-readable reason. */
  reason: string
  /** Failure kind; absent only in reports produced before G-4. */
  category?: FailureCategory
}

/** One recorded child call: the model, its chain position, and the outcome. */
export interface RouteTrailEntry {
  role: RoleName
  /** 0-based position in the role's chain; 0 when the role inherits the route. */
  chainIndex: number
  /** Route label (`provider/model`, or `inherit`). */
  route: string
  /** 1-based task attempt this call belongs to (0 for run-level roles). */
  attempt: number
  /**
   * The plan task this call was placed for, on the three task-scoped roles
   * (worker, verifier, supervisor). Absent on the run-level roles (planner,
   * synthesizer) and on reports produced before it existed.
   *
   * A run places many calls per task — worker, verifier, supervisor, each
   * possibly across several routes and attempts — so without the task id a
   * `worker … failed` row left the reader to work out whose call it was from the
   * role and the attempt number alone.
   */
  taskId?: string
  outcome: 'ok' | 'failed'
  failureClass?: FailureClass
  reason?: string
  /**
   * Routes skipped as full when this call was placed (overflow, not failure).
   * Absent when nothing was skipped.
   */
  skippedBusy?: string[]
  /** Milliseconds this call waited for a full route to drain. Absent when it did not wait. */
  queuedMs?: number
}

/**
 * One route the run stopped preferring, after it failed the same transport
 * family on consecutive calls (`src/script.ts` route health).
 *
 * Evidence, not a verdict: a dead route is moved behind every live route and is
 * still tried as a last candidate, and the row disappears the moment that route
 * answers again. Only timeout / connection / server-error / rate-limit can kill
 * a route — a credential refusal, a child that never submitted, and an engine
 * that never started a child all say nothing about the transport.
 */
export interface DeadRouteEntry {
  /** Route label (`provider/model`). Never `inherit`: an inherited call has no chain position to prefer. */
  route: string
  /** The transport family that crossed the threshold. */
  class: FailureClass
  /** Consecutive counted failures at the moment it crossed (at least `HARD_LIMITS.deadRoute.threshold`). */
  streak: number
}

/** One attempt's observed result. */
export interface AttemptReport {
  attempt: number
  execution: ExecutionResult | null
  verification: VerificationResult | null
  passed: boolean
  /** Route that produced the attempt, when routing is configured. */
  route?: string
  /** True when this attempt's execution arrived via the same-attempt resubmit (A), not a fresh retry. */
  resubmitted?: boolean
  /**
   * True when a judging leg (verifier or supervisor) was re-fired inside this
   * attempt after it died of a transport failure (timeout, connection,
   * server-error, or the rate-limit family the switch policy counts), so the
   * retry policy never had to re-run the worker.
   *
   * Set whatever the re-fire answered: `passed` says how the attempt ended and
   * `failure` carries a re-fire that was lost as well.
   */
  judgeRetried?: boolean
  /** Classified failure of this attempt, when it failed. */
  failure?: AttemptFailure
  error?: string
}

/** Per-task report. */
export interface TaskReport {
  id: string
  title: string
  objective: string
  expectedOutput: string
  acceptanceCriteria: string[]
  context: string
  constraints: string[]
  /** Declared write paths echoed for audit (U-4); `null` = the plan did not say. */
  writesPaths: string[] | null
  /** Shared original-goal id for planner-failure fallback shards. */
  originGoalId?: string
  status: TaskStatus
  attempts: AttemptReport[]
  error?: string
}

/** Planning provenance. */
export interface PlanReport {
  source: 'caller' | 'planner' | 'fallback' | 'unavailable'
  tasks: NormalizedTask[]
  /**
   * The plan as waves of task ids, in execution order (v0.13 DAG). Absent on a
   * report produced before waves existed; a single-wave plan carries one inner
   * array. Every plan task appears exactly once, and in plan order.
   */
  waves?: string[][]
  /**
   * Plan version the run ended at (1 = never replanned). Absent on reports produced
   * before mid-run replan existed; a version above 1 means at least one boundary
   * merged a new demand into the unstarted waves.
   */
  version?: number
  /**
   * One row per wave boundary the replan channel visited, in order. A `rejected`
   * row changes nothing (the run kept its old plan); an `applied` row names the
   * tasks it added, updated, removed or re-ordered. Absent when the channel never
   * ran.
   */
  replans?: ReplanDecision[]
  error?: string
  /** Why the plan is not the planner's own (planner fault, with a category). */
  failure?: AttemptFailure | null
}

/** Final canonical tool result. */
export interface WorkflowReport {
  schemaVersion: 'grok-workflow/v1'
  status: FinalStatus
  objective: string
  plan: PlanReport
  tasks: TaskReport[]
  confirmed: ConfirmedEvidence[]
  incomplete: IncompleteItem[]
  errors: ReportError[]
  uncertainties: UncertaintyItem[]
  /** Every recorded child call, in call order (bounded, redacted). */
  routes: RouteTrailEntry[]
  /**
   * Routes the run stopped preferring, in the order they died. Absent when the
   * run never lost a route (and on reports produced before the field existed),
   * so a healthy report carries the same shape it always did.
   */
  deadRoutes?: DeadRouteEntry[]
  /** Effective chains, for transparency about what was configured. */
  routing: Record<RoleName, string[]>
  /** Final-answer strategy and its outcome. */
  synthesis: {
    mode: SynthesisMode
    error?: string
    summary?: string
    /**
     * The summary gate's own record, when a model draft was produced.
     *
     * Manual item Sec.3-3 ("汇总环节也要「检查 + 复核」，不能只汇总一次"): the two
     * gates always ran, but nothing said so, so a reader could not tell a checked
     * summary from a single-shot one. The line names each stage's verdict and how
     * many drafts it took, e.g. `check=pass verify=pass drafts=1`.
     */
    review?: string
  }
  limits: {
    maxConcurrency: number
    maxRetries: number
    maxTasks: number
    maxTotalAgents: number
    /** The deadline the run actually ran under (t47: it used to live only in memory). */
    timeoutMs?: number
    /** The per-call stall budget the run actually ran under. */
    childTimeoutMs?: number
  }
  /**
   * Why the run stopped, when it did not complete cleanly.
   *
   * The run has always known this (`src/run.ts` separates a plugin unload from a
   * caller stop and from a deadline), but it only lived in the error message, so
   * the presentation layer had to guess the cause back out of prose. Recording it
   * as data is what lets the report say "the plugin was unloaded underneath the
   * run, not a timeout" without parsing its own wording. Absent on a run that
   * finished on its own terms, and on reports produced before this field existed.
   */
  stop?: { cause: StopCause }
  /**
   * Guard (liveness supervisor) settlement: how many findings it recorded and
   * whether it terminated any child. Recorded by the run, rendered as the fixed
   * tail line so "the guard watched and did not kill anything" is readable
   * rather than assumed. Absent on reports produced before this field existed.
   */
  guard?: { findings: number; terminated: number }
}

/**
 * Why a run stopped, in the vocabulary the report and the human block speak.
 *
 * - `unloaded` — the plugin was disposed (bundle unmounted, upgrade, restart)
 *   while the run was in flight. Nobody in the conversation asked for this.
 * - `caller` — the caller stopped the run on purpose.
 * - `deadline` — the run's own deadline fired.
 * - `engine` — the workflow engine failed under the run.
 */
export type StopCause = 'unloaded' | 'caller' | 'deadline' | 'engine'
