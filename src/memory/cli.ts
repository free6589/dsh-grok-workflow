/**
 * Command-line reader for the incremental memory archive.
 *
 * This is the surface a *later* session uses to answer "what has already been
 * researched?" without holding any of the state that produced the entries: it
 * reads one append-only file and prints the newest entries. It is deliberately a
 * separate executable rather than a plugin-side API so the answer is identical
 * in a fresh shell, in a new DSH session, and in a cron job:
 *
 * ```
 * node lib/memory/cli.js recent --limit 5
 * node lib/memory/cli.js path
 * node lib/memory/cli.js recent --json
 * ```
 *
 * The directory resolves the same way the writer resolves it
 * (`--dir`, then `GROK_WORKFLOW_MEMORY_DIR`, then `$DSH_HOME/memory/grok-workflow`,
 * then `~/.dsh/memory/grok-workflow`), so a reader never has to be told where to
 * look.
 *
 * @module dsh-grok-workflow/memory/cli
 */

import { pathToFileURL } from 'node:url'
import { archiveDir, archiveFile, readArchive, recentArchiveDigest } from './archive.js'
import type { ArchiveKind } from './archive.js'

/** Where the CLI writes; injectable so a test can capture the output. */
export interface ArchiveCliIo {
  out(line: string): void
  err(line: string): void
}

/** The one-line usage text. */
const USAGE = [
  'usage: node lib/memory/cli.js <command> [options]',
  '',
  'commands:',
  '  recent                 print the newest archive entries (default)',
  '  path                   print the archive directory and file',
  '',
  'options:',
  '  --limit <n>            entries to print (default 20)',
  '  --dir <path>           archive directory (overrides GROK_WORKFLOW_MEMORY_DIR)',
  '  --kinds round,agent    restrict to entry kinds',
  '  --json                 print the entries as JSON',
].join('\n')

/** Parse `--flag value` pairs, ignoring unknown flags so a typo cannot crash a reader. */
function parseArgs(argv: readonly string[]): {
  command: 'recent' | 'path'
  limit: number
  dir?: string
  kinds?: ArchiveKind[]
  json: boolean
} {
  let command: 'recent' | 'path' = 'recent'
  let limit = 20
  let dir: string | undefined
  let kinds: ArchiveKind[] | undefined
  let json = false
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === 'recent') command = 'recent'
    else if (arg === 'path') command = 'path'
    else if (arg === '--json') json = true
    else if (arg === '--limit') {
      const raw = argv[index + 1]
      index += 1
      const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10)
      if (Number.isFinite(parsed) && parsed > 0) limit = parsed
    } else if (arg === '--dir') {
      const raw = argv[index + 1]
      index += 1
      if (raw !== undefined && raw.trim() !== '') dir = raw
    } else if (arg === '--kinds') {
      const raw = argv[index + 1]
      index += 1
      if (raw !== undefined) {
        const wanted = raw.split(',').map(part => part.trim()).filter(part => part === 'round' || part === 'agent' || part === 'note')
        if (wanted.length > 0) kinds = wanted as ArchiveKind[]
      }
    }
  }
  return {
    command,
    limit,
    ...dir === undefined ? {} : { dir },
    ...kinds === undefined ? {} : { kinds },
    json,
  }
}

/**
 * Run the archive CLI.
 * @param argv - arguments after the script name.
 * @param io - output sink (defaults to stdout/stderr).
 * @returns A process exit code (0 success, 2 usage error).
 */
export function runArchiveCli(argv: readonly string[], io: ArchiveCliIo = {
  out: line => process.stdout.write(`${line}\n`),
  err: line => process.stderr.write(`${line}\n`),
}): number {
  if (argv.includes('--help') || argv.includes('-h')) {
    io.out(USAGE)
    return 0
  }
  const parsed = parseArgs(argv)
  const dirOptions = parsed.dir === undefined ? {} : { dir: parsed.dir }
  if (parsed.command === 'path') {
    io.out(`dir:  ${archiveDir(dirOptions)}`)
    io.out(`file: ${archiveFile(dirOptions)}`)
    return 0
  }
  if (parsed.json) {
    const entries = readArchive({
      ...dirOptions,
      limit: parsed.limit,
      ...parsed.kinds === undefined ? {} : { kinds: parsed.kinds },
    })
    io.out(JSON.stringify(entries, null, 2))
    return 0
  }
  io.out(recentArchiveDigest({
    ...dirOptions,
    limit: parsed.limit,
    ...parsed.kinds === undefined ? {} : { kinds: parsed.kinds },
  }))
  return 0
}

/** True when this module is the program the runtime started. */
function isEntryPoint(): boolean {
  const entry = process.argv[1]
  if (entry === undefined) return false
  try {
    return import.meta.url === pathToFileURL(entry).href
  } catch {
    return false
  }
}

if (isEntryPoint()) {
  process.exitCode = runArchiveCli(process.argv.slice(2))
}
