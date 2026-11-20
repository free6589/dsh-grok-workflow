import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The loop's own ledger has to stay in step with the round reports.
 *
 * `.rsi/tools/heartbeat-guard.sh` refuses to open a round when `.rsi/ROUND.md` documents a
 * round the ledger does not admit (`code=round-without-ledger`) — that is its "the previous
 * round was not closed" signal. The ledger is written by hand, so it drifted: rounds 27–32
 * were committed to `ROUND.md`, `LOG.md` and `STATE.md`, and the ledger stopped at 25. From
 * round 30 on every heartbeat therefore read SKIP, and after three consecutive skips the
 * guard escalates to STOP (`stall-unclosed`), which would have ended the loop without a
 * single failing test ever going red (`docs/knowledge/VALIDATION.md`, round 33).
 *
 * The guard's own contract is exercised against throwaway fixtures in
 * `test/heartbeat-guard.spec.ts`; this file pins the *live* records, because the fixture
 * tests cannot notice that this repository's ledger fell behind.
 */

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8')
const exists = (path: string) => existsSync(fileURLToPath(new URL(`../${path}`, import.meta.url)))

interface LedgerRow {
  round: number | string
  theme?: string
  status?: string
  tag?: string | null
  ci?: string
  evidence?: string
  at?: string
  commit?: string
}

const roundNumbers = [...read('.rsi/ROUND.md').matchAll(/^## Round (\d+)/gm)]
  .map(match => Number(match[1]))
  .sort((left, right) => left - right)
const ledgerRows: LedgerRow[] = read('.rsi/ledger.jsonl')
  .split('\n')
  .filter(line => line.trim() !== '')
  .map(line => JSON.parse(line) as LedgerRow)
const ledgerRounds = ledgerRows
  .map(row => row.round)
  .filter((round): round is number => typeof round === 'number')
  .sort((left, right) => left - right)

describe('the RSI ledger admits every documented round', () => {
  it('parses both records', () => {
    expect(roundNumbers.length).toBeGreaterThan(0)
    expect(ledgerRows.length).toBeGreaterThan(0)
  })

  it('admits the newest round report, which is what the heartbeat gate reads', () => {
    // The guard compares `round_max` with `ledger_max`; a ledger that stops short of the
    // newest report makes every heartbeat SKIP and then STOP.
    const newestReport = Math.max(...roundNumbers)
    expect(ledgerRounds).toContain(newestReport)
    expect(Math.max(...ledgerRounds)).toBeGreaterThanOrEqual(newestReport)
  })

  it('never names a round the reports do not carry', () => {
    expect(Math.max(...ledgerRounds)).toBeLessThanOrEqual(Math.max(...roundNumbers))
  })

  it('carries the fields a reviewer or the guard reads', () => {
    for (const row of ledgerRows) {
      // Early rows numbered a release row `20r`, so the label is not always a bare number.
      expect(String(row.round), JSON.stringify(row)).toMatch(/^\d+[a-z]?$/)
      expect(row.theme, `round ${row.round} has no theme`).toBeTruthy()
      expect(['OK', 'BLOCKED'], `round ${row.round} has no status`).toContain(row.status)
      expect(row.at, `round ${row.round} has no timestamp`).toBeTruthy()
      expect(row.evidence, `round ${row.round} has no evidence path`).toBeTruthy()
      expect(exists(row.evidence as string), `round ${row.round} points at a missing evidence path`).toBe(true)
    }
  })

  it('keeps the trailing round report closed', () => {
    // The guard's `round-report-open` signal: the last `## Round N` section must state a
    // status, otherwise the round was opened and abandoned.
    const sections = read('.rsi/ROUND.md').split(/^## Round \d+/m)
    const trailing = sections[sections.length - 1]
    expect(trailing).toMatch(/^- \*\*status:\*\* (OK|STOP|BLOCKED)/m)
  })
})
