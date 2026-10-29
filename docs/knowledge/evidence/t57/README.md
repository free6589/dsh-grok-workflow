# t57 — v0.2.3 发布前终审（只读复核，未改动任何产品文件）

本轮是**只读验收**：没有修改 `src/`、`lib/`、`docs/` 以外的任何东西，也没有提交。

## 独立复扫（N2 清理复核，2026-10-29 13:2x）

| 检查 | 命令 | 结果 |
|---|---|---|
| 目录级残留 | `find /home/fish/project_jobs -maxdepth 2 -newermt '2026-10-29 10:39'` | 命中 1 项 = 目录自身（清理动作改了它的 mtime），文件级 0 项 |
| 全树文件级残留 | `find … -type f -newermt '2026-10-29 10:39' \| grep -vE -- '-(wal\|shm)$'` | 仅 `boss/deploy/runtime/data/bosshunter.db`（uid 0，boss docker 常驻写入，11:37），非本轮产物 |
| 根目录同名项 | `.backups / upgrade / dsh-backup-copy-… / COPY_REPORT.md / DB_BACKUP_REPORT.md / NOTIFY.md / .npm-cache` | 全部不存在 |
| 10:00–11:00 新建根条目 | `find -maxdepth 1 -newermt 10:00 ! -newermt 11:00` | 0 |
| batch2 可还原性 | `batch2-1041.hashes.txt` 逐条重算 md5 | **139 条目 / 139 匹配 / 0 缺文件**；目录实际文件数 139，一致 |
| `.db` 本体 | 工作区 vs `batch2-1041/.backups/…/databases/` 逻辑对比 | 所有工作区 `.db` mtime 均为 10-28；`sqlite3 .dump` 的 md5 对 `liepin.db`、`zhilian.db` **相同**（字节差异来自副本生成方式，不是修改） |
| 边车 | `-wal`/`-shm` 计数 | 工作区 24 + 24；隔离副本内 25 + 25 → 合计 49 与 t55 观测一致，**未删除**（MANIFEST 明确写了保留理由） |

## 分类器终审样本

`final-samples.mjs`（22 条全新样本，问句 11 / 多步 7 / 其它 4）与 `adversarial-probes.mjs`（10 条对抗探针）。
结果：22/22 合理，问句 11/11 ≥ 快手档，多步 7/7 团队档；对抗探针暴露 3 条残余问句形态（`谁` / `多不多` / `A还是B`）。
运行方式：`node docs/knowledge/evidence/t57/final-samples.mjs`（需已 build 的 `lib/triage.js`）。
