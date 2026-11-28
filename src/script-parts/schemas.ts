export function guestSchemas(): string {
  return String.raw`// One plan task as the planner may write it. dependsOn is the only addition the
// DAG needs (X3: keep the schema minimal, validate in the script). The same object
// is reused inside waves, so a task is described once, not twice.
const PLAN_TASK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    objective: { type: 'string' },
    expectedOutput: { type: 'string' },
    acceptanceCriteria: { type: 'array', items: { type: 'string' } },
    context: { type: 'string' },
    constraints: { type: 'array', items: { type: 'string' } },
    writesPaths: { type: 'array', items: { type: 'string' } },
    dependsOn: { type: 'array', items: { type: 'string' } }
  },
  required: ['id', 'title', 'objective', 'expectedOutput', 'acceptanceCriteria', 'context', 'constraints']
};

// Two accepted shapes: a flat tasks list (one wave, levelled from dependsOn if
// any task declares dependencies) and an explicit waves list of task lists.
const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    tasks: { type: 'array', items: PLAN_TASK_SCHEMA },
    waves: { type: 'array', items: { type: 'array', items: PLAN_TASK_SCHEMA } },
    // The captain's continue/stop decision (round-071). Optional, and every value
    // other than 'stop' reads as 'continue', so a planner that never sets it keeps
    // the pre-round-071 behaviour and an unusable value is not a plan rejection.
    onFailure: { type: 'string', enum: ['continue', 'stop'] }
  },
  required: []
};

const EXECUTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    status: { type: 'string', enum: ['completed', 'partial', 'failed'] },
    deliverables: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { description: { type: 'string' }, locator: { type: 'string' } },
        required: ['description', 'locator']
      }
    },
    evidence: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { claim: { type: 'string' }, source: { type: 'string' } },
        required: ['claim', 'source']
      }
    },
    testsRun: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          command: { type: 'string' },
          status: { type: 'string', enum: ['passed', 'failed', 'not_run'] },
          detail: { type: 'string' }
        },
        required: ['command', 'status', 'detail']
      }
    },
    filesChanged: { type: 'array', items: { type: 'string' } },
    uncertainties: { type: 'array', items: { type: 'string' } }
  },
  required: ['summary', 'status', 'deliverables', 'evidence', 'testsRun', 'filesChanged', 'uncertainties']
};

const VERIFICATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          criterion: { type: 'string' },
          met: { type: 'boolean' },
          // Soft limits, surfaced to the model as field documentation: a long
          // quoted block is the usual cause of unescaped quotes in the JSON.
          evidence: { type: 'string', description: 'Soft limit: 800 characters. Use 「」 or single quotes instead of the ASCII double quote.' }
        },
        required: ['criterion', 'met', 'evidence']
      }
    },
    checkedEvidence: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string' },
          locator: { type: 'string' },
          finding: { type: 'string', description: 'Soft limit: 800 characters. Use 「」 or single quotes instead of the ASCII double quote.' }
        },
        required: ['kind', 'locator', 'finding']
      }
    },
    commandsRun: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          command: { type: 'string' },
          status: { type: 'string', enum: ['passed', 'failed', 'not_run'] },
          detail: { type: 'string' }
        },
        required: ['command', 'status', 'detail']
      }
    },
    issues: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] }
  },
  required: ['verdict', 'criteria', 'checkedEvidence', 'commandsRun', 'issues', 'confidence']
};

function normalizeExecution(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const summary = text(raw.summary, 8000);
  if (!summary) return null;
  const status = raw.status === 'completed' || raw.status === 'partial' || raw.status === 'failed' ? raw.status : 'partial';
  return {
    summary: summary,
    status: status,
    deliverables: objectList(raw.deliverables, function (item) {
      if (!item || typeof item !== 'object') return null;
      const description = text(item.description, 1000);
      const locator = text(item.locator, 2000);
      return description && locator ? { description: description, locator: locator } : null;
    }, 40),
    evidence: objectList(raw.evidence, function (item) {
      if (!item || typeof item !== 'object') return null;
      const claim = text(item.claim, 2000);
      const source = text(item.source, 2000);
      return claim && source ? { claim: claim, source: source } : null;
    }, 60),
    testsRun: objectList(raw.testsRun, function (item) {
      if (!item || typeof item !== 'object') return null;
      const command = text(item.command, 2000);
      if (!command) return null;
      const status = item.status === 'passed' || item.status === 'failed' ? item.status : 'not_run';
      return { command: command, status: status, detail: text(item.detail, 3000) };
    }, 40),
    filesChanged: textList(raw.filesChanged, 100, 2000),
    uncertainties: textList(raw.uncertainties, 40, 2000)
  };
}

function normalizeVerification(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.verdict !== 'pass' && raw.verdict !== 'fail') return null;
  if (!Array.isArray(raw.criteria)) return null;
  const criteria = objectList(raw.criteria, function (item) {
    if (!item || typeof item !== 'object') return null;
    const criterion = boundedText(item.criterion, 1000);
    if (!criterion) return null;
    return { criterion: criterion, met: item.met === true, evidence: text(item.evidence, 4000) };
  }, 40);
  return {
    verdict: raw.verdict,
    criteria: criteria,
    checkedEvidence: objectList(raw.checkedEvidence, function (item) {
      if (!item || typeof item !== 'object') return null;
      const kind = text(item.kind, 100);
      const locator = text(item.locator, 2000);
      const finding = text(item.finding, 4000);
      return kind && locator && finding ? { kind: kind, locator: locator, finding: finding } : null;
    }, 60),
    commandsRun: objectList(raw.commandsRun, function (item) {
      if (!item || typeof item !== 'object') return null;
      const command = text(item.command, 2000);
      if (!command) return null;
      const status = item.status === 'passed' || item.status === 'failed' ? item.status : 'not_run';
      return { command: command, status: status, detail: text(item.detail, 3000) };
    }, 40),
    issues: textList(raw.issues, 40, 2000),
    confidence: raw.confidence === 'high' || raw.confidence === 'medium' ? raw.confidence : 'low'
  };
}

// Verification compares a verifier's criterion text against the task's own
// criterion text. A byte-exact comparison turns a formatting difference (a
// trailing period, collapsed spacing, a different case) into a failed attempt,
// so a correct result burns every retry and is finally reported as failed.
// The key removes exactly those formatting differences and nothing else: the
// requirement's words must still match, so distinct criteria stay distinct.
// Mirrored by criterionKey in src/input.ts (test/criterion.spec.ts asserts the
// parity); a task whose criteria collide after normalization is rejected in
// normalizeTask so every criterion stays addressable by exactly one entry.
function criterionKey(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[.\u3002\uFF0E,\uFF0C;\uFF1B:\uFF1A!\uFF01?\uFF1F]+$/, '')
    .trim();
}

function matchesCriterion(verification, criterion) {
  const key = criterionKey(criterion);
  return verification.criteria.filter(function (item) { return criterionKey(item.criterion) === key; });
}

// The decision belongs to the structured judgement: verdict, plus one criteria
// entry per acceptance criterion carrying met and evidence. issues is prose — the
// verifier's notes — and it used to override that judgement, so a verifier that
// said pass with every criterion met still failed the task for listing a caveat.
// Measured (t49: 8 of the 12 reports in the test home): every quality failure in
// that log was this branch, and the notes themselves say "non-blocking", "minor
// observation rather than a failure", "does not affect any acceptance criterion".
// The notes are not lost: a verified task copies them into the report's
// uncertainties.
function checkVerification(task, execution, verification) {
  if (!verification) return { passed: false, reason: 'verifier returned no valid structured result' };
  // A self-reported status is not a verification result, but it IS an admission.
  // Only a complete execution may be verified: when the executor says the work is
  // incomplete (partial) or failed, no verifier pass can turn that into a verified
  // task. Without this, a plan that rewrote the objective as "attempt X and report
  // honestly" could be verified while the requested end state never existed (t59:
  // a /proc write that failed was reported COMPLETED).
  if (!execution) {
    return { passed: false, reason: 'executor returned no execution result' };
  }
  if (execution.status !== 'completed') {
    return { passed: false, reason: 'executor reported ' + execution.status };
  }
  if (verification.verdict !== 'pass') return { passed: false, reason: 'verifier verdict was fail' };
  if (verification.checkedEvidence.length === 0) return { passed: false, reason: 'verifier supplied no checked evidence' };
  if (verification.criteria.length !== task.acceptanceCriteria.length) {
    return { passed: false, reason: 'verifier criteria count does not match the task acceptance criteria' };
  }
  const missing = [];
  for (let i = 0; i < task.acceptanceCriteria.length; i++) {
    const criterion = task.acceptanceCriteria[i];
    const matches = matchesCriterion(verification, criterion);
    if (matches.length !== 1) { missing.push('criterion not matched exactly once: ' + criterion); continue; }
    const item = matches[0];
    if (!item.met) missing.push('criterion not met: ' + criterion);
    else if (!item.evidence) missing.push('criterion has no evidence: ' + criterion);
  }
  if (missing.length > 0) return { passed: false, reason: missing.join('; ') };
  return { passed: true, reason: '' };
}

// A structured judgement — first call or same-attempt resubmit — still has to
// pass the content check above. Returns the attempt failure it deserves, or null
// when it passes, so both paths of a role share one rule.
function verificationFailure(task, execution, verification, role) {
  const check = checkVerification(task, execution, verification);
  if (check.passed) return null;
  const reason = redactPromptText(check.reason);
  return { role: role, class: 'verification-failed', reason: reason, switchModel: false, setup: false, category: 'quality' };
}

const SUMMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary'],
  properties: {
    summary: { type: 'string' }
  }
};

`;
}
