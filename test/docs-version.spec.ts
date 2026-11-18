import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Docs/version truth guard (RSI round 1).
 *
 * The README install instructions and the "published" tag list are how a user
 * decides which version to install. They drifted silently once already: the
 * package was at 0.11.0 while both READMEs still advertised `0.8.0` as "the
 * current release" and listed published tags only up to `v0.8.0`. Nothing in CI
 * noticed, because no test ever compared the prose with `package.json`.
 *
 * These assertions make the README claims a checked contract:
 * - the declared package version in both languages equals `package.json`;
 * - every `plugin add ...#vX.Y.Z` example pins the current release;
 * - the published tag list is strictly ascending, duplicate-free, and ends at
 *   the current release.
 */

const repoFile = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')

const pkg = JSON.parse(repoFile('package.json')) as { version: string }
const version = pkg.version
const tag = `v${version}`

const readmeEn = repoFile('README.md')
const readmeZh = repoFile('README.zh-CN.md')
const changelog = repoFile('CHANGELOG.md')

function declaredVersion(readme: string, pattern: RegExp): string {
  const match = readme.match(pattern)
  expect(match, `declared-version sentence missing for ${pattern}`).not.toBeNull()
  return (match as RegExpMatchArray)[1] ?? ''
}

function publishedTags(readme: string, from: string, to: string): string[] {
  const start = readme.indexOf(from)
  expect(start, `published-list sentence start ${from} missing`).toBeGreaterThan(-1)
  const end = readme.indexOf(to, start)
  expect(end, `published-list sentence end ${to} missing`).toBeGreaterThan(start)
  return [...readme.slice(start, end).matchAll(/`(v\d+\.\d+\.\d+)`/g)].map((m) => m[1] as string)
}

const numeric = (version: string) => version.replace(/^v/, '')

const compareVersions = (a: string, b: string): number => {
  const left = numeric(a).split('.').map(Number)
  const right = numeric(b).split('.').map(Number)
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return (left[index] as number) - (right[index] as number)
  }
  return 0
}

describe('README version claims match package.json', () => {
  it('states the current package version in English', () => {
    expect(declaredVersion(readmeEn, /The package version in this repository is `([^`]+)`/)).toBe(version)
  })

  it('states the current package version in Simplified Chinese', () => {
    expect(declaredVersion(readmeZh, /本仓库声明的包版本是 `([^`]+)`/)).toBe(version)
  })

  it('pins every install example to the current release tag', () => {
    for (const readme of [readmeEn, readmeZh]) {
      const pins = [...readme.matchAll(/dsh-grok-workflow#(v\d+\.\d+\.\d+)/g)].map((m) => m[1] as string)
      expect(pins.length).toBeGreaterThanOrEqual(2)
      expect(new Set(pins)).toEqual(new Set([tag]))
    }
  })

  it('names only the current release when a tag is spelled out in prose', () => {
    for (const readme of [readmeEn, readmeZh]) {
      const bare = [...readme.matchAll(/`#(v\d+\.\d+\.\d+)`/g)].map((m) => m[1] as string)
      expect(bare.length).toBeGreaterThanOrEqual(1)
      expect(new Set(bare)).toEqual(new Set([tag]))
    }
  })

  it('lists published tags in ascending order ending at the current release', () => {
    for (const tags of [
      publishedTags(readmeEn, 'Published:', 'The unpinned command'),
      publishedTags(readmeZh, '已发布：', '未固定版本的命令'),
    ]) {
      expect(tags.length).toBeGreaterThan(10)
      expect(new Set(tags).size).toBe(tags.length)
      const ascending = [...tags].sort(compareVersions)
      expect(tags).toEqual(ascending)
      expect(tags.at(-1)).toBe(tag)
    }
  })

  it('names the one prerelease tag that is not a release', () => {
    // Round 7 compared all 32 remote tags against the release rules: 31 are release tags
    // whose commit's package.json matches the tag, and v0.2.0-rc.1 predates the release
    // workflow (tagged on a 0.1.0 commit). It cannot be moved, so it is documented
    // instead — and the documentation is not allowed to disappear silently.
    // Evidence: .rsi/evidence/round-007/audit.txt
    for (const readme of [readmeEn, readmeZh]) expect(readme).toContain('v0.2.0-rc.1')
  })

  it('gives every published tag its own changelog section, newest first', () => {
    const sections = [...changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map((m) => m[1] as string)
    const published = publishedTags(readmeEn, 'Published:', 'The unpinned command').map(numeric)
    expect(published.length).toBeGreaterThan(10)
    for (const tag of published) expect(sections, `no changelog section for v${tag}`).toContain(tag)
    expect(sections).toEqual([...sections].sort((a, b) => compareVersions(b, a)))
  })

  it('opens the changelog with the version the package declares', () => {
    const newest = changelog.match(/^## \[(\d+\.\d+\.\d+)\]/m)
    expect(newest).not.toBeNull()
    expect((newest as RegExpMatchArray)[1]).toBe(version)
  })
})
