import * as vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { GUARDIAN_LIMITS, guardianChildBudgetMs } from '../src/guardian.js'
import { assertWorkflowReport } from '../src/report.js'
import { buildWorkflowRequest, WORKFLOW_SCRIPT } from '../src/script.js'
import {
  CHILD_TIMEOUT_MAX_MS,
  CHILD_TIMEOUT_MS,
  COMMAND_TIMEOUT_SECONDS,
  GUARDIAN_ADJUDICATION_MS,
  GUARDIAN_MAX_WAITS,
  GUARDIAN_WAIT_MS,
  childTimeoutReason,
  guardianDecision,
  guardianWaitMs,
  parseGuardianVerdict,
  resolveChildTimeoutMs,
  timeoutTierAt,
} from '../src/timeout.js'
import { execution, task, verification } from './fixtures.js'
import { roleOf, runWorkflowScript, taskFromPrompt, type ScriptAgent } from './helpers.js'

/**
 * Q6 cooperative timeout: three tiers, one funnel, no host-side child kill.
 *
 * The pure tiering is tested directly; the script's own race is tested by driving the
 * generated script with a child that never answers. That combination is the point of
 * the design: the policy is a pure function, and the mechanism is the script's
 * `agent()` race, which is the only place a single call can be given up on.
 */

const OBJECTIVE = 'Ship the cooperative timeout'

function config() {
  return resolveConfig({ maxConcurrency: 2, maxTasks: 4 })
}

function args(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const request = buildWorkflowRequest(OBJECTIVE, [task('a')], config())
  return { ...request.args, ...overrides }
}

/** Args and config whose deadline agrees, for the Q8 rule-B cases. */
function argsFor(timeoutMs: number, overrides: Record<string, unknown> = {}): { args: Record<string, unknown>, config: ReturnType<typeof config> } {
  const resolved = resolveConfig({ maxConcurrency: 2, maxTasks: 4, timeoutMs })
  const request = buildWorkflowRequest(OBJECTIVE, [task('a')], resolved)
  return { args: { ...request.args, ...overrides }, config: resolved }
}

describe('timeout tiers', () => {
  it('names the cheapest tier that has been exceeded', () => {
    const budget = { commandMs: 120_000, taskMs: 600_000, runMs: 3_600_000 }
    expect(timeoutTierAt(0, budget)).toBeUndefined()
    expect(timeoutTierAt(119_999, budget)).toBeUndefined()
    // At the command bound the command has overrun: blame the command, not the run.
    expect(timeoutTierAt(120_000, budget)).toBe('command')
    expect(timeoutTierAt(599_999, budget)).toBe('command')
    expect(timeoutTierAt(600_000, budget)).toBe('task')
    expect(timeoutTierAt(3_600_000, budget)).toBe('task')
    // A tighter run deadline is reported as the run's own bound.
    expect(timeoutTierAt(30_000, { commandMs: 120_000, taskMs: 600_000, runMs: 10_000 })).toBe('run')
  })

  it('ignores a value that is not a positive finite number', () => {
    const budget = { commandMs: 120_000, taskMs: 600_000 }
    expect(timeoutTierAt(Number.NaN, budget)).toBeUndefined()
    expect(timeoutTierAt(-1, budget)).toBeUndefined()
  })

  it('clamps a caller value into the range the script enforces', () => {
    expect(resolveChildTimeoutMs(undefined)).toBe(CHILD_TIMEOUT_MS)
    expect(resolveChildTimeoutMs('')).toBe(CHILD_TIMEOUT_MS)
    expect(resolveChildTimeoutMs(0)).toBe(CHILD_TIMEOUT_MS)
    expect(resolveChildTimeoutMs(-5)).toBe(CHILD_TIMEOUT_MS)
    expect(resolveChildTimeoutMs(1)).toBe(1_000)
    expect(resolveChildTimeoutMs('120000')).toBe(120_000)
    expect(resolveChildTimeoutMs(CHILD_TIMEOUT_MAX_MS * 4)).toBe(CHILD_TIMEOUT_MAX_MS)
  })

  it('says which call overran and what to do next', () => {
    const reason = childTimeoutReason('worker', CHILD_TIMEOUT_MS)
    expect(reason).toContain('worker')
    expect(reason).toContain('10 minute')
    expect(reason).toContain('retry')
  })

  it('keeps the command tier at two minutes', () => {
    expect(COMMAND_TIMEOUT_SECONDS).toBe(120)
  })

  it('gives the host watchdog the same ten-minute child budget as the script race', () => {
    // The script race is the per-call path; the host guardian is the tier that is
    // live in a realm without timers (it cancels the run instead of one call). If
    // the two budgets drifted, the documented "10 minutes, then stop" would hold
    // on one tier and lie on the other.
    expect(GUARDIAN_LIMITS.childTimeoutCapMs).toBe(CHILD_TIMEOUT_MS)
    expect(guardianChildBudgetMs(3_600_000)).toBe(CHILD_TIMEOUT_MS)
    expect(guardianChildBudgetMs(30_000)).toBe(30_000)
    // An unlimited run arms no watchdog: it is not second-guessed.
    expect(guardianChildBudgetMs(0)).toBe(0)
  })
})

describe('Q8 guardian adjudication: the pure wait/kill rules', () => {
  it('parses a verdict from every shape the child may answer in', () => {
    expect(parseGuardianVerdict({ verdict: 'wait' })).toBe('wait')
    expect(parseGuardianVerdict({ verdict: 'kill', reason: 'wedged' })).toBe('kill')
    expect(parseGuardianVerdict({ reply: 'WAIT' })).toBe('wait')
    expect(parseGuardianVerdict('kill')).toBe('kill')
    // Unreadable is not a wait: the caller treats undefined as a kill.
    expect(parseGuardianVerdict({ verdict: 'extend' })).toBeUndefined()
    expect(parseGuardianVerdict({})).toBeUndefined()
    expect(parseGuardianVerdict(null)).toBeUndefined()
    expect(parseGuardianVerdict('maybe')).toBeUndefined()
  })

  it('grants the wait slice under rule B: never past the run deadline', () => {
    expect(GUARDIAN_WAIT_MS).toBe(300_000)
    expect(guardianWaitMs(600_000)).toBe(300_000)
    // 剩多少给多少: a deadline 2 minutes away grants 2 minutes, not 5.
    expect(guardianWaitMs(120_000)).toBe(120_000)
    // Nothing left (or nonsense) grants nothing, and the run stops anyway.
    expect(guardianWaitMs(0)).toBe(0)
    expect(guardianWaitMs(-5)).toBe(0)
    expect(guardianWaitMs(Number.NaN)).toBe(0)
    expect(guardianWaitMs(Number.POSITIVE_INFINITY)).toBe(GUARDIAN_WAIT_MS)
  })

  it('decides wait or kill from the verdict, the wait count and the deadline', () => {
    expect(GUARDIAN_MAX_WAITS).toBe(2)
    // A wait verdict with budget room extends.
    expect(guardianDecision('wait', 0, 600_000)).toBe('wait')
    expect(guardianDecision('wait', 1, 300_000)).toBe('wait')
    // Twice is the ceiling: the third ask is a kill without another AI call.
    expect(guardianDecision('wait', 2, 600_000)).toBe('kill')
    // A deadline that cannot afford the slice is a kill (rule B).
    expect(guardianDecision('wait', 0, 0)).toBe('kill')
    // A kill verdict and an unreadable one are both kills.
    expect(guardianDecision('kill', 0, 600_000)).toBe('kill')
    expect(guardianDecision(undefined, 0, 600_000)).toBe('kill')
  })

  it('mirrors the wait rules in the generated script', () => {
    // The script owns the timer, so the rules it applies must be the ones the
    // pure functions promise; the mirror pins make a drift a test failure.
    expect(WORKFLOW_SCRIPT).toContain('function guardianWaitMs(verdict, waits, remainingMs)')
    expect(WORKFLOW_SCRIPT).toContain('function parseGuardianVerdict(value)')
    expect(WORKFLOW_SCRIPT).toContain('function adjudicateStall(guard, waits, remainingMs, done)')
    expect(GUARDIAN_ADJUDICATION_MS).toBe(60_000)
  })
})

describe('the timer the engine realm really has', () => {
  it('races on Atomics.waitAsync where no setTimeout exists', async () => {
    // test/helpers.ts builds its realm the way the engine does: vm.createContext
    // plus the five hook globals and args. That realm has no timer, which is why
    // the script must not rely on one.
    const bare = vm.createContext({})
    expect(vm.runInContext('typeof setTimeout', bare)).toBe('undefined')
    expect(vm.runInContext('typeof setInterval', bare)).toBe('undefined')
    // What every ECMAScript realm does have, and what the race uses instead.
    expect(vm.runInContext('typeof Atomics.waitAsync', bare)).toBe('function')
    expect(vm.runInContext('typeof SharedArrayBuffer', bare)).toBe('function')
    // The wait resolves by timeout without blocking the realm.
    const outcome = await vm.runInContext(`(async () => {
      const cell = new Int32Array(new SharedArrayBuffer(4))
      const ticket = Atomics.waitAsync(cell, 0, 0, 20)
      return ticket.async ? await ticket.value : ticket.value
    })()`, bare) as string
    expect(outcome).toBe('timed-out')
  })
})

describe('the generated script enforces the child budget', () => {
  it('carries the race, the default bound and the two-minute command rule', () => {
    expect(WORKFLOW_SCRIPT).toContain('function raceChildCall(promise, guard)')
    // The race is armed in the realm the engine actually builds: that realm has no
    // setTimeout, so the timer is Atomics.waitAsync, with setTimeout preferred
    // where a host injects one.
    expect(WORKFLOW_SCRIPT).toContain("const hasHostTimer = typeof setTimeout === 'function'")
    expect(WORKFLOW_SCRIPT).toContain('Atomics.waitAsync(sleepCell, 0, 0, delay)')
    expect(WORKFLOW_SCRIPT).toContain('const canRaceCalls = hasHostTimer || sleepCell !== null;')
    expect(WORKFLOW_SCRIPT).toContain('})(args ? args.childTimeoutMs : undefined);')
    expect(WORKFLOW_SCRIPT).toContain("return 600000;")
    expect(WORKFLOW_SCRIPT).toContain('CHILD_TIMEOUT:')
    // Every prompt that tells a child to run commands carries the rule.
    expect(WORKFLOW_SCRIPT.match(/timeout 120/g)?.length ?? 0).toBeGreaterThanOrEqual(4)
  })

  it('mirrors the guardian adjudication constants from src/timeout.ts', () => {
    // Q8: the script carries its own copy of the wait rules, so a drifted
    // mirror would change the behaviour the pure functions promise.
    expect(WORKFLOW_SCRIPT).toContain('const GUARDIAN_WAIT_MS = 300000;')
    expect(WORKFLOW_SCRIPT).toContain('const GUARDIAN_MAX_WAITS = 2;')
    expect(WORKFLOW_SCRIPT).toContain('const GUARDIAN_ADJUDICATION_MS = 60000;')
    // Rule B lives in the script too: the deadline anchors at the run's start.
    expect(WORKFLOW_SCRIPT).toContain('const runStartedAtMs = nowMs();')
    expect(WORKFLOW_SCRIPT).toContain('runStartedAtMs + runDeadlineMs')
  })

  it('settles a hung call as a timeout and retries the task instead of failing the run', async () => {
    let workerCalls = 0
    const agent: ScriptAgent = async (prompt, options) => {
      const role = roleOf(options.label)
      const taskValue = taskFromPrompt(prompt)
      if (role === 'worker') {
        workerCalls += 1
        if (workerCalls === 1) {
          // A child that never answers: the script must stop waiting on its own.
          return await new Promise(() => {})
        }
        return execution(`did ${taskValue.id}`)
      }
      return verification(taskValue as never)
    }
    // A real run's realm has no timers, so the mechanism is exercised with one
    // injected: the same code path a realm with a timer would take.
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({ childTimeoutMs: 1_000 }),
      agent,
      { setTimeout, clearTimeout },
    )
    expect(workerCalls).toBe(2)
    const first = run.report.tasks[0]?.attempts[0]
    expect(first?.failure?.class).toBe('timeout')
    expect(first?.failure?.reason).toContain('child budget')
    // The run survives: the retry verified, so the report is a completion.
    expect(run.report.status).toBe('completed')
    expect(() => assertWorkflowReport(run.report, OBJECTIVE, config())).not.toThrow()
  }, 20_000)

  it('extends a stalled call once the guardian says wait, and the child still wins', async () => {
    // Q8 flow: the call loses the first slice, the guardian model judges from
    // the evidence and says wait, the extension arms for the SAME call, and a
    // child that answers during the extension completes the run without a retry.
    let guardianCalls = 0
    let workerCalls = 0
    const agent: ScriptAgent = async (prompt, options) => {
      if (options.label === 'guardian adjudication') {
        guardianCalls += 1
        return { verdict: 'wait', reason: 'large edit still plausible' }
      }
      const taskValue = taskFromPrompt(prompt)
      if (roleOf(options.label) === 'worker') {
        workerCalls += 1
        if (workerCalls === 1) {
          // Wedged for 2.5 s, then it lands: inside the extension window.
          await new Promise(resolve => setTimeout(resolve, 2_500))
          return execution('did a late')
        }
        return execution(`did ${taskValue.id}`)
      }
      return verification(taskValue as never)
    }
    const deadline = 30_000
    const { args: runArgs, config: runConfig } = argsFor(deadline, { childTimeoutMs: 1_000, guardianModel: { model: 'guardian-x' } })
    // No injected timer: this is the engine-shaped realm (bare context plus the five
    // hooks), so the extension comes from the same Atomics timer a real run uses.
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, runArgs, agent)
    expect(guardianCalls).toBe(1)
    expect(run.report.status).toBe('completed')
    expect(run.report.tasks[0]?.attempts).toHaveLength(1)
    expect(() => assertWorkflowReport(run.report, OBJECTIVE, runConfig)).not.toThrow()
  }, 20_000)

  it('kills the stalled call when the guardian says kill, and the task still retries', async () => {
    let guardianCalls = 0
    let workerCalls = 0
    const agent: ScriptAgent = async (prompt, options) => {
      if (options.label === 'guardian adjudication') {
        guardianCalls += 1
        return { verdict: 'kill', reason: 'no reason to expect progress' }
      }
      const taskValue = taskFromPrompt(prompt)
      if (roleOf(options.label) === 'worker') {
        workerCalls += 1
        if (workerCalls === 1) return await new Promise(() => {})
        return execution(`did ${taskValue.id}`)
      }
      return verification(taskValue as never)
    }
    const deadline = 30_000
    const { args: runArgs, config: runConfig } = argsFor(deadline, { childTimeoutMs: 1_000, guardianModel: { model: 'guardian-x' } })
    // Real-realm path again: kill verdict, then the bounded retry.
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, runArgs, agent)
    // One adjudication per stall, then the timeout path the task already knows.
    expect(guardianCalls).toBe(1)
    expect(workerCalls).toBe(2)
    expect(run.report.status).toBe('completed')
    expect(run.report.tasks[0]?.attempts[0]?.failure?.class).toBe('timeout')
    expect(() => assertWorkflowReport(run.report, OBJECTIVE, runConfig)).not.toThrow()
  }, 20_000)

  it('stops granting waits at the run deadline without asking the guardian again (rule B)', async () => {
    let guardianCalls = 0
    let workerCalls = 0
    const agent: ScriptAgent = async (prompt, options) => {
      if (options.label === 'guardian adjudication') {
        guardianCalls += 1
        return { verdict: 'wait' }
      }
      const taskValue = taskFromPrompt(prompt)
      if (roleOf(options.label) === 'worker') {
        workerCalls += 1
        if (workerCalls === 1) return await new Promise(() => {})
        return execution(`did ${taskValue.id}`)
      }
      return verification(taskValue as never)
    }
    const deadline = 3_000
    const { args: runArgs, config: runConfig } = argsFor(deadline, { childTimeoutMs: 1_000, guardianModel: { model: 'guardian-x' } })
    // 3 s deadline: the first slice expires at 1 s (guardian says wait, the
    // extension is truncated to the remaining ~2 s), and the second expiry
    // finds no room left — the kill fires without a second AI call.
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, runArgs, agent, { setTimeout, clearTimeout })
    expect(guardianCalls).toBe(1)
    expect(workerCalls).toBe(2)
    expect(run.report.status).toBe('completed')
    expect(() => assertWorkflowReport(run.report, OBJECTIVE, runConfig)).not.toThrow()
  }, 20_000)

  it('fails a stalled call straight to retry when no guardian is configured', async () => {
    // The pre-Q8 behaviour is preserved byte for byte when guardianModel is unset —
    // and it runs on the realm's own Atomics timer, no injected setTimeout.
    let workerCalls = 0
    const agent: ScriptAgent = async (prompt, options) => {
      const taskValue = taskFromPrompt(prompt)
      if (roleOf(options.label) === 'worker') {
        workerCalls += 1
        if (workerCalls === 1) return await new Promise(() => {})
        return execution(`did ${taskValue.id}`)
      }
      return verification(taskValue as never)
    }
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      args({ childTimeoutMs: 1_000 }),
      agent,
    )
    expect(workerCalls).toBe(2)
    // The hung call is a *failure of that attempt*, not a dead run: the class the
    // report carries is what sends the task into its bounded retry.
    expect(run.report.tasks[0]?.attempts[0]?.failure?.class).toBe('timeout')
    expect(run.report.tasks[0]?.attempts[0]?.failure?.reason).toContain('child budget')
    expect(run.report.status).toBe('completed')
  }, 20_000)

  it('leaves a responsive call alone in the realm with no host timer', async () => {
    // The measured realm has no setTimeout; a call that answers is not delayed by
    // the armed Atomics wait, and the run records no timeout.
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, args(), async (prompt, options) => {
      const role = roleOf(options.label)
      const taskValue = taskFromPrompt(prompt)
      return role === 'worker' ? execution('done') : verification(taskValue as never)
    })
    expect(run.report.status).toBe('completed')
    expect(run.report.tasks[0]?.attempts[0]?.failure).toBeUndefined()
  })
})
