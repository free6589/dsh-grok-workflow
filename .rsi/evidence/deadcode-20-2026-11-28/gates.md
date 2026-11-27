# Gates — light gate, actually run

Worktree: /home/fish/projects_mine/dsh-grok-workflow/.tmp/wt-dead-20
Baseline HEAD: e2a6a04bf3b9635392e5a413715810a228d96e1e
Runtime: node v26.8.1. `node_modules` 在 worktree 内不存在；`npx` 向上解析到
主检出的 `node_modules`（typescript 6.0.3、oxlint 可用），未执行任何安装。

未跑全量门禁：`npm run ci` NOT_RUN — 本次只允许轻门禁。

## Gate 1 — typecheck

$ cd /home/fish/projects_mine/dsh-grok-workflow/.tmp/wt-dead-20 && npx tsc --noEmit
EXIT=0
（无输出。tsconfig.json 无 incremental/composite，--noEmit 不落盘。）

## Gate 2 — lint（package.json 定义的 lint 单项）

$ npm run lint
等价于 `oxlint src test`。
EXIT=0
尾部输出：
  Found 17 warnings and 0 errors.
  Finished in 66ms on 204 files with 96 rules using 6 threads.

与本次两钉子相关的告警原文（no-unused-vars，均为 warning，非 error）：
  src/client/index.js:1672:14  Variable 'copied' is declared but never used
  src/client/index.js:3926:11  Variable 'PANEL_STACK_WIDTH' is declared but never used

说明：门禁本身在两钉子存在时仍然 EXIT=0（0 errors），故门禁绿灯不能反证钉子不存在。
