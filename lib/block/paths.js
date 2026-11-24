/**
 * Where the block-intake ledger lives.
 *
 * Same three-step rule as the task board (`src/taskboard/paths.ts`), the
 * checkpoint recorder and the memory archive — one rule, three callers, so a
 * test that redirects one of them never has to learn a second convention:
 *
 * 1. an explicit `dir` from the caller;
 * 2. `GROK_WORKFLOW_BLOCK_LEDGER_DIR`, so tests and e2e lanes can redirect the
 *    ledger without a configuration key and without touching a real `$DSH_HOME`;
 * 3. `$DSH_HOME` (else `~/.dsh`) + `taskboards/grok-workflow` — the *same*
 *    directory as `store.jsonl`, because the ledger and the board describe the
 *    same work and an operator should find both in one place.
 *
 * Inside that directory the ledger is three files, each one JSON object per line:
 * `blocks.jsonl` (one line per version of an intake row) and `verdicts.jsonl`
 * (one line per supervisor verdict) — the two paths this module resolves — plus
 * `heartbeats.jsonl` (one line per observed heartbeat delivery), which is named,
 * resolved and read by `./brakes.ts` because the observer owns it. That third
 * file is absent from this module on purpose, not by oversight: the two ledgers
 * here are written by `./store.ts`, and the observer deliberately writes no row
 * into either. No line of any of the three is ever edited or removed — see
 * `./store.ts` and `./brakes.ts`.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
/** Environment override for the ledger directory (tests, e2e, alternate profiles). */
export const BLOCK_LEDGER_DIR_ENV = 'GROK_WORKFLOW_BLOCK_LEDGER_DIR';
/** File name of the intake rows, one version per line. */
export const BLOCKS_FILE = 'blocks.jsonl';
/** File name of the supervisor verdicts, one verdict per line. */
export const VERDICTS_FILE = 'verdicts.jsonl';
/**
 * Resolve the ledger directory.
 * @param options - caller options; `dir` wins over the environment.
 * @returns The directory (not created until the first write).
 */
export function blockLedgerDir(options = {}) {
    if (options.dir !== undefined && options.dir.trim() !== '')
        return options.dir;
    const override = process.env[BLOCK_LEDGER_DIR_ENV];
    if (override !== undefined && override.trim() !== '')
        return override;
    const home = process.env.DSH_HOME;
    const base = home !== undefined && home.trim() !== '' ? home : join(homedir(), '.dsh');
    return join(base, 'taskboards', 'grok-workflow');
}
/** Path of the intake rows: `<ledgerDir>/blocks.jsonl`. */
export function blocksFile(options = {}) {
    return join(blockLedgerDir(options), BLOCKS_FILE);
}
/** Path of the supervisor verdicts: `<ledgerDir>/verdicts.jsonl`. */
export function verdictsFile(options = {}) {
    return join(blockLedgerDir(options), VERDICTS_FILE);
}
//# sourceMappingURL=paths.js.map