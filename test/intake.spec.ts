/**
 * Prompt intake: the size boundary, the refusal text, and the documented
 * template.
 *
 * Coverage is deliberately end-to-end on the intake layer, offline and
 * deterministic:
 *
 *   1. the boundary matrix — a prompt at the budget is admitted, one character
 *      over is refused, with the measured count and the number of parts it would
 *      take to send it through;
 *   2. the refusal texts — both shipped languages, always, so a refusal can never
 *      read as silence;
 *   3. template assembly — `assembleTaskPrompt` renders the documented template
 *      (`docs/task-prompt-template.md`) and the test proves the default template
 *      itself fits the budget and does not open with a slash command.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  assembleTaskPrompt,
  INTAKE_LIMITS,
  inspectPrompt,
  isPromptShapedArgument,
  refuseDiscardedCommandPrompt,
  refuseEmptyPrompt,
  refuseOversizePrompt,
} from '../src/intake.js'

/** A refusal must carry one English line and one Simplified-Chinese line. */
function expectBilingual(text: string): void {
  expect(text.trim()).not.toBe('')
  expect(/[一-鿿]/u.test(text)).toBe(true)
  // The English half is the part without CJK: a refusal that is only Chinese, or
  // only English, is a regression of the bilingual contract.
  const english = text.split('\n').some(line => /[A-Za-z]/u.test(line) && !/[一-鿿]/u.test(line))
  expect(english).toBe(true)
}

describe('intake boundary matrix', () => {
  it.each([1, 4_000, 4_001, 31_999, 32_000])(
    'admits a %i-character prompt (under or at the budget)',
    (chars) => {
      expect(inspectPrompt('x'.repeat(chars))).toBeUndefined()
    },
  )

  it('refuses a 32 001-character prompt with the measured count and the limit', () => {
    const refusal = inspectPrompt('x'.repeat(INTAKE_LIMITS.promptChars + 1))!
    expect(refusal.code).toBe('oversize')
    expect(refusal.chars).toBe(INTAKE_LIMITS.promptChars + 1)
    expect(refusal.limit).toBe(INTAKE_LIMITS.promptChars)
    expect(refusal.text).toContain(`${INTAKE_LIMITS.promptChars + 1}`)
    // The part count is what tells the reader how many messages to send.
    expect(refusal.text).toContain('parts')
    expectBilingual(refusal.text)
  })

  it('keeps the boundary at the workflow objective budget, not a local constant', async () => {
    const { TASK_LIMITS } = await import('../src/input.js')
    expect(INTAKE_LIMITS.promptChars).toBe(TASK_LIMITS.objectiveChars)
  })

  it('refuses an empty prompt', () => {
    const refusal = inspectPrompt('   \n ')!
    expect(refusal.code).toBe('empty')
    expect(refusal.chars).toBe(0)
    expectBilingual(refusal.text)
    expect(refusal.text).toBe(refuseEmptyPrompt().text)
  })

  it('reports the number of parts for a prompt twice the budget', () => {
    expect(refuseOversizePrompt(2 * INTAKE_LIMITS.promptChars).text).toContain('about 2 parts')
    expect(refuseOversizePrompt(2 * INTAKE_LIMITS.promptChars).text).toContain('约 2 段')
  })
})

describe('command-argument intake (the stall shape)', () => {
  it('measures the whole argument, not the leading toggle word', () => {
    const arg = `on /grok${'y'.repeat(120)} 团队任务`
    const refusal = refuseDiscardedCommandPrompt(` ${arg}`)
    expect(refusal.code).toBe('command-prompt')
    expect(refusal.chars).toBe(arg.trim().length)
    expect(refusal.text).toContain(String(arg.trim().length))
    expect(refusal.text).toContain('Usage: /grok [on|off]')
    expectBilingual(refusal.text)
  })

  it('classifies an argument by shape: one line is a typo, long or multi-line is a prompt', () => {
    expect(isPromptShapedArgument('maybe')).toBe(false)
    expect(isPromptShapedArgument('on please')).toBe(false)
    expect(isPromptShapedArgument('x'.repeat(INTAKE_LIMITS.commandPromptChars - 1))).toBe(false)
    expect(isPromptShapedArgument('x'.repeat(INTAKE_LIMITS.commandPromptChars + 1))).toBe(true)
    expect(isPromptShapedArgument('one\ntwo')).toBe(true)
    expect(isPromptShapedArgument('团队任务：第一行\n第二行')).toBe(true)
  })
})

describe('template assembly', () => {
  it('renders heading + body pairs and reports the assembled size', () => {
    const assembled = assembleTaskPrompt([
      { heading: '【背景】', body: '仓库 /home/fish/projects_mine/dsh-grok-workflow。' },
      { heading: '【要求】', body: 'npm run ci 通过。' },
    ])
    expect(assembled.text).toBe(
      '【背景】\n仓库 /home/fish/projects_mine/dsh-grok-workflow。\n\n【要求】\nnpm run ci 通过。',
    )
    expect(assembled.chars).toBe(assembled.text.length)
    expect(assembled.fits).toBe(true)
    expect(assembled.parts).toBe(1)
  })

  it('flags a prompt over the budget and counts the parts it would take', () => {
    const over = assembleTaskPrompt([{ heading: '【要求】', body: 'x'.repeat(INTAKE_LIMITS.promptChars) }])
    expect(over.fits).toBe(false)
    expect(over.parts).toBe(2)
  })

  it('assembles the documented default template inside the budget', () => {
    const doc = readFileSync(new URL('../docs/task-prompt-template.md', import.meta.url), 'utf8')
    // The template lives in one fenced block; anything outside it is prose.
    const start = doc.indexOf('```task-prompt')
    expect(start, 'docs/task-prompt-template.md has no task-prompt fence').toBeGreaterThan(0)
    const end = doc.indexOf('```', start + '```task-prompt'.length)
    expect(end).toBeGreaterThan(start)
    const template = doc.slice(start + '```task-prompt'.length, end).trim()

    // Sections are the `【…】` headings, as `assembleTaskPrompt` expects them.
    const lines = template.split('\n')
    const sections = []
    let current: { heading: string, body: string } | undefined
    for (const line of lines) {
      if (/^【[^】]+】$/u.test(line.trim())) {
        if (current !== undefined) sections.push(current)
        current = { heading: line.trim(), body: '' }
      } else if (current !== undefined) {
        current.body = `${current.body}${current.body === '' ? '' : '\n'}${line}`
      }
    }
    if (current !== undefined) sections.push(current)
    expect(sections.length).toBeGreaterThanOrEqual(3)

    const assembled = assembleTaskPrompt(sections)
    expect(assembled.chars, 'the default template must fit the budget').toBeLessThanOrEqual(
      INTAKE_LIMITS.promptChars,
    )
    expect(assembled.fits).toBe(true)
    expect(assembled.parts).toBe(1)
    // The template must not reproduce the stall: no leading slash command.
    expect(assembled.text).not.toMatch(/^\s*\//u)
    // And the document states the same number the code enforces.
    expect(doc).toContain(String(INTAKE_LIMITS.promptChars))
  })
})
