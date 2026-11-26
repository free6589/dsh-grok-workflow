# `0.13.52` 发版证据（**released**：`v0.13.52` 已发布，发布提交 **`9cc2e43`**）

repo: `dsh-grok-workflow` · 合并提交 **`ebc5f37`**（`Merge branch 'fix/card-approval' into release/0.13.52`，两父 `226d673` + `22ca3d0`）→
发布提交 **`9cc2e43e0420fc8d26f3533c54b90bb3ca3468fd`** · 附注标签 **`v0.13.52`**（对象 **`9c7ebe3ca62cd90df7158149a22ca88be74ffe3c`** → 剥出 **`9cc2e43`**）·
`main` = `origin/main` = **`9cc2e43`**（从 `226d673` **快进**）· 发布 **2026-11-26T09:14:24Z** ·
<https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.13.52>

**`v0.13.52` 已经发出去了。** GitHub Release 上的唯一资产是 `dsh-grok-workflow-0.13.52.tgz`，
**1021062** 字节、`digest sha256:0df246c80c4cf23079047b393e1a154c4c20abb0ee4c79ecec29494a73f81cab`、state `uploaded`；
非 draft、非 prerelease、`tagName` = `v0.13.52`、`targetCommitish` = `main`；两个远端 run
（`/actions/runs/45789924394` 是 `main` 的 CI、`/actions/runs/45789939770` 是 `v0.13.52` 的 Release）都 **success**。
**发布门禁是本目录的 `gate-release-9cc2e43.out`**——在**已发布的树**（`9cc2e43`）上跑的、也是这一版**唯一一次**完整门禁。

## 1. 文件

| 文件 | 行 / 字节 | `sha256` | 是什么 |
| --- | --- | --- | --- |
| **`gate-release-9cc2e43.out`** | **412 / 25120** | **`d1171a72d5aac97ca67d18ca3bc2d05ba65d349217eae8e81c1c7f8556e08575`** | **发布提交 `9cc2e43`** 上的 `TMPDIR=$PWD/.tmp npm run ci`——**末行 `GATE_EXIT=0`**（第 412 行）；`Found 15 warnings and 0 errors.`（第 167 行）、`lib/ at 9cc2e43 is the build of src/ at 9cc2e43 (293 files, byte-identical)`（第 174 行）、`client bundle: 386534 bytes → lib/client.js`（第 173 / 183 行）、`Test Files 105 passed (105)`（第 407 行）、`Tests 2060 passed (2060)`（第 408 行）、`Duration 101.40s`（第 410 行）。**这一份是发布门禁** |

原件一份；本索引只补出处。行数 / 字节数 / `sha256` 是写这一份时自己 `wc -lc`、`sha256sum` 读的，
与派单 foreman 交付时报的值逐字相同（`412 / 25120 / d1171a72…`）。转录自己写下的身份也对得上：
第 2 行 `# HEAD: 9cc2e43e0420fc8d26f3533c54b90bb3ca3468fd`、第 4 行 `# command: TMPDIR=$PWD/.tmp npm run ci`、
第 3 行 `# started: 2026-11-26T17:10:56+08:00`。

## 2. 门禁读数（`CONFIRMED`，读的就是 `gate-release-9cc2e43.out`）

| 读数 | 值 | 行号 |
| --- | --- | --- |
| `Found N warnings and 0 errors.` | `15 warnings and 0 errors` | 167 |
| `verify:lib` | `lib/ at 9cc2e43 is the build of src/ at 9cc2e43 (293 files, byte-identical)` | 174 |
| `client bundle` | `386534 bytes → lib/client.js` | 173（`verify:lib` 那一步）、183（`npm run build` 那一步） |
| `Test Files` | `105 passed (105)` | 407 |
| `Tests` | `2060 passed (2060)` | 408 |
| `Duration` | `101.40s`（`transform 2.06s` / `import 8.03s` / `tests 81.74s`） | 410 |
| **末行** | **`GATE_EXIT=0`** | **412** |

**这条门禁跑在要发布的树 `9cc2e43` 上，不是分支树上、也不是别的提交上**；`AGENTS.md` §12 不允许在同一个版本里重跑第二遍，
所以**这是这一版唯一一次完整门禁**——写这一份的这一轮**没有重跑任何套件**，只逐行复核了这份转录（`wc -lc` + `sha256sum` + 关键行）。

**与上一版（`0.13.51`）的算术**：用例 `2057 → 2060`（**+3**），测试文件 `105 → 105`（不变），
lint 读数与上一版同值（`15 warnings / 0 errors`），`lib/` 文件数 `293 → 293`（不变），
客户端 bundle `386534 → 386534` 字节（**这一版没动浏览器包**，`lib/client.js` 里那两行是版本字符串替换）。
Release 资产 `1019833 → 1021062`（**+1229**）。

## 3. 交付链条（`CONFIRMED`，`git` 侧）

| 提交 | 父 | stat | 内容 |
| --- | --- | --- | --- |
| `226d673` | — | — | `main` 的发版基线（= `0.13.51` 收口之后那一颗记忆提交） |
| `b0c3f5d` | `226d673` | 16 文件 / +165 −24 | 卡片点头在账本里改记 `question-reply`：源码 + 用例 + `lib/` 同在一颗提交 |
| `22ca3d0` | `b0c3f5d` | 12 文件 / **+505** | 记忆 + 证据：`docs(memory): record the card-approval kind, D-172 and the two-run evidence` |
| **`ebc5f37`** | `226d673` + `22ca3d0` | 28 文件 / +670 −24 | `Merge branch 'fix/card-approval' into release/0.13.52`（**零冲突**） |
| **`9cc2e43`** | `ebc5f37`（**单亲**） | 8 文件 / **+24 −22** | `chore(release): prepare v0.13.52`：`CHANGELOG.md`、`README.md`、`README.zh-CN.md`、`docs/LOCAL-TESTING.md`、`lib/client.js`、`package-lock.json`、`package.json`、`src/client/index.js` |

**「解冲突」这一步是一次经过验证的空操作**：功能分支的基点**正是**当时的 `main` 尖端 `226d673`
（写这一份的这一轮自己读 `git merge-base 226d673 22ca3d0` = `226d673…`、`git merge-base --is-ancestor 226d673 22ca3d0` 为真），
所以合进去时**没有一段需要人解**。**发布本身不是快进**：`main` 从 `226d673` 走到 `9cc2e43` 用的是 `git merge --no-ff` 到发布分支再推，
推送输出逐字 `226d673..9cc2e43  main -> main`（**派单记录**）；写这一份的这一轮自己读到的是远端
`git ls-remote origin refs/heads/main` = `9cc2e43…`、`git rev-parse main origin/main HEAD` 三处同为 `9cc2e43…`。

**这一版用户看到的一件事**（`CHANGELOG.md` 的 `## [0.13.52] - 2026-11-26` 那一节）：**点问题卡片开出来的块，记录里现在写明这是点卡片点的**——
批准的来源记成 `question-reply`，不再和打字确认混成同一个 `user`；`quote` 里仍然只有你自己说的那句话。**没有要迁移的东西。**

## 4. 远端两个 run（`CONFIRMED`，`gh run view` 只读读的）

| run | id | 触发 | 头分支 / sha | 结论 |
| --- | --- | --- | --- | --- |
| CI | **`45789924394`** | `push` | `main` / `9cc2e43` | `completed` / **`success`**（两个 job：`Node 22`、`Node 24`） |
| Release | **`45789939770`** | `push` | `v0.13.52` / `9cc2e43` | `completed` / **`success`**（`2026-11-26T09:13:17Z` → `09:14:28Z`，job `Validate and publish v0.13.52`） |

**没有 `--force`、没有移动任何已发布的标签**：推标签输出 `* [new tag]         v0.13.52 -> v0.13.52`、
以及「`v0.13.52` 推之前在本地与远端都不存在」——**这两句是派单记录**，推送当场没有留转录、写这一份的这一轮也无法回读；
**这一轮推后自己读到**的是远端 `refs/tags/v0.13.52` = 对象 `9c7ebe3c…`、其 `^{}` = `9cc2e43…`，**远端只有这一条**。

## 5. 资产与 Release 正文

| 版本 | 资产 | 字节 | `digest sha256` |
| --- | --- | --- | --- |
| `0.13.51` | `dsh-grok-workflow-0.13.51.tgz` | `1019833` | `1520964c…`（见 `release-0.13.51-2026-11-26/README.md`） |
| **`0.13.52`** | **`dsh-grok-workflow-0.13.52.tgz`** | **`1021062`** | **`0df246c80c4cf23079047b393e1a154c4c20abb0ee4c79ecec29494a73f81cab`** |

**差值 +1229 字节**（`1021062 − 1019833`）。Release 正文非空：**19 行 / 1856 字节**
（`gh release view v0.13.52 --json body` 读到的字符串自测：1856 字节 UTF-8、18 个换行、末尾带换行；
`--jq .body` 打出来会比它多一个换行，所以那条 `wc -lc` 读到的是 `19 / 1857`），内容就是 `CHANGELOG.md` 的 `## [0.13.52]` 那一节。

## 6. 本轮「没发生的」（照实）

- **`NOT_RUN`** — 第二遍整份门禁（`AGENTS.md` §12）：这一版**只有 §2 那一份**，没有第二份。
- **`NOT_RUN`** — 真机 soak：`0.13.52` 发的是卡片点头的记账来源，块里那一轮已经在真机上做过两轮对照
  （`.rsi/evidence/card-approval-2026-11-26/`），**发布这一轮没有再跑**；
  监工的**模型判断**那条腿（`src/supervisor/verdict.ts`）**至今一次都没有在真机上跑过**，这条缺口随这一版原样带下去。
- **`NOT_RUN`** — npm publish：本仓库不发 npm，发布面只有 GitHub Release。
- **`BLOCKED`** — `AGENTS.md` §13 的 live 档案升级：本会话 `workspace-write`、`~/.dsh` 在工作区外、审批提示被禁用。
  探测 `: > ~/.dsh/.release-probe-0.13.52` 被拒（`Read-only file system`），**没写、没重试绕过、没重载、没重启、3080 端口没碰**。
  只读看到的现状：live 那条插件行是**浮动的** `github:free6589/dsh-grok-workflow`（`~/.dsh/profiles/web/package.json` 的 dependencies 里，
  没有钉 tag），装着的副本读作 **`0.13.48`**。要做的就一条：把它钉到**确切的 `v0.13.52`**、读回版本必须是 `0.13.52`，读不回就**回滚那一行**。

## 7. 转录没有改动

`gate-release-9cc2e43.out` 是 foreman 当场用 `tee` 落下的原件，**写这一份索引时没有编辑、没有重排、没有截断、没有移动、没有改名**：
写之前读、写之后读，两次 `wc -lc` + `sha256sum` 都是 **`412 / 25120 / d1171a72d5aac97ca67d18ca3bc2d05ba65d349217eae8e81c1c7f8556e08575`**。
本目录里多出来的只有这份 `README.md`。
