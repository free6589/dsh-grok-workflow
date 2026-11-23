import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  CAPTAIN_EXPERIENCE_FILE, CAPTAIN_MEMORY_LIMITS, CAPTAIN_PROFILE_FILE,
  appendCaptainExperience, captainBrief, captainMemoryFiles, readCaptainMemory, rememberCaptainProfile,
} from '../src/captain-memory.js'
import { runArchiveCli } from '../src/memory/cli.js'

/**
 * The captain's three sheets (round-071): the short-term progress ledger the plugin
 * already keeps, plus two new files beside it — the long-term user profile and one
 * retrospective line per round.
 *
 * The cases pin the four properties the design promises: beside the ledger, no
 * credentials, bounded when read, never fatal when written.
 */

let dir = ''
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'captain-memory-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('captain memory: three sheets beside the ledger', () => {
  it('puts the two new sheets in the ledgers own directory', () => {
    const files = captainMemoryFiles({ dir })
    expect(files.dir).toBe(dir)
    expect(files.profile).toBe(join(dir, CAPTAIN_PROFILE_FILE))
    expect(files.experience).toBe(join(dir, CAPTAIN_EXPERIENCE_FILE))
  })

  it('reads nothing as "no memory" instead of throwing', () => {
    const memory = readCaptainMemory({ dir: join(dir, 'missing') })
    expect(memory).toEqual({ profile: '', experience: '', progress: '' })
    expect(captainBrief(memory)).toBe('')
  })

  it('remembers a standing preference, redacted and idempotent', () => {
    expect(rememberCaptainProfile('用户习惯用中文回答，先给结论', { dir })).toBe(true)
    // Same words twice: one line, not two.
    expect(rememberCaptainProfile('用户习惯用中文回答，先给结论', { dir })).toBe(false)
    const written = readFileSync(join(dir, CAPTAIN_PROFILE_FILE), 'utf8')
    expect(written.trim().split('\n')).toHaveLength(1)
    expect(written).toContain('用户习惯用中文回答')
    // A credential-shaped value never reaches the sheet.
    expect(rememberCaptainProfile('api_key=sk-live-abcdef0123456789abcdef', { dir })).toBe(true)
    const after = readFileSync(join(dir, CAPTAIN_PROFILE_FILE), 'utf8')
    expect(after).not.toContain('sk-live-abcdef0123456789abcdef')
    expect(after).toMatch(/\[REDACTED/)
  })

  it('writes one retrospective per round and refuses a duplicate run id', () => {
    const input = {
      runId: 'run-42',
      status: 'partial',
      objective: 'refactor the timeout logic',
      summary: 'status partial · verified 1/2',
      evidence: ['a: checks pass', 'b: did not run'],
      now: () => Date.parse('2026-11-23T13:00:00Z'),
    }
    expect(appendCaptainExperience(input, { dir })).toBe(true)
    expect(appendCaptainExperience(input, { dir })).toBe(false)
    const lines = readFileSync(join(dir, CAPTAIN_EXPERIENCE_FILE), 'utf8').trim().split('\n')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('2026-11-23')
    expect(lines[0]).toContain('partial')
    expect(lines[0]).toContain('refactor the timeout logic')
    expect(lines[0]).toContain('evidence: 2')
    expect(lines[0]).toContain('[run:run-42]')
  })

  it('bounds every sheet when reading, keeping the newest lines', () => {
    writeFileSync(join(dir, CAPTAIN_PROFILE_FILE), `${'old line\n'.repeat(500)}newest preference\n`)
    writeFileSync(join(dir, CAPTAIN_EXPERIENCE_FILE), `${'old retro\n'.repeat(500)}newest retro\n`)
    const memory = readCaptainMemory({ dir })
    expect(memory.profile.length).toBeLessThanOrEqual(CAPTAIN_MEMORY_LIMITS.profileChars)
    expect(memory.experience.length).toBeLessThanOrEqual(CAPTAIN_MEMORY_LIMITS.experienceChars)
    expect(memory.profile).toContain('newest preference')
    expect(memory.experience).toContain('newest retro')
  })

  it('renders the three sheets as one labelled brief', () => {
    rememberCaptainProfile('用户要求先给结论', { dir })
    appendCaptainExperience({ runId: 'run-7', status: 'completed', summary: 'all verified' }, { dir })
    const brief = captainBrief(readCaptainMemory({ dir }))
    expect(brief).toContain('CAPTAIN MEMORY')
    expect(brief).toContain('USER PROFILE')
    expect(brief).toContain('EXPERIENCE')
    expect(brief.length).toBeLessThanOrEqual(CAPTAIN_MEMORY_LIMITS.briefChars)
  })
})

describe('captain memory CLI', () => {
  const run = (argv: string[]): { code: number, out: string[], err: string[] } => {
    const out: string[] = []
    const err: string[] = []
    const code = runArchiveCli(argv, { out: line => out.push(line), err: line => err.push(line) })
    return { code, out, err }
  }

  it('remembers a preference and reads it back', () => {
    expect(run(['profile', 'add', '用户喜欢先看结论', '--dir', dir]).code).toBe(0)
    const profile = run(['profile', '--dir', dir])
    expect(profile.code).toBe(0)
    expect(profile.out.join('\n')).toContain('用户喜欢先看结论')
    const captain = run(['captain', '--dir', dir])
    expect(captain.out.join('\n')).toContain('USER PROFILE')
  })

  it('refuses an empty profile entry with a usage error', () => {
    const result = run(['profile', 'add', '--dir', dir])
    expect(result.code).toBe(2)
    expect(result.err.join('\n')).toContain('usage')
  })
})
