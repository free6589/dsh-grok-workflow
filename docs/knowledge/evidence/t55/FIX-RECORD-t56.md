# t55 → t56 修复记录（三项必办的处理结果）

t55 复核提出的三条必办项，在 t56 里的处理：

| t55 项 | 处理 | 证据 |
|---|---|---|
| **N2** 用户目录 10:41–10:44 第二批残留（`.backups/db-backup-20261029-104117`、`DB_BACKUP_REPORT.md`、`NOTIFY.md`） | 已逐项 `realpath` 校验后移入 `/tmp/t54-quarantine/batch2-1041/`，MANIFEST 补记批次/体积/md5；复扫用户目录命中 0 项；SQLite 边车（25 个 `-shm`、25 个零字节 `-wal`）如实记录并保留 | `evidence/t56/README.md` §1、`/tmp/t54-quarantine/MANIFEST.txt`、`batch2-1041.hashes.txt` |
| **N1** 中文 README 缺四档/设置键/两条限制/测试数 | 补齐并与英文逐节对齐（前台四档、`mode`/`triageAsk`/`triageModel` 三行、两条诚实限制、`试一试` 说明档位、已知限制三条、测试数 22 文件/365 例） | `README.zh-CN.md` |
| **N3** 分类器缺口：句尾"几"、纯顿号、`并+回滚` | 全部改**实现**（D-025 已承诺）：`几(?![十百千万乎])`；`COMMA_LIST`（三个及以上顿号项）；动词表补 `回滚/回退/重启/验证/灰度`；并修掉真机抓到的英文是非问句与「指向词问句被 vague 拦」两处误判 | `src/triage.ts`、`test/triage.spec.ts`、DECISIONS D-026、VALIDATION Round 11 |

t55 自己写下的 7 条隔离纪律已提升为常驻文档 `docs/knowledge/TESTING.md`（并补第 8、9 条：隔离要留可复现证据；
给测试 profile 加一次性工作区的具体做法）。本轮真机矩阵即按该文档执行：工作区 `/tmp/t56-work`，会话目录
`sessions/--tmp-t56-work--/…`。
