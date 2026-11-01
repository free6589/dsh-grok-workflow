import { describe, expect, it, vi } from 'vitest'
import { Session, appendPluginRecord, pluginRecordOf } from '@deepseek-ai/dsh-session'
import { MODE_RECORD, isModeEnabled, isModeRecord, readModeRecord, setMode } from '../src/mode.js'
import type { ModeRecord } from '../src/mode.js'

function modeRecord(enabled: boolean, turn = 1, setBy = 'command:/grok'): ModeRecord {
  return { v: 1, enabled, turn, setBy }
}

/** Collecting logger stub, shaped like the `warn` surface `setMode` accepts. */
function warningLogger(): { messages: string[], logger: { warn: (message: string) => void } } {
  const messages: string[] = []
  return { messages, logger: { warn: (message: string) => { messages.push(message) } } }
}

describe('readModeRecord', () => {
  it('returns undefined when nothing is recorded or no session exists', () => {
    expect(readModeRecord(undefined)).toBeUndefined()
    expect(readModeRecord(Session.create('sess-mode-empty' as never))).toBeUndefined()
    const bare = { ownEvents: () => [] } as unknown as Session
    expect(readModeRecord(bare)).toBeUndefined()
  })

  it('whole-value-replace: the last write wins (on then off)', () => {
    const session = Session.create('sess-mode-on-off' as never)
    setMode(session, modeRecord(true, 1, 'command:/grok'))
    setMode(session, modeRecord(false, 2, 'command:/grok off'))
    const current = readModeRecord(session)
    expect(current).toEqual({ v: 1, enabled: false, turn: 2, setBy: 'command:/grok off' })
  })

  it('whole-value-replace: the last write wins (off then on)', () => {
    const session = Session.create('sess-mode-off-on' as never)
    setMode(session, modeRecord(false, 1, 'config:default'))
    setMode(session, modeRecord(true, 2, 'command:/grok'))
    expect(readModeRecord(session)).toEqual(modeRecord(true, 2, 'command:/grok'))
  })

  it('ignores records a revalidation rejects and keeps the last valid one', () => {
    const session = Session.create('sess-mode-malformed' as never)
    setMode(session, modeRecord(false, 3, 'command:/grok off'))
    // What an older or broken build might have left in the log: each shape must
    // be skipped instead of clobbering the last valid record.
    const malformed: unknown[] = [
      { v: 2, enabled: true, turn: 4, setBy: 'command:/grok' },
      { v: 0, enabled: true, turn: 4, setBy: 'command:/grok' },
      { v: 1, enabled: 'yes', turn: 4, setBy: 'command:/grok' },
      { v: 1, enabled: true, turn: '4', setBy: 'command:/grok' },
      { v: 1, enabled: true, turn: null, setBy: 'command:/grok' },
      { v: 1, enabled: true, turn: 4, setBy: 7 },
      { v: 1, enabled: true, turn: 4 },
      'not a record',
      null,
    ]
    for (const data of malformed) appendPluginRecordUnchecked(session, data)
    const current = readModeRecord(session)
    expect(current).toEqual(modeRecord(false, 3, 'command:/grok off'))
    expect(current?.turn).toBe(3)
  })

  it('returns undefined when only malformed records exist', () => {
    const session = Session.create('sess-mode-only-bad' as never)
    appendPluginRecordUnchecked(session, { v: 2, enabled: true, turn: 1, setBy: 'command:/grok' })
    expect(readModeRecord(session)).toBeUndefined()
  })
})

describe('isModeRecord', () => {
  it('accepts a well-formed record', () => {
    expect(isModeRecord(modeRecord(true))).toBe(true)
  })

  it('rejects every malformed shape', () => {
    const rejected: unknown[] = [
      undefined,
      null,
      'grok',
      42,
      { v: 0, enabled: true, turn: 1, setBy: 'x' },
      { v: '1', enabled: true, turn: 1, setBy: 'x' },
      { v: 1, enabled: 'yes', turn: 1, setBy: 'x' },
      { v: 1, turn: 1, setBy: 'x' },
      { v: 1, enabled: true, turn: Number.NaN, setBy: 'x' },
      { v: 1, enabled: true, turn: Number.POSITIVE_INFINITY, setBy: 'x' },
      { v: 1, enabled: true, turn: '1', setBy: 'x' },
      { v: 1, enabled: true, turn: 1, setBy: 7 },
      { v: 1, enabled: true, turn: 1 },
    ]
    for (const value of rejected) expect(isModeRecord(value)).toBe(false)
  })
})

describe('workflowMode', () => {
  it('accepts absent, full and triage, and rejects any other value', () => {
    expect(isModeRecord(modeRecord(true))).toBe(true)
    expect(isModeRecord({ ...modeRecord(true), workflowMode: 'full' })).toBe(true)
    expect(isModeRecord({ ...modeRecord(true), workflowMode: 'triage' })).toBe(true)
    expect(isModeRecord({ ...modeRecord(true), workflowMode: 'front-desk' })).toBe(false)
    expect(isModeRecord({ ...modeRecord(true), workflowMode: null })).toBe(false)
  })

  it('reads back the shape a command wrote', () => {
    const session = Session.create('sess-mode-shape' as never)
    setMode(session, { v: 1, enabled: true, turn: 1, setBy: 'command:/grok', workflowMode: 'full' })
    expect(readModeRecord(session)?.workflowMode).toBe('full')
  })
})

describe('isModeEnabled', () => {
  it('returns the fallback when nothing is recorded', () => {
    const session = Session.create('sess-mode-fallback' as never)
    expect(isModeEnabled(session, true)).toBe(true)
    expect(isModeEnabled(session)).toBe(false)
    expect(isModeEnabled(undefined, true)).toBe(true)
  })

  it('returns the recorded value once one exists', () => {
    const on = Session.create('sess-mode-on' as never)
    setMode(on, modeRecord(true, 1, 'command:/grok'))
    expect(isModeEnabled(on, false)).toBe(true)
    const off = Session.create('sess-mode-off' as never)
    setMode(off, modeRecord(false, 1, 'config:default'))
    expect(isModeEnabled(off, true)).toBe(false)
  })
})

describe('setMode', () => {
  it('commits one durable plugin record the readers can revalidate', () => {
    const session = Session.create('sess-mode-commit' as never)
    setMode(session, modeRecord(true, 1, 'command:/grok'))
    const committed = session.ownEvents()
      .map(event => pluginRecordOf(event))
      .filter(record => record !== undefined && record.type === MODE_RECORD)
      .map(record => record!.data)
    expect(committed).toHaveLength(1)
    expect(isModeRecord(committed[0])).toBe(true)
  })

  it('warns and continues when the session refuses the record', () => {
    const broken = {
      ownEvents: () => [],
      append() {
        throw new Error('read-only session')
      },
    } as unknown as Session
    const { messages, logger } = warningLogger()
    expect(() => setMode(broken, modeRecord(true, 1, 'command:/grok'), logger)).not.toThrow()
    expect(messages.some(message => message.includes('mode record not persisted'))).toBe(true)
    expect(messages.some(message => message.includes('command:/grok'))).toBe(true)
  })

  it('never throws when the logger itself is absent or minimal', () => {
    const broken = {
      ownEvents: () => [],
      append() {
        throw new Error('read-only session')
      },
    } as unknown as Session
    expect(() => setMode(broken, modeRecord(true))).not.toThrow()
    expect(() => setMode(broken, modeRecord(true), {})).not.toThrow()
  })

  it('returns silently when the session is unavailable or cannot append', () => {
    const warn = vi.fn()
    expect(() => setMode(undefined, modeRecord(true), { warn })).not.toThrow()
    const bare = { ownEvents: () => [] } as unknown as Session
    expect(() => setMode(bare, modeRecord(true), { warn })).not.toThrow()
    expect(warn).not.toHaveBeenCalled()
  })
})

/** Commit arbitrary JSON under the mode record type, as an older build might have. */
function appendPluginRecordUnchecked(session: Session, data: unknown): void {
  appendPluginRecord(session, MODE_RECORD, data as ModeRecord)
}
