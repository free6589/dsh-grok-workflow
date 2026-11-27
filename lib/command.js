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
import { readModeRecord, setMode } from './mode.js';
import { isPromptShapedArgument, refuseDiscardedCommandPrompt } from './intake.js';
import { readLatestCheckpointSync } from './checkpoint/wiring.js';
import { PROGRESS_AGENT_END, PROGRESS_AGENT_START, PROGRESS_GUARDIAN_END, PROGRESS_RUN_END, PROGRESS_RUN_START, normalizeProgressRecord } from './records.js';
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
 * "the model may commission reviewed blocks of work in this session" is the
 * user acting on a toggle that does not exist.
 */
function toggleFailureText(reason, current) {
    return `Grok workflow toggle not changed: ${reason}. In this session ${currentStateText(current)}.`;
}
/** The `kind: 'error'` settle text for an argument that is not a toggle word. */
export const GROK_USAGE_TEXT = 'Usage: /grok [on|off|status]. This text was not sent as a prompt, so nothing ran.';
/**
 * Fold the session journal into the facts `/grok status` prints.
 * @param session - session whose own log is read.
 * @returns The latest run's facts; empty fields when nothing was recorded.
 */
export function readRunStatusFacts(session) {
    const facts = { inFlight: [] };
    if (session === undefined || typeof session.ownEvents !== 'function')
        return facts;
    const started = new Map();
    const settled = new Set();
    let sawGuard = false;
    for (const event of session.ownEvents()) {
        const rawType = event.type;
        const data = event.data;
        if (typeof rawType !== 'string' || data === undefined || data === null)
            continue;
        // Old sessions carry the retired `tool-workflow/*` names; normalize before reading.
        const type = normalizeProgressRecord(rawType);
        if (type === PROGRESS_RUN_START) {
            if (typeof data['runId'] === 'string')
                facts.runId = data['runId'];
            if (typeof data['name'] === 'string')
                facts.name = data['name'];
            // A new run restarts the fold: the status is about the latest run, and the
            // previous run's stop reason must not be read as this one's.
            delete facts.stopReason;
            delete facts.guard;
            started.clear();
            settled.clear();
            sawGuard = false;
            continue;
        }
        if (type === PROGRESS_AGENT_START) {
            const seq = Number(data['seq']);
            if (!Number.isFinite(seq))
                continue;
            started.set(seq, {
                label: typeof data['label'] === 'string' ? data['label'] : '',
                ...typeof data['phase'] === 'string' ? { phase: data['phase'] } : {},
                ...typeof data['childId'] === 'string' && data['childId'] !== '' ? { childId: data['childId'] } : {},
            });
            continue;
        }
        if (type === PROGRESS_AGENT_END) {
            const seq = Number(data['seq']);
            if (Number.isFinite(seq))
                settled.add(seq);
            continue;
        }
        if (type === PROGRESS_RUN_END) {
            if (typeof data['stopReason'] === 'string')
                facts.stopReason = data['stopReason'];
            continue;
        }
        // The Guardian settlement is written by `src/run.ts` with these two fields
        // (old sessions carry the retired `tool-workflow/guardian-end` name, already
        // normalized above, so both spellings land here).
        if (type === PROGRESS_GUARDIAN_END) {
            const findings = Number(data['findingCount']);
            const cancelled = data['cancelled'] === true;
            if (Number.isFinite(findings)) {
                facts.guard = { findings, cancelled };
                sawGuard = true;
            }
        }
    }
    facts.inFlight = [...started.entries()]
        .filter(([seq]) => !settled.has(seq))
        .sort((left, right) => left[0] - right[0])
        .map(([seq, member]) => ({ seq, ...member }));
    if (!sawGuard)
        delete facts.guard;
    return facts;
}
/** Plain words for a stop reason, so the status line does not answer in jargon. */
function stopWords(stopReason) {
    if (stopReason === undefined)
        return 'still running, or it never settled';
    if (stopReason === 'completed')
        return 'finished on its own terms';
    if (stopReason === 'cancelled')
        return 'cancelled (by the caller, a deadline, or a plugin unload — see the checkpoint cause)';
    return `stopped with ${stopReason}`;
}
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
export function grokStatusText(session, checkpointDirOverride) {
    const toggle = readModeRecord(session);
    const facts = readRunStatusFacts(session);
    const sessionId = typeof session?.id === 'string' ? session.id : undefined;
    const latest = readLatestCheckpointSync({
        ...checkpointDirOverride === undefined ? {} : { dir: checkpointDirOverride },
        ...sessionId === undefined ? {} : { sessionId },
    });
    const lines = ['Grok workflow status:'];
    lines.push(`- Toggle: ${toggle === undefined ? 'never set in this session' : toggle.enabled ? 'on' : 'off'}`);
    if (facts.runId === undefined && latest === undefined) {
        lines.push('- Last run: none recorded in this session');
        return lines.join('\n');
    }
    lines.push(`- Last run: ${facts.name ?? latest?.checkpoint.run.name ?? 'unnamed'} (${facts.runId ?? latest?.checkpoint.run.runId ?? 'unknown id'})`);
    lines.push(`- State: ${stopWords(facts.stopReason)}`);
    const stopCause = latest?.checkpoint.run.cause;
    if (stopCause !== undefined)
        lines.push(`- Why it stopped: ${stopCause}`);
    const guard = facts.guard;
    lines.push(guard === undefined
        ? '- Guard: no guardian settlement recorded for this run'
        : `- Guard: ${guard.findings} finding(s); ${guard.cancelled ? 'it cancelled the run' : 'it never terminated a subagent'}`);
    if (facts.inFlight.length > 0) {
        lines.push(`- Still in flight when the rows ended: ${facts.inFlight.map(member => `${member.childId ?? `#${member.seq}`}${member.phase === undefined ? '' : ` (${member.phase})`}`).join(', ')}`);
    }
    if (latest === undefined) {
        lines.push('- Resumable checkpoint: none readable');
        return lines.join('\n');
    }
    const checkpoint = latest.checkpoint;
    const unfinished = checkpoint.tasks.filter(task => task.status !== 'verified').map(task => `${task.id}${task.status === 'pending' ? '' : ` (${task.status})`}`);
    lines.push(`- Resumable checkpoint: ${checkpoint.run.status} at ${new Date(checkpoint.time.updatedAtMs).toISOString()} (${latest.path})`);
    const running = checkpoint.inFlight ?? [];
    if (running.length > 0) {
        lines.push(`- Checkpointed in-flight calls: ${running.map(row => `${row.childId ?? `#${row.seq}`} — ${row.lastStep}`).join('; ')}`);
    }
    lines.push(unfinished.length === 0
        ? '- Unfinished: none; every recorded task verified'
        : `- Unfinished (${unfinished.length}): ${unfinished.join(', ')}`);
    lines.push('- To continue: send the same request again; the next run starts from this checkpoint.');
    return lines.join('\n');
}
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
export function grokCommand(logger) {
    return {
        name: 'grok',
        description: 'Turn the grok workflow on or off, or report the last run',
        input: { hint: '[on|off|status]' },
        handler: ({ agent, rawInput }) => {
            // A malformed invocation is an error, not an enable: an invocation object
            // without a string argument must never fall through to "no argument means
            // on" and write a toggle nobody asked for.
            if (typeof rawInput !== 'string')
                return { kind: 'error', text: GROK_USAGE_TEXT };
            // Grammar: trim, then match the switch word case-insensitively. `trim`
            // removes every Unicode `WhiteSpace` code point (spaces, tabs, newlines,
            // U+00A0, U+3000), so the word is the only thing that decides.
            const arg = rawInput.trim();
            const word = arg.toLowerCase();
            // `/grok status` answers a question instead of flipping the toggle: it never
            // writes, so a reader can ask "what happened to my run" without changing the
            // session's mode. It is matched before the toggle grammar because `status`
            // would otherwise be refused as a malformed switch word.
            if (word === 'status')
                return { kind: 'success', text: grokStatusText(agent.session) };
            const enable = arg === '' || word === 'on';
            if (!enable && word !== 'off') {
                // A pasted prompt that opens with `/grok` reaches this line with the whole
                // prompt as its argument. Answering that with the usage line alone is what
                // made a 2 000-character request vanish; state the measured loss instead.
                return {
                    kind: 'error',
                    text: isPromptShapedArgument(arg)
                        ? refuseDiscardedCommandPrompt(arg).text
                        : GROK_USAGE_TEXT,
                };
            }
            const turn = typeof agent.turn === 'number' && Number.isFinite(agent.turn) ? agent.turn : 0;
            const written = setMode(agent.session, {
                v: 1,
                enabled: enable,
                turn,
                setBy: enable ? 'command:/grok' : 'command:/grok off',
                // An explicit enable still stamps the record's shape (`full`), because a
                // reader expects the record `/grok` has always written; the shape routes
                // nothing — `enabled` is what the intake's admission rule reads.
                // `/grok off` carries no shape; the next `/grok` re-selects `full`.
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
            // The ON receipt names the record this write actually creates (the intake's
            // admission rule reads it) and the load-time switch that has to be on for
            // the tools to exist at all. Both qualifiers are plain text: reading
            // `blockIntake` here would turn a receipt into a second config reader.
            return {
                kind: 'success',
                text: enable
                    ? 'Grok workflow ON — the model may commission reviewed blocks of work in this session, as long as the block intake is switched on. Messages themselves are not turned into a workflow.'
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