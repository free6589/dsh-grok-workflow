export function guestWaves() {
    return String.raw `// Conflict-aware pool (U-4). Same contract as mapLimit (indexed results, at most
// "limit" in flight) with one extra rule: a task may not start while a running task
// writes an overlapping path. Serialization only ever lowers concurrency, so
// maxConcurrency stays an upper bound. The planner's order is kept as the tie-break:
// the first startable task goes first, so a plan is reproduced run after run.
async function mapLimitIsolated(tasks, limit, fn) {
  const results = new Array(tasks.length);
  const pending = [];
  for (let i = 0; i < tasks.length; i++) pending.push(i);
  const inFlight = new Map();
  const errors = new Map();
  const waiters = [];
  let finished = 0;
  function notify() {
    while (waiters.length > 0) waiters.pop()();
  }
  function conflictsWithRunning(paths) {
    const keys = Array.from(inFlight.values());
    for (let i = 0; i < keys.length; i++) {
      if (writesConflict(paths, keys[i])) return true;
    }
    return false;
  }
  function startSome() {
    let progress = true;
    while (progress) {
      progress = false;
      for (let p = 0; p < pending.length && inFlight.size < limit; p++) {
        const index = pending[p];
        const task = tasks[index];
        const paths = task.writesPaths === null || task.writesPaths === undefined ? undefined : task.writesPaths;
        if (conflictsWithRunning(paths)) continue;
        pending.splice(p, 1);
        inFlight.set(index, paths);
        progress = true;
        Promise.resolve()
          .then(function () { return fn(task, index); })
          .then(function (value) { results[index] = value; }, function (error) { errors.set(index, error); })
          .then(function () {
            inFlight.delete(index);
            finished += 1;
            startSome();
            notify();
          });
        p -= 1;
      }
    }
    // Totality guard: nothing running and nothing startable cannot happen (an empty
    // in-flight set conflicts with nobody), but a scheduler that can deadlock is
    // not acceptable, so the head of the queue is started anyway.
    if (inFlight.size === 0 && pending.length > 0 && finished < tasks.length) {
      const index = pending.shift();
      const task = tasks[index];
      inFlight.set(index, undefined);
      Promise.resolve()
        .then(function () { return fn(task, index); })
        .then(function (value) { results[index] = value; }, function (error) { errors.set(index, error); })
        .then(function () {
          inFlight.delete(index);
          finished += 1;
          startSome();
          notify();
        });
    }
  }
  startSome();
  while (finished < tasks.length) {
    await new Promise(function (resolve) { waiters.push(resolve); });
  }
  for (let i = 0; i < results.length; i++) {
    if (errors.has(i)) throw errors.get(i);
  }
  return results;
}

// ------------------------------------------------------------- wave waves --
// Wave 3: the plan is a list of waves, and a task may declare dependencies on
// earlier waves only. These four helpers are the whole scheduler besides the pool
// above; nothing here arms a timer or polls, so a wave advances exactly when its
// last task settles.

// One task that never ran. The report format requires an attempt row for every
// task, so this is that row: attempt 1, no execution, no verification, not passed.
// It is deliberately not a failure: a blocked task is not a quality verdict, and
// no category is invented for it (see the thin design, §1 and §2).
function blockedResult(task, upstreamIds) {
  const reason = 'blocked: upstream task ' + upstreamIds.join(', ') + ' did not verify, so this task did not run (no attempt taken, no retry spent)';
  return {
    task: task,
    status: 'blocked',
    attempts: [{ attempt: 1, execution: null, verification: null, passed: false, error: reason }],
    error: reason
  };
}

// One task the captain chose not to start. Same row shape as blockedResult (the
// report requires one attempt row and one incomplete entry per unverified task);
// the reason names the decision instead of an upstream task, because "the captain
// stopped the plan" is not a dependency failure and must not read as one.
function captainStopResult(task, failedIds) {
  const reason = 'stopped: the captain ended this plan after task ' + failedIds.join(', ') + ' did not verify, so this task did not run (no attempt taken, no retry spent)';
  return {
    task: task,
    status: 'blocked',
    attempts: [{ attempt: 1, execution: null, verification: null, passed: false, error: reason }],
    error: reason
  };
}

// What a verified upstream actually produced, in the shape upstreamDigest reads.
// Only a verified dependency is included: a failed or blocked one already turned
// this task into a blocked row before the digest is consulted. The last attempt
// that carries an execution is the one whose result verification accepted.
function upstreamSourcesOf(task, settled) {
  const deps = task.dependsOn || [];
  const out = [];
  for (let d = 0; d < deps.length; d++) {
    const result = settled[deps[d]];
    if (!result || result.status !== 'verified') continue;
    const attempts = Array.isArray(result.attempts) ? result.attempts : [];
    let execution = null;
    for (let i = attempts.length - 1; i >= 0; i--) {
      if (attempts[i] && attempts[i].execution) { execution = attempts[i].execution; break; }
    }
    out.push({
      id: deps[d],
      summary: execution ? execution.summary : '',
      deliverables: execution ? execution.deliverables : [],
      evidence: execution ? execution.evidence : [],
      filesChanged: execution ? execution.filesChanged : [],
      testsRun: execution ? execution.testsRun : []
    });
  }
  return out;
}

// S4, the hard half: a verified dependency with no artifact has nothing to hand
// over, so its dependent is failed rather than run against a self-report. This is
// not a blocked row — the upstream did pass — and it is not a quality verdict on the
// downstream task, which is why no retry is spent and the reason names the
// upstream that came up empty.
function contractFailure(task, upstreamIds) {
  const reason = 'failed: upstream task ' + upstreamIds.join(', ') + ' verified without an evidence summary (no deliverable, evidence item, changed file or passing command), so this task has nothing to build on and was not started';
  return {
    task: task,
    status: 'failed',
    attempts: [{
      attempt: 1,
      execution: null,
      verification: null,
      passed: false,
      failure: { class: 'unknown', reason: routeReason(reason), category: 'unknown' },
      error: reason
    }],
    error: reason,
    failure: { class: 'unknown', reason: routeReason(reason), category: 'unknown' }
  };
}


`;
}
//# sourceMappingURL=waves.js.map