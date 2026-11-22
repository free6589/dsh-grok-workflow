/**
 * Wave bookkeeping shared by the report renderer and the human delivery layer.
 *
 * The wave scheduler itself lives in the generated workflow script (`src/script.ts`),
 * because that is the only place that can see a child call. This module is the host
 * half: the wave ceiling the script also enforces, and the one sentence a single-wave
 * report has to carry (A5).
 *
 * "Single wave" covers two different runs that look alike in a report: a plan with one
 * task (nothing to split) and a plan whose tasks could not run together (a dependency
 * chain, or write paths that overlap in the one shared working directory). Saying only
 * "1 wave" leaves a reader unable to tell a small job from a jammed one, which is why
 * the reason is part of the rendered report instead of a guess a reader has to make.
 */
/** Maximum waves a plan may declare. The script enforces the same number. */
export declare const WAVE_LIMIT = 8;
/** Why a plan is a single wave, as the one sentence a report appends. */
export type SingleWaveCause = 'single-task' | 'dependency-chain' | 'write-overlap' | 'planned';
/** The minimum a task row must expose for {@link singleWaveCause}. */
export interface WaveReasonTask {
    readonly writesPaths: string[] | null;
    readonly dependsOn?: readonly string[];
}
/**
 * Classify why one plan is a single wave.
 *
 * The order matters: one task is a fact about the objective, a declared dependency is
 * a fact about the plan, and an overlap or an unknown path is a fact about the working
 * directory. The first fact that explains it wins, so the sentence names the closest
 * cause instead of the most general one.
 * @param tasks - plan tasks, in plan order.
 * @param waveCount - waves the plan actually has (absent reads as one).
 * @returns the cause, or undefined when the plan really has more than one wave.
 */
export declare function singleWaveCause(tasks: readonly WaveReasonTask[], waveCount: number | undefined): SingleWaveCause | undefined;
/**
 * The one sentence a single-wave report carries, in the reader's language.
 *
 * A one-task plan also gets a sentence, because "we did not split it" is a decision a
 * reader is entitled to see; a multi-wave plan gets nothing (there is nothing to
 * explain).
 * @param cause - result of {@link singleWaveCause}.
 * @param language - copy language.
 * @returns the sentence, without a trailing newline.
 */
export declare function singleWaveReason(cause: SingleWaveCause, language?: 'zh' | 'en'): string;
/**
 * The sentence for a plan, or undefined when it has nothing to explain.
 * @param tasks - plan tasks, in plan order.
 * @param waveCount - waves the plan declares.
 * @param language - copy language.
 * @returns the sentence, or undefined for a multi-wave plan.
 */
export declare function planWaveReason(tasks: readonly WaveReasonTask[], waveCount: number | undefined, language?: 'zh' | 'en'): string | undefined;
//# sourceMappingURL=waves.d.ts.map