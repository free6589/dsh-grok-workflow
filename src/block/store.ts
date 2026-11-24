/**
 * The block-intake ledger on disk: two append-only JSONL files.
 *
 * ## Model
 *
 * - `blocks.jsonl` holds one line per **version** of an intake row. Starting the
 *   same row again appends `version + 1`; nothing is ever rewritten in place, so
 *   the ledger is a log of what was accepted, not a mutable table. The version
 *   is not the caller's to invent: the writer computes `上一版 + 1` and refuses
 *   a line that claims anything else, which is what makes "the 21st version" a
 *   real, checkable limit rather than a convention.
 * - `verdicts.jsonl` holds one line per supervisor verdict. Append-only, with
 *   no update and no delete path anywhere in this module: a veto that was later
 *   overridden is still part of the record.
 * - Every block row carries `rowHash` — the sha-256 of its own canonical JSON
 *   with `rowHash` removed. Writing validates it; reading re-derives it. A
 *   hand-edited or torn line is therefore detectable.
 *
 * ## Durability
 *
 * The same recipe as `src/taskboard/store.ts`: read the current file, build the
 * next body in memory, write it to a hidden `*.tmp` file in the same directory,
 * `fsync` it, and only then `rename` it over the target. A reader never sees a
 * half-written file, and a failed write leaves the previous file byte-identical
 * — the temporary file is removed on every failure path.
 *
 * ## Corrupt lines
 *
 * Reading never throws on a bad line. One torn or hand-edited line must not make
 * the rest of the ledger unreadable, so a bad line is skipped and reported in
 * `skipped` (line number, reason, and a truncated copy of the text) next to the
 * rows that did parse. Writing is the strict side: a row that does not validate
 * is refused before any byte is written.
 *
 * ## What this module does not do
 *
 * It takes no lock. Two processes appending to the same ledger at the same
 * instant could both read the same "last version" and append the same number;
 * the second rename wins and the first line is lost. The caller in this plugin
 * is one session's tool layer, and the idempotency check in `startBlock` means
 * a retry does not append at all — but a multi-writer deployment would need the
 * lock the task board uses, and that is a deliberate, documented boundary here.
 */

import { createHash, randomBytes } from 'node:crypto'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { blocksFile, verdictsFile, type BlockLedgerOptions } from './paths.js'
import {
  BLOCK_INTAKE_LIMITS,
  BLOCK_LEDGER_VERSION,
  BlockIntakeError,
  type BlockEntry,
  type BlockRow,
  type VerdictRow,
} from './types.js'

/** Where the ledger lives; `dir` wins over the environment (see `./paths.ts`). */
export type BlockStoreOptions = BlockLedgerOptions

/** One line the reader could not use, kept so the caller can say why. */
export interface SkippedLedgerLine {
  /** 1-based line number in the file. */
  line: number
  /** Why it was skipped, in one sentence. */
  reason: string
  /** The first 200 characters of the line, so a human can find it again. */
  text: string
}

/** Rows that parsed, plus the lines that did not (an array, so `rows[0]` still works). */
export type BlockRowsRead = BlockRow[] & { skipped: SkippedLedgerLine[] }

/** Same shape as `BlockRowsRead`, for the verdicts file. */
export type VerdictRowsRead = VerdictRow[] & { skipped: SkippedLedgerLine[] }

/** Sort object keys so a hash is reproducible offline, with no spaces anywhere. */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`
}

/** Lower-case hex sha-256 of a UTF-8 string. */
export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/**
 * The row's own hash: sha-256 over its canonical JSON with `rowHash` removed.
 * @param row - the row to hash; its current `rowHash` is ignored.
 */
export function rowHashOf(row: BlockRow): string {
  const payload: Record<string, unknown> = { ...row }
  delete payload['rowHash']
  return sha256Hex(canonicalJson(payload))
}

// ---------------------------------------------------------------------------
// Validation: strict on the write path, lenient (skip) on the read path.
// ---------------------------------------------------------------------------

const APPROVAL_KINDS = new Set(['preview', 'user', 'request', 'operator', 'policy'])
const BLOCK_STATUSES = new Set(['open', 'vetoed', 'accepted'])
const BLOCK_EXECUTIONS = new Set(['foreman', 'workflow'])

function fail(message: string): never {
  throw new BlockIntakeError('invalid', message)
}

function requireText(field: string, value: unknown, maxChars: number): string {
  if (typeof value !== 'string') fail(`${field} 必须是字符串`)
  if (value.trim() === '') fail(`${field} 不能为空`)
  if (value.length > maxChars) fail(`${field} 超过 ${maxChars} 个字符（实际 ${value.length}）`)
  return value
}

function requireIsoTime(field: string, value: unknown): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) fail(`${field} 必须是 ISO 时间串`)
  return value
}

function requireStringArray(field: string, value: unknown, maxItems: number, maxChars: number): string[] {
  if (!Array.isArray(value)) fail(`${field} 必须是字符串数组`)
  if (value.length > maxItems) fail(`${field} 最多 ${maxItems} 条（实际 ${value.length}）`)
  return value.map((item, index) => requireText(`${field}[${index}]`, item, maxChars))
}

function assertBlockEntry(entry: BlockEntry, index: number): void {
  const at = `blocks[${index}]`
  if (typeof entry !== 'object' || entry === null) fail(`${at} 必须是对象`)
  requireText(`${at}.id`, entry.id, 64)
  requireText(`${at}.title`, entry.title, BLOCK_INTAKE_LIMITS.titleChars)
  requireText(`${at}.objective`, entry.objective, BLOCK_INTAKE_LIMITS.objectiveChars)
  requireText(`${at}.deliverable`, entry.deliverable, BLOCK_INTAKE_LIMITS.deliverableChars)
  requireStringArray(`${at}.acceptance`, entry.acceptance, BLOCK_INTAKE_LIMITS.criteriaPerBlock, BLOCK_INTAKE_LIMITS.criterionChars)
  requireStringArray(`${at}.writesPaths`, entry.writesPaths, BLOCK_INTAKE_LIMITS.writesPathsPerBlock, BLOCK_INTAKE_LIMITS.pathChars)
  requireStringArray(`${at}.dependsOn`, entry.dependsOn, BLOCK_INTAKE_LIMITS.writesPathsPerBlock, BLOCK_INTAKE_LIMITS.titleChars)
  if (!BLOCK_EXECUTIONS.has(entry.execution)) fail(`${at}.execution 必须是 foreman 或 workflow`)
  if (entry.owner !== undefined) requireText(`${at}.owner`, entry.owner, BLOCK_INTAKE_LIMITS.ownerChars)
  if (!BLOCK_STATUSES.has(entry.status)) fail(`${at}.status 必须是 open / vetoed / accepted`)
  if (!Array.isArray(entry.tasks)) fail(`${at}.tasks 必须是数组`)
  entry.tasks.forEach((task, taskIndex) => {
    const taskAt = `${at}.tasks[${taskIndex}]`
    if (typeof task !== 'object' || task === null) fail(`${taskAt} 必须是对象`)
    requireText(`${taskAt}.id`, task.id, 64)
    requireText(`${taskAt}.title`, task.title, BLOCK_INTAKE_LIMITS.titleChars)
    requireText(`${taskAt}.objective`, task.objective, BLOCK_INTAKE_LIMITS.objectiveChars)
    requireStringArray(`${taskAt}.acceptanceCriteria`, task.acceptanceCriteria, BLOCK_INTAKE_LIMITS.criteriaPerBlock, BLOCK_INTAKE_LIMITS.criterionChars)
    requireStringArray(`${taskAt}.writesPaths`, task.writesPaths, BLOCK_INTAKE_LIMITS.writesPathsPerBlock, BLOCK_INTAKE_LIMITS.pathChars)
  })
}

function assertBlockRow(row: BlockRow): void {
  if (typeof row !== 'object' || row === null) fail('账本行必须是对象')
  if (row.v !== BLOCK_LEDGER_VERSION) fail(`账本行的 v 必须是 ${BLOCK_LEDGER_VERSION}`)
  requireText('id', row.id, 200)
  requireText('sessionId', row.sessionId, 200)
  requireText('objective', row.objective, BLOCK_INTAKE_LIMITS.objectiveChars)
  if (typeof row.splitHash !== 'string' || !/^[0-9a-f]{64}$/.test(row.splitHash)) {
    fail('splitHash 必须是 64 位小写十六进制 sha-256')
  }
  const approval = row.approval
  if (typeof approval !== 'object' || approval === null) fail('approval 必须是对象')
  if (!APPROVAL_KINDS.has(approval.kind)) fail('approval.kind 不是已知的审批来源')
  requireText('approval.quote', approval.quote, BLOCK_INTAKE_LIMITS.quoteChars)
  requireIsoTime('approval.at', approval.at)
  if (approval.sourceMessageId !== undefined) requireText('approval.sourceMessageId', approval.sourceMessageId, 200)
  if (!Array.isArray(row.blocks)) fail('blocks 必须是数组')
  if (row.blocks.length === 0 || row.blocks.length > BLOCK_INTAKE_LIMITS.blocksPerPreview) {
    fail(`blocks 必须是 1..${BLOCK_INTAKE_LIMITS.blocksPerPreview} 块（实际 ${row.blocks.length}）`)
  }
  row.blocks.forEach(assertBlockEntry)
  if (!Number.isInteger(row.version) || row.version < 1) fail('version 必须是 ≥ 1 的整数')
  requireIsoTime('createdAt', row.createdAt)
  requireIsoTime('updatedAt', row.updatedAt)
  if (typeof row.rowHash !== 'string') fail('rowHash 必须是字符串')
}

function assertVerdictRow(row: VerdictRow): void {
  if (typeof row !== 'object' || row === null) fail('verdict 行必须是对象')
  if (row.v !== BLOCK_LEDGER_VERSION) fail(`verdict 行的 v 必须是 ${BLOCK_LEDGER_VERSION}`)
  requireText('verdictId', row.verdictId, 200)
  requireText('blockId', row.blockId, 200)
  if (!Number.isInteger(row.attempt) || row.attempt < 1) fail('attempt 必须是 ≥ 1 的整数')
  if (row.kind !== 'supervisor') fail('kind 必须是 supervisor')
  requireText('route', row.route, 200)
  if (row.outcome !== 'pass' && row.outcome !== 'veto') fail('outcome 必须是 pass 或 veto')
  if (!Array.isArray(row.criteria)) fail('criteria 必须是数组')
  row.criteria.forEach((criterion, index) => {
    const at = `criteria[${index}]`
    if (typeof criterion !== 'object' || criterion === null) fail(`${at} 必须是对象`)
    requireText(`${at}.text`, criterion.text, BLOCK_INTAKE_LIMITS.criterionChars)
    if (typeof criterion.met !== 'boolean') fail(`${at}.met 必须是布尔值`)
    requireStringArray(`${at}.evidence`, criterion.evidence, BLOCK_INTAKE_LIMITS.criteriaPerBlock, BLOCK_INTAKE_LIMITS.quoteChars)
  })
  if (!Array.isArray(row.reasons)) fail('reasons 必须是数组')
  row.reasons.forEach((reason, index) => {
    const at = `reasons[${index}]`
    if (typeof reason !== 'object' || reason === null) fail(`${at} 必须是对象`)
    requireText(`${at}.criterion`, reason.criterion, BLOCK_INTAKE_LIMITS.criterionChars)
    requireText(`${at}.evidence`, reason.evidence, BLOCK_INTAKE_LIMITS.quoteChars)
    requireText(`${at}.why`, reason.why, BLOCK_INTAKE_LIMITS.quoteChars)
  })
  requireText('evidenceHash', row.evidenceHash, 200)
  requireIsoTime('at', row.at)
  if (row.by !== 'plugin:block-supervisor') fail('by 必须是 plugin:block-supervisor')
  if (row.override !== undefined) {
    if (typeof row.override !== 'object' || row.override === null) fail('override 必须是对象')
    requireText('override.who', row.override.who, BLOCK_INTAKE_LIMITS.ownerChars)
    requireText('override.why', row.override.why, BLOCK_INTAKE_LIMITS.quoteChars)
  }
}

// ---------------------------------------------------------------------------
// File primitives.
// ---------------------------------------------------------------------------

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | null)?.code
}

async function readTextIfExists(file: string): Promise<string> {
  try {
    return await readFile(file, 'utf8')
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return ''
    throw new BlockIntakeError('invalid', `账本读取失败（${file}）：${describe(error)}`)
  }
}

/**
 * Append one line atomically: current body + new line → hidden `*.tmp` → fsync →
 * rename over the target. Any failure removes the temporary file and rethrows,
 * leaving the previous file exactly as it was.
 */
async function appendLineAtomic(file: string, line: string): Promise<void> {
  const dir = dirname(file)
  try {
    await mkdir(dir, { recursive: true })
  } catch (error) {
    throw new BlockIntakeError('invalid', `账本目录建不出来（${dir}）：${describe(error)}`)
  }
  const existing = await readTextIfExists(file)
  const body = existing === '' || existing.endsWith('\n') ? `${existing}${line}\n` : `${existing}\n${line}\n`
  const tmp = join(dir, `.${basename(file)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`)
  try {
    const handle = await open(tmp, 'w')
    try {
      await handle.writeFile(body, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => undefined)
    throw new BlockIntakeError('invalid', `账本临时文件写不进去（${tmp}）：${describe(error)}`)
  }
  try {
    await rename(tmp, file)
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => undefined)
    throw new BlockIntakeError('invalid', `账本原子替换失败（${file}）：${describe(error)}`)
  }
  try {
    const dirHandle = await open(dir, 'r')
    try {
      await dirHandle.sync()
    } finally {
      await dirHandle.close()
    }
  } catch {
    // The rename already landed; the directory fsync is best-effort.
  }
}

/**
 * Read one JSONL ledger. A line that does not parse, does not validate, or whose
 * hash does not match is skipped into `skipped` — never thrown.
 */
async function readLedger<T>(
  file: string,
  parse: (raw: unknown, line: number) => T,
): Promise<T[] & { skipped: SkippedLedgerLine[] }> {
  const text = await readTextIfExists(file)
  const rows: T[] = []
  const skipped: SkippedLedgerLine[] = []
  text.split('\n').forEach((line, index) => {
    if (line.trim() === '') return
    const lineNo = index + 1
    try {
      let raw: unknown
      try {
        raw = JSON.parse(line)
      } catch {
        throw new Error(`第 ${lineNo} 行不是合法 JSON`)
      }
      rows.push(parse(raw, lineNo))
    } catch (error) {
      skipped.push({ line: lineNo, reason: describe(error), text: line.slice(0, 200) })
    }
  })
  return Object.assign(rows, { skipped })
}

function parseBlockRow(raw: unknown, line: number): BlockRow {
  const row = raw as BlockRow
  assertBlockRow(row)
  if (row.rowHash !== rowHashOf(row)) {
    throw new Error(`第 ${line} 行的 rowHash 对不上（块 ${String(row.id)}）`)
  }
  return row
}

function parseVerdictRow(raw: unknown): VerdictRow {
  const row = raw as VerdictRow
  assertVerdictRow(row)
  return row
}

function latestById(rows: readonly BlockRow[], id: string): BlockRow | undefined {
  let best: BlockRow | undefined
  for (const row of rows) {
    if (row.id !== id) continue
    if (best === undefined || row.version > best.version) best = row
  }
  return best
}

// ---------------------------------------------------------------------------
// Public read/write API.
// ---------------------------------------------------------------------------

/**
 * Append one version of an intake row.
 *
 * The writer owns the version: it is `上一版 + 1`, and a row claiming any other
 * number is refused (`invalid`) rather than silently renumbered, because a
 * caller that read a stale version must be told, not guessed around. Above
 * `versionsPerBlock` appended versions the ledger refuses with `version-limit`.
 *
 * `rowHash` may be left empty (the writer stamps it) but, when supplied, it must
 * already be the hash of the row as written.
 * @param row - the row to append; `version` must be the next one for its id.
 * @param options - ledger directory.
 * @returns The row as written, `rowHash` stamped.
 */
export async function appendBlockRow(row: BlockRow, options: BlockStoreOptions = {}): Promise<BlockRow> {
  assertBlockRow(row)
  const read = await readBlockRows(options)
  const previous = read.filter((entry) => entry.id === row.id)
  const highest = previous.reduce((max, entry) => Math.max(max, entry.version), 0)
  if (highest >= BLOCK_INTAKE_LIMITS.versionsPerBlock) {
    throw new BlockIntakeError(
      'version-limit',
      `块 ${row.id} 已经有 ${highest} 个版本，上限是 ${BLOCK_INTAKE_LIMITS.versionsPerBlock} 版`,
    )
  }
  const version = highest + 1
  if (row.version !== version) {
    throw new BlockIntakeError(
      'invalid',
      `块 ${row.id} 的版本号不连续：应写第 ${version} 版，收到第 ${row.version} 版`,
    )
  }
  const stamped = rowHashOf(row)
  if (row.rowHash !== '' && row.rowHash !== stamped) {
    throw new BlockIntakeError('invalid', `块 ${row.id} 的 rowHash 与内容对不上，拒绝写入`)
  }
  const final: BlockRow = { ...row, version, rowHash: stamped }
  await appendLineAtomic(blocksFile(options), JSON.stringify(final))
  return final
}

/** Every usable block row, in file order, plus the lines that were skipped. */
export async function readBlockRows(options: BlockStoreOptions = {}): Promise<BlockRowsRead> {
  return readLedger(blocksFile(options), parseBlockRow)
}

/** The current (highest-version) row for this session + split, if one was accepted. */
export async function findBlockBySplit(
  sessionId: string,
  splitHash: string,
  options: BlockStoreOptions = {},
): Promise<BlockRow | undefined> {
  const rows = await readBlockRows(options)
  let best: BlockRow | undefined
  for (const row of rows) {
    if (row.sessionId !== sessionId || row.splitHash !== splitHash) continue
    if (best === undefined || row.version > best.version) best = row
  }
  return best
}

/** The current (highest-version) row for one block id, if it exists. */
export async function getBlockRow(blockId: string, options: BlockStoreOptions = {}): Promise<BlockRow | undefined> {
  const rows = await readBlockRows(options)
  return latestById(rows, blockId)
}

/**
 * Append one supervisor verdict.
 *
 * Append-only by construction: this module has no update or delete path for
 * verdicts, so a second verdict on the same attempt is a second line, and the
 * first line stays byte-identical.
 */
export async function appendVerdictRow(
  row: VerdictRow,
  options: BlockStoreOptions = {},
): Promise<VerdictRow> {
  assertVerdictRow(row)
  await appendLineAtomic(verdictsFile(options), JSON.stringify(row))
  return row
}

/** Every usable verdict row, in file order, plus the lines that were skipped. */
export async function readVerdictRows(options: BlockStoreOptions = {}): Promise<VerdictRowsRead> {
  return readLedger(verdictsFile(options), parseVerdictRow)
}

/** One block's verdicts, oldest attempt first. */
export async function verdictsFor(
  blockId: string,
  options: BlockStoreOptions = {},
): Promise<VerdictRow[]> {
  const rows = await readVerdictRows(options)
  return rows
    .filter((row) => row.blockId === blockId)
    .sort((left, right) => (left.attempt !== right.attempt ? left.attempt - right.attempt : left.at < right.at ? -1 : 1))
}
