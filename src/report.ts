import type {
  AttemptFailure,
  RouteTrailEntry, ExecutionResult, FailureCategory, FinalStatus, VerificationResult, WorkflowReport } from './types.js'
import type { ModelRoute, ResolvedConfig, RoleName } from './types.js'
import { criterionKey } from './input.js'
import { maxTotalAgentsFor, routeBudgetFor } from './script.js'

const STATUSES: readonly FinalStatus[] = ['completed', 'partial', 'failed']
const MAX_RENDER_CHARS = 8_000

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`workflow result ${path} must be an object`)
  }
  return value as Record<string, unknown>
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`workflow result ${path} must be an array`)
  return value
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new Error(`workflow result ${path} must be a string`)
  return value
}

function number(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`workflow result ${path} must be an integer`)
  }
  return value
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

const EXECUTION_STATUSES = ['completed', 'partial', 'failed'] as const
const COMMAND_STATUSES = ['passed', 'failed', 'not_run'] as const
const VERDICTS = ['pass', 'fail'] as const
const CONFIDENCES = ['high', 'medium', 'low'] as const

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`workflow result ${path} must be a boolean`)
  return value
}

/**
 * A closed-union string field. The generated script normalizes an out-of-union
 * model answer to a safe default (`status: 'partial'`, `confidence: 'low'`,
 * command `status: 'not_run'`), so those defaults are the only legal fallbacks
 * and any other value means the report was not produced by this plugin.
 */
function enumeration<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  const text = string(value, path)
  if (!(allowed as readonly string[]).includes(text)) {
    throw new Error(`workflow result ${path} must be one of ${allowed.join('/')} (got "${text}")`)
  }
  return text as T
}

function stringList(value: unknown, path: string): string[] {
  return array(value, path).map((item, index) => string(item, `${path}[${index}]`))
}

function commandRuns(value: unknown, path: string): ExecutionResult['testsRun'] {
  return array(value, path).map((item, index) => {
    const entry = record(item, `${path}[${index}]`)
    return {
      command: string(entry.command, `${path}[${index}].command`),
      status: enumeration(entry.status, COMMAND_STATUSES, `${path}[${index}].status`),
      detail: string(entry.detail, `${path}[${index}].detail`),
    }
  })
}

/**
 * Deep-validate one attempt's executor payload instead of trusting its shape.
 *
 * `deliverables`, `evidence`, `testsRun` and `filesChanged` are the executor
 * model's own declarations. The host validates their structure and their
 * traceability to the verifier's record, but it does not read the filesystem or
 * re-run commands here: a non-empty string is a declared observation, not a
 * host-verified fact.
 */
function executionResult(value: unknown, path: string): ExecutionResult {
  const root = record(value, path)
  return {
    summary: string(root.summary, `${path}.summary`),
    status: enumeration(root.status, EXECUTION_STATUSES, `${path}.status`),
    deliverables: array(root.deliverables, `${path}.deliverables`).map((item, index) => {
      const entry = record(item, `${path}.deliverables[${index}]`)
      return {
        description: string(entry.description, `${path}.deliverables[${index}].description`),
        locator: string(entry.locator, `${path}.deliverables[${index}].locator`),
      }
    }),
    evidence: array(root.evidence, `${path}.evidence`).map((item, index) => {
      const entry = record(item, `${path}.evidence[${index}]`)
      return {
        claim: string(entry.claim, `${path}.evidence[${index}].claim`),
        source: string(entry.source, `${path}.evidence[${index}].source`),
      }
    }),
    testsRun: commandRuns(root.testsRun, `${path}.testsRun`),
    filesChanged: stringList(root.filesChanged, `${path}.filesChanged`),
    uncertainties: stringList(root.uncertainties, `${path}.uncertainties`),
  }
}

/**
 * Parse the optional `writesPaths` declaration (U-4).
 *
 * `null`/absent means "unknown", which the scheduler treated conservatively; the
 * report echoes whatever the plan carried so an audit can see the declaration the
 * scheduling decision was made from.
 */
function writesPaths(value: unknown, path: string): string[] | null {
  if (value === undefined || value === null) return null
  return array(value, path).map((item, index) => string(item, `${path}[${index}]`))
}

/** Compare two optional string lists, treating `null` and absent as equal. */
function sameOptionalStrings(left: readonly string[] | null, right: readonly string[] | null): boolean {
  if (left === null || right === null) return left === right
  return sameStrings(left, right)
}

/** Deep-validate one attempt's verifier payload; `verdict` is a closed union. */
function verificationResult(value: unknown, path: string): VerificationResult {
  const root = record(value, path)
  return {
    verdict: enumeration(root.verdict, VERDICTS, `${path}.verdict`),
    criteria: array(root.criteria, `${path}.criteria`).map((item, index) => {
      const entry = record(item, `${path}.criteria[${index}]`)
      return {
        criterion: string(entry.criterion, `${path}.criteria[${index}].criterion`),
        met: boolean(entry.met, `${path}.criteria[${index}].met`),
        evidence: string(entry.evidence, `${path}.criteria[${index}].evidence`),
      }
    }),
    checkedEvidence: array(root.checkedEvidence, `${path}.checkedEvidence`).map((item, index) => {
      const entry = record(item, `${path}.checkedEvidence[${index}]`)
      return {
        kind: string(entry.kind, `${path}.checkedEvidence[${index}].kind`),
        locator: string(entry.locator, `${path}.checkedEvidence[${index}].locator`),
        finding: string(entry.finding, `${path}.checkedEvidence[${index}].finding`),
      }
    }),
    commandsRun: commandRuns(root.commandsRun, `${path}.commandsRun`),
    issues: stringList(root.issues, `${path}.issues`),
    confidence: enumeration(root.confidence, CONFIDENCES, `${path}.confidence`),
  }
}

/**
 * Enforce the report contract before a script result reaches the model.
 * The script is trusted code, but a malformed engine result must not be
 * presented as a successful workflow.
 */
const ROLE_NAMES = ['planner', 'worker', 'verifier', 'synthesizer'] as const

const FAILURE_CLASSES = [
  'rate-limit',
  'server-error',
  'connection',
  'timeout',
  'model-unavailable',
  'format-error',
  'task-failed',
  'verification-failed',
  'agent-start-failed',
  'budget-exhausted',
  'unknown',
] as const

const FAILURE_CATEGORIES = ['infrastructure', 'quality', 'configuration', 'cancelled', 'unknown'] as const

/** Parse an optional failure category; unknown values are rejected, not coerced. */
function failureCategory(value: unknown, path: string): FailureCategory | undefined {
  if (value === undefined || value === null) return undefined
  return enumeration(value, FAILURE_CATEGORIES, `${path}.category`) as FailureCategory
}

function attemptFailure(value: unknown, path: string): AttemptFailure {
  const entry = record(value, path)
  const category = failureCategory(entry.category, path)
  return {
    class: enumeration(entry.class, FAILURE_CLASSES, `${path}.class`),
    reason: string(entry.reason ?? '', `${path}.reason`),
    ...category === undefined ? {} : { category },
  }
}

function routeTrail(value: unknown, path: string, max: number): RouteTrailEntry[] {
  return array(value, path).slice(0, max).map((item, index) => {
    const entry = record(item, `${path}[${index}]`)
    const outcome = string(entry.outcome, `${path}[${index}].outcome`)
    if (outcome !== 'ok' && outcome !== 'failed') {
      throw new Error(`workflow result ${path}[${index}].outcome must be "ok" or "failed"`)
    }
    return {
      role: enumeration(entry.role, ROLE_NAMES, `${path}[${index}].role`),
      chainIndex: number(entry.chainIndex, `${path}[${index}].chainIndex`),
      route: string(entry.route, `${path}[${index}].route`),
      attempt: number(entry.attempt, `${path}[${index}].attempt`),
      outcome,
      ...entry.failureClass === undefined ? {} : { failureClass: enumeration(entry.failureClass, FAILURE_CLASSES, `${path}[${index}].failureClass`) },
      ...entry.reason === undefined ? {} : { reason: string(entry.reason, `${path}[${index}].reason`) },
    }
  })
}

function routeLabels(value: unknown, path: string): Record<RoleName, string[]> {
  const root = record(value, path)
  const out = {} as Record<RoleName, string[]>
  for (const role of ROLE_NAMES) {
    out[role] = stringList(root[role] ?? [], `${path}.${role}`)
  }
  return out
}

/**
 * Does this task claim a change (files, commands, tests) rather than a pure
 * answer? Used only to decide whether a summary-only execution is a legitimate
 * answer artifact or an empty result that must fail closed.
 */
const CHANGE_CLAIM = /(?:\b(?:file|files?|path|directory|write|writes?|create|edit|modify|delete|rename|move|test|tests?|command|run|build|lint|install|compile)\b|文件|目录|写入|创建|修改|删除|重命名|移动|测试|命令|运行|构建|编译)/i

function claimsChange(task: {
  objective: string
  expectedOutput: string
  acceptanceCriteria: readonly string[]
  writesPaths: string[] | null
}): boolean {
  if (task.writesPaths !== null && task.writesPaths.length > 0) return true
  return CHANGE_CLAIM.test([task.objective, task.expectedOutput, ...task.acceptanceCriteria].join('\n'))
}

/** A substantive artifact is one the executor actually produced, not a placeholder or a `not_run` command. */
function hasSubstantiveArtifact(execution: ExecutionResult): boolean {
  return execution.deliverables.some(item => item.description.trim() !== '' && item.locator.trim() !== '')
    || execution.evidence.some(item => item.claim.trim() !== '' && item.source.trim() !== '')
    || execution.testsRun.some(item => item.status === 'passed' && item.command.trim() !== '')
    || execution.filesChanged.some(item => item.trim() !== '')
}

export function assertWorkflowReport(value: unknown, objective: string, config: ResolvedConfig): WorkflowReport {
  const root = record(value, 'root')
  if (root.schemaVersion !== 'grok-workflow/v1') {
    throw new Error('workflow result has an unsupported schemaVersion')
  }
  const status = string(root.status, 'status')
  if (!STATUSES.includes(status as FinalStatus)) {
    throw new Error(`workflow result has invalid status "${status}"`)
  }
  if (string(root.objective, 'objective') !== objective) {
    throw new Error('workflow result objective does not match the request objective')
  }
  const plan = record(root.plan, 'plan')
  const source = string(plan.source, 'plan.source')
  if (!['caller', 'planner', 'fallback', 'unavailable'].includes(source)) {
    throw new Error(`workflow result has invalid plan.source "${source}"`)
  }
  const planFailure = plan.failure === undefined || plan.failure === null
    ? undefined
    : attemptFailure(plan.failure, 'plan.failure')
  const planTasks = array(plan.tasks, 'plan.tasks').map((item, index) => {
    const task = record(item, `plan.tasks[${index}]`)
    return {
      id: string(task.id, `plan.tasks[${index}].id`),
      title: string(task.title, `plan.tasks[${index}].title`),
      objective: string(task.objective, `plan.tasks[${index}].objective`),
      expectedOutput: string(task.expectedOutput, `plan.tasks[${index}].expectedOutput`),
      acceptanceCriteria: array(task.acceptanceCriteria, `plan.tasks[${index}].acceptanceCriteria`)
        .map((criterion, c) => string(criterion, `plan.tasks[${index}].acceptanceCriteria[${c}]`)),
      context: string(task.context, `plan.tasks[${index}].context`),
      constraints: array(task.constraints, `plan.tasks[${index}].constraints`)
        .map((constraint, c) => string(constraint, `plan.tasks[${index}].constraints[${c}]`)),
      writesPaths: writesPaths(task.writesPaths, `plan.tasks[${index}].writesPaths`),
    }
  })
  const tasks = array(root.tasks, 'tasks').map((item, index) => {
    const task = record(item, `tasks[${index}]`)
    const taskStatus = string(task.status, `tasks[${index}].status`)
    if (taskStatus !== 'verified' && taskStatus !== 'failed') {
      throw new Error(`workflow result has invalid tasks[${index}].status "${taskStatus}"`)
    }
    return {
      id: string(task.id, `tasks[${index}].id`),
      title: string(task.title, `tasks[${index}].title`),
      objective: string(task.objective, `tasks[${index}].objective`),
      expectedOutput: string(task.expectedOutput, `tasks[${index}].expectedOutput`),
      acceptanceCriteria: array(task.acceptanceCriteria, `tasks[${index}].acceptanceCriteria`)
        .map((criterion, c) => string(criterion, `tasks[${index}].acceptanceCriteria[${c}]`)),
      context: string(task.context, `tasks[${index}].context`),
      constraints: array(task.constraints, `tasks[${index}].constraints`)
        .map((constraint, c) => string(constraint, `tasks[${index}].constraints[${c}]`)),
      writesPaths: writesPaths(task.writesPaths, `tasks[${index}].writesPaths`),
      status: taskStatus,
      attempts: array(task.attempts, `tasks[${index}].attempts`).map((attempt, a) => {
        const entry = record(attempt, `tasks[${index}].attempts[${a}]`)
        return {
          attempt: number(entry.attempt, `tasks[${index}].attempts[${a}].attempt`),
          execution: entry.execution === null ? null : executionResult(entry.execution, `tasks[${index}].attempts[${a}].execution`),
          verification: entry.verification === null ? null : verificationResult(entry.verification, `tasks[${index}].attempts[${a}].verification`),
          passed: entry.passed === true,
          ...entry.route === undefined ? {} : { route: string(entry.route, `tasks[${index}].attempts[${a}].route`) },
          ...entry.failure === undefined || entry.failure === null
            ? {}
            : { failure: attemptFailure(entry.failure, `tasks[${index}].attempts[${a}].failure`) },
          error: string(entry.error ?? '', `tasks[${index}].attempts[${a}].error`),
        }
      }),
      error: string(task.error ?? '', `tasks[${index}].error`),
    }
  })
  if (planTasks.length !== tasks.length) {
    throw new Error('workflow result plan.tasks and tasks length mismatch')
  }
  for (let index = 0; index < planTasks.length; index++) {
    const planTask = planTasks[index]!
    const task = tasks[index]!
    if (planTask.id !== task.id) {
      throw new Error(`workflow result task id mismatch at index ${index}`)
    }
    if (planTask.title !== task.title
      || planTask.objective !== task.objective
      || planTask.expectedOutput !== task.expectedOutput
      || planTask.context !== task.context
      || !sameStrings(planTask.acceptanceCriteria, task.acceptanceCriteria)
      || !sameStrings(planTask.constraints, task.constraints)
      || !sameOptionalStrings(planTask.writesPaths, task.writesPaths)) {
      throw new Error(`workflow result plan.tasks and tasks disagree at index ${index}`)
    }
  }
  const limits = record(root.limits, 'limits')
  const maxConcurrency = number(limits.maxConcurrency, 'limits.maxConcurrency')
  const maxRetries = number(limits.maxRetries, 'limits.maxRetries')
  const maxTasks = number(limits.maxTasks, 'limits.maxTasks')
  const maxTotalAgents = number(limits.maxTotalAgents, 'limits.maxTotalAgents')
  // t47: the deadline travels with the result. It used to live only in memory, so
  // "which deadline was in force?" was unanswerable from the session log.
  const timeoutMs = limits.timeoutMs === undefined ? undefined : number(limits.timeoutMs, 'limits.timeoutMs')
  if (timeoutMs !== undefined && timeoutMs !== 0 && timeoutMs !== config.timeoutMs) {
    throw new Error(`workflow result ran under a ${timeoutMs} ms deadline but the plugin enforces ${config.timeoutMs} ms`)
  }
  if (maxConcurrency !== config.maxConcurrency || maxRetries !== config.maxRetries || maxTasks !== config.maxTasks) {
    throw new Error('workflow result limits do not match the configured limits')
  }
  if (tasks.length > maxTasks) {
    throw new Error(`workflow result has ${tasks.length} tasks but maxTasks is ${maxTasks}`)
  }
  if (tasks.length > 0) {
    // The plugin sizes the child cap from the task count: exact for a caller plan,
    // the configured maximum for a planner or fallback plan. Anything outside that
    // window did not come from this plugin's request builder.
    const budget = routeBudgetFor(config)
    const minimumAgents = maxTotalAgentsFor(tasks.length, maxRetries, budget)
    const maximumAgents = maxTotalAgentsFor(maxTasks, maxRetries, budget)
    if (maxTotalAgents < minimumAgents || maxTotalAgents > maximumAgents) {
      throw new Error(
        `workflow result limits.maxTotalAgents ${maxTotalAgents} is outside the allowed range ${minimumAgents}-${maximumAgents}`,
      )
    }
  }
  const taskIds = new Set<string>()
  for (const task of tasks) {
    if (taskIds.has(task.id)) {
      throw new Error(`workflow result has duplicate task id "${task.id}"`)
    }
    taskIds.add(task.id)
    if (task.acceptanceCriteria.length === 0) {
      throw new Error(`workflow result task ${task.id} has no acceptance criteria`)
    }
  }
  for (const task of tasks) {
    if (task.attempts.length === 0) {
      throw new Error(`workflow result task ${task.id} has no attempts`)
    }
    if (task.attempts.length > maxRetries + 1) {
      throw new Error(`workflow result task ${task.id} exceeds the configured retry limit`)
    }
    for (let index = 0; index < task.attempts.length; index++) {
      if (task.attempts[index]!.attempt !== index + 1) {
        throw new Error(`workflow result task ${task.id} has non-sequential attempts`)
      }
      if (task.attempts[index]!.passed && (task.attempts[index]!.execution === null || task.attempts[index]!.verification === null)) {
        throw new Error(`workflow result task ${task.id} has a passed attempt without execution and verification`)
      }
      const attempt = task.attempts[index]!
      if (attempt.passed) {
        // A passed attempt is the only thing that can make a task verified, so the
        // host re-checks the invariant the script enforces instead of trusting the
        // `passed` boolean. Without this, a report whose own fields contradict each
        // other (`passed: true` with `verdict: "fail"`, a partial executor, or an
        // empty evidence list) is accepted as COMPLETED by shape validation alone.
        if (attempt.execution!.status !== 'completed') {
          throw new Error(`workflow result task ${task.id} has a passed attempt whose executor reported ${attempt.execution!.status}`)
        }
        if (attempt.verification!.verdict !== 'pass') {
          throw new Error(`workflow result task ${task.id} has a passed attempt whose verifier verdict is ${attempt.verification!.verdict}`)
        }
        if (attempt.verification!.checkedEvidence.length === 0) {
          throw new Error(`workflow result task ${task.id} has a passed attempt whose verifier returned no checked evidence`)
        }
        if (!attempt.verification!.checkedEvidence.some(item =>
          item.kind.trim() !== '' || item.locator.trim() !== '' || item.finding.trim() !== '')) {
          throw new Error(`workflow result task ${task.id} has a passed attempt whose checked evidence entries are all empty`)
        }
        if (attempt.verification!.criteria.length !== task.acceptanceCriteria.length) {
          throw new Error(`workflow result task ${task.id} has a passed attempt whose verifier criteria count does not match the task acceptance criteria`)
        }
        for (const criterion of task.acceptanceCriteria) {
          const matches = attempt.verification!.criteria.filter(item =>
            criterionKey(item.criterion) === criterionKey(criterion))
          if (matches.length !== 1 || !matches[0]!.met || matches[0]!.evidence.trim() === '') {
            throw new Error(`workflow result task ${task.id} has a passed attempt whose criterion "${criterion}" is not met exactly once with evidence`)
          }
        }
      }
    }
    const passedAttempts = task.attempts.filter(attempt => attempt.passed)
    if (task.status === 'verified') {
      if (passedAttempts.length !== 1 || !task.attempts[task.attempts.length - 1]!.passed) {
        throw new Error(`workflow result task ${task.id} is verified without exactly one final passed attempt`)
      }
      const lastExecution = task.attempts[task.attempts.length - 1]!.execution!
      if (!hasSubstantiveArtifact(lastExecution)) {
        // A verified change task must have produced at least one observable
        // artifact: a real deliverable, a real piece of evidence, a command that
        // actually passed, or a changed file. `not_run` commands, empty strings
        // and placeholder entries do not count.
        //
        // A pure answer task is different: the answer itself lives in `summary`,
        // and R-001/t52 show that greetings and simple factual questions are
        // legitimately answered that way. Accept a non-empty summary only when
        // the task declares no write/test work and the execution is otherwise
        // empty; a change task with only a summary still fails closed.
        const emptyExecution = lastExecution.deliverables.length === 0
          && lastExecution.evidence.length === 0
          && lastExecution.testsRun.length === 0
          && lastExecution.filesChanged.length === 0
        const answerOnly = emptyExecution
          && !claimsChange(task)
          && lastExecution.summary.trim() !== ''
        if (!answerOnly) {
          throw new Error(`workflow result task ${task.id} is verified without any execution artifact`)
        }
      }
    } else if (passedAttempts.length > 0) {
      throw new Error(`workflow result task ${task.id} is failed but has a passed attempt`)
    }
  }
  const confirmed = array(root.confirmed, 'confirmed').map((item, index) => {
    const entry = record(item, `confirmed[${index}]`)
    return {
      taskId: string(entry.taskId, `confirmed[${index}].taskId`),
      criterion: string(entry.criterion, `confirmed[${index}].criterion`),
      evidence: string(entry.evidence, `confirmed[${index}].evidence`),
    }
  })
  const incomplete = array(root.incomplete, 'incomplete').map((item, index) => {
    const entry = record(item, `incomplete[${index}]`)
    const category = failureCategory(entry.category, `incomplete[${index}]`)
    return {
      taskId: string(entry.taskId, `incomplete[${index}].taskId`),
      reason: string(entry.reason, `incomplete[${index}].reason`),
      ...category === undefined ? {} : { category },
    }
  })
  const errors = array(root.errors, 'errors').map((item, index) => {
    const entry = record(item, `errors[${index}]`)
    const category = failureCategory(entry.category, `errors[${index}]`)
    return {
      phase: string(entry.phase, `errors[${index}].phase`),
      message: string(entry.message, `errors[${index}].message`),
      ...category === undefined ? {} : { category },
    }
  })
  const uncertainties = array(root.uncertainties, 'uncertainties').map((item, index) => {
    const entry = record(item, `uncertainties[${index}]`)
    return {
      taskId: string(entry.taskId, `uncertainties[${index}].taskId`),
      text: string(entry.text, `uncertainties[${index}].text`),
    }
  })
  const verifiedCount = tasks.filter(task => task.status === 'verified').length
  const planError = string(plan.error ?? '', 'plan.error')
  if (source === 'unavailable' && tasks.length > 0) {
    throw new Error('workflow result unavailable plan must not contain tasks')
  }
  if (status === 'completed') {
    if (source === 'fallback' || source === 'unavailable') {
      throw new Error('workflow result cannot be completed from a fallback or unavailable plan')
    }
    if (tasks.length === 0 || verifiedCount !== tasks.length) {
      throw new Error('workflow result completed requires every task to be verified')
    }
    if (incomplete.length > 0 || errors.length > 0 || planError !== '') {
      throw new Error('workflow result completed cannot contain incomplete work or errors')
    }
    const verifiedTasks = tasks.filter(task => task.status === 'verified')
    for (const task of verifiedTasks) {
      for (const criterion of task.acceptanceCriteria) {
        const matches = confirmed.filter(item => item.taskId === task.id && item.criterion === criterion)
        if (matches.length !== 1 || matches[0]!.evidence.trim() === '') {
          throw new Error(`workflow result completed lacks confirmed evidence for task ${task.id} criterion`)
        }
      }
    }
    if (confirmed.some(item => !verifiedTasks.some(task => task.id === item.taskId))) {
      throw new Error('workflow result confirmed evidence references a task that is not verified')
    }
  } else if (status === 'partial') {
    if (tasks.length === 0 || verifiedCount === 0) {
      throw new Error('workflow result partial requires at least one verified task')
    }
    if (source === 'fallback') {
      // A degraded fallback plan is never a clean completion, but its only task
      // may legitimately be verified. Require the planning error as provenance.
      if (planError.trim() === '') {
        throw new Error('workflow result fallback partial requires the planning error')
      }
    } else if (verifiedCount === tasks.length) {
      throw new Error('workflow result partial requires both verified and failed tasks')
    }
  } else if (verifiedCount > 0) {
    throw new Error('workflow result failed cannot contain a verified task')
  }
  // Every confirmed item must be traceable to the last attempt's own verification
  // record: same task, same criterion (formatting-insensitive, matching how the
  // script pairs them), met, and byte-identical evidence. This is what stops a
  // report from asserting evidence that no verifier ever produced.
  for (const item of confirmed) {
    const task = tasks.find(candidate => candidate.id === item.taskId)
    if (task === undefined) {
      throw new Error(`workflow result confirmed evidence references unknown task ${item.taskId}`)
    }
    const lastVerification = task.attempts[task.attempts.length - 1]!.verification
    const supported = lastVerification !== null && lastVerification.criteria.some(criterion =>
      criterion.met
      && criterion.evidence === item.evidence
      && criterionKey(criterion.criterion) === criterionKey(item.criterion))
    if (!supported) {
      throw new Error(
        `workflow result confirmed evidence for task ${item.taskId} is not supported by that task's last attempt verification`,
      )
    }
  }
  if (status !== 'completed') {
    // A non-completed report must account for every failed task exactly once, with
    // a real reason. A fallback partial whose single task verified legitimately has
    // no failed task, so this stays vacuous there (its provenance is plan.error).
    for (const task of tasks) {
      if (task.status !== 'failed') continue
      const entries = incomplete.filter(item => item.taskId === task.id)
      if (entries.length !== 1 || entries[0]!.reason.trim() === '') {
        throw new Error(
          `workflow result task ${task.id} failed but is not reported exactly once in incomplete with a non-empty reason`,
        )
      }
    }
  }
  const routes = root.routes === undefined ? [] : routeTrail(root.routes, 'routes', 256)
  for (const entry of routes) {
    if (entry.chainIndex < 0 || entry.chainIndex >= config.roles[entry.role].length + 1) {
      throw new Error(`workflow result routes entry for ${entry.role} has out-of-range chainIndex ${entry.chainIndex}`)
    }
  }
  const routing = root.routing === undefined
    ? { planner: [], worker: [], verifier: [], synthesizer: [] }
    : routeLabels(root.routing, 'routing')
  const synthesisRoot = root.synthesis === undefined ? {} : record(root.synthesis, 'synthesis')
  const synthesisMode = string(synthesisRoot.mode ?? config.synthesis, 'synthesis.mode')
  if (synthesisMode !== 'deterministic' && synthesisMode !== 'model') {
    throw new Error(`workflow result synthesis.mode must be "deterministic" or "model", got "${synthesisMode}"`)
  }
  return {
    schemaVersion: 'grok-workflow/v1',
    status: status as FinalStatus,
    routes,
    routing,
    synthesis: {
      mode: synthesisMode,
      ...synthesisRoot.error === undefined ? {} : { error: string(synthesisRoot.error, 'synthesis.error') },
      ...synthesisRoot.summary === undefined ? {} : { summary: string(synthesisRoot.summary, 'synthesis.summary') },
    },
    objective: string(root.objective, 'objective'),
    plan: {
      source: source as WorkflowReport['plan']['source'],
      tasks: planTasks,
      error: planError,
      ...planFailure === undefined ? {} : { failure: planFailure },
    },
    tasks: tasks as WorkflowReport['tasks'],
    confirmed,
    incomplete,
    errors,
    uncertainties,
    limits: {
      maxConcurrency,
      maxRetries,
      maxTasks,
      maxTotalAgents: number(limits.maxTotalAgents, 'limits.maxTotalAgents'),
      ...timeoutMs === undefined || timeoutMs === 0 ? {} : { timeoutMs },
    },
  }
}

/** A failure report for a run that never produced a script result. */
/** Render one configured chain the way the report names it: `provider/model`. */
function chainLabelsFor(chain: readonly ModelRoute[]): string[] {
  return chain.map(route => route.provider === '' ? route.model : `${route.provider}/${route.model}`)
}

export function failureReport(
  objective: string,
  config: ResolvedConfig,
  phase: string,
  message: string,
  category: FailureCategory = 'infrastructure',
): WorkflowReport {
  return {
    schemaVersion: 'grok-workflow/v1',
    status: 'failed',
    objective,
    plan: { source: 'unavailable', tasks: [], error: message },
    tasks: [],
    confirmed: [],
    incomplete: [{ taskId: 'workflow', reason: message, category }],
    errors: [{ phase, message, category }],
    uncertainties: [],
    routes: [],
    // t47: a failure report is still a report about *this* configuration, so it has
    // to name the chains that were in force. It used to print the all-empty default,
    // which read as "no chain configured" even when the run was handed one — the
    // exact ambiguity the t46 round could not resolve.
    routing: {
      planner: chainLabelsFor(config.roles.planner),
      worker: chainLabelsFor(config.roles.worker),
      verifier: chainLabelsFor(config.roles.verifier),
      synthesizer: chainLabelsFor(config.roles.synthesizer),
    },
    synthesis: { mode: config.synthesis },
    limits: {
      maxConcurrency: config.maxConcurrency,
      maxRetries: config.maxRetries,
      maxTasks: config.maxTasks,
      maxTotalAgents: 0,
      timeoutMs: config.timeoutMs,
    },
  }
}

/**
 * Failure category of a failed task, from its last classified attempt.
 * @param task - report row to inspect.
 * @returns The category, or undefined when no attempt carried one.
 */
function categoryOfTask(task: WorkflowReport['tasks'][number]): FailureCategory | undefined {
  for (let index = task.attempts.length - 1; index >= 0; index--) {
    const failure = task.attempts[index]?.failure
    if (failure?.category !== undefined) return failure.category
  }
  return undefined
}

/**
 * Count failures per category across the report, so a reader can separate
 * "the provider was down" from "the work was not good enough" at a glance.
 * @param report - validated report.
 * @returns Category counts in report order.
 */
export function failureSummary(report: WorkflowReport): { category: FailureCategory; count: number }[] {
  const counts = new Map<FailureCategory, number>()
  const add = (category: FailureCategory | undefined): void => {
    if (category === undefined) return
    counts.set(category, (counts.get(category) ?? 0) + 1)
  }
  for (const task of report.tasks) {
    const classified = task.attempts.filter(attempt => attempt.failure?.category !== undefined)
    // One count per attempt that actually failed; a task with no classified
    // attempt (runner failure) still counts once, from its incomplete row.
    if (classified.length === 0) {
      add(report.incomplete.find(item => item.taskId === task.id)?.category)
      continue
    }
    for (const attempt of classified) add(attempt.failure?.category)
  }
  if (counts.size === 0) {
    // A run-level failure has no task rows at all (deadline, cancellation, an
    // unvalidatable report), so its only categories live on errors[]. Counting them
    // keeps the rendered "Failures:" line honest instead of silently omitting it.
    for (const entry of report.errors) add(entry.category)
  }
  const order: FailureCategory[] = ['infrastructure', 'quality', 'configuration', 'cancelled', 'unknown']
  return order.filter(category => counts.has(category)).map(category => ({ category, count: counts.get(category) ?? 0 }))
}

/** Render a concise model-facing view; the canonical JSON remains available to PTC. */
export function renderReport(report: WorkflowReport): string {
  const verified = report.tasks.filter(task => task.status === 'verified').length
  const lines: string[] = [
    `Grok workflow: ${report.status.toUpperCase()}`,
    `Objective: ${oneLine(report.objective, 300)}`,
    `Plan: ${report.plan.source}; ${report.tasks.length} task(s); ${verified} verified`,
  ]
  const failures = failureSummary(report)
  if (failures.length > 0) {
    lines.push(`Failures: ${failures.map(entry => `${entry.count} ${entry.category}`).join(', ')}`)
  }
  if (report.plan.failure !== undefined && report.plan.failure !== null && report.plan.failure.category !== undefined) {
    lines.push(`Plan failure: ${report.plan.failure.class} (${report.plan.failure.category})`)
  }
  for (const task of report.tasks) {
    const attempts = task.attempts.length
    lines.push(`- ${task.id}: ${task.status} (${attempts} attempt${attempts === 1 ? '' : 's'}) — ${oneLine(task.title, 160)}`)
    if (task.status === 'failed') {
      const category = categoryOfTask(task)
      lines.push(`  incomplete${category === undefined ? '' : ` (${category})`}: ${oneLine(task.error || task.expectedOutput, 500)}`)
    }
  }
  if (report.confirmed.length > 0) {
    lines.push('Confirmed evidence:')
    for (const item of report.confirmed.slice(0, 12)) {
      lines.push(`- ${item.taskId}: ${oneLine(item.criterion, 200)} → ${oneLine(item.evidence, 400)}`)
    }
  }
  if (report.incomplete.length > 0) {
    lines.push('Incomplete:')
    for (const item of report.incomplete.slice(0, 12)) {
      lines.push(`- ${item.taskId}${item.category === undefined ? '' : ` (${item.category})`}: ${oneLine(item.reason, 500)}`)
    }
  }
  if (report.synthesis.summary !== undefined) {
    lines.push('Final answer:')
    lines.push(oneLine(report.synthesis.summary, 2_000))
  }
  if (report.synthesis.error !== undefined) {
    lines.push(`Synthesis: model narrative unavailable (${oneLine(report.synthesis.error, 300)}); the report above is complete`)
  }
  // t47: always printed. The t46 round saw the line appear only after a settings
  // save and could not tell "no chain configured" from "the line was skipped", so
  // an unset role now says `inherit` instead of silently vanishing.
  const configured = (['planner', 'worker', 'verifier', 'synthesizer'] as const)
    .map(role => [role, report.routing[role]] as const)
  lines.push(`Model routes: ${configured.map(([role, chain]) => `${role}=${chain.length === 0 ? 'inherit' : chain.join(' → ')}`).join('; ')}`)
  if (report.limits.timeoutMs !== undefined) {
    lines.push(`Deadline: ${report.limits.timeoutMs} ms per run (enforced by the plugin)`)
  }
  const routeFailures = report.routes.filter(entry => entry.outcome === 'failed')
  if (routeFailures.length > 0) {
    lines.push('Route switches:')
    for (const entry of routeFailures.slice(0, 12)) {
      lines.push(`- ${entry.role} attempt ${entry.attempt} via ${entry.route}: ${entry.failureClass ?? 'unknown'} — ${oneLine(entry.reason ?? '', 200)}`)
    }
  }
  if (report.uncertainties.length > 0) {
    lines.push('Uncertainties:')
    for (const item of report.uncertainties.slice(0, 12)) {
      lines.push(`- ${item.taskId}: ${oneLine(item.text, 400)}`)
    }
  }
  if (report.errors.length > 0) {
    lines.push('Errors:')
    for (const item of report.errors.slice(0, 12)) {
      lines.push(`- ${item.phase}: ${oneLine(item.message, 500)}`)
    }
  }
  const text = lines.join('\n')
  return text.length <= MAX_RENDER_CHARS
    ? text
    : `${text.slice(0, MAX_RENDER_CHARS)}\n[output truncated; see the canonical structured result for full details]`
}

function oneLine(value: string, max: number): string {
  const compact = value.replace(/\s+/g, ' ').trim()
  return compact.length <= max ? compact : `${compact.slice(0, max - 1)}…`
}
