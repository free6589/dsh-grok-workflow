# 门禁结果：COMPLETE（来源：门禁小工 agent-2 交付 + 只读复核）

工作目录均为 `.tmp/wt-pixel`；基线 HEAD=`02e54ca47b09b2938bbe17898a617fdd2c3186e4`。

## 1) tsc
- 逐字命令：`npm run typecheck`（即 `tsc -p tsconfig.json --noEmit`，以 package.json scripts 为准）
- EXIT：0
- 结果：PASS（无报错输出）

## 2) lint
- 逐字命令：`npm run lint`（即 `oxlint src test`）
- EXIT：0
- 结果：PASS（Found 17 warnings and 0 errors. Finished in 63ms on 200 files with 96 rules；17 条均为既有 warning，0 error）

## 3) 三件套
- 逐字命令：`npx vitest run test/pixel-sweep.spec.ts test/progress-panel.spec.ts test/progress-connector.spec.ts`
  （package.json 无三件套专属 script；三文件即 pixel 相关全部 spec：55+16+3）
- EXIT：0
- 结果：74/74 PASS（Test Files 3 passed (3) / Tests 74 passed (74)，Duration 1.52s）

## 4) 窄屏 390
- 逐字命令：`npx vitest run test/progress-panel.spec.ts -t "stays horizontal on a phone"`
  （仓库既有窄屏 390 检查：layoutFor(runningRun(),390)，断言 7 列 / width>390 / 卡片不越界 / 1600 回宽）
- EXIT：0
- 结果：PASS（1 passed | 54 skipped）

## 前置复核（agent-2 交付，证据小工复采一致）
- `git rev-parse HEAD` = 02e54ca（与 origin/main 一致）
- `git log --oneline -3` 首行 02e54ca
- `grep -rn "250px" src/ lib/` 零命中 EXIT 1（250px 仅存于两处测试断言字符串，非样式）
- sheet 规则 5170 行与 pnodes 规则 5079 行均含 margin:0 + list-style:none（src/lib 同行号）
- 红线遵守：未 merge / push / force-push，未写产品代码

来源注明：以上逐字命令 + EXIT + 通过数均引自门禁小工（dispatcher-pixel-zero/agent-2）交付消息；
证据小工未独立重跑门禁，仅对 SHA / grep / 规则行号做了只读复采且一致。
