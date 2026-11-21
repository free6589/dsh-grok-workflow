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
 * it writes the durable toggle in `src/mode.ts`, and `src/gate.ts` honors it on
 * the next message (`classifyPreStep`'s `mode-off` pass branch). The `turn`
 * field is informational metadata only — the gate reads only `enabled`.
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

import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import { readModeRecord, setMode } from './mode.js'
import type { ModeRecord } from './mode.js'
import { isPromptShapedArgument, refuseDiscardedCommandPrompt } from './intake.js'

/** Agent surface the handler needs (the live agent carries more). */
export interface GrokCommandAgent {
  /** Session the durable toggle is written to; the gate reads it back. */
  session?: Session | undefined
  /** Current turn when the agent exposes one; informational metadata only. */
  turn?: number | undefined
}

/** One handler invocation, as the commands service delivers it. */
export interface GrokCommandInvocation {
  agent: GrokCommandAgent
  rawInput: string
}

/** What a command handler settles to; the UI adapter renders `text`. */
export interface GrokCommandResult {
  kind: 'success' | 'error'
  text: string
}

/** One command definition, as `commands.register` accepts it. */
export interface GrokCommandDefinition {
  name: string
  description: string
  input: { hint: string }
  handler: (invocation: GrokCommandInvocation) => GrokCommandResult
}

/** The `commands` service surface this plugin registers against (structural). */
interface CommandsSurface {
  register(definition: GrokCommandDefinition): unknown
}

/** Warnings from the write path; the settle text, not the logger, reports failure. */
export interface CommandLogger {
  warn?(message: string): void
}

/** The state a session is left in when the toggle write did not take effect. */
function currentStateText(record: ModeRecord | undefined): string {
  if (record === undefined) return 'no toggle was recorded'
  return `the toggle is still ${record.enabled ? 'on' : 'off'}`
}

/**
 * The `kind: 'error'` settle text for a write that did not land.
 *
 * It must never carry the success wording: a refused write answered with
 * "every message now runs the full workflow" is the user acting on a toggle
 * that does not exist.
 */
function toggleFailureText(reason: string, current: ModeRecord | undefined): string {
  return `Grok workflow toggle not changed: ${reason}. In this session ${currentStateText(current)}.`
}

/** The `kind: 'error'` settle text for an argument that is not a toggle word. */
export const GROK_USAGE_TEXT = 'Usage: /grok [on|off]. This text was not sent as a prompt, so nothing ran.'

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
export function grokCommand(logger?: CommandLogger): GrokCommandDefinition {
  return {
    name: 'grok',
    description: 'Turn the grok workflow on or off',
    input: { hint: '[on|off]' },
    handler: ({ agent, rawInput }) => {
      // A malformed invocation is an error, not an enable: an invocation object
      // without a string argument must never fall through to "no argument means
      // on" and write a toggle nobody asked for.
      if (typeof rawInput !== 'string') return { kind: 'error', text: GROK_USAGE_TEXT }
      // Grammar: trim, then match the switch word case-insensitively. `trim`
      // removes every Unicode `WhiteSpace` code point (spaces, tabs, newlines,
      // U+00A0, U+3000), so the word is the only thing that decides.
      const arg = rawInput.trim()
      const word = arg.toLowerCase()
      const enable = arg === '' || word === 'on'
      if (!enable && word !== 'off') {
        // A pasted prompt that opens with `/grok` reaches this line with the whole
        // prompt as its argument. Answering that with the usage line alone is what
        // made a 2 000-character request vanish; state the measured loss instead.
        return {
          kind: 'error',
          text: isPromptShapedArgument(arg)
            ? refuseDiscardedCommandPrompt(arg).text
            : GROK_USAGE_TEXT,
        }
      }
      const turn = typeof agent.turn === 'number' && Number.isFinite(agent.turn) ? agent.turn : 0
      const written = setMode(agent.session, {
        v: 1,
        enabled: enable,
        turn,
        setBy: enable ? 'command:/grok' : 'command:/grok off',
        // `/grok` promises the full workflow, so an explicit enable selects it
        // even when the deployment's `mode` is the front desk. `/grok off`
        // carries no shape; the next `/grok` re-selects `full`.
        ...enable ? { workflowMode: 'full' as const } : {},
      }, logger)
      // Read back instead of trusting the writer. "Grok workflow ON" is a claim
      // about durable state, so it is only allowed to settle when the session's
      // own log shows exactly that record — a session can accept an append
      // without committing it, and the user would then act on a toggle that
      // never existed.
      const current = readModeRecord(agent.session)
      const applied = written.ok
        && current !== undefined
        && current.enabled === enable
        && current.turn === turn
        && current.setBy === (enable ? 'command:/grok' : 'command:/grok off')
      if (!applied) {
        return {
          kind: 'error',
          text: toggleFailureText(written.reason ?? 'the session did not record it', current),
        }
      }
      return {
        kind: 'success',
        text: enable
          ? 'Grok workflow ON — every message now runs the full plan→execute→verify workflow.'
          : 'Grok workflow OFF — normal chat.',
      }
    },
  }
}

/**
 * Lazy-mount the `/grok` command wherever a `commands` service is composed.
 *
 * The mount mirrors plan-mode's: `ctx.inject(['commands'], ...)` only. The
 * capability check keeps the call a no-op on hosts whose plugin context lacks
 * the cordis registry mixin (test doubles of the plugin context); a real
 * cordis context always exposes `inject`, and its fiber waits for the
 * `commands` service — never forcing the command onto no-command surfaces.
 */
export function registerGrokCommand(ctx: Context, logger?: CommandLogger): void {
  if (typeof (ctx as { inject?: unknown }).inject !== 'function') return
  ctx.inject(['commands'], (commandCtx) => {
    const commands = (commandCtx as unknown as { commands: CommandsSurface }).commands
    commands.register(grokCommand(logger))
  })
}
