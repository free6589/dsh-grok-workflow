/**
 * The block-intake ledger: shapes and bounds.
 *
 * A "block intake" is one user-approved split of an objective into 1..3 blocks.
 * The ledger is append-only and lives next to the task board
 * (`$DSH_HOME/taskboards/grok-workflow`), in three files:
 *
 * - `blocks.jsonl` — one line per *version* of one intake row. Re-reading the
 *   same row id later appends a higher `version`; nothing is ever rewritten in
 *   place, so "who accepted what, when" survives every restart.
 * - `verdicts.jsonl` — one line per supervisor verdict. Append-only, never
 *   updated, never deleted: a veto is a fact about an attempt, not a mutable
 *   status.
 * - `heartbeats.jsonl` — one line per heartbeat delivery observed on a session
 *   that still owes block work (written by `./brakes.ts`, which also owns the
 *   file's name and reader; capped at `HEARTBEAT_OBSERVATION_LIMIT` = 200 lines
 *   because a beat is not a decision). It is kept out of the other two on
 *   purpose: `verdicts.jsonl` records judgements, and a beat is not one, while a
 *   `blocks.jsonl` version slot is capped at `versionsPerBlock` (20), so charging
 *   heartbeats against it would retire a real block after 20 beats.
 *
 * Every row carries a `rowHash` (block rows) so a hand-edited or torn line is
 * detectable, and the reader skips such a line instead of failing the whole
 * ledger (see `./store.ts`).
 *
 * This module holds no logic — only the vocabulary the store, the preview, and
 * the tool layer share.
 */

/** Ledger schema tag; a row carrying anything else is not this ledger's row. */
export const BLOCK_LEDGER_VERSION = 1

/**
 * Hard bounds for one intake. They exist so a malformed or hostile preview
 * cannot make an unbounded ledger row, an unbounded prompt, or an unbounded
 * number of live previews.
 */
export const BLOCK_INTAKE_LIMITS = {
  /** Blocks one preview may hold. */
  blocksPerPreview: 3,
  /** How long a preview stays startable. */
  previewTtlMs: 600_000,
  /** Live previews remembered per session; the oldest is dropped first. */
  previewsPerSession: 20,
  /** Appended versions per block id before the ledger refuses more. */
  versionsPerBlock: 20,
  titleChars: 120,
  objectiveChars: 2_000,
  deliverableChars: 2_000,
  criteriaPerBlock: 8,
  criterionChars: 300,
  writesPathsPerBlock: 16,
  pathChars: 300,
  quoteChars: 2_000,
  ownerChars: 80,
} as const

/**
 * What kind of approval let this intake through.
 *
 * The distinction is kept because "the user said it in this session" and "a
 * policy allowed it" are different facts about the same row, and a later audit
 * has to be able to tell them apart.
 */
export type ApprovalKind = 'preview' | 'user' | 'request' | 'operator' | 'policy'

/** One recorded approval: who/what, the verbatim words, and when. */
export interface BlockApproval {
  kind: ApprovalKind
  /** The user's own words, verbatim — this is what `startBlock` matches. */
  quote: string
  /** ISO timestamp of the approval. */
  at: string
  sourceMessageId?: string
}

/** Lifecycle of one block inside an intake row. */
export type BlockStatus = 'open' | 'vetoed' | 'accepted'

/** How one block runs: a dispatcher owns it, or a workflow script does. */
export type BlockExecution = 'foreman' | 'workflow'

/** One task the dispatcher (or the workflow) creates for a block. */
export interface BlockTaskRow {
  id: string
  title: string
  objective: string
  acceptanceCriteria: string[]
  writesPaths: string[]
}

/** One block of an approved intake, as it stands in the ledger. */
export interface BlockEntry {
  /** Block-local id, `blk-1`.. — unique inside this row, not globally. */
  id: string
  title: string
  objective: string
  deliverable: string
  acceptance: string[]
  writesPaths: string[]
  /** Titles of other blocks in the same split this block waits on. */
  dependsOn: string[]
  execution: BlockExecution
  /** Subagent name for `workflow` blocks; absent for `foreman` blocks. */
  owner?: string
  status: BlockStatus
  planId?: string
  tasks: BlockTaskRow[]
  runId?: string
  checkpoint?: string
}

/**
 * One version of one intake row.
 *
 * `splitHash` ties the row to the exact split the user previewed and approved:
 * a row whose hash does not match what is being started cannot exist, because
 * `startBlock` refuses the mismatch before writing.
 */
export interface BlockRow {
  v: 1
  /** Row id (random); stable across every appended version of this row. */
  id: string
  sessionId: string
  objective: string
  splitHash: string
  approval: BlockApproval
  blocks: BlockEntry[]
  /**
   * The verification switches the user set when the block was ordered
   * (`grok_open_block`'s `verify`), carried on the row so a resume after a
   * restart reads back the same policy instead of letting the model re-declare
   * it at hand-off time.
   *
   * It is deliberately not part of `splitHash` and absent (not `{}`) when the
   * caller said nothing, so a row written before this field existed stays
   * byte-identical.
   */
  verify?: { blockSupervisor?: boolean }
  /** 1 for the first line of this id, +1 for every later line. */
  version: number
  createdAt: string
  updatedAt: string
  /** sha-256 of the canonical JSON of this row without `rowHash`. */
  rowHash: string
}

/** What the user is shown before anything is written. */
export interface BlockPreview {
  previewId: string
  splitHash: string
  /** Plain text for the user: one block after another, ending with the prompt. */
  render: string
  warnings: string[]
  /** A preview is never self-approving; the field is a literal `true`. */
  requiresUserApproval: true
  expiresAt: string
}

/** What `startBlock` hands back to the caller (and to the dispatcher). */
export interface BlockStartResult {
  blockId: string
  status: BlockStatus
  ledgerPath: string
  /** One plain-text line describing the dispatch; never JSON. */
  dispatchEnvelope: string
  /** True when an existing row for the same split was returned instead of a new one. */
  reused: boolean
}

/** Machine-readable failure reasons; `startBlock`/the store throw only these. */
export type BlockIntakeErrorCode =
  | 'approval-required'
  | 'not-found'
  | 'not-approval'
  | 'split-changed'
  | 'preview-expired'
  | 'version-limit'
  | 'invalid'

/** The one error type of this subsystem, with a stable `code`. */
export class BlockIntakeError extends Error {
  readonly code: BlockIntakeErrorCode

  constructor(code: BlockIntakeErrorCode, message: string) {
    super(message)
    this.name = 'BlockIntakeError'
    this.code = code
  }
}

/** One acceptance criterion and whether the supervisor saw it met. */
export interface VerdictCriterion {
  text: string
  met: boolean
  evidence: string[]
}

/** One reason a supervisor gave for a failed criterion (or an override). */
export interface VerdictReason {
  criterion: string
  evidence: string
  why: string
}

/**
 * One supervisor verdict on one attempt of one block.
 *
 * Append-only: a later attempt appends a new row with a higher `attempt`; the
 * earlier rows stay exactly as written, because a veto that was overridden is
 * still part of the record.
 */
export interface VerdictRow {
  v: 1
  verdictId: string
  blockId: string
  attempt: number
  kind: 'supervisor'
  route: string
  outcome: 'pass' | 'veto'
  criteria: VerdictCriterion[]
  reasons: VerdictReason[]
  evidenceHash: string
  at: string
  by: 'plugin:block-supervisor'
  override?: { who: string; why: string }
}
