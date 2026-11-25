import type {
  AttemptFailure,
  DeadRouteEntry, RouteTrailEntry, ExecutionResult, FailureCategory, FinalStatus, StopCause, VerificationResult, WorkflowReport } from './types.js'
import type { ModelRoute, ResolvedConfig, RoleName } from './types.js'
import { HARD_LIMITS } from './config.js'
import { criterionKey, TASK_LIMITS } from './input.js'
import { REPLAN_LIMITS } from './replan.js'
import type { ReplanDecision } from './replan.js'
import type { HandoffContract } from './handoff/contract.js'
import { renderHandoffSection } from './handoff/render.js'
import { maxTotalAgentsFor, routeBudgetFor } from './script.js'
import { shardCountFor, splitObjective } from './shards.js'
import { planWaveReason, WAVE_LIMIT } from './waves.js'
import { renderAuditTrail } from './report-audit.js'

const STATUSES: readonly FinalStatus[] = ['completed', 'partial', 'failed']
/** The three task terminal states (thin design §1). */
const TASK_STATUSES = ['verified', 'failed', 'blocked'] as const
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

function optionalString(value: unknown, path: string): string | undefined {
  return value === undefined || value === null ? undefined : string(value, path)
}

/** Spreadable origin-goal id: absent when the plan has no synthetic shards. */
function originGoalIdField(value: unknown, path: string): { originGoalId?: string } {
  const originGoalId = optionalString(value, path)
  return originGoalId === undefined ? {} : { originGoalId }
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
const ROLE_NAMES = ['planner', 'worker', 'verifier', 'supervisor', 'synthesizer'] as const

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
  'cancelled',
  'unknown',
] as const

const FAILURE_CATEGORIES = ['infrastructure', 'quality', 'configuration', 'cancelled', 'unknown'] as const
/** Stop causes a report may carry (mirrors `StopCause` in `src/types.ts`). */
const STOP_CAUSES: readonly StopCause[] = ['unloaded', 'caller', 'deadline', 'engine']

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
      ...entry.taskId === undefined ? {} : { taskId: string(entry.taskId, `${path}[${index}].taskId`) },
      outcome,
      ...entry.failureClass === undefined ? {} : { failureClass: enumeration(entry.failureClass, FAILURE_CLASSES, `${path}[${index}].failureClass`) },
      ...entry.reason === undefined ? {} : { reason: string(entry.reason, `${path}[${index}].reason`) },
      ...entry.skippedBusy === undefined ? {} : { skippedBusy: stringList(entry.skippedBusy, `${path}[${index}].skippedBusy`) },
      ...entry.queuedMs === undefined ? {} : { queuedMs: number(entry.queuedMs, `${path}[${index}].queuedMs`) },
    }
  })
}

/**
 * Dead-route rows (`src/script.ts` route health).
 *
 * The threshold is re-checked here, not trusted: a row claiming a route died
 * after one failure would make the report say the run preferred a live route
 * over a route it had barely tried, and the whole point of the table is that the
 * evidence was enough to justify moving calls. `streak` carries the real count so
 * a reader can tell "crossed at 2" from "failed four times in a row".
 */
function deadRouteTrail(value: unknown, path: string, max: number): DeadRouteEntry[] {
  return array(value, path).slice(0, max).map((item, index) => {
    const entry = record(item, `${path}[${index}]`)
    const streak = number(entry.streak, `${path}[${index}].streak`)
    if (streak < HARD_LIMITS.deadRoute.threshold) {
      throw new Error(`workflow result ${path}[${index}].streak must be at least ${HARD_LIMITS.deadRoute.threshold} (a route is dead only at the threshold)`)
    }
    return {
      route: string(entry.route, `${path}[${index}].route`),
      class: enumeration(entry.class, FAILURE_CLASSES, `${path}[${index}].class`),
      streak,
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
const CHANGE_CLAIM = /(?:\b(?:file|files?|path|directory|write|writes?|create|edit|modify|delete|rename|move|test|tests?|command|run|running|execute|executing|build|lint|install|compile|deploy|patch|refactor|implement|fix|add|remove|update|change|save|generate)\b|文件|目录|写入|创建|修改|删除|重命名|移动|测试|命令|运行|执行|构建|编译|安装|部署|实现|修复|新增|删除|更新)/i

/** A positive answer-intent signal. Ambiguous requests get no summary-only exemption. */
const QUESTION_INTENT = /(?:\?|？|^\s*(?:what|why|how|who|when|where|which|is|are|was|were|can|could|does|do|did|should|would|explain|describe|tell me|summarize|define|compare|请|告诉我|列举|比较)|(?:是什么|是多少|为什么|如何|怎么|是否|介绍|解释|说明))/i

function claimsChange(task: {
  objective: string
  expectedOutput: string
  acceptanceCriteria: readonly string[]
  writesPaths: string[] | null
}, rootObjective: string): boolean {
  if (task.writesPaths !== null && task.writesPaths.length > 0) return true
  // The root objective is deliberately included: the A-01 failure mode is a
  // planner that softens "write X / run the tests" into "explain the attempt".
  // A summary-only answer must not be able to hide that drift.
  return CHANGE_CLAIM.test([rootObjective, task.objective, task.expectedOutput, ...task.acceptanceCriteria].join('\n'))
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
      ...originGoalIdField(task.originGoalId, `plan.tasks[${index}].originGoalId`),
    }
  })
  // Wave structure (v0.13). Optional, because a report produced before waves existed
  // has none; when present it must partition the plan tasks exactly, in plan order —
  // a wave list that invents, drops or reorders a task would make the schedule a claim
  // no plan supports.
  const planWaves = plan.waves === undefined
    ? undefined
    : array(plan.waves, 'plan.waves').map((item, index) =>
      array(item, `plan.waves[${index}]`).map((id, position) => string(id, `plan.waves[${index}][${position}]`)))
  if (planWaves !== undefined) {
    if (planWaves.length === 0) {
      throw new Error('workflow result plan.waves must declare at least one wave')
    }
    if (planWaves.length > WAVE_LIMIT) {
      throw new Error(`workflow result plan.waves declares ${planWaves.length} waves, over the limit of ${WAVE_LIMIT}`)
    }
    const flattened = planWaves.flat()
    if (flattened.length !== planTasks.length) {
      throw new Error('workflow result plan.waves does not cover every plan task exactly once')
    }
    for (let index = 0; index < flattened.length; index++) {
      if (flattened[index] !== planTasks[index]!.id) {
        throw new Error(`workflow result plan.waves disagrees with plan.tasks at index ${index}`)
      }
    }
  }
  // Mid-run replan (L2): the plan version and the boundary ledger. A version above
  // 1 without a matching `applied` row would claim replanning that the ledger does
  // not show, so the two are checked against each other instead of trusted apart.
  const planVersion = plan.version === undefined ? 1 : number(plan.version, 'plan.version')
  if (!Number.isInteger(planVersion) || planVersion < 1) {
    throw new Error(`workflow result plan.version must be a positive integer, got ${planVersion}`)
  }
  const planReplans: ReplanDecision[] = plan.replans === undefined
    ? []
    : array(plan.replans, 'plan.replans').map((item, index) => {
      const row = record(item, `plan.replans[${index}]`)
      const version = number(row.version, `plan.replans[${index}].version`)
      const wave = number(row.wave, `plan.replans[${index}].wave`)
      const decision = string(row.decision, `plan.replans[${index}].decision`)
      if (!Number.isInteger(version) || version < 2) {
        throw new Error(`workflow result plan.replans[${index}].version must be an integer above 1`)
      }
      if (!Number.isInteger(wave) || wave < 1) {
        throw new Error(`workflow result plan.replans[${index}].wave must be a positive integer`)
      }
      if (decision !== 'applied' && decision !== 'rejected' && decision !== 'none') {
        throw new Error(`workflow result plan.replans[${index}].decision is not applied, rejected or none`)
      }
      const idList = (value: unknown, field: string): string[] =>
        array(value, field).map((id, position) => string(id, `${field}[${position}]`))
      const reason = string(row.reason ?? '', `plan.replans[${index}].reason`)
      if (reason.length > REPLAN_LIMITS.decisionChars) {
        throw new Error(`workflow result plan.replans[${index}].reason is over the ${REPLAN_LIMITS.decisionChars}-character bound`)
      }
      const addedTaskIds = idList(row.addedTaskIds ?? [], `plan.replans[${index}].addedTaskIds`)
      const updatedTaskIds = idList(row.updatedTaskIds ?? [], `plan.replans[${index}].updatedTaskIds`)
      const removedTaskIds = idList(row.removedTaskIds ?? [], `plan.replans[${index}].removedTaskIds`)
      if (addedTaskIds.length + updatedTaskIds.length + removedTaskIds.length > REPLAN_LIMITS.maxEdits) {
        throw new Error(`workflow result plan.replans[${index}] names more edits than the ${REPLAN_LIMITS.maxEdits} limit`)
      }
      return {
        version,
        wave,
        decision: decision as ReplanDecision['decision'],
        reason,
        addedTaskIds,
        updatedTaskIds,
        removedTaskIds,
        reordered: row.reordered === true,
      }
    })
  if (planReplans.length > REPLAN_LIMITS.maxBoundaries) {
    throw new Error(`workflow result plan.replans has ${planReplans.length} rows; the boundary limit is ${REPLAN_LIMITS.maxBoundaries}`)
  }
  const applied = planReplans.filter(row => row.decision === 'applied')
  if (planVersion > 1) {
    if (applied.length === 0) {
      throw new Error('workflow result plan.version claims a replan but plan.replans records no applied merge')
    }
    if (applied[applied.length - 1]!.version !== planVersion) {
      throw new Error(`workflow result plan.version ${planVersion} disagrees with the last applied merge (version ${applied[applied.length - 1]!.version})`)
    }
    for (let index = 1; index < applied.length; index++) {
      if (applied[index]!.version <= applied[index - 1]!.version) {
        throw new Error('workflow result plan.replans applied versions must strictly increase')
      }
    }
  }
  const tasks = array(root.tasks, 'tasks').map((item, index) => {
    const task = record(item, `tasks[${index}]`)
    const taskStatus = string(task.status, `tasks[${index}].status`) as (typeof TASK_STATUSES)[number]
    if (!TASK_STATUSES.includes(taskStatus)) {
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
      ...originGoalIdField(task.originGoalId, `tasks[${index}].originGoalId`),
      status: taskStatus,
      attempts: array(task.attempts, `tasks[${index}].attempts`).map((attempt, a) => {
        const entry = record(attempt, `tasks[${index}].attempts[${a}]`)
        return {
          attempt: number(entry.attempt, `tasks[${index}].attempts[${a}].attempt`),
          execution: entry.execution === null ? null : executionResult(entry.execution, `tasks[${index}].attempts[${a}].execution`),
          verification: entry.verification === null ? null : verificationResult(entry.verification, `tasks[${index}].attempts[${a}].verification`),
          passed: entry.passed === true,
          ...entry.route === undefined ? {} : { route: string(entry.route, `tasks[${index}].attempts[${a}].route`) },
          ...entry.resubmitted === true ? { resubmitted: true } : {},
          ...entry.judgeRetried === true ? { judgeRetried: true } : {},
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
      || !sameOptionalStrings(planTask.writesPaths, task.writesPaths)
      || planTask.originGoalId !== task.originGoalId) {
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
  // The deadline is user-configurable (default 0 = unlimited): the report must
  // carry exactly the configured value — any other non-negative integer is a
  // report from a different configuration, not from this one.
  const timeoutMs = limits.timeoutMs === undefined ? undefined : number(limits.timeoutMs, 'limits.timeoutMs')
  if (timeoutMs !== undefined && timeoutMs !== 0 && timeoutMs !== config.timeoutMs) {
    throw new Error(`workflow result ran under a ${timeoutMs} ms deadline but the plugin enforces ${config.timeoutMs} ms`)
  }
  const childTimeoutMs = limits.childTimeoutMs === undefined ? undefined : number(limits.childTimeoutMs, 'limits.childTimeoutMs')
  // Reports written before the childTimeoutMs key existed carry no value;
  // a 0 from an old script means "ran under the old 10-minute default", which
  // validates only when the configured budget is still that default.
  // Anything else must match the configured budget exactly.
  if (childTimeoutMs !== undefined && childTimeoutMs !== config.childTimeoutMs
    && !(childTimeoutMs === 0 && config.childTimeoutMs === 600_000)) {
    throw new Error(`workflow result ran under a ${childTimeoutMs} ms child budget but the plugin enforces ${config.childTimeoutMs} ms`)
  }
  if (maxConcurrency !== config.maxConcurrency || maxRetries !== config.maxRetries || maxTasks !== config.maxTasks) {
    throw new Error('workflow result limits do not match the configured limits')
  }
  // A planner-failure fallback splits the objective into contiguous segments of at
  // most taskTextChars characters. The segment count follows from the splitter, not
  // from maxTasks and not from `ceil(chars / taskTextChars)` either: a boundary that
  // backs off a surrogate pair (or moves onto a break) adds a segment, and a cap one
  // segment short would reject the very fallback the script was forced to build.
  // Every other source keeps the configured cap.
  // The request builder always budgets the child cap for the larger of maxTasks
  // and the fallback segment count, because the planner can fail after the request
  // was built. The report check must allow that budget even when the plan that
  // arrives is the planner's own (fewer tasks, same request-level cap).
  const fallbackTaskCap = Math.max(maxTasks, shardCountFor(objective, TASK_LIMITS.taskTextChars))
  const taskCap = source === 'fallback' ? fallbackTaskCap : maxTasks
  if (tasks.length > taskCap) {
    throw new Error(`workflow result has ${tasks.length} tasks but maxTasks is ${maxTasks}`)
  }
  if (source === 'fallback') {
    // The fallback must obey the same per-task text bound as a planner task; it is
    // a size limit on one task, not a reason to drop part of the objective.
    for (let index = 0; index < planTasks.length; index++) {
      const planTask = planTasks[index]!
      for (const field of ['objective', 'expectedOutput', 'context'] as const) {
        if (planTask[field].length > TASK_LIMITS.taskTextChars) {
          throw new Error(
            `workflow result fallback plan.tasks[${index}].${field} is ${planTask[field].length} characters, over the ${TASK_LIMITS.taskTextChars}-character per-task limit`,
          )
        }
      }
    }
    // A fallback plan is not authored text, it is the caller's objective cut up by
    // `splitObjective`. Check that content directly: the segments must be exactly
    // what the splitter produces, which also means the objective is carried whole
    // and no character was trimmed, re-ordered, or dropped.
    //
    // The serialized aggregate budget is deliberately not applied here. It bounds
    // task text that a planner or a caller authored, and JSON escaping inflates an
    // objective past it without adding any work: 32,000 quote characters serialize
    // to ~67,000 characters across eight segments, which used to reject a fallback
    // that carried nothing but the caller's own 32,000 characters. Exact segment
    // equality is the stronger check that check was standing in for.
    const expectedSegments = splitObjective(objective, TASK_LIMITS.taskTextChars)
    if (planTasks.length !== expectedSegments.length) {
      throw new Error(
        `workflow result fallback plan has ${planTasks.length} tasks but the objective splits into ${expectedSegments.length}`,
      )
    }
    for (let index = 0; index < expectedSegments.length; index++) {
      if (planTasks[index]!.objective !== expectedSegments[index]) {
        throw new Error(
          `workflow result fallback plan.tasks[${index}].objective is not segment ${index + 1} of the request objective`,
        )
      }
    }
  }
  if (tasks.length > 0) {
    // The plugin sizes the child cap from the task count: exact for a caller plan,
    // the configured maximum for a planner or fallback plan. Anything outside that
    // window did not come from this plugin's request builder.
    const budget = routeBudgetFor(config)
    // The request builder adds the bounded replan-boundary children when the run
    // carries a replan token, so the window has to allow them: a report is not
    // invalid for spending planner calls the merge was allowed to make.
    const minimumAgents = maxTotalAgentsFor(tasks.length, maxRetries, budget)
    const maximumAgents = maxTotalAgentsFor(fallbackTaskCap, maxRetries, budget, REPLAN_LIMITS.maxBoundaries)
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
        if (!attempt.verification!.checkedEvidence.every(item =>
          item.kind.trim() !== '' && item.locator.trim() !== '' && item.finding.trim() !== '')) {
          throw new Error(`workflow result task ${task.id} has a passed attempt whose checked evidence entries must have non-empty kind, locator and finding`)
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
          && !claimsChange(task, objective)
          && QUESTION_INTENT.test(objective)
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
      // A blocked task is accounted for like a failed one, but with its own wording:
      // "did not run" still has to be reported once with a reason that names the
      // upstream task that stopped it (thin design §2).
      if (task.status !== 'failed' && task.status !== 'blocked') continue
      const entries = incomplete.filter(item => item.taskId === task.id)
      if (entries.length !== 1 || entries[0]!.reason.trim() === '') {
        throw new Error(
          `workflow result task ${task.id} ${task.status === 'blocked' ? 'is blocked but is not reported exactly once in incomplete with a non-empty reason' : 'failed but is not reported exactly once in incomplete with a non-empty reason'}`,
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
    ? { planner: [], worker: [], verifier: [], supervisor: [], synthesizer: [] }
    : routeLabels(root.routing, 'routing')
  // Dead routes (`src/script.ts` route health): optional, because a run that lost
  // no route — and every report from an older build — carries none, and bounded
  // here as a second line of defence against a script that ignored its own bound.
  const deadRoutes = root.deadRoutes === undefined
    ? []
    : deadRouteTrail(root.deadRoutes, 'deadRoutes', HARD_LIMITS.deadRoute.routes)
  // Stop cause and guard settlement (round 70): optional, because a report from an
  // older build carries neither, but validated when present — a stop cause outside
  // the four the run can actually produce would make the presentation layer say
  // something no code path did.
  const stopRoot = root.stop === undefined ? undefined : record(root.stop, 'stop')
  const stopCause = stopRoot === undefined ? undefined : enumeration(stopRoot.cause, STOP_CAUSES, 'stop.cause')
  const guardRoot = root.guard === undefined ? undefined : record(root.guard, 'guard')
  const guardFindings = guardRoot === undefined ? undefined : number(guardRoot.findings, 'guard.findings')
  if (guardFindings !== undefined && guardFindings < 0) {
    throw new Error('workflow result guard.findings must not be negative')
  }
  const guardTerminated = guardRoot === undefined ? undefined : number(guardRoot.terminated, 'guard.terminated')
  if (guardTerminated !== undefined && guardTerminated < 0) {
    throw new Error('workflow result guard.terminated must not be negative')
  }
  const synthesisRoot = root.synthesis === undefined ? {} : record(root.synthesis, 'synthesis')
  const fallbackMode = config.synthesis === 'model' ? 'model' : 'deterministic'
  const synthesisMode = string(synthesisRoot.mode ?? fallbackMode, 'synthesis.mode')
  if (synthesisMode !== 'deterministic' && synthesisMode !== 'model') {
    throw new Error(`workflow result synthesis.mode must be "deterministic" or "model", got "${synthesisMode}"`)
  }
  return {
    schemaVersion: 'grok-workflow/v1',
    status: status as FinalStatus,
    routes,
    ...deadRoutes.length === 0 ? {} : { deadRoutes },
    routing,
    synthesis: {
      mode: synthesisMode,
      ...synthesisRoot.error === undefined ? {} : { error: string(synthesisRoot.error, 'synthesis.error') },
      ...synthesisRoot.summary === undefined ? {} : { summary: string(synthesisRoot.summary, 'synthesis.summary') },
      ...synthesisRoot.review === undefined ? {} : { review: string(synthesisRoot.review, 'synthesis.review') },
    },
    objective: string(root.objective, 'objective'),
    plan: {
      source: source as WorkflowReport['plan']['source'],
      tasks: planTasks,
      ...planWaves === undefined ? {} : { waves: planWaves },
      ...planVersion === 1 ? {} : { version: planVersion },
      ...planReplans.length === 0 ? {} : { replans: planReplans },
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
      ...childTimeoutMs === undefined ? {} : { childTimeoutMs },
    },
    ...stopCause === undefined ? {} : { stop: { cause: stopCause } },
    ...guardFindings === undefined || guardTerminated === undefined
      ? {}
      : { guard: { findings: guardFindings, terminated: guardTerminated } },
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
      supervisor: chainLabelsFor(config.roles.supervisor),
      synthesizer: chainLabelsFor(config.roles.synthesizer),
    },
    synthesis: { mode: config.synthesis === 'model' ? 'model' : 'deterministic' },
    limits: {
      maxConcurrency: config.maxConcurrency,
      maxRetries: config.maxRetries,
      maxTasks: config.maxTasks,
      maxTotalAgents: 0,
      ...config.timeoutMs === 0 ? {} : { timeoutMs: config.timeoutMs },
      childTimeoutMs: config.childTimeoutMs,
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
 *
 * Only unrecovered failures count. A verified task carries retry history in its
 * own `attempts` (the rendered row says `verified (2 attempts)`), but an attempt
 * that a later attempt recovered says nothing about this run's outcome: counting
 * it printed `COMPLETED` followed by `Failures: 1 infrastructure`, which reads as
 * a failure on a run where every task passed. That line exists to tell a dead
 * provider from work that fell short, and neither is true once the retry landed.
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
    // A verified task's failed attempts were all recovered by the attempt that
    // verified it, so they are history, not failures.
    if (task.status === 'verified') continue
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

/**
 * What a stopped run achieved, in the two numbers a reader needs before deciding
 * whether to send the same request again.
 */
export interface StopTally {
  /** Tasks that verified. */
  done: number
  /** Tasks that did not verify. */
  left: number
  /** Tasks the plan named. */
  total: number
}

/**
 * How far a run got, counted off its own task rows.
 * @param report - validated report.
 * @returns Verified, unfinished and total counts.
 */
export function stopTally(report: WorkflowReport): StopTally {
  const done = report.tasks.filter(task => task.status === 'verified').length
  return { done, left: report.tasks.length - done, total: report.tasks.length }
}

/**
 * The plain-language account of a run that stopped instead of finishing.
 *
 * Requirement (round 70): a cancel used to read as a machine sentence — "was
 * cancelled before the whole run finished" — which left the reader unable to
 * tell a plugin unload from their own stop from a timeout, and with no idea
 * whether anything survived. This sentence names the cause in everyday words,
 * says what was achieved, and tells the reader that resending continues.
 *
 * @param report - validated report; `stop` carries the cause.
 * @param lang - language of the sentence.
 * @returns The sentence, or undefined when the run recorded no stop cause.
 */
export function stopNarration(report: WorkflowReport, lang: 'zh' | 'en', inFlight?: number): string | undefined {
  const cause = report.stop?.cause
  if (cause === undefined) return undefined
  const { done, left, total } = stopTally(report)
  const zh = lang === 'zh'
  const why = zh
    ? {
      unloaded: '这次是插件在运行中被卸载（或升级）才停的，不是超时，也不是你手动停的。',
      caller: '这次是你自己停的，不算失败。',
      deadline: '这次是到了时限被自动叫停的，不是你的操作。',
      engine: '这次是内部执行引擎出错停下的，不是你的操作。',
    }[cause]
    : {
      unloaded: 'This run was stopped because the plugin was unloaded (or upgraded) while it was running — not a timeout, and not a manual stop.',
      caller: 'You stopped this run on purpose, so it is not a failure.',
      deadline: 'This run was stopped automatically when its time limit ran out, not by anything you did.',
      engine: 'This run stopped because the execution engine failed underneath it, not because of anything you did.',
    }[cause]
  // A run cut before any task row existed has nothing to count: "0 finished and
  // nothing left over" would read as a clean sweep of no work, so it says the
  // truth instead — nothing had produced a result yet.
  const outcome = zh
    ? total === 0
      ? '这次还没跑出任何一项任务的结果。'
      : left === 0
        ? `已经做完 ${done} 项，没有剩下的。`
        : done === 0
          ? `一项都还没做完，${left} 项没动。`
          : `已经做完 ${done} 项，还剩 ${left} 项没做完。`
    : total === 0
      ? 'No task had produced a result yet.'
      : left === 0
        ? `All ${done} item(s) were finished, with nothing left over.`
        : done === 0
          ? `None of the ${left} item(s) were finished.`
          : `${done} item(s) were finished and ${left} are still unfinished.`
  // The resume half is only true for a stop that kept its work, which is every
  // cause above: `keepCancelledWork` repairs the stopped value instead of
  // discarding it, and a failure report simply has nothing to keep.
  const running = inFlight === undefined || inFlight <= 0 ? '' : zh
    ? `；停下时还有 ${inFlight} 个子代理在跑，它们也记进了恢复点`
    : `; the ${inFlight} child call(s) still running were written to the checkpoint too`
  const resume = zh
    ? `原样再发一次就接着跑，已经做好的不会重做${running}。`
    : `Sending the same request again picks up from here; work already finished is not redone${running}.`
  // Three sentences, not one run-on: Chinese joins them without a space, English
  // needs the break or the ledger prints "manual stop.All 0 item(s) were finished".
  const joiner = zh ? '' : ' '
  return `${why}${joiner}${outcome}${joiner}${resume}`
}

/**
 * Who ended the run, for the fixed guard line.
 *
 * `none` is a completed run: nothing cancelled it.
 */
export interface GuardConclusion {
  /** Findings the liveness guard recorded (capped by `GUARDIAN_LIMITS.maxFindings`). */
  findings: number
  /** Subagent calls the guard terminated. Zero by construction today. */
  terminated: number
  /** What ended the run. */
  by: StopCause | 'none'
}

/**
 * The guard settlement a report itself carries, as a renderable conclusion.
 *
 * A report produced by a run records `guard` (findings and terminations) and
 * `stop` (what ended it), so any later renderer — the read-only report tool, a
 * PTC call, the ledger — can print the same fixed line without being handed the
 * live guardian.
 * @param report - validated report.
 * @returns The conclusion, or undefined when the report predates guard accounting.
 */
export function guardOf(report: WorkflowReport): GuardConclusion | undefined {
  if (report.guard === undefined) return undefined
  return { findings: report.guard.findings, terminated: report.guard.terminated, by: report.stop?.cause ?? 'none' }
}

/**
 * The report's fixed tail line: what the guard saw and who ended the round.
 *
 * The guard is invisible otherwise — it watches child calls, it never cancels the
 * workflow, and its findings only reached the progress panel — so a reader had no
 * way to tell "the watchdog was watching and killed nothing" from "nothing was
 * watching". One fixed line answers that, in both languages.
 *
 * @param guard - settlement the run observed.
 * @param lang - language of the line.
 * @returns One line, never empty.
 */
export function guardLine(guard: GuardConclusion, lang: 'zh' | 'en'): string {
  const zh = lang === 'zh'
  const ended = zh
    ? {
      unloaded: '本轮由插件卸载取消',
      caller: '本轮由你取消',
      deadline: '本轮由时限取消',
      engine: '本轮由内部错误取消',
      none: '本轮无人取消（正常跑完）',
    }[guard.by]
    : {
      unloaded: 'cancelled by the plugin unload',
      caller: 'cancelled by the caller',
      deadline: 'cancelled by the deadline',
      engine: 'cancelled by an engine error',
      none: 'nobody cancelled this round (it finished on its own)',
    }[guard.by]
  const killed = guard.terminated
  if (zh) {
    return `守卫：${guard.findings} 条发现，${killed === 0 ? '未终止任何子代理' : `终止了 ${killed} 个子代理`}；${ended}。`
  }
  return `Guard: ${guard.findings} finding(s), ${killed === 0 ? 'no subagent was terminated' : `${killed} subagent(s) terminated`}; ${ended}.`
}

/**
 * Options for {@link renderReport}. `showDiagnostics` opens the ledger lines
 * (Model routes / Deadline / Route switches / Errors). `handoff` appends the
 * fixed four-line handoff block (交接契约, zh) rendered by `src/handoff/`.
 * The contract itself is validated by that module; this function only renders
 * an already-validated contract and never changes the main report flow.
 */
export interface RenderReportOptions {
  showDiagnostics?: boolean
  /** Validated handoff contract to append (zh block). */
  handoff?: HandoffContract
  /** Validated handoff contract to append (en block, after the zh block). */
  handoffEn?: HandoffContract
  /**
   * Guard settlement to print as the report's fixed last line.
   *
   * Absent when the caller has no guard to report (a bare renderer, a test, a
   * PTC call), which is why it is not read off the report: "no finding was
   * recorded" and "nothing was watching" are different facts.
   */
  guard?: GuardConclusion
  /** Child calls still running when the run stopped (resume hint detail). */
  inFlight?: number
  /**
   * Attach the complete technical audit trail (`src/report-audit.ts`) as the
   * report's tail, after the guard line.
   *
   * Off by default, and deliberately so: this view is parsed back by
   * `src/carryover.ts` and asserted by many suites, so the default text has to
   * stay exactly what it is. The base view keeps its own `MAX_RENDER_CHARS`
   * bound; the attached section carries its own `AUDIT_MAX_CHARS` bound, so
   * "the answer was truncated" and "the record was truncated" stay two
   * different, separately readable facts.
   */
  auditTrail?: boolean
}

/** Render a concise model-facing view; the canonical JSON remains available to PTC.
 *
 * B plan: machine diagnostics (Model routes / Deadline / Route switches /
 * overflows / Uncertainties / Errors) render only when `opts.showDiagnostics`
 * is true (default false). Final answer / Confirmed evidence / task rows /
 * Incomplete always render.
 */
/**
 * The draft number a *passing* summary review names, read off the script's own string.
 *
 * One reader for both the ledger line and the host (`src/run.ts` marks that draft's
 * progress row), so the two cannot disagree about which draft was shipped. Only
 * `check=pass verify=pass` counts: a rejected draft, and the deterministic fallback
 * (which records no verdict at all), are not shipped drafts.
 * @param review - `report.synthesis.review`, or anything.
 * @returns the 1-based draft number, or undefined when nothing passed.
 */
export function shippedSummaryDraft(review: unknown): number | undefined {
  if (typeof review !== 'string') return undefined
  const match = /(?:^|\s)check=pass\s+verify=pass\s+drafts=(\d+)/.exec(review)
  if (match === null) return undefined
  const draft = Number(match[1])
  return Number.isInteger(draft) && draft >= 1 ? draft : undefined
}

/**
 * What the summary gate ended with, as the script's own marker states it.
 *
 * Two facts share one line, and they are never both true: a draft shipped
 * (`check=pass verify=pass drafts=N`), or every draft was rejected
 * (`check=fail verify=pass drafts=N reason=<one line>`, or the verify stage's mirror
 * image). The second fact exists because "no draft passed" without the reason that
 * stopped it leaves the progress page able to say only that something went wrong.
 */
export type SummaryGateOutcome =
  | { kind: 'shipped', draft: number }
  | { kind: 'rejected', drafts: number, stage: 'check' | 'verify', reason: string }

/**
 * The shape a *rejected* marker is read with: the two stage verdicts, the bounded draft
 * count, then the reason as the rest of the line.
 *
 * `reason=` is last on purpose — a reason quoting `drafts=3` therefore cannot move the
 * parse, because the earlier, leftmost occurrence is the one the writer put there.
 */
const SUMMARY_GATE_REJECTED = /(?:^|\s)check=(pass|fail)\s+verify=(pass|fail)\s+drafts=(\d+)\s+reason=(.*)$/

/**
 * Read the gate's outcome off `report.synthesis.review`.
 *
 * One reader for the two things a run can hand in — the draft that shipped, or the
 * rejection verdict with its last failing stage and reason — so the ledger line and the
 * host's progress event cannot disagree. A marker that names neither (no draft was ever
 * produced, the deterministic narrative failed the gate, or the string is malformed) is
 * not an outcome: guessing one would turn "nothing was recorded" into a claim.
 * @param review - `report.synthesis.review`, or anything.
 * @returns the outcome, or undefined when the marker states none.
 */
export function summaryGateOutcome(review: unknown): SummaryGateOutcome | undefined {
  if (typeof review !== 'string') return undefined
  const shipped = shippedSummaryDraft(review)
  if (shipped !== undefined) return { kind: 'shipped', draft: shipped }
  const match = SUMMARY_GATE_REJECTED.exec(review)
  if (match === null) return undefined
  const check = match[1]
  const verify = match[2]
  // Both words cannot be alike: the gate stops at the first stage that fails, and
  // `check=pass verify=pass` was already read as a shipped draft above.
  if (check === verify) return undefined
  const drafts = Number(match[3])
  if (!Number.isInteger(drafts) || drafts < 1) return undefined
  // The reason is the rest of the line. A marker without one claims a rejection and says
  // nothing about why, which is exactly the state this reader exists to end.
  const reason = match[4]!.replace(/\s+/g, ' ').trim()
  if (reason === '') return undefined
  return { kind: 'rejected', drafts, stage: check === 'fail' ? 'check' : 'verify', reason }
}

export function renderReport(report: WorkflowReport, opts?: RenderReportOptions): string {
  const verified = report.tasks.filter(task => task.status === 'verified').length
  const lines: string[] = [
    `Grok workflow: ${report.status.toUpperCase()}`,
    `Objective: ${oneLine(report.objective, 300)}`,
    `Plan: ${report.plan.source}; ${report.tasks.length} task(s); ${verified} verified`,
  ]
  // A5: a single-wave plan says why it is single. Without the sentence a reader
  // cannot tell a one-line job from a plan that could not run in parallel, and the
  // difference is the whole question "did the team actually work together?".
  const waveCount = report.plan.waves === undefined ? undefined : report.plan.waves.length
  const waveReason = planWaveReason(report.plan.tasks, waveCount, 'en')
  if (waveReason !== undefined) lines.push(`Wave reason: ${waveReason}`)
  const failures = failureSummary(report)
  if (failures.length > 0) {
    lines.push(`Failures: ${failures.map(entry => `${entry.count} ${entry.category}`).join(', ')}`)
  }
  if (report.plan.failure !== undefined && report.plan.failure !== null && report.plan.failure.category !== undefined) {
    lines.push(`Plan failure: ${report.plan.failure.class} (${report.plan.failure.category})`)
  }
  // Per-wave rows (Wave 3): the wave a task belongs to is part of what happened, so a
  // multi-wave plan renders one heading per wave. A single-wave plan has nothing to
  // group and keeps the flat list it always had.
  const waveOfTask = new Map<string, number>()
  if (report.plan.waves !== undefined && report.plan.waves.length > 1) {
    report.plan.waves.forEach((ids, wave) => { for (const id of ids) waveOfTask.set(id, wave) })
  }
  let renderedWave = -1
  for (const task of report.tasks) {
    const attempts = task.attempts.length
    const wave = waveOfTask.get(task.id)
    if (wave !== undefined && wave !== renderedWave) {
      renderedWave = wave
      lines.push(`Wave ${wave + 1}/${report.plan.waves!.length}:`)
    }
    lines.push(`- ${task.id}: ${task.status} (${attempts} attempt${attempts === 1 ? '' : 's'}) — ${oneLine(task.title, 160)}`)
    // A blocked task reports the same evidence line a failed one does: "did not run"
    // is not a pass, and its reason names the upstream task that stopped it.
    if (task.status === 'failed' || task.status === 'blocked') {
      const category = categoryOfTask(task)
      lines.push(`  incomplete${category === undefined ? '' : ` (${category})`}: ${oneLine(task.error || task.expectedOutput, 500)}`)
    }
  }
  if (report.confirmed.length > 0) {
    lines.push('Confirmed evidence:')
    for (const item of report.confirmed.slice(0, 12)) {
      lines.push(`- ${item.taskId}: ${oneLine(item.criterion, 200)} → ${oneLine(item.evidence, 400)}`)
    }
    if (report.confirmed.length > 12) {
      lines.push(`- … +${report.confirmed.length - 12} more (see the canonical structured result)`)
    }
  }
  if (report.incomplete.length > 0) {
    lines.push('Incomplete:')
    for (const item of report.incomplete.slice(0, 12)) {
      lines.push(`- ${item.taskId}${item.category === undefined ? '' : ` (${item.category})`}: ${oneLine(item.reason, 500)}`)
    }
    if (report.incomplete.length > 12) {
      lines.push(`- … +${report.incomplete.length - 12} more (see the canonical structured result)`)
    }
  }
  if (report.synthesis.summary !== undefined) {
    lines.push('Final answer:')
    lines.push(oneLine(report.synthesis.summary, 2_000))
  }
  if (report.synthesis.review !== undefined) {
    // Sec.3-3: the gate's verdict, so "checked + reviewed" is readable rather
    // than assumed from the absence of a rejection. The shipped-draft number rides
    // on the same line: the machine string stays exactly as the script wrote it, and
    // the reader learns which draft the answer came from in the same breath.
    const outcome = summaryGateOutcome(report.synthesis.review)
    // The suffix reads the parsed value rather than the rendered review: the review is
    // cut at 240 characters, and a rejection whose reason fell past that cut would
    // otherwise say "rejected" and nothing about why.
    const suffix = outcome === undefined
      ? ''
      : outcome.kind === 'shipped'
        ? ` · final: draft ${outcome.draft}`
        : ` · rejected: draft ${outcome.drafts} (${outcome.stage}: ${oneLine(outcome.reason, 160)})`
    lines.push(`Summary review: ${oneLine(report.synthesis.review, 240)}${suffix}`)
  }
  if (report.synthesis.error !== undefined) {
    lines.push(`Synthesis: model narrative unavailable (${oneLine(report.synthesis.error, 300)}); the report above is complete`)
  }
  // Handoff (task-10): the fixed four-line contract, rendered by `src/handoff/`
  // as an independent section. This block is additive — it never changes the
  // rows above, so the main report flow stays untouched.
  if (opts?.handoff !== undefined) {
    lines.push(renderHandoffSection(opts.handoff, 'zh'))
  }
  if (opts?.handoffEn !== undefined) {
    lines.push(renderHandoffSection(opts.handoffEn, 'en'))
  }
  // B plan + t47: diagnostics are opt-in via showDiagnostics. t46 saw the
  // Model-routes line appear only after a settings save and could not tell
  // "no chain configured" from "the line was skipped", so when enabled an
  // unset role says `inherit` instead of silently vanishing. Default (off):
  // none of the ledger lines below render.
  if (opts?.showDiagnostics === true) {
    const configured = (['planner', 'worker', 'verifier', 'supervisor', 'synthesizer'] as const)
      .map(role => [role, report.routing[role]] as const)
    lines.push(`Model routes: ${configured.map(([role, chain]) => `${role}=${chain.length === 0 ? 'inherit' : chain.join(' → ')}`).join('; ')}`)
    if (report.limits.timeoutMs !== undefined) {
      lines.push(`Deadline: ${report.limits.timeoutMs} ms per run (enforced by the plugin)`)
    }
    if (report.limits.childTimeoutMs !== undefined) {
      lines.push(`Child budget: ${report.limits.childTimeoutMs} ms per call (the run stops waiting on one call after this long)`)
    }
    const routeFailures = report.routes.filter(entry => entry.outcome === 'failed')
    if (routeFailures.length > 0) {
      lines.push('Route switches:')
      for (const entry of routeFailures.slice(0, 12)) {
        lines.push(`- ${entry.role} attempt ${entry.attempt} via ${entry.route}: ${entry.failureClass ?? 'unknown'} — ${oneLine(entry.reason ?? '', 200)}`)
      }
    }
    // Dead routes: a route the run stopped preferring after it failed the same
    // transport family twice. This is a *choice* the run made, not a failure, so
    // it belongs in the ledger and not in the answer — and the reader needs it to
    // explain why a task that names three routes only ever called two of them.
    if (report.deadRoutes !== undefined && report.deadRoutes.length > 0) {
      lines.push('Dead routes (two consecutive transport failures; live routes are tried first):')
      for (const entry of report.deadRoutes) {
        lines.push(`- ${entry.route}: ${entry.class} (${entry.streak} in a row)`)
      }
    }
  // Overflow is not failure and never appears above: a full lane yields to the
  // next route instead of failing. Record which calls yielded so the reader can
  // tell "used route B because route A was full" apart from "route A failed".
  // C1 cross-run hint reuses the same fields: a deprioritized busy-with-room
  // lane is recorded as `<label> (cross-run hint)` in `skippedBusy`. Local
  // yielding and cross-run hints render under separate headings so the reader
  // can tell "this run's own cap was full" apart from "another live run
  // configured the same label (approximate, run-level only)".
    const overflows = report.routes.filter(entry => entry.skippedBusy !== undefined && entry.skippedBusy.length > 0)
    const hintOverflows = overflows.filter(entry => entry.skippedBusy!.some(label => label.includes('(cross-run hint)')))
    const localOverflows = overflows.filter(entry => !entry.skippedBusy!.some(label => label.includes('(cross-run hint)')))
    if (localOverflows.length > 0) {
      lines.push('Route overflows (full lane yielded, not failures):')
      for (const entry of localOverflows.slice(0, 12)) {
        const skipped = entry.skippedBusy!.join(', ')
        const waited = entry.queuedMs !== undefined && entry.queuedMs > 0 ? ` (waited ${entry.queuedMs} ms)` : ''
        lines.push(`- ${entry.role} attempt ${entry.attempt} via ${entry.route}: skipped full ${skipped}${waited}`)
      }
    }
    if (hintOverflows.length > 0) {
      lines.push('Route overflows (cross-run hint):')
      for (const entry of hintOverflows.slice(0, 12)) {
        const skipped = entry.skippedBusy!.join(', ')
        const waited = entry.queuedMs !== undefined && entry.queuedMs > 0 ? ` (waited ${entry.queuedMs} ms)` : ''
        lines.push(`- ${entry.role} attempt ${entry.attempt} via ${entry.route}: skipped busy ${skipped}${waited}`)
      }
    }
    if (report.errors.length > 0) {
      lines.push('Errors:')
      for (const item of report.errors.slice(0, 12)) {
        // The category is what separates "the provider was down" from "the work was
        // short", and the ledger already rendered it — the report dropped it, so one
        // error read as two different rows depending on which view an operator had
        // open (D-126). Both views now print `- <phase> (<category>): <message>`, with
        // the same 500-character bound on the message.
        lines.push(`- ${item.phase}${item.category === undefined ? '' : ` (${item.category})`}: ${oneLine(item.message, 500)}`)
      }
    }
  }
  // Uncertainties stay OUTSIDE the diagnostics gate on purpose (B plan):
  //  1. they are truthful caveats a reader needs, not a routing ledger, and
  //  2. carry-over parses `Uncertainties:` back out of an earlier round's
  //     rendered report, so hiding them would silently drop that context from
  //     every follow-up round (`src/carryover.ts`).
  if (report.uncertainties.length > 0) {
    lines.push('Uncertainties:')
    for (const item of report.uncertainties.slice(0, 12)) {
      lines.push(`- ${item.taskId}: ${oneLine(item.text, 400)}`)
    }
  }
  // Round 70: a stopped run says, in one plain sentence, why it stopped and what
  // survived. It sits outside the diagnostics gate because it is the answer's
  // status, not routing bookkeeping — and it is the only place a reader learns
  // that resending continues instead of restarting.
  const narration = stopNarration(report, 'en', opts?.inFlight)
  if (narration !== undefined) lines.push(`Stop: ${narration}`)
  // The fixed guard line closes the report, always last: what the watchdog saw and
  // who ended the round. It comes from the caller's settlement, or from the report
  // itself when the run recorded one — a report that carries a guard must render it.
  const guard = opts?.guard ?? guardOf(report)
  if (guard !== undefined) lines.push(guardLine(guard, 'en'))
  const text = lines.join('\n')
  const view = text.length <= MAX_RENDER_CHARS
    ? text
    : `${text.slice(0, MAX_RENDER_CHARS)}\n[output truncated; see the canonical structured result for full details]`
  // The audit trail is the report's tail: appended after the guard line, after
  // everything the answer renders, and bounded on its own (D-132). The answer
  // half is byte-identical whether or not it is attached.
  return opts?.auditTrail === true ? `${view}\n\n${renderAuditTrail(report)}` : view
}

function oneLine(value: string, max: number): string {
  const compact = value.replace(/\s+/g, ' ').trim()
  return compact.length <= max ? compact : `${compact.slice(0, max - 1)}…`
}
