import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { criterionKey } from '../src/input.js'
import { WORKFLOW_SCRIPT } from '../src/script.js'

/**
 * Pull the workflow script's own criterionKey out of the generated source so the
 * host implementation and the in-sandbox mirror are tested against the same
 * corpus. The script cannot import host code, so the two implementations are
 * copies; this test is what keeps them from drifting.
 */
function scriptCriterionKey(): (value: string) => string {
  const start = WORKFLOW_SCRIPT.indexOf('function criterionKey(value) {')
  expect(start).toBeGreaterThan(-1)
  const end = WORKFLOW_SCRIPT.indexOf('\n}\n', start)
  expect(end).toBeGreaterThan(start)
  const source = WORKFLOW_SCRIPT.slice(start, end + 3)
  const context = vm.createContext({})
  return vm.runInContext(`(() => { ${source}; return criterionKey })()`, context) as (value: string) => string
}

/** Formatting differences a verifier legitimately introduces. */
const SAME_REQUIREMENT = [
  ['alpha works', 'alpha works.'],
  ['alpha works', 'Alpha Works'],
  ['alpha works', '  alpha   works  '],
  ['alpha works', 'alpha works\t'],
  ['alpha works', 'alpha\nworks'],
  ['alpha works', 'alpha works!'],
  ['alpha works', 'alpha works?'],
  ['alpha works', 'alpha works;'],
  ['alpha works', 'alpha works:'],
  ['alpha works', 'alpha works,'],
  ['alpha works', 'alpha works。'],
  ['alpha works', 'alpha works！'],
  ['alpha works', 'alpha works；'],
  ['alpha works', 'alpha works：'],
  ['alpha works', 'alpha works，'],
  ['the file has 3 lines', 'The File Has 3 Lines.'],
  ['测试通过', '测试通过。'],
  ['测试通过', ' 测试通过 '],
]

/** Different requirements that must never normalize to the same key. */
const DIFFERENT_REQUIREMENT = [
  ['alpha works', 'beta works'],
  ['the file exists', 'the file exists with content'],
  ['alpha works', 'alpha worked'],
  ['do x then y', 'do x, then y'],
  ['alpha works', ''],
  ['alpha works', 'alpha'],
]

describe('criterion comparison key', () => {
  it('ignores trailing punctuation, spacing, and case', () => {
    for (const [left, right] of SAME_REQUIREMENT) {
      expect(criterionKey(left!)).toBe(criterionKey(right!))
    }
  })

  it('keeps different requirements distinct', () => {
    for (const [left, right] of DIFFERENT_REQUIREMENT) {
      expect(criterionKey(left!)).not.toBe(criterionKey(right!))
    }
  })

  it('strips only trailing punctuation, never inner punctuation', () => {
    expect(criterionKey('do x, then y.')).toBe('do x, then y')
    expect(criterionKey('do x, then y')).toBe('do x, then y')
  })

  it('is idempotent and total over arbitrary strings', () => {
    for (const [left, right] of [...SAME_REQUIREMENT, ...DIFFERENT_REQUIREMENT]) {
      const once = criterionKey(left!)
      expect(criterionKey(once)).toBe(once)
      expect(typeof criterionKey(right!)).toBe('string')
    }
    expect(criterionKey('')).toBe('')
    expect(criterionKey('   ')).toBe('')
    expect(criterionKey('...')).toBe('')
  })

  it('matches the mirror compiled into the workflow script', () => {
    const inScript = scriptCriterionKey()
    const corpus = [
      ...SAME_REQUIREMENT.flat(),
      ...DIFFERENT_REQUIREMENT.flat(),
      '',
      '   ',
      '...',
      'MiXeD   Case\tText。',
      'one line\nsecond line!',
      'criterion with trailing spaces   ',
      'criterion-with-dashes_and_underscores.',
      'criterion (with parens)',
      'criterion with "quotes"',
      'criterion with 42 numbers',
    ]
    for (const value of corpus) {
      expect(inScript(value)).toBe(criterionKey(value))
    }
  })
})
