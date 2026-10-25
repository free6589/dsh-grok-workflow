import type { FinalStatus, WorkflowReport } from './types.js'
import type { ResolvedConfig } from './types.js'

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

/**
 * Enforce the report contract before a script result reaches the model.
 * The script is trusted code, but a malformed engine result must not be
 * presented as a successful workflow.
 */
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
      status: taskStatus,
      attempts: array(task.attempts, `tasks[${index}].attempts`).map((attempt, a) => {
        const entry = record(attempt, `tasks[${index}].attempts[${a}]`)
        return {
          attempt: number(entry.attempt, `tasks[${index}].attempts[${a}].attempt`),
          execution: entry.execution === null ? null : record(entry.execution, `tasks[${index}].attempts[${a}].execution`),
          verification: entry.verification === null ? null : record(entry.verification, `tasks[${index}].attempts[${a}].verification`),
          passed: entry.passed === true,
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
    if (planTasks[index]!.id !== tasks[index]!.id) {
      throw new Error(`workflow result task id mismatch at index ${index}`)
    }
  }
  const limits = record(root.limits, 'limits')
  const maxConcurrency = number(limits.maxConcurrency, 'limits.maxConcurrency')
  const maxRetries = number(limits.maxRetries, 'limits.maxRetries')
  const maxTasks = number(limits.maxTasks, 'limits.maxTasks')
  if (maxConcurrency !== config.maxConcurrency || maxRetries !== config.maxRetries || maxTasks !== config.maxTasks) {
    throw new Error('workflow result limits do not match the configured limits')
  }
  return {
    schemaVersion: 'grok-workflow/v1',
    status: status as FinalStatus,
    objective: string(root.objective, 'objective'),
    plan: {
      source: source as WorkflowReport['plan']['source'],
      tasks: planTasks,
      error: string(plan.error ?? '', 'plan.error'),
    },
    tasks: tasks as WorkflowReport['tasks'],
    confirmed: array(root.confirmed, 'confirmed').map((item, index) => {
      const entry = record(item, `confirmed[${index}]`)
      return {
        taskId: string(entry.taskId, `confirmed[${index}].taskId`),
        criterion: string(entry.criterion, `confirmed[${index}].criterion`),
        evidence: string(entry.evidence, `confirmed[${index}].evidence`),
      }
    }),
    incomplete: array(root.incomplete, 'incomplete').map((item, index) => {
      const entry = record(item, `incomplete[${index}]`)
      return {
        taskId: string(entry.taskId, `incomplete[${index}].taskId`),
        reason: string(entry.reason, `incomplete[${index}].reason`),
      }
    }),
    errors: array(root.errors, 'errors').map((item, index) => {
      const entry = record(item, `errors[${index}]`)
      return {
        phase: string(entry.phase, `errors[${index}].phase`),
        message: string(entry.message, `errors[${index}].message`),
      }
    }),
    uncertainties: array(root.uncertainties, 'uncertainties').map((item, index) => {
      const entry = record(item, `uncertainties[${index}]`)
      return {
        taskId: string(entry.taskId, `uncertainties[${index}].taskId`),
        text: string(entry.text, `uncertainties[${index}].text`),
      }
    }),
    limits: {
      maxConcurrency,
      maxRetries,
      maxTasks,
      maxTotalAgents: number(limits.maxTotalAgents, 'limits.maxTotalAgents'),
    },
  }
}

/** A failure report for a run that never produced a script result. */
export function failureReport(objective: string, config: ResolvedConfig, phase: string, message: string): WorkflowReport {
  return {
    schemaVersion: 'grok-workflow/v1',
    status: 'failed',
    objective,
    plan: { source: 'unavailable', tasks: [], error: message },
    tasks: [],
    confirmed: [],
    incomplete: [{ taskId: 'workflow', reason: message }],
    errors: [{ phase, message }],
    uncertainties: [],
    limits: {
      maxConcurrency: config.maxConcurrency,
      maxRetries: config.maxRetries,
      maxTasks: config.maxTasks,
      maxTotalAgents: 0,
    },
  }
}

/** Render a concise model-facing view; the canonical JSON remains available to PTC. */
export function renderReport(report: WorkflowReport): string {
  const verified = report.tasks.filter(task => task.status === 'verified').length
  const lines: string[] = [
    `Grok workflow: ${report.status.toUpperCase()}`,
    `Objective: ${oneLine(report.objective, 300)}`,
    `Plan: ${report.plan.source}; ${report.tasks.length} task(s); ${verified} verified`,
  ]
  for (const task of report.tasks) {
    const attempts = task.attempts.length
    lines.push(`- ${task.id}: ${task.status} (${attempts} attempt${attempts === 1 ? '' : 's'}) — ${oneLine(task.title, 160)}`)
    if (task.status === 'failed') {
      lines.push(`  incomplete: ${oneLine(task.error || task.expectedOutput, 500)}`)
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
      lines.push(`- ${item.taskId}: ${oneLine(item.reason, 500)}`)
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
