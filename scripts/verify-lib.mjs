#!/usr/bin/env node
// Assert that the committed lib/ is the build of the committed src/.
//
// The local gate cannot see a stale artifact on its own: `npm test` runs `npm run build`
// first, so the tests always read freshly emitted files, and `npm run ci` inherits that.
// A commit can therefore carry a lib/ built from an older src/ and still look green
// locally. That is exactly how v0.11.14 was tagged with a lib/loop.js that had no
// `callSchedule` in it while src/loop.ts defined and called it — the defect only surfaced
// in CI, after the tag was pushed.
//
// This script checks the pair that is actually committed: it exports HEAD, builds it in a
// temporary directory, and compares the result with HEAD's lib/. It never touches the
// working tree's lib/, so it is safe to run with uncommitted work in progress.
//
// Usage: npm run verify:lib

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

function git(args) {
  return execFileSync('git', args, { cwd: root, maxBuffer: 1 << 28 })
}

function extract(paths, into) {
  const archive = git(['archive', 'HEAD', ...paths])
  const result = spawnSync('tar', ['-x', '-C', into], { input: archive, maxBuffer: 1 << 28 })
  if (result.status !== 0) throw new Error(`tar failed: ${result.stderr?.toString() ?? result.status}`)
}

function filesUnder(dir) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...filesUnder(path))
    else if (entry.isFile()) found.push(path)
  }
  return found
}

const sha = git(['rev-parse', '--short', 'HEAD']).toString().trim()
const scratch = mkdtempSync(join(tmpdir(), 'verify-lib-'))

try {
  const committed = join(scratch, 'committed')
  extract([], scratch)
  mkdirSync(committed)
  extract(['lib'], committed)

  // The archive is HEAD's tree; build it with the same dependencies the working tree uses.
  symlinkSync(join(root, 'node_modules'), join(scratch, 'node_modules'), 'dir')
  execFileSync(process.execPath, [join(scratch, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.build.json'], {
    cwd: scratch,
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  execFileSync(process.execPath, ['scripts/build-client.mjs'], { cwd: scratch, stdio: ['ignore', 'inherit', 'inherit'] })

  const expected = new Map(filesUnder(join(committed, 'lib')).map(path => [relative(join(committed, 'lib'), path), path]))
  const actual = new Map(filesUnder(join(scratch, 'lib')).map(path => [relative(join(scratch, 'lib'), path), path]))

  const problems = []
  for (const [rel, path] of actual) {
    const other = expected.get(rel)
    if (other === undefined) problems.push(`missing from HEAD's lib/: ${rel}`)
    else if (!readFileSync(path).equals(readFileSync(other))) problems.push(`differs from its own build: ${rel}`)
  }
  for (const rel of expected.keys()) {
    if (!actual.has(rel)) problems.push(`present in HEAD's lib/ but not emitted: ${rel}`)
  }

  if (problems.length > 0) {
    console.error(`lib/ at ${sha} is not the build of src/ at ${sha}:`)
    for (const problem of problems) console.error(`  ${problem}`)
    console.error('\nRun `npm run build` and commit lib/ together with the src/ change it came from.')
    process.exitCode = 1
  } else {
    console.log(`lib/ at ${sha} is the build of src/ at ${sha} (${actual.size} files, byte-identical)`)
  }
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
