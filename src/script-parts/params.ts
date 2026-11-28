import { namingSource } from '../naming.js'
import { REDACTION_RULES } from '../redact.js'

/**
 * Render the shared redaction rules (src/redact.ts) as script-realm JS source.
 *
 * The workflow script cannot import host code, so its prompt-side redactor is
 * generated from the single host list instead of being maintained as a second
 * copy. `String.raw` performs no escape processing, so a rule's pattern source
 * (including `\\`-escapes and lookbehinds) is injected verbatim.
 */
export function redactionRulesSource(): string {
  return REDACTION_RULES
    .map(rule => `    .replace(/${rule.pattern.source}/${rule.pattern.flags}, ${JSON.stringify(rule.replacement)})`)
    .join('\n')
}

/**
 * How many summary drafts one run may spend through the three-step gate: the
 * first draft plus two rewrites.
 *
 * Interpolated into the generated script, so the guest's own bound and the
 * host's child-call budget cannot drift apart. The gate is not "one polish and
 * done": a draft that fails the check or the independent verification goes back
 * to the writer, and only a draft that passes both is delivered.
 */
export const SUMMARY_MAX_ATTEMPTS = 3

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
export const PLANNER_LEG_CALLS = 3

/**
 * The orchestration script is static. User data crosses the workflow boundary as
 * `args` JSON, never as source text; this keeps the sandbox contract explicit
 * and makes the script reviewable and testable outside a model call.
 */

export function guestParams(): string {
  return String.raw`
'use strict';

// User-visible naming (Issue #22 P1-1/P1-3): generated from src/naming.ts so the
// panel's words and the Host's words come from one table.
${namingSource()};

// Keep the objective byte for byte: the host compares the report objective
// against the exact string it passed in, so trimming here would fail that
// check whenever the caller's objective ends with whitespace. Only an
// all-whitespace objective is normalized to empty.
const rawObjective = String(args && args.objective ? args.objective : '');
const objective = rawObjective.trim() === '' ? '' : rawObjective;
// Defensive clamps only: the host validates args against HARD_LIMITS first, so a
// value arriving here is already in range. The bounds and the fallbacks below
// mirror HARD_LIMITS (maxConcurrency 100, maxRetries 3, maxTasks 100) and the
// documented defaults (10 / 1 / 10) in src/config.ts, and are pinned equal by
// test/config.spec.ts — do not edit one side without the other.
// isFinite (not the || idiom): an explicitly configured 0 retries must stay 0,
// where an absent key is what falls back to the documented default.
const argNumber = function (value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return isFinite(parsed) ? parsed : fallback;
};
const maxConcurrency = Math.max(1, Math.min(100, argNumber(args ? args.maxConcurrency : undefined, 10)));
const maxRetries = Math.max(0, Math.min(3, argNumber(args ? args.maxRetries : undefined, 1)));
const maxTasks = Math.max(1, Math.min(100, argNumber(args ? args.maxTasks : undefined, 10)));
// Q6 cooperative timeout: every agent() call races this bound. It is the second
// tier of the funnel (command 120 s -> one call <this> -> the run deadline), and it
// mirrors resolveChildTimeoutMs in src/timeout.ts (pinned by
// test/timeout.spec.ts): default 120 min, floor 1 s, ceiling 120 min.
// A call that loses the race is settled as a failure of that
// attempt, so the task retries with new wording instead of the whole run dying.
const childTimeoutMs = (function (value) {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof parsed !== 'number' || !isFinite(parsed) || parsed <= 0) return 7200000;
  return Math.min(7200000, Math.max(1000, Math.floor(parsed)));
})(args ? args.childTimeoutMs : undefined);

// Mid-run replan channel (L2). The engine gives a running script no way to receive
// data: args are cloned at start, the realm has no timers or fs, and the only host
// action is a whole-run cancel. So a demand that arrives mid-run is *pulled* at a
// wave boundary: the boundary planner child calls the host tool named here, which
// hands over the demands queued for this run and marks them consumed. Absent (the
// default) means the run behaves exactly as it did before this channel existed.
const replanChannel = (function (value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.enabled !== true) return null;
  const token = typeof value.token === 'string' ? value.token.trim() : '';
  if (token === '' || token.length > 120) return null;
  const tool = typeof value.tool === 'string' && value.tool.trim() !== ''
    ? value.tool.trim().slice(0, 60)
    : 'grok_replan_intents';
  return { token: token, tool: tool };
})(args ? args.replan : undefined);
// One boundary call per wave, capped independently of the wave count so a long
// plan cannot buy an unbounded number of replanning calls. Both numbers mirror
// REPLAN_LIMITS in src/replan.ts (pinned by test/replan.spec.ts), the same way the
// script mirrors HARD_LIMITS: the guest cannot import host code.
const REPLAN_MAX_BOUNDARIES = 4;
const REPLAN_MAX_EDITS = 16;

// Q8 guardian adjudication (wait x2, rule B): a call that loses the race above is
// not killed outright when a guardian route is configured — the script gathers the
// evidence it can observe, asks the guardian model, and a "wait" verdict extends
// this one call by five minutes, at most twice, never past the run deadline (rule
// B: give only what the deadline allows, and the run still stops at its deadline).
// Constants mirror src/timeout.ts (GUARDIAN_WAIT_MS / GUARDIAN_MAX_WAITS /
// GUARDIAN_ADJUDICATION_MS), pinned equal by test/timeout.spec.ts.
const GUARDIAN_WAIT_MS = 300000;
const GUARDIAN_MAX_WAITS = 2;
const GUARDIAN_ADJUDICATION_MS = 60000;
// The run's own start, so a wait can never push one call past the deadline the
// host enforces anyway (rule B). Absent/0 deadline = unlimited: the full slice.
const runStartedAtMs = nowMs();
const runDeadlineMs = (function (value) {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof parsed !== 'number' || !isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
})(args ? args.timeoutMs : undefined);
// One guardian route, one model: the adjudicator has no fallback chain because
// its failure is itself a verdict (kill). Absent or blank means "no adjudication"
// and a timed-out call fails straight to the task's bounded retry (pre-Q8).
const guardianRoute = (function (value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const model = typeof value.model === 'string' ? value.model.trim() : '';
  if (model === '' || model.length > 120) return null;
  const provider = typeof value.provider === 'string' ? value.provider.trim() : '';
  if (provider !== '' && provider.length > 120) return null;
  return provider === '' ? { model: model } : { provider: provider, model: model };
})(args ? args.guardianModel : undefined);

`;
}
