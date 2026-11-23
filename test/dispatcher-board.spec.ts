/**
 * Round-57: DispatcherSession on the TaskBoard store (via boardReader).
 *
 * Three cases only: creates land in `store.jsonl` (never `board.json`) and
 * survive a reload; missing ids read as `undefined` through the adapter;
 * a mark-blocked reason survives a reload via the board `detail`.
 * All fixtures are fake (t1/t9/ghost/agent-a); tmp dirs only.
 */
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  DispatcherSession,
  createDispatcherSession,
  handleDispatcherIntent,
  resumeDispatcherBoard,
} from '../src/dispatcher/dispatcher.js'
import { openTaskboard } from '../src/taskboard/index.js'

let scratch: string

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'dispatcher-board-'))
})

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true })
})

describe('DispatcherSession on the TaskBoard store', () => {
  it('persists creates to store.jsonl (never board.json) and reloads them', async () => {
    const dir = join(scratch, 'persist')
    const session = createDispatcherSession(dir)
    const created = await handleDispatcherIntent(session, {
      op: 'create',
      id: 't1',
      title: 'Fake persist me',
      owner: 'agent-a',
      objective: 'fake objective',
    })
    expect(created.ok).toBe(true)
    // The session overlay still shows the objective in this process.
    expect(session.get('t1')).toMatchObject({ id: 't1', objective: 'fake objective' })

    const files = await readdir(dir)
    expect(files).toContain('store.jsonl')
    expect(files).not.toContain('board.json')

    // The board itself is the truth: reopen it raw, the row is there.
    const raw = await openTaskboard(dir)
    expect(raw.get('t1')).toMatchObject({
      id: 't1',
      title: 'Fake persist me',
      status: 'pending',
      owner: 'agent-a',
    })

    // A second session resumes the same truth.
    const second = new DispatcherSession(dir)
    const resumed = await resumeDispatcherBoard(second)
    expect(resumed).toMatchObject({ restored: true, tasks: 1 })
    expect(second.get('t1')).toMatchObject({
      id: 't1',
      title: 'Fake persist me',
      status: 'pending',
      owner: 'agent-a',
    })
  })

  it('reads a missing id as undefined through the adapter', async () => {
    const session = createDispatcherSession(join(scratch, 'missing'))
    const created = await handleDispatcherIntent(session, {
      op: 'create',
      id: 't1',
      title: 'Fake present',
    })
    expect(created.ok).toBe(true)
    expect(session.has('ghost')).toBe(false)
    expect(session.get('ghost')).toBeUndefined()
  })

  it('keeps a mark-blocked reason across a reload via the board detail', async () => {
    const dir = join(scratch, 'blocked-reason')
    const session = createDispatcherSession(dir)
    expect((await handleDispatcherIntent(session, {
      op: 'create',
      id: 't9',
      title: 'Fake stuck',
    })).ok).toBe(true)
    const blocked = await handleDispatcherIntent(session, {
      op: 'mark-blocked',
      id: 't9',
      reason: 'fake waiting on store',
    })
    expect(blocked.ok).toBe(true)
    expect(session.get('t9')).toMatchObject({
      status: 'blocked',
      blockedReason: 'fake waiting on store',
    })

    const second = new DispatcherSession(dir)
    await resumeDispatcherBoard(second)
    expect(second.get('t9')).toMatchObject({
      status: 'blocked',
      blockedReason: 'fake waiting on store',
    })
  })
})
