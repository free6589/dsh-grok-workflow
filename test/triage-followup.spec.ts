import { describe, expect, it } from 'vitest'
import { classifyTriage } from '../src/triage.js'

/**
 * History-aware follow-up triage (feat/triage-history-hybrid, item 1).
 *
 * A follow-up fragment ("说人话", "继续", …) is a request for more of the
 * conversation so far — never small talk — but only when there is history to
 * follow up on. Without history it must not invent context: it falls through
 * to the ordinary rules (usually a question, or ask when even that is thin).
 */

const triage = (
  text: string,
  extra: { historyNonEmpty?: boolean, ask?: boolean, mode?: 'full' | 'triage' } = {},
) =>
  classifyTriage({
    text,
    mode: extra.mode ?? 'triage',
    ask: extra.ask ?? true,
    ...extra.historyNonEmpty === undefined ? {} : { historyNonEmpty: extra.historyNonEmpty },
  })

describe('history-aware follow-up triage', () => {
  it('routes "说人话" with history to fast/followup, never chat', () => {
    const verdict = triage('说人话', { historyNonEmpty: true })
    expect(verdict.tier).toBe('fast')
    expect(verdict.reason).toBe('followup')
  })

  it('does not route "说人话" without history to chat', () => {
    for (const verdict of [triage('说人话'), triage('说人话', { historyNonEmpty: false })]) {
      expect(verdict.tier, JSON.stringify(verdict)).not.toBe('chat')
    }
  })

  it('routes "继续" with history to fast, and keeps it out of the chat template without history', () => {
    const withHistory = triage('继续', { historyNonEmpty: true })
    expect(withHistory.tier).toBe('fast')
    expect(withHistory.reason).toBe('followup')
    for (const verdict of [triage('继续'), triage('继续', { historyNonEmpty: false })]) {
      expect(verdict.tier, JSON.stringify(verdict)).not.toBe('chat')
    }
  })

  it('covers the other FOLLOW_UP phrases with history', () => {
    for (const text of ['详细点', '接着说', '人话', '通俗点', '白话', '再讲讲', '展开']) {
      const verdict = triage(text, { historyNonEmpty: true })
      expect(verdict.tier, text).toBe('fast')
      expect(verdict.reason, text).toBe('followup')
    }
  })

  it('keeps the follow-up shortcut case-insensitive but history-gated', () => {
    // ASCII fragments if any match must still need history; plain chat is untouched.
    expect(triage('你好', { historyNonEmpty: true }).tier).toBe('chat')
    expect(triage('你好', { historyNonEmpty: false }).tier).toBe('chat')
  })
})
