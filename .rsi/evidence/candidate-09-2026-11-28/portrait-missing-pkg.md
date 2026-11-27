# portrait-missing-pkg（候选 B · 画像缺包）

- 基线：`ea471da`（origin/main）
- 分支：`fix/candidate-follow-09`
- worktree：`/home/fish/projects_mine/dsh-grok-workflow/.tmp/wt-candidate-09`
- 日期：2026-11-28（+08:00）
- 状态：已验收结论合入（覆盖占位符）

## 定义

- 画像 = DSH profile，非生图。
- 缺包 = unresolved dependencies + dangling symlinks。

## 文档依据

- `scripts/clone-profile.mjs:2-27`
- `test/profile-clone.spec.ts:7-17`
- `docs/LOCAL-TESTING.md:99-116,191-206`

## 代码依据

- `scripts/clone-profile.mjs:124-146`
- `scripts/clone-profile.mjs:169-187`
- `scripts/clone-profile.mjs:245-258,307-320`
- `scripts/clone-profile.mjs:343-361`
- `test/profile-clone.spec.ts:107-197`

## 对照表

- A：一致
- B：一致（文档覆盖不全）
- C：差异（文案与 exit-1 无定向失败用例）
- D：一致
- E：一致

## 只读验证

- `node scripts/clone-profile.mjs --help` EXIT:0
- `git status` 仅证据目录

## 结论

待确认，需补缺包失败断言。
