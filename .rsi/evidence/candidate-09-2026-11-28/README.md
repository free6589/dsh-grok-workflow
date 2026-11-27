# 候选隔离跟进 · 证据目录 candidate-09-2026-11-28

- 基线：`ea471da`（origin/main，`docs(memory): record round8 wrap`）
- 分支：`fix/candidate-follow-09`
- worktree 路径：`/home/fish/projects_mine/dsh-grok-workflow/.tmp/wt-candidate-09`
- 创建时间：2026-11-28（+08:00）
- 包工头：dispatcher-candidate-follow

## 隔离红线

1. 只许在 worktree `/home/fish/projects_mine/dsh-grok-workflow/.tmp/wt-candidate-09` 内工作。
2. 分支 `fix/candidate-follow-09`（基线 origin/main = ea471da）。
3. 禁止切分支、禁止 merge、禁止碰其他分支 / 主检出、禁止碰 live、不重启、不 force-push、不动 tag、不要提交 commit。
4. 唯一允许的写路径是本目录：`.rsi/evidence/candidate-09-2026-11-28/`。

## 两个候选说明

本目录为本次候选隔离跟进的单份证据目录骨架：

- 候选 A（退场铃 trace-warnings）：见 `trace-warnings.md`，待退场铃小工结果，待包工头合入。
- 候选 B（画像缺包 portrait-missing-pkg）：见 `portrait-missing-pkg.md`，待画像小工结果，待包工头合入。

本骨架小工（证据小工）只收敛自己能收敛的部分（目录 + README + manifest + 占位），不编造两个候选的结论。
