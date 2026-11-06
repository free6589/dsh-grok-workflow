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
/** Where the CLI writes; injectable so a test can capture the output. */
export interface ArchiveCliIo {
    out(line: string): void;
    err(line: string): void;
}
/**
 * Run the archive CLI.
 * @param argv - arguments after the script name.
 * @param io - output sink (defaults to stdout/stderr).
 * @returns A process exit code (0 success, 2 usage error).
 */
export declare function runArchiveCli(argv: readonly string[], io?: ArchiveCliIo): number;
//# sourceMappingURL=cli.d.ts.map