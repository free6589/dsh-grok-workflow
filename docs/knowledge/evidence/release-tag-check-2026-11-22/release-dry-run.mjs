#!/usr/bin/env node
// Read-only dry run of the checks `.github/workflows/release.yml` performs on a tag push.
//
// Nothing here creates a tag, pushes, packs to disk, or writes outside stdout:
// every check reads git objects (`git show <ref>:file`, `git ls-tree`) and the
// changelog text at the target revision. A dirty working tree is read only for
// the drift warning.
//
// Usage:
//   node docs/knowledge/evidence/release-tag-check-2026-11-22/release-dry-run.mjs \
//     [--ref <commitish>] [--tag <vX.Y.Z>] [--allow-existing-tag]
//
// Exit status: 0 when no check reports BLOCK, 1 otherwise.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../../../..')

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? fallback : args[index + 1]
}
const ref = option('ref', 'HEAD')
const tag = option('tag', null) ?? `v${JSON.parse(textAt('package.json')).version}`
const allowExistingTag = args.includes('--allow-existing-tag')
// A release candidate is usually an uncommitted changelog plus a bumped package.json, so the
// release notes cannot be read from a git object alone: --worktree reads those two files from
// disk (only when the target is the checked-out commit). Everything else still comes from `ref`.
const useWorktree = args.includes('--worktree') && git(['rev-parse', ref]) === git(['rev-parse', 'HEAD'])

function textAt(path) {
  if (useWorktree) {
    try {
      return readFileSync(resolve(root, path), 'utf8')
    } catch {
      // fall through to the git object
    }
  }
  return fileAt(ref, path)
}

function git(pathArgs) {
  try {
    return execFileSync('git', pathArgs, { cwd: root, maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return ''
  }
}

function fileAt(rev, path) {
  try {
    return execFileSync('git', ['show', `${rev}:${path}`], {
      cwd: root,
      maxBuffer: 1 << 28,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString()
  } catch {
    return null
  }
}

const results = []
const record = (code, status, detail) => results.push({ code, status, detail })

const head = git(['rev-parse', '--short', ref])
const sha = git(['rev-parse', ref])
const targetIsHead = sha === git(['rev-parse', 'HEAD'])
console.log(`release dry run — ref=${ref} (${head}) tag=${tag}`)
console.log('')

// 1. Tag shape. Same regex as release.yml:74.
const TAG_RE = /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/
if (!TAG_RE.test(tag)) record('TAG_FORMAT', 'BLOCK', `"${tag}" is not vMAJOR.MINOR.PATCH`)
else record('TAG_FORMAT', 'PASS', `${tag} matches ^v(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$`)

// 2. Tag is on main (release.yml:36).
const ancestorOk = (() => {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', sha, 'origin/main'], { cwd: root, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()
record(
  'TAG_ON_MAIN',
  ancestorOk ? 'PASS' : 'BLOCK',
  ancestorOk ? `${head} is an ancestor of origin/main` : `${head} is not an ancestor of origin/main`,
)

// 3. package.json at the target revision matches the tag version (release.yml:78-83).
const pkgText = textAt('package.json')
let packageVersion = null
if (pkgText === null) record('PACKAGE_VERSION', 'BLOCK', 'package.json is unreadable at the target revision')
else {
  packageVersion = JSON.parse(pkgText).version
  record(
    'PACKAGE_VERSION',
    packageVersion === tag.replace(/^v/, '') ? 'PASS' : 'BLOCK',
    `package.json ${packageVersion} vs tag ${tag}`,
  )
}

// 4. The tag must be new, and an existing tag must never be moved (AGENTS.md release discipline).
const existing = git(['rev-parse', '-q', '--verify', `refs/tags/${tag}`])
if (existing === '') record('TAG_IS_NEW', 'PASS', `no refs/tags/${tag} exists`)
else {
  const existingCommit = git(['rev-parse', `${tag}^{commit}`])
  if (existingCommit === sha && allowExistingTag) record('TAG_IS_NEW', 'INFO', `${tag} already points at ${head}; replay allowed`)
  else if (existingCommit === sha) record('TAG_IS_NEW', 'BLOCK', `${tag} already points at ${head} — nothing new to release`)
  else record('TAG_IS_NEW', 'BLOCK', `${tag} already exists at ${existingCommit.slice(0, 7)}; moving a published tag is forbidden`)
}

// 5. The changelog section the release notes come from (release.yml:84-96).
const changelog = textAt('CHANGELOG.md')
if (changelog === null) record('CHANGELOG_SECTION', 'BLOCK', 'CHANGELOG.md is unreadable at the target revision')
else {
  const lines = changelog.split(/\r?\n/)
  const version = tag.replace(/^v/, '')
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const start = lines.findIndex((line) => new RegExp(`^## \\[${escaped}\\](?:\\s+-.*)?$`).test(line))
  if (start < 0) record('CHANGELOG_SECTION', 'BLOCK', `CHANGELOG.md has no "## [${version}]" section at ${head}`)
  else {
    let end = start + 1
    while (end < lines.length && !/^## \[/.test(lines[end])) end += 1
    const section = lines.slice(start, end).join('\n').trim()
    const sectionLines = section.split('\n')
    record(
      'CHANGELOG_SECTION',
      sectionLines.length >= 4 ? 'PASS' : 'BLOCK',
      `[${version}] section is ${sectionLines.length} lines (release.yml requires >= 4)`,
    )
    console.log('--- release notes preview (first 6 lines of the extracted section) ---')
    console.log(sectionLines.slice(0, 6).join('\n'))
    console.log('--- end preview ---')
    console.log('')

    // 6. Bilingual heuristic: every top-level bullet should carry an English run and a CJK run.
    const bullets = sectionLines.filter((line) => /^- /.test(line))
    const bilingual = bullets.filter((line) => /[A-Za-z]{3}/.test(line) && /[\u4e00-\u9fff]/.test(line))
    const cjk = bullets.filter((line) => /[\u4e00-\u9fff]/.test(line))
    record(
      'CHANGELOG_BILINGUAL',
      bullets.length === 0 ? 'BLOCK' : bilingual.length === bullets.length ? 'PASS' : 'WARN',
      `${bullets.length} bullets, ${bilingual.length} carry both EN and ZH on the bullet line, ${cjk.length} carry ZH`,
    )
  }
}

// 7. AGENTS.md asks for an [Unreleased] section; the repo's own test forbids it at the top.
if (changelog !== null) {
  const hasUnreleased = /^## \[Unreleased\]/m.test(changelog)
  record(
    'UNRELEASED_SECTION',
    hasUnreleased ? 'PASS' : 'WARN',
    hasUnreleased
      ? 'CHANGELOG.md carries an [Unreleased] section'
      : 'no [Unreleased] section: AGENTS.md asks for one, test/docs-version.spec.ts:110-114 requires the file to open with the package version',
  )
  // Same semantics as test/docs-version.spec.ts:110-114: the first *numeric* section must be the
  // package version, so an [Unreleased] heading above it does not break the guard.
  const opensWith = (changelog.match(/^## \[(\d+\.\d+\.\d+)\]/m) || [])[1] ?? '(none)'
  record(
    'CHANGELOG_OPENS_WITH_PACKAGE_VERSION',
    opensWith === packageVersion ? 'PASS' : 'BLOCK',
    `first numbered section is [${opensWith}], package.json says ${packageVersion}`,
  )

  // AGENTS.md: entries under [Unreleased] are written in English and Simplified Chinese. The
  // heuristic is the same one used for a release section: both scripts on the bullet line.
  if (hasUnreleased) {
    const all = changelog.split(/\r?\n/)
    const start = all.findIndex((line) => line.startsWith('## [Unreleased]'))
    let end = start + 1
    while (end < all.length && !/^## \[/.test(all[end])) end += 1
    const bullets = all.slice(start, end).filter((line) => /^- /.test(line))
    const bilingual = bullets.filter((line) => /[A-Za-z]{3}/.test(line) && /[\u4e00-\u9fff]/.test(line))
    record(
      'UNRELEASED_BILINGUAL',
      bullets.length > 0 && bilingual.length === bullets.length ? 'PASS' : 'BLOCK',
      `[Unreleased] has ${bullets.length} bullet(s), ${bilingual.length} carry both EN and ZH on the bullet line`,
    )
  } else {
    record('UNRELEASED_BILINGUAL', 'WARN', 'no [Unreleased] section to check for bilingual entries')
  }
}

// 8. lib/ consistency口径: the count is whatever HEAD tracks, asserted byte-identical by verify:lib.
const libTracked = git(['ls-tree', '-r', '--name-only', ref, 'lib']).split('\n').filter(Boolean)
const libJs = libTracked.filter((path) => path.endsWith('.js'))
const libDts = libTracked.filter((path) => path.endsWith('.d.ts'))
const libMaps = libTracked.filter((path) => path.endsWith('.map'))
record(
  'LIB_TRACKED_FILES',
  libTracked.length > 0 ? 'INFO' : 'BLOCK',
  `${libTracked.length} tracked files at ${head} (${libJs.length} .js, ${libDts.length} .d.ts, ${libMaps.length} .map)`,
)

// 9. Working-tree drift: an auto-tag must not tag a tree that carries uncommitted work.
// Only meaningful when the target is the current checkout; a replay of a past commit says nothing about today's tree.
if (!targetIsHead) {
  record('WORKTREE_CLEAN', 'INFO', `skipped: target ${head} is not the checked-out commit`)
  record('LIB_UNTRACKED', 'INFO', `skipped: target ${head} is not the checked-out commit`)
} else {
const dirty = git(['status', '--porcelain', '--untracked-files=all', '--', 'lib', 'src', 'test'])
const dirtyLines = dirty ? dirty.split('\n') : []
record(
  'WORKTREE_CLEAN',
  dirtyLines.length === 0 ? 'PASS' : 'BLOCK',
  dirtyLines.length === 0
    ? 'no uncommitted changes under lib/, src/, test/'
    : `${dirtyLines.length} uncommitted path(s) under lib/, src/, test/ (first: ${dirtyLines[0]})`,
)

// 10. Untracked lib artifacts would be packed by npm and rejected by release.yml:59-60.
const untrackedLib = dirtyLines.filter((line) => /^\?\?/.test(line) && /\blib\//.test(line))
record(
  'LIB_UNTRACKED',
  untrackedLib.length === 0 ? 'PASS' : 'BLOCK',
  untrackedLib.length === 0 ? 'every lib/ file at HEAD is tracked' : `${untrackedLib.length} untracked lib/ path(s)`,
)
}

console.log('')
for (const { code, status, detail } of results) console.log(`${status.padEnd(5)} ${code.padEnd(34)} ${detail}`)

const blocking = results.filter((result) => result.status === 'BLOCK')
console.log('')
console.log(`summary: ${results.length} checks, ${blocking.length} BLOCK, ${results.filter((r) => r.status === 'WARN').length} WARN`)
console.log(blocking.length === 0 ? 'verdict: WOULD TAG (no tag was created)' : 'verdict: REFUSE TO TAG')
process.exitCode = blocking.length === 0 ? 0 : 1
