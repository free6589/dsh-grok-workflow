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
  globals: Record<string, unknown> = {},
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
    // The real guest realm exposes no timers (the engine injects only
    // agent/parallel/pipeline/phase/log/args), so a case that needs a timer has to
    // supply one explicitly — that is what `globals` is for.
    ...globals,
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
 * Await a run's result with the probe's own clock, not the test runner's.
 *
 * A case that hangs a child is proved by the *script's* child budget, and in the
 * engine's realm that budget is armed with `Atomics.waitAsync`: the sandbox is
 * built from an empty object, so it has no `setTimeout`, and the script falls
 * back to the timer every ECMAScript realm carries. That wait is a platform
 * delayed task, and a worker loop that has nothing else to do can leave it
 * unserviced for a long time — measured here, in this harness, as a run that
 * never settles at all: the hung call is placed, its budget never lands, no
 * retry is placed, and the only thing left to end the wait is vitest's own
 * 30 s kill. The reporter then prints "Test timed out" instead of the fact the
 * case exists to prove.
 *
 * Awaiting through here keeps a ref'd timer armed for the whole wait, so the
 * loop keeps waking while the budget is pending, and the wait is bounded by
 * this call instead of the runner: a settle that still does not arrive fails the
 * case with the named condition inside the probe's own budget. Nothing about the
 * child, the script or the assertion changes — only who owns the clock.
 *
 * @param promise - the run's result promise (or any settle being observed).
 * @param ms - the probe's own budget for that settle.
 * @param what - what is being awaited, for the failure message.
 * @returns the settled value; rethrows the settle's own error.
 */
export async function settledWithin<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  const state: { done: boolean, value?: T, error?: unknown, failed: boolean } = { done: false, failed: false }
  // The handlers never rethrow, so this chain cannot become an unhandled
  // rejection once the wait is abandoned.
  const tracked = promise.then(
    value => { state.done = true; state.value = value },
    error => { state.done = true; state.failed = true; state.error = error },
  )
  const deadline = Date.now() + ms
  while (!state.done) {
    if (Date.now() >= deadline) throw new Error(`${what} did not settle within ${ms} ms`)
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  await tracked
  if (state.failed) throw state.error
  return state.value as T
}

/**
 * Wait for a state a background round only produces once it has landed, on the probe's clock.
 *
 * The sibling of {@link settledWithin} for the cases that admit work behind the answer.
 * Such a round has two halves, and the second one is the one these cases need: the run
 * settles, and then the gate's own round ends — it delivers the report and closes the
 * session's steering channel in the same `finally` (`src/gate.ts`, `runChannelRound`).
 * Nothing on the public surface resolves at that instant, so a case that asserts after
 * merely *starting* a round reads a session that is still steering: its next message is
 * folded into the live run (`已收到，并入了正在跑的这一轮…`) instead of being routed by the
 * front desk, and a report it is waiting for has not been delivered yet.
 *
 * The wait is a re-read of the state the case is about to assert on, kept on a timer this
 * call owns: the loop holds a ref'd timer for its whole life (the same reason
 * `settledWithin` exists — the worker must not sleep through the settle), and a round that
 * never lands fails the case with this named condition inside the probe's own budget,
 * instead of as the runner's 30 s kill or as a receipt that reads like a product bug.
 *
 * @param condition - predicate over the state the case asserts on next.
 * @param ms - the probe's own budget for the landing.
 * @param what - what is being awaited, for the failure message.
 */
export async function landedWithin(condition: () => boolean, ms: number, what: string): Promise<void> {
  const deadline = Date.now() + ms
  for (;;) {
    if (condition()) return
    if (Date.now() >= deadline) throw new Error(`${what} did not land within ${ms} ms`)
    await new Promise(resolve => setTimeout(resolve, 20))
  }
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
