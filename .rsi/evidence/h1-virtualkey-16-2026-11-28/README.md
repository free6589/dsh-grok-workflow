# H1 证据包：virtual-key-16

- 任务：H1 入库（裸 virtual-key 落 unknown → model-unavailable，HYPOTHESIS，157 会话佐证，修法 NOT_RUN）
- 基线 SHA：4849bdfcd9abe178a95fc1983d6a034430521468
- 基线分支/thought：origin/main = 4849bdf（docs(memory): record round15 wrap）
- 本分支名：fix/h1-virtualkey-16
- worktree 路径：/home/fish/projects_mine/dsh-grok-workflow/.tmp/wt-h1-16
- 采集时间：2026-11-28

## 红线摘要

- 只写本 worktree 内 `.rsi/evidence/h1-virtualkey-16-2026-11-28/` 下文件
- 不动 src 行为逻辑
- 不动其他分支 / 主检出
- 不 merge
- 不碰 live、不重启、不 force-push、不动 tag
- 不跑全量 ci
- 密钥不写入任何文件
