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

import { TASK_LIMITS } from './input.js'

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
export const INTAKE_LIMITS = {
  /** One pasted prompt: the largest objective the workflow can be handed. */
  promptChars: TASK_LIMITS.objectiveChars,
  /** A `/grok` argument at least this long (or multi-line) is a prompt, not a typo. */
  commandPromptChars: 200,
} as const

/** Why a prompt was refused at intake. */
export type IntakeRefusalCode = 'empty' | 'oversize' | 'command-prompt' | 'no-team'

/** A refusal with everything the message-repair action needs, in both languages. */
export interface IntakeRefusal {
  /** Stable code; recorded as the delivery outcome. */
  code: IntakeRefusalCode
  /** Characters measured in the refused text. */
  chars: number
  /**
   * The limit that was applied, echoed so the text can be checked against the code.
   *
   * Absent for a refusal that is not about a size (the forced-team turn gate): there
   * is no budget to quote, and inventing one would put a number in the text that
   * nothing measured.
   */
  limit?: number
  /** The refusal, English first then Simplified Chinese. */
  text: string
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
  heading: string
  /** Body text, rendered under the heading. */
  body: string
}

/** One line, English, then one line, Simplified Chinese. */
function bilingual(en: string, zh: string, nextEn: string, nextZh: string): string {
  return [en, zh, nextEn, nextZh].join('\n')
}

/** Refusal for a message with no text to route. */
export function refuseEmptyPrompt(): IntakeRefusal {
  return {
    code: 'empty',
    chars: 0,
    limit: INTAKE_LIMITS.promptChars,
    text: bilingual(
      'this message carried no text to route, so no workflow step ran',
      '这条消息没有可派工的文字，因此没有启动任何流程',
      'add the task text and send the message again',
      '补上任务内容后重新发送',
    ),
  }
}

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
export function refuseOversizePrompt(chars: number, limit = INTAKE_LIMITS.promptChars): IntakeRefusal {
  const chunks = Math.max(1, Math.ceil(chars / limit))
  return {
    code: 'oversize',
    chars,
    limit,
    text: bilingual(
      `the message is longer than the ${limit}-character workflow objective limit (received ${chars} characters, about ${chunks} parts)`,
      `消息超过 ${limit} 字符的工作流目标上限（实际收到 ${chars} 字符，约 ${chunks} 段）`,
      `split it into parts of at most ${limit} characters and send them one at a time`,
      `拆成每段不超过 ${limit} 字符、分条发送`,
    ),
  }
}

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
export function refuseDiscardedCommandPrompt(arg: string): IntakeRefusal {
  const chars = arg.trim().length
  return {
    code: 'command-prompt',
    chars,
    limit: INTAKE_LIMITS.promptChars,
    text: bilingual(
      `Usage: /grok [on|off]. This text was not sent as a prompt: /grok takes only the arguments "on" or "off", so the ${chars} characters after it were discarded and nothing ran.`,
      `用法：/grok [on|off]。这段文字没有作为提示词发出：/grok 只接受 on 或 off，其后的 ${chars} 个字符已被丢弃，没有任何步骤执行。`,
      'remove the leading /grok and send the text again as its own message',
      '去掉开头的 /grok，把这段文字另作一条消息重新发送',
    ),
  }
}

/**
 * Refusal for a turn that asked for a team and then answered alone.
 *
 * The forced-team listener (`src/force-team.ts`) refuses the continuation step of a
 * turn whose own log shows no `tool-workflow/*` event. This is the same four-line
 * bilingual shape the intake refusals use — measured count, then the one action that
 * fixes it — because the reader is in the same position: something they asked for did
 * not happen, and they need to know what to do rather than who to apologise to.
 *
 * The count is the length of the message that matched, so the line names something
 * the reader wrote instead of the plugin's own accounting.
 * @param chars - characters measured in the message that asked for the team.
 */
export function refuseNonTeamTurn(chars: number): IntakeRefusal {
  return {
    code: 'no-team',
    chars,
    text: bilingual(
      `this turn asked for a team but started no team: no workflow ran inside it, so one model was about to answer alone (the message that asked was ${chars} characters long)`,
      `这一轮要的是团队，但没有任何团队起来：回合内没有工作流运行，等于一个模型准备单独作答（提出要求的那条消息 ${chars} 字符）`,
      'send it again so it runs as a team: split the work, run the tasks concurrently, then summarise',
      '重新发一次，让它按团队方式执行：先拆活、再并发执行、最后汇总',
    ),
  }
}

/**
 * True when a non-toggle command argument is a prompt rather than a typo.
 *
 * A one-line argument of a few words is a usage mistake; an argument with
 * several lines, or more than {@link INTAKE_LIMITS.commandPromptChars} characters,
 * is a pasted prompt that the command swallowed. The shape is what picks the
 * refusal, so a short accident does not get a four-line report and a dropped
 * prompt does not get a one-line usage line.
 */
export function isPromptShapedArgument(arg: string): boolean {
  const trimmed = arg.trim()
  return trimmed.includes('\n') || trimmed.length > INTAKE_LIMITS.commandPromptChars
}

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
export function assembleTaskPrompt(
  sections: readonly PromptSection[],
  limit = INTAKE_LIMITS.promptChars,
): { text: string, chars: number, fits: boolean, parts: number } {
  const text = sections.map(section => `${section.heading}\n${section.body}`).join('\n\n')
  const chars = text.length
  return {
    text,
    chars,
    fits: chars <= limit,
    parts: Math.max(1, Math.ceil(chars / limit)),
  }
}
