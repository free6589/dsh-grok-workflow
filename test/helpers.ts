import vm from 'node:vm'
import { parseMemberLabel } from '../src/naming.js'
import type { NormalizedTask, RoleName, WorkflowReport } from '../src/types.js'

export interface AgentCall {
  prompt: string
  label: string
  phase?: string
  schema?: unknown
  provider?: string
  model?: string
}

export type ScriptAgentOptions = { label: string; phase?: string; schema?: unknown; provider?: string; model?: string }

export type ScriptAgent = (prompt: string, options: ScriptAgentOptions) => Promise<unknown>

export interface ScriptRun {
  report: WorkflowReport
  events: string[]
  calls: AgentCall[]
}

/** Execute the real generated script in a Node VM with scripted agent hooks. */
export async function runWorkflowScript(
  script: string,
  args: Record<string, unknown>,
  agent: ScriptAgent,
): Promise<ScriptRun> {
  const events: string[] = []
  const calls: AgentCall[] = []
  const wrapped: ScriptAgent = async (prompt, options) => {
    calls.push({
      prompt,
      label: options.label,
      ...options.phase === undefined ? {} : { phase: options.phase },
      ...options.schema === undefined ? {} : { schema: options.schema },
      ...options.provider === undefined ? {} : { provider: options.provider },
      ...options.model === undefined ? {} : { model: options.model },
    })
    return agent(prompt, options)
  }
  const context = vm.createContext({
    agent: wrapped,
    phase: (title: string) => { events.push(`phase:${title}`) },
    log: (message: string) => { events.push(`log:${message}`) },
    args,
  })
  const report = await vm.runInContext(`(async () => {\n${script}\n})()`, context) as WorkflowReport
  return { report, events, calls }
}

/** Let pending host timers and microtasks settle. */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * The task a child was handed, read off the `TASK:` block of its prompt.
 *
 * A scripted verifier has to answer the task it actually received — a real
 * verifier copies the acceptance criteria verbatim (`verifyPrompt` says so), and
 * a fixture that hard-codes the criteria instead would silently stop matching
 * the moment the plan words a criterion differently.
 */
export function taskFromPrompt(prompt: string): NormalizedTask {
  const match = /TASK:\n(\{[\s\S]*?\})\n\n/.exec(prompt)
  if (match === null) throw new Error(`prompt carries no task JSON: ${prompt.slice(0, 120)}`)
  return JSON.parse(match[1]!) as NormalizedTask
}

/**
 * Read the role a user-visible member label names.
 *
 * Phase 2 (Issue #22 P1-1) replaced the machine labels (`grok-worker-t1-a2`) with
 * the words a user actually sees (`执行（尝试 2）`), so a scripted child identifies
 * its caller the same way a reader does — through `src/naming.ts`, which is the
 * same table the panel renders. A label the plugin did not produce yields
 * `undefined` instead of a guess.
 */
export function roleOf(label: string | undefined, language: 'zh' | 'en' = 'zh'): RoleName | undefined {
  return parseMemberLabel(label ?? '', language)?.role
}

/** Attempt number a user-visible member label carries (1 when it carries none). */
export function attemptOf(label: string | undefined, language: 'zh' | 'en' = 'zh'): number {
  return parseMemberLabel(label ?? '', language)?.attempt ?? 0
}

/**
 * The 1-based plan position a member belongs to, parsed from its group header.
 *
 * The stock panel groups a run by the exact `phase` string, so the header is where
 * a task's identity now lives: `任务 1 · Task a`.
 */
export function indexOfPhase(phase: string | undefined): number {
  const match = /(?:任务|Task) (\d+) ·/.exec(phase ?? '')
  return match === null ? 0 : Number(match[1])
}

/**
 * The fixture task id a member belongs to.
 *
 * Fixture titles are `Task <id>` (`test/fixtures.ts`), and the group header carries
 * the (possibly truncated) title and nothing else — an internal task id is never
 * shown to a user, which is the point of the change.
 */
export function idOfPhase(phase: string | undefined): string {
  const match = /· (.+)$/.exec(phase ?? '')
  if (match === null) return ''
  const title = match[1]!.replace(/…$/, '')
  const named = /^Task (.+)$/.exec(title)
  return named === null ? title : named[1]!
}
