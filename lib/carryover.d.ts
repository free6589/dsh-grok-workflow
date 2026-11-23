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
    /** Maximum task rows read out of one round. */
    readonly tasks: 32;
};
/**
 * Budget for the L1 inheritance summary (Q2), kept physically separate from the
 * conversation digest above: the two never compete for characters, so a long
 * conversation cannot squeeze out the "what is already done" list that a steering
 * round depends on.
 */
export declare const INHERITANCE_LIMITS: {
    /** Maximum characters of one rendered inheritance summary. */
    readonly chars: 8000;
    /** Maximum characters of one task's carried conclusion. */
    readonly taskChars: 2000;
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
    /**
     * Per-task rows of that round's report (v0.13). This is what an inheritance
     * decision is made from: a task that verified must not be redone, and a task
     * that failed must not be silently dropped. Absent on a round whose report
     * carried no task rows (an older report, or a hand-built fixture).
     */
    tasks?: CarryoverTaskRow[];
}
/** One task row as an earlier round's rendered report names it. */
export interface CarryoverTaskRow {
    id: string;
    /** `verified` / `failed` / `blocked`, exactly as the report worded it. */
    status: string;
    title: string;
    /** The row's own one-line reason, when the report carried one. */
    conclusion?: string;
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
 * answer → locators". When the budget runs out the renderer stops and keeps what
 * it already wrote: wholly dropped rounds are named by an explicit truncation
 * marker, and lines dropped *inside* a kept round by a `+N more item(s) in this
 * round` marker as that round's last line — never a silent cut, and never an
 * over-budget string.
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
/**
 * One inheritance decision for one task (L1 / Q2).
 *
 * `retain` — verified before and still wanted, so the work is not redone.
 * `redrive` — did not verify (failed or blocked), so a new generation runs it.
 * `reverify` — verified before, but this round changed something it depends on, so
 * the verifier runs again without redoing the work.
 * `replan` — the requirement itself changed, so the planner re-arranges it.
 */
export type ResumeKind = 'retain' | 'redrive' | 'reverify' | 'replan';
/** One decision, with the reason a reader (and the report) can audit. */
export interface ResumeDecision {
    taskId: string;
    decision: ResumeKind;
    /**
     * Evidence generation. The newest round is 1; a redriven task is one generation
     * further, which is what keeps an older round's late verdict from being read as
     * this round's result.
     */
    generation: number;
    reason: string;
    /**
     * Requirement fields this round changed, named on a `replan` decision (S6: the
     * planner gets a reason *and* the fields it must re-arrange around). Empty on
     * every other decision: retain/redrive/reverify are auditable from the task row
     * alone, and inventing a field list there would claim a change nobody made.
     */
    changedFields: string[];
}
/** Options for {@link resumeDecisions}. */
export interface ResumeOptions {
    /** The requirement changed: every inherited task is re-planned. */
    replan?: boolean;
    /** Task ids whose inputs this round changed: verify them again. */
    reverify?: readonly string[];
    /** Requirement fields this round changed, quoted on every `replan` decision. */
    changedFields?: readonly string[];
}
/**
 * Decide what a new round inherits from earlier rounds.
 *
 * Only the newest round that names a task decides its fate: an older round's row for
 * the same id is dropped, which is the generation guard in its simplest form — a
 * stale "verified" can never outvote a newer "failed", and vice versa. Tasks are
 * bounded and de-duplicated, so a session with many rounds still yields one row per
 * task.
 * @param rounds - compiled rounds, newest first.
 * @param options - replan / reverify inputs from the caller.
 * @returns one decision per inherited task, newest round first.
 */
export declare function resumeDecisions(rounds: readonly CarryoverRound[], options?: ResumeOptions): ResumeDecision[];
/** Header of the rendered inheritance summary. */
export declare const INHERITANCE_HEADER = "INHERITED WORK FROM EARLIER ROUNDS (verified work is carried forward, not redone):";
/**
 * Stable opening words of {@link INHERITANCE_HEADER}.
 *
 * The generated script and `src/history.ts` both ask "does this objective already
 * carry the inherited-work block?" by searching for this prefix, so it is exported
 * and pinned by test instead of being retyped in two places.
 */
export declare const INHERITANCE_PREFIX = "INHERITED WORK FROM EARLIER ROUNDS";
/**
 * Render the L1 inheritance summary within its own budget (Q2).
 *
 * Three rules, all pinned by tests:
 *
 * 1. **The verified list survives.** Decision lines are written oldest round first,
 *    and the whole list is what the 8K budget is sized for: the engine's task cap is
 *    100, and the compact rendering fits all 100 verified lines inside
 *    {@link INHERITANCE_LIMITS.chars}. So at the real maximum nothing is dropped.
 * 2. **Compress before you drop.** A full line (`Round -1 retain (generation 1): …`)
 *    is tried first; when the full form overflows, every line is re-rendered in the
 *    compact form (`R-1 retain g1 …`) before a single line is given up. Dropping is
 *    the last resort, and when it happens it is strictly oldest-first — the order the
 *    reader needs, since the newest decisions are the ones this round acts on.
 * 3. **Never over budget, never a sliced marker.** The `[truncated: …]` line is
 *    reserved *before* lines are packed, so the result either states its own gap in
 *    full sentences or is under budget with nothing dropped — no silent gap and no
 *    half-written marker.
 *
 * @param rounds - compiled rounds, newest first.
 * @param bounds - character budget (defaults to {@link INHERITANCE_LIMITS.chars}).
 * @param options - replan / reverify inputs, forwarded to {@link resumeDecisions}.
 * @returns the summary, or an empty string when there is nothing to inherit.
 */
export declare function buildInheritanceDigest(rounds: readonly CarryoverRound[], bounds?: {
    chars?: number;
}, options?: ResumeOptions): string;
/**
 * The inheritance summary for one session.
 * @param session - the session that owns the earlier rounds; `undefined` is legal.
 * @param bounds - character budget.
 * @param options - replan / reverify inputs.
 * @returns the summary (empty when there is no prior task row).
 */
export declare function inheritanceForSession(session: Session | undefined, bounds?: {
    chars?: number;
}, options?: ResumeOptions): string;
//# sourceMappingURL=carryover.d.ts.map