#!/usr/bin/env node
/**
 * Verification rig (not product code).
 *
 * Proves the hard constraint of this block: the *default* rendered text did not
 * move. It builds the same report twice — once with the committed renderer at
 * the base commit, once with the current renderer — and compares the bytes.
 *
 *   node default-view-parity.mjs <repoRoot> [baseCommit=1f70103]
 *
 * The base commit's `lib/` is exported with `git archive` into `<repoRoot>/.tmp/oldtree`
 * (gitignored scratch) and loaded as a second module instance, so both renderers
 * run their own validation and their own `MAX_RENDER_CHARS` bound. Nothing is
 * written outside `.tmp/`.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(process.argv[2] ?? process.cwd())
const baseCommit = process.argv[3] ?? '1f70103'
const oldTree = join(root, '.tmp', 'oldtree')

rmSync(oldTree, { recursive: true, force: true })
mkdirSync(oldTree, { recursive: true })
execFileSync('sh', ['-c', `git archive ${baseCommit} lib | tar -x -C ${oldTree}`], { cwd: root })

if (!existsSync(join(oldTree, 'lib', 'report.js'))) throw new Error(`no lib/report.js at ${baseCommit}`)

const oldR = await import(join(oldTree, 'lib', 'report.js'))
const newR = await import(join(root, 'lib', 'report.js'))
const oldC = await import(join(oldTree, 'lib', 'config.js'))
const newC = await import(join(root, 'lib', 'config.js'))

const config = { maxConcurrency: 2, maxTasks: 6, timeoutMs: 900_000 }
const cfgOld = oldC.resolveConfig(config)
const cfgNew = newC.resolveConfig(config)

const planTask = (id) => ({
  id,
  title: `Task ${id}`,
  objective: `Do ${id}`,
  expectedOutput: `Out ${id}`,
  acceptanceCriteria: [`${id} works`],
  context: 'ctx',
  constraints: ['no net'],
  writesPaths: [`src/${id}.ts`],
})
const okTask = (id) => ({
  ...planTask(id),
  status: 'verified',
  error: '',
  attempts: [{
    attempt: 1,
    execution: {
      summary: 'done',
      status: 'completed',
      deliverables: [{ description: 'd', locator: `src/${id}.ts` }],
      evidence: [{ claim: 'c', source: `src/${id}.ts` }],
      testsRun: [{ command: 'npm test', status: 'passed', detail: 'ok' }],
      filesChanged: [`src/${id}.ts`],
      uncertainties: ['u'],
    },
    verification: {
      verdict: 'pass',
      criteria: [{ criterion: `${id} works`, met: true, evidence: 'seen' }],
      checkedEvidence: [{ kind: 'file', locator: `src/${id}.ts`, finding: 'seen' }],
      commandsRun: [{ command: 'npm test', status: 'passed', detail: 'ok' }],
      issues: [],
      confidence: 'high',
    },
    passed: true,
    route: 'r1',
    error: '',
  }],
})
const badTask = (id) => ({
  ...planTask(id),
  status: 'failed',
  error: 'nope',
  attempts: [{
    attempt: 1,
    execution: null,
    verification: {
      verdict: 'fail',
      criteria: [{ criterion: `${id} works`, met: false, evidence: 'nothing' }],
      checkedEvidence: [{ kind: 'file', locator: `src/${id}.ts`, finding: 'nothing' }],
      commandsRun: [],
      issues: ['nothing'],
      confidence: 'low',
    },
    passed: false,
    error: 'verification failed',
  }],
})
const base = (cfg, maxTotalAgents) => ({
  schemaVersion: 'grok-workflow/v1',
  status: 'completed',
  objective: 'Ship the verified result',
  plan: { source: 'caller', tasks: [planTask('a')], error: '' },
  tasks: [okTask('a')],
  confirmed: [{ taskId: 'a', criterion: 'a works', evidence: 'seen' }],
  incomplete: [],
  errors: [],
  uncertainties: [{ taskId: 'a', text: 'one host' }],
  routes: [{ role: 'worker', chainIndex: 0, route: 'r1', attempt: 1, outcome: 'ok' }],
  deadRoutes: [{ route: 'r9', class: 'timeout', streak: 2 }],
  routing: { planner: ['p1'], worker: ['w1'], verifier: ['v1'], supervisor: ['s1'], synthesizer: [] },
  synthesis: { mode: 'model', summary: 'All done.', review: 'check=pass verify=pass drafts=1' },
  limits: { maxConcurrency: 2, maxRetries: 1, maxTasks: 6, maxTotalAgents, timeoutMs: 900_000, childTimeoutMs: cfg.childTimeoutMs },
  guard: { findings: 1, terminated: 0 },
})
const partial = (cfg) => {
  const value = base(cfg, 69)
  value.status = 'partial'
  value.plan.tasks = [planTask('a'), planTask('b')]
  value.tasks = [okTask('a'), badTask('b')]
  value.incomplete = [{ taskId: 'b', reason: 'nope', category: 'quality' }]
  value.errors = [{ phase: 'worker', message: 'route 1 exhausted', category: 'infrastructure' }]
  delete value.deadRoutes
  return value
}

let comparisons = 0
let diffs = 0
const report = (label, same) => {
  comparisons += 1
  if (same) return console.log(`same ${label}`)
  diffs += 1
  console.log(`DIFF ${label}`)
}

for (const [name, raw] of [['completed', base], ['partial', partial]]) {
  const oldValue = oldR.assertWorkflowReport(raw(cfgOld, name === 'completed' ? 24 : 69), 'Ship the verified result', cfgOld)
  const newValue = newR.assertWorkflowReport(raw(cfgNew, name === 'completed' ? 24 : 69), 'Ship the verified result', cfgNew)
  for (const [label, opts] of [
    ['default', undefined],
    ['diagnostics', { showDiagnostics: true }],
    ['guard', { guard: { findings: 2, terminated: 0, by: 'none' } }],
  ]) {
    const before = oldR.renderReport(oldValue, opts)
    const after = newR.renderReport(newValue, opts)
    report(`${name} ${label} chars=${before.length}`, before === after)
  }
  report(`${name} explicit auditTrail:false`, newR.renderReport(newValue) === newR.renderReport(newValue, { auditTrail: false }))
}

const failOld = oldR.failureReport('Obj', cfgOld, 'Timeout', 'boom', 'infrastructure')
const failNew = newR.failureReport('Obj', cfgNew, 'Timeout', 'boom', 'infrastructure')
for (const [label, opts] of [['default', undefined], ['diagnostics', { showDiagnostics: true }]]) {
  const before = oldR.renderReport(failOld, opts)
  report(`failure ${label} chars=${before.length}`, before === newR.renderReport(failNew, opts))
}

console.log(`COMPARISONS ${comparisons} DIFFS ${diffs}`)
process.exit(diffs === 0 ? 0 : 1)
