import { describe, expect, it } from 'vitest'
import { WORKFLOW_SCRIPT } from '../src/script.js'
import { childFailureClass, classifyChildFailureText } from '../src/child-outcomes.js'

/**
 * H1 入库钉子 (fix/h1-virtualkey-16):
 * 裸 virtual-key 文本（无 401/403、无 AUTH 码）当前落到 unknown；
 * 钉死现状为 unknown。修法 NOT_RUN（需行为大改时停手 BLOCKED）。
 * 只锁定映射，不改 src 行为。
 */
function guestClassifier(): (value: unknown) => string {
  const start = WORKFLOW_SCRIPT.indexOf('function classifyFailureText(')
  expect(start).toBeGreaterThan(-1)
  const end = WORKFLOW_SCRIPT.indexOf('\n}\n', start)
  expect(end).toBeGreaterThan(start)
  const source = WORKFLOW_SCRIPT.slice(start, end + 2)
  // eslint-disable-next-line no-new-func -- the script itself is evaluated the same way.
  return new Function(`${source}\nreturn classifyFailureText`)() as (value: unknown) => string
}

describe('H1 virtual-key pins (h1-virtualkey-16)', () => {
  it('裸 virtual-key 文本落到 unknown（host）', () => {
    expect(classifyChildFailureText('virtual key is required.')).toBe('unknown')
  })

  it('裸 virtual-key 文本落到 unknown（guest）', () => {
    expect(guestClassifier()('virtual key is required.')).toBe('unknown')
  })

  it('裸 virtual-key 经 childFailureClass 落到 unknown', () => {
    expect(childFailureClass({ stopReason: 'error', diagnostic: 'virtual key is required.' })).toBe('unknown')
  })
})
