/**
 * User-delivery layer: the default user-facing rendering of a validated report.
 *
 * The `WorkflowReport` is a machine contract — task ids, status enums, route
 * trails and counters — and `renderReport` (src/report.ts) is its ledger view.
 * Neither is what a user should read. This module renders the *delivery
 * message*: result-first, in the user's language, with wording that follows the
 * scenario (code fix, research, pure answer, partial, failed), built strictly
 * from verified report facts.
 *
 * The rules this module is written against:
 *
 * 1. **Result first.** The first line states what was achieved, not that a
 *    workflow ran. A reader who stops after one line has the outcome.
 * 2. **Verified facts only.** Titles, files, commands, evidence, reasons,
 *    uncertainties and the final answer are quoted from the report; nothing is
 *    invented, estimated or upgraded. A `partial` never reads as `completed`,
 *    and a `failed` never wears success wording.
 * 3. **No internals.** No task ids, no status enums, no route or attempt
 *    counters, no deadlines, no limits — none of the ledger vocabulary leaks
 *    into the delivery text.
 * 4. **Doubts survive.** Uncertainties are rendered in every scenario that has
 *    them; dropping them would turn a caveat into a claim.
 * 5. **Bounded.** Every field is one-lined and capped, and the whole text is
 *    capped at {@link DELIVERY_LIMITS.totalChars} with a surrogate-safe cut.
 *
 * Language follows the user's message (D-022): the caller passes the language
 * it already detected; when absent, the report objective is the fallback
 * signal — a CJK objective means Chinese, anything else English.
 */
import { detectLanguage } from './triage.js';
/** Bounds of one delivery text. Every field is clamped here, in one place. */
export const DELIVERY_LIMITS = {
    /** Task titles listed at most. */
    tasks: 6,
    /** Characters kept of one task title. */
    titleChars: 140,
    /** Changed files listed at most. */
    files: 4,
    /** Characters kept of one file path. */
    fileChars: 120,
    /** Verification commands listed at most. */
    commands: 3,
    /** Characters kept of one command. */
    commandChars: 160,
    /** Evidence items listed at most. */
    evidence: 4,
    /** Characters kept of one rendered evidence item. */
    evidenceChars: 220,
    /** Failed-task reasons listed at most. */
    reasons: 4,
    /** Characters kept of one reason. */
    reasonChars: 260,
    /** Uncertainties listed at most. */
    uncertainties: 6,
    /** Characters kept of one uncertainty. */
    uncertaintyChars: 300,
    /** Characters kept of the final-answer excerpt. */
    summaryChars: 800,
    /** Hard cap of the whole delivery text. */
    totalChars: 2_800,
};
/**
 * Scenario of one report, decided by its status first and its verified
 * artifacts second. The status is never re-interpreted: `failed` stays failed
 * even when attempts left artifacts behind, and `partial` stays partial even
 * when every surviving task verified.
 *
 * - `code` — verified tasks changed files or ran passing commands.
 * - `research` — verified tasks carry deliverables or evidence but no file
 *   change and no passing command.
 * - `answer` — a pure question answered in text: nothing but a summary.
 */
export function deliveryScenario(report) {
    if (report.status === 'failed')
        return 'failed';
    if (report.status === 'partial')
        return 'partial';
    const verified = report.tasks.filter(task => task.status === 'verified');
    const touchedCode = verified.some(task => {
        const execution = lastPassedExecution(task);
        if (execution === null)
            return false;
        return execution.filesChanged.some(file => file.trim() !== '')
            || execution.testsRun.some(run => run.status === 'passed' && run.command.trim() !== '');
    });
    if (touchedCode)
        return 'code';
    const hasSubstance = verified.some(task => {
        const execution = lastPassedExecution(task);
        if (execution === null)
            return false;
        return execution.deliverables.length > 0 || execution.evidence.length > 0;
    });
    return hasSubstance ? 'research' : 'answer';
}
/** The last passed attempt's execution of a task, or `null`. */
function lastPassedExecution(task) {
    const last = task.attempts[task.attempts.length - 1];
    return last !== undefined && last.passed && last.execution !== null ? last.execution : null;
}
/** Collapse whitespace and bound one line of quoted report text (surrogate-safe). */
function oneLine(value, max) {
    const compact = value.replace(/\s+/g, ' ').trim();
    if (compact.length <= max)
        return compact;
    let cut = Math.max(0, max - 1);
    const code = compact.charCodeAt(cut - 1);
    if (code >= 0xd800 && code <= 0xdbff)
        cut -= 1;
    return `${compact.slice(0, cut)}…`;
}
/** Extract the quotable facts of one report. Every field is clamped. */
function factsOf(report) {
    const verified = report.tasks.filter(task => task.status === 'verified');
    const failed = report.tasks.filter(task => task.status !== 'verified');
    const files = [];
    const commands = [];
    for (const task of verified) {
        const execution = lastPassedExecution(task);
        if (execution === null)
            continue;
        for (const file of execution.filesChanged) {
            const value = oneLine(file, DELIVERY_LIMITS.fileChars);
            if (value !== '' && !files.includes(value))
                files.push(value);
            if (files.length >= DELIVERY_LIMITS.files)
                break;
        }
        for (const run of execution.testsRun) {
            if (run.status !== 'passed' || run.command.trim() === '')
                continue;
            const value = oneLine(run.command, DELIVERY_LIMITS.commandChars);
            if (!commands.includes(value))
                commands.push(value);
            if (commands.length >= DELIVERY_LIMITS.commands)
                break;
        }
    }
    const evidence = report.confirmed.slice(0, DELIVERY_LIMITS.evidence).map(item => oneLine(`${oneLine(item.criterion, 120)} — ${oneLine(item.evidence, 160)}`, DELIVERY_LIMITS.evidenceChars)).filter(item => item.replace(/[—\s]/g, '').length > 0);
    const failureReasonOf = (taskId) => {
        const row = report.incomplete.find(item => item.taskId === taskId);
        return row === undefined ? '' : oneLine(row.reason, DELIVERY_LIMITS.reasonChars);
    };
    const failures = failed.slice(0, DELIVERY_LIMITS.reasons).map(task => ({
        title: oneLine(task.title, DELIVERY_LIMITS.titleChars),
        reason: failureReasonOf(task.id),
    })).filter(entry => entry.reason !== '' || entry.title !== '');
    // A run-level failure has no task rows: its reason lives on errors[].
    if (failures.length === 0) {
        for (const error of report.errors.slice(0, DELIVERY_LIMITS.reasons)) {
            const reason = oneLine(error.message, DELIVERY_LIMITS.reasonChars);
            if (reason !== '')
                failures.push({ title: '', reason });
        }
    }
    const uncertainties = report.uncertainties
        .slice(0, DELIVERY_LIMITS.uncertainties)
        .map(item => oneLine(item.text, DELIVERY_LIMITS.uncertaintyChars))
        .filter(text => text !== '');
    const summary = report.synthesis.summary === undefined
        ? ''
        : oneLine(report.synthesis.summary, DELIVERY_LIMITS.summaryChars);
    const degradedPlan = report.status === 'completed' ? '' : oneLine(report.plan.error ?? '', DELIVERY_LIMITS.reasonChars);
    return {
        verifiedTitles: verified.slice(0, DELIVERY_LIMITS.tasks).map(task => oneLine(task.title, DELIVERY_LIMITS.titleChars)),
        failedTitles: failed.slice(0, DELIVERY_LIMITS.tasks).map(task => oneLine(task.title, DELIVERY_LIMITS.titleChars)),
        files,
        commands,
        evidence,
        failures,
        uncertainties,
        summary,
        degradedPlan,
    };
}
/**
 * The verified results one delivery keeps, as ready-to-render lines.
 *
 * Shared by {@link deliveryForReport} and the gate's cancelled terminal: after
 * a cancellation the same facts must survive, prefixed by the cancelled state
 * instead of a success lead.
 */
export function preservedFacts(report, lang) {
    const zh = lang === 'zh';
    const facts = factsOf(report);
    const lines = [];
    if (facts.verifiedTitles.length > 0) {
        lines.push(zh
            ? `已核验：${facts.verifiedTitles.join('；')}。`
            : `Verified: ${facts.verifiedTitles.join('; ')}.`);
    }
    if (facts.files.length > 0) {
        lines.push(zh ? `改动落在：${facts.files.join('、')}。` : `Changed: ${facts.files.join(', ')}.`);
    }
    if (facts.commands.length > 0) {
        lines.push(zh ? `验证命令已全部通过：${facts.commands.join('、')}。` : `Verified by: ${facts.commands.join(', ')}.`);
    }
    if (facts.evidence.length > 0) {
        lines.push(zh ? '依据：' : 'Basis:');
        for (const item of facts.evidence)
            lines.push(`- ${item}`);
    }
    if (facts.summary !== '')
        lines.push(zh ? `结论：${facts.summary}` : `Summary: ${facts.summary}`);
    if (facts.uncertainties.length > 0) {
        lines.push(zh ? '仍不确定：' : 'Still uncertain:');
        for (const item of facts.uncertainties)
            lines.push(`- ${item}`);
    }
    return lines;
}
/** Evidence and uncertainty blocks shared by every scenario. */
function caveatBlocks(facts, lang) {
    const zh = lang === 'zh';
    const lines = [];
    if (facts.evidence.length > 0) {
        lines.push(zh ? '依据：' : 'Basis:');
        for (const item of facts.evidence)
            lines.push(`- ${item}`);
    }
    if (facts.uncertainties.length > 0) {
        lines.push(zh ? '仍不确定：' : 'Still uncertain:');
        for (const item of facts.uncertainties)
            lines.push(`- ${item}`);
    }
    return lines;
}
/** Surrogate-safe cut of the whole delivery text (never splits a code point). */
function capText(text) {
    if (text.length <= DELIVERY_LIMITS.totalChars)
        return text;
    let cut = DELIVERY_LIMITS.totalChars;
    const code = text.charCodeAt(cut - 1);
    if (code >= 0xd800 && code <= 0xdbff)
        cut -= 1;
    return `${text.slice(0, cut)}…`;
}
/**
 * Render the user-facing delivery text of one validated report.
 *
 * @param report - a validated report, or an explicit failure report.
 * @param lang - the user's language; defaults to the report objective's language.
 * @returns the delivery text: result-first, scenario-worded, bounded.
 */
export function deliveryForReport(report, lang) {
    const language = lang ?? detectLanguage(report.objective);
    const facts = factsOf(report);
    const zh = language === 'zh';
    const lines = [];
    const verifiedCount = report.tasks.filter(task => task.status === 'verified').length;
    const total = report.tasks.length;
    const titles = () => facts.verifiedTitles.join(zh ? '；' : '; ');
    switch (deliveryScenario(report)) {
        case 'code': {
            lines.push(zh
                ? `已完成 ${verifiedCount} 项任务并通过核验：${titles()}。`
                : `Done: ${titles()} — ${verifiedCount} of ${total} tasks verified.`);
            if (facts.files.length > 0) {
                lines.push(zh ? `改动落在：${facts.files.join('、')}。` : `Changed: ${facts.files.join(', ')}.`);
            }
            if (facts.commands.length > 0) {
                lines.push(zh
                    ? `验证命令已全部通过：${facts.commands.join('、')}。`
                    : `Verified by: ${facts.commands.join(', ')}.`);
            }
            if (facts.summary !== '')
                lines.push(zh ? `结论：${facts.summary}` : `Summary: ${facts.summary}`);
            lines.push(...caveatBlocks(facts, language));
            break;
        }
        case 'research': {
            if (facts.summary !== '')
                lines.push(zh ? `结论：${facts.summary}` : `Findings: ${facts.summary}`);
            if (facts.verifiedTitles.length > 0) {
                lines.push(zh
                    ? `以上结论来自 ${verifiedCount} 项已核验的任务：${titles()}。`
                    : `These findings come from ${verifiedCount} verified task${verifiedCount === 1 ? '' : 's'}: ${titles()}.`);
            }
            lines.push(...caveatBlocks(facts, language));
            break;
        }
        case 'answer': {
            // A pure question: the answer itself is the delivery — no framing.
            if (facts.summary !== '') {
                lines.push(facts.summary);
                lines.push(...caveatBlocks(facts, language));
            }
            else {
                // No narrative: state what verified and let the evidence speak.
                lines.push(zh
                    ? `已完成 ${verifiedCount} 项任务并通过核验：${titles()}。`
                    : `Done: ${titles()} — ${verifiedCount} of ${total} tasks verified.`);
                lines.push(...caveatBlocks(facts, language));
            }
            break;
        }
        case 'partial': {
            if (zh) {
                lines.push(`部分完成：${verifiedCount}/${total} 项任务已通过核验${facts.verifiedTitles.length > 0 ? `：${titles()}` : ''}。`);
            }
            else {
                lines.push(`Partly done: ${verifiedCount}/${total} tasks verified${facts.verifiedTitles.length > 0 ? `: ${titles()}` : ''}.`);
            }
            if (facts.failures.length > 0) {
                for (const failure of facts.failures) {
                    lines.push(zh
                        ? `未完成：${failure.title === '' ? '' : `${failure.title}——`}${failure.reason}。`
                        : `Not finished: ${failure.title === '' ? '' : `${failure.title}: `}${failure.reason}.`);
                }
            }
            else if (facts.degradedPlan !== '') {
                lines.push(zh
                    ? `说明：规划阶段降级（${facts.degradedPlan}），整体状态仍为部分完成。`
                    : `Note: planning was degraded (${facts.degradedPlan}); the run still counts as partial.`);
            }
            if (facts.summary !== '')
                lines.push(zh ? `已核验部分的结论：${facts.summary}` : `Summary of the verified part: ${facts.summary}`);
            if (facts.files.length > 0) {
                lines.push(zh ? `改动落在：${facts.files.join('、')}。` : `Changed: ${facts.files.join(', ')}.`);
            }
            if (facts.commands.length > 0) {
                lines.push(zh
                    ? `验证命令已全部通过：${facts.commands.join('、')}。`
                    : `Verified by: ${facts.commands.join(', ')}.`);
            }
            lines.push(...caveatBlocks(facts, language));
            break;
        }
        case 'failed': {
            lines.push(zh
                ? '未能完成：这次运行没有可交付的结果。'
                : 'This run could not be completed: nothing was delivered.');
            const reason = facts.failures[0]?.reason ?? '';
            if (reason !== '')
                lines.push(zh ? `原因：${reason}。` : `Reason: ${reason}.`);
            if (facts.failedTitles.length > 0) {
                lines.push(zh
                    ? `未通过核验的任务：${facts.failedTitles.join('；')}。`
                    : `Tasks that did not verify: ${facts.failedTitles.join('; ')}.`);
            }
            if (reason === '' && facts.degradedPlan !== '') {
                lines.push(zh ? `原因：${facts.degradedPlan}。` : `Reason: ${facts.degradedPlan}.`);
            }
            if (facts.uncertainties.length > 0) {
                lines.push(zh ? '仍不确定：' : 'Still uncertain:');
                for (const item of facts.uncertainties)
                    lines.push(`- ${item}`);
            }
            break;
        }
    }
    return capText(lines.join('\n'));
}
//# sourceMappingURL=delivery.js.map