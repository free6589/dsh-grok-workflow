import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * `docs/ARCHITECTURE.md` describes what ships, and a doc that says "in this release" stops
 * meaning anything the moment the next release lands: the reader cannot tell whether the
 * sentence describes the version they installed or the one after it. Every status claim in
 * it therefore names a version (`since **X.Y.Z**`), and the DSH version it was measured on
 * is spelled out.
 *
 * These assertions are deliberately structural rather than prose-quality checks: they fail
 * on the shapes that rot (a relative phrase, a status line without a version), not on a
 * particular wording.
 */
const ARCHITECTURE = readFileSync(new URL('../docs/ARCHITECTURE.md', import.meta.url), 'utf8')
const PACKAGE = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }

/** Phrases that only mean something relative to a release nobody can identify. */
const RELATIVE_PHRASES = [
  /\bin this release\b/i,
  /\bcurrent version\b/i,
  /\bthis version ships\b/i,
  /当前版本/,
  /本版本/,
]

describe('docs/ARCHITECTURE.md: version statuses name a version', () => {
  it('uses no release-relative phrase that cannot be resolved to a version', () => {
    const hits: string[] = []
    const lines = ARCHITECTURE.split(/\r?\n/)
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? ''
      for (const pattern of RELATIVE_PHRASES) {
        if (pattern.test(line)) hits.push(`${index + 1}: ${line.trim()}`)
      }
    }
    expect(hits).toEqual([])
  })

  it('gives every `Status (` claim a `since **X.Y.Z**` version that is not in the future', () => {
    const statusLines = ARCHITECTURE.split(/\r?\n/).filter((line) => line.startsWith('Status ('))
    expect(statusLines.length).toBeGreaterThan(0)
    const parse = (tag: string) => tag.split('.').map((part) => Number.parseInt(part, 10))
    const current = parse(PACKAGE.version)
    for (const line of statusLines) {
      const match = /since \*\*(\d+)\.(\d+)\.(\d+)\*\*/.exec(line)
      expect(match, line).not.toBeNull()
      const declared = [Number(match![1]), Number(match![2]), Number(match![3])]
      for (let index = 0; index < 3; index += 1) {
        if (declared[index] === current[index]) continue
        // A `since` version may lag the package; it may never lead it.
        expect(declared[index]!, line).toBeLessThan(current[index]!)
        break
      }
    }
  })

  it('names the DSH version the resume boundary was measured on, and what was only re-checked elsewhere', () => {
    // The claim is one paragraph, wrapped over several lines: read it as a paragraph, not
    // as its first line, or the assertion would pass on a truncated sentence.
    const lines = ARCHITECTURE.split(/\r?\n/)
    const start = lines.findIndex((line) => line.startsWith('Boundary (D-013'))
    expect(start).toBeGreaterThanOrEqual(0)
    const paragraph: string[] = []
    for (let index = start; index < lines.length; index += 1) {
      const line = lines[index] ?? ''
      if (line.trim() === '') break
      paragraph.push(line)
    }
    const boundary = paragraph.join(' ')
    expect(boundary).toMatch(/DSH \*\*0\.2\.\d+(?:-rc\.\d+)?\*\*/)
    // The activation re-check is a different measurement than the journaling boundary, and
    // the sentence has to keep saying so instead of quietly upgrading the claim.
    expect(boundary).toMatch(/0\.2\.2-rc\.3/)
    expect(boundary).toMatch(/did \*not\* re-measure/)
  })
})
