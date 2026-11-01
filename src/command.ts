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
 * The handler runs directly against the agent (no model message is created):
 * it writes the durable toggle in `src/mode.ts`, and `src/gate.ts` honors it on
 * the next message (`classifyPreStep`'s `mode-off` pass branch). The `turn`
 * field is informational metadata only — the gate reads only `enabled`.
 *
 * The registration surface is structural (not imported from
 * `@deepseek-ai/dsh-commands`): that package is a UI-side service, not a
 * dependency of this bundle, and the contract used here is exactly the
 * documented one (`name`, `description`, `input`, `handler` →
 * `{ kind: 'success' | 'error', text }`).
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import { setMode } from './mode.js'

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

/** Warnings only: `setMode` is warn-and-continue and tolerates its absence. */
export interface CommandLogger {
  warn?(message: string): void
}

/** The `/grok` command definition: arg grammar owned by the handler. */
export function grokCommand(logger?: CommandLogger): GrokCommandDefinition {
  return {
    name: 'grok',
    description: 'Turn the grok workflow on or off',
    input: { hint: '[on|off]' },
    handler: ({ agent, rawInput }) => {
      // Grammar: trim; empty or `on` enables, `off` disables, anything else is
      // a usage error that must NOT change the toggle.
      const arg = rawInput.trim()
      const enable = arg === '' || arg === 'on'
      if (!enable && arg !== 'off') return { kind: 'error', text: 'Usage: /grok [on|off]' }
      const turn = typeof agent.turn === 'number' && Number.isFinite(agent.turn) ? agent.turn : 0
      setMode(agent.session, {
        v: 1,
        enabled: enable,
        turn,
        setBy: enable ? 'command:/grok' : 'command:/grok off',
        // `/grok` promises the full workflow, so an explicit enable selects it
        // even when the deployment's `mode` is the front desk. `/grok off`
        // carries no shape; the next `/grok` re-selects `full`.
        ...enable ? { workflowMode: 'full' as const } : {},
      }, logger)
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
