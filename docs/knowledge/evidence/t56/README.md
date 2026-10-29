# t56 — v0.2.3 收尾：残留清理、中文 README、分类器三处缺口

## 0. 工作区隔离（先做，再发第一条消息）

按 [TESTING.md](../../TESTING.md) 规则 1/8/9，本轮真机矩阵**没有**跑在用户目录里：

- 一次性工作区：`/tmp/t56-work`（跑前清空，跑完即弃）。
- 添加方式（规则 9）：停实例 → 在测试 home 的 `storages/workspace.json` 里追加
  `tables.workspaces[<uuid>] = { path: "/tmp/t56-work", title: "t56-work", sessionIds: [] }` 并把该 uuid
  追加进 `global.workspaceIds` → 起实例 → 在 UI 里点 `t56-work` 再新建会话。
- **证据**：会话目录是 `sessions/--tmp-t56-work--/<session-uuid>/`（目录名由工作区路径编码而来）；
  进入该工作区后的页面文本是 `/tmp/t56-evidence/W0-workspace.txt`（578 B）——它是跑测当时的临时证据，**不在仓库里**（`/tmp` 不随代码走），这里只留路径与体积，正文见 VALIDATION Round 11 与本文件 §4。
- 结果：本轮所有团队档样本的写入（`uci/`、`backup-discovery.log` 等）都落在 `/tmp/t56-work` 内，
  用户目录 `/home/fish/project_jobs` 零新增。

## 1. N2 — 第二批残留清理（t54 漏掉的那批）

发现于 2026-10-29 10:41–10:44 的第二批写入，t54 的清单没有覆盖它们，本轮逐项 `realpath` 校验后移入
`/tmp/t54-quarantine/batch2-1041/`，并把批次、体积与 md5 写进该隔离目录的 `MANIFEST.txt`：

| 项 | 体积 | md5 |
|---|---:|---|
| `.backups/`（内含 `db-backup-20261029-104117/`：19 个 SQLite 库的只读副本 + `run_backup.sh` + `logs/`） | 3.6 MB | 逐文件见 `batch2-1041.hashes.txt`（139 个文件） |
| `DB_BACKUP_REPORT.md` | 87,282 B | `8aabaf7b181618ba5c8969a62e5fac79` |
| `NOTIFY.md` | 2,617 B | `64990a84655ffbdd65c9cfbc326d867d` |

两个根文件与备份目录内的同名副本 md5 完全一致，即同一份 worker 报告。

**复核（对比 t55 的清单）**：移出后复扫 `/home/fish/project_jobs`（`-newermt 2026-10-29 10:39`，
排除 SQLite 边车）命中 0 项；根目录 `ls -la` 只剩用户既有条目。

**SQLite 边车（如实记录）**：备份过程以只读方式打开了 25 个库，因此工作区里 25 个 `*.db-shm` 与 25 个
零字节 `*.db-wal` 的 mtime 变成 10:31/10:41；**库文件本身未被修改**（例如 `猎聘/data/liepin.db` 仍是
10-28 04:08）。这些边车属于 SQLite 自己，删除它们可能丢掉未合并的 WAL 内容，所以**保留原样**。

## 2. N1 — 中文 README 与英文版逐节对齐

`README.zh-CN.md` 补齐：`## 前台：四档分流，条条写明（t52）`（四档表 + 判定顺序 + 两条诚实限制）、
配置表新增 `mode`/`triageAsk`/`triageModel` 三行、设置页段落点名这三项、`试一试` 段落说明默认
`mode: 'triage'` 下长目标走团队、短问句走快手、"你好"走直答、`已知限制` 补三条（确认档记忆、
迎宾与最终回答同批到达、直答档是模板）、测试与文件数改为实际值。

## 3. N3 — 分类器三处缺口（改实现，不改契约；详见 DECISIONS D-026）

1. **句尾"几"**：`QUESTION` 的 `几[个号年月天时分秒]` → `几(?![十百千万乎])`；8 条样本见
   `test/triage.spec.ts`「treats a trailing 几 and its measure words as a question」。
2. **纯顿号列表**：新增 `COMMA_LIST = /(?:[^\s、，。；;:：]{1,10}、){2,}/`（**三个及以上**项算多步）；
   `改配置、重启、验证` → 团队档，`读、写` 仍是快手档（两个项通常是一个动作的两种说法）。
3. **`并+回滚`**：动词表补 `回滚|回退|重启|验证|灰度`。

**顺带修掉的两处真机误判**（单测没覆盖、只有真机才抓得到）：

- 英文是非问句 `is this repo using esm or cjs` 既无 `?` 也无 wh-词 → 修前被判 `确认档`（对一个问题反问），
  现按**助动词前置**判问句；同时给 `MULTI_STEP` 补英文顺序词，`do this then that` 仍判多步。
- 带指向词的问句 `这个得几` 被 `vague`（模糊即反问）拦住 → 现让位给提问信号。

## 4. 真机矩阵（44 条，隔离工作区）

| 项 | 值 |
|---|---|
| 工作区 | `/tmp/t56-work`（会话目录 `sessions/--tmp-t56-work--/session-*`） |
| 样本 | 44 条 = t55 的 22（V1–V22）+ t53 的 14（T1–T14）+ 新的 8（J1–J8） |
| 真机覆盖 | **38 / 44**，**误判 0 条** |
| 未覆盖 | T6–T11（6 条团队档且带文件系统动作，预算内跑不完；以规则判定 + V9–V14 的真机团队档结果为据） |
| 全表 | `matrix-table.md`（含规则判定、真机档位、判定三列）与 `rule-tiers.json`（规则判定的机器可读版） |
| 页面文本 | `/tmp/t56-evidence2/<ID>.txt`（未打进仓库，体积大且为中间产物） |

真机在这一轮抓到并修掉了两处单测没覆盖的误判（英文是非问句被判 `确认档`、`这个得几` 被模糊规则拦住），
详见 VALIDATION Round 11 §2 与 DECISIONS D-026。
