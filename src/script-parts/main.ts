import { TASK_LIMITS } from '../input.js'
import { FIXED_HUMAN_SUMMARY, FIXED_SHOW_DIAGNOSTICS, FIXED_SWITCH_ON, FIXED_SWITCH_ON_WITHOUT_RATE_LIMIT } from '../config.js'
import { CARRYOVER_LIMITS, INHERITANCE_LIMITS } from '../carryover.js'
import { GUARDIAN_MAX_WAITS } from '../timeout.js'
import { shardCountFor } from '../shards.js'
import { REPLAN_LIMITS } from '../replan.js'
import { STEERING_TOOL_NAME } from '../steering.js'
import { CAPTAIN_MEMORY_LIMITS } from '../captain-memory.js'
import { phaseLabel, runTitle } from '../naming.js'
import type { NamingLanguage } from '../naming.js'
import type { FailureClass, ModelRoute, NormalizedTask, ResolvedConfig, RoleName, SynthesisPolicy } from '../types.js'
import { SUMMARY_MAX_ATTEMPTS, PLANNER_LEG_CALLS } from './params.js'
import { guestParams } from './params.js'
import { guestRouting } from './routing.js'
import { guestPlanNorm } from './plan-norm.js'
import { guestPrompts } from './prompts.js'
import { guestSchemas } from './schemas.js'
import { guestSynthesize } from './synthesize.js'
import { guestWaves } from './waves.js'
import { guestReplan } from './replan.js'

export function guestMain(): string {
  return String.raw`// One wave, at most limit tasks in flight. Entries carry the *plan* position so
// the panel's group header (任务 n · 标题) stays the task's plan position rather
// than its position inside the wave, and the upstream block its worker receives.
function runWave(tasks, positions, limit, upstreamById) {
  const entries = [];
  for (let i = 0; i < tasks.length; i++) {
    entries.push({
      task: tasks[i],
      index: typeof positions[tasks[i].id] === 'number' ? positions[tasks[i].id] : i,
      writesPaths: tasks[i].writesPaths,
      upstream: upstreamById && typeof upstreamById[tasks[i].id] === 'string' ? upstreamById[tasks[i].id] : ''
    });
  }
  const runner = function (entry) { return runTask(entry.task, entry.index, entry.upstream); };
  return hasDeclaredPaths(tasks)
    ? mapLimitIsolated(entries, limit, runner)
    : mapLimit(entries, limit, runner);
}

// The waves of one plan, as task lists. Falls back to a single wave for a plan
// that carries no wave structure (a caller plan, or a report from before waves).
function planWaveTasks(planTasks, waves) {
  if (!Array.isArray(waves) || waves.length === 0) return [planTasks.slice()];
  const byId = {};
  for (let i = 0; i < planTasks.length; i++) byId[planTasks[i].id] = planTasks[i];
  const out = [];
  for (let w = 0; w < waves.length; w++) {
    const list = [];
    const ids = Array.isArray(waves[w]) ? waves[w] : [];
    for (let i = 0; i < ids.length; i++) {
      const task = byId[ids[i]];
      if (task) list.push(task);
    }
    if (list.length > 0) out.push(list);
  }
  return out.length === 0 ? [planTasks.slice()] : out;
}

// The scheduler: wave by wave, in order, and blocked contagion before each wave
// starts. A dependency is satisfied only by verified (S2b) — a failed *or*
// blocked upstream blocks its dependents, so a downstream task can never run
// against work that did not happen. A verified upstream still has to hand over
// evidence (S4); a dependency that verified with nothing to show fails its
// dependents instead of feeding them a self-report.
//
// Mid-run replan rides the wave boundary: after a wave settles and before the next
// one starts, the boundary planner may merge a demand that arrived while the wave
// was running into the *remaining* waves. Settled results stay exactly as they
// were, the running wave has already finished, and the next iteration executes the
// updated task set. A refused merge leaves current untouched.
async function runWaves(waves, positions, limit, stopOnFailure) {
  const settled = {};
  let current = waves;
  let version = 1;
  const replans = [];
  let nextPosition = 0;
  for (const known in positions) {
    if (typeof positions[known] === 'number' && positions[known] + 1 > nextPosition) nextPosition = positions[known] + 1;
  }
  for (let w = 0; w < current.length; w++) {
    const wave = current[w];
    const runnable = [];
    const upstreamById = {};
    for (let i = 0; i < wave.length; i++) {
      const task = wave[i];
      const deps = task.dependsOn || [];
      const unverified = [];
      for (let d = 0; d < deps.length; d++) {
        const upstream = settled[deps[d]];
        if (!upstream || upstream.status !== 'verified') unverified.push(deps[d]);
      }
      if (unverified.length > 0) {
        settled[task.id] = blockedResult(task, unverified);
        log('task ' + task.id + ' blocked by ' + unverified.join(', '));
        continue;
      }
      const digest = upstreamDigest(upstreamSourcesOf(task, settled), deps, UPSTREAM_LIMITS);
      if (digest.missing.length > 0) {
        settled[task.id] = contractFailure(task, digest.missing);
        log('task ' + task.id + ' failed: no upstream evidence from ' + digest.missing.join(', '));
        continue;
      }
      upstreamById[task.id] = digest.text;
      runnable.push(task);
    }
    if (runnable.length > 0) {
      // Settlement-triggered advance: this await resolves when the last task of the
      // wave settles, and the loop then starts the next wave. No timer, no polling.
      const waveResults = await runWave(runnable, positions, limit, upstreamById);
      for (let i = 0; i < waveResults.length; i++) {
        const result = waveResults[i];
        if (result && result.task) settled[result.task.id] = result;
      }
    }
    // The captain's continue/stop call (round-071). This is the one place the
    // script used to hold a hard rule — "a failed task never stops the rest" — and
    // it is now the planner's decision, carried on the plan as onFailure. When it
    // says stop, every task that has not started is reported as a stopped row
    // (never silently dropped: the report requires a row per plan task) and the
    // remaining waves are not dispatched.
    if (stopOnFailure) {
      const failedIds = [];
      for (let i = 0; i < wave.length; i++) {
        const row = settled[wave[i].id];
        if (row && row.status !== 'verified') failedIds.push(wave[i].id);
      }
      if (failedIds.length > 0 && w + 1 < current.length) {
        for (let r = w + 1; r < current.length; r++) {
          for (let t = 0; t < current[r].length; t++) {
            settled[current[r][t].id] = captainStopResult(current[r][t], failedIds);
          }
        }
        log('captain stop after wave ' + (w + 1) + ': ' + failedIds.join(', ') + ' did not verify; ' + (current.length - w - 1) + ' wave(s) not dispatched');
        break;
      }
    }
    // Boundary: the wave has fully settled, so every settled row is terminal and
    // nothing is in flight. That is exactly the window where a new demand can be
    // merged without losing a row or abandoning a child call.
    if (w + 1 < current.length && replanChannel !== null) {
      const remaining = current.slice(w + 1);
      // The boundary prompt prints each settled row's verdict and title, so the
      // rows themselves travel — a bare id -> status map reached the renderer as a
      // string and every settled line printed "[undefined] ".
      const outcome = await requestReplan(w, remaining, settled, version);
      if (outcome !== null) {
        if (outcome.ok) {
          current = current.slice(0, w + 1).concat(outcome.waves);
          version = outcome.version;
          for (let a = 0; a < outcome.addedTaskIds.length; a++) {
            const id = outcome.addedTaskIds[a];
            if (typeof positions[id] !== 'number') {
              positions[id] = nextPosition;
              nextPosition += 1;
            }
          }
          replans.push({
            version: version,
            wave: w + 1,
            decision: 'applied',
            reason: outcome.decisions.join('; '),
            addedTaskIds: outcome.addedTaskIds,
            updatedTaskIds: outcome.updatedTaskIds,
            removedTaskIds: outcome.removedTaskIds,
            reordered: outcome.reordered
          });
          log('replan v' + version + ' applied at wave ' + (w + 1) + ' boundary: ' + outcome.decisions.join('; '));
        } else {
          replans.push({
            version: version + 1,
            wave: w + 1,
            decision: outcome.none ? 'none' : 'rejected',
            reason: outcome.reason,
            addedTaskIds: [],
            updatedTaskIds: [],
            removedTaskIds: [],
            reordered: false
          });
          log('replan at wave ' + (w + 1) + ' boundary: ' + (outcome.none ? 'no plan change' : 'rejected: ' + outcome.reason));
        }
      }
    }
  }
  const ordered = [];
  for (let w = 0; w < current.length; w++) {
    for (let t = 0; t < current[w].length; t++) {
      const result = settled[current[w][t].id];
      if (result) ordered.push(result);
    }
  }
  return { results: ordered, waves: current, version: version, replans: replans };
}

async function runTaskUnsafe(task, taskIndex, upstreamText) {
  // The pool hands out a 0-based slot; the group header numbers tasks from 1 and
  // that position is what makes a group stable and unique (Issue #22 P1-1).
  const taskPosition = (typeof taskIndex === 'number' && taskIndex >= 0 ? taskIndex : 0) + 1;
  const attempts = [];
  const maxAttempts = maxRetries + 1;
  let lastError = '';
  let lastFailure = null;
  let previous = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let execution = null;
    let verification = null;
    let executionError = '';
    let verifyError = '';
    let attemptRoute = '';
    let attemptFailure = null;
    try {
      const worker = await callRole('worker', workerPrompt(task, attempt, previous, upstreamText), {
        schema: EXECUTION_SCHEMA,
        label: memberLabel('worker', attempt),
        phase: taskGroupTitle(taskPosition, task.title),
        attempt: attempt,
        writesPaths: task.writesPaths,
        taskId: task.id
      });
      if (worker.ok) {
        attemptRoute = worker.label;
        execution = normalizeExecution(worker.value);
        if (!execution) {
          executionError = 'worker returned no valid structured result';
          attemptFailure = { role: 'worker', class: 'format-error', reason: executionError, switchModel: false, setup: false, category: 'infrastructure' };
        }
      } else {
        attemptFailure = worker.failure;
        executionError = 'worker failed on every route: [' + worker.failure.class + '] ' + worker.failure.reason;
      }
    } catch (error) {
      // Only an unexpected throw (a bug in this script, not a child failure)
      // arrives here; it is still recorded per attempt instead of aborting.
      executionError = 'worker failed: ' + safeError(error);
      attemptFailure = classifyCallFailure('worker', error);
    }
    // Resubmission (A): the worker call produced no structured result, so this
    // attempt has nothing to verify yet. Before spending a retry, ask once more
    // in the SAME attempt: the prompt forbids redoing completed work, so a
    // child that already fetched its data only pays one short submit call
    // instead of a full retry. Only format gaps qualify — a transport/model
    // failure, a setup fault, or an explicit non-format failure keeps its
    // original path. One resubmit per attempt at most; a second miss records
    // the attempt as failed and the normal retry policy applies.
    let resubmitted = false;
    let judgeRetried = false;
    if (!execution && attemptFailure && attemptFailure.class === 'format-error' && !attemptFailure.setup) {
      try {
        const resubmit = await callRole('worker', resubmitPrompt(task, attempt, previous, upstreamText), {
          schema: EXECUTION_SCHEMA,
          label: memberLabel('worker', attempt),
          phase: taskGroupTitle(taskPosition, task.title),
          attempt: attempt,
          writesPaths: task.writesPaths,
          taskId: task.id
        });
        if (resubmit.ok) {
          const resubmittedExecution = normalizeExecution(resubmit.value);
          if (resubmittedExecution) {
            execution = resubmittedExecution;
            resubmitted = true;
            if (attemptRoute === '') attemptRoute = resubmit.label;
            attemptFailure = null;
            executionError = '';
            log('task ' + task.id + ' attempt ' + attempt + ' resubmitted structured result');
          }
        }
        // A failed or still-empty resubmit keeps the original failure: the
        // attempt below records it and the retry policy is untouched.
      } catch (error) {
        // The resubmit itself must never create a new failure mode; the
        // original format failure stands and the attempt fails normally.
      }
    }
    if (execution) {
      try {
        const verifier = await callRole('verifier', verifierPrompt(task, execution, attempt), {
          schema: VERIFICATION_SCHEMA,
          label: memberLabel('verifier', attempt),
          phase: taskGroupTitle(taskPosition, task.title),
          attempt: attempt,
          writesPaths: task.writesPaths,
          taskId: task.id
        });
        if (verifier.ok) {
          if (attemptRoute === '') attemptRoute = verifier.label;
          verification = normalizeVerification(verifier.value);
          if (!verification) {
            verifyError = 'verifier returned no valid structured result';
            attemptFailure = { role: 'verifier', class: 'format-error', reason: verifyError, switchModel: false, setup: false, category: 'infrastructure' };
          } else {
            const failed = verificationFailure(task, execution, verification, 'verifier');
            if (failed) {
              // Content failure: the same route is retried, because another
              // model would be given the same evidence.
              verifyError = failed.reason;
              attemptFailure = failed;
            }
          }
        } else {
          attemptFailure = verifier.failure;
          verifyError = 'verifier failed on every route: [' + verifier.failure.class + '] ' + verifier.failure.reason;
        }
      } catch (error) {
        verifyError = 'verifier failed: ' + safeError(error);
        attemptFailure = classifyCallFailure('verifier', error);
      }
      // Re-fire (D): the judging leg DIED of a transport failure — the route
      // timed out, dropped the connection, answered 5xx, or answered a 429 while
      // the operator's switch keeps it on its route — so no judgement was made at
      // all. The worker's execution result is still the work that was done, so
      // spending the retry would re-run the expensive leg for a verdict nobody
      // made: ask the same judge once more inside the SAME attempt. Only the
      // route-health families qualify; a missing form is corridor B's case below,
      // and a negative verdict is the judge's own answer.
      if (!verification && judgeLegTransportDeath(attemptFailure, 'verifier')) {
        judgeRetried = true;
        log('task ' + task.id + ' attempt ' + attempt + ' verifier re-fired after ' + judgeLegDeathWord(attemptFailure));
        try {
          const refire = await callRole('verifier', verifierResubmitPrompt(task, execution, attempt, true), {
            schema: VERIFICATION_SCHEMA,
            label: memberLabel('verifier', attempt),
            phase: taskGroupTitle(taskPosition, task.title),
            attempt: attempt,
            writesPaths: task.writesPaths,
            taskId: task.id
          });
          if (refire.ok) {
            const refiredVerification = normalizeVerification(refire.value);
            if (refiredVerification) {
              verification = refiredVerification;
              if (attemptRoute === '') attemptRoute = refire.label;
              attemptFailure = null;
              verifyError = '';
              const failed = verificationFailure(task, execution, verification, 'verifier');
              if (failed) {
                verifyError = failed.reason;
                attemptFailure = failed;
              }
            } else {
              // Nothing usable came back: that is the form gap corridor B already
              // owns, so record it as such and let the corridor below ask once.
              verifyError = 'verifier returned no valid structured result';
              attemptFailure = { role: 'verifier', class: 'format-error', reason: verifyError, switchModel: false, setup: false, category: 'infrastructure' };
            }
          }
          // A re-fire that died again keeps the original transport failure: the
          // attempt below records it and the retry policy is untouched.
        } catch (error) {
          // The re-fire itself must never create a new failure mode; the original
          // transport failure stands and the attempt fails normally.
        }
      }
      // Resubmission (B): the verifier produced no usable judgement. The engine
      // hands back null whenever a child's structured output cannot be parsed —
      // one unescaped ASCII double quote inside a JSON string is enough — and
      // session-6cd6053d lost a verdict that was really pass that way. Judging
      // is not the work, so a missing form spends no retry: ask once in the SAME
      // attempt for the same verdict and the same evidence, quoted safely.
      if (!verification && attemptFailure && attemptFailure.role === 'verifier' && attemptFailure.class === 'format-error' && !attemptFailure.setup) {
        try {
          const resubmit = await callRole('verifier', verifierResubmitPrompt(task, execution, attempt), {
            schema: VERIFICATION_SCHEMA,
            label: memberLabel('verifier', attempt),
            phase: taskGroupTitle(taskPosition, task.title),
            attempt: attempt,
            writesPaths: task.writesPaths,
            taskId: task.id
          });
          if (resubmit.ok) {
            const resubmittedVerification = normalizeVerification(resubmit.value);
            if (resubmittedVerification) {
              verification = resubmittedVerification;
              if (attemptRoute === '') attemptRoute = resubmit.label;
              attemptFailure = null;
              verifyError = '';
              log('task ' + task.id + ' attempt ' + attempt + ' verifier resubmitted structured result');
              const failed = verificationFailure(task, execution, verification, 'verifier');
              if (failed) {
                verifyError = failed.reason;
                attemptFailure = failed;
              }
            }
          }
          // A failed or still-empty resubmit keeps the original failure: the
          // attempt below records it and the retry policy is untouched.
        } catch (error) {
          // The resubmit itself must never create a new failure mode; the
          // original format failure stands and the attempt fails normally.
        }
      }
    } else {
      verifyError = 'verification skipped: no execution result';
    }
    // Supervisor gate (per task per attempt, same cadence as the verifier):
    // runs after verify and only when a supervisor chain is configured, so a
    // run without one behaves exactly as before. It can only fail an attempt,
    // never pass one: a verifier failure stands even when supervision passes.
    if (execution && roleRoutes.supervisor.length > 0) {
      try {
        const supervision = await callRole('supervisor', supervisorPrompt(task, execution, verification, attempt), {
          schema: VERIFICATION_SCHEMA,
          label: memberLabel('supervisor'),
          phase: taskGroupTitle(taskPosition, task.title),
          attempt: attempt,
          writesPaths: task.writesPaths,
          taskId: task.id
        });
        if (supervision.ok) {
          const supervised = normalizeVerification(supervision.value);
          if (!supervised) {
            verifyError = 'supervisor returned no valid structured result';
            attemptFailure = { role: 'supervisor', class: 'format-error', reason: verifyError, switchModel: false, setup: false, category: 'infrastructure' };
          } else {
            const failed = verificationFailure(task, execution, supervised, 'supervisor');
            if (failed) {
              verifyError = failed.reason;
              attemptFailure = failed;
            }
          }
        } else {
          attemptFailure = supervision.failure;
          verifyError = 'supervisor failed on every route: [' + supervision.failure.class + '] ' + supervision.failure.reason;
        }
      } catch (error) {
        verifyError = 'supervisor failed: ' + safeError(error);
        attemptFailure = classifyCallFailure('supervisor', error);
      }
      // Re-fire (D) for the supervision leg: same rule as the verifier — a
      // supervision call that died of the transport made no judgement, so it is
      // asked again inside the SAME attempt instead of re-running the worker.
      if (judgeLegTransportDeath(attemptFailure, 'supervisor')) {
        judgeRetried = true;
        log('task ' + task.id + ' attempt ' + attempt + ' supervisor re-fired after ' + judgeLegDeathWord(attemptFailure));
        try {
          const refire = await callRole('supervisor', supervisorResubmitPrompt(task, execution, verification, attempt, true), {
            schema: VERIFICATION_SCHEMA,
            label: memberLabel('supervisor'),
            phase: taskGroupTitle(taskPosition, task.title),
            attempt: attempt,
            writesPaths: task.writesPaths,
            taskId: task.id
          });
          if (refire.ok) {
            const refiredSupervision = normalizeVerification(refire.value);
            if (refiredSupervision) {
              if (attemptRoute === '') attemptRoute = refire.label;
              attemptFailure = null;
              verifyError = '';
              const failed = verificationFailure(task, execution, refiredSupervision, 'supervisor');
              if (failed) {
                verifyError = failed.reason;
                attemptFailure = failed;
              }
            } else {
              // Same handling as the verifier: the form gap corridor C owns below.
              verifyError = 'supervisor returned no valid structured result';
              attemptFailure = { role: 'supervisor', class: 'format-error', reason: verifyError, switchModel: false, setup: false, category: 'infrastructure' };
            }
          }
          // A re-fire that died again keeps the original transport failure; the
          // attempt below records it and the retry policy is untouched.
        } catch (error) {
          // The re-fire itself must never create a new failure mode.
        }
      }
      // Resubmission (C): same rule as the verifier — a supervision judgement
      // that arrived in an unparsable form is a missing form, not missing work.
      if (attemptFailure && attemptFailure.role === 'supervisor' && attemptFailure.class === 'format-error' && !attemptFailure.setup) {
        try {
          const resubmit = await callRole('supervisor', supervisorResubmitPrompt(task, execution, verification, attempt), {
            schema: VERIFICATION_SCHEMA,
            label: memberLabel('supervisor'),
            phase: taskGroupTitle(taskPosition, task.title),
            attempt: attempt,
            writesPaths: task.writesPaths,
            taskId: task.id
          });
          if (resubmit.ok) {
            const resubmitted = normalizeVerification(resubmit.value);
            if (resubmitted) {
              if (attemptRoute === '') attemptRoute = resubmit.label;
              attemptFailure = null;
              verifyError = '';
              log('task ' + task.id + ' attempt ' + attempt + ' supervisor resubmitted structured result');
              const failed = verificationFailure(task, execution, resubmitted, 'supervisor');
              if (failed) {
                verifyError = failed.reason;
                attemptFailure = failed;
              }
            }
          }
          // A failed or still-empty resubmit keeps the original failure; the
          // attempt below records it and the retry policy is untouched.
        } catch (error) {
          // The resubmit itself must never create a new failure mode.
        }
      }
    }
    const passed = Boolean(verification) && verifyError === '';
    const attemptRecord = {
      attempt: attempt,
      execution: execution,
      verification: verification,
      passed: passed
    };
    if (attemptRoute !== '') attemptRecord.route = attemptRoute;
    if (resubmitted) attemptRecord.resubmitted = true;
    if (judgeRetried) attemptRecord.judgeRetried = true;
    if (attemptFailure) {
      attemptRecord.failure = { class: attemptFailure.class, reason: routeReason(attemptFailure.reason), category: attemptFailure.category };
      // Carried to the task row below: the report keeps one category per failed
      // task, so the incomplete list says who has to fix it (G-4).
      lastFailure = attemptRecord.failure;
    }
    attemptRecord.error = executionError || verifyError || '';
    attempts.push(attemptRecord);
    if (passed) {
      log('task ' + task.id + ' verified on attempt ' + attempt);
      return { task: task, status: 'verified', attempts: attempts, error: '' };
    }
    lastError = redactPromptText(executionError || verifyError || 'verification failed');
    previous = { execution: execution, verification: verification, error: lastError };
    if (attemptFailure && attemptFailure.setup) {
      // A setup fault repeats by definition (a cap, a bad option, a bad schema):
      // spending the remaining attempts would only burn budget.
      log('task ' + task.id + ' stopped after a setup fault: ' + attemptFailure.class);
      break;
    }
    if (attempt < maxAttempts) log('task ' + task.id + ' attempt ' + attempt + ' failed; retrying');
  }
  return { task: task, status: 'failed', attempts: attempts, error: lastError, failure: lastFailure };
}

// One synthetic attempt for a task whose runner crashed before it could record
// anything. Report validation requires at least one attempt per task row, and a
// report that fails validation is rejected wholesale — every other task's
// evidence dies with it (G-4). The attempt carries the classified failure, so
// the summary still says what happened, and its class stays "unknown" for a bug
// in this script instead of blaming the provider.
function abortedAttempt(failure, errorText) {
  return {
    attempt: 1,
    execution: null,
    verification: null,
    passed: false,
    failure: { class: failure.class, reason: routeReason(failure.reason), category: failure.category },
    error: errorText
  };
}

// A task's own failure never escapes this function: the per-task report (and
// every other task's result) must survive an infrastructure fault (G-4). The
// only way to reach the catch is a bug in runTaskUnsafe, which is still
// reported as that task's failure rather than as a bare exception.
async function runTask(task, index, upstreamText) {
  try {
    return await runTaskUnsafe(task, index, upstreamText);
  } catch (error) {
    const failure = classifyCallFailure('worker', error);
    const text = redactPromptText('task aborted before any attempt: [' + failure.class + '/' + failure.category + '] ' + failure.reason);
    return {
      task: task,
      status: 'failed',
      attempts: [abortedAttempt(failure, text)],
      error: text,
      failure: failure
    };
  }
}

phase(phaseLabel('plan'));
let plan = null;
let planFailure = null;
let planError = '';
if (suppliedTasks && suppliedTasks.length > 0) {
  plan = normalizePlan({ tasks: suppliedTasks }, 'caller');
  if (!plan) planError = 'caller tasks were invalid after host validation' + (planRejection === '' ? '' : ': ' + planRejection);
} else {
  // The planning leg asks three times at most, and none of those asks is a retry:
  // maxRetries belongs to task attempts, so a plan that only had a quoting
  // mistake or a provider hiccup would otherwise degrade to the fallback split
  // (which can never report the objective as completed) before anyone re-asked.
  //   A. the first ask, along the chain;
  //   B. one same-call resubmit when the answer was unusable in FORM — the same
  //      rule the worker and the verifier already follow (a form gap spends no
  //      retry; it is re-askable);
  //   C. one re-fire when the call made no answer at all. A hung call declares
  //      switchModel false, so the chain stops there and the plan never sees the
  //      next route; a 5xx advances the chain but leaves nothing for a second
  //      pass. The re-fire spends routes this leg has not paid yet, and falls back
  //      to the same chain only for a death that costs one call to repeat — a
  //      hung route is never re-waited for the whole child budget on no evidence.
  //      A refusal (refusalDeath, D-164) takes the same corridor but only one
  //      route: it is repeated once on the route that refused, never walked.
  const plannerCall = function (prompt, avoid) {
    return callRole('planner', prompt, {
      schema: PLAN_SCHEMA,
      label: plannerCallLabel(1),
      phase: phaseLabel('plan'),
      attempt: 0,
      avoid: avoid
    });
  };
  const plannerSpent = [];
  // One ask. Returns the reason the answer was unusable in *form* (empty for
  // every other outcome), which is what corridor B keys on, and folds the routes
  // this call paid into plannerSpent for corridor C.
  const askPlanner = async function (prompt, avoid) {
    let planned = null;
    try {
      planned = await plannerCall(prompt, avoid);
    } catch (error) {
      planFailure = classifyCallFailure('planner', error);
      planError = 'planner failed: ' + errorMessage(error);
      return '';
    }
    if (Array.isArray(planned.spent)) {
      for (let i = 0; i < planned.spent.length; i++) {
        if (plannerSpent.indexOf(planned.spent[i]) === -1) plannerSpent.push(planned.spent[i]);
      }
    }
    if (!planned.ok) {
      planFailure = planned.failure;
      planError = 'planner failed on every route: [' + planned.failure.class + '/' + planned.failure.category + '] ' + planned.failure.reason;
      return planned.failure.class === 'format-error' && planned.failure.setup !== true ? 'the last planner call returned no structured result' : '';
    }
    const normalized = normalizePlan(planned.value, 'planner');
    if (normalized) {
      plan = normalized;
      planFailure = null;
      planError = '';
      return '';
    }
    // A plan the shape gate rejected is a form gap, not a route failure: the
    // report must not blame the route for what the child wrote.
    planFailure = null;
    planError = 'planner returned no valid plan' + (planRejection === '' ? '' : ': ' + planRejection);
    return planRejection === '' ? 'the plan did not pass the shape gate' : planRejection;
  };
  let planFormGap = await askPlanner(planPrompt(''), null);
  if (!plan && planFormGap !== '') {
    log('planner returned no usable plan (' + planFormGap + '); resubmitting in the same call');
    planFormGap = await askPlanner(planPrompt(planFormGap), null);
    if (plan) log('planner resubmitted a valid plan in the same call');
  }
  // Corridor C. routeHealthFamily reads the class the failure declared, so a
  // rate-limit the operator's switch keeps on its route is not a route problem;
  // a timeout, a dropped connection and a 5xx are.
  const planDeath = planFailure ? routeHealthFamily(planFailure) : '';
  if (!plan && planDeath !== '') {
    const chainLabels = roleChainLabels('planner');
    const remaining = [];
    for (let i = 0; i < chainLabels.length; i++) {
      if (plannerSpent.indexOf(chainLabels[i]) === -1) remaining.push(chainLabels[i]);
    }
    const switchable = planFailure.switchModel === true || planDeath === 'timeout';
    if (remaining.length > 0 && switchable) {
      log('planner died in transport (' + planDeath + '); re-firing the plan on a route this call has not paid');
      await askPlanner(planPrompt(''), plannerSpent.slice());
      if (plan) log('planner recovered on another route in the same call');
    } else if (remaining.length === 0 && switchable && planDeath !== 'timeout') {
      // Nothing untried is left and the death was a refusal, not a stall: one
      // repeat costs one call and a 5xx/dropped connection is often transient.
      log('planner died in transport (' + planDeath + '); re-firing the plan once on the same route');
      await askPlanner(planPrompt(''), null);
      if (plan) log('planner recovered on the same route in the same call');
    }
  } else if (!plan && refusalDeath(planFailure)) {
    // The route refused to serve the call (D-164). A refusal is not route
    // evidence — ROUTE_HEALTH never counts it, so the route keeps its place for
    // the rest of the run — but the plan still has no answer, and one repeat is
    // the whole cost of finding out whether the key was refused or the request
    // was. The repeat is aimed at the route that refused, never at a walk: every
    // route this call paid before it is avoided, so at most one child is spent.
    // It is spent whatever the operator's switch says, because the switch
    // answers "move to another route" and this does not move.
    const repeatAvoid = plannerSpent.length > 1 ? plannerSpent.slice(0, plannerSpent.length - 1) : null;
    log('planner call was refused (' + planFailure.class + '); re-firing the plan once on the same route');
    await askPlanner(planPrompt(''), repeatAvoid);
    if (plan) log('planner recovered on the same route in the same call');
  }
}
if (!plan) {
  plan = fallbackPlan(planError || 'planner returned no valid plan');
  if (planFailure) plan.failure = { class: planFailure.class, reason: routeReason(planFailure.reason), category: planFailure.category };
}

phase(phaseLabel('execute'));
let results;
try {
  // Wave 3 (v0.13): the plan runs wave by wave. A plan with one wave — every
  // caller plan, and any planner plan that found no honest split — takes exactly
  // the path it took before waves existed, because the single wave is the whole
  // plan. Inside a wave the pool keeps maxConcurrency and the write-path
  // serialization; between waves the order is the plan's.
  const positions = {};
  for (let i = 0; i < plan.tasks.length; i++) positions[plan.tasks[i].id] = i;
  const waveTasks = planWaveTasks(plan.tasks, plan.waves);
  const executed = await runWaves(waveTasks, positions, maxConcurrency, plan.onFailure === 'stop');
  results = executed.results;
  // The report's plan is the plan the run actually executed: settled waves keep
  // their rows, merged waves replace the ones that never started, and the version
  // says how many times a boundary changed the remainder.
  plan.version = executed.version;
  plan.replans = executed.replans;
  const finalTasks = [];
  const finalWaves = [];
  for (let w = 0; w < executed.waves.length; w++) {
    const ids = [];
    for (let t = 0; t < executed.waves[w].length; t++) {
      finalTasks.push(executed.waves[w][t]);
      ids.push(executed.waves[w][t].id);
    }
    finalWaves.push(ids);
  }
  plan.tasks = finalTasks;
  plan.waves = finalWaves;
} catch (error) {
  // Bug guard: every task is already reporting its own failure, so a throw here
  // means the runner itself broke. Still produce a report, one failed row each.
  const failure = classifyCallFailure('worker', error);
  results = plan.tasks.map(function (task) {
    const text = redactPromptText('task runner crashed: [' + failure.class + '/' + failure.category + '] ' + failure.reason);
    return {
      task: task,
      status: 'failed',
      attempts: [abortedAttempt(failure, text)],
      error: text,
      failure: failure
    };
  });
}

phase(phaseLabel('synthesize'));
const confirmed = [];
const incomplete = [];
const errors = [];
const uncertainties = [];
for (let i = 0; i < results.length; i++) {
  const result = results[i];
  const task = result.task;
  if (result.status === 'verified' && result.attempts.length > 0) {
    const last = result.attempts[result.attempts.length - 1];
    if (last && last.verification) {
      for (let c = 0; c < task.acceptanceCriteria.length; c++) {
        const criterion = task.acceptanceCriteria[c];
        const matches = matchesCriterion(last.verification, criterion);
        if (matches.length === 1 && matches[0].met && matches[0].evidence) {
          confirmed.push({ taskId: task.id, criterion: criterion, evidence: matches[0].evidence });
        }
      }
      if (last.verification.confidence === 'low') {
        uncertainties.push({ taskId: task.id, text: 'verifier reported low confidence' });
      }
      // Non-blocking verifier notes: they no longer fail the task, so they are
      // carried into the report instead of being dropped on the floor.
      for (let u = 0; u < last.verification.issues.length; u++) {
        uncertainties.push({ taskId: task.id, text: 'verifier note: ' + last.verification.issues[u] });
      }
      if (last.execution && last.execution.uncertainties) {
        for (let u = 0; u < last.execution.uncertainties.length; u++) {
          uncertainties.push({ taskId: task.id, text: last.execution.uncertainties[u] });
        }
      }
    }
  } else if (result.status === 'blocked') {
    // Blocked is neither a pass nor a quality failure: it is "did not run". It is
    // listed exactly once in incomplete with no failure category, and its error
    // row uses its own phase word so a reader can tell it from a failed task.
    const blockedReason = result.error || 'blocked by an upstream task that did not verify';
    incomplete.push({ taskId: task.id, reason: blockedReason });
    errors.push({ phase: 'Blocked', message: task.id + ': ' + blockedReason });
  } else {
    const taskCategory = result.failure ? result.failure.category : 'unknown';
    incomplete.push({ taskId: task.id, reason: result.error || result.task.expectedOutput, category: taskCategory });
    errors.push({ phase: 'Execute', message: task.id + ': ' + (result.error || 'task failed'), category: taskCategory });
    for (let a = 0; a < result.attempts.length; a++) {
      const attempt = result.attempts[a];
      if (attempt.error) {
        errors.push({
          phase: 'Attempt ' + attempt.attempt,
          message: task.id + ': ' + attempt.error,
          category: attempt.failure ? attempt.failure.category : 'unknown'
        });
      }
      if (attempt.execution && attempt.execution.uncertainties) {
        for (let u = 0; u < attempt.execution.uncertainties.length; u++) {
          uncertainties.push({ taskId: task.id, text: attempt.execution.uncertainties[u] });
        }
      }
    }
  }
}
if (plan.error) errors.push({ phase: 'Plan', message: plan.error, category: plan.failure ? plan.failure.category : 'unknown' });
const verifiedCount = results.filter(function (item) { return item.status === 'verified'; }).length;
const planningFallback = plan.source === 'fallback';
let status = 'failed';
if (verifiedCount === results.length && results.length > 0 && !planningFallback) status = 'completed';
else if (verifiedCount > 0) status = 'partial';

let synthesisError = '';
let synthesisSummary = '';
// Which layer produced the narrative: 'polish' (guardrail-clean synthesizer
// text), 'model' (the plain synthesis policy) or 'fallback' (the deterministic
// narrative). Only read when the caller asked for diagnostics; empty when no
// narrative was built at all.
let synthesisSource = '';
// Sec.3-3: the summary gate's verdict, recorded so the report can state that the
// summary was checked *and* independently verified (and how many drafts it took).
let synthesisReview = '';
// A layered run with humanSummary false builds nothing: machine-only output means
// the report is the answer, so no narrative is composed and no synthesizer call
// is spent. synthesis.mode stays "deterministic" because no polish was in play —
// the same value a deterministic run reports, which is exactly what this run is.
if (synthesisPolicy === 'layered' && humanSummary) {
  // Layered policy: the deterministic narrative is built first and unconditionally.
  // A model draft may replace it only by passing the three-step gate (draft →
  // check → independent verify); a draft that fails is rewritten with the finding
  // and never shipped. The deterministic narrative is gated too, so a code bug in
  // the aggregation cannot silently ship.
  const digest = layeredDigest(status, verifiedCount, results.length, confirmed, incomplete, uncertainties, results, plan.error || '');
  const counts = layeredTestCounts(results);
  const layeredData = {
    status: status,
    verified: verifiedCount,
    total: results.length,
    confirmed: confirmed,
    incomplete: incomplete,
    uncertainties: uncertainties,
    counts: counts,
    planError: plan.error || ''
  };
  const fallback = layeredFallbackSummary(layeredData);
  const facts = {
    status: status,
    verifiedPasses: counts.checked.passed,
    openItems: incomplete.length + uncertainties.length,
    sources: polishVerbatimSources(confirmed, results)
  };
  const corpus = layeredCitationCorpus(digest, results);
  // Two coverage modes: the model draft is judged together with the appended
  // report-notes block, the deterministic narrative carries its own open items.
  const coverage = summaryCoverage(layeredData, counts, true);
  const fallbackCoverage = summaryCoverage(layeredData, counts, false);
  let draft = '';
  let drafts = 0;
  let review = null;
  if (polishAttempted) {
    const first = await requestSummaryDraft(layeredPolishPrompt(digest, undefined, 1), 0);
    draft = first.text;
    if (draft === '') synthesisError = first.error + '; the deterministic summary is used';
  }
  while (draft !== '') {
    drafts += 1;
    const composed = withReportNotes(draft, layeredData);
    review = reviewSummaryDraft(composed, draft, facts, corpus, coverage, results, planningFallback);
    if (review.ok) {
      synthesisSummary = composed;
      synthesisSource = 'polish';
      synthesisReview = 'check=pass verify=pass drafts=' + drafts;
      // Machine-readable marker for the draft the run actually ships: the host
      // reads it off the report and the progress journal marks that one row. A
      // rejected draft and the deterministic fallback never reach here.
      log('gw-summary-final ' + drafts);
      break;
    }
    if (drafts >= SUMMARY_MAX_ATTEMPTS) break;
    const rewrite = await requestSummaryDraft(
      layeredPolishPrompt(digest, { draft: draft, stage: review.stage, reason: review.reason }, drafts + 1),
      drafts
    );
    if (rewrite.text === '') {
      synthesisError = rewrite.error + '; the deterministic summary is used';
      break;
    }
    draft = rewrite.text;
  }
  // A null review is a different fact from "all drafts were rejected": no draft was ever
  // produced (the first request came back empty), so there is nothing to reject and no
  // marker is written. Only a gate that actually judged a draft leaves a verdict.
  if (synthesisSummary === '' && review !== null) {
    // The outcome, not just the verdict: every draft was rejected, and the reason is the
    // last one the gate gave. Without it the marker says "something failed" and nothing
    // about what, so a reader of the report (and the progress card) cannot say why this
    // run handed in nothing.
    const gateReason = summaryReviewReason(review.reason);
    synthesisReview = 'check=' + (review.stage === 'check' ? 'fail' : 'pass') +
      ' verify=' + (review.stage === 'verify' ? 'fail' : 'pass') + ' drafts=' + drafts +
      (gateReason === '' ? '' : ' reason=' + gateReason);
    synthesisError = 'polish rejected by the summary gate after ' + drafts + ' draft(s) (' +
      review.stage + (review.stage === 'check' ? ' guardrail' : ' verification') + ': ' + review.reason +
      '); the deterministic summary is used';
  }
  // Layer 3: the deterministic narrative is the answer whenever the model path
  // produced nothing usable — and only after it passes the same gate.
  if (synthesisSummary === '') {
    const fallbackReview = reviewSummaryDraft(fallback, '', facts, corpus, fallbackCoverage, results, planningFallback);
    if (fallbackReview.ok) {
      synthesisSummary = fallback;
      synthesisSource = 'fallback';
    } else {
      synthesisError = (synthesisError === '' ? '' : synthesisError + ' ') +
        'the deterministic summary failed the summary gate (' + fallbackReview.stage + ': ' +
        fallbackReview.reason + '); no narrative is shipped';
    }
  }
} else if (synthesisMode === 'model') {
  // The plain "model" policy has no deterministic appendix, so its prose itself
  // has to carry the verdict, the open tasks and the uncertainties. It goes
  // through the same draft → check → verify gate; a draft that never passes is
  // not shipped at all.
  const counts = layeredTestCounts(results);
  const gateData = {
    status: status,
    verified: verifiedCount,
    total: results.length,
    confirmed: confirmed,
    incomplete: incomplete,
    uncertainties: uncertainties,
    counts: counts,
    planError: plan.error || ''
  };
  const facts = {
    status: status,
    verifiedPasses: counts.checked.passed,
    openItems: incomplete.length + uncertainties.length,
    sources: polishVerbatimSources(confirmed, results)
  };
  const corpus = layeredCitationCorpus('', results);
  const coverage = summaryCoverage(gateData, counts, false, true);
  let draft = '';
  let drafts = 0;
  let review = null;
  const first = await requestSummaryDraft(
    synthesizerPrompt(status, verifiedCount, results.length, confirmed, incomplete, uncertainties, undefined, 1),
    0
  );
  draft = first.text;
  if (draft === '') synthesisError = first.error;
  while (draft !== '') {
    drafts += 1;
    review = reviewSummaryDraft(draft, draft, facts, corpus, coverage, results, planningFallback);
    if (review.ok) {
      synthesisSummary = draft;
      synthesisSource = 'model';
      // The plain policy records the same gate verdict the layered one does: the
      // gate really ran both steps, and the host reads this string to mark the
      // shipped draft.
      synthesisReview = 'check=pass verify=pass drafts=' + drafts;
      log('gw-summary-final ' + drafts);
      break;
    }
    if (drafts >= SUMMARY_MAX_ATTEMPTS) break;
    const rewrite = await requestSummaryDraft(
      synthesizerPrompt(status, verifiedCount, results.length, confirmed, incomplete, uncertainties, {
        draft: draft,
        stage: review.stage,
        reason: review.reason
      }, drafts + 1),
      drafts
    );
    if (rewrite.text === '') {
      synthesisError = rewrite.error;
      break;
    }
    draft = rewrite.text;
  }
  if (synthesisSummary === '' && review !== null) {
    // Same outcome the layered policy records: this policy has no deterministic narrative
    // to fall back to, so all-rejected means nothing is shipped — and the report has to
    // say so, with the last reason, instead of leaving only the synthesis error prose.
    const gateReason = summaryReviewReason(review.reason);
    synthesisReview = 'check=' + (review.stage === 'check' ? 'fail' : 'pass') +
      ' verify=' + (review.stage === 'verify' ? 'fail' : 'pass') + ' drafts=' + drafts +
      (gateReason === '' ? '' : ' reason=' + gateReason);
    synthesisError = 'polish rejected by the summary gate after ' + drafts + ' draft(s) (' +
      review.stage + (review.stage === 'check' ? ' guardrail' : ' verification') + ': ' + review.reason +
      '); no narrative is shipped';
  }
}

// Output diagnostics, opt-in (showDiagnostics, default false). The answer a
// reader gets by default stays human; a caller who asks for the machine view
// gets the one machine fact the prose cannot carry — which layer wrote this
// narrative and why a polish was dropped. The full ledger (routes, deadline,
// overflows, errors) is rendered host-side from the same report, so nothing is
// duplicated here. With humanSummary false there is no narrative to annotate,
// and the report alone is the machine view.
if (showDiagnostics && synthesisSummary !== '' && synthesisSource !== '') {
  synthesisSummary = withProvenance(synthesisSummary, provenanceLine(synthesisSource, synthesisError));
}

const synthesisReport = { mode: synthesisMode };
if (synthesisSummary !== '') synthesisReport.summary = synthesisSummary;
if (synthesisError !== '') synthesisReport.error = synthesisError;
if (synthesisReview !== '') synthesisReport.review = synthesisReview;

// Dead-route snapshot (ROUTE_HEALTH_LIMITS): the routes this run stopped
// preferring, in the order they died. Omitted when the table is empty, so a run
// that never lost a route produces exactly the report it always did.
const deadRouteReport = [];
for (let i = 0; i < deadRouteOrder.length; i++) {
  const label = deadRouteOrder[i];
  const row = deadRoutes[label];
  if (row) deadRouteReport.push({ route: label, class: row.family, streak: row.streak });
}

const report = {
  schemaVersion: 'grok-workflow/v1',
  status: status,
  objective: objective,
  plan: {
    source: plan.source,
    tasks: plan.tasks,
    waves: Array.isArray(plan.waves) && plan.waves.length > 0 ? plan.waves : [plan.tasks.map(function (task) { return task.id; })],
    version: typeof plan.version === 'number' ? plan.version : 1,
    replans: Array.isArray(plan.replans) ? plan.replans : [],
    error: plan.error || '',
    failure: plan.failure || null
  },
  tasks: results.map(function (result) {
    // Echoed for audit: a reviewer can see which task declared what, and therefore
    // why two tasks ran one after the other instead of together.
    return {
      id: result.task.id,
      title: result.task.title,
      objective: result.task.objective,
      expectedOutput: result.task.expectedOutput,
      acceptanceCriteria: result.task.acceptanceCriteria,
      context: result.task.context,
      constraints: result.task.constraints,
      writesPaths: result.task.writesPaths,
      ...result.task.originGoalId === undefined ? {} : { originGoalId: result.task.originGoalId },
      status: result.status,
      attempts: result.attempts,
      error: result.error || ''
    };
  }),
  confirmed: confirmed,
  incomplete: incomplete,
  errors: errors,
  uncertainties: uncertainties,
  routes: routeTrail,
  ...(deadRouteReport.length === 0 ? {} : { deadRoutes: deadRouteReport }),
  routing: {
    planner: roleChainLabels('planner'),
    worker: roleChainLabels('worker'),
    verifier: roleChainLabels('verifier'),
    supervisor: roleChainLabels('supervisor'),
    synthesizer: roleChainLabels('synthesizer')
  },
  synthesis: synthesisReport,
  limits: {
    maxConcurrency: maxConcurrency,
    maxRetries: maxRetries,
    maxTasks: maxTasks,
    maxTotalAgents: Number(args && args.maxTotalAgents) || 0,
    timeoutMs: Number(args && args.timeoutMs) || 0,
    childTimeoutMs: Number(args && args.childTimeoutMs) || 0
  }
};
return report;
`;
}

/** Assemble the full guest script from its moved blocks (single concatenation order lives here). */
export function assembleWorkflowScript(): string {
  return guestParams() + guestRouting() + guestPlanNorm() + guestPrompts() + guestSchemas() + guestSynthesize() + guestWaves() + guestReplan() + guestMain()
}

/** One complete workflow-start request payload. */
export interface WorkflowRequestPayload {
  script: string
  meta: {
    name: string
    description: string
    phases: { title: string; detail: string }[]
  }
  args: {
    objective: string
    tasks: NormalizedTask[] | null
    maxConcurrency: number
    maxRetries: number
    maxTasks: number
    maxTotalAgents: number
    /**
     * Q6: cooperative per-call timeout in milliseconds. The script races every
     * `agent()` against it and settles a loser as a `timeout` failure of that
     * attempt, so one hung child costs a retry instead of the whole run.
     */
    childTimeoutMs: number
    /** The deadline the plugin enforces for this run (0 = unlimited, no host timer; the guest never arms its own timer). */
    timeoutMs: number
    roles: Record<RoleName, ModelRoute[]>
    /**
     * Q8: the single guardian route that judges a stalled child before the
     * script kills it. Absent when no guardian is configured — the run then
     * settles a timed-out call straight to its task's bounded retry, exactly
     * as it did before the guardian existed.
     */
    guardianModel?: ModelRoute
    /**
     * Final-answer policy: `deterministic`, `model`, or `layered` (the Section IV
     * layered policy, which travels as the third runtime value). The script maps
     * the policy onto the report's host-validated `synthesis.mode`.
     */
    synthesis: SynthesisPolicy
    /** Failure classes that advance a role's chain; empty = built-in policy. */
    switchOn: FailureClass[]
    /** Copy language for every user-visible progress string (Issue #22 P1-3). */
    naming: { language: NamingLanguage }
    /**
     * Compiled earlier rounds of this session (v0.5), already bounded and
     * redacted by `src/carryover.ts`. Absent on a first round.
     */
    carryover?: string
    /**
     * L1 inheritance (v0.13): the task-level decisions a new round inherits, already
     * compiled and bounded by `src/carryover.ts`. Absent on a first round.
     */
    inheritance?: string
    /**
     * Cross-run hint (C1, approximate): route labels other live runs
     * configured, snapshotted host-side at admission. Absent/empty on a
     * first or solitary run, which keeps the payload identical to before.
     */
    busyRoutes?: string[]
    /**
     * Output switch 1/2: build the plain-language narrative (default `true`).
     *
     * Omitted means the default, exactly like `src/config.ts`
     * `DEFAULT_HUMAN_SUMMARY`, so a caller that predates the switch keeps the
     * narrative it always got. `false` ships the machine report alone: no
     * polish call, no fallback narrative, `synthesis.mode = "deterministic"`.
     */
    humanSummary?: boolean
    /**
     * Output switch 2/2: append the narrative's provenance (default `false`).
     *
     * Omitted means the default, exactly like `src/config.ts`
     * `DEFAULT_SHOW_DIAGNOSTICS`. `true` adds one bounded line naming the layer
     * that wrote the narrative and why a polish was dropped; the complete
     * machine ledger is rendered host-side from the same report.
     */
    showDiagnostics?: boolean
  }
  maxTotalAgents: number
}

/** Child calls one role may charge, derived from its configured chain. */
export interface RouteBudget {
  /** Calls the planner may make (1 when it inherits the route). */
  planner: number
  /** Worker calls per task attempt. */
  worker: number
  /** Verifier calls per task attempt. */
  verifier: number
  /** Supervisor calls per task attempt (0 when no supervisor chain is configured). */
  supervisor: number
  /** Synthesizer calls per run (0 when synthesis is deterministic). */
  synthesizer: number
  /**
   * Whether guardian adjudication is configured (Q8). When it is, every timed-out
   * child call may spend up to {@link GUARDIAN_MAX_WAITS} adjudication calls, so
   * the child cap multiplies the per-attempt block to keep AGENT_CAP from firing
   * exactly when the guardian is giving a stalled child its second chance.
   */
  guardian?: boolean
}

/**
 * Derive the per-run call budget from the configured chains.
 *
 * The synthesizer budget follows the configured policy, not the two-value
 * `SynthesisMode` type union: the layered policy travels as the runtime value
 * `"layered"` and spends synthesizer calls per run — but only when a chain is
 * configured, because a layered run without a chain answers from the
 * deterministic narrative and spends nothing.
 *
 * With a chain, the budget covers the whole gated pipeline: up to
 * {@link SUMMARY_MAX_ATTEMPTS} drafts (the first draft plus the bounded rewrites)
 * times the chain length, because each draft call may fall through every route.
 * A single-draft budget would abort a rewrite-heavy run with AGENT_CAP exactly
 * when the gate is doing its job.
 */
export function routeBudgetFor(config: ResolvedConfig): RouteBudget {
  const chain = config.roles.synthesizer.length
  const policy = String(config.synthesis)
  const drafts = Math.max(1, SUMMARY_MAX_ATTEMPTS)
  const synthesizer = policy === 'model'
    ? drafts * Math.max(1, chain)
    : policy === 'layered' && chain > 0 ? drafts * Math.max(1, chain) : 0
  return {
    planner: Math.max(1, config.roles.planner.length),
    worker: Math.max(1, config.roles.worker.length),
    verifier: Math.max(1, config.roles.verifier.length),
    // No inherit fallback: an empty supervisor chain means the gate never runs,
    // so the budget is the raw length (0 when unconfigured).
    supervisor: config.roles.supervisor.length,
    synthesizer,
    guardian: config.guardianModel !== undefined,
  }
}

/**
 * Calculate the hard child cap for a run.
 *
 * Chains multiply the per-attempt cost, so the cap must be derived from the
 * effective routes; a cap that only counts attempts would abort a run mid-flight
 * with AGENT_CAP as soon as a fallback route is used. Guardian adjudication
 * (Q8) adds at most {@link GUARDIAN_MAX_WAITS} calls per timed-out call, so
 * with a guardian configured every per-call block is widened by that factor;
 * without one the formula is byte-identical to the pre-guardian one.
 *
 * The planning leg is counted at {@link PLANNER_LEG_CALLS} chain walks, because
 * its resubmit and its route re-fire are real children: a cap that counted one
 * walk aborted the rescue with AGENT_CAP exactly when it was recovering the run.
 * Replan boundaries are counted at two walks each: a boundary asks once, and a
 * first answer that came back without a structured result is asked once more in the
 * same boundary (the same corridor the worker and the summary draft have). Both are
 * real children, so a cap that counted one walk would abort the run with AGENT_CAP
 * exactly when the resubmit was recovering the merge.
 */
export function maxTotalAgentsFor(tasks: number, retries: number, budget?: RouteBudget, replans = 0): number {
  const planner = budget?.planner ?? 1
  const worker = budget?.worker ?? 1
  const verifier = budget?.verifier ?? 1
  const supervisor = budget?.supervisor ?? 1
  const synthesizer = budget?.synthesizer ?? 0
  // Wait slots per call: 2 adjudications per timed-out call when a guardian is
  // configured, 0 (factor 1) otherwise — the pre-guardian arithmetic.
  const waitFactor = budget?.guardian === true ? 1 + GUARDIAN_MAX_WAITS : 1
  // Same-attempt rescues (D-054), counted as the honest walks rather than as one
  // call per route: a worker is called at most twice inside one attempt (first
  // call + form resubmit) and each judging leg at most three times (first call +
  // transport re-fire + form resubmit). These are real children, so the
  // per-attempt block counts them — otherwise a quoting mistake or a dead route
  // would abort the run with AGENT_CAP instead of recovering it.
  const attemptBlock = 2 * worker + 3 * (verifier + supervisor)
  // The planning leg: its resubmit and its route re-fire are real children, so
  // the leg is counted at its worst case instead of one walk (see
  // PLANNER_LEG_CALLS). Counting one walk here aborted the rescue with AGENT_CAP.
  const planLeg = PLANNER_LEG_CALLS * planner
  // Replan boundaries are planner-route calls made between waves: they are real
  // children, so the engine's maxTotalAgents has to include them or a large plan
  // that merges at every boundary would hit AGENT_CAP instead of finishing. Each
  // boundary is counted at two walks (first ask + same-boundary resubmit), because a
  // boundary that prose-answered really does call the planner twice — the same rule
  // the worker and the summary draft already follow, and the same reason
  // PLANNER_LEG_CALLS counts its own rescue instead of one walk.
  const boundaryCalls = 2
  return planLeg * waitFactor + synthesizer * waitFactor
    + Math.max(0, Math.min(REPLAN_LIMITS.maxBoundaries, Math.trunc(replans))) * boundaryCalls * planner * waitFactor
    + tasks * (retries + 1) * attemptBlock * waitFactor + 2
}

/** Stable base label of a run: the GUI card title and the log's run name. */
/** Build the static script and data-only arguments for one run. */
/**
 * Clamp a compiled carry-over digest to the hard ceiling (`CARRYOVER_LIMITS.chars`).
 *
 * `src/carryover.ts` already clamps and the generated script clamps a third
 * time. The repetition is deliberate: the ceiling travels with the payload, so no
 * link in the chain (gate → run → request → script → prompt) can be the one that
 * lets an over-long digest reach a child prompt.
 *
 * @param value - the digest, or `undefined` when there is no prior round.
 * @returns the digest to ship, or an empty string when nothing is carried.
 */
/**
 * Clamp the compiled inheritance summary to its own hard ceiling.
 *
 * A second clamp on the host side, for the same reason as `boundedCarryover`: the
 * ceiling travels with the payload so no link in the chain can be the one that lets
 * an over-long summary reach a child prompt. The ceiling mirrors
 * `INHERITANCE_LIMITS.chars` in `src/carryover.ts` and `INHERITANCE_MAX_CHARS` in
 * the generated script (all three pinned by test/inheritance.spec.ts).
 * @param value - the summary, or `undefined` when there is nothing to inherit.
 * @returns the summary to ship, or an empty string.
 */
function boundedInheritance(value: string | undefined): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  const cap = INHERITANCE_LIMITS.chars
  return trimmed.length <= cap ? trimmed : trimmed.slice(0, cap)
}

/**
 * Clamp the captain brief to its own hard ceiling.
 *
 * The host already bounded it (src/captain-memory.ts) and the generated script
 * clamps again; this third clamp keeps the request payload itself bounded, so the
 * ceiling holds even if a caller builds the payload by hand.
 */
function boundedCaptain(value: string | undefined): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (trimmed === '') return ''
  const cap = CAPTAIN_MEMORY_LIMITS.briefChars
  return trimmed.length <= cap ? trimmed : `${trimmed.slice(0, cap - 1)}…`
}

function boundedCarryover(value: string | undefined): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (trimmed === '') return ''
  if (trimmed.length <= CARRYOVER_LIMITS.chars) return trimmed
  // Surrogate-safe cut: never leave half a code point at the boundary.
  let cut = CARRYOVER_LIMITS.chars - 1
  const code = trimmed.charCodeAt(cut - 1)
  if (code >= 0xd800 && code <= 0xdbff) cut -= 1
  return `${trimmed.slice(0, cut)}…`
}

/**
 * Sanitize the host-side cross-run hint (C1) into bounded plain labels.
 *
 * The script already clamps `args.busyRoutes` defensively; this keeps the
 * request payload bounded and the no-hint payload key-free, so a solitary run
 * stays byte-identical to before. The budget intentionally ignores the hint:
 * it never adds a call.
 */
function boundedBusyRoutes(value: string[] | undefined): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const label = item.trim().slice(0, 120)
    if (label === '' || seen.has(label)) continue
    seen.add(label)
    out.push(label)
    if (out.length >= 64) break
  }
  return out
}

export function buildWorkflowRequest(
  objective: string,
  tasks: NormalizedTask[] | undefined,
  config: ResolvedConfig,
  namingLanguage: NamingLanguage = 'zh',
  carryover?: string,
  busyRoutes?: string[],
  inheritance?: string,
  replanToken?: string,
  captainBrief?: string,
): WorkflowRequestPayload {
  // `[]` means "no plan supplied" exactly like `undefined`: the script falls back
  // to a planner and then runs at least one task, so budgeting for 0 tasks would
  // produce a limit the validated report can exceed (a lost-evidence rejection).
  // A planner failure degrades to the fallback plan, which splits the objective
  // into `taskTextChars` segments. Budget for the larger of that shard count and
  // `maxTasks`: the fallback must not be rejected by the configured task cap, and
  // the child-agent cap has to cover every shard it will run. The count comes from
  // the splitter itself, not from `ceil(chars / taskTextChars)`: a boundary that
  // backs off a surrogate pair (or moves onto a break) can add a segment, and a
  // budget one segment short would reject the very fallback it was built for.
  const fallbackShards = Math.max(1, shardCountFor(objective, TASK_LIMITS.taskTextChars))
  const taskCount = tasks === undefined || tasks.length === 0 ? Math.max(config.maxTasks, fallbackShards) : tasks.length
  const replanChannel = typeof replanToken === 'string' && replanToken.trim() !== '' ? replanToken.trim().slice(0, 120) : ''
  const maxTotalAgents = maxTotalAgentsFor(
    taskCount,
    config.maxRetries,
    routeBudgetFor(config),
    replanChannel === '' ? 0 : REPLAN_LIMITS.maxBoundaries,
  )
  const carryoverValue = boundedCarryover(carryover)
  const busyValue = boundedBusyRoutes(busyRoutes)
  return {
    script: assembleWorkflowScript(),
    meta: {
      // The name is the GUI panel's title (`workflowRun` dict: `run.title {name}`)
      // and the run's identity in the session log, so it carries what is known
      // *before* the script runs: the task count when the caller supplied a plan.
      // When the script plans first the count does not exist yet at this point,
      // and guessing the cap would be a lie the title never retracts — the panel's
      // live member count covers that case instead.
      name: runTitle(namingLanguage, tasks === undefined || tasks.length === 0 ? undefined : tasks.length),
      description: 'Plan, execute, independently verify, retry, and synthesize a complex objective with bounded concurrency.',
      phases: [
        { title: phaseLabel('plan', namingLanguage), detail: 'Decompose the objective into independent tasks.' },
        { title: phaseLabel('execute', namingLanguage), detail: 'Run tasks with a bounded worker pool.' },
        { title: phaseLabel('verify', namingLanguage), detail: 'Check evidence for every acceptance criterion.' },
        { title: phaseLabel('synthesize', namingLanguage), detail: 'Aggregate verified, incomplete, and uncertain results.' },
      ],
    },
    args: {
      objective,
      // An empty plan is the same request as no plan: the script plans instead.
      tasks: tasks === undefined || tasks.length === 0 ? null : tasks,
      maxConcurrency: config.maxConcurrency,
      maxRetries: config.maxRetries,
      maxTasks: config.maxTasks,
      maxTotalAgents,
      // Q6: the cooperative per-call bound the script races every agent() with.
      // Carried from the resolved config (default 120 min), so the settings
      // page and the race share one value.
      childTimeoutMs: config.childTimeoutMs,
      // t47: the deadline the plugin will enforce, so the run report can name it.
      // 0 = unlimited (no timer): written as-is, the guest treats 0 as no bound.
      timeoutMs: config.timeoutMs,
      roles: config.roles,
      // Q8: the single guardian route, when one is configured. Omitted entirely
      // when it is not, so an unconfigured run stays byte-identical to before.
      ...config.guardianModel === undefined ? {} : { guardianModel: config.guardianModel },
      // The policy travels verbatim: "layered" is the third runtime value of the
      // layered policy, and the script maps it onto synthesis.mode itself.
      synthesis: config.synthesis,
      // Sec.3-2: the built-in policy (empty list) unless the operator unticked the
      // 429 box, in which case the remaining six classes are named explicitly.
      switchOn: config.switchOnRateLimit ? [...FIXED_SWITCH_ON] : [...FIXED_SWITCH_ON_WITHOUT_RATE_LIMIT],
      naming: { language: namingLanguage },
      // Cross-round carry-over (v0.5): the earlier rounds of this session, already
      // compiled and bounded by src/carryover.ts. Omitted entirely when there is
      // nothing to carry, so a first-round payload stays byte-identical to the
      // pre-0.5 one (backward compatibility is pinned by test/carryover.spec.ts).
      ...carryoverValue === '' ? {} : { carryover: carryoverValue },
      // Cross-run hint (C1, approximate): route labels other live runs
      // configured, snapshotted host-side at admission. Omitted entirely when
      // empty, so a solitary run stays byte-identical to before (the budget
      // ignores it: a hint never adds a call).
      ...busyValue.length === 0 ? {} : { busyRoutes: busyValue },
      // L1 inheritance (Q2): the task-level decisions for this round, compiled by
      // src/carryover.ts under its own 8K budget. Omitted entirely when there is
      // nothing to inherit, so a first round stays byte-identical to before.
      ...boundedInheritance(inheritance) === '' ? {} : { inheritance: boundedInheritance(inheritance) },
      // Mid-run replan (L2): the run token the boundary planner child quotes when
      // it pulls the demands queued for this run. Omitted entirely unless the host
      // opened a channel, so a run without one stays byte-identical to before.
      ...replanChannel === '' ? {} : { replan: { enabled: true, token: replanChannel, tool: STEERING_TOOL_NAME } },
      // Captain memory (round-071): the three sheets, already compiled and bounded
      // by src/captain-memory.ts. Omitted entirely when nothing is remembered, so a
      // first round's payload stays byte-identical to the pre-memory one.
      ...boundedCaptain(captainBrief) === '' ? {} : { captain: boundedCaptain(captainBrief) },
      // Output switches are fixed (T4: humanSummary on, showDiagnostics off).
      // Always carried so the script never depends on its own defaults.
      humanSummary: FIXED_HUMAN_SUMMARY,
      showDiagnostics: FIXED_SHOW_DIAGNOSTICS,
    },
    maxTotalAgents,
  }
}
