import { replanMergeSource } from '../replan.js'
export function guestReplan(): string {
  return String.raw`// ------------------------------------------------------- mid-run replan (L2) --
// The merge itself is generated from src/replan.ts, so the host tests and the guest
// script run one rule set: a settled task is terminal, a running task is untouched,
// and only the unstarted waves can change.
${replanMergeSource()}

// The fields of one task body, described once and reused by the add and update
// shapes. The descriptions are not decoration: the child reads this schema as the
// instruction for its one tool call, and a bare items-object left the nesting level
// to the model. A live boundary answered with the task's fields beside "action"
// instead of under "task" — a demand it had understood and the merge then refused
// over one level of braces.
const REPLAN_TASK_PROPERTIES = {
  id: { type: 'string', description: 'Explicit task id, task-N style, unique within this run.' },
  title: { type: 'string' },
  objective: { type: 'string' },
  expectedOutput: { type: 'string' },
  acceptanceCriteria: {
    type: 'array',
    items: { type: 'string' },
    description: 'At least one testable criterion; a task without one cannot be verified and is refused whole.'
  },
  context: { type: 'string' },
  constraints: { type: 'array', items: { type: 'string' } },
  writesPaths: { type: 'array', items: { type: 'string' } },
  dependsOn: {
    type: 'array',
    items: { type: 'string' },
    description: 'Task ids exactly as printed in this prompt (task-2, task-3), or ids of settled tasks. Never a title, a nickname or an id the plan does not have.'
  }
};

// One edit of the plan. The three actions are spelled as three shapes so the tool
// schema itself says where the task body goes and which fields an added task must
// carry; the script still validates every field (the schema is a hint the runtime
// enforces, the merge is the rule).
const REPLAN_EDIT_SCHEMAS = [
  {
    type: 'object',
    additionalProperties: false,
    description: 'Append one new task after the last remaining wave.',
    required: ['action', 'task'],
    properties: {
      action: { type: 'string', enum: ['add'] },
      task: {
        type: 'object',
        additionalProperties: false,
        description: 'The new task, with all of its fields inside this object.',
        required: ['id', 'title', 'objective', 'expectedOutput', 'acceptanceCriteria'],
        properties: REPLAN_TASK_PROPERTIES
      }
    }
  },
  {
    type: 'object',
    additionalProperties: false,
    description: 'Replace some fields of an unstarted task. Only the fields you name change.',
    required: ['action', 'id', 'task'],
    properties: {
      action: { type: 'string', enum: ['update'] },
      id: { type: 'string', description: 'The unstarted task to change, exactly as printed in UNSTARTED TASKS.' },
      task: {
        type: 'object',
        additionalProperties: false,
        description: 'The fields to replace, inside this object.',
        required: [],
        properties: REPLAN_TASK_PROPERTIES
      }
    }
  },
  {
    type: 'object',
    additionalProperties: false,
    description: 'Remove one unstarted task; the tasks you leave in place still run.',
    required: ['action', 'id'],
    properties: {
      action: { type: 'string', enum: ['remove'] },
      id: { type: 'string', description: 'The unstarted task to drop, exactly as printed in UNSTARTED TASKS.' }
    }
  }
];

// What the boundary planner child may answer. 'none' means "the queue was empty or
// nothing in it changes the plan"; 'apply' carries the edits and, optionally, an
// explicit wave grouping for everything that has not started yet.
const REPLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['action'],
  properties: {
    action: { type: 'string', enum: ['none', 'apply'] },
    reason: { type: 'string', description: 'One line, in your own words: why the plan changed, or why it did not.' },
    edits: {
      type: 'array',
      description: 'What the plan should become. Every task field belongs INSIDE "task"; a body written beside "action" is lifted for you, but a task is only complete when it carries id, title, objective, expectedOutput and acceptanceCriteria.',
      items: { oneOf: REPLAN_EDIT_SCHEMAS }
    },
    order: {
      type: 'array',
      description: 'Optional: one array of task ids per remaining wave, listing every unstarted task (including added ones) exactly once.',
      items: { type: 'array', items: { type: 'string' } }
    }
  }
};

// The fields a body may carry. Kept as a list because the same lift has to work on
// both sides of the realm boundary (this file and the merge source in replan.ts).
const REPLAN_BODY_FIELDS = ['id', 'title', 'objective', 'expectedOutput', 'acceptanceCriteria', 'context', 'constraints', 'writesPaths', 'dependsOn'];

// The task body of one edit. A body under "task" is used as written; a body found
// beside "action" is lifted (keepId is false for an update, whose id names the
// target rather than a replacement field). The nesting level is not part of the
// decision, so an answer that says what the task is gets read — and still has every
// field validated, which is why lifting can never smuggle in a half-valid task.
function replanEditBody(edit, keepId) {
  if (edit.task && typeof edit.task === 'object' && !Array.isArray(edit.task)) return edit.task;
  const body = {};
  let found = false;
  for (let i = 0; i < REPLAN_BODY_FIELDS.length; i++) {
    const field = REPLAN_BODY_FIELDS[i];
    if (field === 'id' && keepId !== true) continue;
    if (edit[field] === undefined) continue;
    body[field] = edit[field];
    found = true;
  }
  return found ? body : null;
}

// Which of the mandatory task fields a body is missing, in the plan's own order.
// A refusal that only said "invalid task" left the reader (and the resubmit) with
// nothing to act on; the merge has to stay exactly as it is either way.
function replanMissingFields(raw) {
  const missing = [];
  if (!boundedText(raw.title, TASK_LIMITS.titleChars)) missing.push('title');
  if (!boundedText(raw.objective, TASK_LIMITS.taskTextChars)) missing.push('objective');
  if (!boundedText(raw.expectedOutput, TASK_LIMITS.taskTextChars)) missing.push('expectedOutput');
  const criteria = boundedTextList(raw.acceptanceCriteria, TASK_LIMITS.criteriaItems, TASK_LIMITS.criteriaChars);
  if (criteria === null || criteria.length === 0) missing.push('acceptanceCriteria');
  return missing;
}

// The replacement fields of one unstarted task, validated field by field. An
// update that would produce an unreadable task is refused whole; the merge must
// never be handed a half-valid task it then reports as if it were fine.
function normalizeReplanFields(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out = {};
  let count = 0;
  if (value.title !== undefined) {
    const title = boundedText(value.title, TASK_LIMITS.titleChars);
    if (!title) return null;
    out.title = title;
    count += 1;
  }
  if (value.objective !== undefined) {
    const text = boundedText(value.objective, TASK_LIMITS.taskTextChars);
    if (!text) return null;
    out.objective = text;
    count += 1;
  }
  if (value.expectedOutput !== undefined) {
    const text = boundedText(value.expectedOutput, TASK_LIMITS.taskTextChars);
    if (!text) return null;
    out.expectedOutput = text;
    count += 1;
  }
  if (value.context !== undefined) {
    const text = boundedText(value.context, TASK_LIMITS.taskTextChars);
    if (text === null) return null;
    out.context = text;
    count += 1;
  }
  if (value.acceptanceCriteria !== undefined) {
    const list = boundedTextList(value.acceptanceCriteria, TASK_LIMITS.criteriaItems, TASK_LIMITS.criteriaChars);
    if (list === null || list.length === 0 || new Set(list).size !== list.length) return null;
    out.acceptanceCriteria = list;
    count += 1;
  }
  if (value.constraints !== undefined) {
    const list = boundedTextList(value.constraints, TASK_LIMITS.constraintItems, TASK_LIMITS.constraintChars);
    if (list === null) return null;
    out.constraints = list;
    count += 1;
  }
  if (value.writesPaths !== undefined) {
    if (value.writesPaths === null) {
      out.writesPaths = null;
    } else {
      const paths = normalizeWritesPaths(value.writesPaths);
      if (paths === undefined) return null;
      out.writesPaths = paths;
    }
    count += 1;
  }
  if (value.dependsOn !== undefined) {
    const deps = normalizeDependsOn(value.dependsOn);
    if (deps === null) return null;
    out.dependsOn = deps;
    count += 1;
  }
  return count === 0 ? null : out;
}

// One structured answer from the boundary planner, normalized and bounded. Nothing
// here throws: an unreadable answer is a refusal with a reason, because the run has
// to continue on its old plan either way.
function normalizeReplanAnswer(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, reason: 'replan returned no structured answer' };
  }
  const action = typeof value.action === 'string' ? value.action : '';
  if (action === 'none') return { ok: true, none: true };
  if (action !== 'apply') return { ok: false, reason: 'replan action "' + action + '" is not understood' };
  const rawEdits = Array.isArray(value.edits) ? value.edits : [];
  if (rawEdits.length === 0) return { ok: false, reason: 'replan asked to apply but carried no edits' };
  if (rawEdits.length > REPLAN_MAX_EDITS) {
    return { ok: false, reason: 'replan carried ' + rawEdits.length + ' edits; the limit is ' + REPLAN_MAX_EDITS };
  }
  const edits = [];
  for (let i = 0; i < rawEdits.length; i++) {
    const edit = rawEdits[i];
    if (!edit || typeof edit !== 'object' || Array.isArray(edit)) {
      return { ok: false, reason: 'replan edit ' + (i + 1) + ' is not an object' };
    }
    const kind = typeof edit.action === 'string' ? edit.action : '';
    if (kind === 'add') {
      const raw = replanEditBody(edit, true);
      if (raw === null) {
        return { ok: false, reason: 'replan edit ' + (i + 1) + ' adds a task with no body (put its fields inside "task")' };
      }
      if (typeof raw.id !== 'string' || raw.id.trim() === '') {
        return { ok: false, reason: 'replan edit ' + (i + 1) + ' adds a task without an explicit id' };
      }
      const task = normalizeTask(raw, i);
      if (!task) {
        const missing = replanMissingFields(raw);
        return {
          ok: false,
          reason: 'replan edit ' + (i + 1) + ' adds an invalid task'
            + (missing.length === 0 ? '' : ' (missing or unusable: ' + missing.join(', ') + ')')
        };
      }
      edits.push({ action: 'add', task: task });
      continue;
    }
    if (kind !== 'update' && kind !== 'remove') {
      return { ok: false, reason: 'replan edit ' + (i + 1) + ' has unknown action "' + kind + '"' };
    }
    const id = boundedText(edit.id, 64);
    if (!id) return { ok: false, reason: 'replan edit ' + (i + 1) + ' (' + kind + ') names no task id' };
    if (kind === 'remove') {
      edits.push({ action: 'remove', id: id });
      continue;
    }
    const fields = normalizeReplanFields(replanEditBody(edit, false));
    if (!fields) return { ok: false, reason: 'replan edit ' + (i + 1) + ' updates task ' + id + ' with invalid or no fields' };
    edits.push({ action: 'update', id: id, task: fields });
  }
  let order = null;
  if (value.order !== undefined && value.order !== null) {
    if (!Array.isArray(value.order) || value.order.length === 0) {
      return { ok: false, reason: 'replan order must be a non-empty list of waves' };
    }
    order = [];
    for (let w = 0; w < value.order.length; w++) {
      if (!Array.isArray(value.order[w])) return { ok: false, reason: 'replan order wave ' + (w + 1) + ' is not a list' };
      const wave = [];
      for (let j = 0; j < value.order[w].length; j++) {
        const id = boundedText(value.order[w][j], 64);
        if (!id) return { ok: false, reason: 'replan order wave ' + (w + 1) + ' carries an invalid task id' };
        wave.push(id);
      }
      order.push(wave);
    }
  }
  const reason = typeof value.reason === 'string' ? value.reason.trim().slice(0, 400) : '';
  return { ok: true, edits: edits, order: order, reason: reason };
}

function replanBoundaryPhase(boundary) {
  return replanChannel === null ? '' : phaseLabel('plan') + ' · 波 ' + (boundary + 1) + ' 边界';
}

// Ask the plan's own planner to fold the queued demands into the remaining waves.
// The child is the only channel that can read the host queue (the realm cannot), so
// its prompt carries the run token and names the pull tool; everything else it
// needs — what already settled, what has not started — is in the prompt.
function replanPrompt(boundary, remaining, settled, version, label) {
  const lines = [];
  // The panel lifts a child's row label off its prompt's first line, so the
  // boundary call's numbered name opens the prompt — the REPLAN explanation that
  // used to be line one follows it.
  lines.push(label);
  lines.push('REPLAN: the plan for this run is already executing. You are the same captain that wrote it, and this boundary is yours: fold any new demand into the tasks that have NOT started yet, re-order or drop the remainder when it is now the wrong work, and stop the rest when continuing would only burn budget on top of a task that did not pass.');
  lines.push('');
  lines.push('RUN TOKEN: ' + (replanChannel === null ? '' : replanChannel.token));
  lines.push('PULL TOOL: ' + (replanChannel === null ? '' : replanChannel.tool));
  lines.push('Call ' + (replanChannel === null ? 'the pull tool' : replanChannel.tool) + ' exactly once with {"token":"' + (replanChannel === null ? '' : replanChannel.token) + '"} to read the demands queued since the last boundary. Those demands are the only new information you have; do not invent demands, and do not restate the old ones.');
  lines.push('');
  lines.push('CURRENT PLAN VERSION: ' + version);
  lines.push('BOUNDARY: wave ' + (boundary + 1) + ' has settled; ' + remaining.length + ' wave(s) have not started.');
  lines.push('');
  lines.push('SETTLED TASKS (terminal: never change, never redo, their evidence is kept):');
  const settledIds = Object.keys(settled);
  for (let i = 0; i < settledIds.length; i++) {
    const row = settled[settledIds[i]];
    lines.push('- ' + settledIds[i] + ' [' + row.status + '] ' + String(row.task && row.task.title ? row.task.title : ''));
  }
  if (settledIds.length === 0) lines.push('- none');
  lines.push('');
  lines.push('UNSTARTED TASKS (editable), by wave:');
  for (let w = 0; w < remaining.length; w++) {
    const ids = [];
    for (let j = 0; j < remaining[w].length; j++) {
      const task = remaining[w][j];
      ids.push(task.id + ' "' + task.title + '"' + (task.dependsOn && task.dependsOn.length ? ' dependsOn ' + task.dependsOn.join(',') : ''));
    }
    lines.push('wave ' + (boundary + 2 + w) + ': ' + ids.join('; '));
  }
  lines.push('');
  lines.push('RULES:');
  lines.push('- Add a task with action "add" and an explicit id (task-N style, unique). Update an unstarted task with action "update" and the fields to replace. Remove an unstarted task with action "remove".');
  lines.push('- Every task field goes INSIDE "task": {"action":"add","task":{"id":"task-4","title":"...","objective":"...","expectedOutput":"...","acceptanceCriteria":["..."]}}. A body written beside "action" is lifted for you, but a task is only complete when it carries id, title, objective, expectedOutput and at least one acceptance criterion; one that does not is refused whole and the plan does not move.');
  lines.push('- Never name a settled task or a task that is currently running: those edits are refused and the plan stays as it is.');
  lines.push('- "dependsOn" names task ids exactly as printed in this prompt (task-2, task-3) or ids of settled tasks — never a title, a nickname or an id the plan does not have: an unknown id is refused and the plan stays as it is.');
  lines.push('- A dependency may point at a settled task or at a task in an earlier remaining wave, never at the same or a later wave.');
  lines.push('- Optional "order": one array of task ids per remaining wave, listing every unstarted task (including the ones you add) exactly once. Omit it to keep the current grouping and append additions as a new final wave.');
  lines.push('- If the queued demands need no plan change, answer {"action":"none","reason":"<why>"}. Do not spend edits on restating work that is already planned.');
  lines.push('- To stop the rest of the plan, remove the unstarted tasks that are no longer worth running and say why in "reason"; the tasks you leave in place still run. Settled work is never undone either way.');
  lines.push('');
  // A worked answer, not a description of one: the failing shape on a live machine
  // was a well-argued apply whose task body sat one level too high and carried no
  // expected output or criteria. An example is the one part of a prompt a boundary
  // child copies exactly.
  lines.push('EXAMPLE (the demand is "also report the difference between the two line counts", the plan is version 1, task-1 has settled, task-2 and task-3 have not started in waves 2 and 3):');
  lines.push('{"action":"apply","reason":"the demand needs both counts, so it runs after task-3","edits":[{"action":"add","task":{"id":"task-4","title":"Report the difference between the two line counts","objective":"Compute CHANGELOG lines minus README lines from the counts task-2 and task-3 recorded, and state it in the summary","expectedOutput":"One line with the subtraction and its result","acceptanceCriteria":["The difference equals task-3 lines minus task-2 lines"],"context":"Both counts are already recorded by task-2 and task-3","constraints":[],"writesPaths":[],"dependsOn":["task-3"]}}]}');
  lines.push('Every field above is inside "task", and "dependsOn" is the id this prompt printed — that is the whole shape.');
  lines.push('');
  // The engine records a structured result only when the child calls the tool: a
  // prompt that says "answer with the structured result only" asks the child for
  // something this runtime cannot collect, and the boundary then loses a merge it
  // had already decided on. So the closing line names the tool call.
  lines.push('SUBMIT: call the structured result tool exactly once with {"action":"none"|"apply","reason":"...","edits":[...],"order":[[...]]}. A plain-text reply is not a result: without that tool call nothing is recorded and this boundary changes nothing.');
  return lines.concat(captainSection()).join('\n');
}

// Resubmit prompt for a boundary that produced no structured result.
//
// Same rule as the worker's and the summary's resubmit: the same call asks once
// more, spending no retry budget and opening no new boundary. The child is new (the
// engine cannot resume a child session), so the original prompt is reprinted below
// and the note forbids re-planning the run from scratch — the decision, not the
// analysis, is what is missing.
function replanResubmitPrompt(prompt, boundary, label) {
  const lines = [
    label,
    'RESUBMISSION (same boundary call, no retry spent): your previous response produced no structured result, so nothing was recorded and the plan is exactly as it was.',
    'Do not re-plan the run from scratch and do not widen the demands: read the queue this boundary names (once), decide, and submit the decision through the structured result tool exactly once. The shape is {"action":"none"|"apply","reason":"...","edits":[...],"order":[[...]]}, with every task field inside "task".',
    'A plain-text reply is not a result: without that tool call this boundary is recorded as refused and the plan does not move.'
  ];
  if (prompt) {
    lines.push('', 'ORIGINAL PROMPT (same rules apply):');
    lines.push(prompt);
  }
  return lines.join('\n');
}

// One boundary. Returns a merge outcome (never throws): a failed or refused replan
// leaves the plan exactly as it was and the run keeps going.
//
// settledRows maps a task id to its settlement row (task, status, attempts…),
// never to a bare status: the prompt prints the row's verdict and its task title.
async function requestReplan(boundary, remaining, settledRows, version) {
  if (replanChannel === null) return null;
  if (boundary >= REPLAN_MAX_BOUNDARIES) return null;
  // The opening plan is call 1, so the first boundary is call 2. One string feeds
  // both the prompt's first line and the label option the script hands agent().
  const label = plannerCallLabel(boundary + 2);
  const prompt = replanPrompt(boundary, remaining, settledRows, version, label);
  const ask = function (text) {
    return callRole('planner', text, {
      schema: REPLAN_SCHEMA,
      label: label,
      phase: replanBoundaryPhase(boundary),
      attempt: 0
    });
  };
  let answer = null;
  try {
    const result = await ask(prompt);
    if (result.ok) answer = normalizeReplanAnswer(result.value);
    else if (result.failure && result.failure.class === 'format-error' && !result.failure.setup) {
      // Form gap, not a dead route (the same corridor the worker and the summary
      // use): one resubmit in this same boundary call, no retry budget spent. A
      // child that prose-answered already has the decision; only the tool call is
      // missing. If this one fails too, the merge is refused as it always was.
      log('replan returned no structured result; resubmitting in the same boundary call');
      const resubmit = await ask(replanResubmitPrompt(prompt, boundary, label));
      if (resubmit.ok) {
        answer = normalizeReplanAnswer(resubmit.value);
        if (answer.ok) log('replan resubmitted a structured answer in the same boundary call');
      } else {
        answer = { ok: false, reason: 'replan call failed on every route: [' + resubmit.failure.class + '] ' + resubmit.failure.reason };
      }
    } else {
      answer = { ok: false, reason: 'replan call failed on every route: [' + result.failure.class + '] ' + result.failure.reason };
    }
  } catch (error) {
    answer = { ok: false, reason: 'replan call could not run: ' + safeError(error) };
  }
  if (!answer.ok) return { ok: false, version: version, reason: answer.reason };
  if (answer.none) return { ok: false, version: version, reason: answer.reason || '', none: true };
  // The merge reads a status per settled id (its own contract, unchanged), so the
  // verdicts are derived from the rows the prompt already read.
  const settledStatuses = {};
  for (const id in settledRows) {
    if (Object.prototype.hasOwnProperty.call(settledRows, id)) settledStatuses[id] = settledRows[id].status;
  }
  return mergeReplan(
    { version: version, settled: settledStatuses, inFlight: [], waves: remaining, wavesUsed: boundary + 1, maxTasks: maxTasks, waveLimit: WAVE_LIMIT },
    { version: version + 1, edits: answer.edits, order: answer.order, reason: answer.reason }
  );
}

`;
}
