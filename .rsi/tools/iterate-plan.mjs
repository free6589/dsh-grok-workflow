#!/usr/bin/env node
/**
 * Bounded iteration plan for the RSI loop (`.rsi/HARNESS.md`).
 *
 * The loop's budget is 1000 rounds. This tool answers exactly one question, from durable
 * state and nothing else: toward that budget, which heartbeat row should be armed, how many
 * rounds may it carry, and what stops the loop. It deliberately does not arm anything: a
 * scheduled task is the operator's action (`docs/knowledge/DECISIONS.md` D-066, D-093), and a
 * delegated subagent is refused by the schedule tools. What it removes is the reasoning step —
 * the arithmetic, the plugin's own bounds and the stop flags are computed here, `--arm-spec`
 * turns them into the one call that spends the whole budget, and `--verify-row` measures
 * afterwards whether that call is still in force.
 *
 * Read-only: it opens files under the repository and prints. It writes nothing, starts no
 * timer, and keeps no state between runs — the durable state is `.rsi/ledger.jsonl` plus
 * `.rsi/ROUND.md`, which the loop already maintains and the heartbeat guard already reads.
 *
 * Usage:
 *   iterate-plan.mjs [--root DIR] [--now EPOCH_MS] [--shape single|chain]
 *                    [--total N] [--interval N] [--arm-cap N] [--json] [--pool]
 *                    [--arm-spec] [--verify-row] [--store FILE]
 *
 *   --root DIR      repository to read (default: the repository this script is in)
 *   --now EPOCH_MS  clock reading for the `DTSTART` anchor (default: now); tests set it
 *   --shape …       override `.rsi/harness.json` `shape`: `single` (one row covering the whole
 *                   remaining budget — the default, so ONE arming action reaches round 1000)
 *                   or `chain` (arms of at most `armCapRounds`, each armed when its
 *                   predecessor ends)
 *   --total N       override the budget in rounds
 *   --interval N    override the heartbeat interval in minutes
 *   --arm-cap N     override the per-arm round cap
 *   --json          print the plan as one JSON object instead of the text lines
 *   --pool          print the open POOL items in file order and mark the next one
 *   --arm-spec      print the single Schedule call this budget needs: the slot title, the row
 *                   to edit (or `create`), the exact `rrule`, and the prompt with its size
 *                   checked against the plugin's own bound
 *   --verify-row    read the host's schedule store (never the prompt text) and say whether the
 *                   harness is ARMED: does a row carry the slot title, and does its remaining
 *                   `COUNT` still cover every round the budget has left
 *   --store FILE    schedule store `--verify-row` reads
 *                   (default: `$DSH_SCHEDULE_STORE`, else `~/.dsh/storages/schedule.json`)
 *
 * Exit codes:
 *   0   plan printed, budget open (or: `--verify-row` found the harness ARMED)
 *   20  budget exhausted: the ledger already accounts for every round (a stop, not an error)
 *   21  `--verify-row` found the harness NOT_ARMED (nobody is going to deliver the rounds)
 *   22  `--verify-row` could not read the store (absent or unreadable: state unknown)
 *   64  bad argument or unusable harness configuration
 *   65  `--root` is not this repository
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
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
  // `single` by default: one row carries the whole remaining budget, so reaching round 1000
  // costs exactly ONE arming action and nothing after it — the loop runs the 1000 rounds by
  // itself and stops at the ceiling. `chain` (arms of at most `armCapRounds`, each armed when
  // its predecessor ends) stays available for an operator who wants every row inside the width
  // the plugin's own switch writes; it costs one arming action per arm (D-092, D-093).
  shape: 'single',
  intervalMinutes: 60,
  armCapRounds: 100,
  rowMaxRounds: 1000,
  // The row's storage identity (`ITERATE_TASK_TITLE` in `src/loop.ts`) and the prompt the arm
  // stores. Both are checked against src/ by `test/iterate-plan.spec.ts`, so the harness cannot
  // arm a row the plugin would not recognise, or store a prompt its own gate would refuse.
  taskTitle: 'RSI heartbeat',
  promptFile: '.rsi/HEARTBEAT-PROMPT.md',
  promptMaxChars: 4000,
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
  for (const [name, value] of [['taskTitle', config.taskTitle], ['promptFile', config.promptFile]]) {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new PlanError(`${name} must be a non-empty string, got ${JSON.stringify(value)}`)
    }
  }
  whole('promptMaxChars', config.promptMaxChars, 200, 100000)
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

/** Where the host's schedule store lives when `--store` and `$DSH_SCHEDULE_STORE` are absent. */
export const DEFAULT_SCHEDULE_STORE = join(homedir(), '.dsh/storages/schedule.json')

/**
 * The prompt one arm stores, and whether it fits the bound the plugin enforces.
 *
 * The prompt is a file in the repository rather than a string in the plan, because a row is
 * armed once and delivered 1000 times: the text has to be the constant one, not this round's
 * numbers. `heartbeat-guard.sh --round auto` derives the round inside the delivered turn, so
 * the same bytes open every round of the budget (`.rsi/HEARTBEAT-PROMPT.md`).
 * @param root - repository root.
 * @param config - validated harness configuration.
 * @returns `{ file, path, chars, limit, fits, missing }`.
 */
export function readPrompt(root, config) {
  const file = config.promptFile
  const path = join(root, file)
  if (!existsSync(path)) {
    return { file, path, text: '', chars: 0, limit: config.promptMaxChars, fits: false, missing: true }
  }
  const source = readFileSync(path, 'utf8')
  // A file may carry its own commentary around the prompt (this one does). What a row stores is
  // the text between the markers when they are present, and the whole file otherwise.
  const start = source.indexOf('<!-- arm-prompt:start -->')
  const end = source.indexOf('<!-- arm-prompt:end -->')
  const text = start !== -1 && end > start
    ? source.slice(start + '<!-- arm-prompt:start -->'.length, end).trim()
    : source.trim()
  return {
    file, path, text, chars: text.length, limit: config.promptMaxChars,
    fits: text.length <= config.promptMaxChars, missing: false,
  }
}

/**
 * The one Schedule call that spends the remaining budget.
 *
 * Everything a caller needs and nothing it has to compute: the slot title the plugin matches
 * (`isLoopSlot` / `slotOf` in `src/loop.ts` — a renamed row stops being the slot), the `rrule`
 * byte-identical to the plugin's own builder, the prompt file with its size against
 * `MAX_LOOP_PROMPT_CHARS`, and whether an existing row of that title is there to edit.
 * @param root - repository root.
 * @param config - validated harness configuration.
 * @param plan - the computed plan.
 * @param store - `readScheduleStore` result, or `null` when the store was not consulted.
 * @returns the arm specification.
 */
export function buildArmSpec(root, config, plan, store) {
  const prompt = readPrompt(root, config)
  const live = store?.status === 'ok'
    ? store.rows.filter(row => row.title === config.taskTitle).sort((a, b) => b.deliveries - a.deliveries)[0] ?? null
    : null
  const arm = plan.arms[0] ?? null
  return {
    kind: 'rsi-arm-spec',
    status: plan.status,
    title: config.taskTitle,
    mode: live === null ? 'create' : 'edit',
    id: live?.id ?? null,
    rounds: arm?.rounds ?? 0,
    roundsWindow: arm === null ? null : `${arm.firstRound}..${arm.lastRound}`,
    intervalMinutes: config.intervalMinutes,
    rrule: arm?.rrule ?? null,
    promptFile: prompt.file,
    promptText: prompt.text,
    promptChars: prompt.chars,
    promptLimit: prompt.limit,
    promptFits: prompt.fits,
    promptMissing: prompt.missing,
    guardArgs: plan.guardArgs,
    remaining: plan.remaining,
    used: plan.used,
    rowMaxRounds: config.rowMaxRounds,
    liveRow: live,
    note: live === null
      ? 'no row carries the slot title: create one with this rrule, title and prompt, then run --verify-row'
      : `row ${live.id} carries the slot title with COUNT covering ${live.deliveries} delivered occurrence(s); `
        + 'edit its rrule to the one above, keep the title and prompt',
  }
}

/**
 * Parse the parts of an `RRULE` the harness cares about.
 *
 * Only the shapes this harness writes are understood: a UTC `DTSTART`, `FREQ=MINUTELY` with an
 * interval, and a finite `COUNT`. Anything else is reported as unparsed rather than guessed at,
 * because a rule whose end the tool cannot compute is a rule whose coverage it cannot claim.
 * @param rrule - the stored rule.
 * @returns `{ ok, count?, startMs?, stepMinutes?, lastMs?, reason? }`.
 */
export function parseArmRule(rrule) {
  if (typeof rrule !== 'string' || rrule.trim() === '') return { ok: false, reason: 'no rule stored' }
  const freq = /FREQ=([A-Z]+)/.exec(rrule)
  const count = /COUNT=(\d+)/.exec(rrule)
  const interval = /INTERVAL=(\d+)/.exec(rrule)
  const start = /DTSTART:(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/.exec(rrule)
  if (count === null) return { ok: false, reason: 'the rule has no COUNT, so it never ends' }
  if (freq === null || freq[1] !== 'MINUTELY') return { ok: false, reason: `FREQ=${freq?.[1] ?? 'absent'} is not the harness's MINUTELY` }
  if (start === null) return { ok: false, reason: 'the rule has no UTC DTSTART' }
  const startMs = Date.UTC(
    Number(start[1]), Number(start[2]) - 1, Number(start[3]),
    Number(start[4]), Number(start[5]), Number(start[6]),
  )
  const stepMinutes = Number(interval?.[1] ?? 60)
  const occurrences = Number(count[1])
  return { ok: true, count: occurrences, startMs, stepMinutes, lastMs: startMs + (occurrences - 1) * stepMinutes * 60_000 }
}

/**
 * Read the host's schedule store, without its prompt text.
 *
 * The file is the Host's, not this repository's: it is read, never written, and the prompt of
 * every row is reduced to its length so that reading the store can never print a task's content.
 * @param path - store path.
 * @returns `{ status, path, rows, reason? }` with `status` one of `ok`, `absent`, `unreadable`.
 */
export function readScheduleStore(path) {
  if (!existsSync(path)) return { status: 'absent', path, rows: [], reason: 'the file does not exist' }
  let doc
  try {
    doc = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    return { status: 'unreadable', path, rows: [], reason: `not valid JSON: ${error.message}` }
  }
  const tasks = doc?.tables?.tasks
  if (tasks === null || typeof tasks !== 'object') {
    return { status: 'unreadable', path, rows: [], reason: 'tables.tasks is missing' }
  }
  const rows = []
  for (const [id, entry] of Object.entries(tasks)) {
    const record = entry?.record ?? {}
    rows.push({
      id,
      title: typeof record.title === 'string' ? record.title : null,
      rrule: typeof record.rrule === 'string' ? record.rrule : null,
      scheduledAt: typeof record.scheduledAt === 'string' ? record.scheduledAt : null,
      promptChars: typeof record.prompt === 'string' ? record.prompt.length : 0,
      deliveries: Array.isArray(entry?.deliveryHistory?.records) ? entry.deliveryHistory.records.length : 0,
    })
  }
  return { status: 'ok', path, rows }
}

/**
 * Is the harness armed right now?
 *
 * The question the loop cannot ask itself from inside a round, and the one a landed design has
 * to answer honestly: a budget, a plan and a guard are worth nothing if no row is going to
 * deliver the rounds. `covered = COUNT - deliveries` is the number of rounds the row still has
 * to give; it is compared with the budget's remaining rounds, and the row may not be wider than
 * the plan's own row maximum (a wider row would spend budget past the last planned round).
 * @param spec - `buildArmSpec` result.
 * @param store - `readScheduleStore` result.
 * @param now - clock reading in epoch milliseconds.
 * @returns `{ status, checks, covered, row, detail }`; `status` is `ARMED`, `NOT_ARMED` or `UNKNOWN`.
 */
export function verifyArm(spec, store, now) {
  const out = {
    kind: 'rsi-arm-verify',
    status: 'UNKNOWN',
    title: spec.title,
    storePath: store.path,
    row: null,
    covered: 0,
    remaining: spec.remaining,
    checks: [],
    detail: '',
  }
  if (store.status !== 'ok') {
    out.detail = `the schedule store could not be read (${store.status}: ${store.reason}); the armed state is unknown`
    return out
  }
  const row = store.rows.find(candidate => candidate.title === spec.title) ?? null
  out.row = row
  if (row === null) {
    out.status = 'NOT_ARMED'
    out.detail = `no row carries the slot title "${spec.title}"; nothing will deliver the ${spec.remaining} rounds left`
    return out
  }
  const rule = parseArmRule(row.rrule)
  const covered = rule.ok ? Math.max(0, rule.count - row.deliveries) : 0
  out.covered = covered
  const check = (name, ok, detail) => out.checks.push({ name, ok, detail })
  check('title', true, `row ${row.id} carries the slot title`)
  check('rule-parsed', rule.ok, rule.ok ? `COUNT=${rule.count}, INTERVAL=${rule.stepMinutes}` : rule.reason)
  check('within-row-maximum', rule.ok && rule.count <= spec.rowMaxRounds,
    rule.ok ? `COUNT=${rule.count} vs row maximum ${spec.rowMaxRounds}` : 'not parsed')
  check('covers-remaining-budget', covered >= spec.remaining,
    `${covered} round(s) left in the row (COUNT ${rule.ok ? rule.count : '?'} - ${row.deliveries} delivered) vs ${spec.remaining} remaining`)
  check('has-a-future-occurrence', rule.ok && rule.lastMs !== null && rule.lastMs >= now,
    rule.ok && rule.lastMs !== null
      ? `last occurrence ${new Date(rule.lastMs).toISOString()} vs now ${new Date(now).toISOString()}`
      : 'not parsed')
  out.status = out.checks.every(item => item.ok) ? 'ARMED' : 'NOT_ARMED'
  out.detail = out.status === 'ARMED'
    ? `row ${row.id} still owes ${covered} round(s) at ${rule.stepMinutes}-minute steps, last one ${new Date(rule.lastMs).toISOString()}`
    : `row ${row.id} does not cover the ${spec.remaining} rounds left: ${out.checks.filter(item => !item.ok).map(item => item.name).join(', ')}`
  return out
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

/** Render the arm specification as the lines a caller reads before the one call. */
export function renderArmSpec(spec) {
  if (spec.status === 'EXHAUSTED') {
    return `arm-spec status=EXHAUSTED: the budget accounts for every round; arm nothing (stop code=budget-exhausted)`
  }
  const rule = spec.rrule === null ? '(none)' : spec.rrule.replace('\n', '\\n')
  const live = spec.liveRow === null
    ? 'none'
    : `${spec.liveRow.id} COUNT=${parseArmRule(spec.liveRow.rrule).count ?? '?'} delivered=${spec.liveRow.deliveries}`
  return [
    `arm-spec status=${spec.status} title="${spec.title}" mode=${spec.mode} id=${spec.id ?? '(create a new row)'}`,
    `arm-spec rounds=${spec.rounds} window=${spec.roundsWindow ?? '(none)'} interval=${spec.intervalMinutes} remaining=${spec.remaining} used=${spec.used}`,
    `arm-spec rrule=${rule}`,
    `arm-spec prompt=${spec.promptFile} chars=${spec.promptChars}/${spec.promptLimit} fits=${spec.promptFits ? 'yes' : 'NO'}`,
    `arm-spec live-row=${live}`,
    `arm-spec next: ${spec.note}`,
  ].join('\n')
}

/** Render `--verify-row` as a verdict, one line per check, then the next action. */
export function renderArmVerify(result) {
  const lines = [`verify status=${result.status} title="${result.title}" remaining=${result.remaining}`]
  if (result.row !== null) {
    const rule = parseArmRule(result.row.rrule)
    lines.push(
      `verify row=${result.row.id} COUNT=${rule.ok ? rule.count : '?'} delivered=${result.row.deliveries} `
      + `covered=${result.covered} last=${rule.ok && rule.lastMs !== null ? new Date(rule.lastMs).toISOString() : '?'}`,
    )
  }
  for (const check of result.checks) {
    lines.push(`verify check ${check.name} ${check.ok ? 'ok' : 'FAIL'}: ${check.detail}`)
  }
  lines.push(`verify store=${result.storePath}`)
  lines.push(`verify detail=${result.detail}`)
  if (result.status !== 'ARMED') {
    lines.push('verify next: node .rsi/tools/iterate-plan.mjs --arm-spec --json   (then the one schedule call it names)')
  }
  return lines.join('\n')
}

/** Parse `--flag value` / `--flag` arguments. */
export function parseArgs(argv) {
  const options = { json: false, pool: false, armSpec: false, verifyRow: false }
  const valued = ['--root', '--now', '--shape', '--total', '--interval', '--arm-cap', '--store']
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--json') { options.json = true; continue }
    if (arg === '--pool') { options.pool = true; continue }
    if (arg === '--arm-spec') { options.armSpec = true; continue }
    if (arg === '--verify-row') { options.verifyRow = true; continue }
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
  const clock = options.now ?? now()
  const plan = buildPlan(config, readLoopState(root), clock)
  if (options.armSpec || options.verifyRow) {
    const storePath = resolve(options.store ?? process.env.DSH_SCHEDULE_STORE ?? DEFAULT_SCHEDULE_STORE)
    const store = readScheduleStore(storePath)
    const spec = buildArmSpec(root, config, plan, store)
    if (options.armSpec) {
      return { code: plan.status === 'EXHAUSTED' ? 20 : 0, out: options.json ? JSON.stringify(spec, null, 2) : renderArmSpec(spec) }
    }
    const result = verifyArm(spec, store, clock)
    return {
      code: result.status === 'ARMED' ? 0 : result.status === 'NOT_ARMED' ? 21 : 22,
      out: options.json ? JSON.stringify(result, null, 2) : renderArmVerify(result),
    }
  }
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
