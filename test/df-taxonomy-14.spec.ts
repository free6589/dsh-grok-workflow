import { describe, expect, it } from 'vitest'
import { childFailureClass, classifyChildFailureText } from '../src/child-outcomes.js'

/**
 * D/F 入库钉子 (fix/df-taxonomy-14, CONFIRMED 建议入库):
 * - (D) 含 "sensitive" 的文本当前落到 unknown，保持 unknown 入库。
 * - (F) 503 无账号类文本归 server-error 入库。
 * 只锁定映射，不改 src 行为。
 */
describe('D/F taxonomy pins (df-taxonomy-14)', () => {
  it('(D) sensitive 文本落到 unknown', () => {
    expect(classifyChildFailureText('content filtered: sensitive content was blocked')).toBe('unknown')
  })

  it('(D) sensitive 经 childFailureClass 落到 unknown', () => {
    expect(childFailureClass({ stopReason: 'error', diagnostic: 'the request was refused: content filtered sensitive' })).toBe('unknown')
  })

  it('(F) 503 无账号文本归 server-error', () => {
    expect(classifyChildFailureText('503 service unavailable')).toBe('server-error')
    expect(classifyChildFailureText('503 Service Unavailable: no available account')).toBe('server-error')
  })

  it('(F) 503 经 childFailureClass 归 server-error', () => {
    expect(childFailureClass({ stopReason: 'error', diagnostic: '503 service unavailable' })).toBe('server-error')
    expect(childFailureClass({ stopReason: 'error', diagnostic: 'no available account: 503 service unavailable' })).toBe('server-error')
  })
})
