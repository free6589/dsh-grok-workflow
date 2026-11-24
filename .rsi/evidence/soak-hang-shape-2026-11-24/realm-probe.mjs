// Which clock path can the workflow guest realm actually reach?
//
//   node realm-probe.mjs
//
// src/script.ts picks its timer like this (lines 151-198):
//   hasHostTimer = typeof setTimeout === 'function' && typeof clearTimeout === 'function'
//   sleepCell    = SharedArrayBuffer + Atomics.waitAsync available
//   canRaceCalls = hasHostTimer || sleepCell !== null
//   afterDelay() = setTimeout if hasHostTimer, else Atomics.waitAsync, else no-op
//   raceChildCall() = if !canRaceCalls, watchNoTimer() (the Date.now() polling fallback)
//
// The engine builds the guest realm as `vm.createContext({})` and then assigns
// exactly the six names agent/parallel/pipeline/phase/log/args
// (see @deepseek-ai/dsh-workflow-ptc/src/guest-source.ts, WORKFLOW_GUEST_SOURCE ->
// class WorkflowExecution, `this.context = vm.createContext({}, ...)`). No host
// function is added to the realm, so the question reduces to "what does an empty
// node:vm context contain?" — measured here, not assumed.
import vm from 'node:vm'

const context = vm.createContext({}, { name: 'workflow:realm-probe' })
for (const key of ['agent', 'parallel', 'pipeline', 'phase', 'log', 'args']) context[key] = undefined

const report = vm.runInContext(
  `({
    setTimeout: typeof setTimeout,
    clearTimeout: typeof clearTimeout,
    setInterval: typeof setInterval,
    SharedArrayBuffer: typeof SharedArrayBuffer,
    Atomics: typeof Atomics,
    waitAsync: typeof Atomics === 'object' && Atomics !== null ? typeof Atomics.waitAsync : '(no Atomics)',
    Date_now: typeof Date.now,
    hasHostTimer: typeof setTimeout === 'function' && typeof clearTimeout === 'function',
    hasSleepCell: (function () {
      try {
        if (typeof SharedArrayBuffer !== 'function') return false
        if (typeof Atomics !== 'object' || Atomics === null) return false
        if (typeof Atomics.waitAsync !== 'function') return false
        new Int32Array(new SharedArrayBuffer(4))
        return true
      } catch (error) { return 'threw: ' + String(error) }
    })()
  })`,
  context,
)

console.log('guest realm (vm.createContext({}) + the six injected names):')
for (const [key, value] of Object.entries(report)) console.log(`  ${key} = ${JSON.stringify(value)}`)
console.log('')
console.log(`hasHostTimer    = ${report.hasHostTimer}`)
console.log(`sleepCell != null = ${report.hasSleepCell}`)
console.log(`canRaceCalls    = ${report.hasHostTimer || report.hasSleepCell === true}`)
console.log(
  (report.hasHostTimer || report.hasSleepCell === true)
    ? '=> afterDelay() uses the Atomics.waitAsync branch; watchNoTimer() (the no-timer fallback) is UNREACHABLE in a real run.'
    : '=> no timer and no Atomics cell: the run would fall through to watchNoTimer().',
)

// Prove the Atomics branch really waits without spinning: 200 ms of wall clock,
// ~0 ms of CPU. `.then()` rather than top-level await on purpose — Node 26.8.1
// leaves an `await Atomics.waitAsync(...).value` at top level permanently
// unsettled (the pending wait does not ref the loop for TLA), which is exactly
// why src/script.ts's afterDelay() uses `.then(run, run)` and not `await`.
const before = process.cpuUsage()
const cell = new Int32Array(new SharedArrayBuffer(4))
const started = Date.now()
// A ref'd keepalive, because Atomics.waitAsync's own promise does not ref the
// event loop (measured: without this line the process exits 0 before the
// timeout resolves). A real run always has ref'd work pending.
const keepalive = setTimeout(() => {}, 2000)
Atomics.waitAsync(cell, 0, 0, 200).value.then(value => {
  clearTimeout(keepalive)
  const wall = Date.now() - started
  const cpu = process.cpuUsage(before)
  console.log('')
  console.log(`Atomics.waitAsync(200ms): result=${JSON.stringify(value)} wall=${wall}ms cpu_user=${(cpu.user / 1000).toFixed(2)}ms cpu_sys=${(cpu.system / 1000).toFixed(2)}ms`)
  console.log(wall >= 190 && cpu.user + cpu.system < 50000 ? '=> a real 200ms wait at ~0 CPU: not a spin.' : '=> UNEXPECTED: see numbers above.')
  console.log('note: the wait promise does NOT ref the event loop (a keepalive timer was needed here); a real run always has ref\'d child work pending.')
})
