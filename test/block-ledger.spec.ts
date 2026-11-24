/**
 * 账本面（`src/block/paths.ts` + `src/block/store.ts`）的不变量：
 *
 * - 一行一版：同一个块 id 每写一次追加一行，版本号只能等于「上一版 + 1」；
 * - 原子替换：隐藏 `*.tmp` 写 → fsync → rename，写失败时原文件一字节不变、不留临时文件；
 * - 坏行只跳过：一个坏行不能让人读不到整本账，但写入路径必须严格校验；
 * - verdicts 只追加：两次写入读回两行，首行字节不变。
 *
 * 每个用例都在 `.tmp/` 下的临时目录里跑，绝不碰真实 `$DSH_HOME`。
 */

import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  BLOCK_INTAKE_LIMITS,
  BlockIntakeError,
  appendBlockRow,
  appendVerdictRow,
  blockLedgerDir,
  blocksFile,
  canonicalJson,
  findBlockBySplit,
  getBlockRow,
  readBlockRows,
  readVerdictRows,
  rowHashOf,
  sha256Hex,
  verdictsFile,
  verdictsFor,
  type BlockRow,
  type VerdictRow,
} from '../src/block/index.js'

const scratchRoot = (() => {
  const base = join(process.cwd(), '.tmp')
  mkdirSync(base, { recursive: true })
  return mkdtempSync(join(base, 'blk-'))
})()

afterAll(() => {
  rmSync(scratchRoot, { recursive: true, force: true })
})

let caseNo = 0
function freshDir(): string {
  caseNo += 1
  return mkdtempSync(join(scratchRoot, `case-${caseNo}-`))
}

const T0 = '2026-11-25T00:00:00.000Z'

function sampleRow(over: Partial<BlockRow> = {}): BlockRow {
  const base: BlockRow = {
    v: 1,
    id: 'bk-1',
    sessionId: 'sess-1',
    objective: '做完接单台子',
    splitHash: 'a'.repeat(64),
    approval: { kind: 'user', quote: '确认', at: T0, sourceMessageId: 'msg-1' },
    blocks: [
      {
        id: 'blk-1',
        title: '账本',
        objective: '把块账本写出来',
        deliverable: 'src/block/store.ts',
        acceptance: ['能追加一行'],
        writesPaths: ['src/block/store.ts'],
        dependsOn: [],
        execution: 'foreman',
        status: 'open',
        tasks: [],
      },
    ],
    version: 1,
    createdAt: T0,
    updatedAt: T0,
    rowHash: '',
  }
  const merged: BlockRow = { ...base, ...over }
  return { ...merged, rowHash: rowHashOf(merged) }
}

function sampleVerdict(over: Partial<VerdictRow> = {}): VerdictRow {
  const base: VerdictRow = {
    v: 1,
    verdictId: 'vd-1',
    blockId: 'bk-1',
    attempt: 1,
    kind: 'supervisor',
    route: 'guardian',
    outcome: 'pass',
    criteria: [{ text: '能追加一行', met: true, evidence: ['test/block-ledger.spec.ts'] }],
    reasons: [],
    evidenceHash: sha256Hex('evidence-1'),
    at: T0,
    by: 'plugin:block-supervisor',
  }
  return { ...base, ...over }
}

/**
 * Await a promise that must fail with a `BlockIntakeError`, and hand the error
 * back so the assertion reads as one line. A resolved promise is a test bug, so
 * it throws instead of silently passing.
 */
async function intakeError(work: Promise<unknown>): Promise<BlockIntakeError> {
  try {
    await work
  } catch (error) {
    if (error instanceof BlockIntakeError) return error
    throw error
  }
  throw new Error('expected a BlockIntakeError, but the call resolved')
}

function lines(file: string): string[] {
  return readFileSync(file, 'utf8').split('\n').filter((line) => line.trim() !== '')
}

describe('canonicalJson / sha256Hex', () => {
  it('键序稳定：同一组字段换个书写顺序，序列化逐字节相同', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
    expect(canonicalJson({ a: 2, b: 1 })).toBe(canonicalJson({ b: 1, a: 2 }))
  })

  it('数组保序、无空格、undefined 键被丢弃', () => {
    expect(canonicalJson([{ z: 1, a: 2 }])).toBe('[{"a":2,"z":1}]')
    expect(canonicalJson({ a: [1, 2], b: 'x y' })).toBe('{"a":[1,2],"b":"x y"}')
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}')
  })

  it('sha256Hex 对空串与 abc 给出公认常量', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('rowHashOf', () => {
  it('等于「去掉 rowHash 后的 canonical JSON」的 sha256，且不看原 rowHash 值', () => {
    const row = sampleRow()
    const payload = { ...row }
    delete (payload as Partial<BlockRow>).rowHash
    expect(rowHashOf(row)).toBe(sha256Hex(canonicalJson(payload)))
    expect(rowHashOf({ ...row, rowHash: 'deadbeef' })).toBe(rowHashOf(row))
  })

  it('任一字段改动都会改变 rowHash', () => {
    const row = sampleRow()
    expect(rowHashOf({ ...row, objective: '换个目标' })).not.toBe(rowHashOf(row))
    expect(rowHashOf({ ...row, version: 2 })).not.toBe(rowHashOf(row))
    expect(rowHashOf({ ...row, approval: { ...row.approval, quote: '可以' } })).not.toBe(rowHashOf(row))
  })
})

describe('blockLedgerDir / blocksFile / verdictsFile', () => {
  it('显式 dir 优先于环境变量，环境变量优先于 $DSH_HOME', () => {
    const savedDir = process.env['GROK_WORKFLOW_BLOCK_LEDGER_DIR']
    const savedHome = process.env['DSH_HOME']
    try {
      process.env['GROK_WORKFLOW_BLOCK_LEDGER_DIR'] = '/from-env'
      process.env['DSH_HOME'] = '/from-home'
      expect(blockLedgerDir({ dir: '/explicit' })).toBe('/explicit')
      expect(blockLedgerDir()).toBe('/from-env')
      delete process.env['GROK_WORKFLOW_BLOCK_LEDGER_DIR']
      expect(blockLedgerDir()).toBe('/from-home/taskboards/grok-workflow')
      delete process.env['DSH_HOME']
      expect(blockLedgerDir()).toBe(join(homedir(), '.dsh', 'taskboards', 'grok-workflow'))
    } finally {
      if (savedDir === undefined) delete process.env['GROK_WORKFLOW_BLOCK_LEDGER_DIR']
      else process.env['GROK_WORKFLOW_BLOCK_LEDGER_DIR'] = savedDir
      if (savedHome === undefined) delete process.env['DSH_HOME']
      else process.env['DSH_HOME'] = savedHome
    }
  })

  it('两个文件与 store.jsonl 同目录，名字固定为 blocks.jsonl / verdicts.jsonl', () => {
    const dir = '/ledger'
    expect(blocksFile({ dir })).toBe(join(dir, 'blocks.jsonl'))
    expect(verdictsFile({ dir })).toBe(join(dir, 'verdicts.jsonl'))
  })
})

describe('appendBlockRow / readBlockRows', () => {
  it('账本文件不存在时读回空数组且不抛错', async () => {
    const dir = freshDir()
    const rows = await readBlockRows({ dir })
    expect(rows).toHaveLength(0)
    expect(rows.skipped).toHaveLength(0)
  })

  it('追加一行后读回同一行，rowHash 自洽，未给 rowHash 时由写入方盖章', async () => {
    const dir = freshDir()
    const written = await appendBlockRow({ ...sampleRow(), rowHash: '' }, { dir })
    expect(written.rowHash).toHaveLength(64)
    expect(written.rowHash).toBe(rowHashOf(written))
    const rows = await readBlockRows({ dir })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe('bk-1')
    expect(rows[0]?.rowHash).toBe(written.rowHash)
    expect(lines(blocksFile({ dir }))).toHaveLength(1)
  })

  it('同一 id 的第二版追加成第二行，getBlockRow 返回最新版', async () => {
    const dir = freshDir()
    await appendBlockRow(sampleRow(), { dir })
    const second = await appendBlockRow(
      sampleRow({ version: 2, objective: '第二版目标', updatedAt: '2026-11-25T00:00:01.000Z' }),
      { dir },
    )
    expect(second.version).toBe(2)
    expect(lines(blocksFile({ dir }))).toHaveLength(2)
    const latest = await getBlockRow('bk-1', { dir })
    expect(latest?.version).toBe(2)
    expect(latest?.objective).toBe('第二版目标')
  })

  it('版本号必须等于上一版 + 1，跳号写被拒且文件不变', async () => {
    const dir = freshDir()
    await appendBlockRow(sampleRow(), { dir })
    const before = readFileSync(blocksFile({ dir }), 'utf8')
    expect((await intakeError(appendBlockRow(sampleRow({ version: 3 }), { dir }))).code).toBe('invalid')
    expect(readFileSync(blocksFile({ dir }), 'utf8')).toBe(before)
  })

  it('rowHash 对不上时拒绝写入，原文件一字节不变', async () => {
    const dir = freshDir()
    await appendBlockRow(sampleRow(), { dir })
    const before = readFileSync(blocksFile({ dir }), 'utf8')
    const tampered: BlockRow = { ...sampleRow({ version: 2 }), rowHash: 'f'.repeat(64) }
    expect((await intakeError(appendBlockRow(tampered, { dir }))).code).toBe('invalid')
    expect(readFileSync(blocksFile({ dir }), 'utf8')).toBe(before)
  })

  it('同一 id 写到第 20 版后，第 21 版报 version-limit 且账本仍是 20 行', async () => {
    const dir = freshDir()
    for (let version = 1; version <= BLOCK_INTAKE_LIMITS.versionsPerBlock; version += 1) {
      const written = await appendBlockRow(sampleRow({ version }), { dir })
      expect(written.version).toBe(version)
    }
    expect(lines(blocksFile({ dir }))).toHaveLength(BLOCK_INTAKE_LIMITS.versionsPerBlock)
    const refused = await intakeError(
      appendBlockRow(sampleRow({ version: BLOCK_INTAKE_LIMITS.versionsPerBlock + 1 }), { dir }),
    )
    expect(refused.code).toBe('version-limit')
    expect(lines(blocksFile({ dir }))).toHaveLength(BLOCK_INTAKE_LIMITS.versionsPerBlock)
  })

  it('目录不可写时写入失败，原文件内容不变且不留 *.tmp', async () => {
    const dir = freshDir()
    await appendBlockRow(sampleRow(), { dir })
    const before = readFileSync(blocksFile({ dir }), 'utf8')
    chmodSync(dir, 0o555)
    try {
      const refused = await intakeError(appendBlockRow(sampleRow({ version: 2 }), { dir }))
      expect(refused.code).toBe('invalid')
      expect(readFileSync(blocksFile({ dir }), 'utf8')).toBe(before)
      expect(readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toHaveLength(0)
    } finally {
      chmodSync(dir, 0o755)
    }
  })

  it('坏行被跳过并收集，好行照常读回（一个坏行不能让人读不到整本账）', async () => {
    const dir = freshDir()
    const good = JSON.stringify(sampleRow())
    const badJson = '{"v":1,"id":'
    const badHash = JSON.stringify({ ...sampleRow({ id: 'bk-2' }), rowHash: 'f'.repeat(64) })
    const badVersion = JSON.stringify({ ...sampleRow({ id: 'bk-3' }), v: 2 })
    writeFileSync(blocksFile({ dir }), `${good}\n${badJson}\n${badHash}\n${badVersion}\n`, 'utf8')

    const rows = await readBlockRows({ dir })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe('bk-1')
    expect(rows.skipped).toHaveLength(3)
    expect(rows.skipped.map((entry) => entry.line)).toEqual([2, 3, 4])
    for (const entry of rows.skipped) expect(entry.reason.length).toBeGreaterThan(0)
  })

  it('findBlockBySplit 按 sessionId + splitHash 命中最新版，不命中返回 undefined', async () => {
    const dir = freshDir()
    await appendBlockRow(sampleRow(), { dir })
    await appendBlockRow(sampleRow({ version: 2 }), { dir })
    await appendBlockRow(sampleRow({ id: 'bk-9', splitHash: 'b'.repeat(64) }), { dir })

    const hit = await findBlockBySplit('sess-1', 'a'.repeat(64), { dir })
    expect(hit?.id).toBe('bk-1')
    expect(hit?.version).toBe(2)
    expect(await findBlockBySplit('sess-2', 'a'.repeat(64), { dir })).toBeUndefined()
    expect(await findBlockBySplit('sess-1', 'c'.repeat(64), { dir })).toBeUndefined()
  })

  it('getBlockRow 对未知 id 返回 undefined 而不是抛错', async () => {
    const dir = freshDir()
    expect(await getBlockRow('bk-none', { dir })).toBeUndefined()
  })
})

describe('verdicts 只追加', () => {
  it('写两次读回两行，且首行字节未变', async () => {
    const dir = freshDir()
    await appendVerdictRow(sampleVerdict(), { dir })
    const afterFirst = readFileSync(verdictsFile({ dir }), 'utf8')
    await appendVerdictRow(sampleVerdict({ verdictId: 'vd-2', attempt: 2, outcome: 'veto' }), { dir })
    const afterSecond = readFileSync(verdictsFile({ dir }), 'utf8')

    expect(afterSecond.startsWith(afterFirst)).toBe(true)
    expect(lines(verdictsFile({ dir }))).toHaveLength(2)
    const rows = await readVerdictRows({ dir })
    expect(rows).toHaveLength(2)
    expect(rows[0]?.verdictId).toBe('vd-1')
    expect(rows[1]?.verdictId).toBe('vd-2')
  })

  it('verdictsFor 只返回该块的行，按 attempt 升序', async () => {
    const dir = freshDir()
    await appendVerdictRow(sampleVerdict({ verdictId: 'vd-2', attempt: 2 }), { dir })
    await appendVerdictRow(sampleVerdict({ verdictId: 'vd-1', attempt: 1 }), { dir })
    await appendVerdictRow(sampleVerdict({ verdictId: 'vd-x', blockId: 'bk-other', attempt: 1 }), { dir })

    const mine = await verdictsFor('bk-1', { dir })
    expect(mine.map((row) => row.verdictId)).toEqual(['vd-1', 'vd-2'])
    expect((await verdictsFor('bk-other', { dir })).map((row) => row.verdictId)).toEqual(['vd-x'])
    expect(await verdictsFor('bk-none', { dir })).toHaveLength(0)
  })

  it('verdict 坏行同样只跳过，不拖垮整本账', async () => {
    const dir = freshDir()
    writeFileSync(verdictsFile({ dir }), `${JSON.stringify(sampleVerdict())}\nnot json\n`, 'utf8')
    const rows = await readVerdictRows({ dir })
    expect(rows).toHaveLength(1)
    expect(rows.skipped).toHaveLength(1)
  })
})
