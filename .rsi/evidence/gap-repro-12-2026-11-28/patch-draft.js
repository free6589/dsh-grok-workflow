'use strict';

// patch-draft.js — candidate minimal re-dispatch ("补派") rule for a leg that
// exhausted its bounded attempts with outcome failed. LOGIC ONLY: no import
// from src/, no build, no product file touched.
//
// The rule is written against bounded-attempt units that already exist in this
// source, each of which today ends at a plain failure with no second dispatch:
//   leg 'task'       runTaskUnsafe      src/script.ts:4018-4346  (return at 4346)
//   leg 'synthesize' summarize leg      src/script.ts:4682 / 4768 (drafts >= SUMMARY_MAX_ATTEMPTS)
// A row is the shape those units already produce plus the counter the patch adds:
//   { leg, taskId, status, attempts, failure, redispatchCount }

const MAX_REDISPATCH = 1;

// ---------------------------------------------------------------------------
// Lane A — BASELINE. What the current source does at exhaustion: the bounded
// loop ends and the unit is finished. No re-dispatch, no marker.
// (task: 4332-4335 returns on pass, 4338-4343 breaks on a setup fault, 4346
//  returns status:'failed'; synthesize: 4682/4768 break out of the draft loop
//  and the run goes on to deliver whatever it has.)
// ---------------------------------------------------------------------------
function baselineAfterExhaustion(row) {
  return { action: 'none', status: row.status };
}

// ---------------------------------------------------------------------------
// Lane B — CANDIDATE RULE, in order:
//   1. only a unit that ended failed is a candidate; verified / delivered /
//      blocked / stopped units are settled and stay untouched;
//   2. a setup or configuration fault is never re-dispatched (it repeats by
//      definition — the same reason the source refuses to retry it, 4338-4343);
//   3. a unit already re-dispatched MAX_REDISPATCH times is not sent again; it
//      is marked "needs manual" instead, so the loop is bounded;
//   4. otherwise: re-dispatch that same unit once to the spare queue, carrying
//      the leg so the spare call repeats the same leg (not a different one).
// ---------------------------------------------------------------------------
function decideAfterExhaustion(row) {
  const fired = row.redispatchCount || 0;
  if (row.status !== 'failed') {
    return { action: 'none', why: 'unit is ' + row.status + ': already settled, no bounded budget was exhausted' };
  }
  const category = row.failure ? row.failure.category : 'unknown';
  const cls = row.failure ? row.failure.class : 'unknown';
  const leg = row.leg || 'task';
  if (category === 'configuration' || cls === 'budget-exhausted') {
    return { action: 'mark-manual', why: 'setup/configuration fault (' + cls + '): a re-dispatch would burn budget on a broken setup' };
  }
  if (fired >= MAX_REDISPATCH) {
    return { action: 'mark-manual', why: 'already re-dispatched ' + fired + ' time(s); bounded, hand to a human' };
  }
  return { action: 'redispatch', why: leg + ' leg exhausted with a retryable failure (' + cls + '/' + category + '); one re-dispatch to the spare queue' };
}

// ---------------------------------------------------------------------------
// Cases. expected = what the candidate rule must decide.
// C6 is the shape the reproduction in this same evidence directory observed:
// run 686af548 task 30 "汇总助手" agent-end outcome=failed at seq 3044, then
// run-end stopReason=error and delivery partial — no re-dispatch at all.
// ---------------------------------------------------------------------------
const cases = [
  {
    id: 'C1-task-row-should-redispatch',
    about: 'task leg: bounded retry exhausted, infrastructure failure, never re-dispatched',
    row: { leg: 'task', taskId: 'task-2', status: 'failed', attempts: [{ attempt: 1 }, { attempt: 2 }], failure: { class: 'timeout', category: 'infrastructure' }, redispatchCount: 0 },
    expected: 'redispatch'
  },
  {
    id: 'C2-no-action-success',
    about: 'task leg: verified on attempt 1 (success row)',
    row: { leg: 'task', taskId: 'task-1', status: 'verified', attempts: [{ attempt: 1, passed: true }], redispatchCount: 0 },
    expected: 'none'
  },
  {
    id: 'C3-no-second-redispatch',
    about: 'task leg: exhausted again AFTER the one re-dispatch was already spent',
    row: { leg: 'task', taskId: 'task-2', status: 'failed', attempts: [{ attempt: 1 }], failure: { class: 'server-error', category: 'infrastructure' }, redispatchCount: 1 },
    expected: 'mark-manual'
  },
  {
    id: 'C4-no-redispatch-on-setup',
    about: 'task leg: exhausted by a configuration fault (budget cap), never re-dispatched',
    row: { leg: 'task', taskId: 'task-3', status: 'failed', attempts: [{ attempt: 1 }], failure: { class: 'budget-exhausted', category: 'configuration' }, redispatchCount: 0 },
    expected: 'mark-manual'
  },
  {
    id: 'C5-no-action-blocked',
    about: 'task leg: upstream did not verify, so this task never ran (no retry spent)',
    row: { leg: 'task', taskId: 'task-4', status: 'blocked', attempts: [], redispatchCount: 0 },
    expected: 'none'
  },
  {
    id: 'C6-OBSERVED-synth-leg-should-redispatch',
    about: 'synthesize leg, exactly the shape run 686af548 seq 3044 recorded: 3/3 drafts spent, outcome failed, then run-end error + delivery partial',
    row: { leg: 'synthesize', taskId: 'summary', status: 'failed', attempts: [{ draft: 1 }, { draft: 2 }, { draft: 3 }], failure: { class: 'task-failed', category: 'quality' }, redispatchCount: 0 },
    expected: 'redispatch'
  },
  {
    id: 'C7-no-action-layered-fallback',
    about: 'synthesize leg, layered policy: every draft was rejected but the deterministic narrative shipped — the unit did deliver',
    row: { leg: 'synthesize', taskId: 'summary', status: 'delivered-fallback', attempts: [{ draft: 1 }, { draft: 2 }], redispatchCount: 0 },
    expected: 'none'
  }
];

// Falsification switch: run the SAME cases through the baseline only. If the
// harness is honest this mode must go RED on C1 and C6 — that is the gap.
const FALSIFY = process.argv.indexOf('--falsify') !== -1;
const decide = FALSIFY ? baselineAfterExhaustion : decideAfterExhaustion;

function main() {
  let failures = 0;
  const results = [];
  for (const c of cases) {
    const before = baselineAfterExhaustion(c.row);
    const after = decide(c.row);
    const ok = after.action === c.expected;
    if (!ok) failures += 1;
    results.push({ c, before, after, ok });
  }

  console.log('MODE: ' + (FALSIFY ? 'FALSIFY (baseline only — must go RED on C1 and C6)' : 'CANDIDATE (the proposed rule)'));
  console.log('');
  for (const r of results) {
    console.log('CASE ' + r.c.id + ' — ' + r.c.about);
    console.log('  input      : leg=' + (r.c.row.leg || 'task') + ' status=' + r.c.row.status + ' failure=' + (r.c.row.failure ? r.c.row.failure.class + '/' + r.c.row.failure.category : 'none') + ' redispatchCount=' + (r.c.row.redispatchCount || 0));
    console.log('  BASELINE   : action=' + r.before.action + '  (current source: the bounded loop ends and the unit is finished, never re-sent)');
    console.log('  ' + (FALSIFY ? 'UNDER TEST ' : 'CANDIDATE ') + ': action=' + r.after.action + '  (' + (r.after.why || 'baseline has no rule, so nothing is decided') + ')');
    console.log('  expected   : ' + r.c.expected + '  => ' + (r.ok ? 'PASS' : 'FAIL'));
    console.log('');
  }

  // Bounded-ness proof on the OBSERVED shape: a leg that keeps failing must
  // reach a terminal state after one re-dispatch, never a second one.
  let state = { leg: 'synthesize', taskId: 'summary', status: 'failed', attempts: [{}], failure: { class: 'task-failed', category: 'quality' }, redispatchCount: 0 };
  const trace = [];
  for (let round = 0; round < 6; round++) {
    const d = decide(state);
    trace.push('round ' + (round + 1) + ' -> ' + d.action);
    if (d.action !== 'redispatch') break;
    state = { ...state, status: 'failed', redispatchCount: (state.redispatchCount || 0) + 1 };
  }
  const dispatchedOnce = trace.length >= 1 && trace[0].endsWith('redispatch');
  const terminal = trace.length === 2 && trace[1].endsWith('mark-manual');
  const bounded = dispatchedOnce && terminal;
  const verdict = bounded
    ? 'PASS (terminal after exactly one re-dispatch)'
    : (dispatchedOnce ? 'FAIL (never reaches a terminal state)' : 'RED (never re-dispatches at all — this is the gap)');
  console.log('BOUNDEDNESS: ' + trace.join(' | ') + '  => ' + verdict);
  console.log('');
  if (!bounded) failures += 1;

  const caseFails = results.length - results.filter(function (r) { return r.ok; }).length;
  console.log('SUMMARY: ' + (results.length - caseFails) + '/' + results.length + ' cases PASS' + (bounded ? '' : ', boundedness FAIL'));
  console.log(failures === 0 ? 'RESULT: PASS' : 'RESULT: FAIL');
  return failures === 0 ? 0 : 1;
}

process.exit(main());
