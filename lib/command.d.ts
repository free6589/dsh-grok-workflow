/**
 * The `/grok [on|off]` slash command: flip the per-session grok-mode toggle.
 *
 * Mounted exactly like `@deepseek-ai/dsh-plan-mode` mounts `/plan`: a lazy
 * `ctx.inject(['commands'], ...)` registration, so the command exists only
 * where a `commands` service is composed (interactive UIs: CLI / Web).
 * Headless/ACP surfaces compose no commands service, the callback never runs,
 * and the config default (`grokDefault`) governs there — the command is never
 * forced onto no-command surfaces. `commands` deliberately stays out of the
 * plugin's static `inject` (plan-mode's `static inject` omits it too): it is
 * optional everywhere.
 *
 * The commands parser reads the **first line** of a message as a command and
 * hands everything after `/grok` to this handler as `rawInput`
 * (`@deepseek-ai/dsh-commands` `parseCommand`). That makes this handler the
 * intake boundary for every stored team task prompt, because those prompts are
 * meant for a grok-enabled session and open with `/grok`. An argument that is
 * not `on`/`off` therefore never goes quiet: a one-line argument gets an
 * explicit grammar error, a prompt-shaped argument gets the measured, bilingual
 * refusal from `src/intake.ts` (see `test/command.spec.ts`). The toggle
 * semantics are unchanged — only the argument handling is.
 *
 * The handler runs directly against the agent (no model message is created):
 * it writes the durable toggle in `src/mode.ts`, which the session's own readers
 * consult. The `turn` field is informational metadata only — a reader looks at
 * `enabled`.
 *
 * The settle text reports what the session's own log shows, not what the write
 * call did: an enable that did not land settles as `kind: 'error'` and never
 * uses the success wording, so "the toggle is on" is only ever said about a
 * record a reader can see.
 *
 * The registration surface is structural (not imported from
 * `@deepseek-ai/dsh-commands`): that package is a UI-side service, not a
 * dependency of this bundle, and the contract used here is exactly the
 * documented one (`name`, `description`, `input`, `handler` →
 * `{ kind: 'success' | 'error', text }`).
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Session } from '@deepseek-ai/dsh-session';
/** Agent surface the handler needs (the live agent carries more). */
export interface GrokCommandAgent {
    /** Session the durable toggle is written to; the gate reads it back. */
    session?: Session | undefined;
    /** Current turn when the agent exposes one; informational metadata only. */
    turn?: number | undefined;
}
/** One handler invocation, as the commands service delivers it. */
export interface GrokCommandInvocation {
    agent: GrokCommandAgent;
    rawInput: string;
}
/** What a command handler settles to; the UI adapter renders `text`. */
export interface GrokCommandResult {
    kind: 'success' | 'error';
    text: string;
}
/** One command definition, as `commands.register` accepts it. */
export interface GrokCommandDefinition {
    name: string;
    description: string;
    input: {
        hint: string;
    };
    handler: (invocation: GrokCommandInvocation) => GrokCommandResult;
}
/** Warnings from the write path; the settle text, not the logger, reports failure. */
export interface CommandLogger {
    warn?(message: string): void;
}
/** The `kind: 'error'` settle text for an argument that is not a toggle word. */
export declare const GROK_USAGE_TEXT = "Usage: /grok [on|off|status]. This text was not sent as a prompt, so nothing ran.";
/**
 * One run's recorded progress, folded from the session's own journal.
 *
 * `/grok status` may only report what the session can show: the progress rows this
 * plugin writes (`plugin:grok-workflow/progress/*`, old `tool-workflow/*` names
 * normalized on read), the dispose record, and the checkpoint file.
 * It never guesses a state from memory, because a status line is the one place a
 * reader checks a claim they cannot otherwise see.
 */
export interface RunStatusFacts {
    /** Engine run id of the most recent run. */
    runId?: string;
    /** Durable task label (`run.meta.name`), when the row carried one. */
    name?: string;
    /** Stop reason the engine settled on, when the run has settled. */
    stopReason?: string;
    /** Child calls that never settled (still in flight when the row set ends). */
    inFlight: {
        seq: number;
        label: string;
        phase?: string;
        childId?: string;
    }[];
    /** Guardian settlement, when the run recorded one. */
    guard?: {
        findings: number;
        cancelled: boolean;
    };
}
/**
 * Fold the session journal into the facts `/grok status` prints.
 * @param session - session whose own log is read.
 * @returns The latest run's facts; empty fields when nothing was recorded.
 */
export declare function readRunStatusFacts(session: Session | undefined): RunStatusFacts;
/**
 * Compose the `/grok status` answer: run state, why it stopped, what the guard saw,
 * whether a checkpoint can be resumed, and what is still unfinished.
 *
 * Everything here is read from the session journal and the checkpoint file, so the
 * answer survives the process that produced it — which is the whole point of a
 * status command after an unload.
 * @param session - session to report on.
 * @param checkpointDirOverride - explicit checkpoint directory (tests, e2e lanes).
 * @returns The settled text (never empty).
 */
export declare function grokStatusText(session: Session | undefined, checkpointDirOverride?: string): string;
/**
 * The `/grok` command definition: arg grammar owned by the handler.
 *
 * The grammar: empty or `on` enables, `off` disables. The switch word is matched
 * case-insensitively and after trimming, because `rawInput` is whatever the
 * commands parser sliced off the first line — `/grok ON`, `/grok  Off ` and
 * `/grok\ton` are the same intent, and refusing them on a capital letter was a
 * pure spelling test on the user's keyboard. Everything else is refused and
 * never touches the toggle.
 */
export declare function grokCommand(logger?: CommandLogger): GrokCommandDefinition;
/**
 * Lazy-mount the `/grok` command wherever a `commands` service is composed.
 *
 * The mount mirrors plan-mode's: `ctx.inject(['commands'], ...)` only. The
 * capability check keeps the call a no-op on hosts whose plugin context lacks
 * the cordis registry mixin (test doubles of the plugin context); a real
 * cordis context always exposes `inject`, and its fiber waits for the
 * `commands` service — never forcing the command onto no-command surfaces.
 */
export declare function registerGrokCommand(ctx: Context, logger?: CommandLogger): void;
//# sourceMappingURL=command.d.ts.map