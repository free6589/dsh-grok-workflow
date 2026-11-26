# Horizontal fork panel — real-machine soak (2026-11-26/27)

Verified: the progress tab's panel on branch **`feat/task-fork`** (HEAD `fe6d631`,
`v0.13.53-1-gfe6d631`, no tag on it, package version `0.13.53`) — a horizontal fork
`起点 → 规划 → 任务卡（6 盏灯）→ 每次调用一条分支 → 汇总 → 验收（5 盏验）→ 终点`, laid out from
its own `flowchart LR` text, with the user-acceptance click gone.

This is the **fourth and final capture of the block**, on the bundle that carries all four fixes
(`c6387e1b…`). Everything in this directory is from that bundle. The three earlier bundles are
history only and are listed in §6, with which round found which defect.

Nothing outside `.rsi/evidence/task-fork-2026-11-26/` was written in the repo. `~/.dsh` was never
written, installed into or restarted.

## 1. Identity (each line is a command's own output; `run.json` repeats them)

| Item | Reading |
| --- | --- |
| commit | `fe6d6313e99bf0c48ca5af0e0840630feaba9e4e`, `git describe` = `v0.13.53-1-gfe6d631` |
| package version | `0.13.53` |
| tgz | `dsh-grok-workflow-0.13.53.tgz` — **1 033 214 B**, `sha256 b5b7d208345b0dfc6e1928b11ea05cff288340bd5fe2f6fc5089b132841f3c46`, 164 files |
| client bundle | `lib/client.js` — **422 685 B**, `sha256 c6387e1b8a3f795e20edad16220e569f5b36b957fa3a1e35c60d0d34bfbe0186`; `cmp lib/client.js src/client/index.js` → identical (the same sha) |
| server bundle | `lib/index.js` — 27 956 B, `sha256 ac69070e3eda3889a6bb36a9f967512efb5843e2e1ffc9ac80b32021defa2c32` (not touched by this block) |
| install | `DSH_HOME=<clone> dsh plugin --profile web-clone add file:<abs>/.tmp/soak-fork/pack4/dsh-grok-workflow-0.13.53.tgz` |
| pin written | `file:<abs>/.tmp/soak-fork/pack4/dsh-grok-workflow-0.13.53.tgz` — that exact file, not a range, not a link |
| installed version | `0.13.53` |
| installed client sha | `c6387e1b…` — equals the worktree |
| installed index sha | `ac69070e…` — equals the worktree |
| symlinks inside the installed package | **0**; `readlink -f` lands inside the clone |
| isolated home | `.tmp/soak-fork/dsh-home`, `cp -a` of `~/.dsh/profiles/web`: 8 300 entries, 6 links (3 repaired to their live targets, 1 left broken — §6) |
| port | **3412** (`ss -ltn` free before boot; 3411 never touched) |
| runtime | Node v26.8.1 / npm 11.19.0 / dsh 0.2.2-rc.3 |
| boot line | `dsh web: http://127.0.0.1:3412/?token=<redacted>` |

The model key lived only as an environment variable of the booted process
(`set -a; . ~/.dsh/bifrost.env; set +a`); it appears in no file this round wrote.

## 2. The run

One real model call to `grok_workflow`, three independent tasks each writing a real file, prompt
verbatim (same as the task-panel block):

```text
用 grok_workflow 工具跑一个工作流，拆成三个互相独立、可以并行的任务，每个任务都要真的写一个文件：任务一：写 notes.md，内容是三行安装步骤；任务二：写 test.txt，内容是一行 hello；任务三：写 third.txt，内容是一行 bye。三个任务并行跑，不要串行；跑完把每个任务写了什么汇总一下。
```

- duration **136.6 s** from send to done; parent session
  `session-557f7319-ffe1-4879-a7f3-2e8670b09104`, 14 child sessions beside it in the run's
  session folder (1 parent + 14 directories, `find -newermt`).
- the three files, measured with `stat` after the run:

| file | bytes | sha256 | content |
| --- | --- | --- | --- |
| `notes.md` | **90** | `29723e60…a986b` | `1. 安装依赖：npm install` / `2. 构建项目：npm run build` / `3. 启动服务：npm start` |
| `test.txt` | **6** | `5891b5b5…6be03` | `hello` (one line) |
| `third.txt` | **4** | `abc6fd59…916df` | `bye` (one line) |

The run is visible in the session: the sidebar entry is in every shot, and
`phone-native-390-done.png` reaches it the way a phone user would (sidebar → session →
`更多会话视图` → `进度`).

## 3. Screenshots

| file | state | viewport / pixels | what is in it |
| --- | --- | --- | --- |
| `desktop-1500-running.png` | 进行中 (12.2 s) | 1500×1600 | `第 3 步，共 7 步`; 起点 → 规划 → three task cards with six rings each, three 执行 branches, then 汇总 / 验收 / 终点; no dock button |
| `phone-390-running.png` | 进行中 (14.4 s) | 390×844 | the same DOM at 390: the figure scrolls inside its own box, the page does not |
| `desktop-1500-done.png` | 已完成 (136.6 s) | 1500×1600 | `第 7 步，共 7 步`; nine branches (执行/检查/复核 per task); 汇总 whole with `第 2 稿` on its own row; 验收 with its five checks; no dock button, no `收下这版` |
| `phone-390-done.png` | 已完成 (138.7 s) | 390×844 | the same done DOM at 390, taken before anything was clicked |
| `desktop-1500-node-open.png` | 已完成 + card `t1` opened (141.9 s) | 1500×1600 | task 1's call list: **white, opaque**, three rows (`1:02 执行 做完 打开子会话`, `1:02 检查 过了`, `1:03 复核 通过`) each with its title line; 9 wires lit, 20 dimmed; no card shows through |
| `phone-390-node-open.png` | same, at 390 (143.6 s) | 390×844 | the same opened state at 390 |
| `phone-native-390-done.png` | 已完成, phone-native page load (164.5 s) | 390×844 / 780×1688 | a separate 390×844 `/ isMobile / hasTouch` context, panel opened through the strip's `更多会话视图` menu |

`desktop-1500-opened.png` is the panel one instant after the view opened, before the first event
row — a by-product of the driver, not one of the states the block asks for.

## 4. Readings — read out of the DOM beside each screenshot

`readings.json` holds one `evaluate` per entry, issued at the shot's moment; its `note` says so and
its `assert` block compares those raw numbers against the block's expectations, from the same
evaluate.

| shot | width | chip | pnodes | edges | `[data-current]` | rings | checks | dock text | dock-fill | stuck | calls open | trace active/dim | doc w | figure w |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| desktop-1500-running | 1500 | 进行中 | 11 | 12 | 1 (`t1_s1`) | 18 = 3×6 | 5 | `` (empty) | 0 | absent | 0 | 0 / 0 | 1500 = 1500 | 1213 = 1213 |
| phone-390-running | 390 | 进行中 | 11 | 12 | 1 (`t1_s1`) | 18 = 3×6 | 5 | `` | 0 | absent | 0 | 0 / 0 | 390 = 390 | 1078 / 383 |
| desktop-1500-done | 1500 | 已完成 | 17 | 24 | 1 (`end`) | 18 = 3×6 | 5 | `` | 0 | absent | 0 | 0 / 0 | 1500 = 1500 | 1213 = 1213 |
| phone-390-done | 390 | 已完成 | 17 | 24 | 1 (`end`) | 18 = 3×6 | 5 | `` | 0 | absent | 0 | 0 / 0 | 390 = 390 | 1078 / 383 |
| desktop-1500-node-open | 1500 | 已完成 | 17 | 24 | 1 (`end`) | 18 = 3×6 | 5 | `` | 0 | absent | 1 | 9 / 20 | 1500 = 1500 | 1213 = 1213 |
| phone-390-node-open | 390 | 已完成 | 17 | 24 | 1 (`end`) | 18 = 3×6 | 5 | `` | 0 | absent | 1 | 9 / 20 | 390 = 390 | 1078 / 383 |
| phone-native-390-done | 390 | 已完成 | 17 | 24 | 1 (`end`) | 18 = 3×6 | 5 | `` | 0 | absent | 0 | 0 / 0 | 390 = 390 | 1078 / 383 |

Detail the table cannot carry:

- **ring states, done run**: 6 rings per task card, all `done` (规划/执行/检查/复核/验收/汇总);
  `readings.json` keeps the per-ring `key`/`state` pairs for every entry.
- **check states, done run**: 验收 carries exactly five — `machine=done`, `model=done`,
  `isolated=pending`, `human=pending`, `ledger=pending`. The last three are reported in the run's
  own words rather than by a leg and this run reported none of them, so they stay hollow. Shipped
  semantic, not a regression.
- **headline**: done `第 7 步，共 7 步` (no eta clause once ended); running
  `第 3 步，共 7 步 · 还剩约 2 分 30 秒`.
- **graph text**: first line `flowchart LR`; 17 node lines = 17 DOM pnodes, 24 edge lines = 24 DOM
  edges, every edge endpoint declared, one connected component, no unparsable line — same
  assertions in all seven entries. The end node is written `finish` in the text, read back as
  `end` in the DOM by the parser's own id map.
- **no sideways scroll of the page** anywhere (`documentElement.scrollWidth === clientWidth`).
  At 390 the figure is wider than its box (1078 vs 383): the picture scrolls inside the panel.
- **console / page errors**: 0 and 0 in both browser sessions (`console.json`).

### 4.1 The opened call list: opaque, on top, nothing behind it visible — true

Plainly: **yes, on this bundle the open shot shows an opaque list and the sibling cards are not
visible through it** — `desktop-1500-node-open.png`, and `phone-390-node-open.png` at 390.
Measured, not eyeballed:

- **computed background** (`open-background.json`): `rgba(0, 0, 0, 0)` → **`rgb(255, 255, 255)`**
  at both widths. The rule now asks for
  `var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base, Canvas))`, and the element resolves
  `--dsw-alias-bg-layer-1: #fff` / `--dsw-alias-bg-base: #fff`. The two names the earlier rule
  asked for — `--dsw-alias-bg-elevated`, `--dsw-alias-bg-l1` — still compute to `null` in this
  theme, which is exactly why that version fell through to transparent. (`previousRoundsValue` in
  that file keeps the old `rgba(0, 0, 0, 0)`, quoted from the previous round because that bundle
  is deleted and was not re-measured.)
- **stacking** (`open-stacking.json`): the open card computes `z-index: 4`, every other card
  `auto`; `document.elementsFromPoint` at the centre of all three rows (both widths) returns the
  row itself (`li.gw-progress-log-row`, owner `t1`, inside `[data-gw-progress-node-calls]`).
- the cards really are behind it: `cardsOverlappingListBox` shows `t2` and `t3` overlapping the
  list's box by 240×56 px at 1500 and 240×37 px at 390 — so the white fill is what hides them,
  and it does.

## 5. Environment changes, all inside the clone

Needed for a real run on this machine; also in `run.json`:

1. `worker` / `verifier` / `supervisor` roles and `guardianModel` re-pinned from `agent2api/…` to
   `bifrost-responses/opencode-go/muse-spark-1.3-contributor` — no `AGENT2API_API_KEY` exists
   here, and without the pin every child call dies before it starts;
2. the removed `mode: triage` key dropped;
3. the fresh isolated home had no workspace, so its default workspace was seeded to
   `.tmp/soak-fork/work` (the DSH default, `~/Documents/deepseek-harness/default-workspace`, is not
   writable from this session's sandbox);
4. three broken package symlinks in the clone repaired to their live absolute targets
   (`dsh-system-prompt-design`, `dsh-token-usage`, `@local/control-ledger`).

## 6. History of this block — four defects, four rounds

| # | defect | found by | fixed in | how it was proven here |
| --- | --- | --- | --- | --- |
| 1 | 汇总 capsule clipped to `汇` (the `第 n 稿` badge took the row) | capture 1, bundle `f0d664ce` | `5338503a` | done shots of captures 2-4: word whole, badge on its own row |
| 2 | opened call list collapsed to a ~30 px column, one character per line | capture 1, bundle `f0d664ce` | `5338503a` | open shots of captures 2-4: one readable line per row |
| 3 | sibling task cards painted **over** the open list (list below them in stacking order; hit-testing returned the cards) | capture 2, bundle `5338503a` | `a33a1d4b` (open card `z-index: 4`) | `elementsFromPoint` in `open-stacking.json` |
| 4 | list see-through, so the cards behind it stayed legible through it | capture 3, bundle `a33a1d4b` | `c6387e1b` (background token) | computed `rgb(255, 255, 255)` in `open-background.json` + the open screenshot |

No count changed across the four captures: running 11 pnodes / 12 edges, done 17 / 24, 18 rings,
5 checks, dock empty with `dock-fill` 0, no stuck line, one connected component, page widths
unchanged. Only the bundle's own size moved: 419 656 B (capture 1) → 422 054 B (capture 2) →
422 689 B (capture 3) → 422 685 B (this one).

## 7. Limitations, verbatim — no softening

- **The phone pass is a viewport resize, not a device** — except `phone-native-390-done.png`, which
  is a real 390×844 `/ isMobile / hasTouch` context opened through the strip's menu. The native
  *running* state is **NOT_RUN**: the native context was first used after the run had finished, and
  a native running shot would cost a second live model call.
- **The waiting state** (`等你点头` + `开工`) is **NOT_RUN**: the run left it inside the first poll,
  and the block only asks for running / done / opened. The done run's empty dock and `dock-fill` 0
  are observed; the waiting button is asserted from source only.
- **No attempt branches on screen**: all three tasks succeeded first try in this run, so no
  `· 第 n 遍` branch exists in this picture and that labelling stayed unexercised.
- **`desktop-1500-opened.png` shows an empty panel** (shot before the first event row). Kept for
  honesty, not as a state.
- **`node_modules/git` in the clone is a broken symlink**, exactly as in the live profile
  (`../github.com:free6589/dsh-grok-workflow.git`); unused at runtime here.
- **`~/.dsh` and `~/.dsh/profiles/web` both moved during this block, and none of the moves is this
  round's** — see `redline.txt`: `cordis.patch.yml` at 00:41:08 and again at 01:01:27,
  `package.json` at 00:19:54, `cordis.yml` at 00:20:53, plus pnpm lock / node_modules /
  `.plugin-manager` at 00:14:34. That is the live profile being operated on by someone else (its
  own settings writes and another block's plugin work) while this block was open.
  `~/.dsh/profiles` is unchanged; 3080 answered 401 before and after; the live plugin row still
  pins `github:free6589/dsh-grok-workflow` @ `0.13.53` with an installed client sha `1fb003f3…` —
  not this build.
- **`serena` never starts in this sandbox** (`OSError: [Errno 30] Read-only file system:
  '/home/fish/.serena/logs/2026-11-26'`); `failOnStartupError` is false, so the instance boots
  without it. Same in the task-panel block; unrelated to this change.
- **`dsh plugin add` warned about an unrelated bundle**: `dsh-personal-todo@0.1.0 is incompatible
  with dsh 0.2.2-rc.5` and stays installed-but-denied at startup unless a version exemption is
  granted. Not this plugin.

## 8. Files in this directory

| file | what it is |
| --- | --- |
| `readings.json` | every DOM reading, one entry per screenshot, with its `assert` block and the `note` |
| `run.json` | the run's facts from the filesystem and commands: identity, prompt, the three files with sizes and shas, session id, clone details, environment changes |
| `open-stacking.json` | computed `z-index`/`position` of every card, `elementsFromPoint` at the centre of each call row, and the geometric overlap of each closed card with the list's box |
| `open-background.json` | the list's computed `background-color` at both widths, the tokens that decide it, and the previous round's value for comparison |
| `console.json` | `consoleErrors` / `pageErrors` for both browser sessions |
| `interaction.json`, `phone-native.json` | which card was opened; which path the phone-native pass took |
| `redline.txt` | `stat` of `~/.dsh`, `~/.dsh/profiles`, `~/.dsh/profiles/web`, the 3080 answer and the live plugin row, from the block's start through teardown, with the note on the moved mtimes |
| `capture.mjs` | the Playwright driver that produced the screenshots and `readings.json` |
| `*.png` | the seven screenshots listed in §3 |

`../mock/` (sibling of this directory) is not part of this soak: it is the preview render another
worker of this block produced from a hand-written recorder stream. Its own README says the same;
nothing in it is quoted here as a real-page result.
