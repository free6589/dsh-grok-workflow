/**
 * Truncation detection for a child run that was cut off mid-stream.
 *
 * Why this module exists (subagent resume): a child can die in three ways the
 * restore policy cannot see — the turn closed with `reason.kind=error` (or the
 * stream's `finish` chunk carried `reason.kind=error`), the reasoning stream's
 * own indexes repeat or reverse (the transcript was assembled from a cut
 * stream), or the engine said `completed` while the payload is visibly
 * incomplete (a `stop`-false-normal: missing structured result, unclosed code
 * fence or JSON container, or an explicit truncation marker at the tail).
 *
 * This module is pure, synchronous and offline: it folds one child's terminal
 * facts into a `TruncationVerdict`. A verdict of `truncated: true` names one
 * of the three classes and the evidence that decided it; `truncated: false`
 * carries a one-line reason, never an empty evidence list. The continuation
 * planner (`./continuation.js`) turns the verdict into `interrupted` +
 * `redrive` — a cut task is re-driven, never replanned.
 *
 * Two limits are deliberate, and both are honest rather than convenient:
 *
 * - Bounded reads only. The payload tail window (`TRUNCATION_LIMITS.scanChars`)
 *   and the event tail window (`TRUNCATION_LIMITS.scanEvents`) cap every scan,
 *   so a very long answer stays cheap and deterministic. A cut outside the
 *   window is not named — the detector says what it proved, not what it
 *   guessed.
 * - One cause per verdict. The engine's own word about the turn (`turn-error`)
 *   outranks a structural symptom inside the stream, and both outrank the
 *   payload heuristics, because a payload rule can only guess at intent while
 *   a `turn/end` reason is a recorded fact. The first class that fires wins.
 *
 * @module dsh-grok-workflow/resume-truncation
 */
import type { ResumeEvidence } from './validator.js';
/** The three truncation classes, in detection priority order. */
export declare const TRUNCATION_KINDS: readonly ["turn-error", "reasoning-index-anomaly", "stop-false-normal"];
/** One of the three ways a child run is cut off. */
export type TruncationKind = (typeof TRUNCATION_KINDS)[number];
/** Bounded-scan limits: every read stays inside these windows. */
export declare const TRUNCATION_LIMITS: {
    /** Payload tail characters inspected by the payload rules. */
    readonly scanChars: 4000;
    /** Child-log events folded into the log facts, oldest first. */
    readonly scanEvents: 400;
    /** Longest one-line detail a verdict carries. */
    readonly detailChars: 200;
};
/** A provider failure the turn (or its stream) named. */
export interface TruncationFailure {
    message?: string;
    code?: string;
}
/** The terminal facts of one child run, plus its own committed log. */
export interface TruncationSignal {
    /** The engine's stop word for the child (`completed`, `error`, …). */
    stopReason?: string;
    /** The child's text payload, when it produced one. */
    output?: string;
    /** The child's structured result, when the caller required one. */
    structured?: unknown;
    /**
     * Whether this child was supposed to submit a structured result. Defaults to
     * `false`: a caller that never asked for one must not have its plain-text
     * answer read as a missing form.
     */
    requireStructured?: boolean;
    /** The provider failure recorded for the turn, when the log named one. */
    failure?: TruncationFailure;
    /** The child's committed events (`turn/end`, `assistant/attempt`, …). */
    events?: readonly unknown[];
}
/** What detection concluded, with the evidence that decided it. */
export interface TruncationVerdict {
    truncated: boolean;
    /** Present exactly when `truncated` is true. */
    kind?: TruncationKind;
    /** One bounded line a report or a log can print verbatim. */
    detail: string;
    /** The facts the verdict rests on; empty when nothing was truncated. */
    evidence: ResumeEvidence[];
}
/** Every truncation class is re-driven, never replanned: the work was cut, not wrong. */
export declare const TRUNCATION_STATUS = "interrupted";
/** Whether a value is one of the three truncation classes. */
export declare function isTruncationKind(value: unknown): value is TruncationKind;
/**
 * Decide whether one child run was cut off, and in which of the three known ways.
 *
 * The order is deliberate: the engine's own word about the turn (`turn-error`)
 * outranks a structural symptom inside the stream, and both outrank the payload
 * heuristics, because a payload rule can only guess at intent while a `turn/end`
 * reason is a recorded fact. The first class that fires wins and the remaining
 * ones are not consulted — a verdict names one cause, not a pile.
 * @param signal - the terminal facts and the child's own log.
 * @returns The verdict; `truncated: false` with a one-line reason when nothing was cut.
 */
export declare function detectTruncation(signal: TruncationSignal): TruncationVerdict;
//# sourceMappingURL=truncation.d.ts.map