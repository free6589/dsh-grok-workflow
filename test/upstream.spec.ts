import { describe, expect, it } from 'vitest'
import { WORKFLOW_SCRIPT } from '../src/script.js'
import {
  UPSTREAM_HEADER,
  UPSTREAM_LIMITS,
  upstreamDigest,
  upstreamDigestSource,
  type UpstreamEvidenceSource,
} from '../src/upstream.js'

/**
 * The upstream evidence block a dependent task receives (Wave 3, S3/S4).
 *
 * The rule under test is the narrow one: only a real artifact counts. A verified
 * upstream that produced nothing but a prose summary satisfies its own criteria
 * through the report's answer-only path, but it hands nothing downstream, so the
 * dependent is reported failed instead of being fed a self-report.
 */

function produced(id: string, overrides: Partial<UpstreamEvidenceSource> = {}): UpstreamEvidenceSource {
  return {
    id,
    summary: `did ${id}`,
    deliverables: [{ description: `output of ${id}`, locator: `file:///tmp/${id}` }],
    evidence: [{ claim: `implemented ${id}`, source: `src/${id}.ts` }],
    filesChanged: [`src/${id}.ts`],
    testsRun: [{ command: `vitest run test/${id}.spec.ts`, status: 'passed', detail: 'ok' }],
    ...overrides,
  }
}

const LIMITS = UPSTREAM_LIMITS

describe('upstreamDigest', () => {
  it('renders the declared order with summary, deliverable, evidence and command', () => {
    const digest = upstreamDigest([produced('a'), produced('b')], ['b', 'a'], LIMITS)
    expect(digest.missing).toEqual([])
    expect(digest.text.startsWith(UPSTREAM_HEADER)).toBe(true)
    const bAt = digest.text.indexOf('task b: did b')
    const aAt = digest.text.indexOf('task a: did a')
    expect(bAt).toBeGreaterThan(-1)
    expect(aAt).toBeGreaterThan(bAt)
    expect(digest.text).toContain('deliverable: output of a -- file:///tmp/a')
    expect(digest.text).toContain('evidence: implemented a -- src/a.ts')
    expect(digest.text).toContain('changed: src/a.ts')
    expect(digest.text).toContain('ran: vitest run test/a.spec.ts (passed)')
  })

  it('reports a summary-only upstream as missing and hands nothing over from it', () => {
    const bare: UpstreamEvidenceSource = {
      id: 'a',
      summary: 'The capital is Paris',
      deliverables: [],
      evidence: [],
      filesChanged: [],
      testsRun: [],
    }
    const digest = upstreamDigest([bare, produced('b')], ['a', 'b'], LIMITS)
    expect(digest.missing).toEqual(['a'])
    expect(digest.text).not.toContain('task a:')
    expect(digest.text).toContain('task b: did b')
  })

  it('reports a declared dependency with no entry at all as missing', () => {
    const digest = upstreamDigest([produced('a')], ['a', 'ghost'], LIMITS)
    expect(digest.missing).toEqual(['ghost'])
    expect(digest.text).toContain('task a: did a')
  })

  it('counts a not-run command as no artifact, so a self-report stays missing', () => {
    const digest = upstreamDigest([produced('a', {
      deliverables: [],
      evidence: [],
      filesChanged: [],
      testsRun: [{ command: 'npm test', status: 'not_run', detail: 'skipped' }],
    })], ['a'], LIMITS)
    expect(digest.missing).toEqual(['a'])
    expect(digest.text).toBe('')
  })

  it('is empty and harmless when the task declares no dependency', () => {
    expect(upstreamDigest([produced('a')], [], LIMITS)).toEqual({ text: '', missing: [] })
  })

  it('holds one dependency to the per-task budget', () => {
    const long = produced('a', { summary: 'x'.repeat(5000) })
    const digest = upstreamDigest([long], ['a'], LIMITS)
    // The per-task block plus the header line: the block itself is what is clipped.
    const block = digest.text.slice(UPSTREAM_HEADER.length + 1)
    expect(block.length).toBeLessThanOrEqual(LIMITS.perTaskChars)
    // The 5,000-character summary is not copied whole: it is clipped with the marker.
    expect(block).toContain('...')
    expect(block).toContain('task a: ')
  })

  it('holds the whole block to the total budget without dropping a dependency', () => {
    const entries = Array.from({ length: 8 }, (_, index) => produced(`t${index}`))
    const declared = entries.map(entry => entry.id)
    const digest = upstreamDigest(entries, declared, LIMITS)
    expect(digest.missing).toEqual([])
    expect(digest.text.length).toBeLessThanOrEqual(LIMITS.totalChars)
    for (const id of declared) expect(digest.text).toContain(`task ${id}:`)
  })
})

describe('upstreamDigestSource', () => {
  it('injects the same limits the host uses', () => {
    expect(WORKFLOW_SCRIPT).toContain(`const UPSTREAM_LIMITS = ${JSON.stringify(UPSTREAM_LIMITS)};`)
    expect(WORKFLOW_SCRIPT).toContain(`const UPSTREAM_HEADER = ${JSON.stringify(UPSTREAM_HEADER)};`)
    expect(WORKFLOW_SCRIPT).toContain(upstreamDigestSource())
  })
})