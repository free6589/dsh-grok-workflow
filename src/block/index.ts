/**
 * Block intake, public surface.
 *
 * Everything the tool layer needs comes from this one file, so a caller never
 * reaches into a submodule and never has to guess which of the two ledgers a
 * function belongs to.
 */

export {
  BLOCK_INTAKE_LIMITS,
  BLOCK_LEDGER_VERSION,
  BlockIntakeError,
  type ApprovalKind,
  type BlockApproval,
  type BlockEntry,
  type BlockExecution,
  type BlockIntakeErrorCode,
  type BlockPreview,
  type BlockRow,
  type BlockStartResult,
  type BlockStatus,
  type BlockTaskRow,
  type VerdictCriterion,
  type VerdictReason,
  type VerdictRow,
} from './types.js'

export {
  BLOCK_LEDGER_DIR_ENV,
  BLOCKS_FILE,
  VERDICTS_FILE,
  blockLedgerDir,
  blocksFile,
  verdictsFile,
  type BlockLedgerOptions,
} from './paths.js'

export {
  appendBlockRow,
  appendVerdictRow,
  canonicalJson,
  findBlockBySplit,
  getBlockRow,
  readBlockRows,
  readVerdictRows,
  rowHashOf,
  sha256Hex,
  verdictsFor,
  type BlockRowsRead,
  type BlockStoreOptions,
  type SkippedLedgerLine,
  type VerdictRowsRead,
} from './store.js'

export {
  canonicalDirectory,
  normalizeSplit,
  previewBlocks,
  previewById,
  resetPreviews,
  splitHashOf,
  startBlock,
  type BlockEntryInput,
  type BlockSplit,
  type NormalizedBlock,
  type PreviewInput,
  type StartInput,
  type StoredPreview,
} from './preview.js'

export { isApproveAnswer } from './approval.js'
