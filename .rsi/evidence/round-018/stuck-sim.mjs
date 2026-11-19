// Simulate: one run, one hanging child, guardian fires before the deadline.
const budgetMs = 6000
let now = 1000000
const clock = () => now
// Minimal harness: import the built guardian.
const m = await import('/home/fish/projects_mine/dsh-grok-workflow/lib/guardian.js')
let cancelled = null
const g = m.createRunGuardian({ runId: '', childBudgetMs: budgetMs, now: clock, schedule: () => ({}), cancelSchedule: () => {} })
g.agentStart({ id: 'run-sim-1' }, { seq: 1, label: 'hanging worker', childId: 'c1' })
g.adopt({ id: 'run-sim-1', cancel: (r) => { cancelled = r } })
console.log('adopted: children=' + g.stats.children + ' open=' + g.stats.open + ' timerArmed=' + g.stats.timerArmed)
now += 5999
console.log('t+5999 findings=' + g.check().length + ' cancelled=' + (cancelled !== null))
// Keep the run silent: no end, no new start.
now += 1
const findings = g.check()
console.log('t+6000 findings=' + findings.length + ' signal=' + findings[0]?.signal + ' action=' + findings[0]?.action)
console.log('cancelled once: ' + (cancelled !== null) + ' reason-head=' + String(cancelled).slice(0, 80))
// Second sweep: no second cancel.
now += 120000
console.log('t+126000 findings=' + g.check().length)
const s = g.finish('cancelled')
console.log('settlement: cancelled=' + s.cancelled + ' findings=' + s.findings.length)
// Unload path on a second guardian.
const state = {}
const g2 = m.createRunGuardian({ runId: 'r2', childBudgetMs: 10000, state, schedule: () => ({}), cancelSchedule: () => {} })
g2.adopt({ id: 'r2', cancel: () => {} })
console.log('registry before unload=' + m.registeredRunGuardians(state))
console.log('unloaded=' + m.unloadRunGuardians(state) + ' after=' + m.registeredRunGuardians(state))
