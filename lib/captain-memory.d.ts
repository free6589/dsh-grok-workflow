/**
 * The captain's three sheets (队长记忆三叠纸), next to the ledger it already keeps.
 *
 * The plugin already writes the durable ledger (`src/memory/archive.ts`:
 * `archive.jsonl`, one entry per settled round and per child). That sheet answers
 * "what happened" — the short-term progress sheet. Two things a captain needs are
 * not in it:
 *
 * | sheet | file | what it answers | who writes it |
 * | --- | --- | --- | --- |
 * | short-term progress | `archive.jsonl` (existing) | what already happened in this run history | recorder, at every settlement |
 * | long-term profile | `profile.md` (new) | who the user is: standing preferences and rules | the user / operator, through `rememberCaptainProfile` |
 * | experience | `experience.md` (new) | one retrospective line per round | recorder, right after the round entry |
 *
 * Design rules, in the order they constrain the code:
 *
 * 1. **Beside the ledger, not elsewhere.** The directory resolves exactly like the
 *    archive's (`archiveDir`: explicit dir, then `GROK_WORKFLOW_MEMORY_DIR`, then
 *    `$DSH_HOME/memory/grok-workflow`), so a test, a soak and a real operator all
 *    see one location and nothing writes into a live home by accident.
 * 2. **Never fatal.** Reading a missing or unreadable file is "no memory"; writing a
 *    profile or an experience line returns `false` on any fs failure instead of
 *    throwing. Memory is an aid and must never break the run it is recording.
 * 3. **No credentials.** Every line passes through `redactSecrets` before it is
 *    serialised, the same rule the archive follows.
 * 4. **Bounded.** Both sheets are read from the tail and clamped; a sheet that grew
 *    for a year still costs one prompt-sized block. A profile entry longer than the
 *    per-entry bound is refused rather than truncated into a half sentence.
 * 5. **The brief is data, never an instruction.** {@link captainBrief} labels the
 *    three sheets and hands them to the planner as context; it never tells the run
 *    to do anything.
 *
 * @module dsh-grok-workflow/captain-memory
 */
import { type ArchiveOptions } from './memory/archive.js';
/** File names this module owns, inside the archive directory. */
export declare const CAPTAIN_PROFILE_FILE = "profile.md";
export declare const CAPTAIN_EXPERIENCE_FILE = "experience.md";
/** Bounds on the three sheets and on one written line. */
export declare const CAPTAIN_MEMORY_LIMITS: {
    /** Characters kept from the whole profile sheet in one brief. */
    readonly profileChars: 1200;
    /** Characters kept from the whole experience sheet in one brief. */
    readonly experienceChars: 1200;
    /** Characters kept from the short-term progress digest. */
    readonly progressChars: 1200;
    /** Characters kept from one written line (profile or experience). */
    readonly entryChars: 400;
    /** Bytes read from the tail of one sheet. */
    readonly readBytes: number;
    /** Round entries read for the progress sheet. */
    readonly progressEntries: 5;
    /** Characters of the whole rendered brief. */
    readonly briefChars: 2400;
    /** Characters of one profile entry allowed on write (longer is refused). */
    readonly profileWriteChars: 400;
};
/** The three sheets, each already redacted and bounded. */
export interface CaptainMemory {
    /** Long-term user profile, newest last. */
    profile: string;
    /** One retrospective line per round, newest last. */
    experience: string;
    /** Short-term progress: the newest ledger entries. */
    progress: string;
}
/** One round's retrospective, as the recorder supplies it. */
export interface CaptainExperienceInput {
    /** Engine run id; the de-duplication identity of the line. */
    runId: string;
    /** Report status, when the round produced one. */
    status?: string;
    /** The round's objective (already redacted by the caller where it matters). */
    objective?: string;
    /** The finding the round settled on. */
    summary: string;
    /** Evidence locators, used only for a count. */
    evidence?: readonly string[];
    /** Clock injection for deterministic tests. */
    now?: () => number;
}
/** Where the three sheets live; same resolution as the ledger. */
export declare function captainMemoryFiles(options?: ArchiveOptions): {
    dir: string;
    profile: string;
    experience: string;
};
/**
 * Read the three sheets.
 *
 * Never throws: a missing file, an unreadable directory and an empty ledger all
 * read as "nothing remembered yet".
 * @param options - directory override and clock, same shape as the archive's.
 * @returns the three sheets, each redacted and bounded.
 */
export declare function readCaptainMemory(options?: ArchiveOptions): CaptainMemory;
/**
 * Render the three sheets as the plan prompt's memory block.
 * @param memory - the sheets read by {@link readCaptainMemory}.
 * @returns one labelled block, or `''` when nothing is remembered yet (so a first
 *   round's payload stays byte-identical to the pre-memory one).
 */
export declare function captainBrief(memory: CaptainMemory): string;
/**
 * Remember one standing preference or rule about the user.
 *
 * The caller decides what belongs on this sheet (a stated preference, a standing
 * rule, a correction); this function only refuses an empty or oversized entry,
 * redacts it, and appends it. Identical consecutive entries are not written twice.
 * @param text - the preference, in the user's own words where possible.
 * @param options - directory override and clock.
 * @returns true when a new line was written.
 */
export declare function rememberCaptainProfile(text: string, options?: ArchiveOptions): boolean;
/**
 * Append one round's retrospective.
 *
 * Exactly one line per round: the run id is carried at the end of the line and the
 * writer refuses an id already present on the sheet, so a replayed settlement or a
 * plugin that restarted mid-round cannot produce a second retrospective.
 * @param input - the settled round.
 * @param options - directory override and clock.
 * @returns true when a new line was written.
 */
export declare function appendCaptainExperience(input: CaptainExperienceInput, options?: ArchiveOptions): boolean;
//# sourceMappingURL=captain-memory.d.ts.map