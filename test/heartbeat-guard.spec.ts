import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Heartbeat guard contract (`.rsi/tools/heartbeat-guard.sh`).
 *
 * The heartbeat prompt tells a scheduled turn to obey the guard's first word before it opens a
 * round. That makes three properties load-bearing, and none of them is visible in the prompt
 * itself: the guard must say RESUME only when the previous round is really closed, it must say
 * SKIP without opening anything, and it must stop at the BLOCKED threshold instead of letting a
 * blocked loop spend one full round per hour. Each test builds a throwaway repository whose
 * `.rsi/` records are the only input, so the contract is checked against the files the guard
 * actually reads rather than against the live loop's current state.
 */

const guardPath = fileURLToPath(new URL('../.rsi/tools/heartbeat-guard.sh', import.meta.url))
const templatePath = fileURLToPath(new URL('../.rsi/HEARTBEAT.md', import.meta.url))

interface RunResult {
  status: number
  out: string
}

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', ['-c', 'user.email=guard@example.invalid', '-c', 'user.name=guard', '-c', 'commit.gpgsign=false', ...args], {
    cwd,
    stdio: 'ignore',
  })
}

function ledgerLine(round: number, status: string, theme: string): string {
  return JSON.stringify({
    round,
    theme,
    status,
    tag: status === 'OK' ? `v0.0.${round}` : '',
    ci: 'npm run ci exit 0 · 1 test files passed · 1 tests passed',
    evidence: `.rsi/evidence/round-${String(round).padStart(3, '0')}/`,
    at: '2026-11-18T00:00+0800',
    commit: status === 'OK' ? 'abc1234' : '',
  })
}

function roundSection(round: number, status: string, theme: string): string {
  const fields = [
    `## Round ${round} — ${theme}`,
    '',
    `- **Theme:** ${theme}.`,
    `- **Evidence:** \`.rsi/evidence/round-${String(round).padStart(3, '0')}/\`.`,
  ]
  if (status !== '') fields.push(`- **status:** ${status}`)
  return fields.join('\n')
}

interface RepoOptions {
  rounds: Array<{ round: number; status: string; theme: string }>
  ledger: string[]
  dirty?: boolean
  stop?: boolean
  untracked?: string
}

/** A minimal repository whose only meaningful content is the four records the guard reads. */
function createRepo(options: RepoOptions): string {
  const root = mkdtempSync(join(tmpdir(), 'heartbeat-guard-'))
  mkdirSync(join(root, '.rsi'), { recursive: true })
  mkdirSync(join(root, 'docs', 'knowledge'), { recursive: true })
  writeFileSync(join(root, '.rsi', 'STATE.md'), '# RSI State\n\nUpdated: 2026-11-18T22:00+08:00 · round fixture\n')
  writeFileSync(join(root, '.rsi', 'LOG.md'), '# RSI Log\n\n| round | time | theme | result |\n|---|---|---|---|\n')
  writeFileSync(
    join(root, '.rsi', 'ROUND.md'),
    ['# RSI Round Reports', '', ...options.rounds.map((entry) => roundSection(entry.round, entry.status, entry.theme))].join(
      '\n\n',
    ) + '\n',
  )
  writeFileSync(join(root, '.rsi', 'ledger.jsonl'), options.ledger.map((line) => `${line}\n`).join(''))
  writeFileSync(
    join(root, 'docs', 'knowledge', 'HANDOFF.md'),
    '# Agent Handoff\n\n## 2026-11-18 — fixture newest entry\n\n- nothing to hand off\n',
  )
  writeFileSync(join(root, '.rsi', 'HEARTBEAT.md'), readFileSync(templatePath, 'utf8'))
  writeFileSync(join(root, 'README.md'), '# fixture\n')
  git(root, 'init', '--quiet')
  git(root, 'add', '--all')
  git(root, 'commit', '--quiet', '-m', 'fixture')
  if (options.dirty === true) writeFileSync(join(root, 'README.md'), '# fixture, edited mid-round\n')
  if (options.stop === true) writeFileSync(join(root, '.rsi', 'STOP'), 'operator pause\n')
  if (options.untracked !== undefined) writeFileSync(join(root, options.untracked), 'untracked on purpose\n')
  return root
}

function runGuard(root: string, ...args: string[]): RunResult {
  try {
    const out = execFileSync('bash', [guardPath, '--root', root, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { status: 0, out }
  } catch (error) {
    const failure = error as { status?: number | null; stdout?: string }
    return { status: failure.status ?? -1, out: failure.stdout ?? '' }
  }
}

const closedPair = (): RepoOptions => ({
  rounds: [
    { round: 12, status: 'OK', theme: 'redaction call-site hardening' },
    { round: 13, status: 'OK', theme: 'gate landing: counts, NR reconciliation, baselines' },
  ],
  ledger: [ledgerLine(12, 'OK', 'redaction call-site hardening'), ledgerLine(13, 'OK', 'gate landing: counts, NR reconciliation, baselines')],
})

describe('a closed round lets the next heartbeat start', () => {
  it('resumes with the next round number when the report and ledger agree', () => {
    const root = createRepo(closedPair())
    const result = runGuard(root)
    expect(result.status).toBe(0)
    expect(result.out.split(' ')[0]).toBe('RESUME')
    expect(result.out).toContain('next_round=14')
    expect(result.out).toContain('code=none')
  })

  it('ignores untracked files, because a round writes evidence before it commits', () => {
    const options = closedPair()
    const root = createRepo({ ...options, untracked: 'settings-simple-mock.html' })
    expect(runGuard(root).out.split(' ')[0]).toBe('RESUME')
  })
})

describe('an open round is skipped, and nothing is opened on top of it', () => {
  it('skips when tracked files are modified mid-round', () => {
    const root = createRepo({ ...closedPair(), dirty: true })
    const before = readFileSync(join(root, '.rsi', 'ROUND.md'), 'utf8')
    const result = runGuard(root)
    expect(result.status).toBe(10)
    expect(result.out.split(' ')[0]).toBe('SKIP')
    expect(result.out).toContain('code=dirty-tracked')
    expect(result.out).toContain('first uncommitted: README.md')
    expect(readFileSync(join(root, '.rsi', 'ROUND.md'), 'utf8')).toBe(before)
  })

  it('skips when the trailing round report never recorded a status', () => {
    const options: RepoOptions = {
      rounds: [
        { round: 13, status: 'OK', theme: 'gate landing' },
        { round: 14, status: '', theme: 'repeat-run config surface' },
      ],
      ledger: [ledgerLine(13, 'OK', 'gate landing')],
    }
    const root = createRepo(options)
    const result = runGuard(root)
    expect(result.status).toBe(10)
    expect(result.out).toContain('code=round-report-open')
  })

  it('skips when a round report exists that the ledger does not list', () => {
    const root = createRepo({
      rounds: [
        { round: 13, status: 'OK', theme: 'gate landing' },
        { round: 14, status: 'BLOCKED', theme: 'repeat-run config surface' },
      ],
      ledger: [ledgerLine(13, 'OK', 'gate landing')],
    })
    expect(runGuard(root).out).toContain('code=round-without-ledger')
  })

  it('skips when the ledger lists a round with no report section', () => {
    const root = createRepo({
      rounds: [{ round: 13, status: 'OK', theme: 'gate landing' }],
      ledger: [ledgerLine(13, 'OK', 'gate landing'), ledgerLine(14, 'OK', 'repeat-run config surface')],
    })
    expect(runGuard(root).out).toContain('code=ledger-without-round')
  })
})

describe('stop conditions end the loop without opening a round', () => {
  it('stops on .rsi/STOP even when the tree is also dirty', () => {
    const root = createRepo({ ...closedPair(), dirty: true, stop: true })
    const result = runGuard(root)
    expect(result.status).toBe(20)
    expect(result.out.split(' ')[0]).toBe('STOP')
    expect(result.out).toContain('code=stop-file')
  })

  it('stops when the last three ledger rows are BLOCKED', () => {
    const root = createRepo({
      rounds: [
        { round: 14, status: 'BLOCKED', theme: 'live model smoke' },
        { round: 15, status: 'BLOCKED', theme: 'live model smoke' },
        { round: 16, status: 'BLOCKED', theme: 'live model smoke' },
      ],
      ledger: [
        ledgerLine(14, 'BLOCKED', 'live model smoke'),
        ledgerLine(15, 'BLOCKED', 'live model smoke'),
        ledgerLine(16, 'BLOCKED', 'live model smoke'),
      ],
    })
    const result = runGuard(root)
    expect(result.status).toBe(20)
    expect(result.out).toContain('code=blocked-streak')
    expect(result.out).toContain('blocked_streak=3')
  })

  it('does not stop below the threshold: two blocked rounds still resume', () => {
    const root = createRepo({
      rounds: [
        { round: 14, status: 'OK', theme: 'gate landing' },
        { round: 15, status: 'BLOCKED', theme: 'live model smoke' },
        { round: 16, status: 'BLOCKED', theme: 'live model smoke' },
      ],
      ledger: [
        ledgerLine(14, 'OK', 'gate landing'),
        ledgerLine(15, 'BLOCKED', 'live model smoke'),
        ledgerLine(16, 'BLOCKED', 'live model smoke'),
      ],
    })
    const result = runGuard(root)
    expect(result.status).toBe(0)
    expect(result.out).toContain('blocked_streak=2')
  })

  it('honours an explicit round cap and leaves the loop uncapped by default', () => {
    const root = createRepo(closedPair())
    expect(runGuard(root).status).toBe(0)
    const capped = runGuard(root, '--max-rounds', '13')
    expect(capped.status).toBe(20)
    expect(capped.out).toContain('code=round-cap')
  })

  it('stops once the same unclosed round has been skipped the threshold number of times', () => {
    const root = createRepo({ ...closedPair(), dirty: true })
    expect(runGuard(root, '--record').out.split(' ')[0]).toBe('SKIP')
    expect(runGuard(root, '--record').out.split(' ')[0]).toBe('SKIP')
    const third = runGuard(root, '--record')
    expect(third.status).toBe(20)
    expect(third.out).toContain('code=stall-unclosed')
    expect(third.out).toContain('unclosed_skips=2')
  })

  it('derives the round itself with --round auto, so one constant prompt can open every round', () => {
    // One arming action has to cover 1000 rounds (`.rsi/HEARTBEAT-PROMPT.md`, `D-093`), so the
    // prompt cannot carry a round number that goes stale: `--round auto` computes it the way the
    // plan does — the higher of the two records, plus one.
    const root = createRepo(closedPair())
    const auto = runGuard(root, '--round', 'auto')
    expect(auto.status).toBe(0)
    expect(auto.out).toContain('next_round=14')

    // A round written into the ledger but not into ROUND.md still counts as spent, exactly as
    // `.rsi/tools/iterate-plan.mjs` counts it; the verdict is a skip, the number is still 15.
    const ledgerAhead = createRepo({
      rounds: [{ round: 13, status: 'OK', theme: 'gate landing' }],
      ledger: [ledgerLine(13, 'OK', 'gate landing'), ledgerLine(14, 'OK', 'redaction call-site hardening')],
    })
    const ahead = runGuard(ledgerAhead, '--round', 'auto')
    expect(ahead.status).toBe(10)
    expect(ahead.out).toContain('next_round=15')
    expect(ahead.out).toContain('code=ledger-without-round')

    // An explicit number still wins, and a non-numeric round is still refused.
    expect(runGuard(root, '--round', '40').out).toContain('next_round=40')
    expect(runGuard(root, '--round', 'soon').status).toBe(64)
  })

  it('rejects a threshold below one instead of silently accepting it', () => {
    const root = createRepo(closedPair())
    expect(runGuard(root, '--threshold', '0').status).toBe(64)
  })
})

describe('the prompt carries the records the next turn has to reconcile', () => {
  it('fills the round number and quotes the last round, without logging', () => {
    const root = createRepo({ ...closedPair(), untracked: 'scratch.txt' })
    const result = runGuard(root, '--prompt')
    expect(result.status).toBe(0)
    expect(result.out).toContain('RSI heartbeat — round 14')
    // The harness's ceiling travels in the prompt: a prompt that named the guard without
    // `--max-rounds 1000` would resume past the budget, because the guard's own default is no
    // cap (`.rsi/HARNESS.md`, `A40`).
    expect(result.out).toContain('.rsi/tools/heartbeat-guard.sh --round 14 --max-rounds 1000 --record')
    expect(result.out).toContain('code=round-cap')
    expect(result.out).toContain('gate landing: counts, NR reconciliation, baselines')
    expect(result.out).toContain('round-013')
    expect(result.out).toContain('.rsi/STATE.md')
    expect(result.out).toContain('`.rsi/STATE.md` header: Updated:')
    expect(result.out).toContain('.rsi/LOG.md')
    expect(result.out).toContain('docs/knowledge/HANDOFF.md')
    expect(result.out).not.toContain('{{')
    expect(runGuard(root, '--prompt').out).not.toContain('LAST_ROUND_SUMMARY')
    expect(() => readFileSync(join(root, '.rsi', 'evidence', 'heartbeat-guard.log'), 'utf8')).toThrow()
  })

  it('records exactly one log line per recorded run', () => {
    const root = createRepo(closedPair())
    runGuard(root, '--record')
    runGuard(root, '--record')
    const log = readFileSync(join(root, '.rsi', 'evidence', 'heartbeat-guard.log'), 'utf8').trimEnd().split('\n')
    expect(log).toHaveLength(2)
    expect(log[0]).toContain('verdict=RESUME')
    expect(log[1]).toContain('code=none')
  })
})
