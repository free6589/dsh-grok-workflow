/**
 * Prompt intake: the bounds a pasted task prompt has to fit through, and the
 * refusal text when it does not.
 *
 * Intake has two entry points, and both of them had a silent path before this
 * change:
 *
 * - **the gate** (`agent/pre-step`, `src/gate.ts`) refuses a message that is
 *   over the workflow objective budget, and that refusal was English-only text.
 *   The refusal itself was never silent, but a reader of a Chinese prompt was
 *   told nothing about the limit, the count, or what to do next.
 * - **the `/grok` command** (`src/command.ts`) parses the whole first line as a
 *   command, so a message that opens with `/grok` — the shape every stored team
 *   task prompt uses, because it is meant for a grok-enabled session — never
 *   reaches the gate at all. The grammar used to answer any argument other than
 *   `on`/`off` with one terse usage line, and the whole prompt was gone: the
 *   measured case dropped 2 041 characters with nothing left in the transcript
 *   to explain it (two independent sessions, see
 *   `docs/knowledge/VALIDATION.md`).
 *
 * This module owns the limits, the detection of the two shapes, and one
 * bilingual refusal text per shape. Both languages are always emitted, in this
 * order, because the intake boundary is the point where a reader has no other
 * place to learn why their message did nothing.
 */
/**
 * Intake bounds.
 *
 * The prompt budget is the workflow objective budget (`TASK_LIMITS.objectiveChars`)
 * and not a smaller local constant: the gate's refusal is exactly the number the
 * engine would have been handed, so one number has to mean one thing. The
 * command-argument bound only decides *which* refusal text a non-toggle argument
 * gets — a one-line typo keeps the terse grammar line, a multi-line or long
 * argument is a dropped prompt and gets the full one.
 */
export declare const INTAKE_LIMITS: {
    /** One pasted prompt: the largest objective the workflow can be handed. */
    readonly promptChars: 32000;
    /** A `/grok` argument at least this long (or multi-line) is a prompt, not a typo. */
    readonly commandPromptChars: 200;
};
/** Why a prompt was refused at intake. */
export type IntakeRefusalCode = 'empty' | 'oversize' | 'command-prompt';
/** A refusal with everything the message-repair action needs, in both languages. */
export interface IntakeRefusal {
    /** Stable code; recorded as the delivery outcome. */
    code: IntakeRefusalCode;
    /** Characters measured in the refused text. */
    chars: number;
    /** The limit that was applied, echoed so the text can be checked against the code. */
    limit: number;
    /** The refusal, English first then Simplified Chinese. */
    text: string;
}
/**
 * One task prompt section of the documented template: a heading and its body.
 *
 * `assembleTaskPrompt` renders these into the one prompt the gate accepts, so the
 * template the repository documents is assembled by the same rule the gate
 * enforces (see `docs/task-prompt-template.md` and `test/intake.spec.ts`).
 */
export interface PromptSection {
    /** Markdown heading, rendered on its own line. */
    heading: string;
    /** Body text, rendered under the heading. */
    body: string;
}
/** Refusal for a message with no text to route. */
export declare function refuseEmptyPrompt(): IntakeRefusal;
/**
 * Refusal for a prompt over the objective budget.
 *
 * The count is measured, not restated: the reader can check the message they
 * wrote against the number in the text, and the chunk count tells them exactly
 * how many messages it takes to get the whole prompt through.
 *
 * @param chars - characters measured in the refused message.
 * @param limit - the budget applied; defaults to the intake prompt budget.
 */
export declare function refuseOversizePrompt(chars: number, limit?: 32000): IntakeRefusal;
/**
 * Refusal for a text that was swallowed by a slash-command line.
 *
 * `/grok` takes no prompt: a message that opens with it is parsed as a command,
 * so the argument is the whole rest of the message and the command's grammar
 * decides its fate. This refusal states the measured size, that the text was
 * discarded rather than shortened, and the one action that delivers it.
 *
 * @param arg - the argument the command was given, i.e. everything after `/grok`.
 */
export declare function refuseDiscardedCommandPrompt(arg: string): IntakeRefusal;
/**
 * True when a non-toggle command argument is a prompt rather than a typo.
 *
 * A one-line argument of a few words is a usage mistake; an argument with
 * several lines, or more than {@link INTAKE_LIMITS.commandPromptChars} characters,
 * is a pasted prompt that the command swallowed. The shape is what picks the
 * refusal, so a short accident does not get a four-line report and a dropped
 * prompt does not get a one-line usage line.
 */
export declare function isPromptShapedArgument(arg: string): boolean;
/**
 * Classify one message against the intake budget.
 *
 * The two refusals this boundary owns: nothing to route, and a prompt over the
 * objective budget. A message that fits returns `undefined`, and the caller
 * routes it as before — the limit is a boundary, never a silent shortening.
 *
 * @param text - the message text the intake path is about to hand to the workflow.
 * @returns the refusal, or `undefined` when the prompt is within budget.
 */
export declare function inspectPrompt(text: string): IntakeRefusal | undefined;
/**
 * Assemble one task prompt from sections, and measure it against the budget.
 *
 * Rendering is deterministic and byte-stable: every section is a heading line
 * and its body, sections are joined by a blank line, and no body is reflowed.
 * The result carries the assembled size and how many messages the same text
 * would need if it did not fit, so the documented template can be checked
 * against the limit by a test instead of by reading.
 *
 * @param sections - heading/body pairs, in the order they should read.
 * @param limit - the budget applied; defaults to the intake prompt budget.
 */
export declare function assembleTaskPrompt(sections: readonly PromptSection[], limit?: 32000): {
    text: string;
    chars: number;
    fits: boolean;
    parts: number;
};
//# sourceMappingURL=intake.d.ts.map