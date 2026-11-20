#!/usr/bin/env node
/**
 * Bounded iteration plan for the RSI loop (`.rsi/HARNESS.md`).
 *
 * The loop's budget is 1000 rounds. This tool answers exactly one question, from durable
 * state and nothing else: toward that budget, which heartbeat row should be armed next,
 * how many rounds may it carry, and what stops the loop. It deliberately does not arm
 * anything: a scheduled task is the operator's action (`docs/knowledge/DECISIONS.md` D-066),
 * and a delegated subagent is refused by the schedule tools. What it removes is the
 * reasoning step — the arithmetic, the plugin's own bounds, and the stop flags are
 * computed here and printed, so arming the next arm is one copy-paste, not a judgement call.
 *
 * Read-only: it opens files under the repository and prints. It writes nothing, starts no
 * timer, and keeps no state between runs — the durable state is `.rsi/ledger.jsonl` plus
 * `.rsi/ROUND.md`, which the loop already maintains and the heartbeat guard already reads.
 *
 * Usage:
 *   iterate-plan.mjs [--root DIR] [--now EPOCH_MS] [--shape single|chain]
 *                    [--total N] [--interval N] [--arm-cap N] [--json] [--pool]
 *
 *   --root DIR      repository to read (default: the repository this script is in)
 *   --now EPOCH_MS  clock reading for the `DTSTART` anchor (default: now); tests set it
 *   --shape …       override `.rsi/harness.json` `shape`: `single` (one row, up to the row
 *                   maximum) or `chain` (arms of at most `armCapRounds`)
 *   --total N       override the budget in rounds
 *   --interval N    override the heartbeat interval in minutes
 *   --arm-cap N     override the per-arm round cap
 *   --json          print the plan as one JSON object instead of the text lines
 *   --pool          print the open POOL items in file order and mark the next one
 *
 * Exit codes:
 *   0   plan printed, budget open
 *   20  budget exhausted: the ledger already accounts for every round (a stop, not an error)
 *   64  bad argument or unusable harness configuration
 *   65  `--root` is not this repository
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Where the harness configuration lives, relative to the repository root. */
export const HARNESS_FILE = '.rsi/harness.json'

/**
 * Defaults for a missing or partial `.rsi/harness.json`.
 *
 * These are not invented numbers: `intervalMinutes`, `armCapRounds` and the envelope are
 * the plugin's own documented bounds (`src/loop.ts` `DEFAULT_LOOP_INTERVAL_MINUTES`,
 * `src/config.ts` `DEFAULT_MAX_CONCURRENCY` / `FIXED_MAX_RETRIES` / `HARD_LIMITS`), and
 * `test/iterate-plan.spec.ts` pins them against those constants so a bound cannot be
 * edited in one place and forgotten in the other.
 */
export const DEFAULT_HARNESS = {
  version: 1,
  totalRounds: 1000,
  shape: 'single',
  intervalMinutes: 60,
  armCapRounds: 100,
  rowMaxRounds: 1000,
  stop: { blockedStreak: 3, skipStreak: 3, roundCap: 1000 },
  envelope: { maxConcurrency: 10, hardMaxConcurrency: 100, retries: 1, hardMaxRetries: 3 },
}

/** The documented engine envelope (AGENTS.md "Architecture invariants"); not a preference. */
export const INVARIANT_ENVELOPE = { maxConcurrency: 100, maxRetries: 3 }

/** Shape names the plan understands. */
export const SHAPES = ['single', 'chain']

/** A refusal with the exit code its caller should return. */
class PlanError extends Error {
  /** @param message - what is wrong. @param code - process exit code. */
  constructor(message, code = 64) {
    super(message)
    this.name = 'PlanError'
    this.code = code
  }
}

/**
 * Read and validate the harness configuration.
 *
 * A malformed file is refused rather than silently defaulted: a budget that reads as
 * configured while the loop runs on a different number is the exact failure mode the
 * harness exists to prevent.
 * @param root - repository root.
 * @param overrides - command-line overrides, applied after validation of the file.
 * @returns the merged, validated configuration.
 * @throws {PlanError} when a value is out of the plugin's bounds.
 */
export function loadHarness(root, overrides = {}) {
  const path = join(root, HARNESS_FILE)
  let stored = {}
  if (existsSync(path)) {
    try {
      stored = JSON.parse(readFileSync(path, 'utf8'))
    } catch (error) {
      throw new PlanError(`${HARNESS_FILE} is not valid JSON: ${error.message}`)
    }
    if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) {
      throw new PlanError(`${HARNESS_FILE} must hold one JSON object`)
    }
  }
  const merged = {
    ...DEFAULT_HARNESS,
    ...stored,
    stop: { ...DEFAULT_HARNESS.stop, ...(stored.stop ?? {}) },
    envelope: { ...DEFAULT_HARNESS.envelope, ...(stored.envelope ?? {}) },
    ...overrides,
  }
  return validateHarness(merged)
}

/**
 * Validate a merged harness configuration against the plugin's documented bounds.
 * @param config - candidate configuration.
 * @returns the same configuration, unchanged.
 * @throws {PlanError} naming the first value outside its bound.
 */
export function validateHarness(config) {
  const whole = (name, value, min, max) => {
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new PlanError(`${name} must be a whole number in ${min}..${max}, got ${JSON.stringify(value)}`)
    }
    return value
  }
  whole('totalRounds', config.totalRounds, 1, 100000)
  whole('rowMaxRounds', config.rowMaxRounds, 1, 1000)
  whole('armCapRounds', config.armCapRounds, 1, config.rowMaxRounds)
  whole('intervalMinutes', config.intervalMinutes, 60, 10080)
  whole('stop.blockedStreak', config.stop.blockedStreak, 1, 100)
  whole('stop.skipStreak', config.stop.skipStreak, 1, 100)
  whole('stop.roundCap', config.stop.roundCap, 1, 100000)
  if (config.stop.roundCap > config.totalRounds) {
    throw new PlanError('stop.roundCap must not exceed totalRounds (a cap above the budget never fires)')
  }
  if (!SHAPES.includes(config.shape)) {
    throw new PlanError(`shape must be one of ${SHAPES.join(', ')}, got ${JSON.stringify(config.shape)}`)
  }
  const envelope = config.envelope
  whole('envelope.maxConcurrency', envelope.maxConcurrency, 1, INVARIANT_ENVELOPE.maxConcurrency)
  whole('envelope.hardMaxConcurrency', envelope.hardMaxConcurrency, 1, INVARIANT_ENVELOPE.maxConcurrency)
  if (envelope.hardMaxConcurrency < envelope.maxConcurrency) {
    throw new PlanError('envelope.hardMaxConcurrency must not be below maxConcurrency')
  }
  whole('envelope.retries', envelope.retries, 1, INVARIANT_ENVELOPE.maxRetries)
  whole('envelope.hardMaxRetries', envelope.hardMaxRetries, 1, INVARIANT_ENVELOPE.maxRetries)
  if (envelope.hardMaxRetries < envelope.retries) {
    throw new PlanError('envelope.hardMaxRetries must not be below retries')
  }
  return config
}

/**
 * Highest round the loop's own records admit to.
 *
 * The guard reads `ROUND.md` sections and `ledger.jsonl` rows and skips when the two
 * disagree; the plan uses the higher of the two for the same reason — a round that is
 * recorded in one place was still spent.
 * @param root - repository root.
 * @returns `{ reportMax, ledgerMax, used }`.
 */
export function readLoopState(root) {
  const roundFile = join(root, '.rsi/ROUND.md')
  const ledgerFile = join(root, '.rsi/ledger.jsonl')
  let reportMax = 0
  if (existsSync(roundFile)) {
    for (const match of readFileSync(roundFile, 'utf8').matchAll(/^## Round (\d+)/gm)) {
      reportMax = Math.max(reportMax, Number(match[1]))
    }
  }
  let ledgerMax = 0
  if (existsSync(ledgerFile)) {
    for (const match of readFileSync(ledgerFile, 'utf8').matchAll(/"round"\s*:\s*(\d+)/g)) {
      ledgerMax = Math.max(ledgerMax, Number(match[1]))
    }
  }
  return { reportMax, ledgerMax, used: Math.max(reportMax, ledgerMax) }
}

/**
 * Build the `DTSTART` + `RRULE` text for one arm.
 *
 * Byte-identical to `loopRrule` in `src/loop.ts`, including the anchor one interval ahead
 * of the next whole second (at or behind the clock spends an occurrence without
 * delivering it). Pinned by `test/iterate-plan.spec.ts` against the shipped builder rather
 * than by inspection, so the harness cannot drift from the plugin's row format.
 * @param intervalMinutes - minutes between rounds.
 * @param rounds - `COUNT` boundary.
 * @param now - clock reading in epoch milliseconds.
 * @returns the two-line rule.
 */
export function rruleFor(intervalMinutes, rounds, now) {
  const start = new Date(Math.ceil(now / 1000) * 1000 + intervalMinutes * 60_000)
  const stamp = start.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  return `DTSTART:${stamp}\nRRULE:FREQ=MINUTELY;INTERVAL=${intervalMinutes};COUNT=${rounds}`
}

/**
 * Cut the remaining rounds into arms, first arm first.
 * @param remaining - rounds still inside the budget.
 * @param shape - `single` or `chain`.
 * @param cap - per-arm cap (`armCapRounds`); `single` uses the row maximum instead.
 * @param rowMax - rounds one row may carry.
 * @returns arm sizes, each ≥ 1 and ≤ `rowMax`, summing to `remaining`.
 */
export function armSizes(remaining, shape, cap, rowMax) {
  const size = shape === 'single' ? Math.min(remaining, rowMax) : Math.min(cap, rowMax)
  const sizes = []
  let left = remaining
  while (left > 0) {
    const take = Math.min(size, left)
    sizes.push(take)
    left -= take
  }
  if (sizes.reduce((sum, value) => sum + value, 0) !== remaining) {
    throw new PlanError('internal: arm sizes do not sum to the remaining budget', 70)
  }
  if (sizes.some(value => value > rowMax)) {
    throw new PlanError('internal: an arm exceeds the row maximum', 70)
  }
  return sizes
}

/**
 * Compute the plan.
 * @param config - validated harness configuration.
 * @param state - `readLoopState` result.
 * @param now - clock reading in epoch milliseconds.
 * @returns the plan object the text and JSON renderers print.
 */
export function buildPlan(config, state, now) {
  const used = state.used
  const remaining = config.totalRounds - used
  const guardArgs = [`--max-rounds`, String(config.stop.roundCap), `--threshold`, String(config.stop.blockedStreak)]
  const stop = [
    { code: 'stop-file', detail: '`.rsi/STOP` exists; the operator removes it after the cause is resolved' },
    { code: 'round-cap', detail: `the next round would be above ${config.stop.roundCap}` },
    { code: 'blocked-streak', detail: `${config.stop.blockedStreak} consecutive BLOCKED rounds at the ledger tail` },
    { code: 'stall-unclosed', detail: `${config.stop.skipStreak} consecutive skips of the same unclosed round` },
    { code: 'budget-exhausted', detail: `the ledger already accounts for ${config.totalRounds} rounds` },
    { code: 'protocol-stop', detail: 'PROTOCOL §"stop conditions": no theme above its risk, 2 failed rounds, or a redline breach' },
  ]
  const plan = {
    kind: 'rsi-iteration-plan',
    shape: config.shape,
    total: config.totalRounds,
    used,
    reportMax: state.reportMax,
    ledgerMax: state.ledgerMax,
    remaining: Math.max(0, remaining),
    intervalMinutes: config.intervalMinutes,
    guardArgs: guardArgs.join(' '),
    envelope: config.envelope,
    status: remaining > 0 ? 'OPEN' : 'EXHAUSTED',
    stop,
    arms: [],
    stopCode: null,
  }
  if (remaining <= 0) {
    plan.stopCode = 'budget-exhausted'
    return plan
  }
  const sizes = armSizes(remaining, config.shape, config.armCapRounds, config.rowMaxRounds)
  let next = used + 1
  sizes.forEach((rounds, index) => {
    const arm = {
      index: index + 1,
      count: sizes.length,
      rounds,
      firstRound: next,
      lastRound: next + rounds - 1,
      // Only the first arm can carry an anchor: the later ones are armed when the
      // previous one ends, and their `DTSTART` is that moment, not this one.
      rrule: index === 0 ? rruleFor(config.intervalMinutes, rounds, now) : null,
      rruleNote: index === 0
        ? null
        : `armed when arm ${index} ends; COUNT=${rounds}, INTERVAL=${config.intervalMinutes}`,
    }
    next += rounds
    plan.arms.push(arm)
  })
  return plan
}

/**
 * List the POOL items that are still open, in file order, and mark the first.
 *
 * POOL order is priority order — the file is curated by hand — so this tool reports the
 * order and never re-ranks. An item is closed when its marker says `DONE` or `STALE`;
 * a line whose marker is anything else is open. Reporting is all this does: a line
 * carrying `H` is a hypothesis and stays in the list as one.
 * @param root - repository root.
 * @returns `{ items: Array<{line:number, marker:string, open:boolean, text:string}>, open }`.
 */
export function readPool(root) {
  const file = join(root, '.rsi/POOL.md')
  if (!existsSync(file)) return { items: [], open: [] }
  const items = []
  readFileSync(file, 'utf8').split('\n').forEach((text, index) => {
    if (!text.startsWith('- ')) return
    const body = text.slice(2)
    const markerEnd = body.indexOf(' · ')
    const marker = (markerEnd === -1 ? body : body.slice(0, markerEnd)).trim()
    const closed = /\b(DONE|STALE)\b/.test(marker)
    items.push({ line: index + 1, marker, open: !closed, text: body.slice(0, 200) })
  })
  return { items, open: items.filter(item => item.open) }
}

/** Render the plan as the text lines a human reads before arming. */
export function renderText(plan) {
  const head = [
    `plan shape=${plan.shape} total=${plan.total} used=${plan.used} remaining=${plan.remaining}`,
    `arms=${plan.arms.length} interval=${plan.intervalMinutes} guard_args="${plan.guardArgs}" status=${plan.status}`,
  ]
  if (plan.status === 'EXHAUSTED') {
    head.push(`stop code=${plan.stopCode}: the ledger already accounts for ${plan.total} rounds; open no round`)
    return head.join('\n')
  }
  const lines = [...head]
  for (const arm of plan.arms) {
    lines.push(`arm ${arm.index}/${arm.count} rounds=${arm.rounds} rounds_window=${arm.firstRound}..${arm.lastRound}`)
    lines.push(arm.rrule === null
      ? `arm ${arm.index}/${arm.count} rrule=(${arm.rruleNote})`
      : `arm ${arm.index}/${arm.count} rrule=${arm.rrule.replace('\n', '\\n')}`)
  }
  lines.push(`envelope maxConcurrency=${plan.envelope.maxConcurrency}/${plan.envelope.hardMaxConcurrency} retries=${plan.envelope.retries}/${plan.envelope.hardMaxRetries}`)
  return lines.join('\n')
}

/** Parse `--flag value` / `--flag` arguments. */
export function parseArgs(argv) {
  const options = { json: false, pool: false }
  const valued = ['--root', '--now', '--shape', '--total', '--interval', '--arm-cap']
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--json') { options.json = true; continue }
    if (arg === '--pool') { options.pool = true; continue }
    if (arg === '-h' || arg === '--help') { options.help = true; continue }
    if (!valued.includes(arg)) throw new PlanError(`unknown argument ${arg}`)
    const value = argv[index + 1]
    if (value === undefined) throw new PlanError(`${arg} needs a value`)
    index += 1
    const numeric = ['--now', '--total', '--interval', '--arm-cap']
    if (numeric.includes(arg)) {
      if (!/^\d+$/.test(value)) throw new PlanError(`${arg} must be a whole number, got "${value}"`)
      options[arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = Number(value)
    } else {
      options[arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value
    }
  }
  return options
}

/**
 * Run the CLI.
 * @param argv - arguments after the script name.
 * @param cwd - clock-independent base for the default root and `now`.
 * @returns `{ code, out }` — the exit code and what to print.
 */
export function run(argv, { defaultRoot, now = () => Date.now() } = {}) {
  const options = parseArgs(argv)
  if (options.help) return { code: 0, out: 'see the header of .rsi/tools/iterate-plan.mjs' }
  const root = resolve(options.root ?? defaultRoot)
  if (!existsSync(join(root, '.rsi'))) throw new PlanError(`${root}/.rsi is not a directory; --root must name the repository`, 65)
  if (options.pool) {
    const pool = readPool(root)
    const lines = pool.open.map((item, index) => `open ${index + 1}/${pool.open.length} line=${item.line} marker="${item.marker}" text=${item.text}`)
    lines.unshift(`pool open=${pool.open.length} total=${pool.items.length}`)
    lines.push(`top_next=${pool.open[0] === undefined ? 'none' : `line ${pool.open[0].line}`}`)
    return { code: 0, out: options.json ? JSON.stringify({ kind: 'rsi-pool', ...pool, topNext: pool.open[0] ?? null }, null, 2) : lines.join('\n') }
  }
  const overrides = {}
  if (options.shape !== undefined) overrides.shape = options.shape
  if (options.total !== undefined) overrides.totalRounds = options.total
  if (options.interval !== undefined) overrides.intervalMinutes = options.interval
  if (options.armCap !== undefined) overrides.armCapRounds = options.armCap
  const config = loadHarness(root, overrides)
  const plan = buildPlan(config, readLoopState(root), options.now ?? now())
  return {
    code: plan.status === 'EXHAUSTED' ? 20 : 0,
    out: options.json ? JSON.stringify(plan, null, 2) : renderText(plan),
  }
}

const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (invokedDirectly) {
  const defaultRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
  try {
    const { code, out } = run(process.argv.slice(2), { defaultRoot })
    process.stdout.write(`${out}\n`)
    process.exitCode = code
  } catch (error) {
    if (error instanceof PlanError) {
      process.stderr.write(`iterate-plan: ${error.message}\n`)
      process.exitCode = error.code
    } else {
      process.stderr.write(`iterate-plan: ${error.stack ?? String(error)}\n`)
      process.exitCode = 70
    }
  }
}
