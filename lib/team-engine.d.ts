/**
 * The plugin's team workflow engine: the runtime's own published PTC engine,
 * executed over a context view whose `subagents.startActivation` gives every
 * child a descriptive durable display label.
 *
 * Why this seam exists (fix_child_names): the workflow guest computes the
 * script's label (`opts.label ?? defaultLabel(prompt)`) but forwards only
 * prompt/schema/provider/model across the worker boundary, and the PTC host
 * hardcodes `` label: `${meta.name} child ${callId}` `` when it calls
 * `subagents.startActivation` (dsh-workflow-ptc host `startChild`). That spec
 * label is what `startLocal` snapshots into the child's durable
 * `subagent/descriptor` event, and the Web GUI's team panel renders it as the
 * child's primary name (`dsh-client-ui-subagent` shows `entry.label ?? entry.id`).
 * The one channel the plugin controls at that boundary is the child prompt,
 * whose first line every prompt builder in this plugin makes the child's
 * display title; the view derives the label from it with the guest's own
 * `defaultLabel` rule (first line, 48 code points).
 *
 * Boundary: DSH core is untouched. The engine class is not re-implemented —
 * the twin is built from the constructor of the very engine instance the
 * runtime injected, so it follows the host's engine implementation. The
 * context view only decorates `subagents` (and neutralizes the `Service`
 * base's registration, so the runtime's own `workflowEngine` service stays
 * untouched everywhere); every other property is the real runtime service.
 * When the injected engine is not the published PTC engine (unit-test fakes,
 * foreign implementations), the injected engine is returned unchanged.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { WorkflowEngine } from '@deepseek-ai/dsh-workflow';
import type { ChildOutcomeLog } from './child-outcomes.js';
/** Code points a derived child label may occupy — the guest's own defaultLabel rule. */
export declare const CHILD_LABEL_LIMIT = 48;
/**
 * The activation-spec slice the rewrite reads and rewrites (structural, untrusted
 * shape).
 *
 * Two shapes reach this seam and both are real. The published engine builds the
 * spec flat — `{ label, prompt, agentOptions, parent, cwd, … }` — and that is what
 * every production child sends. The engine contract harness builds the same two
 * fields one level down under `request`, which is also the shape an older
 * host-side mirror used. Reading only `request.prompt` and `request.agentOptions`
 * therefore produced an empty title and an `inherit` route on every real run: the
 * label stayed the engine's own, the role was never parsed, and the null-collapse
 * repair had no group to match. Both reads are kept, flat first.
 */
export interface ActivationSpecView {
    label: string;
    /** Flat shape (what the published engine sends). */
    prompt?: readonly {
        type?: string;
        text?: string;
    }[];
    /** Flat shape, same provenance as {@link prompt}. */
    agentOptions?: {
        provider?: unknown;
        model?: unknown;
    };
    /** Nested shape (engine contract harness, older host mirror). */
    request?: {
        prompt?: readonly {
            type?: string;
            text?: string;
        }[];
        agentOptions?: {
            provider?: unknown;
            model?: unknown;
        };
    };
}
/**
 * Derive a child display label from its prompt: the first line, trimmed, capped
 * at {@link CHILD_LABEL_LIMIT} code points (a surrogate pair is never split).
 * @param prompt - the child prompt text, or anything.
 * @param fallback - the label to keep when no usable first line exists.
 * @returns the display label.
 */
export declare function childLabelFromPrompt(prompt: unknown, fallback: string): string;
/**
 * Rewrite one activation spec's label from its prompt's first line, returning
 * the spec untouched when the first line yields nothing (or the same label).
 * @param spec - the activation spec as the engine built it.
 * @returns the spec carrying the descriptive label.
 */
export declare function rewriteActivationLabel<T extends ActivationSpecView>(spec: T): T;
/**
 * The engine the plugin's runs execute on.
 *
 * When the runtime injected the published PTC engine, this is a twin of it
 * over a label-rewriting context view (cached per context — cordis may return
 * a derived view of the service per access, so the context, not the service
 * instance, is the stable identity); otherwise the injected engine is returned
 * unchanged, because the label rewrite is defined against the PTC host's
 * `startActivation` call and cannot be presumed elsewhere. Every fallback is
 * announced through `log` once per context, so a silently degraded display
 * name is observable in the log alone.
 * @param ctx - the plugin's runtime context; its `workflowEngine` is the contract.
 * @param log - optional host logger for the fallback announcements.
 * @returns the engine to start runs on.
 */
export declare function teamWorkflowEngine(ctx: Context, log?: TeamEngineLog): WorkflowEngine;
/** The one method of the host logger the seam needs. */
export interface TeamEngineLog {
    warn(message: string): unknown;
}
/**
 * The child-outcome log this context's engine writes into.
 *
 * One log per context, created on first use and shared by the twin and the run
 * that drives it: `mark()` before a run and `since(mark)` after it are what make
 * the evidence per-run without giving every run its own engine. A context whose
 * engine the plugin does not decorate (a non-PTC engine, a bare unit-test
 * context) gets an empty log, so `since()` answers "no evidence" rather than
 * "nothing happened".
 * @param ctx - the plugin's runtime context, the same object passed to `teamWorkflowEngine`.
 * @returns The context's child-outcome log.
 */
export declare function childOutcomeLog(ctx: Context): ChildOutcomeLog;
/**
 * The cause phrase for one child, as the memory archive needs it: `undefined` when
 * this run recorded nothing for that child.
 * @param log - the context's child-outcome log.
 * @param childId - the child session id the engine reported.
 * @returns A bounded one-line cause, or `undefined`.
 */
export declare function childOutcomeCause(log: ChildOutcomeLog, childId: string | undefined): string | undefined;
//# sourceMappingURL=team-engine.d.ts.map