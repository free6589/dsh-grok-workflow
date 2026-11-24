/**
 * 预览面（`src/block/preview.ts` + `src/block/approval.ts`）的不变量：
 *
 * - `splitHash` 只由规范化后的切分决定：同一切分逐字节同 hash，任何字段改动都变 hash；
 * - `startBlock` 四道校验顺序固定（存在 → 未过期 → 切分未变 → 逐字点头 → approved）；
 * - 同一 split 重复 start 只落一行，返回同一个 `blockId`；
 * - `verify`（监工开关）随块行走但不进 `splitHash`：它落进块行、断点续跑读得回来，
 *   改它不算改单子，没给就不写这个键；
 * - `render` 是给人看的一单（含块标题，末行叫人回「确认」），`dispatchEnvelope` 是一行。
 *
 * 每个用例都在 `.tmp/` 下的临时目录里跑，绝不碰真实 `$DSH_HOME`。
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  BLOCK_INTAKE_LIMITS,
  BlockIntakeError,
  blocksFile,
  isApproveAnswer,
  previewBlocks,
  previewById,
  readBlockRows,
  resetPreviews,
  rowHashOf,
  startBlock,
  type BlockEntryInput,
  type BlockPreview,
  type PreviewInput,
  type StartInput,
} from '../src/block/index.js'

const scratchRoot = (() => {
  const base = join(process.cwd(), '.tmp')
  mkdirSync(base, { recursive: true })
  return mkdtempSync(join(base, 'blk-preview-'))
})()

afterAll(() => {
  rmSync(scratchRoot, { recursive: true, force: true })
})

let caseNo = 0
function freshDir(): string {
  caseNo += 1
  return mkdtempSync(join(scratchRoot, `case-${caseNo}-`))
}

/** 2026-01-01T00:00:00.000Z — a fixed clock, so every timestamp assertion is exact. */
const T0 = 1_767_225_600_000

beforeEach(() => {
  resetPreviews()
})

function entry(over: Partial<BlockEntryInput> = {}): BlockEntryInput {
  const base: BlockEntryInput = {
    title: '账本',
    objective: '把块账本写出来',
    deliverable: 'src/block/store.ts',
    acceptance: ['能追加一行', '坏行只跳过'],
    writesPaths: ['src/block/store.ts'],
  }
  return { ...base, ...over }
}

function previewInput(over: Partial<PreviewInput> = {}): PreviewInput {
  const base: PreviewInput = {
    sessionId: 'sess-1',
    objective: '做完接单台子',
    blocks: [entry()],
    now: T0,
  }
  return { ...base, ...over }
}

function startInput(preview: BlockPreview, over: Partial<StartInput> = {}): StartInput {
  const base: StartInput = {
    sessionId: 'sess-1',
    previewId: preview.previewId,
    splitHash: preview.splitHash,
    approval: { kind: 'user', quote: '确认', sourceMessageId: 'msg-9' },
    messagesAfterPreview: ['看完了，确认'],
    approved: true,
    now: T0 + 1_000,
  }
  return { ...base, ...over }
}

async function intakeError(work: Promise<unknown>): Promise<BlockIntakeError> {
  try {
    await work
  } catch (error) {
    if (error instanceof BlockIntakeError) return error
    throw error
  }
  throw new Error('expected a BlockIntakeError, but the call resolved')
}

function hashOf(input: PreviewInput): string {
  return previewBlocks(input).splitHash
}

describe('splitHash 稳定性', () => {
  it('同一切分两次出单得到逐字节相同的 splitHash，但 previewId 不同', () => {
    const first = previewBlocks(previewInput())
    const second = previewBlocks(previewInput())
    expect(second.splitHash).toBe(first.splitHash)
    expect(second.previewId).not.toBe(first.previewId)
  })

  it('多块、带约束与不做的切分，重复出单同样稳定', () => {
    const input = previewInput({
      blocks: [entry(), entry({ title: '预览', deliverable: 'src/block/preview.ts', writesPaths: ['src/block/preview.ts'] })],
      constraints: ['不碰 src/config.ts'],
      nonGoals: ['不做 UI'],
    })
    expect(hashOf(input)).toBe(hashOf(input))
  })

  const mutators: { name: string; input: PreviewInput }[] = [
    { name: '顶层 objective', input: previewInput({ objective: '换个目标' }) },
    { name: 'blocks[0].title', input: previewInput({ blocks: [entry({ title: '账本二' })] }) },
    { name: 'blocks[0].objective', input: previewInput({ blocks: [entry({ objective: '换块目标' })] }) },
    { name: 'blocks[0].deliverable', input: previewInput({ blocks: [entry({ deliverable: 'src/block/other.ts' })] }) },
    { name: 'blocks[0].acceptance', input: previewInput({ blocks: [entry({ acceptance: ['能追加一行'] })] }) },
    {
      name: 'blocks[0].writesPaths',
      input: previewInput({ blocks: [entry({ writesPaths: ['src/block/other.ts'] })] }),
    },
    { name: 'blocks[0].dependsOn', input: previewInput({ blocks: [entry({ dependsOn: ['别的块'] })] }) },
    { name: 'blocks[0].execution', input: previewInput({ blocks: [entry({ execution: 'workflow' })] }) },
    { name: 'blocks[0].owner', input: previewInput({ blocks: [entry({ owner: 'w-1' })] }) },
    { name: 'constraints', input: previewInput({ constraints: ['不碰 src/index.ts'] }) },
    { name: 'nonGoals', input: previewInput({ nonGoals: ['不做 UI'] }) },
    { name: '块数', input: previewInput({ blocks: [entry(), entry({ title: '预览' })] }) },
  ]

  for (const mutator of mutators) {
    it(`改 ${mutator.name} 就会改变 splitHash`, () => {
      expect(hashOf(mutator.input)).not.toBe(hashOf(previewInput()))
    })
  }
})

describe('splitHash 归一化', () => {
  it('首尾空白、空行、空验收条目不影响 hash', () => {
    const noisy = previewInput({
      objective: '  做完接单台子  ',
      blocks: [entry({ title: '  账本 ', acceptance: ['', ' 能追加一行 ', '坏行只跳过', '   '] })],
      constraints: ['', '   '],
    })
    expect(hashOf(noisy)).toBe(hashOf(previewInput()))
  })

  it('写范围走 normalizeWritePath：大小写、./、重复斜杠都归一', () => {
    const messy = previewInput({ blocks: [entry({ writesPaths: ['./src/./Block//Store.ts'] })] })
    expect(hashOf(messy)).toBe(hashOf(previewInput()))
  })

  it('写范围去重后不影响 hash', () => {
    const duplicated = previewInput({ blocks: [entry({ writesPaths: ['src/block/store.ts', './src/block/store.ts'] })] })
    expect(hashOf(duplicated)).toBe(hashOf(previewInput()))
  })
})

describe('入参校验（invalid）', () => {
  const tooLong = 'x'.repeat(BLOCK_INTAKE_LIMITS.titleChars + 1)
  const cases: { name: string; input: PreviewInput; field: string }[] = [
    { name: '0 块', input: previewInput({ blocks: [] }), field: 'blocks' },
    {
      name: `${BLOCK_INTAKE_LIMITS.blocksPerPreview + 1} 块`,
      input: previewInput({ blocks: [entry(), entry({ title: 'b2' }), entry({ title: 'b3' }), entry({ title: 'b4' })] }),
      field: 'blocks',
    },
    { name: '空标题', input: previewInput({ blocks: [entry({ title: '   ' })] }), field: 'title' },
    { name: '标题超长', input: previewInput({ blocks: [entry({ title: tooLong })] }), field: 'title' },
    {
      name: '目标超长',
      input: previewInput({ objective: 'x'.repeat(BLOCK_INTAKE_LIMITS.objectiveChars + 1) }),
      field: 'objective',
    },
    {
      name: '交付物超长',
      input: previewInput({ blocks: [entry({ deliverable: 'x'.repeat(BLOCK_INTAKE_LIMITS.deliverableChars + 1) })] }),
      field: 'deliverable',
    },
    { name: '没有验收条目', input: previewInput({ blocks: [entry({ acceptance: [] })] }), field: 'acceptance' },
    {
      name: '验收条目只有空白',
      input: previewInput({ blocks: [entry({ acceptance: ['   ', ''] })] }),
      field: 'acceptance',
    },
    {
      name: `验收条目 ${BLOCK_INTAKE_LIMITS.criteriaPerBlock + 1} 条`,
      input: previewInput({
        blocks: [entry({ acceptance: Array.from({ length: BLOCK_INTAKE_LIMITS.criteriaPerBlock + 1 }, (_, i) => `c${i}`) })],
      }),
      field: 'acceptance',
    },
    {
      name: '单条验收超长',
      input: previewInput({ blocks: [entry({ acceptance: ['x'.repeat(BLOCK_INTAKE_LIMITS.criterionChars + 1)] })] }),
      field: 'acceptance',
    },
    {
      name: `写范围 ${BLOCK_INTAKE_LIMITS.writesPathsPerBlock + 1} 条`,
      input: previewInput({
        blocks: [entry({ writesPaths: Array.from({ length: BLOCK_INTAKE_LIMITS.writesPathsPerBlock + 1 }, (_, i) => `src/f${i}.ts`) })],
      }),
      field: 'writesPaths',
    },
    {
      name: '单条写范围超长',
      input: previewInput({ blocks: [entry({ writesPaths: ['x'.repeat(BLOCK_INTAKE_LIMITS.pathChars + 1)] })] }),
      field: 'writesPaths',
    },
    {
      name: 'owner 超长',
      input: previewInput({ blocks: [entry({ owner: 'x'.repeat(BLOCK_INTAKE_LIMITS.ownerChars + 1) })] }),
      field: 'owner',
    },
    { name: 'sessionId 为空', input: previewInput({ sessionId: '  ' }), field: 'sessionId' },
  ]

  for (const testCase of cases) {
    it(`${testCase.name} → invalid，且报错点名 ${testCase.field}`, () => {
      try {
        previewBlocks(testCase.input)
      } catch (error) {
        expect(error).toBeInstanceOf(BlockIntakeError)
        expect((error as BlockIntakeError).code).toBe('invalid')
        expect((error as BlockIntakeError).message).toContain(testCase.field)
        return
      }
      throw new Error('expected previewBlocks to throw for: ' + testCase.name)
    })
  }

  it('出单本身不写盘（纯计算 + 会话内记忆）', () => {
    const dir = freshDir()
    previewBlocks(previewInput())
    expect(existsSync(blocksFile({ dir }))).toBe(false)
  })
})

describe('render 与 warnings', () => {
  it('render 逐块列出标题、目标、交付物、验收与执行方式，末行叫人回「确认」开工', () => {
    const preview = previewBlocks(
      previewInput({
        blocks: [
          entry(),
          entry({ title: '预览', objective: '把预览写出来', deliverable: 'src/block/preview.ts', writesPaths: ['src/block/preview.ts'] }),
        ],
      }),
    )
    expect(preview.render).toContain('账本')
    expect(preview.render).toContain('预览')
    expect(preview.render).toContain('能追加一行')
    expect(preview.render).toContain('src/block/store.ts')
    expect(preview.render).toContain('foreman')
    const tail = preview.render.trimEnd().split('\n').at(-1) ?? ''
    expect(tail).toContain('确认')
    expect(tail).toContain('开工')
  })

  it('warnings：块数到上限、没写范围、依赖找不到、workflow 没 owner', () => {
    const preview = previewBlocks(
      previewInput({
        blocks: [
          entry({ writesPaths: [] }),
          entry({ title: '预览', dependsOn: ['不存在的块'], execution: 'workflow' }),
          entry({ title: '工具层', writesPaths: ['src/block/tools.ts'] }),
        ],
      }),
    )
    const joined = preview.warnings.join('\n')
    expect(joined).toContain('上限')
    expect(joined).toContain('写范围')
    expect(joined).toContain('不存在的块')
    expect(joined).toContain('owner')
    expect(preview.warnings.length).toBeGreaterThanOrEqual(4)
  })

  it('warnings：单块且声明齐全时不报那四条', () => {
    const preview = previewBlocks(previewInput())
    const joined = preview.warnings.join('\n')
    expect(joined).not.toContain('写范围')
    expect(joined).not.toContain('owner')
    expect(joined).not.toContain('上限')
  })

  it('requiresUserApproval 恒为 true，expiresAt 等于 now + TTL', () => {
    const preview = previewBlocks(previewInput())
    expect(preview.requiresUserApproval).toBe(true)
    expect(preview.expiresAt).toBe(new Date(T0 + BLOCK_INTAKE_LIMITS.previewTtlMs).toISOString())
  })
})

describe('会话内预览记忆', () => {
  it(`每个会话最多记 ${BLOCK_INTAKE_LIMITS.previewsPerSession} 个，超了丢最旧`, () => {
    const ids: string[] = []
    for (let index = 0; index < BLOCK_INTAKE_LIMITS.previewsPerSession + 1; index += 1) {
      ids.push(previewBlocks(previewInput({ objective: `第 ${index} 单` })).previewId)
    }
    expect(previewById(ids[0] ?? '')).toBeUndefined()
    expect(previewById(ids[1] ?? '')).toBeDefined()
    expect(previewById(ids.at(-1) ?? '')).toBeDefined()
  })

  it('一个会话的淘汰不影响另一个会话的预览', () => {
    const other = previewBlocks(previewInput({ sessionId: 'sess-2' }))
    for (let index = 0; index < BLOCK_INTAKE_LIMITS.previewsPerSession + 1; index += 1) {
      previewBlocks(previewInput({ objective: `第 ${index} 单` }))
    }
    expect(previewById(other.previewId)?.sessionId).toBe('sess-2')
  })

  it('过期条目仍能被 previewById 找到（好让 start 报 preview-expired 而不是 not-found）', () => {
    const preview = previewBlocks(previewInput())
    expect(previewById(preview.previewId)?.expiresAtMs).toBe(T0 + BLOCK_INTAKE_LIMITS.previewTtlMs)
  })

  it('resetPreviews 清空记忆', () => {
    const preview = previewBlocks(previewInput())
    resetPreviews()
    expect(previewById(preview.previewId)).toBeUndefined()
  })
})

describe('startBlock 的四道校验', () => {
  it('预览不存在 → not-found', async () => {
    const dir = freshDir()
    const preview = previewBlocks(previewInput())
    const error = await intakeError(
      startBlock(startInput(preview, { previewId: 'bp-missing' }), { dir }),
    )
    expect(error.code).toBe('not-found')
  })

  it('预览属于别的会话 → not-found', async () => {
    const dir = freshDir()
    const preview = previewBlocks(previewInput())
    const error = await intakeError(startBlock(startInput(preview, { sessionId: 'sess-other' }), { dir }))
    expect(error.code).toBe('not-found')
  })

  it('过期（含恰好到期这一刻）→ preview-expired；差 1 毫秒仍然能开工', async () => {
    const dir = freshDir()
    const preview = previewBlocks(previewInput())
    const expiry = T0 + BLOCK_INTAKE_LIMITS.previewTtlMs

    const expired = await intakeError(startBlock(startInput(preview, { now: expiry }), { dir }))
    expect(expired.code).toBe('preview-expired')
    const late = await intakeError(startBlock(startInput(preview, { now: expiry + 1 }), { dir }))
    expect(late.code).toBe('preview-expired')

    const ok = await startBlock(startInput(preview, { now: expiry - 1 }), { dir })
    expect(ok.reused).toBe(false)
  })

  it('切分变了（splitHash 不同）→ split-changed，账本一行都不写', async () => {
    const dir = freshDir()
    const preview = previewBlocks(previewInput())
    const error = await intakeError(
      startBlock(startInput(preview, { splitHash: 'b'.repeat(64) }), { dir }),
    )
    expect(error.code).toBe('split-changed')
    expect(existsSync(blocksFile({ dir }))).toBe(false)
  })

  it('预览之后没有任何一条消息逐字包含 quote → approval-required', async () => {
    const dir = freshDir()
    const preview = previewBlocks(previewInput())
    const error = await intakeError(
      startBlock(startInput(preview, { messagesAfterPreview: ['我先看看这份单子', '再等等'] }), { dir }),
    )
    expect(error.code).toBe('approval-required')
    expect(existsSync(blocksFile({ dir }))).toBe(false)
  })

  it('quote 有了但 approved 不是 true → not-approval', async () => {
    const dir = freshDir()
    const preview = previewBlocks(previewInput())
    const error = await intakeError(startBlock(startInput(preview, { approved: false }), { dir }))
    expect(error.code).toBe('not-approval')
    expect(existsSync(blocksFile({ dir }))).toBe(false)
  })

  it('顺序固定：过期优先于切分变化', async () => {
    const dir = freshDir()
    const preview = previewBlocks(previewInput())
    const expiry = T0 + BLOCK_INTAKE_LIMITS.previewTtlMs
    const error = await intakeError(
      startBlock(startInput(preview, { now: expiry, splitHash: 'b'.repeat(64) }), { dir }),
    )
    expect(error.code).toBe('preview-expired')
  })

  it('顺序固定：quote 缺失优先于 approved=false', async () => {
    const dir = freshDir()
    const preview = previewBlocks(previewInput())
    const error = await intakeError(
      startBlock(startInput(preview, { approved: false, messagesAfterPreview: ['还没想好'] }), { dir }),
    )
    expect(error.code).toBe('approval-required')
  })

  it('quote 超过 2000 字 → invalid', async () => {
    const dir = freshDir()
    const preview = previewBlocks(previewInput())
    const error = await intakeError(
      startBlock(
        startInput(preview, {
          approval: { kind: 'user', quote: 'x'.repeat(BLOCK_INTAKE_LIMITS.quoteChars + 1) },
        }),
        { dir },
      ),
    )
    expect(error.code).toBe('invalid')
    expect(error.message).toContain('quote')
  })
})

describe('startBlock 落块', () => {
  it('四项校验都过后落一行：status open、version 1、块内序号 blk-1/blk-2、审批原话留档', async () => {
    const dir = freshDir()
    const preview = previewBlocks(
      previewInput({
        blocks: [
          entry(),
          entry({ title: '预览', objective: '把预览写出来', deliverable: 'src/block/preview.ts', writesPaths: ['src/block/preview.ts'] }),
        ],
      }),
    )
    const result = await startBlock(startInput(preview), { dir })

    expect(result.status).toBe('open')
    expect(result.reused).toBe(false)
    expect(result.ledgerPath).toBe(blocksFile({ dir }))

    const rows = await readBlockRows({ dir })
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row?.id).toBe(result.blockId)
    expect(row?.version).toBe(1)
    expect(row?.sessionId).toBe('sess-1')
    expect(row?.objective).toBe('做完接单台子')
    expect(row?.splitHash).toBe(preview.splitHash)
    expect(row?.approval).toEqual({
      kind: 'user',
      quote: '确认',
      at: new Date(T0 + 1_000).toISOString(),
      sourceMessageId: 'msg-9',
    })
    expect(row?.blocks.map((block) => block.id)).toEqual(['blk-1', 'blk-2'])
    expect(row?.blocks.every((block) => block.status === 'open')).toBe(true)
    expect(row?.blocks[0]?.acceptance).toEqual(['能追加一行', '坏行只跳过'])
    expect(row?.blocks[0]?.writesPaths).toEqual(['src/block/store.ts'])
    expect(row?.blocks[0]?.tasks).toEqual([])
    if (row === undefined) throw new Error('no row written')
    expect(rowHashOf(row)).toBe(row.rowHash)
  })

  it('同一 split 再 start 一次：同一个 blockId、reused=true、账本仍一行、版本不涨', async () => {
    const dir = freshDir()
    const first = await startBlock(startInput(previewBlocks(previewInput())), { dir })
    const second = await startBlock(startInput(previewBlocks(previewInput())), { dir })

    expect(second.blockId).toBe(first.blockId)
    expect(second.reused).toBe(true)
    expect(second.status).toBe('open')
    expect(await readBlockRows({ dir })).toHaveLength(1)
    expect((await readBlockRows({ dir }))[0]?.version).toBe(1)
  })

  it('同一预览重复 start 也稳定返回同一个 blockId', async () => {
    const dir = freshDir()
    const preview = previewBlocks(previewInput())
    const first = await startBlock(startInput(preview), { dir })
    const second = await startBlock(startInput(preview), { dir })
    expect(second.blockId).toBe(first.blockId)
    expect(second.reused).toBe(true)
  })

  it('幂等先于校验：块已落账时，用过期时间重放仍返回同一块', async () => {
    const dir = freshDir()
    const preview = previewBlocks(previewInput())
    const first = await startBlock(startInput(preview), { dir })
    const expiry = T0 + BLOCK_INTAKE_LIMITS.previewTtlMs
    const replay = await startBlock(startInput(preview, { now: expiry + 5 }), { dir })
    expect(replay.blockId).toBe(first.blockId)
    expect(replay.reused).toBe(true)
    expect(await readBlockRows({ dir })).toHaveLength(1)
  })

  it('不同切分各自落一行，互不复用', async () => {
    const dir = freshDir()
    const one = await startBlock(startInput(previewBlocks(previewInput())), { dir })
    const two = await startBlock(startInput(previewBlocks(previewInput({ objective: '另一单' }))), { dir })
    expect(two.blockId).not.toBe(one.blockId)
    expect(await readBlockRows({ dir })).toHaveLength(2)
  })

  it('dispatchEnvelope 是一行，含块数、每块执行方式、写范围与依赖', async () => {
    const dir = freshDir()
    const preview = previewBlocks(
      previewInput({
        blocks: [
          entry(),
          entry({
            title: '预览',
            objective: '把预览写出来',
            deliverable: 'src/block/preview.ts',
            writesPaths: ['src/block/preview.ts'],
            dependsOn: ['账本'],
            execution: 'workflow',
            owner: 'w-1',
          }),
        ],
      }),
    )
    const result = await startBlock(startInput(preview), { dir })
    const envelope = result.dispatchEnvelope

    expect(envelope).not.toContain('\n')
    expect(envelope).toContain('2')
    expect(envelope).toContain('foreman')
    expect(envelope).toContain('workflow')
    expect(envelope).toContain('src/block/store.ts')
    expect(envelope).toContain('src/block/preview.ts')
    expect(envelope).toContain('账本')
  })

  it('落块的依赖原样保留在行里，写范围是归一化后的形式', async () => {
    const dir = freshDir()
    const preview = previewBlocks(
      previewInput({
        blocks: [
          entry({ writesPaths: ['./src/block/Store.ts'] }),
          entry({ title: '预览', dependsOn: [' 账本 '], writesPaths: ['src/block/preview.ts'] }),
        ],
      }),
    )
    await startBlock(startInput(preview), { dir })
    const row = (await readBlockRows({ dir }))[0]
    expect(row?.blocks[0]?.writesPaths).toEqual(['src/block/store.ts'])
    expect(row?.blocks[1]?.dependsOn).toEqual(['账本'])
  })
})

describe('verify 随块行走（不进 splitHash）', () => {
  it('出单时 verify.blockSupervisor=false 原样落进块行，读回来还是 false', async () => {
    const dir = freshDir()
    const preview = previewBlocks(previewInput({ verify: { blockSupervisor: false } }))
    const result = await startBlock(startInput(preview), { dir })

    const rows = await readBlockRows({ dir })
    expect(rows).toHaveLength(1)
    const row = rows[0]
    if (row === undefined) throw new Error('no row written')
    expect(row.id).toBe(result.blockId)
    expect(row.verify).toEqual({ blockSupervisor: false })
    // rowHash 覆盖整行（含 verify），能读回来就说明行内 hash 也对得上。
    expect(rowHashOf(row)).toBe(row.rowHash)
  })

  it('只改 verify 不改 splitHash：监工开关是执行策略，不是交付物', () => {
    const judgeOn = previewBlocks(previewInput({ verify: { blockSupervisor: true } }))
    const judgeOff = previewBlocks(previewInput({ verify: { blockSupervisor: false } }))
    const silent = previewBlocks(previewInput())
    expect(judgeOff.splitHash).toBe(judgeOn.splitHash)
    expect(judgeOff.splitHash).toBe(silent.splitHash)
  })

  it('没给 verify 时块行里没有这个键（旧行逐字节不变）', async () => {
    const dir = freshDir()
    const preview = previewBlocks(previewInput())
    await startBlock(startInput(preview), { dir })

    const row = (await readBlockRows({ dir }))[0]
    if (row === undefined) throw new Error('no row written')
    expect('verify' in row).toBe(false)
  })

  it('幂等重放：同一 split 第二次 start 返回同一块，且不改写已落的 verify', async () => {
    const dir = freshDir()
    const first = await startBlock(
      startInput(previewBlocks(previewInput({ verify: { blockSupervisor: false } }))),
      { dir },
    )
    // 第二次带着相反的开关、走的是同一 split（同 hash），只该拿到旧块。
    const second = await startBlock(
      startInput(previewBlocks(previewInput({ verify: { blockSupervisor: true } }))),
      { dir },
    )

    expect(second.blockId).toBe(first.blockId)
    expect(second.reused).toBe(true)
    const rows = await readBlockRows({ dir })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.verify).toEqual({ blockSupervisor: false })
  })
})

describe('isApproveAnswer', () => {
  const approvals = ['确认', '确认开工', '可以', '开工', '同意', '好的开工', '没问题', '确认！', '好的，开工', '我确认']
  const refusals = [
    '不要',
    '再等等',
    '为什么',
    '?',
    '',
    '   ',
    '不可以',
    '不同意',
    '不行',
    '没问题吧？',
    '为什么不能开工',
    '我不确认',
    'no',
    'nope',
    '不要开工',
  ]
  const englishApprovals = ['yes', 'ok', 'approve', 'go ahead', 'confirmed', 'proceed', 'OK', 'Yes!']

  for (const text of approvals) {
    it(`明确点头「${text}」→ true`, () => {
      expect(isApproveAnswer(text)).toBe(true)
    })
  }

  for (const text of englishApprovals) {
    it(`英文点头「${text}」→ true`, () => {
      expect(isApproveAnswer(text)).toBe(true)
    })
  }

  for (const text of refusals) {
    it(`否定或疑问「${text}」→ false`, () => {
      expect(isApproveAnswer(text)).toBe(false)
    })
  }
})
