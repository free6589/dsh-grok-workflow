import { redactionRulesSource, SUMMARY_MAX_ATTEMPTS } from './params.js'
export function guestRouting(): string {
  return String.raw`// A timer is the one thing this realm does not guarantee. The engine builds the
// guest context from an empty object and injects only agent/parallel/pipeline/
// phase/log/args (measured against @deepseek-ai/dsh-workflow-ptc's
// WorkflowExecution), so setTimeout is absent in a real run — but every ECMAScript
// realm carries Atomics.waitAsync, which resolves to 'timed-out' after N ms without
// blocking the thread. That is the timer a real run uses:
//
//   - setTimeout/clearTimeout where they exist (unit harnesses, a future engine
//     that injects them): preferred, cancellable, unref'd so it cannot hold the
//     process open.
//   - Atomics.waitAsync otherwise: the real-run path. It needs a SharedArrayBuffer
//     cell nobody writes, so every wait ends by timeout; a cancelled wait is
//     ignored by the caller's settled flag.
//   - Neither: the call is awaited plainly (pre-Q6 behaviour) instead of failing
//     every call in a realm with no timer at all.
const hasHostTimer = typeof setTimeout === 'function' && typeof clearTimeout === 'function';
const sleepCell = (function () {
  try {
    if (typeof SharedArrayBuffer !== 'function') return null;
    if (typeof Atomics !== 'object' || Atomics === null) return null;
    if (typeof Atomics.waitAsync !== 'function') return null;
    return new Int32Array(new SharedArrayBuffer(4));
  } catch (error) {
    return null;
  }
})();
const canRaceCalls = hasHostTimer || sleepCell !== null;

// Call the callback after ms; returns a cancel function that guarantees it never
// runs afterwards. The returned function is a no-op only in the no-timer realm,
// where the caller never arms anything in the first place.
function afterDelay(ms, done) {
  const delay = Math.max(1, Math.floor(ms));
  if (hasHostTimer) {
    const handle = setTimeout(done, delay);
    if (handle && typeof handle.unref === 'function') handle.unref();
    return function () { clearTimeout(handle); };
  }
  if (sleepCell !== null) {
    let cancelled = false;
    const ticket = Atomics.waitAsync(sleepCell, 0, 0, delay);
    const fired = ticket && ticket.async ? ticket.value : Promise.resolve(ticket ? ticket.value : 'timed-out');
    const run = function () { if (!cancelled) done(); };
    fired.then(run, run);
    return function () { cancelled = true; };
  }
  return function () {};
}

// One child call with the cooperative budget. The timer is always cleared, so a
// call that answers quickly leaves nothing armed behind it; a call that loses the
// race rejects with a recognisable prefix, and its late result is discarded (the
// engine owns the child, the script owns only the decision to stop waiting).
//
// With a guardian route configured, losing the race is not the end: the script
// gathers the evidence it can observe, asks the guardian model once per slice,
// and a "wait" verdict arms one more slice for the SAME underlying call (the
// promise is never abandoned, so a child that answers during adjudication still
// wins). A "kill" verdict, an unreadable verdict, or an adjudicator that itself
// fails or stalls all reject with the same CHILD_TIMEOUT prefix — the task's
// bounded retry with new wording continues either way, and the run deadline (rule
// B) bounds every extension.
// Budget a child call when the realm has no timer to arm (no canRaceCalls).
// The clock still moves — the host owns the only wall clock the script can
// read (nowMs() = Date.now()), so the fallback needs no setTimeout and
// no Atomics: it watches the child's own settlement for the instant it goes
// stale. A call that answers keeps flowing: its settlement runs first, the
// stale flag trips only after, and the budget error fires only when the task
// pool's own await chain comes back here — i.e. only when the call is still
// open past its budget. The rejection uses the same CHILD_TIMEOUT prefix the
// timed race produces, so callers classify it as the same timeout failure.
function noTimerBudgetMs() {
  const remaining = runDeadlineMs > 0 ? runStartedAtMs + runDeadlineMs - nowMs() : Infinity;
  if (!(remaining > 0)) return 0;
  const grant = Math.min(childTimeoutMs, remaining);
  return grant >= 1000 ? grant : 0;
}

// Poll for progress on a child call without a timer: resolves true when the
// call settles first (the value or error travels on the original promise —
// this only reports the outcome), false when the budget is spent with the
// call still open. Each step yields through the pool's own wakeups (one more
// settled task's .then), never a bare sleep: with no timer in the realm a
// new Promise(resolve => setTimeout(resolve, ms)) sleep would be a second
// hang in the same place. A closed realm loop (nothing else pending) resolves
// after Date.now() says the budget is gone, so a wedge can never pin the
// wave past the budget — Q8 guardians may still grant slices above this.
function watchNoTimer(promise, budgetMs) {
  const deadline = nowMs() + budgetMs;
  return new Promise(function (resolve) {
    let settled = false;
    const finish = function (won) { if (!settled) { settled = true; resolve(won); } };
    promise.then(function () { finish(true); }, function () { finish(true); });
    (function step() {
      // A settled call already resolved above. Otherwise re-arm through the
      // next microtask chain link: progress elsewhere (any settled sibling,
      // route drain, wave advance) brings the next check; a quiet realm just
      // spins microtasks until Date.now() crosses the deadline.
      if (settled) return;
      if (!(nowMs() < deadline)) { finish(false); return; }
      Promise.resolve().then(step);
    })();
  });
}

function raceChildCall(promise, guard) {
  if (!canRaceCalls) {
    // No clock, no budget: without Date the fallback could never observe the
    // deadline (a frozen nowMs() would spin forever), so the call stays bare
    // rather than hanging the realm on a budget it cannot read.
    if (!(nowMs() > 0)) return promise;
    const fallbackMs = noTimerBudgetMs();
    if (!(fallbackMs > 0)) return promise;
    return new Promise(function (resolve, reject) {
      promise.then(resolve, reject);
      watchNoTimer(promise, fallbackMs).then(function (answered) {
        if (!answered) reject(new Error('CHILD_TIMEOUT: ' + childTimeoutMs + ' ms'));
      });
    });
  }
  return new Promise(function (resolve, reject) {
    let settled = false;
    let waits = 0;
    let cancelWait = function () {};
    // Rule B anchors at the RUN's start, not this call's: a wait may never push
    // one child past the deadline the host enforces for the whole run.
    const deadlineAt = runDeadlineMs > 0 ? runStartedAtMs + runDeadlineMs : Infinity;
    const failTimeout = function () {
      settled = true;
      reject(new Error('CHILD_TIMEOUT: ' + childTimeoutMs + ' ms'));
    };
    const arm = function (ms) {
      cancelWait = afterDelay(ms, function () {
        if (settled) return;
        // Rule B, checked before asking: no guardian configured, waits exhausted,
        // or a deadline with no room left kill immediately without spending an
        // adjudication call.
        const remaining = deadlineAt - nowMs();
        if (!guard || !guardianRoute || waits >= GUARDIAN_MAX_WAITS || !(remaining > 0)) { failTimeout(); return; }
        adjudicateStall(guard, waits, remaining, function (verdict, reason, guidance) {
          if (settled) return;
          // Rescue: the adjudicator thinks this child can be steered back.
          // The script cannot reach into the child session. It broadcasts the
          // rescue on the log channel; the host queues recovery guidance without
          // interrupting the active turn. The same wait slice is granted so the
          // underlying call can finish normally. Each adjudication is bounded.
          if (verdict === 'rescue') {
            const line = 'guardian rescue seq=' + String(guard.seq) + ' label=' + String(guard.label).slice(0, 120)
              + ' guidance=' + String(guidance === undefined || guidance === null || guidance === '' ? reason : guidance).slice(0, 200);
            log(line);
          }
          const extend = guardianWaitMs(verdict === 'rescue' ? 'wait' : verdict, waits, remaining);
          if ((verdict !== 'wait' && verdict !== 'rescue') || !(extend >= 1000)) {
            failTimeout();
            return;
          }
          waits += 1;
          log('guardian wait ' + waits + '/' + GUARDIAN_MAX_WAITS + ': ' + String(reason === undefined || reason === null ? 'stalled call' : reason).slice(0, 160));
          arm(extend);
        });
      });
    };
    arm(childTimeoutMs);
    promise.then(function (value) {
      if (settled) return;
      settled = true;
      cancelWait();
      resolve(value);
    }, function (error) {
      if (settled) return;
      settled = true;
      cancelWait();
      reject(error);
    });
  });
}

// Ask the guardian model to judge one stalled call. Bounded evidence first (role,
// label, elapsed, waits granted, deadline room — everything the script can
// observe), then one bounded call; anything the adjudicator cannot deliver (a
// crash, a stall past GUARDIAN_ADJUDICATION_MS, an unreadable verdict) reads as a
// kill, per Q8: an adjudicator without an answer has no evidence for a wait.
function adjudicateStall(guard, waits, remainingMs, done) {
  let finished = false;
  let cancelClock = function () {};
  const finish = function (verdict, reason, guidance) {
    if (finished) return;
    finished = true;
    cancelClock();
    done(verdict, reason, guidance);
  };
  const minutes = function (ms) { return Math.max(1, Math.round(ms / 60000)); };
  // B3: the task's declared write paths go into the evidence so the
  // adjudicator knows what files a living child of this task should touch.
  // A child that declared paths but shows no run narration is more suspect
  // than one whose run keeps logging; the host-side file heartbeat (fresh
  // mtime on these paths) is folded into the Guardian finding reason.
  const declaredPaths = Array.isArray(guard.writesPaths) && guard.writesPaths.length > 0
    ? guard.writesPaths.filter(function (p) { return typeof p === 'string'; }).slice(0, 16).join(', ')
    : '';
  const prompt = [
    'Guardian · stall adjudication',
    'You are the guardian model inside a verified workflow run. One child agent has stopped making observable progress and its wait budget expired. Judge from the evidence below whether the child is still working or wedged; you cannot see the child, so reason from what the run reports.',
    'EVIDENCE:',
    '- role: ' + String(guard.role),
    '- child label: ' + String(guard.label).slice(0, 120),
    '- wait budget already exceeded: ' + minutes(childTimeoutMs) + ' minutes',
    '- waits granted so far: ' + waits + ' of ' + GUARDIAN_MAX_WAITS,
    '- time left before the run deadline: ' + (remainingMs === Infinity ? 'unlimited' : minutes(remainingMs) + ' minutes'),
    '- task-declared write paths: ' + (declaredPaths === '' ? '(none declared)' : declaredPaths),
    '',
    'RULES:',
    '- Answer wait only when a child of this role plausibly still runs long work (a large build, a broad test sweep, a long edit) and the deadline has room for one more five-minute slice.',
    '- A child whose task declared write paths and whose run keeps narrating phase/log lines is more likely alive; a child with declared paths but a silent run is more suspect.',
    '- Answer rescue when the child looks interrupted-recoverable: stuck waiting on input or approval, or drifted off the task but still responsive. Give a guidance line that tells it exactly what to do next.',
    '- Answer kill when the child gives no reason to expect progress, or the deadline cannot afford the slice.',
    '- Answer with JSON exactly: {"verdict":"wait"} or {"verdict":"kill","reason":"<=200 chars"} or {"verdict":"rescue","reason":"<=200 chars","guidance":"<=200 chars, imperative, what the child should do next"}',
    'Do not include credentials, tokens, passwords, or private keys.'
  ].join('\n');
  const call = { label: 'guardian adjudication', phase: 'Guardian' };
  if (guardianRoute.provider) call.provider = guardianRoute.provider;
  call.model = guardianRoute.model;
  call.schema = {
    type: 'object',
    required: ['verdict'],
    properties: {
      verdict: { type: 'string', enum: ['wait', 'kill', 'rescue'] },
      reason: { type: 'string' },
      guidance: { type: 'string' }
    }
  };
  // The adjudication has its own bound in the same timer the race uses: a guardian
  // that never answers is a kill (an adjudicator without an answer has no evidence
  // for a wait), and it must not hold the task past this call.
  cancelClock = afterDelay(GUARDIAN_ADJUDICATION_MS, function () { finish('kill', 'adjudication timed out'); });
  let pending;
  try {
    pending = agent(prompt, call);
  } catch (error) {
    finish('kill', 'adjudication could not start');
    return;
  }
  pending.then(function (value) {
    const verdict = parseGuardianVerdict(value);
    if (verdict === undefined) { finish('kill', 'adjudication gave no readable verdict'); return; }
    const reason = value && typeof value === 'object' && typeof value.reason === 'string' ? value.reason : '';
    const guidance = value && typeof value === 'object' && typeof value.guidance === 'string' ? value.guidance : '';
    finish(verdict, reason, guidance);
  }, function () {
    finish('kill', 'adjudication failed');
  });
}

// The verdict parser, mirrored from src/timeout.ts parseGuardianVerdict (pinned
// equal by test/timeout.spec.ts). Unreadable input returns null; the caller
// treats null as a kill.
function parseGuardianVerdict(value) {
  let word = '';
  if (typeof value === 'string') {
    word = value;
  } else if (value && typeof value === 'object') {
    if (typeof value.verdict === 'string') word = value.verdict;
    else if (typeof value.reply === 'string') word = value.reply;
  }
  word = String(word).trim().toLowerCase();
  if (word === 'wait' || word === 'kill' || word === 'rescue') return word;
  return null;
}

// Rule B in one line (mirror of src/timeout.ts guardianWaitMs): the extension is
// the smaller of the wait slice and what the deadline still allows; an unlimited
// run grants the full slice, nothing left means no wait, and a non-wait verdict
// never waits.
function guardianWaitMs(verdict, waits, remainingMs) {
  if (verdict !== 'wait' || waits >= GUARDIAN_MAX_WAITS) return 0;
  if (remainingMs === Infinity) return GUARDIAN_WAIT_MS;
  if (!(typeof remainingMs === 'number') || !isFinite(remainingMs) || remainingMs <= 0) return 0;
  return Math.min(GUARDIAN_WAIT_MS, Math.floor(remainingMs));
}

function isChildTimeout(error) {
  return Boolean(error && typeof error === 'object' && typeof error.message === 'string' && error.message.indexOf('CHILD_TIMEOUT:') === 0);
}

function childTimeoutFailure(role) {
  const minutes = Math.max(1, Math.round(childTimeoutMs / 60000));
  return {
    role: role,
    class: 'timeout',
    reason: routeReason(role + ' call exceeded the ' + minutes + ' minute child budget and was settled as a timeout; retry with a smaller step'),
    // A hung call is not evidence that another model would answer: the task
    // retries with new wording, so the chain stops here instead of advancing.
    switchModel: false,
    // It *is* evidence about this route, though (D-120): the wait was paid once
    // and the route has shown it may hang again, so it moves behind the live
    // routes for the rest of the run. That is a separate decision from
    // switchModel, which is why it is declared here instead of inferred there.
    routeHealth: 'timeout',
    setup: false,
    category: 'infrastructure'
  };
}

// A child that died on the far side of the engine — a provider 5xx, a dropped
// connection, a 429, a refused key — does not come back as a null any more. The
// host seam refuses that activation's own result with this marker, because the
// cause it names is what the child's session recorded and the script has no other
// channel to read it (D-120 修法二). The gate below is deliberately wider than the
// route-health table: five classes travel, and a cancelled run or a real format gap
// keeps the null shape it had.
const CHILD_DEATH_MARKER = 'CHILD_DEATH:';

// The classes the host may mark and this script reads back. One more than
// ROUTE_HEALTH_FAMILIES below, and the difference is the whole point: forwarding a
// death is a decision about the call in hand (a refused key is re-asked once, on
// this same route, and never re-sent in the form corridor's shape), counting it is
// a decision about the route (a refused key is a key). Both tables are pinned by
// test/dead-routes.spec.ts.
const CHILD_DEATH_FAMILIES = { timeout: 1, connection: 1, 'server-error': 1, 'rate-limit': 1, 'model-unavailable': 1 };

// The class a death marker names, or null when the text carries none the host
// is allowed to send. Parsing (rather than trusting a field) because the engine
// re-wraps the rejection into its own AGENT_RESULT message, so what arrives here
// is a sentence — and a class outside the table must never be read out of it.
function childDeathCause(error) {
  const message = safeError(error);
  const at = message.indexOf(CHILD_DEATH_MARKER);
  if (at === -1) return null;
  const rest = message.slice(at + CHILD_DEATH_MARKER.length);
  const cut = rest.indexOf(':');
  const named = (cut === -1 ? rest : rest.slice(0, cut)).trim();
  if (CHILD_DEATH_FAMILIES[named] !== 1) return null;
  return { class: named, cause: cut === -1 ? '' : rest.slice(cut + 1).trim() };
}
const suppliedTasks = args && Array.isArray(args.tasks) ? args.tasks : null;
// Switching policy (阶段5): an empty list means the built-in rule — every
// transport/model class advances the chain, content failures never do.
const switchOn = args && Array.isArray(args.switchOn) ? args.switchOn : [];

// Cross-round carry-over (v0.5). The host compiles the earlier rounds of this
// session into a bounded digest (src/carryover.ts) and passes it here; the script
// clamps it once more, because every child prompt is built from this value and a
// script must not trust a caller's idea of "bounded". The ceiling mirrors
// CARRYOVER_LIMITS.chars in src/carryover.ts (pinned equal by
// test/carryover.spec.ts) — do not edit one side without the other.
const CARRYOVER_MAX_CHARS = 12000;
const carryoverText = (function (value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (trimmed === '') return '';
  if (trimmed.length <= CARRYOVER_MAX_CHARS) return trimmed;
  let cut = CARRYOVER_MAX_CHARS - 1;
  const code = trimmed.charCodeAt(cut - 1);
  if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
  return trimmed.slice(0, cut) + '…';
})(args && args.carryover);

// L1 inheritance (v0.13, Q2): a task-level "what is already done" summary with its
// own 8K budget, physically separate from the conversation digest above so neither
// can squeeze the other out. The ceiling mirrors INHERITANCE_LIMITS.chars in
// src/carryover.ts (pinned by test/inheritance.spec.ts).
const INHERITANCE_MAX_CHARS = 8000;
// Prefix of the block's header, mirrored from INHERITANCE_PREFIX in
// src/carryover.ts (pinned by test/inheritance.spec.ts). It answers one question:
// does the objective the host composed already carry this block? A host that put
// the digest into the objective (src/history.ts composeObjective) must not have the
// planner read the same list twice.
const INHERITANCE_PREFIX = 'INHERITED WORK FROM EARLIER ROUNDS';
const inheritanceText = (function (value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (trimmed === '') return '';
  if (trimmed.length <= INHERITANCE_MAX_CHARS) return trimmed;
  let cut = INHERITANCE_MAX_CHARS - 1;
  const code = trimmed.charCodeAt(cut - 1);
  if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
  return trimmed.slice(0, cut) + '…';
})(args && args.inheritance);

// Captain memory (round-071, 三叠纸): the host reads the three sheets off disk
// (src/captain-memory.ts: short-term progress from the ledger, the long-term user
// profile, and one retrospective line per earlier round) and passes one bounded
// block. The script clamps it once more — every prompt is built from it — and the
// ceiling mirrors CAPTAIN_MEMORY_LIMITS.briefChars there. Absent when nothing is
// remembered, so a first round's payload stays byte-identical to before.
const CAPTAIN_BRIEF_MAX_CHARS = 2400;
const captainText = (function (value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (trimmed === '') return '';
  if (trimmed.length <= CAPTAIN_BRIEF_MAX_CHARS) return trimmed;
  let cut = CAPTAIN_BRIEF_MAX_CHARS - 1;
  const code = trimmed.charCodeAt(cut - 1);
  if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
  return trimmed.slice(0, cut) + '…';
})(args && args.captain);

const ROLE_NAMES = ['planner', 'worker', 'verifier', 'supervisor', 'synthesizer'];
const ROUTE_LIMITS = { chainLength: 50, textChars: 120, trail: 256, reasonChars: 200, routeInFlightMax: 64 };

function text(value, max) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return typeof max === 'number' ? trimmed.slice(0, max) : trimmed;
}

function textList(value, maxItems, maxChars) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (let i = 0; i < value.length && out.length < maxItems; i++) {
    const item = text(value[i], maxChars);
    if (item) out.push(item);
  }
  return out;
}

function objectList(value, mapper, maxItems) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (let i = 0; i < value.length && out.length < maxItems; i++) {
    const mapped = mapper(value[i]);
    if (mapped) out.push(mapped);
  }
  return out;
}

function errorMessage(error) {
  if (error && typeof error === 'object') {
    if (typeof error.message === 'string' && error.message) return error.message;
    if (typeof error.stack === 'string' && error.stack) return error.stack;
  }
  try { return String(error); } catch (_) { return 'unknown error'; }
}

// The workflow script cannot import host code, so prompt-facing redaction is
// kept here as a small mirror of src/redact.ts. It is a safety net for worker
// output and errors that would otherwise be replayed into verifier/retry
// prompts; the host still redacts the final report.
function redactPromptText(value) {
  if (typeof value !== 'string') return value;
  return value
${redactionRulesSource()};
}

function redactPromptValue(value, depth) {
  if (depth > 20) return '[REDACTED: nesting too deep]';
  if (typeof value === 'string') return redactPromptText(value);
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(function (item) { return redactPromptValue(item, depth + 1); });
  const out = {};
  for (const key of Object.keys(value)) out[redactPromptText(key)] = redactPromptValue(value[key], depth + 1);
  return out;
}

function safePromptJson(value) {
  return JSON.stringify(redactPromptValue(value, 0));
}

function safeError(error) {
  return redactPromptText(errorMessage(error));
}

const TASK_LIMITS = {
  objectiveChars: 32000,
  titleChars: 160,
  taskTextChars: 4000,
  criteriaItems: 20,
  criteriaChars: 1000,
  constraintItems: 20,
  constraintChars: 1000,
  writePathItems: 16,
  writePathChars: 300,
  aggregateChars: 48000
};

// Wave 3 (v0.13): a plan is a bounded list of waves. Eight waves is the ceiling
// the design fixed (Q3): one wave per dependency level is enough for any honest
// decomposition, and a plan that needs more is a plan that has not been thought
// through. Over the ceiling the whole plan is rejected (fail-closed) instead of
// being silently truncated, because truncating would drop someone's work item.
// test/waves.spec.ts pins this against the host mirror in src/waves.ts.
const WAVE_LIMIT = 8;
// Dependency edges per task: bounded like every other declared list.
const DEPENDS_ON_LIMIT = 16;

// ---------------------------------------------------------------- routing --
// Per-role ordered fallback chains (v1: script level only, U-2). Each entry is a
// plain {provider, model} pair handed to agent(); the host resolves it. No
// request-error hook is registered, so a failure that the host classifies before
// the request would otherwise bypass routing. The script therefore classifies
// every child failure itself (whitelist + fail-closed) and never turns an
// unclassified failure into a success.
function normalizeChain(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = {};
  for (let index = 0; index < value.length && out.length < ROUTE_LIMITS.chainLength; index++) {
    const entry = value[index];
    if (!entry || typeof entry !== 'object') continue;
    const model = text(entry.model, ROUTE_LIMITS.textChars);
    const provider = text(entry.provider, ROUTE_LIMITS.textChars);
    if (model === '') continue;
    const key = provider + '/' + model;
    if (seen[key]) continue;
    seen[key] = true;
    const route = provider === '' ? { model: model } : { provider: provider, model: model };
    // Per-route in-flight ceiling (overflow, not fallback). Clamp into range;
    // absent or unusable means unlimited. The dedupe key stays provider/model.
    const rawCap = entry.maxInFlight;
    const capIsNumber = typeof rawCap === 'number';
    const capIsText = typeof rawCap === 'string' && rawCap.trim() !== '';
    if (capIsNumber || capIsText) {
      const cap = Number(rawCap);
      if (isFinite(cap)) route.maxInFlight = Math.max(1, Math.min(ROUTE_LIMITS.routeInFlightMax, Math.floor(cap)));
    }
    out.push(route);
  }
  return out;
}

const roleRoutes = (function () {
  const source = args && args.roles && typeof args.roles === 'object' ? args.roles : {};
  const out = {};
  for (let index = 0; index < ROLE_NAMES.length; index++) {
    const role = ROLE_NAMES[index];
    out[role] = normalizeChain(source[role]);
  }
  return out;
})();

// Cross-run hint (C1, approximate): route labels other live runs configured,
// snapshotted host-side at admission. A flagged route is only deprioritized,
// never removed: when every untried route with room is flagged, the first one
// still answers. Absent or empty means "no hint" and the pick below degenerates
// to the original chain order, so reports without a hint are byte-identical to
// before (A16: exact in-flight sub-calls are invisible host-side, hence a
// run-level estimate, never a semaphore).
const ROUTE_HINT_LIMITS = { busy: 64, labelChars: 120 };
const hintBusyRoutes = (function () {
  const out = {};
  const list = args && Array.isArray(args.busyRoutes) ? args.busyRoutes : [];
  let kept = 0;
  for (let i = 0; i < list.length && kept < ROUTE_HINT_LIMITS.busy; i++) {
    if (typeof list[i] !== 'string') continue;
    const label = list[i].trim().slice(0, ROUTE_HINT_LIMITS.labelChars);
    if (label === '' || out[label]) continue;
    out[label] = true;
    kept += 1;
  }
  return out;
})();

function hintBusyLabel(label) {
  return hintBusyRoutes[label] === true;
}

// Layered synthesis policy (Section IV). The verified report is always the base.
// "model" adds one constrained polish call exactly as before. "layered" adds a
// deterministic natural-language base narrative, runs the same constrained polish
// when a synthesizer chain is configured, and falls back to the base narrative
// whenever the model path is unavailable — so the final answer never depends on a
// model being willing or able to answer. The report's synthesis.mode keeps its
// two host-validated values ("deterministic"/"model"): it names whether a polish
// call was in play, never the policy.
const synthesisPolicy = args && typeof args.synthesis === 'string' ? args.synthesis : 'deterministic';
// Output switches. Both are read here with the human-first defaults
// (src/config.ts DEFAULT_HUMAN_SUMMARY / DEFAULT_SHOW_DIAGNOSTICS), so a payload
// that carries neither key — every caller written before the switches existed —
// behaves exactly as it did (T4: switches fixed on/off, but the guest still
// honors explicit args for backward-compatible payloads):
//
//   humanSummary    default true. "false" means machine-only output: no
//                   narrative is built, no synthesizer call is spent, and the
//                   report ships as the whole answer.
//   showDiagnostics default false. "true" appends one bounded provenance line to
//                   the narrative, naming the layer that produced it and why a
//                   polish was dropped. Off, the answer stays human.
const humanSummary = !(args && args.humanSummary === false);
const showDiagnostics = Boolean(args && args.showDiagnostics === true);
const polishAttempted = humanSummary && (synthesisPolicy === 'model' || synthesisPolicy === 'layered') && roleRoutes.synthesizer.length > 0;
const synthesisMode = polishAttempted ? 'model' : 'deterministic';

// Layered-synthesis guardrail bounds. They mirror HARD_LIMITS.synthesisDigestChars
// and HARD_LIMITS.synthesisSummaryChars in src/config.ts (pinned equal by
// test/synthesis-guardrails.spec.ts) — do not edit one side without the other.
const SYNTHESIS_DIGEST_CHARS = 6000;
const SYNTHESIS_SUMMARY_CHARS = 2000;
// The narrative bound is the answer's own size, not a telegraph's: 结果/怎么用/注意
// do not fit in the 200 characters this used to allow, and the delivery lead
// (src/delivery/index.ts MAX_ANSWER_LEAD_CHARS) is sized to the same window so the
// answer travels whole instead of being cut to its first sentence. Chinese is
// counted in characters, English in words, because the same thought costs more
// characters in English and fewer per word.
const SYNTHESIS_NARRATIVE_CHARS = 700;
const SYNTHESIS_NARRATIVE_WORDS = 300;
// Drafts the summary gate may spend (the first draft plus two rewrites). The
// number is interpolated from the host constant so the chain budget and the
// guest's own loop bound stay one value.
const SUMMARY_MAX_ATTEMPTS = ${SUMMARY_MAX_ATTEMPTS};
// One line of reason is all the review marker carries when every draft was rejected:
// enough to say what stopped the gate, never enough to rewrite the ledger line.
const SUMMARY_REVIEW_REASON_CHARS = 300;

const ROUTE_FAILURE_CLASSES = {
  'rate-limit': 1,
  'server-error': 1,
  connection: 1,
  timeout: 1,
  'model-unavailable': 1,
  'format-error': 1,
  'agent-start-failed': 1
};

function routeLabel(route) {
  if (!route) return 'inherit';
  return (route.provider ? route.provider + '/' : '') + route.model;
}

function roleChainLabels(role) {
  const chain = roleRoutes[role];
  const out = [];
  for (let index = 0; index < chain.length; index++) out.push(routeLabel(chain[index]));
  return out;
}

function classifyFailureText(value) {
  const message = String(value || '');
  if (/rate.?limit|too many requests|\b429\b|quota exceeded|resource[_ ]exhausted/i.test(message)) return 'rate-limit';
  if (/\b5\d{2}\b|internal server error|bad gateway|service unavailable|gateway time|overloaded/i.test(message)) return 'server-error';
  if (/ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|network error|fetch failed|connection (reset|refused|closed|dropped)/i.test(message)) return 'connection';
  if (/timed? ?out|timeout|deadline exceeded|aborted/i.test(message)) return 'timeout';
  if (/model .*(not found|not available|does not exist|is unavailable)|unknown model|no adapter|NO_ADAPTER|unsupported model|model_not_found/i.test(message)) return 'model-unavailable';
  // A credential or permission refusal is the same conclusion for a reader: this
  // route cannot answer, so another model or route may. Without this arm a 403 —
  // the most common refusal this plugin meets — classified as 'unknown', which
  // reads as "we do not know what happened" and invites no action. The host mirror
  // in src/child-outcomes.ts keeps the identical table (pinned by test).
  if (/\b40[13]\b|unauthorized|forbidden|invalid api key|invalid_api_key|permission denied/i.test(message)) return 'model-unavailable';
  // The structured-output channel reports itself with an underscore
  // (structured_output) and a parse failure quotes the engine's JSON message
  // (Expected ',' or '}' after property value), so both spellings belong here:
  // without them a quoting mistake in a child's JSON was filed as 'unknown',
  // which reads as a dead provider instead of a re-sendable form error.
  if (/structured[_ ]output|schema (violation|mismatch|mismatched)|invalid (json|output|response)|could not parse|format error|expected ','|expected '}'|expected ':'|expected double-quoted property name|unexpected (end of json|token)/i.test(message)) return 'format-error';
  return 'unknown';
}

function failureCode(error) {
  try {
    if (error && typeof error === 'object' && typeof error.code === 'string') return error.code;
  } catch (_) { /* a hostile getter must not hide the failure */ }
  return '';
}

function routeReason(value) {
  return redactPromptText(String(value || '')).slice(0, ROUTE_LIMITS.reasonChars);
}

// Who has to fix a failure. The category is reported next to the class so a
// reader can tell "the provider was down" (infrastructure: a retry, another
// route or a later run may succeed) from "the work was not good enough"
// (quality: the same route must retry with the same evidence).
function failureCategory(failureClass, code) {
  if (failureClass === 'task-failed' || failureClass === 'verification-failed') return 'quality';
  if (failureClass === 'budget-exhausted') return 'configuration';
  // B-gap (gap-13):配置类统一归 configuration —— 补派判据只看 category,
  // setup 位只决定 attempt 内是否提前 break。集中在这里,判据与 attempt 循环解耦。
  if (failureClass === 'agent-start-failed') return 'configuration';
  // The guest engine raises AGENT_RESULT for a child run that failed, crashed
  // or was disposed. Whatever the text says, the failure came from below the
  // task's own work, so it is infrastructure even when it cannot be classified
  // further (class stays 'unknown' rather than inventing a cause).
  if (code === 'AGENT_RESULT' || code === 'AGENT_START') return 'infrastructure';
  if (failureClass === 'unknown') return 'unknown';
  return 'infrastructure';
}

function classifyCallFailure(role, error) {
  const code = failureCode(error);
  const message = safeError(error);
  // A child that died on the far side of the engine — a transport failure or a
  // refused key: the host seam refused this activation's result and named the
  // class, because the cause it carries is the child session's own and the null the
  // engine used to return cannot skip a dead route or stop a resubmit (D-120 修法二).
  // The class is the host's, not a reading of the sentence, so the reason keeps the
  // provider's words.
  const death = childDeathCause(error);
  if (death !== null) {
    const advances = switchOn.length === 0 ? true : switchOn.indexOf(death.class) !== -1;
    return {
      role: role,
      class: death.class,
      reason: routeReason(role + ' call produced no result: ' + (death.cause === '' ? 'the child run ended abnormally' : death.cause)),
      switchModel: advances,
      routeHealth: routeHealthFamilyOf(death.class, advances),
      setup: false,
      category: 'infrastructure'
    };
  }
  // Budget and configuration faults are not model faults: another model cannot
  // fix them, and retrying would hide a broken setup or a runaway script. They
  // are marked "setup" so the caller stops retrying — but they are never
  // rethrown: a broken setup must still yield a failure report (G-4).
  if (code === 'AGENT_CAP') {
    return { role: role, class: 'budget-exhausted', reason: routeReason(message), switchModel: false, routeHealth: '', setup: true, category: 'configuration' };
  }
  if (code === 'UNSUPPORTED_OPTION' || code === 'INVALID_ARGUMENT' || code === 'UNSUPPORTED_SCHEMA' || code === 'SCRIPT_PARSE' || code === 'ITEM_CAP') {
    return { role: role, class: 'unknown', reason: routeReason(message), switchModel: false, routeHealth: '', setup: true, category: 'configuration' };
  }
  if (code === 'AGENT_START') {
    return {
      role: role,
      class: 'agent-start-failed',
      reason: routeReason(message),
      switchModel: switchOn.length === 0 ? true : switchOn.indexOf('agent-start-failed') !== -1,
      routeHealth: '',
      setup: false,
      category: 'infrastructure'
    };
  }
  const failureClass = classifyFailureText(message);
  const advances = switchOn.length === 0 ? true : switchOn.indexOf(failureClass) !== -1;
  return {
    role: role,
    class: failureClass,
    reason: routeReason(message),
    switchModel: advances,
    routeHealth: routeHealthFamilyOf(failureClass, advances),
    setup: false,
    category: failureCategory(failureClass, code)
  };
}

const routeTrail = [];

// Route health (dead routes). A route that fails the same kind of *transport*
// failure twice in a row, with no answer in between, moves behind every live
// route for the rest of the run. The motive is cost, not blame: in a three-route
// chain a dead route takes one child call per task — and one whole child-call
// stall, when it hangs instead of refusing — before the chain moves on, and the
// task tells the reader nothing new by paying it.
//
// The table is deliberately narrow. Only families where "the transport failed,
// this route may work later" is an honest reading count:
//   timeout / connection / server-error / rate-limit
// The rest say something a second failure cannot change: a credential refusal
// (401/403, classified model-unavailable) needs a key, not a different route; a
// missing structured result (format-error) is the child's form, not the
// transport; an engine that could not start a child (agent-start-failed) never
// reached the provider; an unknown class is not evidence at all. An inherited
// call has no chain position to prefer, so the inherit label never enters it.
//
// rate-limit stays in the table but follows the operator's 429 switch
// (switchOn): when the switch says a 429 keeps its route, the task retries the
// same route on the next attempt, so a 429 says "busy right now", not "this
// route is dead". Every failure that belongs here says so itself, in its own
// routeHealth field — see routeHealthFamilyOf below for why switchModel is
// not the gate.
const ROUTE_HEALTH_LIMITS = { streak: 2, routes: 16 };
const ROUTE_HEALTH_FAMILIES = { timeout: 1, connection: 1, 'server-error': 1, 'rate-limit': 1 };
// label -> { family, streak }: consecutive counted failures, no answer between.
const routeHealth = {};
// Dead routes, in the order they died (oldest first). Bounded, and past the bound
// the oldest evidence is the one that goes.
const deadRouteOrder = [];
const deadRoutes = {};

// Whether a failure is *evidence about the route* for a family that counts.
// This is a decision of its own and not a reading of switchModel (D-120): the
// two questions differ. switchModel answers "does this task move to another
// route right now?"; route health answers "should this route go last for the
// rest of the run?". A hung call answers yes to the second and no to the first,
// and reading switchModel here therefore lost every timeout the run ever saw —
// measured on the real engine: 8 timeout rows, an empty table. Only the 429
// still follows the operator's switch (D-119: a 429 the switch keeps on its
// route says "busy right now", not "this route is dead").
function routeHealthFamilyOf(failureClass, switchModel) {
  if (ROUTE_HEALTH_FAMILIES[failureClass] !== 1) return '';
  if (failureClass === 'rate-limit' && switchModel !== true) return '';
  return failureClass;
}

function routeHealthFamily(failure) {
  try {
    if (!failure) return '';
    const declared = failure.routeHealth;
    return ROUTE_HEALTH_FAMILIES[declared] === 1 ? declared : '';
  } catch (_) { return ''; }
}

// Whether a call DIED as a refusal instead of answering: the route would not
// serve this call at all. The class is the whole test — 'model-unavailable' is
// what a refused key (401/403) and a model this route does not have both
// classify as, because the conclusion a reader has to act on is the same: this
// route did not answer.
//
// It is deliberately kept OUT of route health (D-164). A refusal must never
// move the route behind the live ones: a second failure cannot supply what a
// key needs, and a route that answered "not this model" once answers it again.
// But a refusal is still an ask that made no answer, and the refusal is often
// about the request rather than the route — a gateway that mints its own
// upstream credential answers 401 to the first call after a rotation and serves
// the next one. So the two corridors that can afford one more call spend it:
// a judge death costs the whole attempt (the worker is re-run for a verdict
// nobody made) and a planner death costs the plan. Measured on this machine,
// 2026-11-26: a 401 to the first planning call, a served answer to the second,
// same route.
function refusalDeath(failure) {
  try {
    if (!failure) return false;
    if (failure.setup === true) return false;
    return failure.class === 'model-unavailable';
  } catch (_) { return false; }
}

// Whether a judging leg's call made NO answer at all — the transport died, or
// the route refused to serve it (refusalDeath) — so a judgement never happened
// and can be asked for again inside the SAME attempt, while the worker's result
// is the expensive thing this corridor exists to keep. Only the two judges
// qualify (D-054 precedent, second cut). The transport half is the codebase's
// own D-120 spelling of "the route died" — the failure itself declares route
// evidence (timeout, connection, server-error, or a 429 the operator's switch
// keeps on its route) — and the corridor deliberately excludes the two answers
// that are not deaths: a missing structured result is the form corridor's case,
// and a negative verdict is the judge's own answer, which a second ask can only
// repeat.
function judgeLegTransportDeath(failure, role) {
  if (!failure || failure.role !== role) return false;
  if (failure.class === 'format-error' || failure.class === 'verification-failed') return false;
  if (failure.setup === true) return false;
  return routeHealthFamily(failure) !== '' || refusalDeath(failure);
}

// What the re-fire above is reacting to, for the one log line it writes. A
// reader who sees "re-fired" and then a 401 twice should be told which of the
// two deaths this was: the wire failed, or the route refused to serve the call.
function judgeLegDeathWord(failure) {
  return routeHealthFamily(failure) !== '' ? 'a transport death' : 'a refusal';
}

function forgetDeadRoute(label) {
  if (!deadRoutes[label]) return;
  delete deadRoutes[label];
  const at = deadRouteOrder.indexOf(label);
  if (at !== -1) deadRouteOrder.splice(at, 1);
}

// Bookkeeping must never fail a call: a failure object with a hostile getter
// would otherwise turn a reported failure into a thrown one, which is the one
// thing the routing layer exists to prevent (G-4).
function noteRouteFailure(route, failure) {
  try {
    const label = routeLabel(route);
    if (label === 'inherit') return;
    const family = routeHealthFamily(failure);
    // Not evidence about this route: the streak stays where it is. Only an
    // answer clears it (noteRouteSuccess) — an uncounted failure neither adds
    // evidence nor erases the evidence a counted one already gave.
    if (family === '') return;
    const prior = routeHealth[label];
    const streak = (prior ? prior.streak : 0) + 1;
    routeHealth[label] = { family: family, streak: streak };
    if (streak < ROUTE_HEALTH_LIMITS.streak) {
      forgetDeadRoute(label);
      return;
    }
    if (!deadRoutes[label]) deadRouteOrder.push(label);
    deadRoutes[label] = { family: family, streak: streak };
    while (deadRouteOrder.length > ROUTE_HEALTH_LIMITS.routes) {
      const oldest = deadRouteOrder.shift();
      if (oldest) delete deadRoutes[oldest];
    }
  } catch (_) { /* a bookkeeping fault must not fail the call */ }
}

function noteRouteSuccess(route) {
  try {
    const label = routeLabel(route);
    if (label === 'inherit') return;
    delete routeHealth[label];
    forgetDeadRoute(label);
  } catch (_) { /* a bookkeeping fault must not fail the call */ }
}

function isDeadRoute(route) {
  try {
    const label = routeLabel(route);
    return label !== 'inherit' && deadRoutes[label] !== undefined;
  } catch (_) { return false; }
}

// Per-route in-flight counts, keyed by route label. A capped route that is
// full overflows to the next chain entry instead of queueing on it; only when
// every untried route is full does the call wait for a drain (one wake per
// drain, no busy polling). A full lane is never a failure: it costs no
// attempt and advances no fallback.
const routeInFlight = {};
const routeWaiters = [];

function routeCapOf(route) {
  if (!route) return Infinity;
  const cap = Number(route.maxInFlight);
  if (!isFinite(cap)) return Infinity;
  return Math.max(1, Math.min(ROUTE_LIMITS.routeInFlightMax, Math.floor(cap)));
}

function notifyRouteWaiters() {
  while (routeWaiters.length > 0) {
    const wake = routeWaiters.shift();
    try { wake(); } catch (_) { /* a stale waiter must not break the drain */ }
  }
}

function nowMs() {
  try { return Date.now(); } catch (_) { return 0; }
}

`;
}
