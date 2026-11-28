/**
 * Render the shared redaction rules (src/redact.ts) as script-realm JS source.
 *
 * The workflow script cannot import host code, so its prompt-side redactor is
 * generated from the single host list instead of being maintained as a second
 * copy. `String.raw` performs no escape processing, so a rule's pattern source
 * (including `\\`-escapes and lookbehinds) is injected verbatim.
 */
export declare function redactionRulesSource(): string;
/**
 * How many summary drafts one run may spend through the three-step gate: the
 * first draft plus two rewrites.
 *
 * Interpolated into the generated script, so the guest's own bound and the
 * host's child-call budget cannot drift apart. The gate is not "one polish and
 * done": a draft that fails the check or the independent verification goes back
 * to the writer, and only a draft that passes both is delivered.
 */
export declare const SUMMARY_MAX_ATTEMPTS = 3;
/**
 * How many planner-chain walks the planning leg may spend in one run.
 *
 * Not a retry policy: the leg has no retries. It is the worst case of the three
 * corridors the guest script walks — the first ask, one same-call resubmit when
 * the answer was unusable in form, and one route re-fire when the call died in
 * transport. Two of the three are rescue calls the run really makes, so a child
 * cap that counted a single walk would abort the very rescue with AGENT_CAP.
 *
 * Kept host-side only: the guest script never computes the cap, it receives it.
 */
export declare const PLANNER_LEG_CALLS = 3;
/**
 * The orchestration script is static. User data crosses the workflow boundary as
 * `args` JSON, never as source text; this keeps the sandbox contract explicit
 * and makes the script reviewable and testable outside a model call.
 */
export declare function guestParams(): string;
//# sourceMappingURL=params.d.ts.map