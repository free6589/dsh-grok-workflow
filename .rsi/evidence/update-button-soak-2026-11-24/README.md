# update-button soak, 2026-11-24

Durable record of the settings-page upgrade button's real-machine soak: the built
plugin of branch `feat/update-button` mounted in an isolated fork of the live `web`
profile, the settings page driven in a real Chromium, and a real installation of a
real published release performed by one click of the card's own button. The raw run
lived in the gitignored scratch `.tmp/soak-update/` (kept for the foreman to clean,
not added to); everything here was copied out of it or measured on this machine in
the same session. Nothing here is inferred from a plan or a child's self-report.

Referenced from `docs/knowledge/VALIDATION.md` (entry: update-button soak, 2026-11-24).

## 1. What was under test, and the build

One commit on one local branch:

    branch:   feat/update-button
    base:     main at c6a3611
    commit:   c951dbf  feat(update): a working upgrade button on the settings page

Build under test (the packed plugin that was installed into the scratch profile):

    path:     <worktree>/lib/index.js
    sha256:   bebf2a06323887d110600fdea39ebd0943448773ab1adabbc4be1544c16d2590

    path:     <worktree>/lib/client.js
    sha256:   20ea78f66b38cd3d0e21a2fbc6223a157c9f8488c3cabbe7fdc01465fb5b4b36

Both measured with `sha256sum` in this worktree on 2026-11-24. They are the committed
bytes: `ci.out` in this directory records `verify:lib` → `lib/ at c951dbf is the build
of src/ at c951dbf (245 files, byte-identical)`, which compares the committed `src/`
against the committed `lib/` of that commit (`scripts/verify-lib.mjs` stages
`git archive HEAD`), so the packed `lib/` is the build of the `src/` in `c951dbf`.

The installed copy is no longer those bytes, and that is the point of the soak: after
the button's install landed, the profile's copy is the published `v0.13.31` build —
`lib/index.js` sha256 `3e014bd1f8f469ed66be92a832f6b417d12967a1706c5f6732df2a1d98b190a3`,
manifest version `0.13.31`. `prepare_soak.sh` compares the packed copy's two hashes
against the worktree's at pack time; its stdout was not archived, so that particular
comparison is **not re-checkable from this directory** and is not claimed here.

## 2. Environment

- **Isolated home.** The live `web` profile was **copied** into
  `.tmp/soak-update/dsh-home/profiles/web` and the instance then ran against that
  scratch home (`DSH_HOME=<scratch>/dsh-home`), with its own `HOME=<scratch>/home`,
  its own pnpm store (`pnpm-store/`) and its own npm cache (`npm-cache/`) inside the
  scratch directory. The live `~/.dsh` was read to make the copy and written never.
- **Instance.** `dsh --profile web --patch overlay-soak.yml --no-open --host
  127.0.0.1 --port <p>`, one instance per run, killed at the end of the run.
- **Overlay** (`overlay-soak.yml`, archived, 611 bytes): disables exactly four rows —
  the three stdio MCP clients `mcp-lingshu-shared`, `mcp-mobile-phone`,
  `mcp-serena`, and `layerfs-host`. They reach shared services outside the scratch
  home and the soak needs none of them; switching them off in one overlay was chosen
  over editing the copied layer, so the fork stays a byte copy.
- **Key handling.** No credential appears in anything archived here, and no key was
  needed for this soak: the card's status read goes to the GitHub tags API and the
  install goes through pnpm, neither of which is a model call. The three MCP clients
  that would have needed credentials are the three the overlay disables.
- **Browser.** Playwright driving the system Chromium; the page is the real settings
  page reached the way the operator reaches it — sidebar 插件 → the "Grok workflow"
  row → its settings page.

## 3. Fixture: what made the button have something to install

Two steps, both real, both in `prepare_soak.sh` (archived):

    npm pack  --pack-destination <scratch>            # dsh-grok-workflow-0.13.31.tgz
    DSH_HOME=<scratch>/dsh-home \
      dsh plugin --profile web add file:<scratch>/dsh-grok-workflow-0.13.31.tgz
    # then: set that installed copy's manifest version to 0.13.30

The plugin went in as a **packed copy, not a link** — a link would let the button's
install overwrite the very tree under test. `prepare-install.out` (archived) is that
install: pnpm exited 0 and added the package.

The manifest version was then pinned from `0.13.31` to `0.13.30` **by hand**, and
this is the one artificial part of the rig: the card offers an install only when the
profile is really older than the newest published tag, and the newest published tag
on that day was `v0.13.31`. With an identical version the card correctly says "已是最
新" and there is nothing to click. The pin changes a number in a manifest; the run's
install was still a real GitHub fetch, a real pnpm, and a real profile write.

## 4. Commands

    cd .tmp/soak-update
    ./prepare_soak.sh                 # pack, install the copy, pin 0.13.30
    ./run_soak.sh 18330 run1          # run 1
    ./run_soak.sh 18331 run2          # run 2 — lost to a harness bug (section 7)
    ./run_soak.sh 18332 run3          # run 3

`run_soak.sh` (archived, 2037 bytes) is, step for step:

    export DSH_HOME=<scratch>/dsh-home
    unset DSH_WEB_URL
    HOME=<scratch>/home XDG_DATA_HOME=<scratch>/home/.local/share \
      npm_config_store_dir=<scratch>/pnpm-store pnpm_config_store_dir=<scratch>/pnpm-store \
      npm_config_cache=<scratch>/npm-cache \
      dsh --profile web --patch overlay-soak.yml --no-open --host 127.0.0.1 --port <p> &   # background
    # scrape the http://127.0.0.1:<p>/?token=… line out of the boot log, up to 60 s
    python3 click_soak.py <url> <prefix> > <prefix>-result.json 2> <prefix>-click.err
    # read the outcome out of the profile on disk, not out of the click:
    #   node -p require(<home>/profiles/web/node_modules/dsh-grok-workflow/package.json).version
    #   node -p require(<home>/profiles/web/package.json).dependencies['dsh-grok-workflow']
    # kill the instance, exit with the click's status

`click_soak.py` (archived, 4533 bytes) opens the settings page, records the card
before any click, presses 检查, presses the install button when the card offers one,
waits for the card to settle, and prints one JSON object: every state it saw (the
card's `data-gw-update-phase`, its `data-*` attributes, its text, its buttons), the
browser console, and every request/response the page made to the plugin's route.

## 5. Results

Run 3, the two route calls the browser actually made, verbatim:

    GET  /grok-workflow/update?action=status   → 200
    {"ok":true,"action":"status","update":{"current":"0.13.30","latest":"0.13.31",
     "latestSource":"remote","canInstall":true,
     "command":"dsh plugin --profile <profile> add github:free6589/dsh-grok-workflow#v0.13.31"}}

    POST /grok-workflow/update                 → 200
    {"ok":true,"action":"install","installed":{"from":"0.13.30","to":"0.13.31",
     "spec":"github:free6589/dsh-grok-workflow#v0.13.31","saveExact":true}}

The four card states run 3 saw, in order (`run3-result.json`):

| step | `data-gw-update-phase` | what the card said | primary button |
| --- | --- | --- | --- |
| `opened` (no click yet) | `check` | 已装 0.13.31，最新发布 0.13.31 … 已是最新版本 | `update-check` 检查有没有新版本 |
| `after-check` | `check` | 已装 0.13.30，最新发布 0.13.31 … 有新版本可装：0.13.31 | `update-install` 安装 0.13.31 |
| `clicked-install` | `installing` | 正在安装…（`disabled`, `data-gw-update-busy="true"`） | `update-install`, disabled |
| `settled` | none (`phase` null) | 已装 0.13.31 … 已是最新版本 | only `update-copy` |

Two details worth stating exactly rather than glossing:

- In `opened` the card reads **0.13.31** while the profile on disk is pinned to
  `0.13.30`: the first paint shows the static baseline the shipped build knows
  without asking anyone, and only an answer moves it. That is the designed resting
  state, not a stale read.
- In `settled` the `data-gw-update-phase` attribute is **gone** (`phase` null,
  `data` holding only `gwUpdate`): by then the newly installed build's own card has
  replaced the one under test, so the phase the dev build would paint is not what is
  being observed. See boundary 2 below.

Request log of the page, in full (`run3-result.json`, `requests`):

    GET  http://127.0.0.1:18332/grok-workflow/update?action=status
    POST http://127.0.0.1:18332/grok-workflow/update

Exactly one GET and exactly one POST, both triggered by clicks; no document request
after the first load, so the page never reloaded. Run 1 (port 18330) produced the
same two calls and the same four states (`run1-result.json`; that harness version
recorded `requests` but not `responses`).

Read back from disk after the run (`run3.out`):

    PROFILE_SPEC="github:free6589/dsh-grok-workflow#v0.13.31"
    INSTALLED_VERSION=0.13.31

The profile's dependency is the pinned tag after the click. What it said **before** the
click is not archived (the fixture installed a `file:` copy and then only changed a
manifest version), so the "floating spec → pinned tag" half of that story is not
claimed here; the pinned side is. The lockfile the install wrote names the tree it
fetched:

    dsh-grok-workflow:
      specifier: github:free6589/dsh-grok-workflow#v0.13.31
      version: https://codeload.github.com/free6589/dsh-grok-workflow/tar.gz/d0c1383e91efb0440463a3e9482ef93490b3eb7c

`d0c1383` is the `v0.13.31` release commit (see `docs/knowledge/STATE.md`, 2026-11-24),
so the bytes that landed are that tag's tree, not "whatever resolved that day".
`node_modules/dsh-grok-workflow/package.json` reads `0.13.31`.

## 6. The gate that ran beside this soak

`ci.out` (archived, 31180 bytes) is `npm run ci` in this worktree on `c951dbf`,
**EXIT=0**:

- `oxlint src test` → `Found 36 warnings and 0 errors.`
- `verify:lib` → `lib/ at c951dbf is the build of src/ at c951dbf (245 files, byte-identical)`
- `vitest` → `Test Files 101 passed (101)`, `Tests 1910 passed (1910)`
- inside that run: `test/update-surface.spec.ts (29 tests)`,
  `test/update-entry.spec.ts (20 tests)`

Baseline for the comparison: the `v0.13.31` release ran 100 files / 1866 tests, so
this branch adds 1 file / 44 tests.

## 7. Differential, and what is honestly not a differential

There is no before/after code differential here, and inventing one would be the
dishonest move. The "before" is the card the previous release shipped: `main` at
`c6a3611` has **zero** occurrences of `update-install` in its client
(`git show c6a3611:src/client/index.js | grep -c update-install` → `0`), because the
card could only print a command for the operator to paste into a terminal. So the
differential is qualitative and complete: before, no button and no route; after, one
click and one POST that moved the profile from `0.13.30` to the published `0.13.31`
with the version read back from disk. The unit-level red-then-green evidence for both
lanes is in `docs/knowledge/VALIDATION.md`, not here.

**Honest boundaries**

1. **The pinned manifest.** The installed copy's version was set to `0.13.30` by hand
   so the button had a real upgrade to offer (section 3). The install was real; the
   starting version was staged.
2. **The dev build's own `latest` phase is not observable in this browser.** The
   install replaces the running build, so the card that settles is the *installed*
   build's card — which is why `settled` carries no `data-gw-update-phase`. The dev
   build's `latest` phase (nothing newer, or a read-back equal to the target) is
   covered by `test/update-surface.spec.ts` / `test/update-entry.spec.ts`, not by this
   soak. Do not read the settled state as proof of that phase.
3. **The fork logs one pre-existing unresolved entry.** The scratch profile carries
   `dsh-system-prompt-design` as a `link:` dependency pointing outside the scratch
   home (`prepare-install.out`: `+ dsh-system-prompt-design link:../../../../…`), and
   the captured console shows one client entry not activating
   (`@deepseek-ai/dsh-client-ui-account-notifications: pending (waiting for service:
   accountUi)`). Both are properties of the copied live profile, present before this
   feature and unrelated to it; neither touches the update route.
4. **Nothing was touched live.** The live profile `~/.dsh` was not written, reloaded
   or restarted at any point in this block; the instance under test is the scratch
   one, on its own port, killed at the end of each run. Measured read-only afterwards:
   `stat ~/.dsh` mtime **2026-11-22 23:40:20** (two days before this block) and the
   live `web` profile's plugin still `0.13.29`.
5. **No release happened.** No tag, no push, no merge, no Release run: the branch is
   local and unreleased, and `package.json` still reads `0.13.31`.
6. **Run 2 is a harness failure, recorded as such.** The card is replaced under the
   page the moment the installed build takes over, so a Playwright element handle
   read mid-swap throws `ElementHandle.is_disabled: Element is not attached to the
   DOM` (`run2-click.err`, `run2.out`). The harness was fixed (the card lookup now
   tolerates "no card right now"), not the product — and run 2 had already reached
   `INSTALLED_VERSION=0.13.31` from disk before its capture died, so even the lost
   run installed.
7. **Redaction.** Both result files and `run3.out`/`run2.out` carry the
   scratch instance's own web URL, whose `?token=` value is that dead local
   instance's session token. In this directory that value is replaced with
   `<redacted-scratch-token>`; nothing else in those files was edited. No other
   credential is present in any archived file.

## 8. Inventory

| file | bytes | what it is |
| --- | --- | --- |
| `README.md` | this file | the record |
| `ci.out` | 31180 | `npm run ci` on `c951dbf`, EXIT=0 (section 6) |
| `overlay-soak.yml` | 611 | the overlay actually applied: four rows disabled, and why |
| `prepare_soak.sh` | 1581 | packs the build, installs the copy into the fork, pins 0.13.30 |
| `prepare-install.out` | 412 | that install's pnpm output, exit 0 |
| `run_soak.sh` | 2037 | the rig: isolated home, own stores, one instance, one browser run, disk read-back |
| `click_soak.py` | 4533 | drives the real settings page and records every card state and request |
| `run1-result.json` | 3661 | run 1 (port 18330): four states, two requests (no `responses` in this harness version) |
| `run2.out` | 444 | run 2: the harness traceback's summary; profile already at 0.13.31 |
| `run2-click.err` | 1987 | run 2: the full Playwright traceback (element not attached mid-swap) |
| `run3-result.json` | 4294 | run 3 (port 18332): four states, two requests, both responses verbatim |
| `run3.out` | 1348 | run 3: instance URL, click exit 0, `PROFILE_SPEC`, `INSTALLED_VERSION` |
| `run3-0-open.png` | 123321 | run 3, the card on first paint (`check`, 已是最新) |
| `run3-1-checked.png` | 134058 | run 3, after 检查 (`check`, 有新版本可装：0.13.31) |
| `run3-2-installing.png` | 133725 | run 3, one POST in flight (`installing`, button disabled) |
| `run3-3-settled.png` | 133274 | run 3, settled, no page reload |

Both captured command outputs are archived with an `.out` extension, not `.log`: this
repository ignores `*.log` repo-wide (`.gitignore:8`) so a tracked copy cannot use that
suffix. `ci.out` is `.tmp/ci-1.log` byte for byte; `prepare-install.out` is the pnpm
output of the fixture install, byte for byte.

## 9. How to re-check without the scratch

    # 1. the build under test is what was committed
    git status --short --branch                 # clean apart from .tmp/
    sha256sum lib/index.js lib/client.js
    grep -n "lib/ at c951dbf is the build" ci.out

    # 2. the gate numbers
    grep -nE "Found [0-9]+ warnings and 0 errors" ci.out
    grep -nE "Test Files|Tests  " ci.out
    grep -nE "update-surface|update-entry" ci.out

    # 3. the two route calls and the four card states
    python3 -m json.tool run3-result.json | head -40
    grep -n "INSTALLED_VERSION\|PROFILE_SPEC" run3.out

    # 4. the previous release had no install action at all
    git show c6a3611:src/client/index.js | grep -c update-install    # -> 0

The soak itself is **NOT_RUN** in any later block: it needs a forked live profile, a
running instance on a free port, a real Chromium, and a real GitHub fetch. What is
re-checkable anywhere is the gate, the hashes, and everything above.
