# split-client-31 — 证据（2026-11-28）

分支：`fix/split-client-31`（自 `main bdea52e`，未合并、未推送）。
目标：`src/client/index.js`（7994 行手写显示代码）搬家式拆分，页面长相与功能零变化。

## 拆了几块

`src/client/index.js` 原样保留（组装产物 + Host 直接服务的 bundle），新增 8 个功能块 + 头尾沿用：

| 文件 | 行数 | 内容 |
|---|---|---|
| `preamble.js` | 225 | 头注释、factory 开场、`FIELDS/ROLES`、版本常量 |
| `i18n.js` | 672 | `EN/ZH` 字典、`translate/translator`、locale 辅助 |
| `draft.js` | 326 | `draftOf/validate/opsFor` + config-notice store |
| `styles.js` | 96 | `HAIRLINE/styles/PageStyle` |
| `settings-page.js` | 886 | 设置页组件（namespace、行、链、UpdateCard） |
| `task-panel.js` | 479 | chat task panel（`workflow-run` 重注册） |
| `progress-tab.js` | 3913 | 会话进度 tab |
| `composer-toggles.js` | 940 | composer 开关（loop/iterate/mode） |
| `shell.js` | 457 | `inject/mount/apply` + exports 组装 |
| `index.js` | 7994 | 组装产物（与原来逐字节一致） |

切点全部落在顶层语句之间的空行（行号见 `scripts/assemble-client.mjs` 头注释）。
另新增 `scripts/assemble-client.mjs`（按固定顺序拼接 9 块；与 `index.js` 不一致则拒绝写入），
`scripts/build-client.mjs` 开头先跑组装再拷贝到 `lib/client.js`。
`package.json` 的 `lint` 改为 `oxlint src test --ignore-pattern 'src/client/*.js'`：
块文件是 bundle 切片（头/尾单独不是合法 JS），`index.js` 仍在 lint 范围内。

## 逐字节一致证据

- `cat` 9 块 `| cmp - src/client/index.js` → 无差异。
- `node scripts/assemble-client.mjs` → `client bundle assembled: 436624 bytes`。
- `node scripts/build-client.mjs` → `lib/client.js` 与 `src/client/index.js` `cmp` 无差异（444522 字节）。

## 测试命令与结果（本机，2026-11-28）

- `npx tsc --noEmit` → exit 0。
- `npm run lint` → `Found 14 warnings and 0 errors`（205 files；警告为既有）。
- `npx vitest run test/client.spec.ts` → 153 passed。
- 引用 `src/client/index.js` 的其余 22 个 spec，分两批：
  `config-limits-repair/contract-freeze/dead-key-upgrade-note/i18n-parity/mode-surface/notrun-shots/overlap-readings-name/panel-links/pixel-sweep/progress-connector/progress-entry/progress-hint-absent` → 141 passed；
  `progress-panel-model/progress-panel/progress-screen-walk/progress-tab/soak-gaps-logic/soak-gaps-responsive/soak-gaps-retry/step-count-unify/step-total-words/update-entry` → 212 passed。
- 合计 23 个 client 相关 spec：506 passed，0 failed。
- `test/client.spec.ts` 内含 `lib/client.js` 与源码逐字节一致断言，一并通过。

## 未做

- 未合并到 `main`，未推送，未动 `src/script*`（兄弟分支 `fix/split-script-30` 的地盘）。
