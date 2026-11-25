/**
 * Preview → start: the two halves of the intake desk.
 *
 * ## Preview is pure, start is the only writer
 *
 * `previewBlocks` computes what the user will see and remembers it in memory
 * for `previewTtlMs`. It writes nothing: a preview is a question, not a
 * decision. `startBlock` is the only function here that touches the ledger, and
 * it does so only after five things hold.
 *
 * ## The split hash is the contract
 *
 * `splitHash` is the sha-256 of the *normalized* split (objective, blocks,
 * constraints, non-goals) serialized with `canonicalJson`. Normalization is
 * what makes it stable: trimmed text, no blank entries, write paths run through
 * `normalizeWritePath`. Two previews of the same split therefore hash
 * identically — and any real edit changes the hash, which is exactly how a
 * "start" against a stale preview is caught.
 *
 * `verify` is outside that fingerprint on purpose (see `normalizeSplit`): it is
 * how the work is checked, not what the work is.
 *
 * ## Why start checks in a fixed order
 *
 * 1. the preview exists (else `not-found`);
 * 2. it has not expired (else `preview-expired`);
 * 3. the submitted `splitHash` is byte-identical to the preview's (else
 *    `split-changed`);
 * 4. one of the messages after the preview contains the approval quote
 *    verbatim (else `approval-required`);
 * 5. `approved === true` (else `not-approval`).
 *
 * The order is the user's story: "you never saw this" outranks "you saw it but
 * it changed", which outranks "you changed it but did not say yes". A caller
 * that gets `approval-required` therefore knows the words are missing, not that
 * the split moved underneath it.
 *
 * ## Idempotency comes first, before all five
 *
 * Starting the same split twice must hand back the same `blockId` and must not
 * append a second line. So `startBlock` looks the split up in the ledger before
 * it validates anything: a retry after a crash — or after the preview expired,
 * or after the plugin restarted and lost its in-memory previews — still returns
 * the block that already exists. Nothing is re-approved and nothing is
 * rewritten; `reused: true` says which case the caller is in.
 */

import { randomUUID } from 'node:crypto'
import { normalizeWritePath } from '../paths.js'
import { blocksFile, type BlockLedgerOptions } from './paths.js'
import { appendBlockRow, canonicalJson, findBlockBySplit, sha256Hex } from './store.js'
import {
  BLOCK_INTAKE_LIMITS,
  BLOCK_LEDGER_VERSION,
  BlockIntakeError,
  type ApprovalKind,
  type BlockApproval,
  type BlockEntry,
  type BlockExecution,
  type BlockPreview,
  type BlockRow,
  type BlockStartResult,
  type BlockStatus,
} from './types.js'

/** One block as the caller proposes it. */
export interface BlockEntryInput {
  title: string
  objective: string
  deliverable: string
  acceptance: string[]
  writesPaths?: string[]
  /** Titles of other blocks in the same split this block waits on. */
  dependsOn?: string[]
  execution?: BlockExecution
  owner?: string
}

/** What a caller hands to `previewBlocks`. */
export interface PreviewInput {
  sessionId: string
  objective: string
  blocks: BlockEntryInput[]
  constraints?: string[]
  nonGoals?: string[]
  verify?: { blockSupervisor?: boolean }
  /** Clock override, in epoch milliseconds. */
  now?: number
}

/** What a caller hands to `startBlock` once the user has said yes. */
export interface StartInput {
  sessionId: string
  previewId: string
  splitHash: string
  approval: { kind: ApprovalKind; quote: string; sourceMessageId?: string }
  /** The user's messages since the preview; the quote must appear in one of them. */
  messagesAfterPreview: string[]
  approved: boolean
  /** Clock override, in epoch milliseconds. */
  now?: number
}

/** One block after normalization — this is what the hash is taken over. */
export interface NormalizedBlock {
  title: string
  objective: string
  deliverable: string
  acceptance: string[]
  writesPaths: string[]
  dependsOn: string[]
  execution: BlockExecution
  owner?: string
}

/** The normalized split: the only thing `splitHash` is computed from. */
export interface BlockSplit {
  objective: string
  blocks: NormalizedBlock[]
  constraints: string[]
  nonGoals: string[]
}

/** A live preview plus what `startBlock` needs to know about it. */
export interface StoredPreview {
  previewId: string
  sessionId: string
  splitHash: string
  render: string
  warnings: string[]
  expiresAt: string
  /** Epoch milliseconds of `expiresAt`, so the check needs no date parsing. */
  expiresAtMs: number
  createdAtMs: number
  split: BlockSplit
  /** The intake-time verification switches; kept beside the split, not in it. */
  verify?: { blockSupervisor?: boolean }
}

const APPROVAL_KINDS = new Set<string>(['preview', 'user', 'request', 'operator', 'policy'])
const EXECUTIONS = new Set<string>(['foreman', 'workflow'])

/** Live previews, keyed by preview id; insertion order is oldest-first. */
const previews = new Map<string, StoredPreview>()

function fail(message: string): never {
  throw new BlockIntakeError('invalid', message)
}

function requireText(field: string, value: unknown, maxChars: number): string {
  if (typeof value !== 'string') fail(`${field} 必须是字符串`)
  const text = value.trim()
  if (text === '') fail(`${field} 不能为空`)
  if (text.length > maxChars) fail(`${field} 超过 ${maxChars} 个字符（实际 ${text.length}）`)
  return text
}

/**
 * Trim a string list, drop blank entries, and enforce its bounds. Blank entries
 * are dropped rather than refused: a caller that writes `['a', '', 'b']` means
 * two items, and the split hash must agree with that reading.
 */
function requireList(
  field: string,
  value: unknown,
  maxItems: number,
  maxChars: number,
  minItems: number,
): string[] {
  if (!Array.isArray(value)) fail(`${field} 必须是字符串数组`)
  const out: string[] = []
  value.forEach((item, index) => {
    if (typeof item !== 'string') fail(`${field}[${index}] 必须是字符串`)
    const text = item.trim()
    if (text === '') return
    if (text.length > maxChars) fail(`${field}[${index}] 超过 ${maxChars} 个字符（实际 ${text.length}）`)
    if (!out.includes(text)) out.push(text)
  })
  if (out.length < minItems) {
    fail(`${field} 至少 ${minItems} 条（收到 ${out.length} 条，空串不算）`)
  }
  if (out.length > maxItems) fail(`${field} 最多 ${maxItems} 条（实际 ${out.length}）`)
  return out
}

/** Normalize one block's declared write paths: trim, bound, `normalizeWritePath`, dedupe. */
function normalizePaths(field: string, value: unknown): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) fail(`${field} 必须是字符串数组`)
  if (value.length > BLOCK_INTAKE_LIMITS.writesPathsPerBlock) {
    fail(`${field} 最多 ${BLOCK_INTAKE_LIMITS.writesPathsPerBlock} 条（实际 ${value.length}）`)
  }
  const out: string[] = []
  value.forEach((item, index) => {
    if (typeof item !== 'string') fail(`${field}[${index}] 必须是字符串`)
    const text = item.trim()
    if (text === '') return
    if (text.length > BLOCK_INTAKE_LIMITS.pathChars) {
      fail(`${field}[${index}] 超过 ${BLOCK_INTAKE_LIMITS.pathChars} 个字符（实际 ${text.length}）`)
    }
    const normalized = normalizeWritePath(text)
    if (normalized === undefined) return
    if (!out.includes(normalized)) out.push(normalized)
  })
  return out
}

function normalizeEntry(raw: BlockEntryInput, index: number): NormalizedBlock {
  const at = `blocks[${index}]`
  if (typeof raw !== 'object' || raw === null) fail(`${at} 必须是对象`)
  const title = requireText(`${at}.title`, raw.title, BLOCK_INTAKE_LIMITS.titleChars)
  const objective = requireText(`${at}.objective`, raw.objective, BLOCK_INTAKE_LIMITS.objectiveChars)
  const deliverable = requireText(`${at}.deliverable`, raw.deliverable, BLOCK_INTAKE_LIMITS.deliverableChars)
  const acceptance = requireList(
    `${at}.acceptance`,
    raw.acceptance,
    BLOCK_INTAKE_LIMITS.criteriaPerBlock,
    BLOCK_INTAKE_LIMITS.criterionChars,
    1,
  )
  const writesPaths = normalizePaths(`${at}.writesPaths`, raw.writesPaths)
  const dependsOn =
    raw.dependsOn === undefined
      ? []
      : requireList(
          `${at}.dependsOn`,
          raw.dependsOn,
          BLOCK_INTAKE_LIMITS.writesPathsPerBlock,
          BLOCK_INTAKE_LIMITS.titleChars,
          0,
        )
  const execution = raw.execution ?? 'foreman'
  if (!EXECUTIONS.has(execution)) fail(`${at}.execution 必须是 foreman 或 workflow`)
  const owner = raw.owner === undefined ? undefined : requireText(`${at}.owner`, raw.owner, BLOCK_INTAKE_LIMITS.ownerChars)
  return {
    title,
    objective,
    deliverable,
    acceptance,
    writesPaths,
    dependsOn,
    execution,
    ...(owner === undefined ? {} : { owner }),
  }
}

/**
 * Read the intake-time verification switches.
 *
 * Only a boolean `blockSupervisor` survives: anything else is dropped rather
 * than guessed at, and the judge then runs by default — the safe side of a
 * malformed switch.
 * @param value - whatever the caller put in `verify`.
 * @returns The switches, or `undefined` when the caller said nothing.
 */
function normalizeVerify(value: unknown): { blockSupervisor?: boolean } | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'object') fail('verify 必须是对象')
  const blockSupervisor = (value as { blockSupervisor?: unknown }).blockSupervisor
  return typeof blockSupervisor === 'boolean' ? { blockSupervisor } : {}
}

/**
 * Validate and normalize a proposed split. Pure: no disk, no memory, no clock.
 *
 * `verify` is intentionally *not* part of the returned split, so it never
 * reaches `splitHash`. The hash answers "is this the work the user approved?",
 * and the supervisor switch is an execution policy laid on top of that work:
 * folding it in would make "the user turned the judge off" look like "the user
 * changed the order", and `startBlock` would refuse a preview nobody edited.
 * The switch still has to survive — it rides on the row via `BlockRow.verify`
 * — but it rides beside the fingerprint, not inside it.
 * @param input - the caller's proposal.
 * @returns The normalized split the hash is taken over.
 */
export function normalizeSplit(input: PreviewInput): BlockSplit {
  if (typeof input !== 'object' || input === null) fail('预览入参必须是对象')
  const objective = requireText('objective', input.objective, BLOCK_INTAKE_LIMITS.objectiveChars)
  if (!Array.isArray(input.blocks)) fail('blocks 必须是数组')
  if (input.blocks.length === 0) fail('blocks 至少 1 块')
  if (input.blocks.length > BLOCK_INTAKE_LIMITS.blocksPerPreview) {
    fail(`blocks 最多 ${BLOCK_INTAKE_LIMITS.blocksPerPreview} 块（实际 ${input.blocks.length} 块）`)
  }
  const blocks = input.blocks.map(normalizeEntry)
  const constraints =
    input.constraints === undefined
      ? []
      : requireList('constraints', input.constraints, BLOCK_INTAKE_LIMITS.writesPathsPerBlock, BLOCK_INTAKE_LIMITS.objectiveChars, 0)
  const nonGoals =
    input.nonGoals === undefined
      ? []
      : requireList('nonGoals', input.nonGoals, BLOCK_INTAKE_LIMITS.writesPathsPerBlock, BLOCK_INTAKE_LIMITS.objectiveChars, 0)
  return { objective, blocks, constraints, nonGoals }
}

/**
 * The split's fingerprint: sha-256 over its canonical JSON.
 * @param split - a normalized split.
 */
export function splitHashOf(split: BlockSplit): string {
  return sha256Hex(canonicalJson(split))
}

function executionLabel(execution: BlockExecution): string {
  return execution === 'workflow' ? 'workflow 工作流' : 'foreman 调度'
}

function collectWarnings(split: BlockSplit): string[] {
  const warnings: string[] = []
  const total = split.blocks.length
  if (total >= BLOCK_INTAKE_LIMITS.blocksPerPreview) {
    warnings.push(`块数 ${total} 已到上限 ${BLOCK_INTAKE_LIMITS.blocksPerPreview}，再多就要拆成两单`)
  } else if (total >= BLOCK_INTAKE_LIMITS.blocksPerPreview - 1) {
    warnings.push(`块数 ${total} 接近上限 ${BLOCK_INTAKE_LIMITS.blocksPerPreview}，再加一块就到顶`)
  }
  const titles = new Set(split.blocks.map((block) => block.title))
  split.blocks.forEach((block, index) => {
    const at = `第 ${index + 1} 块「${block.title}」`
    if (block.acceptance.length === 0) {
      warnings.push(`${at}没有写验收条目，完工时没有可核对的标准`)
    }
    if (block.writesPaths.length === 0) {
      warnings.push(`${at}没有声明写范围（writesPaths 为空），并行时可能和别人撞文件`)
    }
    for (const dependency of block.dependsOn) {
      if (!titles.has(dependency)) {
        warnings.push(`${at}依赖「${dependency}」，这一单里找不到同名块`)
      }
    }
    if (block.execution === 'workflow' && block.owner === undefined) {
      warnings.push(`${at}用 workflow 执行但没给 owner（子代理名），派单时不知道交给谁`)
    }
  })
  return warnings
}

function renderPreview(split: BlockSplit, warnings: readonly string[]): string {
  const lines: string[] = []
  lines.push(`接单预览：${split.objective}`)
  lines.push(`这一单切成 ${split.blocks.length} 块。`)
  split.blocks.forEach((block, index) => {
    lines.push('')
    lines.push(`[${index + 1}] ${block.title}（${executionLabel(block.execution)}）`)
    lines.push(`  目标：${block.objective}`)
    lines.push(`  交付物：${block.deliverable}`)
    lines.push('  验收：')
    for (const criterion of block.acceptance) lines.push(`    - ${criterion}`)
    lines.push(`  写范围：${block.writesPaths.length === 0 ? '（没声明）' : block.writesPaths.join('、')}`)
    lines.push(`  依赖：${block.dependsOn.length === 0 ? '无' : block.dependsOn.join('、')}`)
    if (block.owner !== undefined) lines.push(`  交给：${block.owner}`)
  })
  if (split.constraints.length > 0) {
    lines.push('')
    lines.push(`约束：${split.constraints.join('；')}`)
  }
  if (split.nonGoals.length > 0) {
    lines.push(`不做：${split.nonGoals.join('；')}`)
  }
  if (warnings.length > 0) {
    lines.push('')
    lines.push('需要你留意：')
    for (const warning of warnings) lines.push(`  - ${warning}`)
  }
  lines.push('')
  lines.push('回复『确认』开工；要改就直接说改哪一块。')
  return lines.join('\n')
}

/** Drop the oldest previews of one session beyond `previewsPerSession`. */
function evictOldest(sessionId: string): void {
  const mine = [...previews.values()].filter((entry) => entry.sessionId === sessionId)
  const excess = mine.length - BLOCK_INTAKE_LIMITS.previewsPerSession
  if (excess <= 0) return
  for (const entry of mine.slice(0, excess)) previews.delete(entry.previewId)
}

/**
 * Compute a preview and remember it for this session.
 *
 * Nothing is written to disk: this is the question, not the answer.
 * @param input - the proposed split.
 * @param options - ledger location (reserved; a preview never reads or writes it).
 * @returns The preview, including the hash `startBlock` will demand back.
 */
export function previewBlocks(input: PreviewInput, options: BlockLedgerOptions = {}): BlockPreview {
  void options
  const sessionId = requireText('sessionId', input.sessionId, 200)
  const split = normalizeSplit(input)
  const splitHash = splitHashOf(split)
  const warnings = collectWarnings(split)
  const render = renderPreview(split, warnings)
  const nowMs = input.now === undefined ? Date.now() : input.now
  const expiresAtMs = nowMs + BLOCK_INTAKE_LIMITS.previewTtlMs
  const previewId = `bp-${randomUUID()}`
  const verify = normalizeVerify(input.verify)
  const stored: StoredPreview = {
    previewId,
    sessionId,
    splitHash,
    render,
    warnings,
    expiresAt: new Date(expiresAtMs).toISOString(),
    expiresAtMs,
    createdAtMs: nowMs,
    split,
    ...(verify === undefined ? {} : { verify }),
  }
  previews.set(previewId, stored)
  evictOldest(sessionId)
  return {
    previewId,
    splitHash,
    render,
    warnings: [...warnings],
    requiresUserApproval: true,
    expiresAt: stored.expiresAt,
  }
}

/**
 * Look up a live (or expired) preview. Expired entries are still returned on
 * purpose: `startBlock` can then say "this preview expired" instead of the
 * misleading "no such preview".
 */
export function previewById(previewId: string): StoredPreview | undefined {
  return previews.get(previewId)
}

/** Forget every remembered preview. For tests and for an explicit session reset. */
export function resetPreviews(): void {
  previews.clear()
}

function rowStatus(row: BlockRow): BlockStatus {
  return row.blocks[0]?.status ?? 'open'
}

/**
 * One plain-text line for the dispatcher: how many blocks, how each runs, what it
 * writes, what it waits on. Deliberately not JSON — this is read by a person
 * before it is read by a machine.
 */
function dispatchEnvelopeOf(blocks: readonly BlockEntry[]): string {
  const parts = blocks.map((block) => {
    const scope = block.writesPaths.length === 0 ? '不写文件' : `写 ${block.writesPaths.join('、')}`
    const dependency = block.dependsOn.length === 0 ? '无依赖' : `依赖 ${block.dependsOn.join('、')}`
    const owner = block.owner === undefined ? '' : `，交给 ${block.owner}`
    return `${block.id}「${block.title}」${block.execution}${owner}（${scope}，${dependency}）`
  })
  return `派单 ${blocks.length} 块：${parts.join('；')}。`
}

/**
 * Turn an approved preview into a ledger row.
 *
 * Idempotent by split: a split already in the ledger is returned as-is
 * (`reused: true`) before any validation runs, so a retry never appends a
 * second line and never bumps the version.
 * @param input - the preview id, the hash the user approved, the quote, and the
 *   messages since the preview.
 * @param options - ledger directory.
 * @returns The block id, its status, where it was written, and the dispatch line.
 */
export async function startBlock(
  input: StartInput,
  options: BlockLedgerOptions = {},
): Promise<BlockStartResult> {
  const sessionId = requireText('sessionId', input.sessionId, 200)
  const previewId = requireText('previewId', input.previewId, 200)
  const splitHash = requireText('splitHash', input.splitHash, 200)
  const approval = input.approval
  if (typeof approval !== 'object' || approval === null) fail('approval 必须是对象')
  if (!APPROVAL_KINDS.has(approval.kind)) fail('approval.kind 不是已知的审批来源')
  const quote = requireText('approval.quote', approval.quote, BLOCK_INTAKE_LIMITS.quoteChars)
  const nowMs = input.now === undefined ? Date.now() : input.now
  const messages = Array.isArray(input.messagesAfterPreview)
    ? input.messagesAfterPreview.filter((message): message is string => typeof message === 'string')
    : []

  // Idempotency first: the same split already accepted is the same block, no
  // matter how long ago the preview was made or whether this process still
  // remembers it.
  const existing = await findBlockBySplit(sessionId, splitHash, options)
  if (existing !== undefined) {
    return {
      blockId: existing.id,
      status: rowStatus(existing),
      ledgerPath: blocksFile(options),
      dispatchEnvelope: dispatchEnvelopeOf(existing.blocks),
      reused: true,
    }
  }

  const preview = previews.get(previewId)
  if (preview === undefined || preview.sessionId !== sessionId) {
    throw new BlockIntakeError('not-found', `这个会话里没有预览 ${previewId}，请重新出单`)
  }
  if (nowMs >= preview.expiresAtMs) {
    throw new BlockIntakeError('preview-expired', `预览 ${previewId} 已在 ${preview.expiresAt} 过期，请重新出单`)
  }
  if (splitHash !== preview.splitHash) {
    throw new BlockIntakeError(
      'split-changed',
      `切分已经变了：预览是 ${preview.splitHash}，这次提交的是 ${splitHash}，请重新出单`,
    )
  }
  if (!messages.some((message) => message.includes(quote))) {
    throw new BlockIntakeError('approval-required', `预览之后没有一条消息逐字包含「${quote}」，不能开工`)
  }
  if (input.approved !== true) {
    throw new BlockIntakeError('not-approval', '这一单还没有被明确点头（approved 不是 true），不能开工')
  }

  const atIso = new Date(nowMs).toISOString()
  const blocks: BlockEntry[] = preview.split.blocks.map((block, index) => ({
    id: `blk-${index + 1}`,
    title: block.title,
    objective: block.objective,
    deliverable: block.deliverable,
    acceptance: [...block.acceptance],
    writesPaths: [...block.writesPaths],
    dependsOn: [...block.dependsOn],
    execution: block.execution,
    ...(block.owner === undefined ? {} : { owner: block.owner }),
    status: 'open',
    tasks: [],
  }))
  const sourceMessageId = approval.sourceMessageId?.trim()
  const approvalRow: BlockApproval = {
    kind: approval.kind,
    quote,
    at: atIso,
    ...(sourceMessageId === undefined || sourceMessageId === '' ? {} : { sourceMessageId }),
  }
  const row: BlockRow = {
    v: BLOCK_LEDGER_VERSION,
    id: randomUUID(),
    sessionId,
    objective: preview.split.objective,
    splitHash,
    approval: approvalRow,
    blocks,
    // Omitted entirely when the caller said nothing, so a row written before
    // this field existed keeps its exact bytes.
    ...(preview.verify === undefined ? {} : { verify: { ...preview.verify } }),
    version: 1,
    createdAt: atIso,
    updatedAt: atIso,
    rowHash: '',
  }
  const written = await appendBlockRow(row, options)
  return {
    blockId: written.id,
    status: rowStatus(written),
    ledgerPath: blocksFile(options),
    dispatchEnvelope: dispatchEnvelopeOf(written.blocks),
    reused: false,
  }
}
