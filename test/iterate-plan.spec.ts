import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MAX_CONCURRENCY,
  FIXED_MAX_RETRIES,
  HARD_LIMITS,
} from '../src/config.js'
import { DEFAULT_LOOP_INTERVAL_MINUTES, loopPolicyFromConfig, loopRrule } from '../src/loop.js'
import {
  DEFAULT_HARNESS,
  INVARIANT_ENVELOPE,
  armSizes,
  buildPlan,
  loadHarness,
  readLoopState,
  readPool,
  renderText,
  rruleFor,
  run,
  validateHarness,
} from '../.rsi/tools/iterate-plan.mjs'

/**
 * Bounded iteration harness (`.rsi/harness.json`, `.rsi/tools/iterate-plan.mjs`, `.rsi/HARNESS.md`).
 *
 * The harness's whole job is to keep a 1000-round budget inside the plugin's own bounds without
 * a loop that runs in one process: one scheduled delivery is one round, one heartbeat row carries
 * at most what the plugin itself may ask for, and a row that ends stops the loop until somebody
 * arms the next arm. Three properties are load-bearing and none of them is visible in the prose:
 *
 * 1. the numbers in `harness.json` *are* the plugin's numbers, not copies that can drift;
 * 2. the `rrule` the plan prints is byte-identical to the rule the plugin builds for its own
 *    heartbeat, so an arm cannot be rejected or silently reinterpreted by Schedule;
 * 3. the budget has a ceiling the guard actually enforces, and the plan refuses to arm past it.
 *
 * Every fixture below is a throwaway directory, so the contract is checked against the files the
 * tool reads rather than against this repository's live loop state.
 */

const toolPath = fileURLToPath(new URL('../.rsi/tools/iterate-plan.mjs', import.meta.url))
const guardPath = fileURLToPath(new URL('../.rsi/tools/heartbeat-guard.sh', import.meta.url))

/** One round's ledger row, in the shape `.rsi/ledger.jsonl` uses. */
function ledgerLine(round: number): string {
  return JSON.stringify({
    round,
    theme: `theme ${round}`,
    status: 'OK',
    tag: '',
    ci: 'npm run ci exit 0 · 1 test files passed · 1 tests passed',
    evidence: `.rsi/evidence/round-${String(round).padStart(3, '0')}/`,
    at: '2026-11-20T00:00+0800',
    commit: `c${round}`,
  })
}

/** A throwaway repository whose `.rsi` records are the only input the tools get. */
function fixtureRepo(options: {
  rounds?: number[]
  roundSections?: boolean
  harness?: unknown
  pool?: string[]
} = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'iterate-plan-'))
  const rsi = join(root, '.rsi')
  mkdirSync(rsi, { recursive: true })
  const rounds = options.rounds ?? []
  if (rounds.length > 0 && options.roundSections !== false) {
    writeFileSync(
      join(rsi, 'ROUND.md'),
      rounds.map(round => `## Round ${round} — theme ${round}\n\n- **status:** OK\n`).join('\n'),
    )
    writeFileSync(join(rsi, 'ledger.jsonl'), `${rounds.map(ledgerLine).join('\n')}\n`)
  }
  if (options.harness !== undefined) {
    writeFileSync(join(rsi, 'harness.json'), typeof options.harness === 'string' ? options.harness : JSON.stringify(options.harness))
  }
  if (options.pool !== undefined) writeFileSync(join(rsi, 'POOL.md'), `${options.pool.join('\n')}\n`)
  return root
}

describe('the harness configuration is the plugin\'s own bounds', () => {
  it('pins every documented number against the constant it comes from', () => {
    // Not copies: the same numbers, checked against src/ so neither side can be edited alone.
    expect(DEFAULT_HARNESS.intervalMinutes).toBe(DEFAULT_LOOP_INTERVAL_MINUTES)
    expect(DEFAULT_HARNESS.armCapRounds).toBe(HARD_LIMITS.loopMaxRounds)
    expect(DEFAULT_HARNESS.envelope.maxConcurrency).toBe(DEFAULT_MAX_CONCURRENCY)
    expect(DEFAULT_HARNESS.envelope.hardMaxConcurrency).toBe(HARD_LIMITS.maxConcurrency)
    expect(DEFAULT_HARNESS.envelope.retries).toBe(FIXED_MAX_RETRIES)
    expect(DEFAULT_HARNESS.envelope.hardMaxRetries).toBe(HARD_LIMITS.maxRetries)
    expect(DEFAULT_MAX_CONCURRENCY).toBe(10)
    expect(HARD_LIMITS.maxConcurrency).toBe(100)
    expect(FIXED_MAX_RETRIES).toBe(1)
    expect(HARD_LIMITS.maxRetries).toBe(3)
    expect(INVARIANT_ENVELOPE).toEqual({ maxConcurrency: 100, maxRetries: 3 })
  })

  it('takes the row maximum from the policy clamp, not from the rrule formatter', () => {
    // Measured, not assumed: `loopRrule` formats whatever count it is handed (COUNT=5000
    // below), so the 1000 ceiling is the *policy* clamp, and that is what the harness pins.
    expect(loopRrule(DEFAULT_LOOP_INTERVAL_MINUTES, 5000, 0)).toMatch(/COUNT=5000$/)
    expect(loopPolicyFromConfig(0, DEFAULT_LOOP_INTERVAL_MINUTES, 5000, 3).rounds)
      .toBe(DEFAULT_HARNESS.rowMaxRounds)
    expect(DEFAULT_HARNESS.rowMaxRounds).toBe(1000)
    // And the cap the plugin's own switch can ask for is narrower than the policy allows:
    // `loopMaxRounds` is refused above 100 at load, which is why an arm defaults to 100.
    expect(HARD_LIMITS.loopMaxRounds).toBe(DEFAULT_HARNESS.armCapRounds)
    expect(HARD_LIMITS.loopMaxRounds).toBeLessThan(DEFAULT_HARNESS.rowMaxRounds)
  })

  it('builds a rule byte-identical to the plugin\'s for the same inputs', () => {
    const nows = [0, 1_700_000_000_123, Date.parse('2026-11-20T13:01:34Z'), 1_700_000_000_999]
    for (const now of nows) {
      for (const interval of [60, 90, 1440]) {
        for (const rounds of [1, 100, 965, 1000]) {
          expect(rruleFor(interval, rounds, now)).toBe(loopRrule(interval, rounds, now))
        }
      }
    }
  })

  it('refuses a budget or envelope outside the documented bounds', () => {
    const base = structuredClone(DEFAULT_HARNESS)
    const bad = (patch: Record<string, unknown>) => validateHarness({ ...base, ...patch } as unknown as typeof base)
    expect(() => bad({ intervalMinutes: 59 })).toThrow(/intervalMinutes must be a whole number in 60\.\.10080/)
    expect(() => bad({ intervalMinutes: 10081 })).toThrow(/intervalMinutes/)
    expect(() => bad({ totalRounds: 0 })).toThrow(/totalRounds/)
    expect(() => bad({ rowMaxRounds: 1001 })).toThrow(/rowMaxRounds/)
    expect(() => bad({ armCapRounds: 1001 })).toThrow(/armCapRounds/)
    expect(() => bad({ shape: 'forever' })).toThrow(/shape must be one of single, chain/)
    expect(() => bad({ envelope: { ...base.envelope, maxConcurrency: 101 } }))
      .toThrow(/envelope\.maxConcurrency must be a whole number in 1\.\.100/)
    expect(() => bad({ envelope: { ...base.envelope, hardMaxConcurrency: 101 } }))
      .toThrow(/envelope\.hardMaxConcurrency/)
    expect(() => bad({ envelope: { ...base.envelope, retries: 4 } }))
      .toThrow(/envelope\.retries must be a whole number in 1\.\.3/)
    expect(() => bad({ envelope: { ...base.envelope, hardMaxRetries: 4 } }))
      .toThrow(/envelope\.hardMaxRetries/)
    expect(() => bad({ stop: { ...base.stop, roundCap: 1001 } }))
      .toThrow(/stop\.roundCap must not exceed totalRounds/)
    expect(() => bad({ stop: { ...base.stop, blockedStreak: 0 } })).toThrow(/stop\.blockedStreak/)
  })

  it('refuses a harness file it cannot read instead of defaulting it silently', () => {
    expect(() => loadHarness(fixtureRepo({ harness: '{ not json' }))).toThrow(/harness\.json is not valid JSON/)
    expect(() => loadHarness(fixtureRepo({ harness: '[]' }))).toThrow(/harness\.json must hold one JSON object/)
    // A repository with no harness file still plans, from the defaults.
    expect(loadHarness(fixtureRepo()).totalRounds).toBe(DEFAULT_HARNESS.totalRounds)
  })
})

describe('the round budget is cut into bounded arms', () => {
  it('sums to the remaining budget and never exceeds the cap', () => {
    expect(armSizes(965, 'single', 100, 1000)).toEqual([965])
    expect(armSizes(965, 'chain', 100, 1000)).toEqual([100, 100, 100, 100, 100, 100, 100, 100, 100, 65])
    expect(armSizes(1000, 'chain', 100, 1000)).toHaveLength(10)
    expect(armSizes(1, 'chain', 100, 1000)).toEqual([1])
    for (const remaining of [1, 99, 100, 101, 999, 1000]) {
      for (const shape of ['single', 'chain'] as const) {
        const sizes = armSizes(remaining, shape, 100, 1000)
        expect(sizes.reduce((sum, value) => sum + value, 0)).toBe(remaining)
        expect(Math.max(...sizes)).toBeLessThanOrEqual(1000)
      }
    }
  })

  it('plans one row for the whole budget when the shape is single', () => {
    const plan = buildPlan(validateHarness({ ...DEFAULT_HARNESS, shape: 'single' }), readLoopState(fixtureRepo()), 0)
    expect(plan.status).toBe('OPEN')
    expect(plan.used).toBe(0)
    expect(plan.remaining).toBe(1000)
    expect(plan.arms).toHaveLength(1)
    expect(plan.arms[0]!.rounds).toBe(1000)
    expect(plan.arms[0]!.firstRound).toBe(1)
    expect(plan.arms[0]!.lastRound).toBe(1000)
    expect(plan.arms[0]!.rrule).toBe(loopRrule(60, 1000, 0))
    expect(plan.stopCode).toBeNull()
    expect(plan.stop.map(rule => rule.code)).toEqual([
      'stop-file', 'round-cap', 'blocked-streak', 'stall-unclosed', 'budget-exhausted', 'protocol-stop',
    ])
  })

  it('advances from what the loop already spent, and names the round window', () => {
    const state = readLoopState(fixtureRepo({ rounds: Array.from({ length: 35 }, (_, index) => index + 1) }))
    const single = buildPlan(validateHarness({ ...DEFAULT_HARNESS, shape: 'single' }), state, 0)
    expect(single.used).toBe(35)
    expect(single.remaining).toBe(965)
    expect(single.arms).toHaveLength(1)
    expect(single.arms[0]!.firstRound).toBe(36)
    expect(single.arms[0]!.lastRound).toBe(1000)

    const chained = buildPlan(validateHarness(DEFAULT_HARNESS), state, 0)
    expect(chained.arms).toHaveLength(10)
    expect(chained.arms[0]!.rounds).toBe(100)
    expect(chained.arms[0]!.firstRound).toBe(36)
    expect(chained.arms[0]!.lastRound).toBe(135)
    expect(chained.arms[9]!.rounds).toBe(65)
    expect(chained.arms[9]!.lastRound).toBe(1000)
    // Only the arm being armed now can carry an anchor; the rest are armed when their
    // predecessor ends, so a `DTSTART` for them would be a guess.
    expect(chained.arms[0]!.rrule).toBe(loopRrule(60, 100, 0))
    expect(chained.arms.slice(1).every(arm => arm.rrule === null)).toBe(true)
    expect(chained.arms[1]!.rruleNote).toMatch(/armed when arm 1 ends; COUNT=100, INTERVAL=60/)
  })

  it('takes the higher of the two loop records, exactly as the guard does', () => {
    const root = fixtureRepo({ rounds: [1, 2, 3] })
    // A round written into ROUND.md but not yet into the ledger was still spent.
    writeFileSync(
      join(root, '.rsi/ROUND.md'),
      ['## Round 1 — a', '## Round 2 — b', '## Round 3 — c', '## Round 4 — d'].join('\n\n- **status:** OK\n\n') + '\n\n- **status:** OK\n',
    )
    const state = readLoopState(root)
    expect(state).toEqual({ reportMax: 4, ledgerMax: 3, used: 4 })
  })

  it('stops at the ceiling instead of arming past it', () => {
    const spent = Array.from({ length: 1000 }, (_, index) => index + 1)
    const plan = buildPlan(validateHarness(DEFAULT_HARNESS), readLoopState(fixtureRepo({ rounds: spent })), 0)
    expect(plan.status).toBe('EXHAUSTED')
    expect(plan.stopCode).toBe('budget-exhausted')
    expect(plan.remaining).toBe(0)
    expect(plan.arms).toEqual([])
    expect(renderText(plan)).toMatch(/stop code=budget-exhausted: the ledger already accounts for 1000 rounds; open no round/)
    expect(renderText(plan)).not.toMatch(/arm 1\//)
  })
})

describe('the guard enforces the same ceiling the plan respects', () => {
  it('resumes at the last budgeted round and stops one above it', () => {
    const root = fixtureRepo({ rounds: [999, 1000] })
    const at = spawnSync('bash', [guardPath, '--root', root, '--round', '1000', '--max-rounds', '1000'], { encoding: 'utf8' })
    expect(at.status, at.stderr).toBe(0)
    expect(at.stdout).toMatch(/^RESUME code=none /)
    expect(at.stdout).toMatch(/max_rounds=1000/)

    const past = spawnSync('bash', [guardPath, '--root', root, '--round', '1001', '--max-rounds', '1000'], { encoding: 'utf8' })
    expect(past.status, past.stderr).toBe(20)
    expect(past.stdout).toMatch(/^STOP code=round-cap /)

    // Without the cap the guard would resume past 1000 — that is why the prompt carries it.
    const uncapped = spawnSync('bash', [guardPath, '--root', root, '--round', '1001'], { encoding: 'utf8' })
    expect(uncapped.stdout).toMatch(/^RESUME /)
  })
})

describe('the plan CLI is read-only and refuses what it cannot honour', () => {
  it('prints text and JSON from the same plan without touching the repository', () => {
    const root = fixtureRepo({ rounds: [1, 2, 3, 4, 5] })
    const before = readdirSync(join(root, '.rsi')).sort()
    const text = run([], { defaultRoot: root, now: () => 0 })
    expect(text.code).toBe(0)
    expect(text.out).toMatch(/^plan shape=chain total=1000 used=5 remaining=995/)
    expect(text.out).toMatch(/arms=10 interval=60 guard_args="--max-rounds 1000 --threshold 3" status=OPEN/)
    expect(text.out).toMatch(/arm 1\/10 rounds=100 rounds_window=6\.\.105/)
    expect(text.out).toMatch(/rrule=DTSTART:\d{8}T\d{6}Z\\nRRULE:FREQ=MINUTELY;INTERVAL=60;COUNT=100/)
    expect(text.out).toMatch(/arm 10\/10 rounds=95 rounds_window=906\.\.1000/)
    expect(text.out).toMatch(/envelope maxConcurrency=10\/100 retries=1\/3/)

    const json = run(['--json'], { defaultRoot: root, now: () => 0 })
    expect(JSON.parse(json.out)).toMatchObject({
      kind: 'rsi-iteration-plan', shape: 'chain', total: 1000, used: 5, remaining: 995, status: 'OPEN',
    })
    expect(readdirSync(join(root, '.rsi')).sort()).toEqual(before)
  })

  it('exits 20 when the budget is spent, 64 on a bad argument, 65 on a foreign root', () => {
    const spent = fixtureRepo({ rounds: Array.from({ length: 1000 }, (_, index) => index + 1) })
    expect(run([], { defaultRoot: spent, now: () => 0 }).code).toBe(20)
    expect(() => run(['--interval', '30'], { defaultRoot: spent })).toThrow(/intervalMinutes/)
    expect(() => run(['--interval', 'soon'], { defaultRoot: spent })).toThrow(/--interval must be a whole number/)
    expect(() => run(['--nope'], { defaultRoot: spent })).toThrow(/unknown argument --nope/)
    expect(() => run([], { defaultRoot: mkdtempSync(join(tmpdir(), 'iterate-plan-empty-')) })).toThrow(/--root must name the repository/)
    // A shape override reaches the plan; an unknown one is refused by the same validator.
    expect(run([], { defaultRoot: fixtureRepo({ rounds: [1, 2] }), now: () => 0 }).out)
      .toMatch(/shape=chain[\s\S]*arms=10/)
    expect(run(['--shape', 'single'], { defaultRoot: fixtureRepo({ rounds: [1, 2] }), now: () => 0 }).out)
      .toMatch(/shape=single[\s\S]*arms=1/)
    expect(() => run(['--shape', 'forever'], { defaultRoot: spent })).toThrow(/shape must be one of/)
  })

  it('names the next POOL item without re-ranking the file', () => {
    const root = fixtureRepo({
      pool: [
        '# RSI Pool',
        '- R33 DONE · a folded base64 key',
        '- STALE (round 27) · re-checked, nothing left',
        '- P · roles that is not an object is read as five empty chains',
        '- P · a non-string model throws a bare TypeError',
        '- R35 DONE · unknown nested keys',
      ],
    })
    const pool = readPool(root)
    expect(pool.items).toHaveLength(5)
    expect(pool.open.map(item => item.marker)).toEqual(['P', 'P'])
    expect(pool.open[0]!.text).toMatch(/^P · roles that is not an object/)
    expect(pool.open[0]!.line).toBe(4)
    const out = run(['--pool'], { defaultRoot: root })
    expect(out.code).toBe(0)
    expect(out.out).toMatch(/pool open=2 total=5/)
    expect(out.out).toMatch(/top_next=line 4/)
    expect(JSON.parse(run(['--pool', '--json'], { defaultRoot: root }).out).topNext.line).toBe(4)
  })

  it('plans against this repository without leaving the tree it planned on', () => {
    // The live loop state moves while this runs, so only the invariants are asserted.
    const repoRoot = fileURLToPath(new URL('..', import.meta.url))
    const { status, stdout, stderr } = spawnSync(process.execPath, [toolPath, '--json'], { cwd: repoRoot, encoding: 'utf8' })
    expect(stderr).toBe('')
    expect(status).toBe(0)
    const plan = JSON.parse(stdout)
    expect(plan.total).toBe(1000)
    expect(plan.intervalMinutes).toBe(60)
    expect(plan.guardArgs).toBe('--max-rounds 1000 --threshold 3')
    expect(plan.arms.reduce((sum: number, arm: { rounds: number }) => sum + arm.rounds, 0)).toBe(plan.remaining)
    expect(plan.remaining + plan.used).toBe(1000)
    expect(readFileSync(toolPath, 'utf8')).not.toMatch(/setInterval|setTimeout|while \(true\)|for \(;;\)/)
  })
})
