/**
 * 人话交付层 / the human-first delivery layer.
 *
 * What a reader gets when a run settles (phase 1 of the output rework):
 *
 * 1. **人类的结论先说** — one plain-language block that stands on its own: what
 *    was done, what was not, what to do next, and the caveats worth knowing. It
 *    is written for a person, so it carries no run/child/task identifiers, no
 *    route bookkeeping and no machine field labels: those only mean something to
 *    whoever debugged the plugin.
 * 2. **机器台账默认收起** — the full machine view (ids, per-task attempts, route
 *    chain, deadline, route switches/overflows, errors) is *not* part of the
 *    default text. It is one explicit switch away ({@link deliverReport} with
 *    `diagnostics`), and that switch is **off** unless someone turns it on.
 *
 * Design constraints that shaped this file:
 *
 * - **Self-contained on purpose.** The only module import is a type import.
 *   Presentation for a human must not drag in the run engine, the config schema
 *   or the model layer, and a delivery text must be composable (and testable)
 *   with nothing but a report value. `src/report.ts` remains the canonical
 *   machine renderer for the tool surface; the ledger here mirrors its field
 *   names so an operator reading either one sees the same labels, not two
 *   dialects.
 * - **Never dress a failure as success.** A `failed` run opens with its own
 *   wording; it never borrows the "done" sentence, because a failure that reads
 *   like an answer is worse than no answer.
 * - **Honest about what is unknown.** `uncertainties` stay in the human block:
 *   they are a truthful caveat a reader needs, not routing bookkeeping. Hiding
 *   them behind a diagnostics switch would be the same class of bug as hiding
 *   the ledger, in reverse.
 */
import type { FinalStatus, WorkflowReport } from '../types.js';
/** Language the human block is written in. */
export type DeliveryLang = 'zh' | 'en';
/**
 * The diagnostics switch as it reaches this module.
 *
 * `boolean` for a resolved setting, or a `{ get }` holder for the live/volatile
 * field the settings surface writes — accepted so a caller can hand over the
 * switch without deciding where the value is stored.
 */
export type DiagnosticsSwitch = boolean | {
    get: () => unknown;
};
/** Options for {@link deliverReport}. */
export interface DeliveryOptions {
    /** Show the machine ledger after the human block. Default `false`. */
    diagnostics?: DiagnosticsSwitch;
    /** Language of the human block. Default `zh`. */
    lang?: DeliveryLang;
}
/** One composed delivery: the human block, and the ledger only on request. */
export interface DeliveryView {
    /** Whether the ledger is present in {@link DeliveryView.text}. */
    diagnostics: boolean;
    /** The plain-language block, always present and readable on its own. */
    human: string;
    /** The full machine ledger; absent unless the switch was on. */
    ledger?: string;
    /** What a relay turn sends: `human`, plus the ledger when it was asked for. */
    text: string;
}
/** Default of the diagnostics switch: the machine ledger stays collapsed. */
export declare const DEFAULT_DIAGNOSTICS = false;
/** Read a switch that may be a resolved boolean or a live holder. */
export declare function diagnosticsEnabled(value?: DiagnosticsSwitch): boolean;
/**
 * Build the plain-language block for one settled run.
 *
 * Order is deliberate: verdict, then the run's own conclusion, then what was and
 * was not achieved, then what to do next, then the caveats. A reader who stops
 * after the first two lines already knows whether to trust the rest.
 *
 * @param report - validated report (or an explicit failure report).
 * @param opts - `lang`; the human block is `zh` unless asked otherwise.
 * @returns the human block, bounded by {@link MAX_HUMAN_CHARS}.
 */
export declare function humanConclusion(report: WorkflowReport, opts?: {
    lang?: DeliveryLang;
}): string;
/**
 * Build the full machine ledger.
 *
 * Only ever reached through an explicit diagnostics switch. It keeps every id,
 * route and attempt a maintainer needs, under the same field labels
 * `src/report.ts` renders, so the two views describe one report in one dialect.
 *
 * @param report - validated report.
 * @returns the ledger text, bounded by {@link MAX_LEDGER_CHARS}.
 */
export declare function machineLedger(report: WorkflowReport): string;
/**
 * Compose one delivery: human conclusion first, machine ledger only on request.
 *
 * The default view is the human block alone. `diagnostics` adds the ledger after
 * a horizontal rule, which is the only way any of the machine identifiers reach
 * a reader — so "the summary said it, the ledger proves it" stays true without
 * the second half being mandatory.
 *
 * @param report - validated report, or an explicit failure report.
 * @param opts - `diagnostics` switch (default off) and `lang`.
 * @returns the composed view; `ledger` is absent when the switch is off.
 */
export declare function deliverReport(report: WorkflowReport, opts?: DeliveryOptions): DeliveryView;
/** Status word for a one-line description of a delivery, used by logs and tests. */
export declare function deliveryHeadline(status: FinalStatus): string;
//# sourceMappingURL=index.d.ts.map