/**
 * Handoff contract rendering (交接契约渲染): fixed four-line bilingual block.
 *
 * This module is intentionally additive: it never parses or rewrites the main
 * report flow. `src/report.ts` calls {@link renderHandoff} (or
 * {@link renderHandoffSection}) to append the contract block when a validated
 * contract is attached to the report.
 */
import type { HandoffContract } from './contract.js';
/** Reader's language; picks which heading copy is used. Default `zh`. */
export type HandoffLang = 'zh' | 'en';
/** Fixed four-line headings, in output order (conclusion / evidence / open questions / next steps). */
export declare const HANDOFF_HEADINGS: Record<HandoffLang, [string, string, string, string]>;
/**
 * Render one validated contract as a fixed four-line block.
 *
 * @param contract - already validated by `assertHandoffContract`.
 * @param lang - heading language (default `zh`; content is rendered as given).
 * @returns the block: four labelled lines, always in the same order.
 */
export declare function renderHandoff(contract: HandoffContract, lang?: HandoffLang): string;
/**
 * Render the full section block a report appends: a `Handoff:` / `交接契约：`
 * header followed by the fixed four-line block.
 */
export declare function renderHandoffSection(contract: HandoffContract, lang?: HandoffLang): string;
//# sourceMappingURL=render.d.ts.map