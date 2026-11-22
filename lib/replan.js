/**
 * Mid-run replan: merge new demands into a plan that is already executing.
 *
 * The planner is the thing behind a run; a user message that arrives while the run
 * is working must change the *remaining* plan, not restart the round. This module
 * is the host-visible half of that merge, and the only copy of the rule set: the
 * workflow script cannot import host code, so {@link replanMergeSource} emits the
 * same implementation into the guest realm and {@link mergeReplan} evaluates that
 * exact source in the host, which is why the two can never drift.
 *
 * What a merge may and may not touch is the whole safety story:
 *
 * - a settled task (`verified` / `failed` / `blocked`) is terminal and read-only,
 *   so completed, verified work is preserved and never re-executed;
 * - a running task has no per-child handle in the engine, so editing it can only
 *   mean abandoning work already paid for; an edit that names one is refused and
 *   the task runs to its own settlement;
 * - only unstarted tasks (the remaining waves) can be added, updated, removed or
 *   re-ordered, and every resulting dependency still has to point at a settled task
 *   or an earlier remaining wave.
 *
 * A refused merge changes nothing: the run continues on the plan it already had,
 * which is why a bad replan can never lose a run.
 */
/** Bounds on one merge. Every number is also enforced in the guest source below. */
export const REPLAN_LIMITS = {
    /** Edits one boundary may apply. */
    maxEdits: 16,
    /** Human-readable decision lines carried into the report. */
    maxDecisions: 12,
    /** Character bound on one decision line. */
    decisionChars: 240,
    /** Intents one boundary child may pull, and the queue bound the host enforces. */
    maxIntents: 8,
    /** Character bound on one queued intent. */
    intentChars: 2000,
    /** Boundary planner calls one run may spend on replanning, whatever its wave count. */
    maxBoundaries: 4,
};
/**
 * The merge implementation, as plain ES5-shaped JavaScript.
 *
 * Kept in a string because the guest realm has no module loader: the same text is
 * `${replanMergeSource()}`'d into the workflow script. It reads only the values it
 * is given, never a global, so the same function is safe on both sides.
 */
const MERGE_SOURCE = String.raw `
// One merge of new demands into a plan that is already running. Pure: the input
// state is copied before anything changes, so a rejection leaves the caller's
// plan byte-identical.
function mergeReplan(state, request) {
  var MAX_EDITS = 16;
  var MAX_DECISIONS = 12;
  var DECISION_CHARS = 240;
  function refuse(reason) {
    var text = String(reason).slice(0, DECISION_CHARS);
    return { ok: false, version: Math.max(1, Math.floor(Number(state && state.version) || 1)), reason: text };
  }
  if (!state || typeof state !== 'object') return refuse('replan needs the plan state it is merging into');
  if (!request || typeof request !== 'object') return refuse('replan needs a request (version and edits)');
  var current = Math.max(1, Math.floor(Number(state.version) || 1));
  var version = Math.floor(Number(request.version) || 0);
  if (version !== current + 1) {
    return refuse('replan version ' + version + ' does not follow plan version ' + current + '; a merge is only valid for the next version');
  }
  var edits = Array.isArray(request.edits) ? request.edits : [];
  if (edits.length === 0) return refuse('replan carried no task edits');
  if (edits.length > MAX_EDITS) return refuse('replan carried ' + edits.length + ' edits; the limit is ' + MAX_EDITS);
  var settled = state.settled && typeof state.settled === 'object' ? state.settled : {};
  var inFlight = Array.isArray(state.inFlight) ? state.inFlight : [];
  var running = {};
  for (var f = 0; f < inFlight.length; f++) running[String(inFlight[f])] = true;
  var sourceWaves = Array.isArray(state.waves) ? state.waves : [];
  var waveLimit = Math.max(1, Math.floor(Number(state.waveLimit) || 1));
  var maxTasks = Math.max(1, Math.floor(Number(state.maxTasks) || 1));
  var wavesUsed = Math.max(0, Math.floor(Number(state.wavesUsed) || 0));
  // Copy the remaining waves first: the merge never edits its input.
  var waves = [];
  var byId = {};
  var waveOf = {};
  for (var w = 0; w < sourceWaves.length; w++) {
    var list = [];
    var source = Array.isArray(sourceWaves[w]) ? sourceWaves[w] : [];
    for (var i = 0; i < source.length; i++) {
      var task = source[i];
      if (!task || typeof task !== 'object') continue;
      var id = String(task.id);
      var copy = {};
      for (var key in task) {
        if (!Object.prototype.hasOwnProperty.call(task, key)) continue;
        copy[key] = task[key];
      }
      list.push(copy);
      byId[id] = copy;
      waveOf[id] = w;
    }
    waves.push(list);
  }
  function failOn(id, action) {
    if (Object.prototype.hasOwnProperty.call(settled, id)) {
      return refuse('cannot ' + action + ' task ' + id + ': it already settled as ' + String(settled[id]) + ' (settled work is preserved, never re-run)');
    }
    if (running[id]) {
      return refuse('cannot ' + action + ' task ' + id + ': it is running; in-flight work continues until it settles');
    }
    return null;
  }
  var added = [];
  var updated = [];
  var removed = [];
  var removedIds = {};
  function removeById(id) {
    for (var w2 = 0; w2 < waves.length; w2++) {
      for (var i2 = 0; i2 < waves[w2].length; i2++) {
        if (String(waves[w2][i2].id) === id) {
          waves[w2].splice(i2, 1);
          delete byId[id];
          delete waveOf[id];
          return true;
        }
      }
    }
    return false;
  }
  for (var e = 0; e < edits.length; e++) {
    var edit = edits[e];
    if (!edit || typeof edit !== 'object') return refuse('edit ' + (e + 1) + ' is not an object');
    var action = String(edit.action || '');
    var id = edit.id === undefined || edit.id === null ? '' : String(edit.id);
    if (action === 'add') {
      var raw = edit.task;
      if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || raw.id === '') {
        return refuse('edit ' + (e + 1) + ' adds a task without an explicit id');
      }
      var newId = raw.id;
      if (Object.prototype.hasOwnProperty.call(settled, newId) || running[newId] || byId[newId]) {
        return refuse('cannot add task ' + newId + ': the id is already used by this run');
      }
      var newTask = {};
      for (var nk in raw) {
        if (!Object.prototype.hasOwnProperty.call(raw, nk)) continue;
        newTask[nk] = raw[nk];
      }
      added.push(newTask);
      // Register it so an explicit 'order' (which lists the whole remaining set)
      // can place the new task, and so a later edit cannot reuse the id.
      byId[newId] = newTask;
      continue;
    }
    if (action !== 'update' && action !== 'remove') {
      return refuse('edit ' + (e + 1) + ' has unknown action "' + action + '"');
    }
    if (id === '') return refuse('edit ' + (e + 1) + ' (' + action + ') names no task id');
    var blocked = failOn(id, action);
    if (blocked) return blocked;
    if (action === 'remove') {
      if (!removeById(id)) return refuse('cannot remove task ' + id + ': no unstarted task has that id');
      removed.push(id);
      removedIds[id] = true;
      continue;
    }
    var target = byId[id];
    if (!target) return refuse('cannot update task ' + id + ': no unstarted task has that id');
    var fields = edit.task;
    if (!fields || typeof fields !== 'object') return refuse('update of task ' + id + ' carries no fields');
    var changed = false;
    for (var field in fields) {
      if (!Object.prototype.hasOwnProperty.call(fields, field)) continue;
      if (field === 'id') return refuse('update of task ' + id + ' may not change its id');
      target[field] = fields[field];
      changed = true;
    }
    if (!changed) return refuse('update of task ' + id + ' carries no fields');
    updated.push(id);
  }
  var total = 0;
  for (var sid in settled) {
    if (Object.prototype.hasOwnProperty.call(settled, sid)) total += 1;
  }
  var before = [];
  for (var bw = 0; bw < waves.length; bw++) {
    for (var bi = 0; bi < waves[bw].length; bi++) before.push(String(waves[bw][bi].id));
  }
  // Explicit order: the planner's own grouping of the same task set. Anything else
  // (a missing, duplicated or invented id) is refused whole rather than repaired,
  // because a repaired order would be a schedule nobody asked for.
  var reordered = false;
  if (request.order !== undefined && request.order !== null) {
    var order = request.order;
    if (!Array.isArray(order) || order.length === 0) return refuse('replan order must be a non-empty list of waves');
    var ordered = [];
    var seen = {};
    for (var ow = 0; ow < order.length; ow++) {
      if (!Array.isArray(order[ow])) return refuse('replan order wave ' + (ow + 1) + ' is not a list of task ids');
      var orderedWave = [];
      for (var oi = 0; oi < order[ow].length; oi++) {
        var orderedId = String(order[ow][oi]);
        if (seen[orderedId]) return refuse('replan order lists task ' + orderedId + ' more than once');
        if (!byId[orderedId]) return refuse('replan order names task ' + orderedId + ', which is not an unstarted task');
        seen[orderedId] = true;
        orderedWave.push(byId[orderedId]);
        ordered.push(orderedId);
      }
      if (orderedWave.length > 0) waves.push(orderedWave);
    }
    var expected = [];
    for (var bid = 0; bid < before.length; bid++) expected.push(before[bid]);
    for (var aid = 0; aid < added.length; aid++) expected.push(String(added[aid].id));
    if (ordered.length !== expected.length) {
      return refuse('replan order covers ' + ordered.length + ' task(s) but the plan would have ' + expected.length);
    }
    var same = true;
    for (var c = 0; c < expected.length; c++) {
      if (expected[c] !== ordered[c]) { same = false; break; }
    }
    reordered = !same;
    waves = [];
    for (var rw = 0; rw < order.length; rw++) {
      var rebuilt = [];
      for (var ri = 0; ri < order[rw].length; ri++) {
        if (String(order[rw][ri]) !== '') rebuilt.push(byId[String(order[rw][ri])]);
      }
      if (rebuilt.length > 0) waves.push(rebuilt);
    }
    if (!same) {
      var flat = [];
      for (var fw = 0; fw < waves.length; fw++) {
        for (var fi = 0; fi < waves[fw].length; fi++) flat.push(String(waves[fw][fi].id));
      }
      for (var fc = 0; fc < flat.length; fc++) {
        if (flat[fc] !== ordered[fc]) return refuse('replan order could not be applied as written');
      }
    }
  } else if (added.length > 0) {
    // Additions ride their own wave: an added task may depend on anything already
    // planned, but nothing already planned depends on it, so appending a wave is
    // the only placement that cannot reorder work that is already scheduled.
    waves.push(added);
  }
  // Drop waves that a removal emptied, then renumber.
  var compact = [];
  for (var dw = 0; dw < waves.length; dw++) {
    if (waves[dw].length === 0) continue;
    compact.push(waves[dw]);
  }
  waves = compact;
  // Recompute ids/wave indexes after the edit, then validate dependencies against
  // the *new* schedule: settled tasks are fair game (they are in the past), and an
  // unstarted dependency must sit in an earlier remaining wave.
  byId = {};
  waveOf = {};
  for (var vw = 0; vw < waves.length; vw++) {
    for (var vi = 0; vi < waves[vw].length; vi++) {
      var vt = waves[vw][vi];
      var vid = String(vt.id);
      if (byId[vid]) return refuse('replan would create two tasks with id ' + vid);
      byId[vid] = vt;
      waveOf[vid] = vw;
      vt.wave = vw;
      total += 1;
      if (!String(vt.title || '') || !String(vt.objective || '') || !String(vt.expectedOutput || '')) {
        return refuse('task ' + vid + ' is missing a title, objective or expected output');
      }
      if (!Array.isArray(vt.acceptanceCriteria) || vt.acceptanceCriteria.length === 0) {
        return refuse('task ' + vid + ' has no acceptance criteria');
      }
    }
  }
  if (total > maxTasks) return refuse('replan would make ' + total + ' tasks; maxTasks is ' + maxTasks);
  if (wavesUsed + waves.length > waveLimit) {
    return refuse('replan would make ' + (wavesUsed + waves.length) + ' waves; the limit is ' + waveLimit);
  }
  for (var cw = 0; cw < waves.length; cw++) {
    for (var ci = 0; ci < waves[cw].length; ci++) {
      var ct = waves[cw][ci];
      var deps = Array.isArray(ct.dependsOn) ? ct.dependsOn : [];
      for (var d = 0; d < deps.length; d++) {
        var dep = String(deps[d]);
        if (dep === String(ct.id)) return refuse('task ' + ct.id + ' depends on itself');
        if (Object.prototype.hasOwnProperty.call(settled, dep)) continue;
        if (!byId[dep]) return refuse('task ' + ct.id + ' depends on unknown task ' + dep);
        if (waveOf[dep] >= cw) {
          return refuse('task ' + ct.id + ' (wave ' + (cw + 1) + ') depends on ' + dep + ' in wave ' + (waveOf[dep] + 1) + '; a dependency must point to an earlier wave');
        }
      }
    }
  }
  // Rebuild the id lists and the decision lines only after everything validated:
  // a rejection above must not have produced a partial-looking ledger entry.
  var finalIds = [];
  for (var lw = 0; lw < waves.length; lw++) {
    for (var li = 0; li < waves[lw].length; li++) finalIds.push(String(waves[lw][li].id));
  }
  var removedFinal = [];
  for (var rf = 0; rf < removed.length; rf++) removedFinal.push(removed[rf]);
  var decisions = [];
  var parts = [];
  if (added.length > 0) parts.push('added ' + added.length);
  if (updated.length > 0) parts.push('updated ' + updated.length);
  if (removedFinal.length > 0) parts.push('removed ' + removedFinal.length);
  if (reordered) parts.push('re-ordered');
  decisions.push(('version ' + version + ': ' + (parts.length === 0 ? 'no change' : parts.join(', '))).slice(0, DECISION_CHARS));
  if (decisions.length > MAX_DECISIONS) decisions = decisions.slice(0, MAX_DECISIONS);
  return {
    ok: true,
    version: version,
    waves: waves,
    addedTaskIds: (function () { var ids = []; for (var a = 0; a < added.length; a++) ids.push(String(added[a].id)); return ids; })(),
    updatedTaskIds: updated,
    removedTaskIds: removedFinal,
    reordered: reordered,
    decisions: decisions
  };
}
`;
/** Script-realm source for the merge, emitted into the generated workflow script. */
export function replanMergeSource() {
    return MERGE_SOURCE;
}
/**
 * The same merge, evaluated once in the host.
 *
 * Tests call this function instead of a second hand-written copy, so the rule set
 * they pin is the one the guest runs.
 */
export const mergeReplan = new Function(`${MERGE_SOURCE}\nreturn mergeReplan;`)();
//# sourceMappingURL=replan.js.map