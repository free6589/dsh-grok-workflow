# Runtime audit — on-disk versus in-memory plugin versions

Audit time: 2026-11-20 13:10–13:32 +0800. Read-only: no host restarted, no product source,
schedule or memory doc touched; this file is the only write.

Status vocabulary follows `AGENTS.md`: CONFIRMED = directly observed via file, command or
process; HYPOTHESIS = plausible, not verified; NOT_RUN = intentionally not executed.

## 1. Version truth table

| Row | What it is | Version | State | Evidence |
| --- | --- | --- | --- | --- |
| web profile, manifest | `dependencies.dsh-grok-workflow` spec | `github:free6589/dsh-grok-workflow#v0.12.9` | CONFIRMED | `~/.dsh/profiles/web/package.json` |
| web profile, lock | resolved tarball + integrity | `0.12.9`, `…/tar.gz/4b751b3ad7c7b094d88b1eba88f6c3afb95b273e`, `sha512-FPG/uWcT6Bc93euGBPdMEVdMKC64rqNPVfGlxyLeZcKWEe7S+Lp5vJcXdg7NBxwpfUAD8UxXjYW2Ba/xXuT6Ow==` | CONFIRMED | `~/.dsh/profiles/web/pnpm-lock.yaml:32-34,223-225` |
| web profile, installed tree | `node_modules/dsh-grok-workflow/package.json` | `0.12.9` | CONFIRMED | `node -e require(...)` on that path |
| web profile, shipped lib | 77 files (39 `*.js` + 38 `*.d.ts`) | byte-identical to tag `v0.12.9` blobs | CONFIRMED | blob-hash diff, §3 |
| loopfix-verify, manifest | spec | `github:free6589/dsh-grok-workflow#v0.12.9` | CONFIRMED | `~/.dsh/profiles/loopfix-verify/package.json` |
| loopfix-verify, lock | resolved tarball + integrity | `0.12.9`, same tarball + same `sha512-FPG/…` | CONFIRMED | `~/.dsh/profiles/loopfix-verify/pnpm-lock.yaml:29-31,216-218` |
| loopfix-verify, installed tree | `package.json` | `0.12.9` | CONFIRMED | that path |
| loopfix-verify, shipped lib | 77 files | byte-identical to tag `v0.12.9` blobs | CONFIRMED | blob-hash diff, §3 |
| repo checkout @13:14 | `package.json` at `HEAD` = `0d91e45` | `0.12.10` | CONFIRMED | `git show HEAD:package.json` |
| repo checkout @13:28 | `HEAD` = `origin/main` = `cf43820` | `0.12.11` | CONFIRMED | `git show HEAD:package.json`; `git rev-list --left-right --count origin/main...HEAD` → `0 0` |
| published tags @13:14 | highest tag on `origin` | `v0.12.9` → `4b751b3` (annotated) | CONFIRMED | `git ls-remote --tags origin`; `git rev-list -n1 v0.12.9` |
| published tags @13:30 | highest tag on `origin` | `v0.12.11` → `d181812`; `v0.12.10` → `0d91e45` | CONFIRMED | `git ls-remote --tags origin`; `git rev-list -n1 v0.12.10 v0.12.11` |
| profile lag | profiles versus latest release | 2 releases behind (`0.12.9` installed, `0.12.11` published) | CONFIRMED | rows above |
| running host | plugin module graph in memory | unknown | NOT_RUN | §4 |

Both profiles resolve the same tarball commit `4b751b3` and the same integrity hash, so the
two installed trees are the same bytes; the aggregate manifest hash confirms it (§3).

Repo state, first snapshot (`13:14`): `HEAD` = `0d91e45` (`build(lib): rebuild from current src`),
two commits ahead of `origin/main` (`91ed287`), 15 dirty paths in the working tree. The
`0.12.10` bump was committed but unpublished and untagged at that moment. `v0.12.9` is an
ancestor of `origin/main` (8 commits behind it), so "HEAD equals the release tag commit" is
not true here either.

Repo state, second snapshot (`13:28`): `HEAD` = `origin/main` = `cf43820`, `package.json`
`0.12.11`, `v0.12.10` (`0d91e45`, 13:07:59) and `v0.12.11` (`d181812`, 13:20:52) both tagged
and pushed. See §8 — the checkout is being driven by another process while this audit ran.

The headline for the profiles does not change with any of that: **both profiles are on
`0.12.9`, two releases behind the newest published tag (`0.12.11`), and the running host is
older than either.**

## 2. What "shipped" means for this package

The package manifest declares `files: ["lib/**/*.js", "lib/**/*.d.ts", …]`, so the published
tarball carries 77 lib files. The repo's committed `lib/` tree has 153 files because it also
keeps 76 `*.js.map` files. Comparing the installed tree against the full tag tree therefore
reports 76 "missing" files that were never published; the correct comparison is the 77
shipped files, which match exactly.

## 3. Lib hash evidence

Blob hashes (git object ids) of every shipped file were compared between the tag and each
installed tree:

```bash
cd /home/fish/projects_mine/dsh-grok-workflow
git ls-tree -r v0.12.9 -- lib | grep -vE '\.map$' | awk '{print $3" "$4}' | sort -k2   # 77 lines
# per profile:
cd ~/.dsh/profiles/<p>/node_modules/dsh-grok-workflow
find lib -type f \( -name '*.js' -o -name '*.d.ts' \) | sort |
  while read f; do echo "$(git hash-object "$f") $f"; done
```

Results:

- web: 77/77 identical; aggregate sorted-manifest sha256 `cf661ce5331c7affb2e3c098c615a03b002f7d7bf3424845a30d0bca70b93672`
- loopfix-verify: 77/77 identical; same aggregate sha256 `cf661ce5…0b93672`
- tag `v0.12.9` shipped set: aggregate sha256 `cf661ce5…0b93672`

Two independent profiles producing the tag's own aggregate hash is the strongest statement
available without trusting a package manager's bookkeeping.

## 4. Running host versus on-disk — what is confirmed and what is not

CONFIRMED:

- The only `dsh web` process is PID 154637, started `Tue Nov 17 22:49:32 2026`, running
  `node …/bin/dsh web --host 100.111.111.88 --port 3080 --no-open`, DSH `0.2.2-rc.3`,
  node `v26.8.1`. `ps -o pid,lstart,etime,cmd -p 154637`.
- It is still the live host at audit time: `curl -s -o /dev/null -w '%{http_code}'
  http://127.0.0.1:3080/` → `401` (auth required), and this audit's own shell (PID 3086582)
  is a child of 154637. No restart occurred during the audit.
- The on-disk plugin files were written long after that start: `package.json` mtime
  `2026-11-20 12:55:22`, `lib/index.js` `2026-11-20 07:39:29`, `lib/redact.js`
  `2026-11-20 12:55`, and in the same tree `lib/types.js` still carries `2026-10-25 22:56`
  (pnpm links store files, so mtimes are per-file, not one extraction stamp).
- The profile records at least these install operations *after* the boot: `2026-11-17 23:05`,
  `2026-11-18 01:42`, `2026-11-18 22:31/22:33`, `2026-11-19 21:09`, `21:12`, `21:13`,
  `23:39`, `2026-11-20 07:39`, `12:55` — `~/.dsh/profiles/web/.plugin-manager/logs/operation-*`
  and `github-connection-*`. The last one before boot was `2026-11-17 21:43:34`
  (`operation-fmCA4v`: `+ dsh-grok-workflow github:free6589/dsh-grok-workflow`, 21 packages
  reused, 0 downloaded).
- No reload path exists: `grep -rlE 'chokidar|fs\.watch|watchFile\('` and
  `grep -rlE '\bhmr\b|hotReload|hot-reload'` over
  `…/@deepseek-ai/dsh/lib/` both return nothing; `~/.dsh/profiles/web/cordis.patch.yml` has
  no `hmr`/`watch`/`reload` entry and no `dsh-hmr` package is installed in either profile.
  The profile therefore has no mechanism that re-imports changed plugin files.

NOT_RUN (and why):

- The exact module graph the running process holds. The plugin prints no version
  (`grep -n version src/index.ts` has no version output; `ctx.logger('dsh-grok-workflow')` is
  used only for config announcements), ESM's module cache is not readable from outside, the
  process was not started with `--inspect`, and the plugin records no self-version anywhere
  (`src/*.ts` version strings are schema versions only). Any statement of the form "the host
  is running 0.12.x" would be an inference, not an observation.

Consequence, stated at the strength the evidence supports:

- HYPOTHESIS (not CONFIRMED): the process holds a pre-0.11 build. The last install before
  boot was `2026-11-17 21:43:34`, and the newest commit available to that install was
  `7300a6e` (`2026-11-17 04:10`, `package.json` = `0.10.0`); the `v0.11.x` tag line only
  begins `2026-11-19 09:52`. I did not observe the process's memory, so this stays a bound,
  not a fact.

Corrections to earlier reports in this session:

- "The running host still executes the 0.12.1 module graph" cannot be right: the host started
  `2026-11-17 22:49:32`, and no `0.12.x` existed on that date — `v0.12.0` is tagged
  `2026-11-20 02:25:58` (`git for-each-ref --format='%(refname:short) %(creatordate:iso)'
  refs/tags/v0.12.0`). That claim was an inference from on-disk state and should not be
  repeated.
- "Remembered 0.11.21" is likewise later than the boot. `v0.11.21` appears in the profile
  logs only at `2026-11-19 23:39` (`operation-g1yu8W`: `- dsh-grok-workflow
  github:free6589/dsh-grok-workflow#v0.11.21`), i.e. after boot.
- "dsh-hmr mounted with root: []" does not describe either profile here: no `dsh-hmr` package
  is installed in `web` or `loopfix-verify` (`ls -d …/node_modules/*hmr* …/node_modules/@*/*hmr*`
  → nothing), and no `hmr`/`watch`/`reload` entry exists in either `cordis.patch.yml`. The
  correct statement is "no HMR plugin is present", not "present but watching nothing".
- What is defensible is only this: on-disk = `0.12.9` (proved), in-memory = unobserved, and
  the in-memory graph is necessarily *not* the current `0.12.9` bytes because those bytes were
  written after the process started and nothing reloads them.

## 5. Delivery checks

- Composition of both profiles (boot-free): PASS. `DSH_HOME=/home/fish/.rsi-audit-dsh dsh
  --profile <p> --dump-config` exits 0 on an isolated copy of each profile and prints
  `- id: grok-workflow / name: dsh-grok-workflow / config: {mode: full, grokDefault: 'on',
  timeoutMs: 0}` in both (`/tmp/dump-web.yml:1962-1968`, `/tmp/dump-loopfix-verify.yml:1943-1949`).
  Run on a copy because `prepareProfile()` rewrites `cordis.yml` on every invocation
  (`…/dsh/lib/profile-boot-QhDEDXsF.js:217-223`), which would have been a write to the live
  profile.
- Artifact loadability: PASS, with a caveat. `node --input-type=module -e "await
  import('<copy>/node_modules/dsh-grok-workflow/lib/index.js')"` printed
  `LOADED_OK name=dsh-grok-workflow inject=["tools","workflowEngine","systemPrompt"]
  apply=function` once DSH's own `@deepseek-ai/*` packages were reachable. The copy's
  `node_modules` was hardlinked (`cp -al`), so the bytes imported were the live profile's
  bytes. Standalone import without those peers fails with `ERR_MODULE_NOT_FOUND:
  @deepseek-ai/dsh-tools`, which is expected — the profile does not carry the peers; DSH's
  loader supplies them from the install anchor. That failure is not evidence of a bad install.
- GUI click-through: NOT_RUN. It needs an authenticated browser session; the only credential
  source is the profile's auth store, which this audit must not read, and the live host
  answers `401` to unauthenticated requests.
- Copied-profile boot + HTTP check: NOT_RUN. Deliberately not attempted: the audit is
  read-only, and a booted copy of the `web` profile would activate the cron-board, loop and
  plugin-market bundles (real scheduled deliveries are possible) and spawn the MCP server set,
  i.e. side effects outside the audit's mandate. The 401 above is the live host answering; it
  is not a substitute for the copied-profile check.

## 6. Incidental finding (not part of the version question)

The shipped lib imports `@deepseek-ai/dsh-session` at runtime
(`lib/mode.js:12`, `lib/records.js:10`, `lib/loop-brakes.js:42`, all
`import { appendPluginRecord, pluginRecordOf } from '@deepseek-ai/dsh-session'`), and that
package is declared in neither `dependencies` nor `peerDependencies`
(declared: `@deepseek-ai/cordis`, `dsh-agent`, `dsh-llm`, `dsh-system-prompt`, `dsh-tools`,
`dsh-workflow`, plus `@deepseek-ai/schemastery` as a dependency). It resolves today only
because DSH's own install ships `dsh-session` and the loader resolves from the install
anchor. CONFIRMED as a packaging fact; the consequence (a host without `dsh-session`
reachable fails to load the plugin) is HYPOTHESIS — not exercised here.

## 7. Reproduction

```bash
# on-disk truth, per profile
node -e "console.log(require(process.env.HOME+'/.dsh/profiles/web/node_modules/dsh-grok-workflow/package.json').version)"
grep -n -A3 'dsh-grok-workflow' ~/.dsh/profiles/web/pnpm-lock.yaml | head -8
# tag truth
cd /home/fish/projects_mine/dsh-grok-workflow && git rev-list -n1 v0.12.9 && git show v0.12.9:package.json
# host truth (read-only)
ps -o pid,lstart,etime,cmd -p 154637
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3080/
```

Scratch copy used for the boot-free dump and the import test: `/home/fish/.rsi-audit-dsh`
(outside `~/.dsh` and outside the repo; removed after the audit).

## 8. The checkout moved while this audit ran

This repository is being driven by another process during the audit window. Observed:

- `13:14` — `HEAD` `0d91e45`, `package.json` `0.12.10`, 15 dirty paths, highest remote tag `v0.12.9`.
- `13:28` — `HEAD` = `origin/main` = `cf43820`, `package.json` `0.12.11`, 21 dirty paths;
  `v0.12.10` (`0d91e45`, 13:07:59) and `v0.12.11` (`d181812`, 13:20:52) exist locally and on
  `origin`. New files appeared under `.rsi/evidence/round-036/` and `.rsi/evidence/harness/`.
- `13:30` — `origin/main` advanced again to `b4b93a5`.

Every repo-row in §1 is therefore a timestamped snapshot, not a stable fact. What stayed
stable across all three snapshots, re-measured at `13:31`:

- both profiles installed `0.12.9`, spec `#v0.12.9`, lock tarball `4b751b3`;
- both profiles' 77 shipped lib files hash to `cf661ce5…0b93672` = tag `v0.12.9`'s own set;
- the host is still PID 154637, started `2026-11-17 22:49:32`, uptime `2-14:40:09` — no restart.

One consequence worth stating plainly: "profiles are at the latest release" was true at
`13:14` (latest = `v0.12.9`) and false by `13:30` (latest = `v0.12.11`). Any report that pins
"latest" without a timestamp will be wrong within minutes in this repo.

