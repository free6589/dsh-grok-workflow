# M3.1 独立验收证据（2026-11-25）

验收对象：`feat/m3-narrow-listen` 上的实现提交 **`d546666`**，基线 `main` **`35326c7`**，版本 `0.13.34`。
环境：Node **v26.8.1** / npm **11.19.0** / DSH **0.2.2-rc.3**；worktree `.tmp/wt-m3-narrow-listen`（`node_modules` 软链）。
口径：`AGENTS.md` §2 的四个状态词；每条结论都能回指本目录里的一个文件或下面注明的一条命令。

## 清单

| 文件 | 是什么 | 回指 VALIDATION 的哪一行 |
| --- | --- | --- |
| `green-m3-intake.out` | `npx vitest run test/m3-intake.spec.ts --reporter=verbose` 原文（10 条用例全名 + 全绿） | 「绿」 |
| `red-baseline-missing-module.out` | 基线 `35326c7` 一次性拷贝 + 同一 spec 的原文（`Cannot find module '../src/heartbeat-listen.js'`） | 「红」 |
| `mutation-no-observation.out` | 变异一（去掉 `observeOnly` 的观测写入）原文，`1 failed \| 9 passed` | 「变异一」 |
| `mutation-owns-routing-false.out` | 变异二（`ownsRouting` 恒 false）原文，`2 failed \| 8 passed` | 「变异二」 |
| `ci.out` | `npm run ci` 全量原文（typecheck → lint → verify:lib → vitest） | 「门禁」 |
| `verify-lib.out` | `npm run verify:lib` 单跑原文 | 「门禁单跑」 |
| `soak-clone-profile.out` | `node scripts/clone-profile.mjs …` 原文（7699 文件、parity 5/5、1 行凭据脱敏） | 「soak 建 home」 |
| `shapeA-boot-lines.txt` | 形状 A 的 boot 产品行（只有 URL 一行）+ `pending`/`did not activate` 计数 0 | 「形状 A」 |
| `shapeB-boot-lines.txt` | 形状 B 同上 | 「形状 B」 |
| `shapeA-settings-describe.txt` | 形状 A 的 `POST /api/settings/describe` 摘要（24 命名空间、`autoGenerate: true`、17 个投影字段） | 「形状 A」 |
| `shapeB-settings-describe.txt` | 形状 B 同上 | 「形状 B」 |
| `shapeA-session-extract.txt` | 形状 A 会话里与结论有关的事件（1 条 `source.kind=grok-workflow` 中继、心跳投递、两次 `turn/end`） | 「形状 A 普通消息」「形状 A 心跳」 |
| `shapeB-session-extract.txt` | 形状 B 同上（中继 0 条、assistant 真答 `你好！`） | 「形状 B 普通消息」 |
| `shapeB-heartbeats-listen.jsonl` | 窄监听自己的观测文件原文，1 行 `{"outcome":"stopped","code":"loop/stop-file",…}` | 「形状 B 心跳」 |
| `soak-dual-shape.txt` | 双形状全过程叙述：装了什么、怎么起、两个形状各自看到了什么、模型可用性、收尾 | 整张表 |
| `../evidence/m3-1-2026-11-25/` 之外 | `stat ~/.dsh` 前后两次读数 | 「收尾」（`Modify:` 都是 `2026-11-22 23:40:20.274932030 +0800`） |

## 边界（不要把这些当成覆盖）

- **不含截图**，也没有大文件：全部是命令原文与小型抽取，整个目录约 100 KB。
- **boot 日志里的 `token=` 已替换成 `<REDACTED>`**；`settings/describe` 的原始 JSON 只保留摘要，
  因为完整响应里带着整份 profile 设置（含其它插件），没有必要进仓库。
- **没有凭据、没有内网地址**：本目录的文件里不存在密钥、token、私钥或 `10.` / `192.168.` 之类地址。
- **没覆盖的**：形状 A 在有 open block 时的 `observed` 行（只有单元用例）、`continued` 的真机路径、
  `legacyGate: false` + `blockIntake: false` 的组合、浏览器页面渲染。逐条写在 VALIDATION 本条的 Honest boundary 里。
