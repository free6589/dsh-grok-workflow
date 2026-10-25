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
}

/**
 * How the mandatory-entry gate delivers the validated report to the user.
 *
 * `relay` opens a new turn with the plugin's own message source (the verified
 * default). `append` writes the answer directly after the turn closed; it is a
 * degraded, experimental switch (no stream/usage, non-zero exit on a blocked
 * turn) kept because the answer route is not finally decided (U-1).
 */
export type AnswerStrategy = 'relay' | 'append'

/**
 * Which agents the gate polices.
 *
 * `process` covers every agent in the process (blast radius: everything).
 * `preset` restricts it to sessions composed from `gatePreset`, which is the
 * smallest scope an external plugin can express (U-7).
 */
export type GateScope = 'process' | 'preset'

/** Plugin configuration (also the DSH Schemastery schema shape). */
export interface GrokWorkflowConfig {
  /** Model-facing tool name. */
  toolName?: string
  /** Route every top-level user message through the workflow (mandatory entry). */
  enforceGate?: boolean
  /** Answer production strategy (U-1); `relay` is the verified default. */
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
  /** Maximum concurrent child agents per workflow run. Hard maximum 6. */
  maxConcurrency?: number
  /** Maximum retries per task after the initial attempt. Hard maximum 3. */
  maxRetries?: number
  /** Maximum tasks accepted from a caller or planner. Hard maximum 12. */
  maxTasks?: number
  /** Overall workflow deadline in milliseconds. */
  timeoutMs?: number
  /** Maximum concurrent tool runs in one plugin instance. Hard maximum 4. */
  maxActiveRuns?: number
  /** Optional DSH subagent provider override; defaults to the engine/provider default. */
  subagentProvider?: string
}

/** Fully resolved limits. */
export interface ResolvedConfig {
  toolName: string
  enforceGate: boolean
  gateScope: GateScope
  gatePreset?: string
  answerStrategy: AnswerStrategy
  historyTurns: number
  historyChars: number
  maxQueuedMessages: number
  maxConcurrency: number
  maxRetries: number
  maxTasks: number
  timeoutMs: number
  maxActiveRuns: number
  subagentProvider?: string
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
}

/** One workflow-level error. */
export interface ReportError {
  phase: string
  message: string
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

/** One attempt's observed result. */
export interface AttemptReport {
  attempt: number
  execution: ExecutionResult | null
  verification: VerificationResult | null
  passed: boolean
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
  status: 'verified' | 'failed'
  attempts: AttemptReport[]
  error?: string
}

/** Planning provenance. */
export interface PlanReport {
  source: 'caller' | 'planner' | 'fallback' | 'unavailable'
  tasks: NormalizedTask[]
  error?: string
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
  limits: {
    maxConcurrency: number
    maxRetries: number
    maxTasks: number
    maxTotalAgents: number
  }
}
