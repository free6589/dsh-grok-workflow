/**
 * The six checks that run **before** the supervisor model is asked anything.
 *
 * A supervisor call costs a child and a verdict; these six checks cost nothing and
 * they answer the questions a model must never be asked, because a model would answer
 * them plausibly instead of correctly:
 *
 * | check | question | why it cannot be a model's job |
 * | --- | --- | --- |
 * | 1 计划覆盖 | does every acceptance criterion have a task (or a handoff line) answering it? | it is set membership over text the caller already wrote |
 * | 2 证据非空 | is the evidence line real text, not blanks? | a blank is not evidence, and a model asked about blanks writes an opinion |
 * | 3 产物可解析 | do the declared paths exist and do their pointers parse? | the filesystem is the authority; a model cannot see it |
 * | 4 范围 ⊆ 批准 | is every written path inside the scope the user approved? | this is the approval contract, not a judgement call |
 * | 5 依赖悬空 | does `dependsOn` name a sibling that is really accepted? | the ledger is the authority on what was accepted |
 * | 6 交接四行 | does the handoff carry its four non-empty lines? | a missing line is a missing line |
 *
 * A failure here is a veto with **zero** model calls (`src/supervisor/index.ts` returns
 * before it reaches the engine), which is the point: the expensive judge is spent on
 * judgement, never on bookkeeping.
 */

import { existsSync, statSync } from 'node:fs'
import { normalize, sep } from 'node:path'
import type { BlockEntry, BlockRow, BlockTaskRow, VerdictReason } from '../block/index.js'

/** The criterion label the scope check uses, so an override can name it exactly. */
export const SCOPE_CRITERION = '范围 ⊆ 批准'

/** The four handoff lines, in the order the contract asks for them. */
export const HANDOFF_LINES = ['做了什么', '证据', '没做', '下一步'] as const

/** What the deterministic pass is given. */
export interface BlockCheckInput {
  /** The approved row the block belongs to (for siblings and approved scope). */
  row: BlockRow
  /** The block being closed. */
  block: BlockEntry
  /** The four-line handoff the caller wrote. */
  handoff: string
  /** The task split reported at close; falls back to the block's own tasks. */
  tasks?: BlockTaskRow[]
  /**
   * Filesystem seam. Defaults to the real `existsSync`/`statSync`; a test injects a
   * set so "the artifact exists" is a stated fact rather than a property of the
   * developer's machine.
   */
  exists?: (path: string) => boolean
}

/** Outcome of the deterministic pass. */
export interface BlockCheckResult {
  ok: boolean
  failures: VerdictReason[]
  warnings: string[]
}

/** Collapse whitespace so two spellings of one criterion compare equal. */
function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** The non-empty lines of a text, in order. */
function nonEmptyLines(text: string): string[] {
  return text.split(/\r?\n/).map(line => line.trim()).filter(line => line !== '')
}

/**
 * Split a declared path into its base path and its pointer.
 *
 * Accepted pointer spellings are the ones this repository already uses in its own
 * documents: `path:12`, `path:12-30`, `path#L12`, `path#L12-L30`. Anything else after
 * a colon is part of the path (a Windows drive letter is kept whole).
 * @param declared - the path as the caller wrote it.
 * @returns The base path and the pointer text (`''` when there is none).
 */
export function splitPointer(declared: string): { base: string, pointer: string } {
  const trimmed = declared.trim()
  const hash = /^(.*)#L(\d+)(?:-L(\d+))?$/.exec(trimmed)
  if (hash !== null) return { base: hash[1]!, pointer: trimmed.slice(hash[1]!.length) }
  // A drive letter (`C:\x`) must not be read as a pointer.
  const colon = trimmed.lastIndexOf(':')
  if (colon > 1 && /^\d+(?:-\d+)?$/.test(trimmed.slice(colon + 1))) {
    return { base: trimmed.slice(0, colon), pointer: trimmed.slice(colon) }
  }
  return { base: trimmed, pointer: '' }
}

/** True when `child` is `parent` itself or lives under it. */
function isInside(child: string, parent: string): boolean {
  const a = normalize(child).replace(/\/+$/, '')
  const b = normalize(parent).replace(/\/+$/, '')
  if (a === b) return true
  if (b === '' || b === '.') return !a.startsWith('..')
  return a.startsWith(b.endsWith(sep) ? b : `${b}${sep}`)
}

/** A task's acceptance list, whitespace-normalised. */
function taskCriteria(tasks: readonly BlockTaskRow[]): string[] {
  return tasks.flatMap(task => task.acceptanceCriteria.map(normalizeText))
}

/** Every path a task declared, de-duplicated, pointers stripped. */
function declaredPaths(tasks: readonly BlockTaskRow[]): string[] {
  const seen = new Set<string>()
  for (const task of tasks) {
    for (const path of task.writesPaths) {
      const base = splitPointer(path).base.trim()
      if (base !== '') seen.add(base)
    }
  }
  return [...seen]
}

/**
 * Run the six checks.
 *
 * @param input - the block, its row, the handoff, and the task split.
 * @returns `ok` only when every check passed; `failures` names each one that did not.
 */
export function runDeterministicChecks(input: BlockCheckInput): BlockCheckResult {
  const { row, block, handoff } = input
  const tasks = input.tasks ?? block.tasks
  const exists = input.exists ?? ((path: string) => {
    try {
      const stat = statSync(path)
      return stat.isFile() || stat.isDirectory()
    } catch {
      return existsSync(path)
    }
  })
  const failures: VerdictReason[] = []
  const warnings: string[] = []

  // ---- 1. plan coverage -----------------------------------------------------
  const covered = new Set(taskCriteria(tasks))
  const handoffText = normalizeText(handoff)
  for (const criterion of block.acceptance) {
    const wanted = normalizeText(criterion)
    if (covered.has(wanted)) continue
    if (handoffText.includes(wanted)) continue
    failures.push({
      criterion: wanted,
      evidence: tasks.length === 0 ? '没有任何任务' : tasks.map(task => task.title).join('、'),
      why: '这条验收没有任何任务认领，交接里也没有对着它的一行',
    })
  }

  // ---- 2. evidence is not blank --------------------------------------------
  const lines = nonEmptyLines(handoff)
  const evidenceLine = lines[1] ?? ''
  if (evidenceLine.length < 8) {
    failures.push({
      criterion: '证据',
      evidence: evidenceLine === '' ? '(空)' : evidenceLine,
      why: '交接的第二行（证据）为空或太短，空证据不算证据',
    })
  }
  for (const task of tasks) {
    if (task.writesPaths.some(path => path.trim() === '')) {
      failures.push({
        criterion: task.title,
        evidence: '(空路径)',
        why: '任务声明了一条空白写路径，产物位置不可判定',
      })
    }
  }

  // ---- 3. artifacts are parseable ------------------------------------------
  for (const task of tasks) {
    for (const declared of task.writesPaths) {
      const { base, pointer } = splitPointer(declared)
      if (base.trim() === '') continue
      if (!exists(base)) {
        failures.push({
          criterion: declared,
          evidence: '路径不存在',
          why: `任务「${task.title}」声明写 ${base}，但它不存在或不可读`,
        })
        continue
      }
      if (pointer !== '' && !/^(:\d+(-\d+)?|#L\d+(-L\d+)?)$/.test(pointer)) {
        failures.push({
          criterion: declared,
          evidence: pointer,
          why: '指针格式无法解析（支持 `:12`、`:12-30`、`#L12`、`#L12-L30`）',
        })
      }
    }
  }

  // ---- 4. scope is inside the approval -------------------------------------
  const approved = block.writesPaths.map(path => path.trim()).filter(path => path !== '')
  for (const path of declaredPaths(tasks)) {
    if (approved.length === 0) {
      failures.push({
        criterion: SCOPE_CRITERION,
        evidence: path,
        why: '这一块批准的范围是「不写文件」，但任务声明了写路径',
      })
      continue
    }
    if (!approved.some(parent => isInside(path, parent))) {
      failures.push({
        criterion: SCOPE_CRITERION,
        evidence: path,
        why: `批准的范围是 ${approved.join('、')}，这条写路径不在其中`,
      })
    }
  }

  // ---- 5. dependencies are real and accepted -------------------------------
  for (const title of block.dependsOn) {
    const wanted = normalizeText(title)
    const sibling = row.blocks.find(other => normalizeText(other.title) === wanted)
    if (sibling === undefined) {
      failures.push({
        criterion: title,
        evidence: '同一单里没有这一块',
        why: '依赖指向一个不存在的块（按标题匹配）',
      })
      continue
    }
    if (sibling.status !== 'accepted') {
      failures.push({
        criterion: title,
        evidence: sibling.status,
        why: '依赖的块还没有交工（status 不是 accepted）',
      })
    }
  }

  // ---- 6. the handoff has its four lines -----------------------------------
  if (lines.length !== HANDOFF_LINES.length) {
    failures.push({
      criterion: '交接四行',
      evidence: `${lines.length} 行`,
      why: `交接必须正好四行（${HANDOFF_LINES.join(' / ')}），每行都要有内容`,
    })
  } else {
    const short = lines.findIndex(line => line.length < 2)
    if (short >= 0) {
      failures.push({
        criterion: HANDOFF_LINES[short]!,
        evidence: lines[short]!,
        why: '这一行没有实际内容',
      })
    }
  }

  if (tasks.length === 0) warnings.push('这次交工没有报任务拆法，只按块自己的验收检查')
  if (approved.length === 0) warnings.push('这一块批准的范围是「不写文件」，没有产物要查')

  return { ok: failures.length === 0, failures, warnings }
}
