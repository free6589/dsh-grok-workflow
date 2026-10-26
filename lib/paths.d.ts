/**
 * Write-path conflict detection for parallel tasks (U-4, D-009).
 *
 * The workflow engine gives every child the **same** working directory (E-1x: there
 * is no per-child `cwd`), so two tasks that write the same file can corrupt each
 * other. The plan therefore declares `writesPaths` per task, and the scheduler
 * serializes overlapping tasks while keeping the rest parallel.
 *
 * Three states matter and are deliberately distinct:
 *
 * | declaration | meaning | scheduling |
 * | --- | --- | --- |
 * | `['src/a.ts']` | known writes | parallel with tasks whose paths do not overlap |
 * | `[]` | declares it writes nothing | parallel with everything |
 * | absent / invalid | unknown | treated as conflicting (conservative) |
 *
 * A planner that never emits the field at all leaves every task unknown; in that
 * case alone the scheduler keeps the ordinary `maxConcurrency` rule, because
 * serializing everything would be a pure slowdown with no information behind it
 * (documented trade-off, ROADMAP §11).
 */
/** Longest single path accepted from a plan, and the most paths per task. */
export declare const WRITE_PATH_LIMITS: {
    readonly items: 16;
    readonly chars: 300;
    /** How many distinct paths one task may hold; a plan is rejected above this. */
    readonly total: 64;
};
/**
 * Normalize one declared path for comparison.
 *
 * Normalization is lexical only: backslashes become separators, `.` segments
 * vanish, `..` pops the previous segment, repeated and trailing separators go
 * away, and the result is lowercased. Nothing touches the filesystem, so a path
 * that does not exist yet still compares correctly, and case-insensitive
 * filesystems cannot hide an overlap behind a difference in case (the same
 * comparison is used on case-sensitive filesystems, which can only serialize
 * *more*, never less).
 * @param raw - declared path.
 * @returns The normal form, or `undefined` when nothing usable remains (which the
 *   caller must treat as "unknown") — except `''`, which is returned for the tree
 *   root, a real location that overlaps everything.
 */
export declare function normalizeWritePath(raw: string): string | undefined;
/**
 * Whether two normalized paths denote the same file or a directory prefix of one
 * another.
 *
 * Prefix matching is segment-wise, so `/a/bc` does not overlap `/a/b`. A root
 * path (`/` or `.`) overlaps everything, because it is every other path's prefix.
 * @param left - normalized path.
 * @param right - normalized path.
 * @returns True when the two tasks must not run at the same time.
 */
export declare function pathsOverlap(left: string, right: string): boolean;
/**
 * Normalize one task's declaration.
 * @param raw - the plan value, of unknown shape.
 * @returns `undefined` for unknown/invalid, `[]` for "writes nothing", otherwise
 *   the deduplicated normal paths.
 */
export declare function normalizeWritesPaths(raw: unknown): string[] | undefined;
/**
 * Whether two tasks may not run at the same time.
 * @param left - one task's declaration (`undefined` = unknown).
 * @param right - the other task's declaration.
 * @returns True when the pair must be serialized.
 */
export declare function tasksConflict(left: readonly string[] | undefined, right: readonly string[] | undefined): boolean;
/**
 * Whether a plan carries any usable declaration at all.
 *
 * When it does not, the scheduler keeps the ordinary concurrency rule: with no
 * information, serializing every task would only cost time (see the module note).
 * @param declarations - every task's declaration, in plan order.
 * @returns True when at least one task declared a known path.
 */
export declare function hasDeclaredPaths(declarations: readonly (readonly string[] | undefined)[]): boolean;
//# sourceMappingURL=paths.d.ts.map