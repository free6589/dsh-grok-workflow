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

/** Plugin configuration (also the DSH Schemastery schema shape). */
export interface GrokWorkflowConfig {
  /** Model-facing tool name. */
  toolName?: string
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
