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

6. Do not move or overwrite a published tag. If release validation fails because the source/version is wrong, fix it through a PR and publish a new version. If only the runner or GitHub service failed after checks completed, rerun the failed workflow.

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
