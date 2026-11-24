# 分支为什么多：三拨来源 + 清理后实测

采样时间：2026-11-22 10:46–10:52 +08:00（Asia/Singapore）
仓库：`/home/fish/projects_mine/dsh-grok-workflow`，remote `origin` = https://github.com/free6589/dsh-grok-workflow.git
口径：凡是本文件写 `CONFIRMED` 的，都由下方命令当场跑出来；`HYPOTHESIS` 标了未验证。

## 1. 清理后实测（`CONFIRMED`）

| 项 | 读数 | 命令 |
|---|---|---|
| 本地分支 | 10（main + 9） | `git branch --format='%(refname:short)'` |
| 远端分支 | 4（main + 3） | `git ls-remote --heads origin` |
| 本地未合 main | 9 个，全部 `--no-merged` | `git branch --no-merged main` |
| 远端独有未合并 | 2 个（11 提交 / 4 提交） | `git rev-list --count main..origin/<b>` |
| 远端跟踪残留 | 0（`remote prune --dry-run` 无输出） | `git remote prune origin --dry-run` |
| open PR | 0 | `gh pr list --state open --json number,title` |
| main 与 origin/main | 采样时 ahead 3；收笔复测 ahead 7（并发轮持续往 main 合 RSI round-4/5，refs 计数未变 10/4） | `git rev-list --left-right --count main...origin/main` |

留着的 9 个本地分支（tip / 提交日）：`feat/audit-layer 7626233 / 11-12`、`feat/user-delivery c799988 / 11-12`、
`rsi/round-4 c8de4fa`、`round-5 206db6b`、`round-6 5e4a980`、`round-7 a25776f`、`round-8 644897b`、
`round-10 6d9a11e`、`round-11 8f90138`（后 7 个均 11-18）。

远端独有：`cloud/harden-issue-watcher-prompt-boundary f53a63f`（11 提交）、
`fix/token-meter-safe-session-messages 99dda09`（4 提交）。删除台账：`DELETED.shas`（48 行，已随 `00a7b4c` 提交）。

## 2. 三拨来源

### 来源 A：合并后不删的功能/发版分支（大头）
每个功能、每个 release 开一条：`feat/*`、`fix/*`、`docs/*`、`release/0.2.4`…`release/0.8.0`。
台账 48 行里 43 行状态是 MERGED；清理时用的是 `git branch -d`（不合并就会拒绝，全部通过，无一需要 `-D`），
抽样复核 `git merge-base --is-ancestor` 也都在 main 里。这就是"零风险、纯清理"的那一拨。

### 来源 B：RSI 1000 轮自迭代的 `rsi/round-*`
每轮一条分支。11-18 之后 8 条没合过（round-4…11，round-9 零独有提交）。11-21 停机时（`.rsi/STOP` 在）
明确"不重写历史、不丢工作、原样保留"，所以它们一直留着——不是忘了删，是当时下令别删。
证据：`.rsi/STOP` 存在；`docs/knowledge/STATE.md`（11-21 18:05 条）记录停机与保留口径。

### 来源 C：同名远端镜像（`-dup`）与云端 agent 分支
台账里有 9 条带 `-dup` 尾巴的远端引用（`release/0.2.7 | 0.3.0 | 0.4.0 | 0.5.0 | 0.6.0 | 0.8.0 -dup`、
`fix-compact-orphan-receipt-dup`、`fix/verify-chain-dup`、`fix/workflow-objective-limit-32000-dup`），
内容都已在 main；另有 `cloud/fix-credential-redaction-formats` 一条云端 agent 分支。
即同一份工作在两套克隆里各推了一份同名分支，远端多出一份镜像。
`HYPOTHESIS`：`-dup` 由第二个克隆/agent 推同名分支时产生的后缀；仓库里没有任何脚本生成该名字
（`grep -rn -- "-dup" scripts .rsi/tools src` 只命中 `src/` 里 `de-duplication` 之类的词，没有分支命名代码），
所以只能确认"结果存在镜像"，不能确认"谁加的尾巴"。

## 3. 与记忆文档不一致的地方（如实记）

- `DELETED.shas` 有 48 行、其中 29 行含 LOCAL、40 行含 REMOTE；`STATE.md` 写的是「26 本地 + 26 远端」。
  差在台账把同名镜像拆成了两行（`fix/phase1-dialogue-reliability`、`fix/redact-hardening` 各出现两次，
  一次标 `dup of local`），以及 `feat/user-delivery-remote` 这种用后缀区分本地/远端的写法。
  结论：台账适合当"删了哪些名字"的清单，不适合当 ref 计数。
- `STATE.md` 同一句里的「未提交」已过时——`DELETED.shas` 在 `00a7b4c` 里是已跟踪文件（`git ls-files` 有）。

## 4. 正在变化的部分（时间敏感）

采样时 main 上有并发轮刚落的两个 RSI 修复：`fff56c4 (round-4 Authorization 全 scheme 脱敏)`、
`c1e09c0 (round-5 supervisor route chain 校验)`。`git cherry -v main rsi/round-4` 显示该提交已是 `-`（补丁等价），
round-5 的文档提交 `206db6b` 也已是 `-`；round-6/7/8/10/11 仍是 `+`（真未进 main）。
所以"留 7 条 rsi 分支"这个判断会随收割推进而变化，下次清理前应重跑 `git cherry -v main rsi/round-*`。

## 5. 别再涨回去

1. 合 PR 就删分支：`gh pr merge --delete-branch`（远端 + 本地一起清）。
2. 每次开工前 `git fetch --prune`，远端删了本地不留悬挂跟踪引用。
3. RSI 轮次分支按轮归档到 tag 后删除，不再长期留 ref；保留判据写进 HANDOFF 而不是靠记性。
4. 一条口径：分支是工作区，不是档案。结论进 `docs/knowledge/`，分支可以删。
