export function guestSynthesize(): string {
  return String.raw`function synthesizerPrompt(status, verifiedCount, total, confirmed, incomplete, uncertainties, review, draft) {
  const digest = [];
  digest.push('Status: ' + status);
  digest.push('Verified tasks: ' + verifiedCount + '/' + total);
  if (confirmed.length > 0) {
    digest.push('Confirmed evidence:');
    for (let index = 0; index < confirmed.length && index < 20; index++) {
      digest.push('- ' + confirmed[index].taskId + ': ' + confirmed[index].criterion + ' — ' + confirmed[index].evidence);
    }
  }
  if (incomplete.length > 0) {
    digest.push('Incomplete:');
    for (let index = 0; index < incomplete.length && index < 20; index++) {
      digest.push('- ' + incomplete[index].taskId + ': ' + incomplete[index].reason);
    }
  }
  if (uncertainties.length > 0) {
    digest.push('Uncertainties:');
    for (let index = 0; index < uncertainties.length && index < 20; index++) {
      digest.push('- ' + uncertainties[index].taskId + ': ' + uncertainties[index].text);
    }
  }
  const parts = [
    // The row's name is the draft's number: the gate may write more than one.
    synthesisDraftLabel(draft),
    'You write the final answer narrative for a completed workflow run.',
    'Use ONLY the data below. Do not add facts, files, or results that are not listed.',
    'If something is incomplete or uncertain, say so plainly; never claim it succeeded.',
    'Write plain prose in at most three sections — 结果 / 怎么用 / 注意 (Result / How to use / Caveats) — and put every open item from DATA in your own words in the caveat section.',
    'When prior rounds are listed, the answer may say what this run adds to them; never present an earlier round\'s result as this run\'s work.',
    'Report your narrative by calling the structured result tool exactly once with {"summary": "<your narrative>"} — a plain text reply without the tool call is not recorded.'
  ].concat(carryoverSection());
  if (review) {
    parts.push('');
    parts.push('Your previous draft failed the summary review and must be rewritten: ' + summaryReviewFinding(review));
    parts.push('Previous draft (do not repeat the flagged problem):');
    parts.push(safePromptJson(clip(review.draft, SYNTHESIS_SUMMARY_CHARS)));
  }
  parts.push('', 'DATA:', safePromptJson(digest.join('\n')).slice(0, 6000), '', synthesizerHardRules());
  return parts.join('\n');
}

function normalizeSummary(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const summary = boundedText(raw.summary, 4000);
  if (!summary) return null;
  return { summary: summary };
}

function synthesizerHardRules() {
  if (NAMING_LANGUAGE === 'en') {
    return [
      'HARD RULES (override any earlier instruction):',
      '1. Open with the result the user asked for, in your own words; never open with a status line, counts, or a ledger label (no "completed", "N/M", "verified", "Report notes", "Diagnostics", "Model routes", "Deadline").',
      '2. Structure is allowed, but only this shape: at most three sections, each heading on its own line — "Result:", "How to use:", "Caveats:". No other headings, no bullet lists, no markdown, no numbered lists.',
      '3. Never copy machine tokens: station numbers, coordinates, paths, commands, the word "summary", provider/model/route names, "Model routes", "Deadline", or verified-count phrases like "N/M verified". Paraphrase in words instead.',
      '4. For evidence, paraphrase each agreed result in one sentence of your own words; never quote a criterion or evidence string verbatim and never paste code or shell output.',
      '5. The caveats in DATA are yours to rewrite: say every open item in your own words under the caveat section, one sentence each. Never paste a DATA sentence verbatim, and never drop or deny an open item.',
      '6. Write in one language only, as continuous prose: no bilingual repetition, at most 300 words. State anything incomplete in one honest sentence.'
    ].join('\n');
  }
  return [
    '硬性规则（覆盖之前的一切指示）：',
    '1. 开头就是用户要的结果，用你自己的话写；禁止以状态行（做完了、N/M 项、verified）、计数或台账标签（报告附注、诊断、模型路由、时限）开头。',
    '2. 允许分节，但只允许这一种形状：最多三段，标题各占一行——「结果：」「怎么用：」「注意：」。不得使用别的标题、不得用列表、不得用 Markdown、不得编号。',
    '3. 禁止抄写机器 token：站号、坐标、路径、命令、“摘要”、provider/model/route 名、“Model routes”、“Deadline”、核验通过 N 项等；如需表达请用文字转述，不得原文照抄。',
    '4. 证据只转述结论（一项一句，用自己的话）；禁止逐字引用 criterion/evidence 原文，禁止粘贴代码或 shell 输出。',
    '5. 待确认事项由你重写：把 DATA 里每一条未决事项用自己的话写进「注意」段，一条一句；禁止照抄 DATA 原句，也不得省略或否认任何一条。',
    '6. 只写一种语言、纯散文，总计不超过 700 字；未完成的部分用一句话如实说明。'
  ].join('\n');
}

function polishVerbatimSources(confirmed, results) {
  const out = [];
  function addLong(value) {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (trimmed.length >= 64) out.push(trimmed);
  }
  function addLocator(value) {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (trimmed !== '') out.push(trimmed);
  }
  if (Array.isArray(confirmed)) {
    for (let i = 0; i < confirmed.length; i++) {
      const item = confirmed[i];
      if (!item || typeof item !== 'object') continue;
      addLong(item.criterion);
      addLong(item.evidence);
    }
  }
  if (Array.isArray(results)) {
    for (let i = 0; i < results.length; i++) {
      const record = results[i];
      if (!record || !Array.isArray(record.attempts) || record.attempts.length === 0) continue;
      const last = record.attempts[record.attempts.length - 1];
      if (!last || typeof last !== 'object') continue;
      if (last.execution && typeof last.execution === 'object') {
        if (Array.isArray(last.execution.deliverables)) {
          for (let c = 0; c < last.execution.deliverables.length; c++) {
            const entry = last.execution.deliverables[c];
            if (entry && typeof entry === 'object') addLocator(entry.locator);
          }
        }
        if (Array.isArray(last.execution.evidence)) {
          for (let c = 0; c < last.execution.evidence.length; c++) {
            const entry = last.execution.evidence[c];
            if (entry && typeof entry === 'object') addLocator(entry.source);
          }
        }
        if (Array.isArray(last.execution.filesChanged)) {
          for (let c = 0; c < last.execution.filesChanged.length; c++) addLocator(last.execution.filesChanged[c]);
        }
      }
      if (last.verification && typeof last.verification === 'object' && Array.isArray(last.verification.checkedEvidence)) {
        for (let c = 0; c < last.verification.checkedEvidence.length; c++) {
          const entry = last.verification.checkedEvidence[c];
          if (entry && typeof entry === 'object') addLocator(entry.locator);
        }
      }
    }
  }
  return out;
}

function polishStyleVerdict(text, facts) {
  const value = typeof text === 'string' ? text.trim() : '';
  if (value === '') return { ok: false, reason: 'the polish is empty' };
  const sources = facts && Array.isArray(facts.sources) ? facts.sources : [];
  const lines = value.split('\n');
  const firstLine = lines.length > 0 ? lines[0].trim() : '';
  const sentenceEnd = value.search(/[。！？!\n]/);
  const firstSentence = (sentenceEnd === -1 ? value : value.slice(0, sentenceEnd + 1)).trim();
  const head = (firstSentence || firstLine).trim();
  const headLow = head.toLowerCase();
  const badStartsEn = ['status', 'overall status', 'verified tasks', 'report notes', 'diagnostics', 'model routes', 'deadline', 'completed', 'partially', 'partial', 'not passed', 'verified', 'confirmed', 'incomplete', 'commands and tests', 'open questions', 'planning note', 'still incomplete'];
  for (let i = 0; i < badStartsEn.length; i++) {
    const prefix = badStartsEn[i];
    if (headLow.indexOf(prefix) === 0) return { ok: false, reason: 'the polish opens with a status line or ledger label' };
  }
  const badStartsZh = ['总体状态', '状态', '已完成', '部分完成', '未通过', '做完了', '报告附注', '诊断', '模型路由', '时限', '已确认', '未完成', '仍未完成', '待确认', '命令与测试', '规划说明', '核验通过', '尚无'];
  for (let i = 0; i < badStartsZh.length; i++) {
    if (head.indexOf(badStartsZh[i]) === 0) return { ok: false, reason: 'the polish opens with a status line or ledger label' };
  }
  if (/^\d+\s*\/\s*\d+/.test(head)) return { ok: false, reason: 'the polish opens with a count' };
  if (/^(completed|verified)\b/i.test(head)) return { ok: false, reason: 'the polish opens with a status line or ledger label' };
  const low = value.toLowerCase();
  if (low.indexOf('model routes') !== -1) return { ok: false, reason: 'the polish copies a machine token ("Model routes")' };
  if (low.indexOf('deadline') !== -1) return { ok: false, reason: 'the polish copies a machine token ("Deadline")' };
  if (/\bsummary\b/i.test(value) || value.indexOf('摘要') !== -1) return { ok: false, reason: 'the polish copies a machine token ("summary")' };
  if (/\b(provider|grok|gpt|claude|gemini|deepseek|openai|anthropic|qwen|llama)\b/i.test(value)) return { ok: false, reason: 'the polish copies a machine token (provider/model name)' };
  if (/file:\/\//i.test(value)) return { ok: false, reason: 'the polish copies a machine token (path)' };
  if (/(^|[^\w])(\/[\w.\-]+)+/.test(value)) return { ok: false, reason: 'the polish copies a machine token (path)' };
  if (/\b[\w.\-]+\.(ts|js|py|sh|json|md|txt|bin|yaml|yml|toml|lock)\b/i.test(value)) return { ok: false, reason: 'the polish copies a machine token (path)' };
  if (/\bsrc\/[\w.\-]+/i.test(value) || /\btmp\/[\w.\-]+/i.test(value) || /\bout\/[\w.\-]+/i.test(value)) return { ok: false, reason: 'the polish copies a machine token (path)' };
  if (/-?\d{1,3}\.\d+\s*[,，]\s*-?\d{1,3}\.\d+/.test(value)) return { ok: false, reason: 'the polish copies a machine token (coordinates)' };
  if (/站\s*\d+|station\s*(number|no\.?)?\s*\d+/i.test(value)) return { ok: false, reason: 'the polish copies a machine token (station number)' };
  if (/\d+\s*\/\s*\d+/.test(value) || /n\/m/i.test(value)) return { ok: false, reason: 'the polish copies a machine token (verified count)' };
  if (/\d+\s*项.*(核验|通过|完成)/.test(value) || /(核验通过|通过).*\d+\s*项/.test(value)) return { ok: false, reason: 'the polish copies a machine token (verified count)' };
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    if (typeof source !== 'string' || source.trim() === '') continue;
    if (value.indexOf(source) !== -1 || low.indexOf(source.toLowerCase()) !== -1) {
      return { ok: false, reason: 'the polish quotes the verified report verbatim instead of paraphrasing' };
    }
  }
  const tick = String.fromCharCode(96);
  if (value.indexOf(tick) !== -1) return { ok: false, reason: 'the polish pastes code or a quoted path (backticks are not plain prose)' };
  if (/\bstat\s+-c\b/i.test(value) || /\bsha256\b/i.test(value)) return { ok: false, reason: 'the polish pastes code or shell output' };
  if (/^\s*[$#>]\s+\w/m.test(value)) return { ok: false, reason: 'the polish pastes shell output' };
  if (/\bnpm\s+(test|run|install|exec)\b/i.test(value) || /\bnode\s+[\w.\-]+\.(js|ts)\b/i.test(value)) return { ok: false, reason: 'the polish copies a command instead of paraphrasing' };
  const hasCjk = /[一-鿿]/.test(value);
  const hasEnPhrase = /[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(value);
  if (hasCjk && hasEnPhrase) return { ok: false, reason: 'the polish repeats the same sentence in Chinese and English' };
  if (/^\s*#{1,6}\s/m.test(value)) return { ok: false, reason: 'the polish uses a markdown heading instead of plain prose' };
  if (/^\s*[-*]\s+\S/m.test(value)) return { ok: false, reason: 'the polish uses a list instead of plain prose' };
  if (/^\s*\d+[.)]\s+\S/m.test(value)) return { ok: false, reason: 'the polish uses a list instead of plain prose' };
  // The bound is the answer's, not a telegraph's (round-075): 200 characters was
  // the reason the summary read as a status line — 结果/怎么用/注意 do not fit in it,
  // and the delivery lead is sized to the same window. The ceiling still exists so
  // one narrative cannot take the whole delivery.
  if (hasCjk) {
    if (value.replace(/\s+/g, '').length > SYNTHESIS_NARRATIVE_CHARS) return { ok: false, reason: 'the polish is over ' + SYNTHESIS_NARRATIVE_CHARS + ' characters' };
  } else {
    if (value.split(/\s+/).length > SYNTHESIS_NARRATIVE_WORDS) return { ok: false, reason: 'the polish is over ' + SYNTHESIS_NARRATIVE_WORDS + ' words' };
  }
  return { ok: true, reason: '' };
}

// ------------------------------------------------------------ layered mode --
// Section IV: the synthesizer may produce natural language, but the default is
// deterministic and there is no guaranteed model answer. The layered policy is
// the shape that makes that honest end to end:
//
//   layer 1  verified report — the aggregation above is the only source of fact;
//   layer 2  constrained polish — one synthesizer call rewrites the narrative,
//            but its text is checked against the report before use and it can
//            never touch anything except the synthesis.summary field;
//   layer 3  deterministic fallback — the narrative built here from the same
//            data is the answer whenever the model path is unavailable, fails
//            the guardrail, or is not configured at all.
//
// Truthfulness invariants: executor claims, verifier judgments and confirmed
// evidence are labeled apart in both the digest and the fallback text, so the
// final answer never reads a self-report as a verified fact, and an unrun test
// is rendered as unrun — never as passed.

/** Bound a string to a maximum length without cutting a surrogate pair in half. */
function clip(value, max) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (raw.length <= max) return raw;
  let cut = max - 1;
  const code = raw.charCodeAt(cut - 1);
  if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
  return raw.slice(0, cut) + '…';
}

/**
 * The gate's last reason, flattened into the one line the review marker can carry.
 *
 * A control character would split (or corrupt) a field the host parses back off the
 * marker, and an unbounded reason would let a provider's own diagnostic rewrite the
 * whole ledger line, so the text is folded to a single bounded line here — once, where
 * the marker is written, instead of in every reader.
 */
function summaryReviewReason(value) {
  const raw = typeof value === 'string' ? value : '';
  const flat = raw.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();
  return clip(flat, SUMMARY_REVIEW_REASON_CHARS);
}

function synthesisStatusWord(status) {
  if (NAMING_LANGUAGE === 'en') {
    return status === 'completed' ? 'completed' : status === 'partial' ? 'partially complete' : 'not passed';
  }
  return status === 'completed' ? '已完成' : status === 'partial' ? '部分完成' : '未通过';
}

/**
 * Per-task material for the layered digest, walkable once.
 *
 * The last attempt is the one the report itself would publish, so the digest
 * cannot disagree with the report about what the last attempt produced.
 */
function layeredDigestData(results) {
  const judgments = [];
  const claims = [];
  const checkedTests = [];
  const claimedTests = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const last = result.attempts.length > 0 ? result.attempts[result.attempts.length - 1] : null;
    const tag = 'task ' + result.task.id;
    if (last && last.verification) {
      const unmet = [];
      for (let c = 0; c < last.verification.criteria.length; c++) {
        if (!last.verification.criteria[c].met) unmet.push(clip(last.verification.criteria[c].criterion, 160));
      }
      judgments.push(
        '- [' + tag + (result.status === 'verified' ? '' : ' (task ' + result.status + ')') + '] verifier verdict ' +
        last.verification.verdict + ', confidence ' + last.verification.confidence +
        (unmet.length > 0 ? '; unmet: ' + unmet.join('; ') : '')
      );
      for (let c = 0; c < last.verification.commandsRun.length; c++) {
        checkedTests.push('- [' + tag + '] ' + clip(last.verification.commandsRun[c].command, 140) + ' -> ' + last.verification.commandsRun[c].status);
      }
    } else {
      judgments.push('- [' + tag + (result.status === 'verified' ? '' : ' (task ' + result.status + ')') + '] no verification record');
    }
    if (last && last.execution) {
      claims.push('- [' + tag + '] ' + clip(last.execution.summary, 360));
      for (let c = 0; c < last.execution.testsRun.length; c++) {
        claimedTests.push('- [' + tag + '] ' + clip(last.execution.testsRun[c].command, 140) + ' -> ' + last.execution.testsRun[c].status);
      }
    }
  }
  return { judgments: judgments, claims: claims, checkedTests: checkedTests, claimedTests: claimedTests };
}

function pushBounded(list, target, maxItems) {
  for (let i = 0; i < list.length && target.length < maxItems; i++) target.push(list[i]);
}

/**
 * Build the polish digest from the verified aggregation only.
 *
 * Section labels are stable English tokens (the polish prompt decides the answer
 * language), and every section says what its entries are worth: confirmed
 * evidence was checked by verifiers, verifier judgments are this run's checks,
 * executor claims are self-reports. Nothing else exists as fact.
 */
function layeredDigest(status, verifiedCount, total, confirmed, incomplete, uncertainties, results, planErrorText) {
  const data = layeredDigestData(results);
  const lines = [];
  lines.push('Run status: ' + status + ' (' + synthesisStatusWord(status) + '). Verified tasks: ' + verifiedCount + '/' + total + '.');
  if (confirmed.length > 0) {
    lines.push('CONFIRMED EVIDENCE (checked by independent verifiers):');
    for (let i = 0; i < confirmed.length && i < 16; i++) {
      lines.push('- [task ' + confirmed[i].taskId + '] ' + clip(confirmed[i].criterion, 200) + ' -> ' + clip(confirmed[i].evidence, 260));
    }
  }
  if (data.judgments.length > 0) {
    lines.push('VERIFIER JUDGMENTS (this run\'s independent checks):');
    pushBounded(data.judgments, lines, 16);
  }
  if (data.claims.length > 0) {
    lines.push('EXECUTOR CLAIMS (self-reported, not independently verified):');
    pushBounded(data.claims, lines, 16);
  }
  if (data.checkedTests.length > 0 || data.claimedTests.length > 0) {
    lines.push('TESTS AND COMMANDS (status verbatim from the report; an entry marked not_run never passed):');
    pushBounded(data.checkedTests, lines, 16);
    pushBounded(data.claimedTests, lines, 16);
  }
  if (incomplete.length > 0) {
    lines.push('INCOMPLETE (not verified; must stay in the answer):');
    for (let i = 0; i < incomplete.length && i < 16; i++) {
      lines.push('- [task ' + incomplete[i].taskId + '] ' + clip(incomplete[i].reason, 280) + ' (' + incomplete[i].category + ')');
    }
  }
  if (uncertainties.length > 0) {
    lines.push('UNCERTAINTIES (must stay visible in the answer):');
    for (let i = 0; i < uncertainties.length && i < 16; i++) {
      lines.push('- [task ' + uncertainties[i].taskId + '] ' + clip(uncertainties[i].text, 240));
    }
  }
  if (planErrorText) lines.push('PLANNING NOTE (the plan degraded, so the run cannot be fully clean): ' + clip(planErrorText, 240));
  return clip(lines.join('\n'), SYNTHESIS_DIGEST_CHARS);
}

/**
 * Citable-fact corpus for the guardrail: the digest plus every locator-shaped
 * string the report itself carries, lowercased. A polished text may cite any of
 * these verbatim and nothing else, so an invented path or command cannot slip
 * through as prose.
 */
function layeredCitationCorpus(digest, results) {
  const parts = [digest];
  for (let i = 0; i < results.length; i++) {
    const last = results[i].attempts.length > 0 ? results[i].attempts[results[i].attempts.length - 1] : null;
    if (last && last.execution) {
      for (let c = 0; c < last.execution.deliverables.length; c++) parts.push(last.execution.deliverables[c].locator);
      for (let c = 0; c < last.execution.evidence.length; c++) parts.push(last.execution.evidence[c].source);
      for (let c = 0; c < last.execution.filesChanged.length; c++) parts.push(last.execution.filesChanged[c]);
    }
    if (last && last.verification) {
      for (let c = 0; c < last.verification.checkedEvidence.length; c++) parts.push(last.verification.checkedEvidence[c].locator);
    }
  }
  return parts.join('\n').toLowerCase();
}

/** Command/test counts split by who ran them, so status words stay verbatim. */
function layeredTestCounts(results) {
  const counts = { checked: { passed: 0, failed: 0, not_run: 0 }, claimed: { passed: 0, failed: 0, not_run: 0 } };
  for (let i = 0; i < results.length; i++) {
    const last = results[i].attempts.length > 0 ? results[i].attempts[results[i].attempts.length - 1] : null;
    if (last && last.verification) {
      for (let c = 0; c < last.verification.commandsRun.length; c++) {
        const status = last.verification.commandsRun[c].status;
        if (status === 'passed' || status === 'failed' || status === 'not_run') counts.checked[status] += 1;
      }
    }
    if (last && last.execution) {
      for (let c = 0; c < last.execution.testsRun.length; c++) {
        const status = last.execution.testsRun[c].status;
        if (status === 'passed' || status === 'failed' || status === 'not_run') counts.claimed[status] += 1;
      }
    }
  }
  return counts;
}

function layeredTestsLine(counts) {
  if (NAMING_LANGUAGE === 'en') {
    return 'Commands and tests — verified by checkers: ' + counts.checked.passed + ' passed, ' + counts.checked.failed +
      ' failed, ' + counts.checked.not_run + ' not run; executor-reported: ' + counts.claimed.passed + ' passed, ' +
      counts.claimed.failed + ' failed, ' + counts.claimed.not_run + ' not run.';
  }
  return '命令与测试——检查者核验：通过 ' + counts.checked.passed + '、失败 ' + counts.checked.failed +
    '、未运行 ' + counts.checked.not_run + '；执行者自报：通过 ' + counts.claimed.passed +
    '、失败 ' + counts.claimed.failed + '、未运行 ' + counts.claimed.not_run + '。';
}

/**
 * The deterministic natural-language summary (layer 3).
 *
 * Pure function of the verified aggregation: the same report always yields the
 * same text, a failed run says it is not passed, and a test that did not run is
 * counted as not run — never as passed.
 */
function layeredFallbackSummary(data) {
  const en = NAMING_LANGUAGE === 'en';
  const lines = [];
  const verifiedPhrase = en
    ? (data.verified > 0
      ? data.verified + '/' + data.total + ' task(s) verified by independent checkers'
      : 'no task has been verified by an independent checker')
    : (data.verified > 0
      ? data.verified + '/' + data.total + ' 项任务已由独立检查核验'
      : '尚无任务通过独立核验');
  lines.push((en ? 'Overall status: ' + synthesisStatusWord(data.status) + '; ' : '总体状态：' + synthesisStatusWord(data.status) + '；') + verifiedPhrase + (en ? '.' : '。'));
  if (data.confirmed.length > 0) {
    lines.push(en ? 'Confirmed (independent verification):' : '已确认（独立核验）：');
    for (let i = 0; i < data.confirmed.length && i < 12; i++) {
      lines.push(en
        ? '- task ' + data.confirmed[i].taskId + ': one planned result was independently confirmed.'
        : '- 任务 ' + data.confirmed[i].taskId + '：有一项计划结果已由独立检查确认。');
    }
  }
  if (data.incomplete.length > 0) {
    lines.push(en ? 'Incomplete (not verified):' : '未完成（未通过核验）：');
    for (let i = 0; i < data.incomplete.length && i < 12; i++) {
      lines.push(en
        ? '- task ' + data.incomplete[i].taskId + ': ' + clip(data.incomplete[i].reason, 240)
        : '- 任务 ' + data.incomplete[i].taskId + '：' + clip(data.incomplete[i].reason, 240));
    }
  }
  if (data.counts.checked.passed + data.counts.checked.failed + data.counts.checked.not_run +
    data.counts.claimed.passed + data.counts.claimed.failed + data.counts.claimed.not_run > 0) {
    lines.push(layeredTestsLine(data.counts));
  }
  if (data.uncertainties.length > 0) {
    lines.push(en ? 'Open questions:' : '待确认：');
    for (let i = 0; i < data.uncertainties.length && i < 8; i++) {
      lines.push(en
        ? '- task ' + data.uncertainties[i].taskId + ': ' + clip(data.uncertainties[i].text, 200)
        : '- 任务 ' + data.uncertainties[i].taskId + '：' + clip(data.uncertainties[i].text, 200));
    }
  }
  if (data.planError) lines.push((en ? 'Planning note: ' : '规划说明：') + clip(data.planError, 200));
  return clip(lines.join('\n'), SYNTHESIS_SUMMARY_CHARS);
}

/**
 * The report-notes appendix that rides on a polished answer (layer 2 guard).
 *
 * A polish that stays inside the guardrails can still be quiet about what the
 * report treats as open; these lines are appended from the report data, so the
 * final answer cannot hide an incomplete item or a test count.
 *
 * The *uncertainties* are deliberately not in this block any more (round-075): an
 * appendix that re-prints them verbatim made the synthesizer's own 注意 section
 * redundant — the reader got the report's sentences pasted under the narrative,
 * twice, in the machine's words. They are rewritten by the synthesizer instead,
 * and the gate enforces the section that carries them ({@link hasCaveatSection}),
 * so the caveat survives as prose rather than as a copy.
 */
function layeredNotesBlock(data) {
  const en = NAMING_LANGUAGE === 'en';
  const lines = [];
  if (data.incomplete.length > 0) {
    lines.push(en ? 'Still incomplete (from the report):' : '仍未完成（来自报告）：');
    for (let i = 0; i < data.incomplete.length && i < 8; i++) {
      lines.push(en
        ? '- task ' + data.incomplete[i].taskId + ': ' + clip(data.incomplete[i].reason, 160)
        : '- 任务 ' + data.incomplete[i].taskId + '：' + clip(data.incomplete[i].reason, 160));
    }
  }
  if (data.counts.checked.passed + data.counts.checked.failed + data.counts.checked.not_run +
    data.counts.claimed.passed + data.counts.claimed.failed + data.counts.claimed.not_run > 0) {
    lines.push(layeredTestsLine(data.counts));
  }
  if (lines.length === 0) return '';
  return (en ? 'Report notes (facts from the report, not rewritten):' : '报告附注（以下为报告事实，摘要不改写）：') + '\n' + lines.join('\n');
}

/** Compose a polished narrative with the non-negotiable notes, within the bound. */
function withReportNotes(polish, data) {
  const notes = layeredNotesBlock(data);
  if (notes === '') return clip(polish, SYNTHESIS_SUMMARY_CHARS);
  const budget = Math.max(0, SYNTHESIS_SUMMARY_CHARS - notes.length - 2);
  return clip(clip(polish, budget) + '\n\n' + notes, SYNTHESIS_SUMMARY_CHARS);
}

/**
 * Append one provenance line to a finished narrative (opt-in diagnostics).
 *
 * showDiagnostics true is the caller asking for the machine view, and the one
 * machine fact the prose cannot carry is where the prose came from: the
 * synthesizer's polish or the deterministic fallback, and why a polish was
 * dropped. The line is paid for out of the narrative's own budget, so turning
 * diagnostics on can never push the answer past the clamp every other path obeys.
 */
function withProvenance(summary, note) {
  const budget = Math.max(0, SYNTHESIS_SUMMARY_CHARS - note.length - 1);
  return clip(clip(summary, budget) + '\n' + note, SYNTHESIS_SUMMARY_CHARS);
}

/**
 * The provenance line for one finished narrative (zh/en follow the run's naming).
 *
 * @param source - "polish" when the synthesizer's text passed the summary gate.
 * @param error - the recorded reason the polish was not used, when there is one.
 */
function provenanceLine(source, error) {
  const en = NAMING_LANGUAGE === 'en';
  if (source === 'polish') {
    return en
      ? 'Diagnostics: this narrative is the synthesizer draft, accepted by the summary check and the independent verification.'
      : '诊断：本段结语来自模型草稿，已通过汇总检查与独立复核。';
  }
  if (source === 'model') {
    return en
      ? 'Diagnostics: this narrative was written directly by the synthesizer (synthesis "model") and passed the summary gate.'
      : '诊断：本段结语由 synthesizer 直接生成（synthesis 为 model），已通过汇总审查。';
  }
  const why = error === ''
    ? (en ? 'no synthesizer chain is configured.' : '未配置 synthesizer 链路。')
    : clip(error, 240);
  return en
    ? 'Diagnostics: this narrative is the deterministic fallback (' + why + '); it passed the same summary gate'
    : '诊断：本段结语来自确定性回退（' + why + '），同样通过了汇总审查';
}

// ------------------------------------------------------------ summary gate --
// The summarizer is a three-step pipeline, never a single writing pass:
//
//   1. draft   — the model writes v1 when a synthesizer chain is configured;
//                otherwise the deterministic builder writes it from the report;
//   2. check   — a deterministic checker validates the composed candidate
//                against the report: verdict, claims, citations, and the open
//                items the report itself lists (an omission is a failure);
//   3. verify  — an independent pass re-walks the raw task results with its own
//                walker, recomputes the settled facts and re-runs the checks. It
//                never reuses the checker's verdict, so a checker bug cannot
//                become a shipped claim.
//
// A failed check or verify sends the draft back to the writer with the finding;
// rewrites are bounded by SUMMARY_MAX_ATTEMPTS. Only a draft that passes both
// steps is delivered. When no draft passes, the deterministic narrative — which
// is itself gated — is the answer, and synthesis.error says why. Both review
// steps are deterministic by design: they cannot be argued into a pass, they add
// no child-call budget, and a run with no model still ships a checked summary.

/** Collapse whitespace and case so presence checks work in both shipped languages. */
function summaryProbe(value) {
  return String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Does the candidate name this task id at all ("task a" / "任务 a")? */
function summaryNamesTask(text, id) {
  const probe = summaryProbe(text);
  const key = summaryProbe(id);
  if (key === '') return true;
  return probe.indexOf('task ' + key) !== -1 || probe.indexOf('任务 ' + key) !== -1;
}

/**
 * Section labels a narrative may use for its caveats, per shipped language.
 *
 * The synthesizer rewrites the report's uncertainties now, so the gate cannot look
 * for the report's own sentences. What it can require is the *section* that carries
 * them: a narrative with open items and no caveat section has dropped them, and
 * that is the failure worth catching. The deterministic fallback's own heading
 * (待确认 / Open questions) is accepted too, so the same gate still covers it.
 */
const CAVEAT_SECTION = /(?:^|\n)[ \t]*(?:[【\[(]?[ \t]*(?:注意(?:事项)?|需要你知道的?|待确认|caveats?|things to know|open questions|worth knowing)[ \t]*[】\])]?[ \t]*[:：]?)/i;

/** True when the narrative has a caveat section a reader can find. */
function hasCaveatSection(text) {
  return CAVEAT_SECTION.test(String(text === undefined || text === null ? '' : text));
}

/**
 * What the answer must not omit, derived from the report aggregation.
 *
 * The layered policy appends the report-notes block (open items, the checked test
 * ledger) after the prose, so its coverage is that block: the answer must carry it
 * verbatim. The plain "model" policy has no appendix, so its prose itself has to
 * name the open tasks. Either way the caveats are the synthesizer's to rewrite, so
 * the requirement on them is structural (needsCaveats), not verbatim.
 */
function summaryCoverage(data, counts, useNotes, noLedger) {
  const needsCaveats = data.uncertainties.length > 0;
  if (useNotes) {
    const notes = layeredNotesBlock(data);
    return {
      notesProbe: notes === '' ? '' : clip(notes, SYNTHESIS_SUMMARY_CHARS - 2),
      incompleteIds: [],
      needsCaveats: needsCaveats,
      testLine: '',
      openCount: data.incomplete.length,
      counts: counts
    };
  }
  const incompleteIds = [];
  for (let i = 0; i < data.incomplete.length; i++) {
    if (incompleteIds.indexOf(data.incomplete[i].taskId) === -1) incompleteIds.push(data.incomplete[i].taskId);
  }
  const commands = counts.checked.passed + counts.checked.failed + counts.checked.not_run +
    counts.claimed.passed + counts.claimed.failed + counts.claimed.not_run;
  return {
    notesProbe: '',
    incompleteIds: incompleteIds,
    needsCaveats: needsCaveats,
    testLine: commands > 0 && noLedger !== true ? layeredTestsLine(counts) : '',
    openCount: data.incomplete.length,
    counts: counts
  };
}

/**
 * The run verdict has to be stated, and stated as the report has it.
 *
 * A completed run needs a completion word; a partial or failed run needs a word
 * that says something did not pass. The guardrail already rejects the opposite
 * claim ("all passed" on a partial run); this catches the quieter failure of a
 * narrative that never says what happened at all.
 */
function summaryStatesStatus(text, status) {
  const value = summaryProbe(text);
  if (status === 'completed') {
    return /已完成|全部完成|做完了|核验通过|全部通过/.test(value) ||
      /\b(completed|complete|done|finished|verified)\b/.test(value);
  }
  return /未通过|未完成|尚未|失败|不通过|not passed|not pass|failed|did not|could not|incomplete|partial|部分/.test(value);
}

/** Step 2: deterministic correctness and omission check of the composed candidate. */
function checkSummaryDraft(composed, prose, facts, corpus, coverage) {
  if (prose !== '') {
    const guard = polishGuardrail(prose, facts, corpus);
    if (!guard.ok) return { ok: false, reason: guard.reason };
  }
  const text = summaryProbe(composed);
  if (coverage.notesProbe !== '' && text.indexOf(summaryProbe(coverage.notesProbe)) === -1) {
    return { ok: false, reason: 'the answer omits the report notes that carry the open items and the test ledger' };
  }
  for (let i = 0; i < coverage.incompleteIds.length; i++) {
    if (!summaryNamesTask(composed, coverage.incompleteIds[i])) {
      return { ok: false, reason: 'the answer omits incomplete task ' + coverage.incompleteIds[i] };
    }
  }
  // The caveats are the synthesizer's to rewrite, so the requirement is the
  // section that carries them, not the report's sentences (round-075): a narrative
  // that quietly drops them has to be caught, and one that says them in its own
  // words must not be rejected for not quoting the report.
  if (coverage.needsCaveats && !hasCaveatSection(composed)) {
    return { ok: false, reason: 'the answer drops the caveat section the report needs' };
  }
  if (coverage.testLine !== '' && text.indexOf(summaryProbe(coverage.testLine)) === -1) {
    return { ok: false, reason: 'the answer omits the checked command/test ledger' };
  }
  return { ok: true, reason: '' };
}

/**
 * Step 3's evidence: walk the raw task results again.
 *
 * Deliberately a second implementation of the settled-fact walk, not a call into
 * the aggregation the draft was built from. If the two disagree — the reported
 * status, the set of open tasks, the command counts — the verification fails
 * instead of blessing the disagreement.
 */
function recomputedOutcomes(results) {
  const verifiedIds = [];
  const openIds = [];
  const uncertainties = [];
  const checked = { passed: 0, failed: 0, not_run: 0 };
  const claimed = { passed: 0, failed: 0, not_run: 0 };
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const attempts = Array.isArray(result.attempts) ? result.attempts : [];
    const last = attempts.length > 0 ? attempts[attempts.length - 1] : null;
    if (result.status === 'verified') verifiedIds.push(result.task.id);
    else openIds.push(result.task.id);
    if (last && last.verification) {
      for (let c = 0; c < last.verification.commandsRun.length; c++) {
        const status = last.verification.commandsRun[c].status;
        if (checked[status] !== undefined) checked[status] += 1;
      }
    }
    if (last && last.execution) {
      for (let c = 0; c < last.execution.testsRun.length; c++) {
        const status = last.execution.testsRun[c].status;
        if (claimed[status] !== undefined) claimed[status] += 1;
      }
    }
    if (result.status === 'verified' && last && last.verification) {
      if (last.verification.confidence === 'low') uncertainties.push('verifier reported low confidence');
      for (let u = 0; u < last.verification.issues.length; u++) uncertainties.push('verifier note: ' + last.verification.issues[u]);
      if (last.execution && last.execution.uncertainties) {
        for (let u = 0; u < last.execution.uncertainties.length; u++) uncertainties.push(last.execution.uncertainties[u]);
      }
    } else {
      for (let a = 0; a < attempts.length; a++) {
        const attempt = attempts[a];
        if (!attempt || !attempt.execution || !attempt.execution.uncertainties) continue;
        for (let u = 0; u < attempt.execution.uncertainties.length; u++) uncertainties.push(attempt.execution.uncertainties[u]);
      }
    }
  }
  return { verifiedIds: verifiedIds, openIds: openIds, uncertainties: uncertainties, checked: checked, claimed: claimed };
}

/** Step 3: independent verification of the composed candidate. */
function verifySummaryDraft(composed, facts, coverage, results, planFallback) {
  const recomputed = recomputedOutcomes(results);
  const expected = results.length > 0 && !planFallback && recomputed.verifiedIds.length === results.length
    ? 'completed'
    : recomputed.verifiedIds.length > 0 ? 'partial' : 'failed';
  if (expected !== facts.status) {
    return { ok: false, reason: 'the recomputed run status ' + expected + ' disagrees with the reported ' + facts.status };
  }
  if (!summaryStatesStatus(composed, expected)) {
    return { ok: false, reason: 'the answer does not state the recomputed run verdict (' + expected + ')' };
  }
  if (recomputed.openIds.length !== coverage.openCount) {
    return { ok: false, reason: 'the recomputed open-task count disagrees with the reported count' };
  }
  const buckets = ['checked', 'claimed'];
  const states = ['passed', 'failed', 'not_run'];
  for (let b = 0; b < buckets.length; b++) {
    for (let s = 0; s < states.length; s++) {
      if (recomputed[buckets[b]][states[s]] !== coverage.counts[buckets[b]][states[s]]) {
        return { ok: false, reason: 'the recomputed command counts disagree with the reported counts' };
      }
    }
  }
  const text = summaryProbe(composed);
  // Re-derived from the raw task results, and checked before the notes block's
  // early return so both coverage modes are covered: the caveats must live in a
  // section of their own, and the report's own wording is not what is required.
  if (recomputed.uncertainties.length > 0 && !hasCaveatSection(composed)) {
    return { ok: false, reason: 'the answer drops the caveat section the task results need' };
  }
  if (coverage.notesProbe !== '') {
    if (text.indexOf(summaryProbe(coverage.notesProbe)) === -1) {
      return { ok: false, reason: 'the report notes are missing or was altered before delivery' };
    }
    return { ok: true, reason: '' };
  }
  for (let i = 0; i < recomputed.openIds.length; i++) {
    if (!summaryNamesTask(composed, recomputed.openIds[i])) {
      return { ok: false, reason: 'the answer omits a task that did not verify (' + recomputed.openIds[i] + ')' };
    }
  }
  if (coverage.testLine !== '') {
    const line = summaryProbe(layeredTestsLine(recomputed));
    if (text.indexOf(line) === -1) {
      return { ok: false, reason: 'the command/test ledger does not match the raw task results' };
    }
  }
  return { ok: true, reason: '' };
}

/** One review pass: check, then independent verify. The stage names a failure. */
function reviewSummaryDraft(composed, prose, facts, corpus, coverage, results, planFallback) {
  const check = checkSummaryDraft(composed, prose, facts, corpus, coverage);
  if (!check.ok) return { ok: false, stage: 'check', reason: check.reason };
  const verify = verifySummaryDraft(composed, facts, coverage, results, planFallback);
  if (!verify.ok) return { ok: false, stage: 'verify', reason: verify.reason };
  return { ok: true, stage: 'verify', reason: '' };
}

/** The finding a rewrite receives. */
function summaryReviewFinding(review) {
  return review.stage + ' failed: ' + clip(review.reason, 300);
}

/**
 * The factual guardrail for the polished text (layer 2 gate).
 *
 * Deterministic and bounded: every check is a regex or a substring lookup over
 * data derived from the verified report. A failure never falls back to the model
 * text — it falls back to the deterministic narrative, so the worst outcome of a
 * false rejection is a plainer answer, never a less truthful one.
 */
function polishGuardrail(text, facts, corpus) {
  const value = typeof text === 'string' ? text.trim() : '';
  if (value === '') return { ok: false, reason: 'the polish is empty' };
  if (value.length > SYNTHESIS_SUMMARY_CHARS * 2) {
    return { ok: false, reason: 'the polish is over ' + (SYNTHESIS_SUMMARY_CHARS * 2) + ' characters' };
  }
  // 1. The verdict is the report's, not the polish's: a run that is not completed
  //    must never be narrated as all-passed.
  if (facts.status !== 'completed') {
    const claimsAll =
      /\b(all|every)\b[^.\n]{0,40}\b(passed|verified|completed|succeeded|done|met|satisfied)\b/i.test(value) ||
      /\bCOMPLETED\b/.test(value) ||
      /全部(任务|项目|检查|验收标准)?(均|都)?(已)?(通过|核验通过|完成|满足|达成)/.test(value) ||
      /所有(任务|项目|检查)(都|均)?(已)?(通过|完成|满足|达成)/.test(value);
    if (claimsAll) return { ok: false, reason: 'claims full success while the run status is ' + facts.status };
  }
  // 2. Passing tests exist only if a checker ran one: without a verified pass,
  //    any pass claim is invention, whatever the executor reported.
  if (facts.verifiedPasses === 0) {
    const claimsPass =
      /\b(tests?|checks?|suites?|builds?)\s+(all\s+)?(pass|passed|passing|green)\b/i.test(value) ||
      /(?:测试|用例|检查|构建)(?:全部|均|都)?(?:已)?通过/.test(value) ||
      /全绿/.test(value);
    if (claimsPass) return { ok: false, reason: 'claims passing tests while no checker-verified passing test exists' };
  }
  // 3. Open items cannot be narrated away; the notes appendix re-prints them, and
  //    an explicit denial marks the text as unfaithful.
  if (facts.openItems > 0) {
    const denies =
      /no\s+(open\s+|unresolved\s+|outstanding\s+|remaining\s+)?(uncertainties?|open\s+questions?|risks?|issues?|caveats?)/i.test(value) ||
      /没有(任何)?(未决|不确定|遗留|待确认)/.test(value) ||
      /无(未决|遗留)问题/.test(value);
    if (denies) return { ok: false, reason: 'denies open items the report lists' };
  }
  // 4. Cited paths and commands must come from the report: a backtick span that
  //    carries a path or command shape and is absent from the corpus is invention.
  const tick = String.fromCharCode(96);
  const spans = value.split(tick);
  for (let i = 1; i + 1 < spans.length; i += 2) {
    const inner = spans[i];
    if (inner.length < 1 || inner.length > 200 || inner.indexOf('\n') !== -1) continue;
    if (!/[\/.\s]/.test(inner)) continue;
    if (corpus.indexOf(inner.toLowerCase()) === -1) {
      return { ok: false, reason: 'cites "' + inner + '", which the verified report does not contain' };
    }
  }
  // 5. Style: plain human prose only. Machine tokens, verbatim quotes, code and
  //    bilingual repeats belong in the report ledger, never in the narrative —
  //    the prompt already asks for a paraphrase, and this check enforces it.
  return polishStyleVerdict(value, facts);
}

/** The constrained polish prompt (layer 2): language follows the run's naming. */
function layeredPolishPrompt(digest, review, draft) {
  const zh = NAMING_LANGUAGE !== 'en';
  const parts = [
    synthesisDraftLabel(draft),
    zh
      ? '你为一次已完成核验的工作流运行撰写最终结语的润色稿。DATA 是唯一事实来源。'
      : 'You write the polished final narrative for a verified workflow run. DATA below is the only source of fact.',
    zh
      ? '不得改变结论：运行状态与核验数量以 DATA 为准；DATA 没有列出的文件、命令或结果一律不得提及；DATA 未标 passed 的测试不得写成通过。'
      : 'You may not change the verdict: run status and verified counts follow DATA; never mention a file, command or result that DATA does not list; never write a test as passed when DATA does not mark it passed.',
    zh
      ? '未完成与待确认事项必须写进回答：未完成照实说，「待确认」那几条用自己的话写进「注意」段，一条一句；不得省略、不得否认，也不得原样照抄 DATA 的句子。'
      : 'Incomplete items and open questions must appear in the answer: state the incomplete ones plainly, and rewrite each open question in your own words under the caveat section, one sentence each; never drop, deny or paste them.',
    zh
      ? '可以分节，但只允许「结果：」「怎么用：」「注意：」这三个标题各占一行；不得用别的标题，不得用列表或 Markdown。'
      : 'Sections are allowed, but only these three headings on their own lines: "Result:", "How to use:", "Caveats:". No other headings, no lists, no markdown.',
    zh
      ? '证据只转述结论（一项一句，用自己的话）；禁止逐字引用 DATA 原文，禁止粘贴代码或 shell 输出。'
      : 'Evidence only paraphrases each agreed result (one sentence each, in your own words); never quote DATA verbatim and never paste code or shell output.',
    'When prior rounds are listed, the answer may say what this run adds to them; never present an earlier round\'s result as this run\'s work.',
    zh
      ? '完成后必须调用结构化结果工具提交 {"summary": "<你的润色稿>"}，只调用一次——只回正文、不调工具等于没交。'
      : 'Report your narrative by calling the structured result tool exactly once with {"summary": "<your narrative>"} — a plain text reply without the tool call is not recorded.'
  ].concat(carryoverSection());
  if (review) {
    parts.push('');
    parts.push(zh
      ? '上一稿没有通过汇总审查，必须按审查意见重写：' + summaryReviewFinding(review)
      : 'Your previous draft failed the summary review and must be rewritten: ' + summaryReviewFinding(review));
    parts.push(zh ? '上一稿（不要照抄被指出的问题）：' : 'Previous draft (do not repeat the flagged problem):');
    parts.push(safePromptJson(clip(review.draft, SYNTHESIS_SUMMARY_CHARS)));
  }
  parts.push('', 'DATA:', safePromptJson(digest), '', synthesizerHardRules());
  return parts.join('\n');
}

/**
 * One summary draft or rewrite through the synthesizer chain.
 *
 * A call failure is returned, never thrown: the report and the deterministic
 * narrative are already complete, so a dead synthesizer route must not abort the
 * run (G-4). The caller decides what the failure means for the gate.
 *
 * A format gap gets one same-attempt resubmit (the worker's resubmit pattern):
 * a child that prose-answered already holds the narrative, so it only pays one
 * short submit call instead of losing the whole polish to a format error.
 */
async function requestSummaryDraft(prompt, attempt) {
  // The draft number is the row's identity: the attempt index is 0-based, so the
  // first draft reads 汇总·第1稿 and a rewrite reads the next number. The same
  // string is the prompt's first line, so the panel's label and the child's own
  // title cannot disagree.
  //
  // B-gap (gap-13): failed 汇总同腿补派 1 次。per-unit 计数:attempt 索引本身就是
  // 单元计数器(0=首发,>=1=已补派过),不引入全局计数。配置类失败
  // (setup/routeHealth 死亡位、budget-exhausted、agent-start-failed、category
  // configuration)标为人工(manual),不自动补派:这类失败重发只会烧预算。
  // 只有可重试失败(infrastructure/quality 的 format-error/transport/route 死亡)
  // 且 attempt === 0 时,才用同一条腿(synthesizer)补发一次;补派仍失败则如实
  // 返回空文本,由交付层兜底,不再循环(有界,不成环)。
  const label = synthesisDraftLabel(attempt + 1);
  let firstError = '';
  try {
    const call = await callRole('synthesizer', prompt, {
      schema: SUMMARY_SCHEMA,
      label: label,
      phase: phaseLabel('synthesize'),
      attempt: attempt
    });
    if (!call.ok) {
      if (call.failure && call.failure.class === 'format-error' && !call.failure.setup) {
        const resubmit = await callRole('synthesizer', summaryResubmitPrompt(prompt, attempt + 1), {
          schema: SUMMARY_SCHEMA,
          label: label,
          phase: phaseLabel('synthesize'),
          attempt: attempt
        });
        if (resubmit.ok) {
          const resubmitted = normalizeSummary(resubmit.value);
          if (resubmitted) {
            log('synthesizer resubmitted structured result');
            return { text: resubmitted.summary, error: '' };
          }
        }
      }
      // B-gap (gap-13) redispatch: same-leg one-shot. attempt is the per-unit
      // counter (0 = first issue, >= 1 = already redispatched), so attempt > 0
      // means the budget is spent and this failure is terminal. Configuration
      // failures repeat by definition and are marked manual instead.
      if (attempt === 0 && isSynthRedispatchable(call.failure)) {
        log('synthesizer redispatching same leg once after [' + call.failure.class + ']');
        return requestSummaryDraft(prompt, 1);
      }
      if (attempt === 0 && isSynthManualOnly(call.failure)) firstError = call.failure.class;
      return { text: '', error: 'synthesizer failed on every route: [' + call.failure.class + '] ' + call.failure.reason + (firstError === '' ? '' : ' (manual: ' + firstError + ', no auto-redispatch)') };
    }
    const normalized = normalizeSummary(call.value);
    if (!normalized) {
      const resubmit = await callRole('synthesizer', summaryResubmitPrompt(prompt, attempt + 1), {
        schema: SUMMARY_SCHEMA,
        label: label,
        phase: phaseLabel('synthesize'),
        attempt: attempt
      });
      if (resubmit.ok) {
        const resubmitted = normalizeSummary(resubmit.value);
        if (resubmitted) {
          log('synthesizer resubmitted structured result');
          return { text: resubmitted.summary, error: '' };
        }
      }
      // B-gap (gap-13): a prose answer that never submits is a retryable quality
      // gap on the same leg — one redispatch, same per-unit counter rule.
      if (attempt === 0) {
        log('synthesizer redispatching same leg once after unparsable summary');
        return requestSummaryDraft(prompt, 1);
      }
      return { text: '', error: 'synthesizer returned no valid summary' };
    }
    return { text: normalized.summary, error: '' };
  } catch (error) {
    return { text: '', error: 'synthesizer could not run: [' + classifyCallFailure('synthesizer', error).class + '] ' + safeError(error) };
  }
}

/**
 * B-gap (gap-13): whether a dead synthesizer call may be redispatched on the
 * same leg. Configuration failures repeat by definition (budget-exhausted,
 * agent-start-failed, category configuration, or the setup bit the budget guard
 * sets) and are marked manual instead of re-sent. Everything else — a route
 * transport death or a retryable format/infrastructure/quality gap — may go
 * once more on the same leg. The per-unit bound lives in the caller: only
 * attempt 0 redispatches, so the redispatch itself (attempt 1) is
 * terminal whatever it returns.
 */
function isSynthRedispatchable(failure) {
  if (!failure) return false;
  return !isSynthManualOnly(failure);
}

/**
 * B-gap (gap-13): configuration-class failures are manual-only — no automatic
 * redispatch, the error string carries the mark instead.
 */
function isSynthManualOnly(failure) {
  if (!failure) return false;
  if (failure.setup === true) return true;
  if (failure.class === 'budget-exhausted' || failure.class === 'agent-start-failed') return true;
  if (failure.category === 'configuration') return true;
  return false;
}

/**
 * Resubmit prompt: the previous synthesizer call produced no structured result
 * (the child prose-answered or returned the wrong shape), so nothing was
 * recorded. Same attempt, spending no retry budget: the narrative is already
 * written, only the tool call is missing — submit it now, do not rewrite.
 */
function summaryResubmitPrompt(prompt, draft) {
  const zh = NAMING_LANGUAGE !== 'en';
  const lines = [
    // Same draft, same number: a resubmit is the form the first call failed to
    // submit, never a new draft.
    synthesisDraftLabel(draft),
    zh
      ? '你上一条回复没有提交结构化结果，所以没有记录。不用重写润色稿，直接用结构化结果工具提交同一份稿子即可，只调用一次。'
      : 'Your previous response produced no structured result, so nothing was recorded. Do not rewrite the narrative: submit the same draft through the structured result tool now, exactly once.'
  ];
  if (prompt) {
    lines.push('', 'ORIGINAL PROMPT (same rules apply):');
    lines.push(prompt);
  }
  return lines.join('\n');
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }
  const workers = [];
  const poolSize = Math.min(limit, items.length);
  for (let i = 0; i < poolSize; i++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

`;
}
