#!/usr/bin/env node
// Wave 4 merge demo — reproducible capture.
//
// Replays two consecutive rounds of one session against the *built* plugin
// (`lib/`, the same bytes `verify:lib` compares with `src/`), so the artifact this
// prints is behaviour, not a transcription of source:
//
//   round 1  a DAG of two waves; wave 1 verifies, wave 2 fails.
//   inherit  the plugin-authored report message is parsed back into task rows and
//            compiled into the L1 inheritance summary a next round receives.
//   round 2  the resumed round re-plans only the unfinished work plus new intent.
//   round 3  the known boundary: a dependency on a retained id cannot resolve.
//
// Usage: node docs/knowledge/evidence/wave4-acceptance-2026-11-22/capture-merge-demo.mjs
// Output goes to stdout; the committed MERGE-DEMO.txt is this output verbatim.

import vm from 'node:vm'
import { inheritanceForSession } from '../../../../lib/carryover.js'
import { resolveConfig } from '../../../../lib/config.js'
import { parseMemberLabel } from '../../../../lib/naming.js'
import { renderReport } from '../../../../lib/report.js'
import { buildWorkflowRequest, WORKFLOW_SCRIPT } from '../../../../lib/script.js'

const OBJECTIVE = 'Ship the two-wave plan'

function role(label) {
  return parseMemberLabel(label ?? '', 'zh')?.role
}

/** The same VM harness `test/helpers.ts` uses, inlined so this file is standalone. */
async function run(args, agent) {
  const calls = []
  const wrapped = async (prompt, options) => {
    calls.push({ prompt, label: options.label })
    return agent(prompt, options)
  }
  const context = vm.createContext({
    agent: wrapped,
    phase: title => calls.push({ phase: title }),
    log: message => calls.push({ log: message }),
    args,
  })
  const report = await vm.runInContext(`(async () => {\n${WORKFLOW_SCRIPT}\n})()`, context)
  return { report, calls }
}

/** Minimal message shape `collectCarryoverRounds` reads: text block + plugin source. */
function pluginReportMessage(text) {
  return { content: [{ type: 'text', text }], source: { kind: 'grok-workflow' } }
}

function session(reports) {
  return { id: 'wave4-demo', deriveMessages: () => reports.map(pluginReportMessage) }
}

function planTask(id, extra = {}) {
  return {
    id,
    title: `Task ${id}`,
    objective: `Do ${id}`,
    expectedOutput: `Output ${id}`,
    acceptanceCriteria: [`${id} works`],
    context: '',
    constraints: [],
    ...extra,
  }
}

const execution = summary => ({
  summary,
  status: 'completed',
  deliverables: [{ description: 'deliverable', locator: 'file:///tmp/deliverable' }],
  evidence: [{ claim: 'implemented', source: 'src/index.ts' }],
  testsRun: [{ command: 'npm test', status: 'passed', detail: 'ok' }],
  filesChanged: ['src/index.ts'],
  uncertainties: [],
})

const verification = (task, ok) => ({
  verdict: ok ? 'pass' : 'fail',
  criteria: task.acceptanceCriteria.map(criterion => ({
    criterion,
    met: ok,
    evidence: ok ? `verified ${criterion} in file:///tmp/report` : `${task.id} did not pass`,
  })),
  checkedEvidence: [{ kind: 'file', locator: 'file:///tmp/report', finding: 'observed expected output' }],
  commandsRun: [{ command: 'npm test', status: ok ? 'passed' : 'failed', detail: 'demo' }],
  issues: ok ? [] : [`${task.id} did not pass`],
  confidence: 'high',
})

/**
 * A task, read off the `TASK:` block of the prompt the child actually received.
 * Same extraction `test/helpers.ts#taskFromPrompt` uses: the block is one JSON
 * object terminated by a blank line.
 */
function taskFromPrompt(prompt) {
  const match = /TASK:\n(\{[\s\S]*?\})\n\n/.exec(prompt)
  if (match === null) throw new Error(`prompt carries no task JSON: ${prompt.slice(0, 120)}`)
  return JSON.parse(match[1])
}

function scripted(planned, failIds = []) {
  return async (prompt, options) => {
    const who = role(options.label)
    if (who === 'planner') return planned
    const task = taskFromPrompt(prompt)
    if (who === 'worker') return execution(`did ${task.id}`)
    return verification(task, !failIds.includes(task.id))
  }
}

function workedIds(calls) {
  return calls.filter(call => role(call.label) === 'worker').map(call => taskFromPrompt(call.prompt).id)
}

function section(title) {
  console.log(`\n${'='.repeat(78)}\n${title}\n${'='.repeat(78)}`)
}

const config = resolveConfig({ maxConcurrency: 4, maxTasks: 6 })

section('ROUND 1 — a two-wave DAG: wave 1 verifies, wave 2 fails')
const round1 = await run(
  buildWorkflowRequest(OBJECTIVE, undefined, config).args,
  scripted({ waves: [[planTask('a')], [planTask('b', { dependsOn: ['a'] })]] }, ['b']),
)
console.log(renderReport(round1.report))
console.log(`\n[wave structure] ${JSON.stringify(round1.report.plan.waves)}`)
console.log(`[worker order]   ${JSON.stringify(workedIds(round1.calls))}`)

section('INHERITANCE — what the next round is told (compiled from the round-1 report message)')
const inheritance = inheritanceForSession(session([renderReport(round1.report)]))
console.log(inheritance)

section('ROUND 2 — re-plan only the open wave + the new intent; wave 1 is not redone')
const resumedPlan = { waves: [[planTask('b')], [planTask('c', { dependsOn: ['b'] })]] }
const resumedRequest = buildWorkflowRequest(
  'Ship the two-wave plan and add a codegen step',
  undefined,
  config,
  undefined,
  undefined,
  undefined,
  inheritance,
)
const round2 = await run(resumedRequest.args, scripted(resumedPlan))
const plannerPrompt = round2.calls.find(call => role(call.label) === 'planner').prompt
const inherited = plannerPrompt.split('\n')
const from = inherited.findIndex(line => line.startsWith('INHERITED WORK'))
console.log('[planner prompt, inheritance block]')
console.log(inherited.slice(from, from + 4).join('\n'))
console.log(`\n[worker order]   ${JSON.stringify(workedIds(round2.calls))}   (no "a": the verified wave is retained)`)
console.log(`[tasks]          ${JSON.stringify(round2.report.tasks.map(task => [task.id, task.status]))}`)
console.log(`[wave structure] ${JSON.stringify(round2.report.plan.waves)}`)
console.log(renderReport(round2.report))

section('ROUND 3 — known boundary: a dependency on a retained id is not resolvable yet')
const boundary = await run(
  buildWorkflowRequest('Continue b', undefined, config, undefined, undefined, undefined, inheritance).args,
  scripted({ waves: [[planTask('d', { dependsOn: ['a'] })]] }),
)
console.log(`[plan source] ${boundary.report.plan.source}`)
console.log(`[plan error]  ${boundary.report.plan.error}`)
console.log(`[tasks]       ${JSON.stringify(boundary.report.tasks.map(task => [task.id, task.status]))}`)

section('A6 — the documented envelope the runs above used')
console.log(`[round 1 limits] concurrency ${round1.report.limits.maxConcurrency}, retries ${round1.report.limits.maxRetries}`)
console.log(`[round 2 limits] concurrency ${round2.report.limits.maxConcurrency}, retries ${round2.report.limits.maxRetries}`)
const overLimit = await run(
  { ...buildWorkflowRequest('One small job', undefined, config).args, maxConcurrency: 500, maxRetries: 9 },
  scripted({ tasks: [planTask('a')] }),
)
console.log(`[over-limit payload 500/9 ->] concurrency ${overLimit.report.limits.maxConcurrency}, retries ${overLimit.report.limits.maxRetries} (clamped, not trusted)`)
