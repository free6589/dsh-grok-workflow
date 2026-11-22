/**
 * Handoff contract rendering (交接契约渲染): fixed four-line bilingual block.
 *
 * This module is intentionally additive: it never parses or rewrites the main
 * report flow. `src/report.ts` calls {@link renderHandoff} (or
 * {@link renderHandoffSection}) to append the contract block when a validated
 * contract is attached to the report.
 */

import type { HandoffContract } from './contract.js'

/** Reader's language; picks which heading copy is used. Default `zh`. */
export type HandoffLang = 'zh' | 'en'

/** Fixed four-line headings, in output order (conclusion / evidence / open questions / next steps). */
export const HANDOFF_HEADINGS: Record<HandoffLang, [string, string, string, string]> = {
  zh: ['结论', '证据指针', '未决问题', '下一步'],
  en: ['Conclusion', 'Evidence', 'Open questions', 'Next steps'],
}

function oneLine(value: string, max: number): string {
  const compact = value.replace(/\s+/g, ' ').trim()
  return compact.length <= max ? compact : `${compact.slice(0, max - 1)}…`
}

function formatPointer(pointer: HandoffContract['evidence'][number]): string {
  const parts = [pointer.path]
  const checkBits: string[] = []
  if (pointer.checksum !== undefined) checkBits.push(`checksum ${pointer.checksum}`)
  if (pointer.line !== undefined) checkBits.push(`line ${pointer.line}`)
  if (checkBits.length > 0) parts.push(checkBits.join(', '))
  return parts.join(' — ')
}

/**
 * Render one validated contract as a fixed four-line block.
 *
 * @param contract - already validated by `assertHandoffContract`.
 * @param lang - heading language (default `zh`; content is rendered as given).
 * @returns the block: four labelled lines, always in the same order.
 */
export function renderHandoff(contract: HandoffContract, lang: HandoffLang = 'zh'): string {
  const [conclusionLabel, evidenceLabel, openLabel, nextLabel] = HANDOFF_HEADINGS[lang] ?? HANDOFF_HEADINGS.zh
  const sep = lang === 'zh' ? '：' : ': '
  const joiner = lang === 'zh' ? '；' : '; '
  const evidenceText = contract.evidence
    .map(pointer => oneLine(formatPointer(pointer), 400))
    .join(joiner)
  return [
    `${conclusionLabel}${sep}${oneLine(contract.conclusion, 600)}`,
    `${evidenceLabel}${sep}${evidenceText === '' ? '—' : evidenceText}`,
    `${openLabel}${sep}${contract.openQuestions.map(item => oneLine(item, 300)).join(joiner)}`,
    `${nextLabel}${sep}${contract.nextSteps.map(item => oneLine(item, 300)).join(joiner)}`,
  ].join('\n')
}

/**
 * Render the full section block a report appends: a `Handoff:` / `交接契约：`
 * header followed by the fixed four-line block.
 */
export function renderHandoffSection(contract: HandoffContract, lang: HandoffLang = 'zh'): string {
  const header = lang === 'zh' ? '交接契约：' : 'Handoff:'
  return `${header}\n${renderHandoff(contract, lang)}`
}
