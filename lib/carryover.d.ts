/**
 * Bounded cross-round context carry-over.
 *
 * Every workflow round is a fresh set of child agents: the planner, the workers,
 * the verifiers and the synthesizer of round N have no memory of round N-1. The
 * durable transcript does keep something — the validated report this plugin
 * itself wrote for every earlier round — but a fresh child never sees it, and a
 * child that is told nothing invents the worst possible answer: "I cannot see the
 * earlier research, please repeat it" (observed in
 * `session-7e079b80-1a57-451b-aca4-795d24a14c4d`).
 *
 * This module compiles the earlier rounds into one bounded, structured digest:
 *
 * | kept | why |
 * | --- | --- |
 * | round objective and status | what was asked and how far it got |
 * | confirmed criteria and evidence | the research results a follow-up must build on |
 * | incomplete rows (open questions) | what is still missing, so the next round can continue it |
 * | uncertainties | doubts that must not be silently dropped |
 * | final-answer excerpt | the user-facing conclusion of the round |
 * | locators quoted by the evidence | the files a new round can open for full detail |
 *
 * Two properties are non-negotiable and are pinned by `test/carryover.spec.ts`:
 *
 * 1. **Bounded.** The rendered digest never exceeds the caller's budget, and the
 *    caller's budget is itself clamped to {@link CARRYOVER_LIMITS}. A session with
 *    hundreds of rounds therefore cannot grow the prompt without limit. When the
 *    budget runs out the *newest* round survives in full detail and the oldest
 *    rounds are dropped first, with an explicit marker instead of a silent cut.
 * 2. **Honest.** Nothing is invented. A round is compiled only from the report
 *    text this plugin wrote into the session; a transcript with no such report
 *    yields an empty digest, and the prompts then stay exactly as they were
 *    before this module existed.
 *
 * Only *reading* happens here: the reports are already durable session events,
 * so no new record type, archive or storage layout is introduced (memory
 * archiving is a separate task).
 */
import type { Session } from '@deepseek-ai/dsh-session';
/**
 * Hard ceilings for the digest.
 *
 * `chars` is the absolute maximum a rendered digest may occupy. `rounds` is the
 * absolute maximum number of earlier rounds compiled into one digest. Both are
 * clamp targets, not defaults: a caller may ask for less, never for more.
 */
export declare const CARRYOVER_LIMITS: {
    /** Maximum earlier rounds compiled into one digest. */
    readonly rounds: 24;
    /** Maximum characters in one rendered digest. */
    readonly chars: 12000;
    /** Maximum characters of one round objective. */
    readonly objectiveChars: 300;
    /** Maximum characters of one confirmed/incomplete/uncertainty row. */
    readonly itemChars: 240;
    /** Maximum characters of the final-answer excerpt. */
    readonly summaryChars: 400;
    /** Maximum rows per section, so one noisy round cannot crowd out the others. */
    readonly itemsPerSection: 6;
    /** Maximum locators listed per round. */
    readonly locators: 6;
    /** Maximum characters of one locator. */
    readonly locatorChars: 200;
};
/** Budget for one digest; both fields are clamped to {@link CARRYOVER_LIMITS}. */
export interface CarryoverBounds {
    /** Earlier rounds to compile, newest first. */
    rounds: number;
    /** Characters the rendered digest may occupy. */
    chars: number;
}
/**
 * One earlier round, compiled from its report.
 *
 * Strings here are already one-line, redacted and bounded; the type carries no
 * structured report because the source is the rendered report text the plugin
 * wrote into the session (the only durable, model-independent copy).
 */
export interface CarryoverRound {
    /** Final status of that round, or `unknown` when the report did not name one. */
    status: string;
    /** What the round was asked to do. */
    objective: string;
    /** Verified criteria with their evidence: the round's research results. */
    confirmed: string[];
    /** Unfinished rows: the round's open questions. */
    incomplete: string[];
    /** What the round was unsure about. */
    uncertainties: string[];
    /** Final-answer excerpt, when the round produced one. */
    summary?: string;
    /** Files and URLs quoted by the evidence, for on-demand reading. */
    locators: string[];
}
/**
 * Compile one rendered report into a round.
 *
 * @param text - report text, with or without the relay preamble and markers.
 * @returns the compiled round, or `null` when the text carries no report signature.
 */
export declare function parseReportRound(text: string): CarryoverRound | null;
/** Clamp caller bounds to the hard ceilings. Zero means "carry nothing over". */
export declare function clampBounds(bounds: Partial<CarryoverBounds> | undefined): CarryoverBounds;
/**
 * Budget for one session from the configured history knobs.
 *
 * The digest shares the context budget the plugin already exposes (`historyTurns`
 * / `historyChars`): an operator who sets those to zero gets exactly the pre-0.5
 * behaviour, and nobody has to learn a second pair of numbers.
 *
 * @param config - the resolved configuration (or the two knobs alone).
 * @returns the clamped carry-over bounds.
 */
export declare function carryoverBounds(config: {
    historyTurns?: number;
    historyChars?: number;
}): CarryoverBounds;
/**
 * Compile the earlier rounds of one session, newest first.
 *
 * @param session - the session that owns the round; `undefined` is legal.
 * @param bounds - round and character budget (clamped inside).
 * @returns the compiled rounds; an empty list when there is no prior report.
 */
export declare function collectCarryoverRounds(session: Session | undefined, bounds?: Partial<CarryoverBounds>): CarryoverRound[];
/**
 * Render the compiled rounds as one bounded, structured digest.
 *
 * The budget is spent newest-round first and, inside a round, in the order
 * "objective/status → confirmed results → open questions → uncertainties →
 * answer → locators". When the budget runs out the renderer stops, keeps what it
 * already wrote and appends an explicit truncation marker naming how many rounds
 * were dropped — never a silent cut, and never an over-budget string.
 *
 * @param rounds - compiled rounds, newest first.
 * @param bounds - character budget (clamped inside).
 * @returns the digest, or an empty string when there is nothing to carry.
 */
export declare function buildCarryoverDigest(rounds: readonly CarryoverRound[], bounds?: Partial<CarryoverBounds>): string;
/**
 * One session's carry-over digest plus the counts a log line needs.
 *
 * @param session - the session that owns the round; `undefined` is legal.
 * @param bounds - round and character budget (clamped inside).
 * @returns the digest (empty when there is no prior round) and the round count.
 */
export declare function carryoverForSession(session: Session | undefined, bounds?: Partial<CarryoverBounds>): {
    digest: string;
    rounds: number;
};
//# sourceMappingURL=carryover.d.ts.map