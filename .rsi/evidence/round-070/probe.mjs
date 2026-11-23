#!/usr/bin/env node
// Round-70 red/green probe.
//
// Runs five behaviour checks against the *built* plugin (lib/), so the same script
// is the evidence in both directions: run it in a checkout of the pre-round-70 code
// and every check reports "absent"; run it in the fixed checkout and every check
// reports "present". Nothing here needs a model, a session file or the network.
//
// Usage: node .rsi/evidence/round-070/probe.mjs [<repo-root>]
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.argv[2] ?? process.cwd()
const load = name => import(pathToFileURL(join(root, 'lib', name)).href)

const scratch = mkdtempSync(join(tmpdir(), 'round070-probe-'))
process.env.GROK_WORKFLOW_CHECKPOINT_DIR = join(scratch, 'checkpoints')
process.env.GROK_WORKFLOW_MEMORY_DIR = join(scratch, 'memory')

const results = []
const record = (id, what, present, detail) => results.push({ id, what, present, detail })

const { resolveConfig } = await load('config.js')
const { assertWorkflowReport } = await load('report.js')
const { deliverReport } = await load('delivery/index.js')
const { buildCheckpoint } = await load('checkpoint/schema.js')
const { maxTotalAgentsFor, routeBudgetFor } = await load('script.js')

const config = resolveConfig({ maxConcurrency: 2, maxTasks: 4 })
const OBJECTIVE = '查一下新加坡这周的天气并给出出行建议'
const criteria = ['天气已核验']
const planTask = {
  id: 'a', title: '天气', objective: '查天气', expectedOutput: '一句话',
  acceptanceCriteria: criteria, context: '', constraints: [], writesPaths: null,
}
// One shape for the second task, used in the plan and in the rows: the validator
// requires the two to agree field by field.
const second = { ...planTask, id: 'b', title: '酒店价格', acceptanceCriteria: ['酒店价格已核验'] }
const stopped = {
  schemaVersion: 'grok-workflow/v1',
  status: 'partial',
  objective: OBJECTIVE,
  plan: { source: 'caller', tasks: [planTask, second], error: '' },
  tasks: [
    {
      ...planTask, status: 'verified', error: '',
      attempts: [{
        attempt: 1,
        execution: {
          summary: '查到多雨',
          status: 'completed',
          deliverables: [{ description: 'weather', locator: 'file:///tmp/weather.md' }],
          evidence: [{ claim: 'checked', source: 'file:///tmp/weather.md' }],
          testsRun: [{ command: 'true', status: 'passed', detail: 'ok' }],
          filesChanged: [],
          uncertainties: [],
        },
        verification: {
          verdict: 'pass',
          criteria: [{ criterion: '天气已核验', met: true, evidence: '气象局页面' }],
          checkedEvidence: [{ kind: 'file', locator: 'file:///tmp/weather.md', finding: 'checked' }],
          commandsRun: [{ command: 'true', status: 'passed', detail: 'ok' }],
          issues: [],
          confidence: 'high',
        },
        passed: true, error: '',
      }],
    },
    {
      ...second, status: 'failed', error: 'stopped',
      attempts: [{ attempt: 1, execution: null, verification: null, passed: false, error: 'stopped' }],
    },
  ],
  confirmed: [{ taskId: 'a', criterion: '天气已核验', evidence: '气象局页面' }],
  incomplete: [{ taskId: 'b', reason: 'interrupted: the run was stopped', category: 'cancelled' }],
  errors: [{ phase: 'Unloaded', message: 'the plugin unloaded mid-run', category: 'cancelled' }],
  uncertainties: [],
  routing: { planner: [], worker: [], verifier: [], supervisor: [], synthesizer: [] },
  routes: [],
  synthesis: { mode: 'deterministic' },
  limits: { maxConcurrency: 2, maxRetries: 1, maxTasks: 4, maxTotalAgents: maxTotalAgentsFor(2, 1, routeBudgetFor(config)) },
}
const report = { ...assertWorkflowReport(stopped, OBJECTIVE, config), stop: { cause: 'unloaded' } }

// 1 — the plain-language account of an unload.
const human = deliverReport(report, { lang: 'zh' }).human
record(1, '失败文案说人话：unloaded 原因 + 战果 + "重发即接着跑"', human.includes('插件在运行中被卸载'), human.split('\n').find(line => line.startsWith('下一步')) ?? '')

// 2 — the guard's conclusion as the fixed tail line.
const guarded = deliverReport(report, { lang: 'zh', guard: { findings: 2, terminated: 0, by: 'unloaded' } }).human
record(2, '守卫结论进正文：N 条发现 / 未终止子代理 / 由 X 取消', guarded.includes('守卫：2 条发现'), guarded.split('\n').at(-1))

// 3 — in-flight child records survive into the checkpoint.
const checkpoint = buildCheckpoint({
  run: { runId: 'probe-run', objective: OBJECTIVE, status: 'cancelled' },
  plan: { source: 'caller', tasks: [{ id: 'a', title: '天气', writesPaths: null }] },
  inFlight: [{ seq: 1, childId: 'child-42', lastStep: '执行' }],
  watchdog: { cancelled: true },
}, 1_700_000_000_000)
record(3, '收编在飞子代理：checkpoint 记 childId + 最后一步', Array.isArray(checkpoint.inFlight), JSON.stringify(checkpoint.inFlight ?? null))

// 4 — /grok status.
const { grokCommand } = await load('command.js')
const { Session } = await import('@deepseek-ai/dsh-session')
const session = Session.create('probe-status')
const status = grokCommand().handler({ agent: { session }, rawInput: 'status' })
record(4, '/grok status 输出 run 状态/死因/守卫/checkpoint/未完成', status.text.includes('Grok workflow status'), `${status.kind}: ${status.text.split('\n')[0]}`)

// 5 — the ledger can be corrected (superseded by).
let supersede = 'no export'
try {
  const archive = await load('memory/archive.js')
  if (typeof archive.appendSupersedeEntry === 'function') {
    const { createMemoryArchiver } = await load('memory/recorder.js')
    const archiver = createMemoryArchiver({ logger: { warn: () => {} } })
    archiver.round({ runId: 'old', sessionId: 's1', objective: OBJECTIVE, status: 'cancelled', summary: 'stopped' })
    archiver.round({ runId: 'new', sessionId: 's1', objective: OBJECTIVE, status: 'completed', summary: 'finished' })
    archiver.dispose()
    const corrections = archive.readArchive().filter(entry => typeof entry.supersedes === 'string')
    supersede = `corrections=${corrections.length}`
  }
} catch (error) {
  supersede = `error: ${error instanceof Error ? error.message : String(error)}`
}
record(5, '台账可更正：旧 cancelled/failed round 打 superseded by 链接', supersede.startsWith('corrections=1'), supersede)

rmSync(scratch, { recursive: true, force: true })

const width = 62
console.log(`round-070 probe — ${root}`)
for (const row of results) {
  console.log(`${row.present ? 'PRESENT' : 'ABSENT '} | ${row.id} | ${row.what}`)
  console.log(`${' '.repeat(9)}└─ ${row.detail}`)
}
const present = results.filter(row => row.present).length
console.log(`\nsummary: ${present}/${results.length} present${present === results.length ? ' (green)' : ' (red)'}`)
console.log(width)
process.exitCode = 0
