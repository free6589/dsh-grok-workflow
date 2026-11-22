/**
 * Handoff contract (交接契约): fixed four-line handoff for the next agent.
 *
 * The contract is exactly four rows:
 *
 * 1. 结论 / Conclusion — what was decided or achieved.
 * 2. 证据指针 / Evidence — verifiable pointers (checkpoint / artifact paths
 *    plus a checksum and/or line number), never bare prose.
 * 3. 未决问题 / Open questions — what is still unknown or disputed.
 * 4. 下一步 / Next steps — what the next agent should do.
 *
 * A missing row fails closed: {@link assertHandoffContract} throws a
 * {@link HandoffContractError} that carries both the Chinese and the English
 * message, so the next agent can be rejected with a clear reason instead of
 * silently continuing with half a handoff.
 */

/** One verifiable evidence pointer. */
export interface HandoffEvidencePointer {
  /** Checkpoint file path or artifact file path (e.g. `checkpoints/run.json`, `src/report.ts`, `file:///tmp/out`). */
  path: string
  /** Checksum of the referenced content (hex, e.g. sha-256). At least one of `checksum` / `line` is required. */
  checksum?: string
  /** 1-based line number inside the referenced file. At least one of `checksum` / `line` is required. */
  line?: number
}

/** The fixed four-line handoff contract. */
export interface HandoffContract {
  /** 结论 / Conclusion. */
  conclusion: string
  /** 证据指针 / Evidence pointers (at least one, every one verifiable). */
  evidence: HandoffEvidencePointer[]
  /** 未决问题 / Open questions (at least one). */
  openQuestions: string[]
  /** 下一步 / Next steps (at least one). */
  nextSteps: string[]
}

/** Bilingual error text: Chinese first, English second. */
export interface HandoffErrorText {
  zh: string
  en: string
}

/** Bounds for handoff fields (same scale as the checkpoint text bounds). */
export const HANDOFF_LIMITS = {
  /** Maximum characters of the conclusion. */
  conclusionChars: 4_000,
  /** Maximum characters of one open question / next step. */
  itemChars: 600,
  /** Maximum characters of one evidence path. */
  pathChars: 400,
  /** Maximum evidence pointers in one contract. */
  evidenceItems: 32,
  /** Maximum open questions in one contract. */
  questionItems: 32,
  /** Maximum next steps in one contract. */
  stepItems: 32,
} as const

/**
 * Bilingual error catalogue. Every validation failure maps to one entry here,
 * so the caller can show either language without re-deriving the message.
 */
export const HANDOFF_ERRORS = {
  MISSING_CONCLUSION: {
    zh: '交接契约缺少“结论”：结论不能为空，必须是一行非空文字。',
    en: 'Handoff contract is missing "conclusion": conclusion must be a non-empty string.',
  },
  MISSING_EVIDENCE: {
    zh: '交接契约缺少“证据指针”：至少需要一条可复验的证据指针。',
    en: 'Handoff contract is missing "evidence": at least one verifiable evidence pointer is required.',
  },
  MISSING_OPEN_QUESTIONS: {
    zh: '交接契约缺少“未决问题”：至少需要一条未决问题。',
    en: 'Handoff contract is missing "open questions": at least one open question is required.',
  },
  MISSING_NEXT_STEPS: {
    zh: '交接契约缺少“下一步”：至少需要一条下一步。',
    en: 'Handoff contract is missing "next steps": at least one next step is required.',
  },
  EVIDENCE_NOT_VERIFIABLE: {
    zh: '证据指针不可复验：必须引用 checkpoint 文件路径或产物文件路径，并附带校验位（checksum 和/或行号），不接受裸文字自述。',
    en: 'Evidence pointer is not verifiable: it must reference a checkpoint file path or artifact file path with a checksum and/or line number; bare prose is not accepted.',
  },
} as const satisfies Record<string, HandoffErrorText>

/** Why a handoff operation failed. `field` drives test and caller branching. */
export class HandoffContractError extends Error {
  readonly field: string
  readonly zh: string
  readonly en: string
  constructor(field: string, text: HandoffErrorText, detail?: string) {
    const zh = detail === undefined ? text.zh : `${text.zh}（${detail}）`
    const en = detail === undefined ? text.en : `${text.en} (${detail})`
    super(`${zh} / ${en}`)
    this.name = 'HandoffContractError'
    this.field = field
    this.zh = zh
    this.en = en
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HandoffContractError(path, HANDOFF_ERRORS.EVIDENCE_NOT_VERIFIABLE, `handoff ${path} must be an object / 交接契约 ${path} 必须是对象`)
  }
  return value as Record<string, unknown>
}

function nonEmptyString(value: unknown, path: string, max: number, missing: HandoffErrorText): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HandoffContractError(path, missing)
  }
  const trimmed: string = value.trim()
  if (trimmed.length > max) {
    throw new HandoffContractError(path, missing, `exceeds ${max} characters / 超过 ${max} 字符`)
  }
  return trimmed
}

function stringList(value: unknown, path: string, maxItems: number, maxChars: number, missing: HandoffErrorText): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HandoffContractError(path, missing)
  }
  if (value.length > maxItems) {
    throw new HandoffContractError(path, missing, `exceeds ${maxItems} items / 超过 ${maxItems} 条`)
  }
  return value.map((item: unknown, index: number) => {
    if (typeof item !== 'string' || item.trim() === '') {
      throw new HandoffContractError(`${path}[${index}]`, missing)
    }
    const trimmed: string = item.trim()
    if (trimmed.length > maxChars) {
      throw new HandoffContractError(`${path}[${index}]`, missing, `exceeds ${maxChars} characters / 超过 ${maxChars} 字符`)
    }
    return trimmed
  })
}

/**
 * True when the path looks like a file reference rather than bare prose.
 * A verifiable pointer names a file: an absolute path, a `file://` URL, or a
 * relative path with a directory separator or file extension.
 */
function looksLikeFilePath(path: string): boolean {
  const trimmed = path.trim()
  if (trimmed.length < 3) return false
  if (trimmed.startsWith('file://')) return true
  if (trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) return true
  if (/^[A-Za-z]:[\\/]/.test(trimmed)) return true
  if (trimmed.includes('/')) return true
  if (trimmed.includes('\\')) return true
  if (/\.[A-Za-z0-9]{1,10}$/.test(trimmed)) return true
  return false
}

function evidencePointer(value: unknown, path: string): HandoffEvidencePointer {
  const entry = record(value, path)
  const rawPath: unknown = entry['path']
  if (typeof rawPath !== 'string' || rawPath.trim() === '') {
    throw new HandoffContractError(
      `${path}.path`,
      HANDOFF_ERRORS.EVIDENCE_NOT_VERIFIABLE,
      'evidence pointer is missing its path / 证据指针缺少 path',
    )
  }
  const filePath: string = rawPath.trim()
  if (filePath.length > HANDOFF_LIMITS.pathChars) {
    throw new HandoffContractError(
      `${path}.path`,
      HANDOFF_ERRORS.EVIDENCE_NOT_VERIFIABLE,
      `path exceeds ${HANDOFF_LIMITS.pathChars} characters / path 超过 ${HANDOFF_LIMITS.pathChars} 字符`,
    )
  }
  if (!looksLikeFilePath(filePath)) {
    throw new HandoffContractError(
      `${path}.path`,
      HANDOFF_ERRORS.EVIDENCE_NOT_VERIFIABLE,
      `"${filePath}" is not a file path / “${filePath}”不是文件路径`,
    )
  }
  const checksumRaw: unknown = entry['checksum']
  const lineRaw: unknown = entry['line']
  let checksum: string | undefined
  if (checksumRaw !== undefined && checksumRaw !== null) {
    if (typeof checksumRaw !== 'string' || checksumRaw.trim() === '') {
      throw new HandoffContractError(
        `${path}.checksum`,
        HANDOFF_ERRORS.EVIDENCE_NOT_VERIFIABLE,
        'checksum must be a non-empty hex string / checksum 必须是非空十六进制字符串',
      )
    }
    const hex: string = checksumRaw.trim().toLowerCase()
    if (!/^[0-9a-f]{7,128}$/.test(hex)) {
      throw new HandoffContractError(
        `${path}.checksum`,
        HANDOFF_ERRORS.EVIDENCE_NOT_VERIFIABLE,
        `checksum "${checksumRaw}" is not 7-128 hex characters / checksum “${checksumRaw}”不是 7-128 位十六进制`,
      )
    }
    checksum = hex
  }
  let line: number | undefined
  if (lineRaw !== undefined && lineRaw !== null) {
    if (typeof lineRaw !== 'number' || !Number.isSafeInteger(lineRaw) || lineRaw < 1 || lineRaw > 10_000_000) {
      throw new HandoffContractError(
        `${path}.line`,
        HANDOFF_ERRORS.EVIDENCE_NOT_VERIFIABLE,
        'line must be an integer line number >= 1 / line 必须是 ≥1 的整数行号',
      )
    }
    line = lineRaw
  }
  if (checksum === undefined && line === undefined) {
    throw new HandoffContractError(
      path,
      HANDOFF_ERRORS.EVIDENCE_NOT_VERIFIABLE,
      'missing check bit: at least one of checksum or line number is required / 缺少校验位：至少需要 checksum 或行号之一',
    )
  }
  return { path: filePath, ...checksum === undefined ? {} : { checksum }, ...line === undefined ? {} : { line } }
}

/**
 * Validate an unknown value as a handoff contract.
 * Missing rows fail closed; evidence without a check bit fails as unverifiable.
 */
export function assertHandoffContract(value: unknown): HandoffContract {
  const root = record(value, 'handoff')
  const conclusion = nonEmptyString(root['conclusion'], 'handoff.conclusion', HANDOFF_LIMITS.conclusionChars, HANDOFF_ERRORS.MISSING_CONCLUSION)
  const evidenceRaw: unknown = root['evidence']
  if (!Array.isArray(evidenceRaw) || evidenceRaw.length === 0) {
    throw new HandoffContractError('handoff.evidence', HANDOFF_ERRORS.MISSING_EVIDENCE)
  }
  if (evidenceRaw.length > HANDOFF_LIMITS.evidenceItems) {
    throw new HandoffContractError('handoff.evidence', HANDOFF_ERRORS.MISSING_EVIDENCE, `exceeds ${HANDOFF_LIMITS.evidenceItems} items / 超过 ${HANDOFF_LIMITS.evidenceItems} 条`)
  }
  const evidence = evidenceRaw.map((item: unknown, index: number) => evidencePointer(item, `handoff.evidence[${index}]`))
  const openQuestions = stringList(root['openQuestions'], 'handoff.openQuestions', HANDOFF_LIMITS.questionItems, HANDOFF_LIMITS.itemChars, HANDOFF_ERRORS.MISSING_OPEN_QUESTIONS)
  const nextSteps = stringList(root['nextSteps'], 'handoff.nextSteps', HANDOFF_LIMITS.stepItems, HANDOFF_LIMITS.itemChars, HANDOFF_ERRORS.MISSING_NEXT_STEPS)
  return { conclusion, evidence, openQuestions, nextSteps }
}

/** True when the value already satisfies the contract; never throws. */
export function isHandoffContract(value: unknown): value is HandoffContract {
  try {
    assertHandoffContract(value)
    return true
  } catch {
    return false
  }
}
