/**
 * Session-poison guard: progress and Guardian facts must never poison the log.
 *
 * Context: two real sessions stopped opening because progress travelled as raw
 * `tool-workflow/*` session events (`ignorable != true` + unknown type = the
 * harness refuses the whole log). The fix moved all nine facts to the plugin
 * record channel (`plugin:grok-workflow/progress/*` via `appendPluginRecord`,
 * every event `ignorable: true`). Old sessions still carry the retired names,
 * so the fold normalizes them on read — but nothing may *write* them again.
 *
 * What this pins that the fold specs do not: the fold specs read types and
 * payloads and drop the envelope, so a regression to raw appends (same new
 * names, `ignorable` missing) would pass them and still poison sessions.
 */
import { describe, expect, it } from 'vitest'
import { Session } from '@deepseek-ai/dsh-session'
import type { Session as SessionType } from '@deepseek-ai/dsh-session'
import {
  PROGRESS_AGENT_END,
  PROGRESS_AGENT_START,
  PROGRESS_GUARDIAN_END,
  PROGRESS_GUARDIAN_FINDING,
  PROGRESS_GUARDIAN_START,
  PROGRESS_RUN_END,
  PROGRESS_RUN_START,
  PROGRESS_SUMMARY_FINAL,
  PROGRESS_SUMMARY_REJECTED,
  createWorkflowProgressRecorder,
} from '../src/records.js'
import { PROGRESS_EVENT_TYPES } from '../src/progress-tab.js'

/** The nine facts one run writes, in fold order. */
const NINE = [
  PROGRESS_RUN_START,
  PROGRESS_AGENT_START,
  PROGRESS_AGENT_END,
  PROGRESS_SUMMARY_FINAL,
  PROGRESS_SUMMARY_REJECTED,
  PROGRESS_GUARDIAN_START,
  PROGRESS_GUARDIAN_FINDING,
  PROGRESS_GUARDIAN_END,
  PROGRESS_RUN_END,
] as const

/** The retired channel: readable through the normalizer, writable nowhere. */
const RETIRED = [
  'tool-workflow/run-start',
  'tool-workflow/agent-start',
  'tool-workflow/agent-end',
  'tool-workflow/summary-final',
  'tool-workflow/summary-rejected',
  'tool-workflow/guardian-start',
  'tool-workflow/guardian-finding',
  'tool-workflow/guardian-end',
  'tool-workflow/run-end',
] as const

function envelopeOf(session: SessionType): { type: string, ignorable?: unknown }[] {
  return session.ownEvents() as unknown as { type: string, ignorable?: unknown }[]
}

/** Record one full run through the real recorder into a real session. */
function recordFullRun(session: SessionType): string[] {
  const warnings: string[] = []
  const recorder = createWorkflowProgressRecorder(session, {
    warn: (message: string) => { warnings.push(message) },
  })
  recorder.runStart({ id: 'r-poison', meta: { name: '毒性守卫' } })
  recorder.agentStart('r-poison', { seq: 1, label: '执行', phase: '任务 1 · 修', childId: 'c1' })
  recorder.agentEnd('r-poison', { seq: 1, outcome: 'completed' })
  recorder.summaryFinal('r-poison', 1)
  recorder.summaryRejected('r-poison', { drafts: 2, stage: 'check', reason: 'x' })
  recorder.runEnd('r-poison', 'completed')
  return warnings
}

describe('session-poison-events: progress writes never poison the log', () => {
  it('all nine lifecycle names live under the plugin record namespace', () => {
    for (const type of NINE) {
      expect(type.startsWith('plugin:grok-workflow/progress/')).toBe(true)
    }
    // The routing whitelist carries the same nine, entry for entry: an event
    // named only here is routed away before the fold ever sees it.
    expect([...PROGRESS_EVENT_TYPES]).toEqual([...NINE])
  })

  it('everything the recorder writes is ignorable (the poison property)', () => {
    const session = Session.create('sess-poison-guard' as never)
    const warnings = recordFullRun(session)
    expect(warnings).toEqual([])
    const events = envelopeOf(session)
    expect(events).toHaveLength(6)
    for (const event of events) {
      // Absent means required: a reader meeting this type without the marker
      // must refuse the session instead of skipping the event. `true` is what
      // keeps the two real sessions that stopped opening from recurring.
      expect(event.ignorable).toBe(true)
    }
  })

  it('the recorder never writes the retired tool-workflow lifecycle names', () => {
    const session = Session.create('sess-poison-guard-names' as never)
    recordFullRun(session)
    const types = envelopeOf(session).map(event => event.type)
    expect(types).toHaveLength(6)
    for (const type of types) {
      expect((RETIRED as readonly string[]).includes(type)).toBe(false)
    }
    for (const type of types) {
      expect((NINE as readonly string[]).includes(type)).toBe(true)
    }
  })
})
