# 证据目录：df-taxonomy-14-2026-11-28

- 任务来源：D/F 入库 — `sensitive` → `unknown`；503 无账号 → `server-error`
- 基线：`origin/main=1a3a477`（完整 `1a3a477d06b44a120637ef56b6acd963d2c3bed1`）
- 分支：`fix/df-taxonomy-14`（worktree：`/home/fish/projects_mine/dsh-grok-workflow/.tmp/wt-df-14`）
- 分类表位置：`src/child-outcomes.ts` + `src/types.ts`
- 红线：只写本目录（worktree 内相对路径 `.rsi/evidence/df-taxonomy-14-2026-11-28/`），不动 `src/`、`test/` 行为与现有文件；不动其他分支/主检出；不 merge 主线；不碰 live、不重启、不 force-push、不动 tag；不跑全量 ci。

## 文件

- `README.md`（本文件）：任务来源、基线/分支、分类表位置、入库小工与门禁小工逐字命令 + EXIT 留空位。
- `taxonomy-snapshot.md`：逐字摘录（只摘录，不评论对错）。
- `commands.log`：本证据小工自己的逐字命令 + EXIT。

## 入库小工逐字命令（待入库回填）

```sh
# 入库小工逐字命令（待入库回填）
# 命令：
# （待入库回填）
# EXIT：（待入库回填）
```

## 门禁小工逐字命令（待门禁回填）

```sh
# 门禁小工逐字命令（待门禁回填）
# 命令：
# （待门禁回填）
# EXIT：（待门禁回填）
```

## 本证据小工命令摘要

详见 `commands.log`。关键命令：

- `mkdir -p .rsi/evidence/df-taxonomy-14-2026-11-28`
- `git status --short --branch`
- `git rev-parse --abbrev-ref HEAD`
- `git rev-parse origin/main`
- `ls -R .rsi/evidence/df-taxonomy-14-2026-11-28`
- `wc -l .rsi/evidence/df-taxonomy-14-2026-11-28/*`
