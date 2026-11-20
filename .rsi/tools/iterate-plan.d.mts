/**
 * Types for `.rsi/tools/iterate-plan.mjs`.
 *
 * The tool is repository tooling (plain ESM, run by Node without a build), so its types live
 * here rather than in `src/`. `test/iterate-plan.spec.ts` imports the module directly, which
 * makes this declaration file the interface the typecheck actually enforces.
 */

export interface HarnessEnvelope {
  maxConcurrency: number
  hardMaxConcurrency: number
  retries: number
  hardMaxRetries: number
}

export interface HarnessStop {
  blockedStreak: number
  skipStreak: number
  roundCap: number
}

export type HarnessShape = 'single' | 'chain'

export interface HarnessConfig {
  version: number
  totalRounds: number
  shape: HarnessShape
  intervalMinutes: number
  armCapRounds: number
  rowMaxRounds: number
  stop: HarnessStop
  envelope: HarnessEnvelope
}

export interface LoopState {
  reportMax: number
  ledgerMax: number
  used: number
}

export interface PlanArm {
  index: number
  count: number
  rounds: number
  firstRound: number
  lastRound: number
  rrule: string | null
  rruleNote: string | null
}

export interface PlanStopRule {
  code: string
  detail: string
}

export interface IterationPlan {
  kind: 'rsi-iteration-plan'
  shape: HarnessShape
  total: number
  used: number
  reportMax: number
  ledgerMax: number
  remaining: number
  intervalMinutes: number
  guardArgs: string
  envelope: HarnessEnvelope
  status: 'OPEN' | 'EXHAUSTED'
  stop: PlanStopRule[]
  arms: PlanArm[]
  stopCode: string | null
}

export interface PoolItem {
  line: number
  marker: string
  open: boolean
  text: string
}

export declare const HARNESS_FILE: string
export declare const DEFAULT_HARNESS: HarnessConfig
export declare const INVARIANT_ENVELOPE: { maxConcurrency: number; maxRetries: number }
export declare const SHAPES: string[]

export declare function loadHarness(root: string, overrides?: Partial<HarnessConfig>): HarnessConfig
export declare function validateHarness(config: HarnessConfig): HarnessConfig
export declare function readLoopState(root: string): LoopState
export declare function rruleFor(intervalMinutes: number, rounds: number, now: number): string
export declare function armSizes(remaining: number, shape: HarnessShape, cap: number, rowMax: number): number[]
export declare function buildPlan(config: HarnessConfig, state: LoopState, now: number): IterationPlan
export declare function readPool(root: string): { items: PoolItem[]; open: PoolItem[] }
export declare function renderText(plan: IterationPlan): string
export declare function parseArgs(argv: string[]): Record<string, unknown>
export declare function run(
  argv: string[],
  options?: { defaultRoot: string; now?: () => number },
): { code: number; out: string }
