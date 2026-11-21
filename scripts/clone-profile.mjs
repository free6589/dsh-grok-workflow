#!/usr/bin/env node
// Clone a DSH profile directory into a throw-away $DSH_HOME, faithfully enough that the
// clone boots, and refuse to hand out a clone that is silently broken or that carries
// credentials.
//
// Why this exists: `cp -a` is not a profile clone. Two things break, both silently.
//
// 1. Link-relative dependencies. A pnpm-managed profile stores `link:` and `file:`
//    dependencies as paths **relative to the profile directory**, so a byte-identical
//    copy at a different depth leaves dangling symlinks. DSH does not degrade gracefully:
//    `dsh plugin --profile <clone> list` aborts with "cannot resolve profile bundle ...",
//    and `--dump-config` drops the bundle row with only a one-line warning. Observed on
//    the `web` profile: `dsh-system-prompt-design` and `dsh-token-usage` point at
//    `../../../../projects_mine/<repo>`, which resolves from `~/.dsh/profiles/web/` and
//    nowhere else.
//
// 2. Secrets in profile config. A live profile's `cordis.patch.yml` can hold literal API
//    keys (plugin channel secrets). Copying it verbatim mints a second copy of the
//    credential in a directory nobody audits. So credential-shaped values in profile-owned
//    files are redacted on the way in, and the redaction is proved: the clone must equal
//    the source *after* the declared redactions, byte for byte.
//
// Usage:
//   node scripts/clone-profile.mjs --src ~/.dsh/profiles/web --home .tmp/x/dsh-home \
//     --name web-clone [--force] [--report <path>] [--skip-copy-logs] [--keep-secrets]
//
// Exit codes: 0 ok, 1 verification failed, 2 usage/refusal.

import { createHash } from 'node:crypto'
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

/** Files whose byte content defines "the same profile" for parity purposes. */
const PARITY_FILES = ['cordis.yml', 'cordis.patch.yml', 'package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml']

/** Runtime-only subtree: logs are output, not profile content, and are not copied by default. */
const RUNTIME_TREES = [join('.plugin-manager', 'logs')]

/** Bundles shipped with the DSH installation itself; they never live in a profile's node_modules. */
const INSTALLATION_SCOPE = '@deepseek-ai/'

/**
 * Credential shapes that must not be copied into a clone. `redact` replaces the matched
 * run with a same-shaped placeholder; the report records the location and count only —
 * no matched text ever reaches a report, a log, or a commit.
 */
const SECRET_PATTERNS = [
  { name: 'openai-style-key', re: /\bsk-[A-Za-z0-9_-]{16,}/g, redact: (m) => `${m.slice(0, 3)}REDACTED-BY-CLONE-PROFILE` },
  { name: 'github-token', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g, redact: () => 'ghp_REDACTED-BY-CLONE-PROFILE' },
  { name: 'github-pat-v2', re: /\bgithub_pat_[A-Za-z0-9_]{20,}/g, redact: () => 'github_pat_REDACTED' },
  { name: 'aws-access-key-id', re: /\bAKIA[0-9A-Z]{16}\b/g, redact: () => 'AKIAREDACTEDBYCLONEPROF' },
  { name: 'private-key-block', re: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g, redact: () => '-----BEGIN PRIVATE KEY REDACTED-----' },
  { name: 'slack-token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, redact: () => 'xox-REDACTED-BY-CLONE-PROFILE' },
  { name: 'inline-bearer', re: /\bBearer\s+[A-Za-z0-9._-]{24,}/g, redact: () => 'Bearer REDACTED-BY-CLONE-PROFILE' },
]

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * Redact credential shapes in one file's text. Returns the rewritten text and a
 * location-only list: pattern name, 1-based line, and total line count.
 */
export function redactSecrets(text) {
  const hits = []
  const lines = text.split('\n')
  const output = lines.map((line, index) => {
    let rewritten = line
    for (const pattern of SECRET_PATTERNS) {
      pattern.re.lastIndex = 0
      if (!pattern.re.test(line)) continue
      pattern.re.lastIndex = 0
      hits.push({ pattern: pattern.name, line: index + 1 })
      rewritten = rewritten.replace(pattern.re, pattern.redact)
    }
    return rewritten
  })
  return { text: output.join('\n'), hits }
}

export function scanSecrets(text) {
  const hits = []
  const lines = text.split('\n')
  lines.forEach((line, index) => {
    for (const pattern of SECRET_PATTERNS) {
      pattern.re.lastIndex = 0
      if (pattern.re.test(line)) hits.push({ pattern: pattern.name, line: index + 1 })
    }
  })
  return hits
}

/**
 * The link a clone needs: the same absolute target, expressed relative to the clone.
 * Keeping it relative (rather than swapping in an absolute path) preserves the source
 * profile's shape, so a later `pnpm install` resolves the same way it did before.
 */
export function relinkTarget(absoluteTarget, fromDirectory) {
  return relative(fromDirectory, absoluteTarget)
}

function listTree(root, { skip = [] } = {}) {
  const files = []
  const links = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      const rel = relative(root, path)
      if (skip.some((prefix) => rel === prefix || rel.startsWith(`${prefix}/`))) continue
      if (entry.isSymbolicLink()) links.push(path)
      else if (entry.isDirectory()) walk(path)
      else files.push(path)
    }
  }
  if (existsSync(root)) walk(root)
  return { files, links }
}

/**
 * Where a copied symlink points and whether that resolves. `existsSync` follows links, so
 * a dangling link would read as "no file at all" — `lstatSync` is what distinguishes
 * "missing" from "present but dangling", which is the whole defect class here.
 */
export function linkState(linkPath) {
  let stats
  try {
    stats = lstatSync(linkPath)
  } catch {
    return { present: false, raw: null, resolves: false, absolute: null }
  }
  if (!stats.isSymbolicLink()) return { present: true, raw: null, resolves: true, absolute: linkPath }
  const raw = readlinkSync(linkPath)
  const absolute = resolve(dirname(linkPath), raw)
  let resolves = false
  try {
    resolves = statSync(realpathSync(absolute)).isDirectory() || statSync(absolute).isFile()
  } catch {
    resolves = false
  }
  return { present: true, raw, resolves, absolute }
}

/** The absolute target a symlink has in the source profile, before any copying. */
function sourceLinkTarget(sourceLink) {
  const raw = readlinkSync(sourceLink)
  const absolute = resolve(dirname(sourceLink), raw)
  let resolves = false
  try {
    statSync(absolute)
    resolves = true
  } catch {
    resolves = false
  }
  return { raw, absolute, resolves }
}

function declaredDependencies(profileDir) {
  const manifest = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'))
  const dependencies = Object.keys(manifest.dependencies ?? {})
  const bundles = manifest.dsh?.profile?.bundles ?? []
  return { dependencies, bundles }
}

/**
 * A profile-local dependency resolves when `<profile>/node_modules/<name>/package.json`
 * is readable. Bundles under the installation scope are resolved by DSH itself, not from
 * the profile, so they are reported separately instead of counted as failures.
 */
export function unresolvedDependencies(profileDir, names) {
  const unresolved = []
  for (const name of names) {
    if (name.startsWith(INSTALLATION_SCOPE)) continue
    let ok = false
    try {
      ok = statSync(realpathSync(join(profileDir, 'node_modules', name, 'package.json'))).isFile()
    } catch {
      ok = false
    }
    if (!ok) unresolved.push(name)
  }
  return unresolved
}

function usage(message) {
  process.stderr.write(`clone-profile: ${message}\n`)
  process.exit(2)
}

function parseArgs(argv) {
  const options = { force: false, copyLogs: true, keepSecrets: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--src') options.src = argv[++i]
    else if (arg === '--home') options.home = argv[++i]
    else if (arg === '--name') options.name = argv[++i]
    else if (arg === '--report') options.report = argv[++i]
    else if (arg === '--force') options.force = true
    else if (arg === '--skip-copy-logs') options.copyLogs = false
    else if (arg === '--keep-secrets') options.keepSecrets = true
    else if (arg === '--help' || arg === '-h') {
      process.stdout.write('usage: clone-profile.mjs --src <profile dir> --home <new DSH_HOME> --name <profile name> [--force] [--report <path>] [--skip-copy-logs] [--keep-secrets]\n')
      process.exit(0)
    } else usage(`unknown argument ${JSON.stringify(arg)}`)
  }
  if (!options.src || !options.home || !options.name) usage('--src, --home and --name are required')
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(options.name)) usage('--name must be a plain profile name')
  return options
}

export function cloneProfile({ src, home, name, force = false, copyLogs = true, keepSecrets = false }) {
  const sourceDir = resolve(src)
  const homeDir = resolve(home)
  const targetDir = join(homeDir, 'profiles', name)
  if (!existsSync(join(sourceDir, 'package.json'))) usage(`${sourceDir} is not a DSH profile (no package.json)`)
  if (existsSync(targetDir) && !force) usage(`${targetDir} already exists; pass --force to replace it`)

  const skip = copyLogs ? [] : RUNTIME_TREES
  const source = listTree(sourceDir, { skip })

  if (existsSync(targetDir)) rmSync(targetDir, { recursive: true, force: true })
  mkdirSync(dirname(targetDir), { recursive: true })
  cpSync(sourceDir, targetDir, {
    recursive: true,
    verbatimSymlinks: true,
    filter: (from) => {
      const rel = relative(sourceDir, from)
      return !skip.some((prefix) => rel === prefix || rel.startsWith(`${prefix}/`))
    },
  })

  const target = listTree(targetDir)

  const links = []
  for (const sourceLink of source.links) {
    const rel = relative(sourceDir, sourceLink)
    const copied = join(targetDir, rel)
    const origin = sourceLinkTarget(sourceLink)
    const before = linkState(copied)
    let repaired = false
    if (origin.resolves && before.present && before.raw !== null && !before.resolves) {
      unlinkSync(copied)
      symlinkSync(relinkTarget(origin.absolute, dirname(copied)), copied)
      repaired = true
    }
    const after = linkState(copied)
    links.push({
      path: rel,
      sourceTarget: origin.raw,
      target: after.raw,
      sourceResolves: origin.resolves,
      repaired,
      resolvesAfterRepair: after.resolves,
    })
  }

  // Redaction and parity are the same operation seen twice: the clone must equal the
  // source after the declared redactions and nothing else.
  const redactions = []
  const vendoredHits = []
  for (const file of target.files) {
    const rel = relative(targetDir, file)
    const inNodeModules = rel.startsWith(`node_modules${'/'}`)
    const isParity = PARITY_FILES.includes(rel)
    if (!isParity && !inNodeModules) continue
    let text
    try {
      const buff = readFileSync(file)
      if (buff.length > 8 * 1024 * 1024) continue
      text = buff.toString('utf8')
    } catch {
      continue
    }
    const hits = scanSecrets(text)
    if (hits.length === 0) continue
    if (inNodeModules) {
      vendoredHits.push({ file: rel, lines: hits.length })
      continue
    }
    if (keepSecrets) {
      redactions.push({ file: rel, lines: hits.map((hit) => hit.line), patterns: [...new Set(hits.map((hit) => hit.pattern))], redacted: false })
      continue
    }
    const { text: redacted, hits: recorded } = redactSecrets(text)
    writeFileSync(file, redacted)
    redactions.push({ file: rel, lines: recorded.map((hit) => hit.line), patterns: [...new Set(recorded.map((hit) => hit.pattern))], redacted: true })
  }

  const parity = PARITY_FILES.filter((file) => existsSync(join(sourceDir, file))).map((file) => {
    const sourceBytes = readFileSync(join(sourceDir, file))
    const targetPath = join(targetDir, file)
    const targetBytes = existsSync(targetPath) ? readFileSync(targetPath) : Buffer.alloc(0)
    const expected = keepSecrets ? sourceBytes : Buffer.from(redactSecrets(sourceBytes.toString('utf8')).text)
    return {
      file,
      sourceSha256: sha256Bytes(sourceBytes),
      expectedSha256: sha256Bytes(expected),
      targetSha256: sha256Bytes(targetBytes),
      equal: expected.equals(targetBytes),
    }
  })

  const declared = declaredDependencies(targetDir)
  const unresolved = unresolvedDependencies(targetDir, declared.dependencies)
  const bytes = target.files.reduce((sum, file) => sum + (statSync(file).size ?? 0), 0)
  const secretHits = redactions.reduce((sum, entry) => sum + entry.lines.length, 0)

  const failures = []
  const mismatched = parity.filter((entry) => !entry.equal)
  if (mismatched.length > 0) failures.push(`parity mismatch after redaction: ${mismatched.map((entry) => entry.file).join(', ')}`)
  // Only clone-introduced breakage is a clone defect. A link that was already dangling in
  // the source profile is inherited, and failing on it would make the script unusable on
  // the very profiles that need an audit.
  const stillDangling = links.filter((link) => link.sourceResolves && !link.resolvesAfterRepair)
  if (stillDangling.length > 0) failures.push(`dangling symlinks after repair: ${stillDangling.map((link) => link.path).join(', ')}`)
  if (unresolved.length > 0) failures.push(`unresolved profile dependencies: ${unresolved.join(', ')}`)
  const unredacted = redactions.filter((entry) => !entry.redacted)
  if (unredacted.length > 0) failures.push(`credential-shaped content kept by request: ${unredacted.map((entry) => entry.file).join(', ')}`)

  return {
    ok: failures.length === 0,
    failures,
    source: { dir: sourceDir, files: source.files.length, links: source.links.length },
    target: { dir: targetDir, home: homeDir, files: target.files.length, links: target.links.length, bytes },
    parity,
    links,
    redactions,
    vendoredSecretHits: vendoredHits,
    declared: {
      dependencies: declared.dependencies.length,
      bundles: declared.bundles.length,
      installationBundles: declared.bundles.filter((bundle) => bundle.startsWith(INSTALLATION_SCOPE)).length,
      unresolved,
    },
    secretHits,
  }
}

const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)
if (invokedDirectly) {
  const options = parseArgs(process.argv.slice(2))
  const report = cloneProfile(options)
  if (options.report) writeFileSync(resolve(options.report), `${JSON.stringify(report, null, 2)}\n`)
  const repaired = report.links.filter((link) => link.repaired).length
  const inheritedDangling = report.links.filter((link) => !link.sourceResolves).length
  const redacted = report.redactions.filter((entry) => entry.redacted).length
  process.stdout.write(
    `clone-profile: ${report.ok ? 'ok' : 'FAILED'} — ${report.target.dir}\n` +
      `  files ${report.source.files} -> ${report.target.files} (${report.target.bytes} bytes)\n` +
      `  links ${report.target.links} (relinked ${repaired}, already dangling in the source ${inheritedDangling})\n` +
      `  parity ${report.parity.filter((entry) => entry.equal).length}/${report.parity.length} equal after redaction\n` +
      `  dependencies ${report.declared.dependencies} declared, ${report.declared.unresolved.length} unresolved ` +
      `(${report.declared.installationBundles}/${report.declared.bundles} bundles from the installation)\n` +
      `  credentials redacted: ${report.secretHits} line(s) in ${redacted} file(s); vendored fixtures: ${report.vendoredSecretHits.length} file(s)\n` +
      report.failures.map((failure) => `  - ${failure}\n`).join(''),
  )
  process.exit(report.ok ? 0 : 1)
}
