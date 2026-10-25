import vm from 'node:vm'
import type { WorkflowReport } from '../src/types.js'

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
