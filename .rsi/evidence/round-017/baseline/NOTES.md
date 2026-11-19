# Round 17 · 基线审计 — NOTES

**目的**：建立 round 17 的唯一可信起点。本目录只记录观测，不改代码、不改记忆文件、不提交。

- **工作目录**：`/home/fish/projects_mine/dsh-grok-workflow`
- **采集时间**：2026-11-19T08:38:04+08:00 — 08:41+08:00
- **写入范围**：仅 `.rsi/evidence/round-017/baseline/`（`git status` 里本目录全部是 `??`）

## 1. 定基线（`CONFIRMED`）

| 项 | 值 |
| --- | --- |
| `HEAD` | `4db78f41f00416abe55baa1ec9403c4fa1a63379` |
| `origin/main`（本地 remote-tracking） | `4db78f41f00416abe55baa1ec9403c4fa1a63379` |
| `git ls-remote origin refs/heads/main`（走网络） | `4db78f41…379 refs/heads/main` |
| `HEAD == origin/main` | **IDENTICAL**（本地引用与远端一致，不是「以为推了」） |
| 分支追踪 | `## main...origin/main`（无 ahead/behind 标记） |
| `HEAD` 提交 | `chore(rsi): record the round-16 record commit and its green CI run`，fish，2026-11-19 08:04:02 +0800 |

## 2. 标签（annotated，逐个 peel）

| tag | tag object | type | peel（commit） | commit subject |
| --- | --- | --- | --- | --- |
| `v0.11.13`（对照） | `bac26e3f31a4400609b8095cf8033235f2b60946` | tag | `7a79efb75bbad37930cab4c3c76a8bcb3822d1db` | docs(release): land round-13 gate work + release v0.11.13 (RSI round 13) |
| `v0.11.14` | `2a7b0748576f3b4b6b8ccfc655f8e53b4ad72b80` | tag | **`20eafea150d34d18dc99bae7523db62c1d8fcb38`** | feat(loop): Host-scheduled repeat-run surface + bilingual docs (RSI round 14) |
| `v0.11.15` | `e52a8f4c415a7619891be4fbad04c247439baba9` | tag | **`50c0321e371db076908d5fb6cec94bb8be25f37b`** | chore(release): v0.11.15 — rebuild the published artifacts from their own source (RSI round 15) |

- `v0.11.15` 是 `HEAD` 的祖先；`v0.11.15..HEAD` = **6** 个提交：
  `fd56fd9` → `b4299bc` → `37cb0fc` → `e11d100`(round 16 主体) → `9567036` → `4db78f4`。
- `git cat-file -t` 三个标签全是 `tag`（annotated），peel 与 `ROUND.md` Round 15「Landed as」记录的
  `v0.11.14` peel `20eafea`、`v0.11.15` peel `50c0321` **逐字一致**。
- `gh release list`：`v0.11.15`（Latest）、`v0.11.13`、`v0.11.12` … 直到 `v0.11.7`，**列表里没有 `v0.11.14`**。
  「`v0.11.14` 无 Release」由第三方只读接口再确认一次（`D-070` 的既有结论，本轮不改）。

## 3. 树状态

- `git status --porcelain --untracked-files=no` → **0 行**：没有任何已跟踪文件被修改或暂存。
- `git diff --stat` 与 `git diff --cached --stat` 均空。
- `git status --porcelain -uall` → 20 行（08:40:56 那一刻；本轮其它片正在并发写入，这个数会涨，
  08:42:50 已是 32 行、之后仍在涨），**全部是 `??`**，分三类：
  1. `.rsi/evidence/round-017/`（本轮各片的证据，含本目录）；
  2. `.rsi/evidence/segment-5/final-check-agent57.{md,txt}`（上一轮遗留的检查报告）；
  3. `settings-simple-mock.html`（`ROUND.md` Round 16「Allowed untracked」明确列为**故意不入库**的草稿）。
- `git stash list` 有一条陈年 `stash@{0}: On release/0.6.0: temp-gate-fix`（与本轮无关，不动）。
- 结论：**干净树**（tracked 0 改动），dirty 只发生在未跟踪的 `.rsi/evidence/` 与一个被明文豁免的 mock。

## 4. 代码与记忆没有漂移（hex 指纹）

`fingerprints.sha256` 里四个文件的 sha256 前 16 位，与 `STATE.md:1291-1293` 记录的 round 16 开工
指纹**完全相同**：

| 文件 | 本轮 sha256 前 16 位 | `STATE.md` round 16 记录 |
| --- | --- | --- |
| `src/loop.ts` | `55483a52622f0f46` | `55483a52622f0f46` ✓ |
| `src/loop-surface.ts` | `6543545e5e3f6310` | `6543545e5e3f6310` ✓ |
| `src/loop-brakes.ts` | `34f56e7095abf6cd` | `34f56e7095abf6cd` ✓ |
| `src/client/index.js` | `d290765594d62a3b` | `d290765594d62a3b` ✓ |

`src/client/index.js` 的 sha256 还等于 `lib/` 清单里 `lib/client.js` 的 sha256
（`d290765594d62a3b…`）——客户端源码是浏览器半边的构建输入，这个相等是预期的。

## 5. 所用命令（可复跑）

```bash
cd /home/fish/projects_mine/dsh-grok-workflow
git rev-parse HEAD; git rev-parse origin/main
git ls-remote origin refs/heads/main
git status --short --branch
git status --porcelain=v1 --untracked-files=no | wc -l
git status --porcelain=v1 -uall
git diff --stat; git diff --cached --stat; git stash list
for t in v0.11.13 v0.11.14 v0.11.15; do
  git rev-parse "$t"; git cat-file -t "$t"; git rev-parse "$t^{commit}"
  git log -1 --format='%s%n%ci' "$t^{commit}"
done
git merge-base --is-ancestor 'v0.11.15^{commit}' HEAD && echo ancestor
git rev-list --count 'v0.11.15^{commit}'..HEAD
git log --oneline 'v0.11.15^{commit}'..HEAD
gh release list --limit 8
sha256sum docs/knowledge/RESEARCH.md docs/knowledge/DECISIONS.md docs/knowledge/STATE.md \
  src/loop.ts src/loop-brakes.ts src/loop-surface.ts src/gate.ts src/config.ts \
  src/client/index.js lib/loop.js lib/loop-brakes.js package.json CHANGELOG.md
grep -n 'callSchedule' src/loop.ts lib/loop.js
ls -l lib/loop.js lib/loop-brakes.js
for f in src/*.ts; do b=$(basename "$f" .ts); [ -f "lib/$b.js" ] || echo "MISSING lib/$b.js"; done
```

## 6. 本轮的取舍与须知

- **没有跑任何构建或测试**。`npm run build` 会重写 `lib/`，与「read-only except evidence」冲突；
  `npm run ci` 的同款结果由同轮的 `ci` 片产出（`.rsi/evidence/round-017/ci/ci.txt`，`CI-EXIT=0`，
  62 文件 / 1139 测试、22 warnings / 0 errors、`verify:lib` 145 文件字节相同），本文件只做**交叉引用**，
  不把它当自己跑的。本轮自跑的命令只有读操作（git / grep / ls / sha256sum / gh release list）。
- `git-state.txt` 生成于本目录已存在之后，因此它自己（`baseline/git-state.txt`）也出现在该文件的
  未跟踪清单里；`NOTES.md`、`memory-vs-code.md`、`loop-artifacts.md`、`go-no-go.md`、
  `fingerprints.sha256` 写得更晚，不在那份快照里。这是时序，不是遗漏。
- `src/index.ts:292` 那条注释：句子从 `:292` 起、在 `:293` 收尾（「an open loop survives a plugin
  reload and an unload deletes it」）。按任务要求**保持原样**，只记位置，不改文案。
- 三片的 go/no-go 见 `go-no-go.md`；其中「第三片」在本轮树上**没有**任何证据目录，无法判定
  （attempt 2 只补出了唯一线索：`ci` 片引用的 tree 外 phase-2，见 `go-no-go.md` 片 C）。

---

## 7. attempt 2 复跑（2026-11-19T08:49–08:53+08:00）

上一版（attempt 1）停在 08:42:50。本版把全部只读命令重跑，结论未变，另外补了三件事。

### 7.1 重测结果（全部与 attempt 1 相同）

```text
git rev-parse HEAD / origin/main / ls-remote  → 4db78f41f00416abe55baa1ec9403c4fa1a63379（三方一致）
git status --porcelain=v1 --untracked-files=no | wc -l → 0
git diff --stat HEAD → 空
git for-each-ref refs/tags/v0.11.15 → tag e52a8f4c… peel 50c0321e…
grep -c callSchedule src/loop.ts lib/loop.js → 11 / 11
git hash-object lib/loop.js lib/loop-brakes.js  vs  HEAD:lib/… → 33f3cb3b… / 3adb6cce… 两组相同
sha256sum（13 个文件）→ 与 fingerprints.sha256 逐行 diff 为空
```

**新增的一点**：`ci` 片在 08:46–08:48 跑过 `npm run ci`（内含 build），`lib/loop.js`、`lib/loop-brakes.js`
的 mtime 因此变成 08:47，但 blob 仍等于 `HEAD`。也就是说「产物不 stale」这次不是静态读出来的，
而是**经过一次真实重建后仍然字节相同**——比 attempt 1 的证据更强。

### 7.2 `heartbeat-live` 在 08:43–08:49 之间长出了投递证据

attempt 1 判「results/ 空、没有投递产物」时是 08:42:50；之后该片跑出了：

- `instance/dsh-home/storages/schedule.json`：一条 `Loop heartbeat` 的 rrule 任务，`status: active`，
  `lastDelivery.deliveredAt = 2026-11-19T00:49:06.884Z`，`messageId = 8193fbae-a85b-400c-adc5-06b30755749f`。
- 会话 transcript（`instance/dsh-home/sessions/…/session.v4.jsonl.zstd`，32 个事件）第 25–32 行：
  `turn/start turn=2` → `user/message` 的 `source = {"kind":"schedule"}`、`id` 与上面那个 messageId 相同
  → `request/header reason=resume` → `assistant/message`（stub 回 `STUB_HEARTBEAT_ROUND_OK`）→ `turn/end completed`。
- `stub/stub-requests.jsonl` 第 2 条：`POST /v1/chat/completions`，`messageCount=8`、`toolCount=33`（含 `grok_loop`）。
- `qa/res-6.json` / `qa/res-7.json`：模型工具开循环、带 actor 开循环都被 `loop/user-only` 拒绝。

边界（写进 go-no-go.md 片 B）：这是 `schedule.run` 的**手动投递**（`lastDelivery.scheduledAt` 早于任务的
`scheduledAt`），模型是 stub，行是 probe 以「无 actor」开的，不是操作者在 GUI 上点的。
收尾用例随后跑过（08:50:45 `forget` deleted 1、08:50:56 `stopall` deleted 1，`res-17` / `res-19`），
但同一时刻又建了新行（`res-16` / `res-21`），且 `probe.log` 在 08:53:47 又记了一次 `probe applied`
——该片仍在跑，判定是快照，不是终态。本审计在 `bwrap --unshare-pid` 里，看不到它的进程，
所以「是否留了后台活」不判。
所以「机制」可判 GO，「真实操作者心跳 / 真模型轮」仍是 NO-GO。

### 7.3 新查到的两条树上事实（不在本片写权内）

1. `README.md:345` / `README.zh-CN.md:334` 仍写 60 文件 / 1081 测试，实测 62 文件 / 1139
   （`ls test/*.spec.ts | wc -l` = 62；测试数见 `ci/ci.txt:359-362`）；两份 README 都没提 `verify:lib`。
2. `heartbeat-live/instance/.token`、`instance/.cookies.json`、`instance/dsh-home/.credentials.yaml`
   三份凭证文件**非空存在**。只做了存在性检查，未读取、未回显任何内容；按 `AGENTS.md` 这批文件
   不能进任何提交，该片收尾时应删除并轮换。

## 8. 结论与边界（不变）

- 基线唯一、树干净、产物不 stale、记忆对得上——四道门 PASS，本片 GO。
- 本片所有自跑命令都是读操作（git / grep / ls / wc / sha256sum / python 读取证据 JSON）。
  `npm run ci`、`npm run verify:lib`、`npm run build` 一律未由本片执行（会重写 `lib/`）。
- 写入只落在本目录：`NOTES.md`、`git-state.txt`、`memory-vs-code.md`、`loop-artifacts.md`、
  `go-no-go.md`、`fingerprints.sha256`。
