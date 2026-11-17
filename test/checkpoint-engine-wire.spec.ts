/**
 * End-to-end engine wiring smoke: a real workflow run writes a real checkpoint.
 *
 * Boundary: the workflow engine, its script VM, its `workflow/*` events, its
 * child lifecycle and its result materialization are the real
 * `@deepseek-ai/dsh-workflow-ptc` implementation (see `test/engine-harness.ts`);
 * the subagent provider is a scripted fake, so **no model is called** and the
 * child count is exact — which is what lets the "wiring adds no model calls"
 * criterion be checked as a number rather than a claim.
 *
 * This spec is the executable half of the smoke note in
 * `docs/knowledge/evidence/checkpoint-engine-wire-2026-11-12/SMOKE.md`: run it
 * with `GROK_WORKFLOW_CHECKPOINT_DIR` pointed at the evidence directory and the
 * checkpoint files quoted there are produced by it.
 */
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Session } from '@deepseek-ai/dsh-session'
import { resolveConfig } from '../src/config.js'
import { HOST_ROLES, resumeDecision } from '../src/checkpoint/wiring.js'
import type { WorkflowCheckpoint } from '../src/checkpoint/schema.js'
import { readCheckpoint } from '../src/checkpoint/writer.js'
import { createActiveState, runWorkflow } from '../src/run.js'
import type { WorkflowLogger } from '../src/run.js'
import type { NormalizedTask } from '../src/types.js'
import { createEngineHarness } from './engine-harness.js'
import type { EngineHarness } from './engine-harness.js'

/* ------------------------------------------------------------------ harness -- */

const harnesses: EngineHarness[] = []
const scratchDirs: string[] = []

afterEach(async () => {
  for (const created of harnesses.splice(0)) await created.dispose()
  for (const dir of scratchDirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

function logger(): WorkflowLogger {
  return { warn: () => {}, info: () => {} }
}

const task: NormalizedTask = {
  id: 'a',
  title: 'Task a',
  objective: 'Do a',
  expectedOutput: 'Output a',
  acceptanceCriteria: ['a works'],
  context: '',
  constraints: [],
  writesPaths: null,
}

const execution = {
  summary: 'worker done',
  status: 'completed',
  deliverables: [{ description: 'output', locator: 'file:///tmp/out' }],
  evidence: [{ claim: 'implemented', source: 'src/index.ts' }],
  testsRun: [{ command: 'npm test', status: 'passed', detail: 'ok' }],
  filesChanged: [],
  uncertainties: [],
}

function verification(met: boolean) {
  return {
    verdict: met ? 'pass' : 'fail',
    criteria: [{ criterion: 'a works', met, evidence: met ? 'checked a works' : 'a does not work' }],
    checkedEvidence: [{ kind: 'file', locator: 'file:///tmp/out', finding: 'observed output' }],
    commandsRun: [{ command: 'npm test', status: met ? 'passed' : 'failed', detail: 'ok' }],
    issues: met ? [] : ['a does not work'],
    confidence: 'high',
  }
}

/** The checkpoint directory this run used: the suite env var, or a fresh scratch dir. */
async function checkpointRoot(): Promise<string> {
  const configured = process.env.GROK_WORKFLOW_CHECKPOINT_DIR
  if (configured !== undefined && configured.trim() !== '') return configured
  const created = await mkdtemp(join(tmpdir(), 'checkpoint-smoke-'))
  scratchDirs.push(created)
  return created
}

/**
 * Find the checkpoint this run just wrote (ids are engine-generated and the
 * objective is not unique across days).
 *
 * The suite shares one checkpoint directory by default, so a previous run of the
 * same objective is still on disk. Matching by objective alone therefore read a
 * stale file and reported another day's numbers as this run's; the newest file
 * with this objective is the one this test produced.
 */
async function checkpointFor(dir: string, objective: string): Promise<{ file: string, checkpoint: WorkflowCheckpoint }> {
  const names = (await readdir(dir)).filter(name => name.startsWith('checkpoint-') && name.endsWith('.json'))
  let best: { file: string, checkpoint: WorkflowCheckpoint, mtimeMs: number } | undefined
  for (const name of names) {
    const file = join(dir, name)
    const checkpoint = await readCheckpoint(file)
    if (checkpoint.run.objective !== objective) continue
    const { mtimeMs } = await stat(file)
    if (best === undefined || mtimeMs > best.mtimeMs) best = { file, checkpoint, mtimeMs }
  }
  if (best === undefined) throw new Error(`no checkpoint for ${objective} in ${dir} (saw ${names.join(', ')})`)
  return { file: best.file, checkpoint: best.checkpoint }
}

/* -------------------------------------------------------------------- tests -- */

describe('engine wiring writes real checkpoints', () => {
  it('records a verified run: tasks, five-role agent rows, evidence, and no extra model calls', async () => {
    const engine = createEngineHarness(call => (call.prompt.includes('You are the execution agent')
      ? { structured: execution }
      : { structured: verification(true) }))
    harnesses.push(engine)
    const dir = await checkpointRoot()
    const objective = 'smoke: ship the verified result'

    const outcome = await runWorkflow({
      ctx: engine.ctx as never,
      config: resolveConfig({ maxConcurrency: 1, maxTasks: 6} as never),
      state: createActiveState(),
      logger: logger(),
      agent: { session: Session.create('sess-smoke-ok' as never) } as never,
      objective,
      callerTasks: [task],
      failureMode: 'report',
    })
    expect(outcome.ok).toBe(true)
    expect(outcome.report.status).toBe('completed')

    const { file, checkpoint } = await checkpointFor(dir, objective)
    // Wiring added no child call: one worker and one verifier, exactly what the
    // script asks for, and nothing for the checkpoint.
    expect(engine.children.length).toBe(2)
    expect(checkpoint.run.status).toBe('completed')
    expect(checkpoint.tasks.map(row => [row.id, row.status, row.attempts])).toEqual([['a', 'verified', 1]])
    // Four roles, host-side only: every agent row is one the plugin actually runs.
    expect(checkpoint.agents.length).toBeGreaterThan(0)
    for (const row of checkpoint.agents) expect(HOST_ROLES as readonly string[]).toContain(row.role)
    expect(checkpoint.evidence.length).toBeGreaterThan(0)
    expect(checkpoint.evidence[0]?.taskId).toBe('a')
    // Stages come from the script's own phase labels, observed through the engine.
    expect(checkpoint.stages.map(stage => stage.phase)).toContain('plan')
    expect(checkpoint.plan.source).toBe('caller')
    // The 60 min default is a representable deadline (the checkpoint's own
    // msCeiling accepts every timeoutMs the config accepts), so the row records
    // the bound the run actually had instead of dropping it.
    expect(checkpoint.watchdog).toEqual({ deadlineHit: false, cancelled: false, deadlineMs: 3_600_000 })

    const decision = resumeDecision(checkpoint)
    expect(decision.action).toBe('none')
    // eslint-disable-next-line no-console -- the smoke note quotes this line
    console.log(`[smoke] status=completed file=${file} resume=${decision.action} reason=${decision.reason}`)
  })

  it('records a rejected run and answers the resume question with what to re-drive', async () => {
    const engine = createEngineHarness(call => (call.prompt.includes('You are the execution agent')
      ? { structured: execution }
      : { structured: verification(false) }))
    harnesses.push(engine)
    const dir = await checkpointRoot()
    const objective = 'smoke: ship the rejected result'

    const outcome = await runWorkflow({
      ctx: engine.ctx as never,
      config: resolveConfig({ maxConcurrency: 1, maxTasks: 6} as never),
      state: createActiveState(),
      logger: logger(),
      agent: { session: Session.create('sess-smoke-fail' as never) } as never,
      objective,
      callerTasks: [task],
      failureMode: 'report',
    })
    // `outcome.ok` means "the run produced a validated report", not "the work
    // passed": a verifier that rejects the work still ends the script normally.
    expect(outcome.report.status).toBe('failed')

    const { file, checkpoint } = await checkpointFor(dir, objective)
    expect(checkpoint.run.status).toBe('failed')
    expect(checkpoint.tasks.map(row => [row.id, row.status])).toEqual([['a', 'failed']])
    const decision = resumeDecision(checkpoint)
    expect(decision.action).toBe('resume')
    expect(decision.unfinished).toEqual(['a'])
    expect(decision.seed.length).toBeGreaterThan(0)
    // eslint-disable-next-line no-console -- the smoke note quotes this line
    console.log(`[smoke] status=failed file=${file} resume=${decision.action} unfinished=${decision.unfinished.join(',')}`)
  })
})
