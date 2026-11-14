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
import { readModeRecord, setMode } from './mode.js';
/** The state a session is left in when the toggle write did not take effect. */
function currentStateText(record) {
    if (record === undefined)
        return 'no toggle was recorded';
    return `the toggle is still ${record.enabled ? 'on' : 'off'}`;
}
/**
 * The `kind: 'error'` settle text for a write that did not land.
 *
 * It must never carry the success wording: a refused write answered with
 * "every message now runs the full workflow" is the user acting on a toggle
 * that does not exist.
 */
function toggleFailureText(reason, current) {
    return `Grok workflow toggle not changed: ${reason}. In this session ${currentStateText(current)}.`;
}
/** The `/grok` command definition: arg grammar owned by the handler. */
export function grokCommand(logger) {
    return {
        name: 'grok',
        description: 'Turn the grok workflow on or off',
        input: { hint: '[on|off]' },
        handler: ({ agent, rawInput }) => {
            // Grammar: trim; empty or `on` enables, `off` disables, anything else is
            // a usage error that must NOT change the toggle.
            const arg = rawInput.trim();
            const enable = arg === '' || arg === 'on';
            if (!enable && arg !== 'off')
                return { kind: 'error', text: 'Usage: /grok [on|off]' };
            const turn = typeof agent.turn === 'number' && Number.isFinite(agent.turn) ? agent.turn : 0;
            const written = setMode(agent.session, {
                v: 1,
                enabled: enable,
                turn,
                setBy: enable ? 'command:/grok' : 'command:/grok off',
                // `/grok` promises the full workflow, so an explicit enable selects it
                // even when the deployment's `mode` is the front desk. `/grok off`
                // carries no shape; the next `/grok` re-selects `full`.
                ...enable ? { workflowMode: 'full' } : {},
            }, logger);
            // Read back instead of trusting the writer. "Grok workflow ON" is a claim
            // about durable state, so it is only allowed to settle when the session's
            // own log shows exactly that record — a session can accept an append
            // without committing it, and the user would then act on a toggle that
            // never existed.
            const current = readModeRecord(agent.session);
            const applied = written.ok
                && current !== undefined
                && current.enabled === enable
                && current.turn === turn
                && current.setBy === (enable ? 'command:/grok' : 'command:/grok off');
            if (!applied) {
                return {
                    kind: 'error',
                    text: toggleFailureText(written.reason ?? 'the session did not record it', current),
                };
            }
            return {
                kind: 'success',
                text: enable
                    ? 'Grok workflow ON — every message now runs the full plan→execute→verify workflow.'
                    : 'Grok workflow OFF — normal chat.',
            };
        },
    };
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
export function registerGrokCommand(ctx, logger) {
    if (typeof ctx.inject !== 'function')
        return;
    ctx.inject(['commands'], (commandCtx) => {
        const commands = commandCtx.commands;
        commands.register(grokCommand(logger));
    });
}
//# sourceMappingURL=command.js.map