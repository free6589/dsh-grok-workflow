import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_ITERATE_TEMPLATE } from '../src/config.js'
import { MAX_LOOP_PROMPT_CHARS } from '../src/loop.js'

/**
 * The shipped self-iteration prompt has three homes: `docs/iterate-template.md`
 * (what a reader reads), `DEFAULT_ITERATE_TEMPLATE` in `src/config.ts` (what the
 * schema default and the whitespace fallback deliver), and the hand-written
 * settings bundle's copy, which `test/client.spec.ts` pins to the constant.
 *
 * This file closes the remaining edge — the document and the code — and states
 * the content contract the default must satisfy: the rules a round is judged by
 * cannot be dropped from the template without failing here.
 */

const DOC = readFileSync(new URL('../docs/iterate-template.md', import.meta.url), 'utf8')
const START = '<!-- iterate-template:start -->'
const END = '<!-- iterate-template:end -->'

function templateFromDoc(): string {
  const start = DOC.indexOf(START)
  const end = DOC.indexOf(END)
  expect(start, 'docs/iterate-template.md has no template start marker').toBeGreaterThan(-1)
  expect(end, 'docs/iterate-template.md has no template end marker').toBeGreaterThan(start)
  return DOC.slice(start + START.length, end).replace(/^\n/, '').replace(/\n+$/, '')
}

describe('the shipped self-iteration template', () => {
  it('is the docs template, byte for byte', () => {
    expect(templateFromDoc()).toBe(DEFAULT_ITERATE_TEMPLATE)
  })

  it('fits the 4000-character cap the schema and the switch both enforce', () => {
    expect(DEFAULT_ITERATE_TEMPLATE.length).toBeGreaterThan(0)
    expect(DEFAULT_ITERATE_TEMPLATE.length).toBeLessThanOrEqual(MAX_LOOP_PROMPT_CHARS)
  })

  it('names both topic sources, POOL first', () => {
    const pool = DEFAULT_ITERATE_TEMPLATE.indexOf('POOL first')
    const todo = DEFAULT_ITERATE_TEMPLATE.indexOf('TODO')
    const github = DEFAULT_ITERATE_TEMPLATE.indexOf('GitHub')
    const papers = DEFAULT_ITERATE_TEMPLATE.indexOf('papers')
    expect(pool, 'the template must name POOL-first selection').toBeGreaterThan(-1)
    expect(todo, 'TODO/failure rows are the second source').toBeGreaterThan(pool)
    expect(github, 'GitHub issues are the third source').toBeGreaterThan(todo)
    expect(papers, 'research notes/papers are the last source').toBeGreaterThan(github)
  })

  it('requires at least one item per round', () => {
    expect(DEFAULT_ITERATE_TEMPLATE).toMatch(/At least one item lands per round/)
  })

  it('separates a small fix from a big change, and forbids invented sources', () => {
    expect(DEFAULT_ITERATE_TEMPLATE).toMatch(/Small fix/)
    expect(DEFAULT_ITERATE_TEMPLATE).toMatch(/Big change/)
    expect(DEFAULT_ITERATE_TEMPLATE).toMatch(/RESEARCH/)
    // A big change needs the pool's approval before it is this round's work.
    expect(DEFAULT_ITERATE_TEMPLATE).toMatch(/approved in `\.rsi\/POOL\.md`/)
    expect(DEFAULT_ITERATE_TEMPLATE).toMatch(/Never cite a paper/)
    expect(DEFAULT_ITERATE_TEMPLATE).toMatch(/invented references/i)
  })

  it('names R1–R6 and the triple review, live check included', () => {
    expect(DEFAULT_ITERATE_TEMPLATE).toMatch(/^R1 /m)
    expect(DEFAULT_ITERATE_TEMPLATE).toMatch(/^R6 /m)
    expect(DEFAULT_ITERATE_TEMPLATE).toMatch(/npm run ci/)
    expect(DEFAULT_ITERATE_TEMPLATE).toMatch(/npm run verify:lib/)
    expect(DEFAULT_ITERATE_TEMPLATE).toMatch(/copied profile/)
    expect(DEFAULT_ITERATE_TEMPLATE).toMatch(/NOT_RUN/)
  })

  it('carries four brakes and the forbidden zones', () => {
    const from = DEFAULT_ITERATE_TEMPLATE.indexOf('## Four brakes')
    const to = DEFAULT_ITERATE_TEMPLATE.indexOf('## Forbidden zones')
    expect(from, 'the brakes section must exist').toBeGreaterThan(-1)
    expect(to, 'the forbidden-zones section must follow the brakes').toBeGreaterThan(from)
    const brakes = DEFAULT_ITERATE_TEMPLATE.slice(from, to)
    expect(brakes.split('\n').filter(line => /^\d\. /.test(line))).toHaveLength(4)
    expect(DEFAULT_ITERATE_TEMPLATE).toMatch(/## Forbidden zones/)
    expect(DEFAULT_ITERATE_TEMPLATE).toMatch(/force-push/)
    expect(DEFAULT_ITERATE_TEMPLATE).toMatch(/DSH core repository/)
    expect(DEFAULT_ITERATE_TEMPLATE).toMatch(/No npm publish/)
  })
})
