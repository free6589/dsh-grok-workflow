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
export const WRITE_PATH_LIMITS = {
  items: 16,
  chars: 300,
  /** How many distinct paths one task may hold; a plan is rejected above this. */
  total: 64,
} as const

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
export function normalizeWritePath(raw: string): string | undefined {
  const text = raw.trim().replace(/\\/g, '/')
  if (text === '') return undefined
  const absolute = text.startsWith('/')
  const parts: string[] = []
  for (const segment of text.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      // Popping past the declared root keeps the path at the root: `a/../../b`
      // and `../b` both mean "b relative to above the tree", so comparing them as
      // equal is the conservative choice.
      if (parts.length > 0) parts.pop()
      continue
    }
    parts.push(segment.toLowerCase())
  }
  if (parts.length === 0) return absolute ? '/' : '.'
  return (absolute ? '/' : '') + parts.join('/')
}

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
export function pathsOverlap(left: string, right: string): boolean {
  if (left === right) return true
  if (left === '/' || left === '.' || right === '/' || right === '.') return true
  const prefix = (shorter: string, longer: string): boolean => {
    const base = shorter.endsWith('/') ? shorter : `${shorter}/`
    return longer.startsWith(base)
  }
  return prefix(left, right) || prefix(right, left)
}

/**
 * Normalize one task's declaration.
 * @param raw - the plan value, of unknown shape.
 * @returns `undefined` for unknown/invalid, `[]` for "writes nothing", otherwise
 *   the deduplicated normal paths.
 */
export function normalizeWritesPaths(raw: unknown): string[] | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!Array.isArray(raw)) return undefined
  if (raw.length > WRITE_PATH_LIMITS.items) return undefined
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') return undefined
    const trimmed = item.trim()
    if (trimmed.length > WRITE_PATH_LIMITS.chars) return undefined
    if (trimmed === '') continue
    const normalized = normalizeWritePath(trimmed)
    if (normalized === undefined) continue
    if (!out.includes(normalized)) out.push(normalized)
  }
  return out
}

/**
 * Whether two tasks may not run at the same time.
 * @param left - one task's declaration (`undefined` = unknown).
 * @param right - the other task's declaration.
 * @returns True when the pair must be serialized.
 */
export function tasksConflict(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  // Unknown means "could write anything", so it conflicts with every other task —
  // including another unknown one, because two unknown writers can still collide.
  if (left === undefined || right === undefined) return true
  if (left.length === 0 || right.length === 0) return false
  for (const a of left) {
    for (const b of right) {
      if (pathsOverlap(a, b)) return true
    }
  }
  return false
}

/**
 * Whether a plan carries any usable declaration at all.
 *
 * When it does not, the scheduler keeps the ordinary concurrency rule: with no
 * information, serializing every task would only cost time (see the module note).
 * @param declarations - every task's declaration, in plan order.
 * @returns True when at least one task declared a known path.
 */
export function hasDeclaredPaths(declarations: readonly (readonly string[] | undefined)[]): boolean {
  return declarations.some(entry => entry !== undefined)
}
