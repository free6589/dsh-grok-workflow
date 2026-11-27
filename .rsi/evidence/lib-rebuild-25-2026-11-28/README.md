# lib-rebuild-25 单份证据包（2026-11-28）

> 证据小工（agent-3）汇总。只做汇总，不重建、不代跑门禁。全部内容为上游小工产出的原样收录 + 本包校验记录。

## 1. 任务源头

- 源头提交 `5483d9d`（`fix(gap-redispatch-13): failed summary same-leg redispatch once, config-class marked manual`）只改了 `src/script.ts`，**未带产物**：
  - `git show --numstat --format= 5483d9d` 原文：
    - `.rsi/evidence/gap-fix-13-2026-11-28/commands.txt`：2 additions / 0 deletions
    - `.rsi/evidence/gap-fix-13-2026-11-28/patch.md`：11 / 0
    - `.rsi/evidence/gap-fix-13-2026-11-28/repro.md`：15 / 0
    - `.rsi/evidence/gap-fix-13-2026-11-28/verify.md`：9 / 0
    - `src/script.ts`：**55 additions / 1 deletion（共 56 行变更）**
    - `test/synth-redispatch.spec.ts`：126 / 0
    - `lib/` 文件：**0 个** —— 产物缺失即为本次重建任务的起因。

## 2. 基线 / 分支 / 新旧 SHA

- 基线：`origin/main = 5fb048b`（`docs(memory): record round24 wrap`）
- 分支：`fix/lib-rebuild-25`（worktree `.tmp/wt-lib-25`，未 push，`ahead 1`）
- 旧 SHA（重建前 worktree HEAD）：`5fb048bcbaac1b74e4a371070a052ecb643c72cb`
- 新 SHA（重建提交后 worktree HEAD）：`c90b5efd39cd1897247f4c02f61cf47115b86bc0`
  （`chore(lib): rebuild lib/script.* from src (lib-rebuild-25)`，2026-11-28 05:57:27 +0800）
- 主检出（`/home/fish/projects_mine/dsh-grok-workflow`）HEAD 仍为 `5fb048b`，未动；本证据目录为其上唯一的 untracked 新增。

## 3. 逐字命令 + EXIT（重建小工，worktree 内执行）

```
$ npm run build
> dsh-grok-workflow@0.13.62 build
> tsc -p tsconfig.build.json && node scripts/build-client.mjs
client bundle: 444522 bytes → lib/client.js
EXIT: 0
```

提交前 `verify:lib`（`verify-precommit.log` 原文，EXIT 非零=预期内不一致告警）：

```
> dsh-grok-workflow@0.13.62 verify:lib
> node scripts/verify-lib.mjs
client bundle: 444522 bytes → lib/client.js
lib/ at 5fb048b is not the build of src/ at 5fb048b:
  differs from its own build: script.d.ts.map
  differs from its own build: script.js
  differs from its own build: script.js.map
Run `npm run build` and commit lib/ together with the src/ change it came from.
```

提交后 `verify:lib`（`verify-postcommit.log` 原文，EXIT 0）：

```
> dsh-grok-workflow@0.13.62 verify:lib
> node scripts/verify-lib.mjs
client bundle: 444522 bytes → lib/client.js
lib/ at c90b5ef is the build of src/ at c90b5ef (293 files, byte-identical)
EXIT: 0
```

## 4. 逐字命令 + EXIT（门禁小工，HEAD=`c90b5ef`，worktree 内执行，详见 `gate.log`）

| # | 命令 | EXIT | 结论 |
|---|------|------|------|
| 1 | `git log --oneline -3` | 0 | `c90b5ef / 5fb048b / e8936d4` |
| 2 | `git status --short` | 0 | 空（干净） |
| 3 | `git rev-parse HEAD` | 0 | `c90b5efd39cd1897247f4c02f61cf47115b86bc0` |
| 4 | `npm run typecheck`（`tsc -p tsconfig.json --noEmit`） | 0 | **PASS**（无输出） |
| 5 | `npm run lint`（`oxlint src test`） | 0 | **PASS**（17 warnings / 0 errors，206 files） |
| 6 | `npm run verify:lib` 初次 | 1 | **ENV_FAIL**：worktree 缺 `node_modules`，`tsc` MODULE_NOT_FOUND，属环境缺失**非**字节不一致 |
| S3 | `npm run verify:lib` 补跑（symlink 主仓 `node_modules` 后，dispatcher 指令） | 0 | **PASS**：`lib/ at c90b5ef is the build of src/ at c90b5ef (293 files, byte-identical)` |
| 7/S4 | `git diff --exit-code -- lib/` / 补跑后 `git status --short` | 0 | **PASS**（lib/ 已提交、无未提交漂移；补跑用 symlink 已删，恢复干净） |

门禁最终结论：**typecheck PASS、lint PASS、verify:lib PASS（补跑 EXIT 0，与重建小工 postcommit 记录一致）、lib/ 干净 PASS**。门禁小工未改 src、未提交、未 merge（只读+补跑 symlink 已清理，见 `gate.log` SUPPLEMENT 段）。

## 5. verify:lib 结果（汇总）

- 重建小工提交后：`lib/ at c90b5ef is the build of src/ at c90b5ef (293 files, byte-identical)`，EXIT 0 → **PASS**
- 门禁小工补跑（同 HEAD `c90b5ef`，symlink 法）：同上原文，EXIT 0 → **PASS**
- 初次 ENV_FAIL（EXIT 1，缺 `node_modules`）已在 `gate.log` 中如实保留，不掩盖、不删除。

## 6. `git diff --stat -- lib/` 原文（`5fb048b..c90b5ef`，worktree 内实测）

```
 lib/script.d.ts.map |  2 +-
 lib/script.js       | 56 ++++++++++++++++++++++++++++++++++++++++++++++++++++-
 lib/script.js.map   |  2 +-
 3 files changed, 57 insertions(+), 3 deletions(-)
```

（`git diff --stat -- lib/` 相对工作区：空，EXIT 0 —— 改动已全部在 `c90b5ef` 内提交。）

新提交文件组成（`git show --stat HEAD` 原文）：`build-cmd.txt`（证据，2 行新增）+ 上述 3 个 `lib/` 产物，共 59 insertions / 3 deletions。

## 7. 收录文件完整性（证据小工校验）

本包文件均与 worktree 内小工落盘文件逐字节一致（`diff -u` 全 identical，sha256 见下）：

| 文件 | 来源 | sha256（前 16 位） | 状态 |
|------|------|-------------------|------|
| `build.log` | worktree `.rsi/evidence/lib-rebuild-25-2026-11-28/build.log` 拷贝 | `de81e4fe…` | IDENTICAL |
| `build-cmd.txt` | 同上拷贝（`$ npm run build / EXIT:0 (rerun for log capture)`） | `64702fd9…` | IDENTICAL |
| `verify-precommit.log` | 同上拷贝 | `1595fda6…` | IDENTICAL |
| `verify-postcommit.log` | 同上拷贝 | `227a1d70…` | IDENTICAL |
| `gate.log` | 门禁小工直写本目录（含初次 ENV_FAIL 全文 + SUPPLEMENT 补跑 PASS 段） | 以文件为准 | 原件，未改动 |
| `README.md` | 本包（证据小工撰写） | — | 汇总说明 |

缺失项标注：**无缺失，无 NOT_RUN**。重建小工（build.log、HEAD SHA）与门禁小工（gate.log、逐字四项结果）均已交付；45 分钟等待预算内全部收齐，未代跑任何 build/门禁命令（本包仅执行只读 `git` 查询与 `cp -p` 拷贝）。

## 8. 收尾快照（worktree，封包时实测）

```
$ git status --short --branch   # in .tmp/wt-lib-25
## fix/lib-rebuild-25...origin/main [ahead 1]
（工作区干净，无输出行）

$ git rev-parse HEAD             # in .tmp/wt-lib-25
c90b5efd39cd1897247f4c02f61cf47115b86bc0

$ git log --oneline -2
c90b5ef chore(lib): rebuild lib/script.* from src (lib-rebuild-25)
5fb048b docs(memory): record round24 wrap
```

红线遵守声明：未改 `src/lib` 行为（`lib/` 改动即重建提交本身，由重建小工完成）；证据小工未提交任何代码，未 merge，未碰 live/重启/force-push/tag/publish；本目录文件尚未 `git commit`（是否提交由上游决定，另行说明）。
