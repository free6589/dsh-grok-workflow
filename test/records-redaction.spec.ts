import { describe, expect, it, vi } from 'vitest'
import { Session } from '@deepseek-ai/dsh-session'
import { appendUnloadNotice, recordDispose } from '../src/records.js'

/**
 * RSI round 12: warn-path redaction guard.
 *
 * `src/records.ts` logs `redactError(error)` on the two catch paths below.
 * These tests throw a fake secret through each path and assert the log line
 * carries the placeholder, never the secret. Benign errors keep their text
 * (guard against over-redaction).
 */

const SECRET = 'sk-abcdef0123456789abcdef'

/**
 * A real Session whose commit throws, so the record catch path runs.
 *
 * `openStep` opens a `step/start` first, before the commit spy is installed. The
 * assistant-row writers refuse to write outside an open step (an unpaired
 * `assistant/message` stalls compaction), so the append-error path is only
 * reachable from inside one.
 */
function failingSession(message: string, options: { openStep?: boolean } = {}): Session {
  const session = Session.create(`sess-redact-${Math.random().toString(36).slice(2)}` as never)
  if (options.openStep === true) session.append('step/start', { turn: 1, step: 0 })
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
      failingSession(`unload write failed: ${SECRET}`, { openStep: true }),
      'notice text',
      log as never,
    )
    expect(ok).toBe(false)
    // Two catch paths run: the refused assistant row, then the terminal record that
    // takes its place when the row cannot be written. Both must be redacted.
    const lines = log.messages()
    expect(lines).toHaveLength(2)
    for (const line of lines) expect(line).not.toContain(SECRET)
    expect(lines[0]).toContain('unload notice not written')
    expect(lines[1]).toContain('terminal record not persisted')
  })

  it('keeps benign error text readable (no over-redaction)', () => {
    const log = logger()
    recordDispose(failingSession('store gone: connection reset'), { at: 0 } as never, log as never)
    expect(log.messages()[0]).toContain('connection reset')
  })
})
