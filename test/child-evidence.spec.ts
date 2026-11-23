import { describe, expect, it } from 'vitest'
import { failureFact, sessionPosition, sessionVerdict } from '../src/child-evidence.js'
import { CHILD_CAUSE_UNKNOWN, childStopPhrase, failureClassForCode } from '../src/child-outcomes.js'

/**
 * The child's own log, as the runtime commits it.
 *
 * These cases are the shapes `@deepseek-ai/dsh-session` and
 * `@deepseek-ai/dsh-subagent` actually produce: a `turn/end` whose reason is the
 * provider's `LlmFailure` verbatim, and an `assistant/attempt` whose stream ends
 * in a `finish` chunk carrying the same facts. They are written out here rather
 * than derived from a fake so a reviewer can compare them with the runtime.
 */
function turnEnd(error: unknown, kind = 'error'): unknown {
  return { type: 'turn/end', seq: 3, data: { turn: 1, reason: { kind, error } } }
}

function attempt(failure: unknown, seq = 2): unknown {
  return {
    type: 'assistant/attempt',
    seq,
    data: {
      turn: 1,
      step: 1,
      stream: [
        { type: 'chunk', chunk: { type: 'usage', usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } } },
        { type: 'chunk', chunk: { type: 'finish', reason: { kind: 'error', failure } } },
      ],
    },
  }
}

/** A session object exposing the two reads the real one exposes. */
function session(events: readonly unknown[]): unknown {
  return {
    seq: events.length,
    snapshotEvents: (from = 0) => events.slice(Math.max(0, from)),
    ownEvents: () => events,
  }
}

const AUTH_FAILURE = { message: '401: {"message":"virtual key is required."}', code: 'AUTH', status: 401 }

describe('sessionVerdict', () => {
  it('reads the provider failure out of the committed turn closer', () => {
    const verdict = sessionVerdict(session([turnEnd(AUTH_FAILURE)]))
    expect(verdict?.stopReason).toBe('error')
    expect(verdict?.failure).toEqual({ message: AUTH_FAILURE.message, code: 'AUTH', status: 401 })
  })

  it('reads the failure out of the attempt when the turn never closed', () => {
    const verdict = sessionVerdict(session([attempt(AUTH_FAILURE)]))
    expect(verdict?.stopReason).toBe('error')
    expect(verdict?.failure?.code).toBe('AUTH')
  })

  it('prefers the last turn closer when the child ran more than one turn', () => {
    const verdict = sessionVerdict(session([
      turnEnd({ message: '429 Too Many Requests', code: 'RATE_LIMIT' }),
      { type: 'turn/start', seq: 4, data: { turn: 2 } },
      turnEnd(AUTH_FAILURE),
    ]))
    expect(verdict?.failure?.code).toBe('AUTH')
  })

  it('keeps a clean ending a clean ending', () => {
    const verdict = sessionVerdict(session([
      { type: 'turn/end', seq: 1, data: { turn: 1, reason: { kind: 'completed' } } },
    ]))
    expect(verdict?.stopReason).toBe('completed')
    expect(verdict?.failure).toBeUndefined()
  })

  it('reads a cancellation as a cancellation', () => {
    const verdict = sessionVerdict(session([
      { type: 'turn/end', seq: 1, data: { turn: 1, reason: { kind: 'aborted', reason: { kind: 'user' } } } },
    ]))
    expect(verdict?.stopReason).toBe('aborted')
  })

  it('takes the mark when it can, and falls back to the whole log when the window is empty', () => {
    const events = [turnEnd({ message: 'earlier failure', code: 'SERVER' }), { type: 'step/end', seq: 4, data: {} }]
    // The mark lands after the only turn closer, so the bounded window says nothing.
    // The fallback is deliberate: a child whose events all landed before the seam
    // could take its mark (a fake provider that answers inline, a resumed child)
    // would otherwise be reported as "cause unknown" with its cause in the log.
    expect(sessionVerdict(session(events), 2)?.failure?.message).toBe('earlier failure')
    // From the start, the same log answers the same thing.
    expect(sessionVerdict(session(events), 0)?.failure?.message).toBe('earlier failure')
    // An empty log answers nothing at all.
    expect(sessionVerdict(session([]), 0)).toBeUndefined()
  })

  it('answers nothing, and never throws, for shapes it cannot read', () => {
    expect(sessionVerdict(undefined)).toBeUndefined()
    expect(sessionVerdict(null)).toBeUndefined()
    expect(sessionVerdict({})).toBeUndefined()
    expect(sessionVerdict({ snapshotEvents: () => { throw new Error('detached') } })).toBeUndefined()
    expect(sessionVerdict({ ownEvents: 'not a function' })).toBeUndefined()
    expect(sessionVerdict(session([{ type: 'turn/end', seq: 1, data: { reason: { kind: 'error' } } }]))?.failure)
      .toBeUndefined()
    expect(sessionVerdict(session([{ type: 'assistant/attempt', seq: 1, data: { stream: 'nonsense' } }])))
      .toBeUndefined()
  })

  it('reports a session position only when the session has one', () => {
    expect(sessionPosition({ seq: 7 })).toBe(7)
    expect(sessionPosition({ seq: Number.NaN })).toBeUndefined()
    expect(sessionPosition(undefined)).toBeUndefined()
  })
})

describe('failureFact', () => {
  it('requires a message, and keeps the code and status when present', () => {
    expect(failureFact(undefined)).toBeUndefined()
    expect(failureFact({ code: 'AUTH' })).toBeUndefined()
    expect(failureFact({ message: 'boom' })).toEqual({ message: 'boom' })
    expect(failureFact(AUTH_FAILURE)).toEqual({ message: AUTH_FAILURE.message, code: 'AUTH', status: 401 })
  })
})

describe('the provider code decides the class before the words do', () => {
  it('maps the codes the runtime raises', () => {
    expect(failureClassForCode('AUTH')).toBe('model-unavailable')
    expect(failureClassForCode('MISSING_CREDENTIAL')).toBe('model-unavailable')
    expect(failureClassForCode('RATE_LIMIT')).toBe('rate-limit')
    expect(failureClassForCode('QUOTA')).toBe('rate-limit')
    expect(failureClassForCode('TIMEOUT')).toBe('timeout')
    expect(failureClassForCode('TRANSPORT')).toBe('connection')
    expect(failureClassForCode('SERVER')).toBe('server-error')
    expect(failureClassForCode('ABORTED')).toBe('cancelled')
  })

  it('maps an unclassified HTTP status the way a reader would', () => {
    expect(failureClassForCode('HTTP_401')).toBe('model-unavailable')
    expect(failureClassForCode('HTTP_403')).toBe('model-unavailable')
    expect(failureClassForCode('HTTP_429')).toBe('rate-limit')
    expect(failureClassForCode('HTTP_502')).toBe('server-error')
    expect(failureClassForCode('HTTP_504')).toBe('timeout')
    expect(failureClassForCode('HTTP_418')).toBeUndefined()
  })

  it('leaves a code it does not know to the message table', () => {
    expect(failureClassForCode(undefined)).toBeUndefined()
    expect(failureClassForCode('SOMETHING_NEW')).toBeUndefined()
  })
})

describe('a death with nothing recorded says so', () => {
  it('does not name a missing form', () => {
    const phrase = childStopPhrase({ stopReason: 'error' })
    expect(phrase).toBe(CHILD_CAUSE_UNKNOWN)
    expect(phrase).not.toContain('structured result')
  })

  it('names the provider words when the log carried them', () => {
    const phrase = childStopPhrase({ stopReason: 'error', diagnostic: AUTH_FAILURE.message, code: 'AUTH' })
    expect(phrase).toContain('virtual key is required')
    expect(phrase).not.toContain('structured result')
  })

  it('still names a timeout as a timeout', () => {
    expect(childStopPhrase({ stopReason: 'error', diagnostic: 'the child run timed out after 1200000 ms' }))
      .toContain('timed out')
  })
})
