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
export function splitObjective(value, maxChars) {
    const limit = Math.max(1, Math.floor(maxChars));
    const segments = [];
    let start = 0;
    function isHighSurrogate(code) {
        return code >= 0xD800 && code <= 0xDBFF;
    }
    function isLowSurrogate(code) {
        return code >= 0xDC00 && code <= 0xDFFF;
    }
    // The offset to cut at, moved left onto the nearest paragraph break, sentence
    // end, or word break. The window is deliberately small: a break far to the
    // left would shrink this segment and inflate the segment count.
    function breakBefore(text, from, to) {
        const window = Math.min(200, Math.floor((to - from) / 4));
        if (window < 1)
            return to;
        let word = -1;
        for (let position = to - 1; position >= to - window && position > from; position -= 1) {
            const character = text.charAt(position);
            if (character === '\n' || '。！？…；;.!?'.indexOf(character) !== -1)
                return position + 1;
            if (word === -1 && character.trim() === '')
                word = position;
        }
        return word === -1 ? to : word + 1;
    }
    while (start < value.length) {
        const remaining = value.length - start;
        const remainingSegments = Math.ceil(remaining / limit);
        // Balanced target: the segments come out as equal as the bound allows, so the
        // tail of the objective is not squeezed into a stub task.
        let end = start + Math.ceil(remaining / remainingSegments);
        if (end < value.length) {
            end = breakBefore(value, start, end);
            // Never cut a surrogate pair in half. The two halves would still rejoin when
            // the segments are concatenated, but one segment would be invalid Unicode on
            // its own and would not survive a UTF-8 round trip.
            if (isHighSurrogate(value.charCodeAt(end - 1)) && isLowSurrogate(value.charCodeAt(end)))
                end -= 1;
            // Guarantee progress even if the two corrections above cancel each other out.
            if (end <= start)
                end = start + 1;
        }
        segments.push(value.slice(start, end));
        start = end;
    }
    return segments;
}
/**
 * How many segments `splitObjective` produces for this objective.
 *
 * The count is a property of the splitter, not a formula: a boundary that backs
 * off a surrogate pair (or a break-aligned cut) can add a segment, so
 * `ceil(chars / taskTextChars)` is only a lower bound. Both the request builder
 * (child-agent budget) and host validation (task cap) read it from here.
 */
export function shardCountFor(value, maxChars) {
    return splitObjective(value, maxChars).length;
}
/** Render the splitter above into script-realm JS source. */
export function shardsSource() {
    return `const splitObjective = ${splitObjective.toString()};`;
}
//# sourceMappingURL=shards.js.map