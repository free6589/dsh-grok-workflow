# 自动打 tag 发布检查 — 2026-11-22（第 2 轮，agent-90）

结论先说：**现在仍然不能打 tag，但上一轮指出的 `[Unreleased]` 缺口已经补上，剩下的是“功能提交 + 版本五点同步”这类必须由人拍板的动作**。
三条硬事实：① `v0.12.19` 已在 `283577a` 发布，HEAD `bd32506` 只是停止开关与记忆文档，重打就是移动已发布 tag；
② 工作树有 62 个已改 + 20 个未跟踪的 `lib/src/test` 路径（总数 70 `M` / 56 `??`），其中 12 个是未跟踪 `lib/` 产物，撞 release.yml 的“无未跟踪构建产物”闸；
③ 本轮的 `CHANGELOG.md` 顶部已有 `## [Unreleased] / 未发布` 段，4 条中英双语条目，覆盖待发的波次调度、上游凭证交接、协作超时、`guardianModel`。
本轮**没有创建 tag、没有 push、没有发布、没有改版本号**。

- 干跑入口：`node docs/knowledge/evidence/release-tag-check-2026-11-22/release-dry-run.mjs --ref HEAD --tag v0.12.19 --worktree`
- 四个场景输出：`dry-run.txt`；`release.yml` 版本闸实跑：`release-yml-rehearsal.sh` / `release-yml-rehearsal.txt`
- 判定口径来自 `.github/workflows/release.yml`（下称 release.yml），不是自创。

---

## 1. 固件事实（CONFIRMED，均可复跑）

| 项 | 值 | 证据 |
| --- | --- | --- |
| `package.json` 版本 | `0.12.19` | `node -p "require('./package.json').version"` |
| `package-lock.json` 版本 | `0.12.19` | `node -p "require('./package-lock.json').version"` |
| 最新已发布 tag | `v0.12.19`（annotated，tag 对象 `00b45cb4`） | `git rev-parse v0.12.19` |
| tag 指向提交 | `283577a`（progress tab two tracks） | `git rev-parse v0.12.19^{commit}` |
| HEAD | `bd32506`（stop(rsi) 停止开关） | `git log -1 --oneline` |
| `v0.12.19..HEAD` 变化 | 仅 `.rsi/STATE.md`、`.rsi/STOP`、`docs/knowledge/{STATE,HANDOFF}.md` | `git diff --name-only v0.12.19..HEAD` |
| `lib/` HEAD 跟踪文件 | **157**（40 `.js` / 39 `.d.ts` / 78 `.map`） | `git ls-tree -r --name-only HEAD lib \| wc -l` |
| `lib/` 工作树文件 | 169（多出 12 个未跟踪：`timeout`/`upstream`/`waves` 的 js+d.ts+map） | `find lib -type f \| wc -l` |
| `verify:lib` | `lib/ at bd32506 is the build of src/ at bd32506 (157 files, byte-identical)`，exit 0 | `npm run verify:lib`（本轮重跑，01:30） |
| `[Unreleased]` 段 | **存在**，位于 `CHANGELOG.md:6`，4 条条目均带英文与中文 | `grep -n '^## \[Unreleased\]' CHANGELOG.md` |
| `CHANGELOG.md` 本轮改动 | +48 行（顶部新增 `[Unreleased]` 段，未提交） | `git diff --stat -- CHANGELOG.md` |
| 未提交改动 | 62 `M` + 20 `??`（`lib`/`src`/`test`），全仓 70 `M` / 56 `??` | `git status --porcelain --untracked-files=all -- lib src test` |

## 2. 版本校验逻辑（可复述，与源码逐条对应）

release.yml 的版本闸在 **步骤 “Verify tag, package version, and changelog; prepare release notes”**（第 68–96 行），
按顺序做四件事，任何一步失败即 `exit 1`，不会走到 `gh release create`：

1. **tag 形状**（第 74 行）：`^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$`。
   前导零、`rc` 后缀、`v1.2`、`1.2.3`（缺 v）全部拒绝——`v0.2.0-rc.1` 这类历史预发布因此永远不可能被
   release workflow 发布，只能留在历史里（`test/docs-version.spec.ts:93-100` 已把这一点固化成断言）。
2. **tag 版本 == `package.json` 版本**（第 78–83 行）：`${RELEASE_TAG#v}` 与
   `node -p "require('./package.json').version"` 逐字符相等，不做 semver 归一化（`v0.12.190` 不会匹配 `0.12.19`）。
3. **changelog 段存在且非空**（第 84–96 行）：在 `CHANGELOG.md` 里按行找
   `^## \[<version>\](?:\s+-.*)?$`，找不到即 `throw`；从该行向后到下一个 `^## \[` 之间取整段，
   若段内行数 `< 4` 判为空段并 `throw`；通过则把该段原样写入 `release-notes.md`，作为 GitHub Release 正文。
   注意：这一条只认**数字版本**段，`## [Unreleased] / 未发布` 不会匹配，因此它绝不会被当成发布正文。
4. **`--verify-tag`**（第 108 行）：`gh release create ... --verify-tag` 在服务端再确认 tag 真实存在于远端，
   不允许“先发布后补 tag”。

外加两个 `lib/` 闸（第 56–60 行）：`git diff --exit-code -- lib/`（构建后与提交内容必须零差异）和
`test -z "$(git status --porcelain --untracked-files=all -- lib/)"`（构建产物不许有未跟踪残留）。
这两个闸正是本轮工作树状态会撞上的地方：本地 12 个未跟踪 `lib/` 文件若随 tag 提交缺失，CI 会在
“Verify committed build artifacts” 处失败；而 `verify:lib` 之所以在 HEAD 通过，是因为它比的是
**HEAD 的 src 与 HEAD 的 lib**，看不到未提交的 src 新模块。

**闸门本身被实跑过，不是复述**：`release-yml-rehearsal.sh` 把这一段 `run:` 块从 release.yml 原样切出来（去缩进），
在只放 `CHANGELOG.md`、`package.json`、`package-lock.json` 的临时目录里执行——
版本抬到 `0.12.20` 但段名仍是 `[Unreleased]` 时 `Error: CHANGELOG.md is missing a section for [0.12.20]`、exit 1；
把段名改成 `## [0.12.20] - 2026-11-22` 后 exit 0，抽出 47 行 `release-notes.md`。见 `release-yml-rehearsal.txt`。

## 3. `lib/` 一致性 157 文件口径（可复跑）

```bash
npm run verify:lib
# 期望最后一行：client bundle: … → lib/client.js
#              lib/ at <sha> is the build of src/ at <sha> (157 files, byte-identical)
# 期望 exit 0；任何 "differs from its own build" / "missing from HEAD's lib/" / "present in HEAD's lib/ but not emitted" 即失败
```

`scripts/verify-lib.mjs` 的做法（第 45–82 行）：`git archive HEAD` 导出 HEAD 树到临时目录，
把工作树的 `node_modules` 软链进去，跑 `tsc -p tsconfig.build.json` + `node scripts/build-client.mjs`，
再与 `git archive HEAD lib` 逐字节比对，并双向比对文件集合（多出的、缺失的都算失败）。
它**不碰工作树的 `lib/`**，所以有未提交改动时也能跑——这正是它能用于发布前检查的原因。

口径说明：157 是 **HEAD 跟踪的 `lib/` 文件数**，不是磁盘文件数。等 `timeout`/`upstream`/`waves`
三个新模块随 src 一起提交后，该数字会升到 169；**闸门判据永远是“构建产物与提交内容逐字节一致”，
不是 157 这个常数**。把 157 写死进脚本会让下一次正常提交误报，所以口径以命令输出为准。

## 4. tag 命名与“已发布 tag 不可移动”

- 命名：`vMAJOR.MINOR.PATCH`（release.yml:74 + `AGENTS.md:70`）。仓库现有 tag 全部为 annotated
  （`git cat-file -t v0.12.19` → `tag`），带发布说明消息（`0.12.19 — Progress tab two tracks: …`）。
- 不可移动：`AGENTS.md:72` 明确“Never move or overwrite a published tag”。本轮核对的是**事实层面的不可移动**：
  远端 `refs/tags/v0.12.19` 的对象仍是 `00b45cb4…`，与本地 annotated 对象一致，说明历史没有被
  `git tag -f` + 强推改写。
- **没有本地强制手段**：`.git/hooks/` 里只有样例文件（无 `pre-push` / `pre-tag`），`git config` 无 tag 相关规则。
  也就是说“不改已发布 tag”目前只靠纪律 + GitHub 侧设置，本机拦不住 `git tag -f`。
- **未核（本轮不做）**：GitHub 仓库是否开启 tag protection / ruleset。需要仓库管理员权限读取，
  本轮只有只读 release/tag API 访问，未执行该检查，不写成通过。
- 干跑对它有一票否决：`--ref HEAD --tag v0.12.19` → `BLOCK TAG_IS_NEW v0.12.19 already exists at 283577a; moving a published tag is forbidden`。

## 5. 发布前检查清单（顺序执行，任一步红就停）

前置：版本号只在**准备发布的那一次提交**里改，且 `package.json` 与 `package-lock.json` 同步。

```bash
# 0. 分支与干净度：tag 只能打在 main 上，且工作树必须干净
git status --short --branch            # 期望 "## main...origin/main" 且无输出行
git rev-list --count origin/main..HEAD # 期望 0（本地无未推提交）

# 1. 版本五处同步（package.json / package-lock.json / README.md / README.zh-CN.md / CHANGELOG 段名）
node -p "require('./package.json').version"
node -p "require('./package-lock.json').version"
grep -n 'package version in this repository' README.md        # 期望新版本号
grep -n '本仓库声明的包版本' README.zh-CN.md                  # 期望新版本号
grep -c 'dsh-grok-workflow#v' README.md README.zh-CN.md       # 安装示例必须钉到新 tag
npx vitest run test/docs-version.spec.ts                      # 期望 8/8 PASS；红了就是上面某处没同步

# 2. [Unreleased] 改名成发布段（本轮已备好内容，见第 7 节）
sed -i 's/^## \[Unreleased\] \/ 未发布$/## [0.12.20] - <日期>/' CHANGELOG.md

# 3. lib 一致性（157 口径 → 提交新模块后会变，以输出为准）
npm run verify:lib                     # 期望 "(N files, byte-identical)"，N == git ls-tree -r --name-only HEAD lib | wc -l
git status --porcelain --untracked-files=all -- lib/   # 期望空

# 4. 与 CI 同口径的本地闸
npm run typecheck && npm run lint && npm test          # 期望全绿；oxlint 23 warnings / 0 errors 属基线
npm pack --dry-run --cache "$PWD/.npm-cache-tmp"       # 期望 "total files: 102" 且不含未跟踪 lib 文件

# 5. 干跑发布闸（不建 tag、不推送）——必须 WOULD TAG 才继续
node docs/knowledge/evidence/release-tag-check-2026-11-22/release-dry-run.mjs \
  --ref HEAD --tag v0.12.20 --worktree
# 再进行版本闸本体的演练（切出 release.yml 真步骤实跑）
bash docs/knowledge/evidence/release-tag-check-2026-11-22/release-yml-rehearsal.sh

# 6. 人工确认后再打 tag（本轮未执行，需用户授权）
git tag -a v0.12.20 -m "0.12.20 — <一句话>" <sha>
git push origin v0.12.20               # 只推 tag，push 后 release.yml 自动跑
```

## 6. 干跑结果（dry-run.txt，本轮四个场景）

| 场景 | 命令 | 结果 |
| --- | --- | --- |
| A 已提交树重打当前版本 | `--ref HEAD --tag v0.12.19` | 3 BLOCK：`TAG_IS_NEW`（v0.12.19 已在 `283577a`）、`WORKTREE_CLEAN`（82 路径）、`LIB_UNTRACKED`（12）→ **REFUSE**，另有 2 WARN（无 `[Unreleased]`，因为读的是已提交树） |
| A2 同一 tag，叠加工作树的 changelog | `--ref HEAD --tag v0.12.19 --worktree` | 3 BLOCK（同上），但 `UNRELEASED_SECTION` 与 `UNRELEASED_BILINGUAL`（4/4 条中英齐备）转 PASS → **REFUSE**（只剩“已发布 tag 不能动”与工作树两条） |
| B 直接抬版本但不做发布准备 | `--ref HEAD --tag v0.12.20 --worktree` | 4 BLOCK：`PACKAGE_VERSION`（0.12.19 vs 0.12.20）、`CHANGELOG_SECTION`（无 `## [0.12.20]`）+ 工作树两条 → **REFUSE** |
| C 已知能发布的版本回放 | `--ref 283577a --tag v0.12.19 --allow-existing-tag` | **0 BLOCK**，`WOULD TAG`，抽出 40 行 release notes → 闸门不是只会拒绝 |
| D 版本闸本体演练（真 release.yml 步骤） | `bash release-yml-rehearsal.sh` | 负例 exit 1（`missing a section for [0.12.20]`）、正例 exit 0 + 47 行 notes → **PASS** |
| E 自带 docs-version 闸正负对照 | `npx vitest run test/docs-version.spec.ts` | 真仓库 8/8 PASS（含 `[Unreleased]`）；隔离副本仅抬 `package.json` 则 6 红 2 绿 |

C 与 D 是关键：如果脚本对已成功发布的 `v0.12.19` 也报 BLOCK、对发布准备齐备的树也报 BLOCK，那它证明不了任何事。
两个方向都放行了，说明 A/A2/B 的拒绝是真实缺陷而非脚本过严。

## 7. `[Unreleased]` 缺口：本轮已按 AGENTS.md 补齐（仅文档，未发布）

`AGENTS.md:68` 要求“每个用户可见变更记在 `[Unreleased]` 下，中英双语”。上一轮实测该段**完全不存在**
（`grep -c Unreleased CHANGELOG.md` = 0），待发功能在 changelog 里一行都没有。本轮把它补在 `CHANGELOG.md:6`：

```
## [Unreleased] / 未发布
### Added / 新增
- 计划按波执行，单波报告写明原因 /     (WAVE_LIMIT=8, dependsOn 决定波次, 四种单波原因)
- 下游任务拿到上游已验证的产出 /       (src/upstream.ts, 单依赖 2000 字符上限)
- 卡住的子调用按超时结算 /             (120 s 命令档、600000 ms 任务档、沿用 timeoutMs 运行档)
- guardianModel：先取证再判停 /        (300000 ms × 2, 不越死线, 配置面十六键)
```

四条都扣在代码事实上（`src/waves.ts`、`src/upstream.ts`、`src/timeout.ts`、`src/config.ts:308,537,954-970`、
`src/script.ts:77-78,1147`），不是从 README 抄口号；中英双语写在同一条 bullet 的首行，与仓库既有风格一致。

三条已经实测的判断：

- **「`[Unreleased]` 会不会让自带测试变红」→ 不会（CONFIRMED，真仓库实跑）**。`test/docs-version.spec.ts:111` 的
  `^## \[(\d+\.\d+\.\d+)\]` 只匹配数字版本段，`[Unreleased]` 被跳过；本轮直接在工作树改完后跑，8/8 PASS。
- **「把 `[Unreleased]` 改成发布段后版本闸是否接受」→ 接受（CONFIRMED，release-yml-rehearsal.sh D 场景）**。
- **「只抬 `package.json` 会怎样」→ 6 条红（CONFIRMED，隔离副本）**，所以发布提交必须同时动
  `package.json`、`package-lock.json`、`README.md`、`README.zh-CN.md`、`CHANGELOG.md` 五处。

**仍需人拍板的两件事**（本轮没做，也不该由自动流程替用户决定）：

1. **在飞的功能必须先提交**。`[Unreleased]` 现在描述的是工作树里的未提交代码
   （`src/{waves,upstream,timeout}.ts` 与 `guardianModel` 全在 `M`/`??` 里）。tag 只能打在已提交且 CI 绿的
   `main` 提交上；这些改动没进 `main` 之前，任何 tag 都发不出这些功能。谁提交、要不要合并成一次提交，
   属于用户/Lead 的决定。
2. **版本号抬到多少**。`0.12.20` 还是 `0.13.0`（波次调度是行为变化，`src/run.ts:620` 的注释自己写着
   “L1 inheritance (Q2, v0.13)”）。本轮按 `0.12.next` 演练，但不替用户拍版本语义。

## 8. 本轮写入了什么（越界说明，可回退）

除证据目录外，本轮**只改了一个文件**：`CHANGELOG.md`（+48 行，`## [Unreleased] / 未发布` 段）。
理由是它正是验收要求“`[Unreleased]` 同时含中英条目”所指向的对象，且写 changelog 不等于发布、不碰业务逻辑。
回退一条命令：`git checkout -- CHANGELOG.md`。

未动：`package.json`、`package-lock.json`、`README*.md`、`AGENTS.md`、`src/**`、`test/**`、`lib/**`、
`docs/knowledge/{STATE,HANDOFF,VALIDATION}.md`（后三者正被并发代理编辑，本轮不抢写）。

## 9. 未做 / 受限（NOT_RUN / BLOCKED，不写成通过）

- **未创建任何 tag、未 push、未发 GitHub Release、未上推 npm**（用户未授权）。运行时对照：
  `git tag | wc -l` 前后均为 67、`git rev-parse -q --verify refs/tags/v0.12.20` 无输出。
- `npm pack --dry-run` 本轮未重跑；上一轮默认缓存下 `EROFS: /home/fish/.npm/_cacache/tmp`（沙箱只读），
  换 `--cache` 到工作区后为 `total files: 102`、668.9 kB。**release.yml 在 GitHub runner 上无此问题。**
- 真实 `release.yml` 未在 GitHub 上跑（只在 tag push 时触发）；本轮用切出的真步骤（D 场景）在本地执行替代。
- 全量 `npm test` 未由本轮跑：工作树有并发代理未提交的改动（62 `M` / 20 `??`），全量结果不代表任何可发布状态；
  上一轮的值班记录为 `npm run ci` 78 files / 1438 tests PASS（`docs/knowledge/VALIDATION.md`，agent-72，01:13），
  本轮只复跑了 `test/docs-version.spec.ts`（8/8）与 `npm run verify:lib`（exit 0）。
- GitHub tag protection / ruleset 未核（无管理员权限）。
- `[Unreleased]` 四条条目的技术内容依据 module docblock 与 README 差异，未做端到端模型实测；
  真正的发布前验收仍是 `npm run ci` 绿灯 + 人工 review（`docs/knowledge/evidence/wave4-acceptance-2026-11-22/ACCEPTANCE.md`）。

设备=agent-90，时间 2026-11-22
