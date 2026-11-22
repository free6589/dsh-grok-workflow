# release-tag-check-2026-11-22

自动打 tag 发布检查的证据目录。**没有创建 tag、没有 push、没有发布任何东西**。
除本目录外，本轮只改了一个文件：`CHANGELOG.md` 顶部的 `## [Unreleased] / 未发布` 段
（验收要求它存在；回退：`git checkout -- CHANGELOG.md`）。

| 文件 | 内容 |
| --- | --- |
| `CHECKLIST.md` | 主报告：现状事实、版本闸逻辑复述与实跑、`lib/` 157 口径、tag 命名与不可移动核对、发布前可执行清单、`[Unreleased]` 处置与待拍板项 |
| `release-dry-run.mjs` | 只读干跑脚本，复刻 `release.yml` 的 tag/版本/changelog/lib 闸；不建 tag、不写文件、不联网。`--worktree` 让 changelog 与 package.json 从工作树读（发布候选通常是未提交状态） |
| `dry-run.txt` | 四个场景的实际输出：A 已提交树重打（拒绝）、A2 叠加工作树 changelog（只剩 tag/工作树两条 BLOCK）、B 硬抬版本（拒绝）、C 已知可发布版本回放（通过） |
| `release-yml-rehearsal.sh` | 把 `release.yml` 的版本闸 `run:` 块原样切出来，在临时目录实跑：负例（段名未改）必须失败、正例（发布准备齐备）必须通过 |
| `release-yml-rehearsal.txt` | 上述演练的输出（负例 exit 1 / 正例 exit 0 + 47 行 release notes） |
| `docs-version-gate.txt` | 仓库自带 `test/docs-version.spec.ts` 的正负对照：真仓库含 `[Unreleased]` 仍 8/8 PASS；只抬 `package.json` 则 6 红 2 绿 |

复跑：

```bash
node docs/knowledge/evidence/release-tag-check-2026-11-22/release-dry-run.mjs --ref HEAD --tag v0.12.19
node docs/knowledge/evidence/release-tag-check-2026-11-22/release-dry-run.mjs --ref HEAD --tag v0.12.19 --worktree
node docs/knowledge/evidence/release-tag-check-2026-11-22/release-dry-run.mjs --ref HEAD --tag v0.12.20 --worktree
node docs/knowledge/evidence/release-tag-check-2026-11-22/release-dry-run.mjs --ref 283577a --tag v0.12.19 --allow-existing-tag
bash docs/knowledge/evidence/release-tag-check-2026-11-22/release-yml-rehearsal.sh
npm run verify:lib                       # lib/ 157 文件逐字节一致
npx vitest run test/docs-version.spec.ts # 8/8 PASS
```

判定：前三条必须 `REFUSE TO TAG`（现状就该拒绝），第四条必须 `WOULD TAG`，第五条必须
`rehearsal: PASS`。若哪天第四条也变成拒绝，说明脚本或仓库状态坏了，先查脚本再谈发布。

设备=agent-90，时间 2026-11-22
