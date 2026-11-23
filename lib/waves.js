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
import { normalizeWritesPaths, tasksConflict } from './paths.js';
/** Maximum waves a plan may declare. The script enforces the same number. */
export const WAVE_LIMIT = 8;
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
export function singleWaveCause(tasks, waveCount) {
    const waves = waveCount === undefined ? 1 : Math.max(1, Math.trunc(waveCount));
    if (waves > 1)
        return undefined;
    if (tasks.length <= 1)
        return 'single-task';
    if (tasks.some(task => (task.dependsOn ?? []).length > 0))
        return 'dependency-chain';
    // An undeclared path set (`null`) may write anything, so two such tasks cannot be
    // assumed independent — the scheduler serializes them for the same reason.
    const unknown = tasks.filter(task => task.writesPaths === null);
    if (unknown.length > 1)
        return 'write-overlap';
    for (let i = 0; i < tasks.length; i += 1) {
        for (let j = i + 1; j < tasks.length; j += 1) {
            const left = tasks[i].writesPaths;
            const right = tasks[j].writesPaths;
            if (left === null || right === null)
                return 'write-overlap';
            // Report-side overlap uses the same rule as the scheduler (src/paths.ts):
            // declared lists are normalized first, and a declaration that normalizes to
            // nothing usable (`undefined`) is "unknown" — it conflicts with everything,
            // the same conservative treatment the scheduler gives it. Only `[]` (writes
            // nothing) is parallel-safe.
            const normalLeft = normalizeWritesPaths(left);
            const normalRight = normalizeWritesPaths(right);
            if (normalLeft === undefined || normalRight === undefined)
                return 'write-overlap';
            if (tasksConflict(normalLeft, normalRight))
                return 'write-overlap';
        }
    }
    return 'planned';
}
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
export function singleWaveReason(cause, language = 'zh') {
    switch (cause) {
        case 'single-task':
            return language === 'en'
                ? 'Single wave because the objective is one indivisible unit: splitting it would only add a hand-off.'
                : '单线执行，因为这件事本身无法再拆：再拆只会多一道交接。';
        case 'dependency-chain':
            return language === 'en'
                ? 'Single wave because the tasks declare dependencies on earlier work, so they have to run in order.'
                : '单线执行，因为任务之间声明了依赖，必须先做的做完才能接着做。';
        case 'write-overlap':
            return language === 'en'
                ? 'Single wave because the tasks write the same paths in one shared directory, so running them together would corrupt each other\'s work.'
                : '单线执行，因为多个任务要在同一个目录里写同一批文件，同时跑会互相覆盖。';
        case 'planned':
        default:
            return language === 'en'
                ? 'Single wave because the planner found no honest independent split for this objective.'
                : '单线执行，因为规划时找不到既独立又诚实的拆法。';
    }
}
/**
 * The sentence for a plan, or undefined when it has nothing to explain.
 * @param tasks - plan tasks, in plan order.
 * @param waveCount - waves the plan declares.
 * @param language - copy language.
 * @returns the sentence, or undefined for a multi-wave plan.
 */
export function planWaveReason(tasks, waveCount, language = 'zh') {
    const cause = singleWaveCause(tasks, waveCount);
    return cause === undefined ? undefined : singleWaveReason(cause, language);
}
//# sourceMappingURL=waves.js.map