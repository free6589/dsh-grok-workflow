declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** A validated workflow report relayed by the mandatory-entry gate. */
    'grok-workflow': { kind: 'grok-workflow' }
  }
}

/** Public and report types for dsh-grok-workflow. */

/** Final workflow status. These are the only values the plugin may report. */
export type FinalStatus = 'completed' | 'partial' | 'failed'

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

export type AnswerStrategy = 'relay' | 'append' | 'in-turn'

/**
 * Which agents the gate polices.
 *
 * `process` covers every agent in the process (blast radius: everything).
 * `preset` restricts it to sessions composed from `gatePreset`, which is the
 * smallest scope an external plugin can express (U-7).
 */
export type GateScope = 'process' | 'preset'

/** The four roles a workflow run assigns model routes to. */
export type RoleName = 'planner' | 'worker' | 'verifier' | 'synthesizer'

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
}

/** Per-role ordered chains. An absent role inherits the run's route. */
export type RoleRouting = Partial<Record<RoleName, ModelRoute[]>>

/**
 * Who writes the final answer narrative (U-3).
 *
 * `deterministic` keeps the current behaviour: the host renders the aggregated
 * report. `model` adds one bounded synthesizer call that writes a narrative
 * summary on top of the same aggregations; it falls back to the deterministic
 * text when the call fails, so it can never lose verified content.
 */
export type SynthesisMode = 'deterministic' | 'model'

/** Plugin configuration (also the DSH Schemastery schema shape). */
export interface GrokWorkflowConfig {
  /** Model-facing tool name. */
  toolName?: string
  /** Route every top-level user message through the workflow (mandatory entry). */
  enforceGate?: boolean
  /**
   * Fail loading instead of degrading when the runtime exposes no
   * `agent/pre-step` hook. Default false: a missing hook only warns.
   */
  gateRequired?: boolean
  /** Front-desk routing mode (t52). */
  mode?: TriageMode
  /** Whether the front desk may ask instead of guessing an unclear tier. */
  triageAsk?: boolean
  /** Route for the single call a chat or fast answer spends (`model` or `provider/model`). */
  triageModel?: string
  /** Per-role ordered model chains (planner/worker/verifier/synthesizer). */
  roles?: RoleRouting
  /** Final-answer strategy (U-3): deterministic aggregation, or one model call. */
  synthesis?: SynthesisMode
  /**
   * Answer production strategy (U-1). `in-turn` is the default because it is
   * the only one that survives a one-shot app (G-18/F9); `relay` and `append`
   * remain selectable for long-lived surfaces.
   */
  answerStrategy?: AnswerStrategy
  /** Enforcement scope (U-7): whole process, or only one agent preset. */
  gateScope?: GateScope
  /** Preset id that owns the gate when `gateScope` is `preset`. */
  gatePreset?: string
  /** Prior conversation turns forwarded as context for follow-up messages. */
  historyTurns?: number
  /** Character budget for the forwarded conversation history. */
  historyChars?: number
  /** Maximum user messages in flight or waiting per agent; further ones are refused. */
  maxQueuedMessages?: number
  /**
   * Which failure classes advance a role's fallback chain. Empty (default) uses
   * the built-in policy: every transport/model class switches, content failures
   * never do. Setup faults (budget, schema, options) never switch regardless.
   */
  switchOn?: FailureClass[]
  /** Write the routing/delivery ledger into the session (default true). */
  recordRuns?: boolean
  /**
   * Write the Web GUI's workflow-run progress events (one node, one member row
   * per subagent). Presentation only: the run is identical either way.
   */
  showProgress?: boolean
  /** Maximum ledger entries kept per run (hard maximum 256). */
  recordLimit?: number
  /** Configuration surface version; unknown/newer versions are refused. */
  configVersion?: number
  /** Maximum concurrent child agents per workflow run. Hard maximum 6. */
  maxConcurrency?: number
  /** Maximum retries per task after the initial attempt. Hard maximum 3. */
  maxRetries?: number
  /** Maximum tasks accepted from a caller or planner. Hard maximum 12. */
  maxTasks?: number
  /** Overall workflow deadline in milliseconds. */
  timeoutMs?: number
  /** Maximum concurrent workflow runs per session. Hard maximum 4. */
  maxActiveRuns?: number
  /** Maximum concurrent workflow runs across every session in the process. Hard maximum 16. */
  maxActiveRunsTotal?: number
  /** Optional DSH subagent provider override; defaults to the engine/provider default. */
  subagentProvider?: string
}

/** Fully resolved limits. */
export interface ResolvedConfig {
  toolName: string
  enforceGate: boolean
  gateRequired: boolean
  gateScope: GateScope
  gatePreset?: string
  answerStrategy: AnswerStrategy
  /**
   * Front-desk mode (t52): `full` keeps the pre-t52 rule that every message runs
   * the team; `triage` routes each message to chat / fast / team / ask.
   */
  mode: TriageMode
  /** Whether the front desk may ask instead of guessing a tier. */
  triageAsk: boolean
  /** Optional route for the single call a chat or fast answer spends. */
  triageModel?: ModelRoute
  /** Effective per-role chains; an empty array means "inherit the run's route". */
  roles: Record<RoleName, ModelRoute[]>
  synthesis: SynthesisMode
  historyTurns: number
  historyChars: number
  maxQueuedMessages: number
  maxConcurrency: number
  maxRetries: number
  maxTasks: number
  timeoutMs: number
  maxActiveRuns: number
  maxActiveRunsTotal: number
  subagentProvider?: string
  /** Effective switching policy; empty means the built-in policy. */
  switchOn: FailureClass[]
  recordRuns: boolean
  showProgress: boolean
  recordLimit: number
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
  outcome: 'ok' | 'failed'
  failureClass?: FailureClass
  reason?: string
}

/** One attempt's observed result. */
export interface AttemptReport {
  attempt: number
  execution: ExecutionResult | null
  verification: VerificationResult | null
  passed: boolean
  /** Route that produced the attempt, when routing is configured. */
  route?: string
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
  status: 'verified' | 'failed'
  attempts: AttemptReport[]
  error?: string
}

/** Planning provenance. */
export interface PlanReport {
  source: 'caller' | 'planner' | 'fallback' | 'unavailable'
  tasks: NormalizedTask[]
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
  /** Effective chains, for transparency about what was configured. */
  routing: Record<RoleName, string[]>
  /** Final-answer strategy and its outcome. */
  synthesis: { mode: SynthesisMode; error?: string; summary?: string }
  limits: {
    maxConcurrency: number
    maxRetries: number
    maxTasks: number
    maxTotalAgents: number
    /** The deadline the run actually ran under (t47: it used to live only in memory). */
    timeoutMs?: number
  }
}
