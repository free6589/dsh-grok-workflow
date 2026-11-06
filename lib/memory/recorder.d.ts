/**
 * Wiring between the workflow engine's events and the durable memory archive.
 *
 * The rule this file exists to enforce: **a round that finished is recorded when
 * it finishes**, from the event that says so, not from a session-end hook and not
 * from an operator remembering to update `STATE.md`. Three seams carry that rule:
 *
 * | seam | when it fires | what it archives |
 * | --- | --- | --- |
 * | `workflow/agent-end` | one `agent()` call settles | that child's own result |
 * | `workflow/end` (folded into the run's `finally`) | the run settles | the round verdict |
 * | `round()` | the caller validated the report | the round's finding, status and evidence |
 *
 * Two properties are deliberate:
 *
 * - **It never affects the run.** Archiving is off the critical path: no throw
 *   escapes this module, and a disk that refuses the write costs a warning.
 * - **It only records runs this recorder adopted.** The engine's events are
 *   process-wide, so a concurrent run (another session, or a nested workflow in a
 *   child) shares the bus. Events for a run this recorder did not adopt are
 *   buffered while the run is still being started (the engine can emit before
 *   `start()` resolves) and dropped otherwise, so one round can never be filed
 *   under another round's identity.
 *
 * @module dsh-grok-workflow/memory/recorder
 */
import type { Context } from '@deepseek-ai/cordis';
import type { WorkflowAgentEndInfo, WorkflowAgentInfo, WorkflowAgentOutcome } from '@deepseek-ai/dsh-workflow';
import type { WorkflowReport } from '../types.js';
/** Warning sink; the recorder never throws, so this is its only channel. */
export interface ArchiveLogger {
    warn(message: string): void;
}
/** Member identity as the engine reports it at `agent-start`. */
export interface ArchiveMemberStart {
    seq: number;
    label: string;
    phase?: string;
    childId?: string;
}
/** Settlement as the engine reports it at `agent-end`. */
export interface ArchiveMemberEnd {
    seq: number;
    outcome: WorkflowAgentOutcome;
}
/** One round's verdict, supplied by the caller that validated the report. */
export interface RoundArchiveInput {
    /** Engine run id; also the entry's de-duplication identity. */
    runId: string;
    /** Workflow name for the entry label. */
    runName?: string;
    /** Session that owned the run. */
    sessionId?: string;
    /** Round objective (redacted and bounded by the archive). */
    objective: string;
    /** Report status: `completed` / `partial` / `failed`. */
    status?: string;
    /** Why the round stopped, when it did not finish cleanly. */
    cause?: string;
    /** The finding a later session needs: the answer, or why there is none. */
    summary: string;
    /** File/URL locators the finding rested on. */
    evidence?: string[];
    /** Round turn number, when the caller knows it. */
    turn?: number;
}
/** The archive seam one run uses. Every method is safe to call and never throws. */
export interface MemoryArchiver {
    /** Adopt a run, flushing events that arrived before `start()` resolved. */
    adopt(runId: string, runName?: string): void;
    /** Record one child's identity (kept for its `agent-end`). */
    agentStart(runId: string, member: ArchiveMemberStart): void;
    /** Record one child's finished result, at the moment the child settles. */
    agentEnd(runId: string, member: ArchiveMemberEnd): void;
    /** Record the round verdict, at the moment the run settles; true when written. */
    round(input: RoundArchiveInput): boolean;
    /** Stop recording and drop anything buffered. */
    dispose(): void;
}
/** What one recorder needs from its host. */
export interface ArchiveRecorderOptions {
    /** Context used to read a settled child's own transcript; absent in bare tests. */
    ctx?: Context;
    /** Session that owns the runs this recorder sees. */
    sessionId?: string;
    /** Archive directory override (tests, e2e isolation). */
    dir?: string;
    logger: ArchiveLogger;
    /** Clock injection for deterministic ordering in tests. */
    now?: () => number;
}
/**
 * Read the last assistant text a child session produced.
 *
 * A child's result is not part of the `agent-end` payload (the engine reports the
 * identity and the outcome only), so the text is read from the child's own
 * transcript: `ctx.sessions.get(childId)` returns the live session, and the last
 * `assistant/message` event is what the child answered. Everything here is
 * defensive — a runtime without a session store, an unknown child id, a restored
 * event of an unexpected shape all read as "no text", and the entry is then
 * written with the outcome word alone rather than being skipped.
 * @param ctx - plugin context (may expose `sessions`).
 * @param childId - child session id from `agent-start`, when present.
 * @returns The child's final assistant text, or `undefined`.
 */
export declare function childResultText(ctx: Context | undefined, childId: string | undefined): string | undefined;
/** What one settled child left behind: its prose answer, its submitted result, its locators. */
export interface ChildFinding {
    /** The last assistant text the child produced, when it produced any. */
    text?: string;
    /** The child's structured submission, reduced to one readable line. */
    submitted?: string;
    /** File/URL locators the child's own submission rested on. */
    evidence: string[];
}
/**
 * Read what a settled child left in its own transcript.
 *
 * Two sources, in this order, because the engine reports a child's identity and
 * outcome at `agent-end` but never its result:
 *
 * 1. **Assistant text** — what the child said, when it answered in prose.
 * 2. **Its structured submission** — a structured child (worker or verifier)
 *    answers by calling a tool whose arguments carry the plugin's own result
 *    schema (`summary` for an execution result, `verdict` + `criteria` for a
 *    verification). Measured on this machine: a real child session's last
 *    `assistant/message` carries only `reasoning` and `tool-call` parts, so
 *    without this second source every child entry would say "no result text was
 *    readable" and a later round could see that a child ran but not what it found.
 *
 * Everything is defensive: a context with no `sessions` service, a missing child,
 * an unparsable argument string all degrade to "nothing read", never to a throw.
 * @param ctx - plugin context (may expose `sessions`).
 * @param childId - child session id from `agent-start`, when present.
 * @returns The readable finding; every field optional.
 */
export declare function childFinding(ctx: Context | undefined, childId: string | undefined, captured?: unknown): ChildFinding;
/**
 * Create the memory archiver for one run.
 * @param options - context, session, archive directory, logger and clock.
 * @returns A recorder whose every method is contained (never throws).
 */
export declare function createMemoryArchiver(options: ArchiveRecorderOptions): MemoryArchiver;
/** Narrow an engine `agent-start` payload to what the archive keeps. */
export declare function memberFromStart(info: WorkflowAgentInfo): ArchiveMemberStart;
/** Narrow an engine `agent-end` payload to what the archive keeps. */
export declare function memberFromEnd(info: WorkflowAgentEndInfo): ArchiveMemberEnd;
/**
 * Build the one-line-plus-details summary a round entry carries.
 *
 * The archive's job is to answer "what has already been researched?" without the
 * transcript, so the summary is built from the *validated* report this plugin
 * wrote — never from a model paraphrase: the status, the verified-task count, the
 * confirmed criteria count, the answer excerpt when synthesis produced one, and
 * one line per task so a reader can see which part of the goal was actually
 * covered and which was not.
 * @param report - the validated report, when the run produced one.
 * @param cause - why the round stopped, when it did not finish cleanly.
 * @returns A compact multi-part summary (clamped again by the archive on write).
 */
export declare function roundArchiveSummary(report: WorkflowReport | undefined, cause: string | undefined): string;
/**
 * Collect the locators a round's finding rested on.
 * @param report - the validated report, when the run produced one.
 * @returns Confirmed-evidence strings, bounded by the archive on write.
 */
export declare function roundArchiveEvidence(report: WorkflowReport | undefined): string[];
/**
 * Archive one settled round on the spot, for callers that own no event stream.
 *
 * The front-desk tier (`runSingleCall`) is one `agent()` call in its own run: it has
 * a result but no planner/verifier fan-out, so there is nothing to watch and the
 * round verdict is the whole record. Passing it through this helper keeps the rule
 * identical to the full path — the entry is written before the caller returns, not
 * at session exit.
 * @param input - the round's verdict.
 * @param options - archive directory, logger and clock.
 * @returns True when this call wrote the entry (false for a duplicate or a failure).
 */
export declare function archiveRoundNow(input: RoundArchiveInput, options: ArchiveRecorderOptions): boolean;
//# sourceMappingURL=recorder.d.ts.map