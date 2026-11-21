import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

/**
 * `scripts/clone-profile.mjs` contract.
 *
 * The script exists because `cp -a` produces a profile that looks cloned and is not: a
 * pnpm profile stores `link:` dependencies relative to the profile directory, so the copy
 * has dangling symlinks and `dsh plugin --profile <clone> list` aborts. It also copies
 * whatever literal API keys the live `cordis.patch.yml` holds.
 *
 * These tests run the real script against a synthetic profile, so the assertions cover the
 * actual file operations. Nothing here needs a model, a network, or a DSH installation.
 */

const script = new URL('../scripts/clone-profile.mjs', import.meta.url).pathname

interface Report {
  ok: boolean
  failures: string[]
  links: { path: string; sourceResolves: boolean; repaired: boolean; resolvesAfterRepair: boolean }[]
  parity: { file: string; equal: boolean }[]
  redactions: { file: string; lines: number[]; patterns: string[]; redacted: boolean }[]
  declared: { dependencies: number; unresolved: string[] }
  secretHits: number
}

const secretValue = 'sk-FIXTURE-not-a-live-credential'
let roots: string[] = []

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
  roots = []
})

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'clone-profile-spec-'))
  roots.push(root)
  return root
}

/**
 * A source profile with one relocate-broken link, one link that is already broken in the
 * source, one ordinary dependency, and a literal credential in the patch layer.
 */
function makeSourceProfile(root: string): string {
  const sharedDir = join(root, 'shared', 'dep-a')
  mkdirSync(sharedDir, { recursive: true })
  writeFileSync(join(sharedDir, 'package.json'), '{"name":"dep-a","version":"1.0.0"}')

  // NOTE: `home-two` must sit at a different depth from `home-one`, otherwise the
  // relinked path coincides with the source path and the "repaired" assertion below
  // cannot distinguish them (they would be the same relative string).
  const sourceDir = join(root, 'home-one', 'deep', 'profiles', 'src')
  mkdirSync(join(sourceDir, 'node_modules', 'dep-b'), { recursive: true })
  writeFileSync(
    join(sourceDir, 'package.json'),
    JSON.stringify(
      {
        name: 'dsh-profile-src',
        private: true,
        dependencies: { 'dep-a': 'link:../../../../shared/dep-a', 'dep-b': '^1.0.0' },
        dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
      },
      null,
      2,
    ),
  )
  writeFileSync(join(sourceDir, 'cordis.yml'), '[]\n')
  writeFileSync(
    join(sourceDir, 'cordis.patch.yml'),
    ['# channel secrets', 'channels:', '  f227eec9:', `    secret: ${secretValue}`, '    promptModel: x', ''].join('\n'),
  )
  writeFileSync(join(sourceDir, 'node_modules', 'dep-b', 'package.json'), '{"name":"dep-b","version":"1.0.0"}')

  const nodeModules = join(sourceDir, 'node_modules')
  // resolves from the source profile, cannot resolve from a clone at another depth
  symlinkSync(relative(nodeModules, sharedDir), join(nodeModules, 'dep-a'))
  // already dangling in the source: inheriting it must not count as a clone defect
  mkdirSync(join(nodeModules, '.bin'), { recursive: true })
  symlinkSync('../dep-missing/scripts/tool.mjs', join(nodeModules, '.bin', 'tool'))

  return sourceDir
}

function runClone(args: string[]): { status: number; stdout: string; stderr: string; report: Report | null } {
  const reportPath = join(args[args.indexOf('--report') + 1] as string)
  let status = 0
  let stdout = ''
  let stderr = ''
  try {
    stdout = execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string }
    status = failure.status ?? 1
    stdout = failure.stdout ?? ''
    stderr = failure.stderr ?? ''
  }
  const report = existsSync(reportPath) ? (JSON.parse(readFileSync(reportPath, 'utf8')) as Report) : null
  return { status, stdout, stderr, report }
}

describe('clone-profile script', () => {
  it('clones a profile into a new home, relinks relocated dependencies, and keeps parity', () => {
    const root = makeRoot()
    const sourceDir = makeSourceProfile(root)
    const targetHome = join(root, 'home-two')
    const reportPath = join(root, 'report.json')

    const result = runClone(['--src', sourceDir, '--home', targetHome, '--name', 'dst', '--report', reportPath])

    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(result.report?.ok).toBe(true)
    const targetDir = join(targetHome, 'profiles', 'dst')
    expect(existsSync(join(targetDir, 'package.json'))).toBe(true)
    // the relocated link now resolves against the clone's own depth
    expect(existsSync(join(targetDir, 'node_modules', 'dep-a', 'package.json'))).toBe(true)
    expect(readlinkSync(join(targetDir, 'node_modules', 'dep-a'))).not.toBe(relative(join(sourceDir, 'node_modules'), join(root, 'shared', 'dep-a')))
    expect(result.report?.links.filter((link) => link.repaired).map((link) => link.path)).toEqual(['node_modules/dep-a'])
    expect(result.report?.parity.every((entry) => entry.equal)).toBe(true)
    expect(result.report?.declared.unresolved).toEqual([])
  })

  it('redacts credential-shaped values and never writes them into the report', () => {
    const root = makeRoot()
    const sourceDir = makeSourceProfile(root)
    const reportPath = join(root, 'report.json')

    const result = runClone(['--src', sourceDir, '--home', join(root, 'home-two'), '--name', 'dst', '--report', reportPath])

    expect(result.status).toBe(0)
    const clonedPatch = readFileSync(join(root, 'home-two', 'profiles', 'dst', 'cordis.patch.yml'), 'utf8')
    expect(clonedPatch).not.toContain(secretValue)
    expect(clonedPatch).toContain('secret: sk-REDACTED-BY-CLONE-PROFILE')
    expect(clonedPatch).toContain('promptModel: x')
    expect(JSON.stringify(result.report)).not.toContain(secretValue)
    expect(result.report?.redactions).toEqual([
      { file: 'cordis.patch.yml', lines: [4], patterns: ['openai-style-key'], redacted: true },
    ])
    expect(result.report?.secretHits).toBe(1)
    expect(result.stdout).not.toContain(secretValue)
  })

  it('refuses to replace an existing profile without --force', () => {
    const root = makeRoot()
    const sourceDir = makeSourceProfile(root)
    const targetHome = join(root, 'home-two')

    expect(runClone(['--src', sourceDir, '--home', targetHome, '--name', 'dst']).status).toBe(0)
    const second = runClone(['--src', sourceDir, '--home', targetHome, '--name', 'dst'])

    expect(second.status).toBe(2)
    expect(second.stderr).toContain('already exists')
    expect(runClone(['--src', sourceDir, '--home', targetHome, '--name', 'dst', '--force']).status).toBe(0)
  })

  it('fails closed when asked to keep credential-shaped values', () => {
    const root = makeRoot()
    const sourceDir = makeSourceProfile(root)
    const reportPath = join(root, 'report-keep-secrets.json')

    const result = runClone(['--src', sourceDir, '--home', join(root, 'home-two'), '--name', 'dst', '--keep-secrets', '--report', reportPath])

    expect(result.status).toBe(1)
    expect(result.report?.ok).toBe(false)
    expect(result.report?.failures.join(' ')).toContain('cordis.patch.yml')
    expect(result.report?.redactions[0]?.redacted).toBe(false)
  })

  it('treats a link that is already dangling in the source as inherited, not as clone damage', () => {
    const root = makeRoot()
    const sourceDir = makeSourceProfile(root)
    const reportPath = join(root, 'report-inherited.json')

    const result = runClone(['--src', sourceDir, '--home', join(root, 'home-two'), '--name', 'dst', '--report', reportPath])

    expect(result.status).toBe(0)
    const inherited = result.report?.links.find((link) => link.path === 'node_modules/.bin/tool')
    expect(inherited?.sourceResolves).toBe(false)
    expect(inherited?.repaired).toBe(false)
    expect(result.report?.links.some((link) => link.sourceResolves && !link.resolvesAfterRepair)).toBe(false)
  })

  it('rejects a source directory that is not a profile', () => {
    const root = makeRoot()
    mkdirSync(join(root, 'not-a-profile'), { recursive: true })

    const result = runClone(['--src', join(root, 'not-a-profile'), '--home', join(root, 'home-two'), '--name', 'dst', '--report', join(root, 'report.json')])

    expect(result.status).toBe(2)
    expect(result.stderr).toContain('not a DSH profile')
    expect(existsSync(join(root, 'home-two', 'profiles', 'dst'))).toBe(false)
  })
})
