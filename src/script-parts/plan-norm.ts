export function guestPlanNorm(): string {
  return String.raw`function traceRoute(role, chainIndex, route, attempt, outcome, failure, extra, taskId) {
  if (routeTrail.length >= ROUTE_LIMITS.trail) return;
  const entry = { role: role, chainIndex: chainIndex, route: routeLabel(route), attempt: attempt, outcome: outcome };
  // Which plan task this call belonged to (worker/verifier/supervisor only). A
  // run can place dozens of calls for a dozen tasks, so a worker failed row
  // without the task id left the reader to guess whose call it was.
  if (typeof taskId === 'string' && taskId !== '') entry.taskId = taskId;
  if (failure) {
    entry.failureClass = failure.class;
    entry.reason = failure.reason;
  }
  if (extra) {
    if (extra.skippedBusy && extra.skippedBusy.length > 0) entry.skippedBusy = extra.skippedBusy.slice();
    if (typeof extra.queuedMs === 'number') entry.queuedMs = extra.queuedMs;
  }
  routeTrail.push(entry);
}

// One role call with ordered fallback: a route failure advances the chain, a
// content failure (from the caller's own checks) does not.
async function callRole(role, prompt, options) {
  const chain = roleRoutes[role];
  const total = Math.max(1, chain.length);
  const attempt = options.attempt || 0;
  const taskId = typeof options.taskId === 'string' ? options.taskId : '';
  let lastFailure = null;
  const tried = {};
  let triedCount = 0;
  // Routes this call must not spend at all. The planning leg passes the labels it
  // already paid in this same call, so its route-switch re-fire lands on a route
  // that has not just died: repeating a hung route costs the whole child budget
  // again and teaches the call nothing. No other caller passes this, so their
  // scan order stays byte-identical to before.
  const avoid = (function () {
    const out = {};
    const list = Array.isArray(options.avoid) ? options.avoid : null;
    if (list === null) return out;
    for (let i = 0; i < list.length; i++) {
      if (typeof list[i] === 'string' && list[i] !== '') out[list[i]] = true;
    }
    return out;
  })();
  function labelAt(index) {
    return routeLabel(index < chain.length ? chain[index] : null);
  }
  // Every route this call booked, in chain order: what a caller needs to know
  // before it decides to re-fire along the chain.
  function spentLabels() {
    const out = [];
    for (let i = 0; i < total; i++) if (tried[i]) out.push(labelAt(i));
    return out;
  }
  const skipped = [];
  const skippedSet = {};
  let queuedMs = 0;
  let waited = false;
  function markSkipped(route) {
    const label = routeLabel(route);
    if (!skippedSet[label]) { skippedSet[label] = true; skipped.push(label); }
  }
  function overflowExtra() {
    const extra = {};
    if (skipped.length > 0) extra.skippedBusy = skipped.slice();
    if (waited) extra.queuedMs = queuedMs;
    return extra;
  }
  // Scan order, three tiers: live non-busy untried routes first (each in original
  // chain order), then live routes another run is busy with (C1 hint), then dead
  // routes. Without a hint and without a dead route the first tier is the whole
  // chain, so this degenerates to the original order and the trail below stays
  // byte-identical to before.
  //
  // Dead last is also the full-lane tradeoff: when every live route is at its
  // in-flight cap and only a dead route has room, the scan places the call on the
  // dead route instead of waiting for a drain. Waiting is unbounded (a drain may
  // only come when a child finishes, which may be minutes) and the dead route is
  // still a route — the table is evidence, not a verdict, and it is cleared the
  // moment that route answers. Spending one attempt now is cheaper than holding
  // the task on a full lane.
  function preferredIndices() {
    const plain = [];
    const busy = [];
    const dead = [];
    for (let i = 0; i < total; i++) {
      if (tried[i]) continue;
      const candidate = i < chain.length ? chain[i] : null;
      if (isDeadRoute(candidate)) dead.push(i);
      else if (candidate && hintBusyLabel(routeLabel(candidate))) busy.push(i);
      else plain.push(i);
    }
    return plain.concat(busy, dead);
  }
  // An avoided route is booked as tried before the scan. The scan's termination
  // arithmetic is therefore untouched, and the "every untried route is full"
  // branch can never park the call on a route the caller told it to leave alone.
  for (const avoided in avoid) {
    for (let i = 0; i < total; i++) {
      if (tried[i] || labelAt(i) !== avoided) continue;
      tried[i] = true;
      triedCount += 1;
    }
  }
  while (triedCount < total) {
    // Hint-adjusted chain order wins: the first untried route with room in
    // preferred order takes this call. A full lane is recorded plainly as
    // before; a busy-with-room lane that loses only because the hint moved it
    // behind the winner gets a ' (cross-run hint)' marker in skippedBusy,
    // reusing the overflow evidence fields. Neither is a failure: no attempt
    // is spent and the fallback policy (switchOn/retries) is untouched.
    let index = -1;
    const order = preferredIndices();
    for (let k = 0; k < order.length; k++) {
      const i = order[k];
      const candidate = i < chain.length ? chain[i] : null;
      const inFlight = candidate ? (routeInFlight[routeLabel(candidate)] || 0) : 0;
      if (inFlight < routeCapOf(candidate)) { index = i; break; }
      markSkipped(candidate);
    }
    if (index !== -1) {
      const winner = index < chain.length ? chain[index] : null;
      if (winner && !hintBusyLabel(routeLabel(winner))) {
        for (let i = 0; i < index; i++) {
          if (tried[i]) continue;
          const other = i < chain.length ? chain[i] : null;
          if (!other || !hintBusyLabel(routeLabel(other))) continue;
          const inFlight = routeInFlight[routeLabel(other)] || 0;
          if (inFlight < routeCapOf(other)) {
            const label = routeLabel(other) + ' (cross-run hint)';
            if (!skippedSet[label]) { skippedSet[label] = true; skipped.push(label); }
          }
        }
      }
    }
    if (index === -1) {
      // Every untried route is full: wait for a drain, then rescan. This is
      // neither an attempt nor a failure, so the failure policy is untouched.
      const waitStart = nowMs();
      await new Promise(function (resolve) { routeWaiters.push(resolve); });
      queuedMs += Math.max(0, nowMs() - waitStart);
      waited = true;
      continue;
    }
    tried[index] = true;
    triedCount += 1;
    const route = index < chain.length ? chain[index] : null;
    const key = routeLabel(route);
    const capped = route !== null && isFinite(Number(route.maxInFlight));
    if (capped) routeInFlight[key] = (routeInFlight[key] || 0) + 1;
    // No -r<n> suffix: a user must not see which fallback route answered
    // (Issue #22 P1-1). The route that answered stays in the report's routes trail.
    const call = { label: options.label, phase: options.phase, schema: options.schema };
    if (route) {
      if (route.provider) call.provider = route.provider;
      call.model = route.model;
    }
    let value = null;
    let thrown = null;
    try {
      value = await raceChildCall(agent(prompt, call), { role: role, label: options.label, writesPaths: options.writesPaths });
    } catch (error) {
      thrown = error;
    }
    if (capped) {
      routeInFlight[key] = Math.max(0, (routeInFlight[key] || 0) - 1);
      notifyRouteWaiters();
    }
    if (thrown !== null) {
      const failure = isChildTimeout(thrown) ? childTimeoutFailure(role) : classifyCallFailure(role, thrown);
      traceRoute(role, index, route, attempt, 'failed', failure, overflowExtra(), taskId);
      noteRouteFailure(route, failure);
      lastFailure = failure;
      // One mechanism, not two: a setup fault (budget/schema/options) is built
      // with switchModel false, and a content failure (task-failed,
      // verification-failed) likewise. Both stop the chain here — never by
      // rethrowing, which is what keeps the run alive and the report present
      // (G-4).
      if (!failure.switchModel) break;
      continue;
    }
    if (value === null || value === undefined) {
      // The guest engine collapses "child run failed" and "child returned no
      // structured value" to null, so this is reported as a format failure on
      // this route and the next route is tried. The reason names the role and
      // the channel: a report that only said "no valid structured result" left a
      // reader unable to tell a quoting mistake in the child's JSON (re-sendable
      // in the same attempt) from a dead provider.
      //
      // A death the host could name never reaches here (D-120 修法二): it is
      // refused with a CHILD_DEATH marker instead. So a null that still arrives
      // is either a real format gap or a death with no recorded cause, and it
      // says nothing about the route — which is why it declares no routeHealth.
      const failure = { role: role, class: 'format-error', reason: role + ' returned no valid structured result (structured output missing or unparsable)', switchModel: true, routeHealth: '', setup: false, category: 'infrastructure' };
      traceRoute(role, index, route, attempt, 'failed', failure, overflowExtra(), taskId);
      noteRouteFailure(route, failure);
      lastFailure = failure;
      continue;
    }
    traceRoute(role, index, route, attempt, 'ok', null, overflowExtra(), taskId);
    noteRouteSuccess(route);
    return { ok: true, value: value, route: route, label: routeLabel(route), failure: null, spent: spentLabels() };
  }
  return {
    ok: false,
    value: null,
    route: null,
    label: 'exhausted',
    spent: spentLabels(),
    failure: lastFailure || { role: role, class: 'unknown', reason: 'no route produced a result', switchModel: false, setup: false, category: 'unknown' }
  };
}

function boundedText(value, max) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : null;
}

function boundedTextList(value, maxItems, maxChars) {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const out = [];
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== 'string') return null;
    const item = value[i].trim();
    if (item.length > maxChars) return null;
    if (item) out.push(item);
  }
  return out;
}

// ----------------------------------------------------- write-path conflicts --
// U-4: every child runs in the SAME working directory (the engine has no per-child
// cwd), so two tasks that write one file can corrupt each other. A task declares
// the paths it writes; overlapping tasks are serialized, the rest stay parallel.
// The host mirrors these three functions in src/paths.ts for unit tests.
function normalizeWritePath(raw) {
  if (typeof raw !== 'string') return null;
  const text = raw.trim().replace(/\\/g, '/');
  if (text === '') return null;
  const absolute = text.charAt(0) === '/';
  const parts = [];
  const segments = text.split('/');
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (parts.length > 0) parts.pop();
      continue;
    }
    parts.push(segment.toLowerCase());
  }
  if (parts.length === 0) return absolute ? '/' : '.';
  return (absolute ? '/' : '') + parts.join('/');
}

function writePathOverlap(left, right) {
  if (left === right) return true;
  if (left === '/' || left === '.' || right === '/' || right === '.') return true;
  const leftBase = left.charAt(left.length - 1) === '/' ? left : left + '/';
  const rightBase = right.charAt(right.length - 1) === '/' ? right : right + '/';
  return leftBase.indexOf(rightBase) === 0 || rightBase.indexOf(leftBase) === 0;
}

function writesConflict(left, right) {
  // undefined = unknown = could write anything, so it conflicts with everything.
  if (left === undefined || right === undefined) return true;
  if (left.length === 0 || right.length === 0) return false;
  for (let i = 0; i < left.length; i++) {
    for (let j = 0; j < right.length; j++) {
      if (writePathOverlap(left[i], right[j])) return true;
    }
  }
  return false;
}

function normalizeWritesPaths(value) {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) return undefined;
  if (value.length > TASK_LIMITS.writePathItems) return undefined;
  const out = [];
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== 'string') return undefined;
    if (value[i].trim().length > TASK_LIMITS.writePathChars) return undefined;
    const normalized = normalizeWritePath(value[i]);
    if (normalized === null) continue;
    if (out.indexOf(normalized) === -1) out.push(normalized);
  }
  return out;
}

function hasDeclaredPaths(tasks) {
  for (let i = 0; i < tasks.length; i++) {
    if (tasks[i].writesPaths !== null) return true;
  }
  return false;
}

// A dependency declaration is validated, never repaired: an unknown or malformed
// id would silently turn into "no dependency", which is exactly the failure mode
// that lets a downstream task run against work that never happened.
function normalizeDependsOn(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > DEPENDS_ON_LIMIT) return null;
  const out = [];
  const seen = {};
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== 'string') return null;
    const id = value[i].trim();
    if (id === '' || id.length > 64) return null;
    if (seen[id]) continue;
    seen[id] = true;
    out.push(id);
  }
  return out;
}

function normalizeTask(value, index) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const title = boundedText(value.title, TASK_LIMITS.titleChars);
  const taskObjective = boundedText(value.objective, TASK_LIMITS.taskTextChars);
  const expectedOutput = boundedText(value.expectedOutput, TASK_LIMITS.taskTextChars);
  const context = value.context === undefined ? '' : boundedText(value.context, TASK_LIMITS.taskTextChars);
  const acceptanceCriteria = boundedTextList(value.acceptanceCriteria, TASK_LIMITS.criteriaItems, TASK_LIMITS.criteriaChars);
  const constraints = value.constraints === undefined
    ? []
    : boundedTextList(value.constraints, TASK_LIMITS.constraintItems, TASK_LIMITS.constraintChars);
  if (title === null || !title || taskObjective === null || !taskObjective || expectedOutput === null || !expectedOutput) return null;
  if (context === null || acceptanceCriteria === null || acceptanceCriteria.length === 0 || constraints === null) return null;
  if (new Set(acceptanceCriteria).size !== acceptanceCriteria.length) return null;
  // Fail-safe: a malformed declaration becomes "unknown" (null) instead of
  // rejecting the task, because dropping the task would be worse than serializing
  // it; validation cannot be a reason to lose the work item.
  const writesPaths = normalizeWritesPaths(value.writesPaths);
  const criterionKeys = acceptanceCriteria.map(criterionKey);
  if (new Set(criterionKeys).size !== criterionKeys.length) return null;
  let id = value.id === undefined ? '' : boundedText(value.id, 64);
  if (id === null) return null;
  if (!id) id = 'task-' + (index + 1);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id)) return null;
  const originGoalId = value.originGoalId === undefined ? undefined : boundedText(value.originGoalId, 64);
  if (originGoalId === null) return null;
  const dependsOn = normalizeDependsOn(value.dependsOn);
  if (dependsOn === null) return null;
  return {
    id: id,
    title: title,
    objective: taskObjective,
    expectedOutput: expectedOutput,
    acceptanceCriteria: acceptanceCriteria,
    context: context,
    constraints: constraints,
    writesPaths: writesPaths === undefined ? null : writesPaths,
    // Kept out of the payload when empty: a plan that declares no dependency must
    // serialize exactly as it did before waves existed.
    ...dependsOn.length === 0 ? {} : { dependsOn: dependsOn },
    ...originGoalId === undefined ? {} : { originGoalId: originGoalId }
  };
}

// Why the last plan normalization failed (Wave 3). A rejected plan must say
// which task and which dependency broke it (A2): "invalid plan" leaves a reader
// with nothing to fix, and leaves the report unable to name an offending task.
let planRejection = '';

// Depth-first cycle search over declared dependencies. A wave-ordered plan cannot
// express a cycle (an edge may only point backwards), but a flat plan can, and
// "structurally impossible" is not the same as "checked".
function dependencyCycle(tasks) {
  const byId = {};
  for (let i = 0; i < tasks.length; i++) byId[tasks[i].id] = tasks[i];
  const state = {};
  const stack = [];
  function visit(id) {
    const task = byId[id];
    if (!task) return '';
    if (state[id] === 1) return stack.slice(stack.indexOf(id)).concat([id]).join(' -> ');
    if (state[id] === 2) return '';
    state[id] = 1;
    stack.push(id);
    const deps = task.dependsOn || [];
    for (let i = 0; i < deps.length; i++) {
      const cycle = visit(deps[i]);
      if (cycle !== '') return cycle;
    }
    stack.pop();
    state[id] = 2;
    return '';
  }
  for (let i = 0; i < tasks.length; i++) {
    const cycle = visit(tasks[i].id);
    if (cycle !== '') return cycle;
  }
  return '';
}

// Wave-agnostic dependency faults: a task that depends on itself, on an id the
// plan never declares, or a cycle. Each message names the offending task.
function validateDependencyRefs(tasks) {
  const byId = {};
  for (let i = 0; i < tasks.length; i++) byId[tasks[i].id] = tasks[i];
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const deps = task.dependsOn || [];
    for (let d = 0; d < deps.length; d++) {
      if (deps[d] === task.id) return 'task ' + task.id + ' depends on itself';
      if (!byId[deps[d]]) return 'task ' + task.id + ' depends on unknown task ' + deps[d];
    }
  }
  const cycle = dependencyCycle(tasks);
  return cycle === '' ? '' : 'dependency cycle: ' + cycle;
}

// A declared dependency must point at an earlier wave: that is what makes
// "downstream sees settled upstream" true at scheduling time (S2b, fail-closed).
function validateWaveOrder(tasks) {
  const byId = {};
  for (let i = 0; i < tasks.length; i++) byId[tasks[i].id] = tasks[i];
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const own = typeof task.wave === 'number' ? task.wave : 0;
    const deps = task.dependsOn || [];
    for (let d = 0; d < deps.length; d++) {
      const dep = byId[deps[d]];
      const other = typeof dep.wave === 'number' ? dep.wave : 0;
      if (other >= own) {
        return 'task ' + task.id + ' (wave ' + (own + 1) + ') depends on ' + dep.id + ' in wave ' + (other + 1) + '; a dependency must point to an earlier wave';
      }
    }
  }
  return '';
}

// Flat plans that declare dependencies are levelled instead of rejected: the
// longest dependency path is the wave a task belongs to, so tasks + dependsOn
// schedules as a DAG without asking the planner to count levels itself. A chain
// deeper than the wave ceiling is rejected like any other over-limit plan.
function levelWaves(tasks) {
  const byId = {};
  for (let i = 0; i < tasks.length; i++) byId[tasks[i].id] = tasks[i];
  const level = {};
  function levelOf(id, seen) {
    if (typeof level[id] === 'number') return level[id];
    if (seen[id]) return 0;
    seen[id] = true;
    const task = byId[id];
    let deepest = 0;
    const deps = task && task.dependsOn ? task.dependsOn : [];
    for (let d = 0; d < deps.length; d++) deepest = Math.max(deepest, levelOf(deps[d], seen) + 1);
    level[id] = deepest;
    return deepest;
  }
  for (let i = 0; i < tasks.length; i++) tasks[i].wave = levelOf(tasks[i].id, {});
  return tasks;
}

function wavesOf(tasks) {
  const out = [];
  for (let i = 0; i < tasks.length; i++) {
    const wave = typeof tasks[i].wave === 'number' ? tasks[i].wave : 0;
    while (out.length <= wave) out.push([]);
    out[wave].push(tasks[i].id);
  }
  return out;
}

function normalizePlan(raw, source) {
  planRejection = '';
  if (!raw || typeof raw !== 'object') {
    planRejection = 'plan is not an object';
    return null;
  }
  // Continue/stop is the captain's judgement (round-071). Only an explicit "stop"
  // changes scheduling; every other value — including a value this build does not
  // know — reads as "continue", which is exactly the pre-round-071 behaviour. A
  // malformed policy is therefore never a reason to reject an otherwise valid plan.
  const onFailure = raw.onFailure === 'stop' ? 'stop' : 'continue';
  const rawWaves = Array.isArray(raw.waves) ? raw.waves : null;
  const rawTasks = Array.isArray(raw.tasks) ? raw.tasks : null;
  if (rawWaves !== null) {
    if (rawWaves.length === 0 || rawWaves.length > WAVE_LIMIT) {
      planRejection = 'plan declares ' + rawWaves.length + ' waves; the limit is ' + WAVE_LIMIT;
      return null;
    }
    const tasks = [];
    const ids = new Set();
    for (let w = 0; w < rawWaves.length; w++) {
      const group = rawWaves[w];
      if (!Array.isArray(group) || group.length === 0) {
        planRejection = 'wave ' + (w + 1) + ' is not a non-empty task list';
        return null;
      }
      for (let i = 0; i < group.length; i++) {
        if (tasks.length >= maxTasks) {
          planRejection = 'plan declares more than ' + maxTasks + ' tasks';
          return null;
        }
        const task = normalizeTask(group[i], tasks.length);
        if (!task) {
          planRejection = 'wave ' + (w + 1) + ' task ' + (i + 1) + ' is not a valid task';
          return null;
        }
        if (ids.has(task.id)) {
          planRejection = 'duplicate task id ' + task.id;
          return null;
        }
        ids.add(task.id);
        task.wave = w;
        tasks.push(task);
      }
    }
    const refProblem = validateDependencyRefs(tasks);
    if (refProblem !== '') { planRejection = refProblem; return null; }
    const orderProblem = validateWaveOrder(tasks);
    if (orderProblem !== '') { planRejection = orderProblem; return null; }
    if (JSON.stringify(tasks).length > TASK_LIMITS.aggregateChars) {
      planRejection = 'plan is over the aggregate size limit';
      return null;
    }
    return { source: source, tasks: tasks, waves: wavesOf(tasks), onFailure: onFailure };
  }
  if (!rawTasks || rawTasks.length === 0 || rawTasks.length > maxTasks) {
    planRejection = 'plan must declare 1-' + maxTasks + ' tasks';
    return null;
  }
  const tasks = [];
  const ids = new Set();
  for (let i = 0; i < rawTasks.length; i++) {
    const task = normalizeTask(rawTasks[i], i);
    if (!task) {
      planRejection = 'task ' + (i + 1) + ' is not a valid task';
      return null;
    }
    if (ids.has(task.id)) {
      planRejection = 'duplicate task id ' + task.id;
      return null;
    }
    ids.add(task.id);
    tasks.push(task);
  }
  const refProblem = validateDependencyRefs(tasks);
  if (refProblem !== '') { planRejection = refProblem; return null; }
  levelWaves(tasks);
  // Plan order becomes execution order: a task list a reader scrolls and a report
  // that renders per wave must agree, and the report format requires the plan rows
  // and the task rows to line up index for index. The sort is stable, so tasks of
  // one wave keep the order the planner wrote them in.
  tasks.sort(function (left, right) { return (left.wave || 0) - (right.wave || 0); });
  const orderProblem = validateWaveOrder(tasks);
  if (orderProblem !== '') { planRejection = orderProblem; return null; }
  const waveCount = wavesOf(tasks).length;
  if (waveCount > WAVE_LIMIT) {
    planRejection = 'plan needs ' + waveCount + ' dependency levels; the limit is ' + WAVE_LIMIT;
    return null;
  }
  if (JSON.stringify(tasks).length > TASK_LIMITS.aggregateChars) {
    planRejection = 'plan is over the aggregate size limit';
    return null;
  }
  return { source: source, tasks: tasks, waves: wavesOf(tasks), onFailure: onFailure };
}

// Planner failure fallback: the objective itself is the only work item left, so
// it must reach the workers whole. A single task cannot carry it once it is
// longer than TASK_LIMITS.taskTextChars (and the task count cannot depend on
// maxTasks either), so the fallback splits it into contiguous segments that
// each respect the per-task bound. Concatenating the segment objectives
// reproduces the original objective byte for byte: the split never trims,
// normalizes, or drops a character.
function fallbackGoalId(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return 'goal-' + (hash >>> 0).toString(36) + '-' + value.length;
}

`;
}
