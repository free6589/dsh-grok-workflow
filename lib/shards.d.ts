/**
 * How a planner-failure fallback packs the objective into tasks.
 *
 * A planner failure leaves the objective itself as the only work item, so it has
 * to reach the workers whole. One task cannot carry it once it is longer than
 * `TASK_LIMITS.taskTextChars`, and the task count cannot depend on `maxTasks`
 * either, so the objective is split into contiguous segments that each respect
 * the per-task bound.
 *
 * Three properties are load-bearing here, and each one is pinned by a test:
 *
 * 1. **Nothing is lost.** Concatenating the segments reproduces the objective
 *    byte for byte: the split never trims, normalizes, re-orders, or drops a
 *    character, and never cuts a surrogate pair in half.
 * 2. **No degenerate segments.** The segments are as close to equal as the bound
 *    allows, so a 4,001-character objective becomes two ~2,000-character
 *    segments rather than a 4,000-character one plus a one-character one.
 * 3. **Boundaries follow the text.** A cut that lands within a small window of a
 *    paragraph break, a sentence end, or a word break is moved onto it, so a
 *    segment ends where the text already ends instead of mid-sentence. A single
 *    unbroken run of characters is cut at the balanced offset, because there is
 *    no structure to preserve.
 *
 * The generated workflow script cannot import host code, so `shardsSource()`
 * renders this one implementation into script-realm JS. Host validation
 * (`src/report.ts`) and the script therefore share a single algorithm instead of
 * two copies that could drift apart: the report validator rejects any fallback
 * plan whose segments are not exactly what this function produces for the same
 * objective.
 *
 * Everything below must stay self-contained (no module-level helpers, no
 * optional chaining, no template literals) because the function's own source is
 * injected into the script realm.
 */
export declare function splitObjective(value: string, maxChars: number): string[];
/**
 * How many segments `splitObjective` produces for this objective.
 *
 * The count is a property of the splitter, not a formula: a boundary that backs
 * off a surrogate pair (or a break-aligned cut) can add a segment, so
 * `ceil(chars / taskTextChars)` is only a lower bound. Both the request builder
 * (child-agent budget) and host validation (task cap) read it from here.
 */
export declare function shardCountFor(value: string, maxChars: number): number;
/** Render the splitter above into script-realm JS source. */
export declare function shardsSource(): string;
//# sourceMappingURL=shards.d.ts.map