# Cloning the live `web` profile and testing inside the clone (2026-11-21)

Proves that "clone the current DSH profile to a new profile" is a checked operation, and
records the two defects a straightforward copy reproduces.

## Environment (measured)

| item | value |
| --- | --- |
| DSH CLI | `dsh --version` → `0.2.2-rc.3` (release commit `6b729fe`) |
| Node.js | 26.8.1 |
| source profile | `~/.dsh/profiles/web` (94 MB, 7422 files, 15 dependencies, 20 bundle rows) |
| clone home | `.tmp/profile-clone/dsh-home` (throw-away `DSH_HOME`, gitignored) |
| clone profile | `.tmp/profile-clone/dsh-home/profiles/web-clone` |
| tool under test | `scripts/clone-profile.mjs` + `test/profile-clone.spec.ts`, this checkout |

No model and no credential is involved anywhere in this record: the checks are profile
composition, dependency resolution, and the web app's own HTTP surface. The clone is
created with credential-shaped values redacted, so no token exists in it to use.

## Defect 1 — a copied profile does not resolve its `link:` dependencies

`cp -a` produces a tree that is byte-identical and broken. Two dependencies are relative
symlinks whose target only resolves from the source profile's depth:

```text
node_modules/dsh-system-prompt-design -> ../../../../projects_mine/dsh-system-md
node_modules/dsh-token-usage         -> ../../../../projects_mine/dsh-token-usage
```

From `~/.dsh/profiles/web/` that is `~/projects_mine/…`; from any other depth it is
nothing. DSH does not degrade: the first copy made by hand (`cp -a`, before the script
existed) failed like this:

| command | plain copy | after `clone-profile.mjs` |
| --- | --- | --- |
| `dsh plugin --profile web-clone list` (with `DSH_HOME` at the clone) | **exit 1**, `cannot resolve profile bundle "dsh-system-prompt-design"` | exit 0, `15 packages` |
| `dsh --profile web-clone --dump-config` | exit 0 but **1** `skipping profile bundle "dsh-system-prompt-design"` | exit 0, **0** skipped bundles |

The script re-derives each link against the clone's own location
(`path.relative(cloneNodeModules, sourceResolvedTarget)`), which keeps the relative shape a
later `pnpm install` expects. Two links are relinked; three others
(`node_modules/git`, `node_modules/.bin/openwrite-maintenance`,
`node_modules/.bin/openwrite-safe-upgrade`) are **already dangling in the source profile**
and are reported as inherited rather than as clone damage.

## Defect 2 — the live profile carries a literal channel secret

`cordis.patch.yml` line 378 is a `channelSecrets` entry whose value matches an
OpenAI-style key (`sk-` + 39 characters, inside the imagegen plugin's channel map). A
verbatim copy mints a second copy of a live credential into a directory nobody audits, and
that directory is exactly what gets pasted into a report or a commit.

`clone-profile.mjs` redacts credential-shaped values in profile-owned files (the five
parity files), records the location only — file, line, pattern name — and then **proves**
the clone is the source after exactly those redactions:

```text
parity 5/5 equal after redaction
credentials redacted: 1 line(s) in 1 file(s)
```

No report, log, or commit in this directory contains the value: the sanitized logs were
re-scanned for `sk-…` and `token=…` shapes and both counts are 0
(`logs/boot.txt`, `logs/boot-without-home-patch.txt`).

Four further matches sit in `node_modules/dsh-infinite-gen-5/adapters/test-*.mjs`; those are
vendored test fixtures inside a dependency, so they are reported as `vendored` and left
alone — rewriting package contents would corrupt the dependency.

## The clone boots and serves the plugin

| check | command | result |
| --- | --- | --- |
| composition | `DSH_HOME=… dsh --profile web-clone --dump-config` | exit 0; `grok-workflow` appears on 28 lines of the composed tree |
| dependency resolution | `DSH_HOME=… dsh plugin --profile web-clone list` | exit 0; 15 packages incl. `dsh-grok-workflow@0.12.15` |
| web app boots | `DSH_HOME=… dsh --profile web-clone --no-open --host 127.0.0.1 --port 32997` | `dsh web: http://127.0.0.1:32997/…` |
| UI served | `curl -sS -L -b/-c cookie "<boot url>"` | `http_code=200 bytes=45259`, `<title>DeepSeek Harness</title>`, `__DSH_BOOT__` present |
| plugin registry | parse `__DSH_BOOT__.entries` from that HTML | 88 client entries; `dsh-grok-workflow` present with `plugins/??dsh-grok-workflow/client.js&rev=5ed443a5559d` |
| plugin asset served | `curl … /plugins/??dsh-grok-workflow/client.js&rev=5ed443a5559d` | `http_code=200 bytes=237809` |

The rev-less URL (`…/client.js` without `&rev=`) returns 404 — that is the asset endpoint
refusing a stale reference, not the plugin failing to mount; the rev taken from the same
boot payload returns 200.

### Sandbox note (why the clone needs a home patch)

A cloned `web` profile re-runs its machine-level MCP servers, and those write outside the
profile. Booted as-is into a sandboxed clone the app still serves, but the log carries 8
`Read-only file system` tracebacks:

```text
OSError: [Errno 30] Read-only file system: '/home/fish/.serena/logs/2026-11-21'
OSError: [Errno 30] Read-only file system: '/home/fish/.local/share/phone-use/state.json'
```

`home-patch.sandbox.yml` (this directory) disables `mcp-serena`, `mcp-mobile-phone` and
`mcp-lingshu-shared` through the documented home-level patch (`$DSH_HOME/cordis.patch.yml`).
With it, `logs/boot.txt` is a single clean line: no tracebacks at all.

### Three warnings that are not clone damage

`--dump-config` prints three patch notices for the clone:
`entry "layerfs-host" not found`, `entry "agent-teams" not found`, and a `deepseek-account`
name mismatch. They come from the source profile's own `cordis.patch.yml` patching entry
ids that the composed tree does not contain; the identical three appear on the first,
unrepaired copy, so they are inherited configuration drift, not relocation damage. They are
left untouched here (out of scope) and recorded in `VALIDATION.md`.

## Why parity is measured by hash, not by a second `--dump-config`

`--dump-config` rewrites `<profile>/cordis.yml` as part of `prepareProfile`. The source
profile lives under `~/.dsh`, which is read-only in this session, so the source cannot be
dumped at all:

```text
Error: EROFS: read-only file system, open '/home/fish/.dsh/profiles/web/cordis.yml'
```

Parity therefore rests on the five files whose bytes define the profile —
`cordis.yml`, `cordis.patch.yml`, `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` —
compared as sha256 of the clone against sha256 of the source *after* the declared
redactions. All five are equal.

## Reproduce

```sh
DH="$PWD/.tmp/profile-clone/dsh-home"
node scripts/clone-profile.mjs --src "$HOME/.dsh/profiles/web" --home "$DH" \
  --name web-clone --force --report .tmp/profile-clone/clone-report.json
cp .rsi/evidence/profile-clone/home-patch.sandbox.yml "$DH/cordis.patch.yml"
DSH_HOME="$DH" dsh plugin --profile web-clone list
DSH_HOME="$DH" dsh --profile web-clone --dump-config >/dev/null
DSH_HOME="$DH" dsh --profile web-clone --no-open --host 127.0.0.1 --port 32997
npx vitest run test/profile-clone.spec.ts
```

## Defect 3 — the guard test depended on the developer's tree being clean

Running the full gate the way this repository documents it
(`TMPDIR=$PWD/.tmp npm run ci`, see the `.tmp/` note in `.gitignore`) went red:

```text
FAIL  test/iterate-plan.spec.ts > resumes at the last budgeted round and stops one above it
AssertionError: expected 10 to be +0
```

`10` is the guard's `SKIP`: the checked tree was dirty. The cause is isolation, not the
guard: `fixtureRepo()` creates `.rsi/` but never a git repository, and the guard asks
`git -C "$root" status --porcelain --untracked-files=no`. `git -C` walks up until it finds
a repository, and with `TMPDIR=$PWD/.tmp` the nearest one is *this checkout* — so the guard
reported our own uncommitted files. The 09:47 baseline was green only because the tree
happened to be clean at that moment.

Fix: `git init -q` inside `fixtureRepo()`, so the tree being checked is the fixture's.
Green/red: `npx vitest run test/iterate-plan.spec.ts` was 1 failed / 20 passed before and
21 passed after, under `TMPDIR=$PWD/.tmp` and under the default `TMPDIR` alike. The guard
script's own semantics were left alone — `--root` still means "the repository to inspect".
