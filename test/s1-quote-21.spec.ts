/**
 * S1 逐字引文关的钉子（`startBlock` 的第四道校验）。
 *
 * 只钉机制存在性，不钉文案、不钉批准语义：
 *
 * - CARVED-QUOTE：从用户原话里切词、只取片段、拆到两条消息、打乱词序——只要不是
 *   整句连续出现，就必须 `approval-required`。引文关是「整句连续子串」，不是关键词
 *   命中；谁把 `includes` 换成按词/按标点命中的匹配，这组用例就会放过，钉子变红。
 * - WHOLE-QUOTE：整句逐字原样出现时，引文关必须放行。放行只锁引文关本身：`approved`
 *   不是 true 时报 `not-approval`（引文关在前，所以这个码本身就证明引文关过了），
 *   `approved: true` 时落一行。
 * - 打字差异：用户把整句复制过来时折了行、多了空格（同一句话，只是空白不同），也
 *   必须放行——真话不能因为一个换行被挡回去。空白以外的差异（标点、词序、缺字）仍然
 *   不算整句。
 *
 * 每个用例都在 `.tmp/` 下的临时目录里跑，绝不碰真实 `$DSH_HOME`。
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  BlockIntakeError,
  blocksFile,
  previewBlocks,
  resetPreviews,
  startBlock,
  type BlockEntryInput,
  type BlockPreview,
  type PreviewInput,
  type StartInput,
} from '../src/block/index.js'

const scratchRoot = (() => {
  const base = join(process.cwd(), '.tmp')
  mkdirSync(base, { recursive: true })
  return mkdtempSync(join(base, 's1-quote-'))
})()

afterAll(() => {
  rmSync(scratchRoot, { recursive: true, force: true })
})

let caseNo = 0
function freshDir(): string {
  caseNo += 1
  return mkdtempSync(join(scratchRoot, `case-${caseNo}-`))
}

/** 2026-01-01T00:00:00.000Z — a fixed clock, so the expiry check never interferes. */
const T0 = 1_767_225_600_000

/** 用户真实说的那一句；引文关要的是这一整句，不是其中几个词。 */
const QUOTE = '确认，按这个切法开工吧'

/** 真实批准话通常有好几个分句；切词绕过在这里最容易发生。 */
const LONG_QUOTE = '确认，先做预览，再做校验，别碰线上'

beforeEach(() => {
  resetPreviews()
})

function entry(): BlockEntryInput {
  return {
    title: '账本',
    objective: '把块账本写出来',
    deliverable: 'src/block/store.ts',
    acceptance: ['能追加一行'],
    writesPaths: ['src/block/store.ts'],
  }
}

function previewInput(): PreviewInput {
  return {
    sessionId: 'sess-1',
    objective: '做完接单台子',
    blocks: [entry()],
    now: T0,
  }
}

function startInput(preview: BlockPreview, over: Partial<StartInput> = {}): StartInput {
  const base: StartInput = {
    sessionId: 'sess-1',
    previewId: preview.previewId,
    splitHash: preview.splitHash,
    approval: { kind: 'user', quote: QUOTE, sourceMessageId: 'msg-9' },
    messagesAfterPreview: [QUOTE],
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

/** 引文关的判据：这条消息算不算「整句逐字出现」。用 approved=false 探，不落盘。 */
async function refusedAsApprovalRequired(messages: string[], quote = QUOTE): Promise<string> {
  const dir = freshDir()
  const preview = previewBlocks(previewInput())
  const error = await intakeError(
    startBlock(
      startInput(preview, { messagesAfterPreview: messages, approved: false, approval: { kind: 'user', quote } }),
      { dir },
    ),
  )
  return error.code
}

describe('CARVED-QUOTE：不是整句就拒绝', () => {
  it('每个词单独一条消息（切词）→ approval-required', async () => {
    expect(await refusedAsApprovalRequired(['确认', '按这个切法', '开工吧'])).toBe('approval-required')
  })

  it('切词后用空格拼回、标点丢了 → approval-required', async () => {
    expect(await refusedAsApprovalRequired(['确认 按这个切法 开工吧'])).toBe('approval-required')
  })

  it('整句被拆到两条消息里（各持一半）→ approval-required', async () => {
    expect(await refusedAsApprovalRequired(['确认，按这个切法', '开工吧'])).toBe('approval-required')
  })

  it('关键词全到齐但词序打乱 → approval-required', async () => {
    expect(await refusedAsApprovalRequired(['开工吧，按这个切法确认'])).toBe('approval-required')
  })

  it('只有一句礼貌话、没有原话 → approval-required', async () => {
    expect(await refusedAsApprovalRequired(['好的，我开始吧'])).toBe('approval-required')
  })

  it('多分句原话被切成词、用空格拼回（标点全丢）→ approval-required', async () => {
    expect(await refusedAsApprovalRequired(['确认 先做预览 再做校验 别碰线上'], LONG_QUOTE)).toBe(
      'approval-required',
    )
  })

  it('多分句原话只取了其中几个分句 → approval-required', async () => {
    expect(await refusedAsApprovalRequired(['确认，先做预览，再做校验'], LONG_QUOTE)).toBe('approval-required')
  })

  it('多分句原话各分句分散在两条消息里 → approval-required', async () => {
    expect(await refusedAsApprovalRequired(['确认，先做预览', '再做校验，别碰线上'], LONG_QUOTE)).toBe(
      'approval-required',
    )
  })

  it('拒绝时账本一行都不写', async () => {
    const dir = freshDir()
    const preview = previewBlocks(previewInput())
    await intakeError(
      startBlock(startInput(preview, { messagesAfterPreview: ['确认', '按这个切法', '开工吧'] }), { dir }),
    )
    expect(existsSync(blocksFile({ dir }))).toBe(false)
  })
})

describe('WHOLE-QUOTE：整句逐字就放行引文关', () => {
  it('整句逐字 + approved=false → not-approval（引文关已过，卡在第五道）', async () => {
    expect(await refusedAsApprovalRequired([QUOTE])).toBe('not-approval')
  })

  it('整句逐字 + approved=true → 落一行（reused=false）', async () => {
    const dir = freshDir()
    const preview = previewBlocks(previewInput())
    const result = await startBlock(startInput(preview), { dir })
    expect(result.reused).toBe(false)
    expect(result.blockId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('前后有别的寒暄，整句原样在里面 → 放行', async () => {
    expect(await refusedAsApprovalRequired([`看完了。\n${QUOTE}\n就照这个来。`])).toBe('not-approval')
  })

  it('整句逐字但折了行（复制预览时常有的折行）→ 放行', async () => {
    expect(await refusedAsApprovalRequired(['确认，\n按这个切法开工吧'])).toBe('not-approval')
  })

  it('整句逐字但词间多了空格（打字习惯）→ 放行', async () => {
    expect(await refusedAsApprovalRequired(['确认，  按这个切法  开工吧'])).toBe('not-approval')
  })
})
