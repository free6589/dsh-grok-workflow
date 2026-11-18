import { describe, expect, it, vi } from 'vitest'
import { Session } from '@deepseek-ai/dsh-session'
import { appendUnloadNotice, recordDelivery, recordDispose } from '../src/records.js'

/**
 * RSI round 12: warn-path redaction guard.
 *
 * `src/records.ts` logs `redactError(error)` on the three catch paths below.
 * These tests throw a fake secret through each path and assert the log line
 * carries the placeholder, never the secret. Benign errors keep their text
 * (guard against over-redaction).
 */

const SECRET = 'sk-abcdef0123456789abcdef'

/** A real Session whose commit throws, so the record catch path runs. */
function failingSession(message: string): Session {
  const session = Session.create(`sess-redact-${Math.random().toString(36).slice(2)}` as never)
  const commit = vi.spyOn(session as unknown as { commit: (...args: unknown[]) => unknown }, 'commit')
  commit.mockImplementation((): unknown => {
    throw new Error(message)
  })
  return session
}

function logger(): { warn: ReturnType<typeof vi.fn>, messages: () => string[] } {
  const warn = vi.fn()
  return { warn, messages: () => warn.mock.calls.map(call => String(call[0])) }
}

describe('records warn paths redact thrown secrets', () => {
  it('recordDelivery redacts a secret carried by the append error', () => {
    const log = logger()
    recordDelivery(
      failingSession(`append refused: ${SECRET}`),
      { v: 1, key: 'k', agentId: 'a', messageIds: ['m'], phase: 'started', turn: 1, outcome: 'x' } as never,
      log as never,
    )
    expect(log.warn).toHaveBeenCalledTimes(1)
    const line = log.messages()[0]!
    expect(line).not.toContain(SECRET)
    expect(line).toContain('delivery record not persisted')
  })

  it('recordDispose redacts a secret carried by the append error', () => {
    const log = logger()
    const ok = recordDispose(
      failingSession(`store down: ${SECRET}`),
      { at: 0 } as never,
      log as never,
    )
    expect(ok).toBe(false)
    expect(log.warn).toHaveBeenCalledTimes(1)
    const line = log.messages()[0]!
    expect(line).not.toContain(SECRET)
    expect(line).toContain('dispose record not persisted')
  })

  it('appendUnloadNotice redacts a secret carried by the append error', () => {
    const log = logger()
    const ok = appendUnloadNotice(
      failingSession(`unload write failed: ${SECRET}`),
      'notice text',
      log as never,
    )
    expect(ok).toBe(false)
    expect(log.warn).toHaveBeenCalledTimes(1)
    const line = log.messages()[0]!
    expect(line).not.toContain(SECRET)
    expect(line).toContain('unload notice not written')
  })

  it('keeps benign error text readable (no over-redaction)', () => {
    const log = logger()
    recordDispose(failingSession('store gone: connection reset'), { at: 0 } as never, log as never)
    expect(log.messages()[0]).toContain('connection reset')
  })
})
