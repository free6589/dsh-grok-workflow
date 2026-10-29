# Release and Versioning / 版本与发布

This repository publishes source-based GitHub Releases; it is **not published to npm**. The release workflow validates a version tag, runs the full CI checks, extracts the matching bilingual changelog section, builds a package tarball, and creates a GitHub Release only if all checks pass.

本项目通过 GitHub Releases 发布源码版本，**不发布到 npm**。发布工作流会校验版本标签、运行完整 CI 检查、提取对应的双语更新日志、打包插件，并且只有全部检查通过才会创建 GitHub Release。

## What each record is for / 每类记录的作用

- **Git commits** are the source-code history and the first place to look when inspecting or reverting a change.
- **Git tags** such as `v0.1.1` point to a specific commit and are the stable version identifier.
- **GitHub Releases** display the bilingual changelog for a tag and attach the generated `.tgz` package.
- **CHANGELOG.md** records what users can expect in each version.
- These records are not a separate disaster-recovery backup. For protection against repository deletion or account loss, periodically clone/mirror the repository to another location. Back up local DSH configuration, credentials, and runtime data separately; never commit secrets.

- **Git 提交记录**保存源代码修改历史，排查问题或回退代码时优先查看。
- **Git 标签**（例如 `v0.1.1`）固定指向某个提交，是安装指定版本的依据。
- **GitHub Releases**展示该标签对应的双语更新日志，并附带生成的 `.tgz` 包。
- **CHANGELOG.md**记录各版本对用户的实际影响。
- 这些记录不等于独立的灾难恢复备份。为防止仓库被删除或账号丢失，应定期将仓库克隆或镜像到另一个位置。DSH 本地配置、凭据和运行数据需要单独备份，绝不能把密钥提交进仓库。

## Version rule / 版本规则

Use Semantic Versioning with the form `MAJOR.MINOR.PATCH`:

| Change | Example | Rule |
|---|---|---|
| Bug fix or security fix, no intended breaking change | `0.1.0 → 0.1.1` | Increment PATCH |
| Backward-compatible feature | `0.1.1 → 0.2.0` | Increment MINOR |
| Breaking change | `0.2.0 → 1.0.0` | Increment MAJOR |

Every user-visible fix or feature should first be listed under `[Unreleased]` in `CHANGELOG.md`. When preparing a release, move those entries into a versioned section and keep English and Simplified Chinese content in sync. A code commit does not automatically mean a new public version; publish a version after the change is reviewed and the checks pass.

采用 `主版本.次版本.修订版本` 格式：

| 变更类型 | 示例 | 规则 |
|---|---|---|
| 不改变预期兼容性的 Bug / 安全修复 | `0.1.0 → 0.1.1` | 修订版本 +1 |
| 向后兼容的新功能 | `0.1.1 → 0.2.0` | 次版本 +1 |
| 不兼容的重大变更 | `0.2.0 → 1.0.0` | 主版本 +1 |

每个用户可见的功能或修复，都应先写入 `CHANGELOG.md` 的 `[Unreleased]`。准备发布时，再把对应条目移入带版本号的章节，并同步英文和简体中文。一次代码提交不等于一次公开发版；需要先完成审查并通过检查，再发布版本。

## First version / 首次发版

`v0.1.0` was published on 2026-10-25 from commit `a7d5a62`; the release workflow run `40182751006` passed and created the GitHub Release with the package tarball.

`v0.1.0` 已于 2026-10-25 从提交 `a7d5a62` 发布；Release workflow `40182751006` 通过，并创建了带插件压缩包的 GitHub Release。

## 0.2.0 — released 2026-10-26 / 0.2.0 — 已于 2026-10-26 发布

| | |
|---|---|
| Tag | `v0.2.0` on commit `f7a244c` |
| GitHub Release | 2026-10-26T17:10:16Z |
| Artifact | 42 files in the tarball, **108,428 B** |

`v0.2.0` 已发布，标签永不移动。它的发布说明保留在
[docs/releases/RELEASE-NOTES-0.2.0.md](releases/RELEASE-NOTES-0.2.0.md)，`CHANGELOG.md` 的
`## [0.2.0] - 2026-10-26` 章节即为当时发布流程提取的文本。`0.2.1` 是它之上的增量版本，
只新增 Web GUI 设置页与"激活前提"文档，配置面与报告格式不变。

## 0.2.1 — released 2026-10-27 / 0.2.1 — 已于 2026-10-27 发布

| | |
|---|---|
| Tag | `v0.2.1` on commit `cecc065` |
| Artifact | 43 files, ~121 KB |

`0.2.1` added the Web GUI settings page and documented the activation prerequisite; the published
notes are [docs/releases/RELEASE-NOTES-0.2.1.md](releases/RELEASE-NOTES-0.2.1.md). Its tag must not
be moved.

`0.2.1` 新增 Web GUI 设置页并记录激活前提，发布说明见
[docs/releases/RELEASE-NOTES-0.2.1.md](releases/RELEASE-NOTES-0.2.1.md)；该标签不得移动。

## 0.2.3 (released 2026-10-29) / 0.2.3（已发布 2026-10-29）

`0.2.3` is released: tag `v0.2.3` on commit `538d1ab`, GitHub Release
[Grok Workflow for DSH v0.2.3](https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.2.3),
asset `dsh-grok-workflow-0.2.3.tgz` (175,113 bytes, sha256 `65fd720c…`), Release workflow run
[40824592139](https://github.com/free6589/dsh-grok-workflow/actions/runs/40824592139) green.
`package.json` and `package-lock.json` both say `0.2.3`, and
`CHANGELOG.md` carries the bilingual `## [0.2.3] - 2026-10-28` section the release workflow
extracts. `0.2.2` is published (`v0.2.2` on `5ecd96b`) and its tag must not be moved; the `0.2.2`,
`0.2.1`, `0.2.0` and `0.1.0` changelog sections are byte-identical to what those tags carry.

This is the front-desk release: the central promise changed from "every message runs the full
workflow" to "every message passes the front desk, which states its tier in public" (DECISIONS
D-021), plus the t53 review's blocker fix (short questions and short two-step instructions were
answered from the greeting template — DECISIONS D-025). Release notes draft:
[docs/releases/RELEASE-NOTES-0.2.3.md](releases/RELEASE-NOTES-0.2.3.md).

`0.2.3` 已发布：标签 `v0.2.3` 指向提交 `538d1ab`，GitHub Release
[Grok Workflow for DSH v0.2.3](https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.2.3)，
资产 `dsh-grok-workflow-0.2.3.tgz`（175,113 字节，sha256 `65fd720c…`），Release 工作流
[40824592139](https://github.com/free6589/dsh-grok-workflow/actions/runs/40824592139) 通过。
`package.json` 与 `package-lock.json` 都是 `0.2.3`，`CHANGELOG.md`
含发布工作流要提取的双语 `## [0.2.3] - 2026-10-28` 章节。`0.2.2` 已发布（`v0.2.2` 在 `5ecd96b`），
其标签不得移动；`0.2.2`/`0.2.1`/`0.2.0`/`0.1.0` 的章节与那些标签逐字节一致。

这是"前台"版本：核心承诺从"每条消息都跑完整工作流"改为"每条消息都过前台，前台公开写明档位"
（DECISIONS D-021），并修掉 t53 评审的 blocker（短问句与短两步指令曾被当寒暄用模板答掉 ——
DECISIONS D-025）。发布说明草稿：[docs/releases/RELEASE-NOTES-0.2.3.md](releases/RELEASE-NOTES-0.2.3.md)。

## 0.2.2 (released) / 0.2.2（已发布）

`0.2.2` is prepared on `main`: `package.json` and `package-lock.json` both say `0.2.2`, and
`CHANGELOG.md` carries the bilingual `## [0.2.2] - 2026-10-28` section the release workflow
extracts. `0.2.1` is published (`v0.2.1` on `cecc065`) and its tag must not be moved. What 0.2.2
contains: the plugin-enforced deadline, `Model routes:` in every report, the per-session run cap,
the unload diagnosis record, and the verifier-decision fix (a non-empty `issues` list no longer
fails a task whose verdict is `pass`).

**Release-note constraint:** the changelog states the measured record (1 `COMPLETED` in 12 reports
before the fix) and says plainly that this release fixes a decision defect rather than raising
model quality. Do not let a summary soften that into "quality improved" — see
`docs/knowledge/VALIDATION.md` Round 8.

Artifact: `npm pack` produces **43 files, ~150 kB**, `dsh-grok-workflow-0.2.2.tgz` (same file set as
`0.2.1`: `lib/` incl. `lib/client.js`, `package.json`, `cordis.patch.yml`, `LICENSE`, both READMEs,
`CHANGELOG.md`, `docs/*.md` + `docs/images/`; `test/`, `scripts/`, `docs/knowledge/` excluded).

`0.2.2` 已在 `main` 上准备好：`package.json` 与 `package-lock.json` 都是 `0.2.2`，
`CHANGELOG.md` 含发布工作流要提取的双语 `## [0.2.2] - 2026-10-28` 章节。`0.2.1` 已发布
（`v0.2.1` 指向 `cecc065`），其标签不得移动。本版内容：插件自持 deadline、每份报告的
`Model routes:`、按会话的运行槽位、卸载诊断记录，以及 verifier 判定修复（`issues` 非空不再
否决 `pass` 的结论）。

**发布说明的硬约束：**更新日志写的是实测口径（修复前 12 份报告仅 1 份 `COMPLETED`），并明说
本版修的是判定缺陷而非提升模型质量；任何摘要都不得把它软化成效能提升——见
`docs/knowledge/VALIDATION.md` Round 8。

产物：`npm pack` 生成 **43 个文件、约 150 kB**，文件名 `dsh-grok-workflow-0.2.2.tgz`（文件集合
与 `0.2.1` 相同：`lib/`（含 `lib/client.js`）、`package.json`、`cordis.patch.yml`、`LICENSE`、
两份 README、`CHANGELOG.md`、`docs/*.md` 与 `docs/images/`；`test/`、`scripts/`、`docs/knowledge/`
不打进包）。

For the next release, follow the checklist below. The tag must point to a commit on `main` whose `package.json` version and `CHANGELOG.md` section match the tag. The workflow runs typecheck, lint, build, `lib/` consistency, tests, package checks, and only then creates the Release.

后续发版按下面的检查清单执行。标签必须指向 `main` 上的提交，且 `package.json` 版本和 `CHANGELOG.md` 章节都要与标签一致。工作流会依次运行 typecheck、lint、build、`lib/` 一致性检查、测试和打包检查，全部通过后才创建 Release。

## Publish a later version / 发布后续版本

1. Create a release branch and bump both `package.json` and `package-lock.json`. For a bug fix, for example, run:

   ```sh
   npm version patch --no-git-tag-version
   ```

   Use `npm version minor --no-git-tag-version` for a new compatible feature, or `major` for a breaking release.

2. Edit `CHANGELOG.md`: move the shipped entries from `[Unreleased]` into a new heading such as `## [0.1.1] - YYYY-MM-DD`; add a fresh `[Unreleased]` section and keep both languages synchronized.

3. Run the checks locally:

   ```sh
   npm ci
   npm run typecheck
   npm run lint
   npm run build
   git diff --exit-code -- lib/
   npm test
   npm pack --dry-run
   ```

4. Commit these changes, open a PR, and merge only after review and green CI. From the updated `main`, tag and push the exact merged commit, for example:

   ```sh
   git switch main
   git pull --ff-only
   git tag v0.1.1
   git push origin v0.1.1
   ```

5. Open the Actions tab and check the Release workflow. It creates the GitHub Release and attaches the package tarball when all checks pass.

6. Do not move or overwrite a tag after a GitHub Release exists. If the first release validation fails before any Release is created, fix the workflow/source, delete and recreate the tag at the fixed commit, and record the move. After a Release exists, publish a new version instead. The release workflow currently runs on Node.js 22 only; main CI covers Node 22 and 24.

## Install or return to a fixed version / 安装指定版本或回退

After the corresponding tag exists, add the version suffix `#vX.Y.Z` to the GitHub install spec:

对应标签发布后，在 GitHub 安装地址后加上 `#vX.Y.Z`：

```sh
# Install an exact release version:
dsh plugin --profile grok-workflow-dev add github:free6589/dsh-grok-workflow#v0.1.0

# Example: switch back to an older known-good release:
dsh plugin --profile grok-workflow-dev add github:free6589/dsh-grok-workflow#v0.1.0
```

Replace `v0.1.0` with a tag that is present on GitHub. The `v0.1.0` tag is published; the unpinned README command follows `main` and does not pin a release. Restart the profile after changing the installed version.

请把示例中的 `v0.1.0` 替换成 GitHub 上实际存在的标签。`v0.1.0` 已发布；README 中未固定版本的命令跟随 `main`，不会固定到发布版本。切换版本后请重启对应 DSH profile。
