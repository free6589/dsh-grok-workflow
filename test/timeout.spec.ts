import * as vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { GUARDIAN_LIMITS, guardianChildBudgetMs } from '../src/guardian.js'
import { assertWorkflowReport } from '../src/report.js'
import { buildWorkflowRequest, WORKFLOW_SCRIPT } from '../src/script.js'
import {
  CHILD_TIMEOUT_MAX_MS,
  COMMAND_TIMEOUT_SECONDS,
  DEFAULT_CHILD_TIMEOUT_MS,
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
import { roleOf, runWorkflowScript, settledWithin, taskFromPrompt, type ScriptAgent } from './helpers.js'

/**
 * A child that never answers on its own — but releases the process on exit.
 *
 * Node 22's `vm` silently drops the process when several sequential runs each
 * leave a cross-realm never-settling promise behind the script's `Atomics`
 * race (measured: five ordered `runWorkflowScript` runs with a bare
 * `new Promise(() => {})` worker exit 0 with no output after the first
 * `await`; Node 24+ and single runs are unaffected). A 30 s backstop is past
 * every timeout in this file (the longest slice is ~3 s), so no passing
 * assertion can observe it — it only lets the runner tear down cleanly.
 */
function hungChild(): Promise<never> {
  return new Promise<never>((_, reject) => {
    const timer = setTimeout(() => reject(new Error('hung-child backstop: the test ended without settling me')), 30_000)
    if (typeof timer === 'object' && timer !== null && typeof (timer as { unref?: unknown }).unref === 'function') {
      (timer as unknown as { unref(): void }).unref()
    }
  })
}

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

/** One second per-call budget, agreed between request and validation. */
function oneSecondBudget(): { args: Record<string, unknown>, config: ReturnType<typeof config> } {
  const resolved = resolveConfig({ maxConcurrency: 2, maxTasks: 4, childTimeoutMs: 1_000 })
  const request = buildWorkflowRequest(OBJECTIVE, [task('a')], resolved)
  return { args: request.args, config: resolved }
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
    expect(resolveChildTimeoutMs(undefined)).toBe(DEFAULT_CHILD_TIMEOUT_MS)
    expect(resolveChildTimeoutMs('')).toBe(DEFAULT_CHILD_TIMEOUT_MS)
    expect(resolveChildTimeoutMs(0)).toBe(DEFAULT_CHILD_TIMEOUT_MS)
    expect(resolveChildTimeoutMs(-5)).toBe(DEFAULT_CHILD_TIMEOUT_MS)
    expect(resolveChildTimeoutMs(1)).toBe(1_000)
    expect(resolveChildTimeoutMs('120000')).toBe(120_000)
    expect(resolveChildTimeoutMs(CHILD_TIMEOUT_MAX_MS * 4)).toBe(CHILD_TIMEOUT_MAX_MS)
  })

  it('says which call overran and what to do next', () => {
    const reason = childTimeoutReason('worker', DEFAULT_CHILD_TIMEOUT_MS)
    expect(reason).toContain('worker')
    expect(reason).toContain('120 minute')
    expect(reason).toContain('retry')
  })

  it('keeps the command tier at two minutes', () => {
    expect(COMMAND_TIMEOUT_SECONDS).toBe(120)
  })

  it('keeps the 120-minute base budget when no adjudicator is configured', () => {
    // The script race is the per-call path; the host guardian is the tier that is
    // live in a realm without timers (it cancels the run instead of one call). If
    // the two budgets drifted, the documented "120 minutes, then stop" would hold
    // on one tier and lie on the other.
    expect(GUARDIAN_LIMITS.childTimeoutCapMs).toBe(DEFAULT_CHILD_TIMEOUT_MS)
    expect(guardianChildBudgetMs(7_200_000)).toBe(DEFAULT_CHILD_TIMEOUT_MS)
    expect(guardianChildBudgetMs(30_000)).toBe(30_000)
    // An unlimited run arms no watchdog: it is not second-guessed.
    expect(guardianChildBudgetMs(0)).toBe(0)
  })

  it('covers the script wait window when a guardian route is configured', () => {
    // Regression for session-77a3f6fb turn 38: the host fired at 10 min while
    // the script was still inside its Q8 adjudication window, killing a child
    // that had shown 10 min of real progress. With a guardian configured the
    // host budget covers the script child budget plus the full wait extension
    // (GUARDIAN_MAX_WAITS slices), so the script's own verdict lands first.
    // The numbers live in timeout.ts; the script mirrors them (pinned below),
    // so the host reads the same source instead of a second copy.
    const adjudicationWindow = GUARDIAN_MAX_WAITS * GUARDIAN_ADJUDICATION_MS
    const waitExtension = GUARDIAN_MAX_WAITS * GUARDIAN_WAIT_MS
    const scriptWindow = DEFAULT_CHILD_TIMEOUT_MS + waitExtension + adjudicationWindow
    const hostGrace = GUARDIAN_LIMITS.checkIntervalMs
    expect(adjudicationWindow).toBe(120_000)
    expect(scriptWindow).toBe(7_920_000)
    // One host sweep interval is added after the script's last possible wait.
    // The window is capped by the base cap plus the extension, and by the run deadline.
    expect(guardianChildBudgetMs(30_000_000, DEFAULT_CHILD_TIMEOUT_MS)).toBe(scriptWindow + hostGrace)
    // No adjudicator keeps the base budget.
    expect(guardianChildBudgetMs(30_000_000, undefined)).toBe(DEFAULT_CHILD_TIMEOUT_MS)
    expect(guardianChildBudgetMs(30_000_000)).toBe(DEFAULT_CHILD_TIMEOUT_MS)
    // The run deadline still wins when it is shorter than the watchdog window.
    expect(guardianChildBudgetMs(30_000, DEFAULT_CHILD_TIMEOUT_MS)).toBe(30_000)
    expect(guardianChildBudgetMs(1_000_000, DEFAULT_CHILD_TIMEOUT_MS)).toBe(1_000_000)
    // Unlimited still disarms, even with a guardian configured.
    expect(guardianChildBudgetMs(0, DEFAULT_CHILD_TIMEOUT_MS)).toBe(0)
  })
})

describe('Q8 guardian adjudication: the pure wait/kill rules', () => {
  it('parses a verdict from every shape the child may answer in', () => {
    expect(parseGuardianVerdict({ verdict: 'wait' })).toBe('wait')
    expect(parseGuardianVerdict({ verdict: 'kill', reason: 'wedged' })).toBe('kill')
    expect(parseGuardianVerdict({ verdict: 'rescue', reason: 'lost', guidance: 'go on' })).toBe('rescue')
    expect(parseGuardianVerdict({ reply: 'WAIT' })).toBe('wait')
    expect(parseGuardianVerdict({ reply: 'RESCUE' })).toBe('rescue')
    expect(parseGuardianVerdict('kill')).toBe('kill')
    expect(parseGuardianVerdict('rescue')).toBe('rescue')
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
    // A rescue grants the same slice a wait would: the host interrupts and steers.
    expect(guardianDecision('rescue', 0, 600_000)).toBe('wait')
    expect(guardianDecision('rescue', 1, 300_000)).toBe('wait')
    expect(guardianDecision('rescue', 2, 600_000)).toBe('kill')
    expect(guardianDecision('rescue', 0, 0)).toBe('kill')
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
    // The wait resolves by timeout without blocking the realm. The vitest worker
    // can sleep through a realm-level settle (test/helpers.ts `settledWithin`),
    // so this probe holds its own clock and fails as itself inside its own budget
    // instead of as the runner's kill.
    const outcome = await settledWithin(
      vm.runInContext(`(async () => {
      const cell = new Int32Array(new SharedArrayBuffer(4))
      const ticket = Atomics.waitAsync(cell, 0, 0, 20)
      return ticket.async ? await ticket.value : ticket.value
    })()`, bare),
      15_000,
      'the bare-realm Atomics wait',
    ) as string
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
    expect(WORKFLOW_SCRIPT).toContain("return 7200000;")
    expect(WORKFLOW_SCRIPT).toContain('Math.min(7200000, Math.max(1000, Math.floor(parsed)));')
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
    // B3: the adjudication prompt carries the task's declared write paths, so
    // the judge knows what files a living child of this task should touch.
    expect(WORKFLOW_SCRIPT).toContain('task-declared write paths')
    // C3: the adjudicator may answer rescue with a guidance line; the script
    // broadcasts it on the log channel for the host to execute.
    expect(WORKFLOW_SCRIPT).toContain('rescue')
    expect(WORKFLOW_SCRIPT).toContain('guardian rescue seq=')
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
          return await hungChild()
        }
        return execution(`did ${taskValue.id}`)
      }
      return verification(taskValue as never)
    }
    // A real run's realm has no timers, so the mechanism is exercised with one
    // injected: the same code path a realm with a timer would take.
    // The validation config agrees on the 1 s budget (see oneSecondBudget).
    const { args: runArgs, config: runConfig } = oneSecondBudget()
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      { ...runArgs },
      agent,
      { setTimeout, clearTimeout },
    )
    expect(workerCalls).toBe(2)
    const first = run.report.tasks[0]?.attempts[0]
    expect(first?.failure?.class).toBe('timeout')
    expect(first?.failure?.reason).toContain('child budget')
    // The run survives: the retry verified, so the report is a completion.
    expect(run.report.status).toBe('completed')
    expect(() => assertWorkflowReport(run.report, OBJECTIVE, runConfig)).not.toThrow()
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
    const { args: runArgs, config: runConfig } = argsFor(deadline, { guardianModel: { model: 'guardian-x' } })
    const budgeted = resolveConfig({ maxConcurrency: 2, maxTasks: 4, timeoutMs: deadline, childTimeoutMs: 1_000, roles: { worker: [{ model: 'guardian-x' }] } } as never)
    const budgetedRequest = buildWorkflowRequest(OBJECTIVE, [task('a')], budgeted)
    const budgetedArgs = { ...budgetedRequest.args, guardianModel: { model: 'guardian-x' } }
    // No injected timer: this is the engine-shaped realm (bare context plus the five
    // hooks), so the extension comes from the same Atomics timer a real run uses.
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, budgetedArgs, agent)
    expect(guardianCalls).toBe(1)
    expect(run.report.status).toBe('completed')
    expect(run.report.tasks[0]?.attempts).toHaveLength(1)
    expect(() => assertWorkflowReport(run.report, OBJECTIVE, budgeted)).not.toThrow()
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
        if (workerCalls === 1) return await hungChild()
        return execution(`did ${taskValue.id}`)
      }
      return verification(taskValue as never)
    }
    const deadline = 30_000
    const budgeted = resolveConfig({ maxConcurrency: 2, maxTasks: 4, timeoutMs: deadline, childTimeoutMs: 1_000, roles: { worker: [{ model: 'guardian-x' }] } } as never)
    const budgetedRequest = buildWorkflowRequest(OBJECTIVE, [task('a')], budgeted)
    const budgetedArgs = { ...budgetedRequest.args, guardianModel: { model: 'guardian-x' } }
    // Real-realm path again: kill verdict, then the bounded retry.
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, budgetedArgs, agent)
    // One adjudication per stall, then the timeout path the task already knows.
    expect(guardianCalls).toBe(1)
    expect(workerCalls).toBe(2)
    expect(run.report.status).toBe('completed')
    expect(run.report.tasks[0]?.attempts[0]?.failure?.class).toBe('timeout')
    expect(() => assertWorkflowReport(run.report, OBJECTIVE, budgeted)).not.toThrow()
  }, 20_000)

  it('stops granting waits at the run deadline without asking the guardian again (rule B)', async () => {    let guardianCalls = 0
    let workerCalls = 0
    const agent: ScriptAgent = async (prompt, options) => {
      if (options.label === 'guardian adjudication') {
        guardianCalls += 1
        return { verdict: 'wait' }
      }
      const taskValue = taskFromPrompt(prompt)
      if (roleOf(options.label) === 'worker') {
        workerCalls += 1
        if (workerCalls === 1) return await hungChild()
        return execution(`did ${taskValue.id}`)
      }
      return verification(taskValue as never)
    }
    const deadline = 3_000
    const budgeted = resolveConfig({ maxConcurrency: 2, maxTasks: 4, timeoutMs: deadline, childTimeoutMs: 1_000, roles: { worker: [{ model: 'guardian-x' }] } } as never)
    const budgetedRequest = buildWorkflowRequest(OBJECTIVE, [task('a')], budgeted)
    const budgetedArgs = { ...budgetedRequest.args, guardianModel: { model: 'guardian-x' } }
    // 3 s deadline: the first slice expires at 1 s (guardian says wait, the
    // extension is truncated to the remaining ~2 s), and the second expiry
    // finds no room left — the kill fires without a second AI call.
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, budgetedArgs, agent, { setTimeout, clearTimeout })
    expect(guardianCalls).toBe(1)
    expect(workerCalls).toBe(2)
    expect(run.report.status).toBe('completed')
    expect(() => assertWorkflowReport(run.report, OBJECTIVE, budgeted)).not.toThrow()
  }, 20_000)

  it('broadcasts a rescue line when the guardian says rescue, and grants the slice', async () => {
    // C3 flow: the adjudicator judges the stalled child steerable, the script
    // logs `guardian rescue …` for the host to execute, and the call gets the
    // same slice a wait would — a child that answers during it still wins.
    let guardianCalls = 0
    let workerCalls = 0
    const agent: ScriptAgent = async (prompt, options) => {
      if (options.label === 'guardian adjudication') {
        guardianCalls += 1
        return { verdict: 'rescue', reason: 'waiting on input', guidance: 'stop waiting, continue with what you have' }
      }
      const taskValue = taskFromPrompt(prompt)
      if (roleOf(options.label) === 'worker') {
        workerCalls += 1
        if (workerCalls === 1) {
          await new Promise(resolve => setTimeout(resolve, 2_500))
          return execution('did a late')
        }
        return execution(`did ${taskValue.id}`)
      }
      return verification(taskValue as never)
    }
    const deadline = 30_000
    const budgeted = resolveConfig({ maxConcurrency: 2, maxTasks: 4, timeoutMs: deadline, childTimeoutMs: 1_000, roles: { worker: [{ model: 'guardian-x' }] } } as never)
    const budgetedRequest = buildWorkflowRequest(OBJECTIVE, [task('a')], budgeted)
    const budgetedArgs = { ...budgetedRequest.args, guardianModel: { model: 'guardian-x' } }
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, budgetedArgs, agent)
    expect(guardianCalls).toBe(1)
    const rescueLine = run.events.find(event => event.startsWith('log:guardian rescue'))
    expect(rescueLine).toContain('guidance=stop waiting, continue with what you have')
    expect(run.report.status).toBe('completed')
    expect(run.report.tasks[0]?.attempts).toHaveLength(1)
    expect(() => assertWorkflowReport(run.report, OBJECTIVE, budgeted)).not.toThrow()
  }, 20_000)

  it('fails a stalled call straight to retry when no guardian is configured', async () => {
    // The pre-Q8 behaviour is preserved byte for byte when guardianModel is unset —
    // and it runs on the realm's own Atomics timer, no injected setTimeout.
    let workerCalls = 0
    const agent: ScriptAgent = async (prompt, options) => {
      const taskValue = taskFromPrompt(prompt)
      if (roleOf(options.label) === 'worker') {
        workerCalls += 1
        if (workerCalls === 1) return await hungChild()
        return execution(`did ${taskValue.id}`)
      }
      return verification(taskValue as never)
    }
    const { args: runArgs, config: runConfig } = oneSecondBudget()
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      { ...runArgs },
      agent,
    )
    expect(workerCalls).toBe(2)
    // The hung call is a *failure of that attempt*, not a dead run: the class the
    // report carries is what sends the task into its bounded retry.
    expect(run.report.tasks[0]?.attempts[0]?.failure?.class).toBe('timeout')
    expect(run.report.tasks[0]?.attempts[0]?.failure?.reason).toContain('child budget')
    expect(run.report.status).toBe('completed')
    expect(() => assertWorkflowReport(run.report, OBJECTIVE, runConfig)).not.toThrow()
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

  it('settles a hung call within budget in a realm with no timer at all', async () => {
    // Round-48 fallback: a realm with neither setTimeout nor Atomics.waitAsync
    // (`canRaceCalls === false`) used to await the child bare — a hung child
    // wedged the wave and every replan boundary after it. The fallback watches
    // the same settlement on the host clock (no timer armed) and rejects with
    // the same CHILD_TIMEOUT prefix, so the task retries instead of wedging.
    // The realm is built by text-sabotage of the two timer probes (the same
    // technique test/failure-paths.spec.ts uses), so the script under test is
    // otherwise byte-identical to the shipped one.
    expect(WORKFLOW_SCRIPT).toContain('const hasHostTimer = ')
    expect(WORKFLOW_SCRIPT).toContain("if (typeof Atomics.waitAsync !== 'function') return null;")
    const noTimerScript = WORKFLOW_SCRIPT
      .replace('const hasHostTimer = ', 'const hasHostTimer = false && ')
      .replace(
        "if (typeof Atomics.waitAsync !== 'function') return null;",
        'return null;',
      )
    expect(noTimerScript).toContain('const canRaceCalls = hasHostTimer || sleepCell !== null;')
    let workerCalls = 0
    const agent: ScriptAgent = async (prompt, options) => {
      const taskValue = taskFromPrompt(prompt)
      if (roleOf(options.label) === 'worker') {
        workerCalls += 1
        if (workerCalls === 1) return await hungChild()
        return execution(`did ${taskValue.id}`)
      }
      return verification(taskValue as never)
    }
    const { args: runArgs, config: runConfig } = oneSecondBudget()
    const startedAt = Date.now()
    // The fallback settles on the host clock, and the worker can sleep through
    // that settle (test/helpers.ts `settledWithin`), so the probe holds its own
    // clock: the case fails as its own named condition inside 15 s rather than
    // as the runner's kill.
    const run = await settledWithin(
      runWorkflowScript(noTimerScript, { ...runArgs }, agent),
      15_000,
      'the no-timer fallback run',
    )
    const elapsed = Date.now() - startedAt
    expect(workerCalls).toBe(2)
    expect(run.report.tasks[0]?.attempts[0]?.failure?.class).toBe('timeout')
    expect(run.report.tasks[0]?.attempts[0]?.failure?.reason).toContain('child budget')
    expect(run.report.status).toBe('completed')
    // Within budget (1 s slice; generous ceiling for loaded CI), never wedged.
    expect(elapsed).toBeLessThan(15_000)
    expect(() => assertWorkflowReport(run.report, OBJECTIVE, runConfig)).not.toThrow()
  }, 20_000)
})
