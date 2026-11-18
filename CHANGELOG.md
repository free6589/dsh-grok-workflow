# Changelog / 更新日志

Notable user-facing changes are recorded here in English and Simplified Chinese.
用户可见的功能和修复会在这里以英文和简体中文记录。

## [Unreleased]

## [0.11.10] - 2026-11-18

### Docs / 文档

- **`docs/ARCHITECTURE.md` states version statuses as `since X.Y.Z` instead of "in this release" / `docs/ARCHITECTURE.md` 的版本状态改为 `since X.Y.Z`，不再写「in this release」** —
  a reader could not tell which release "in this release" meant, so the checkpoint section now
  says the code ships since **0.8.0**, the visibility section is headed `Since **0.8.0**`, and
  the two claims about what has no production caller are dated `as of **0.11.9**`. The
  `resume` boundary line names the DSH version it was measured on (**0.2.1-rc.2**) and now also
  says that round 8's install/activation/settings re-check happened on **0.2.2-rc.3** and did
  **not** re-measure that journaling boundary, instead of letting the newer version look like a
  newer measurement. / 读者无法判断「in this release」指哪个版本，因此 checkpoint 一节改为写明
  代码「since **0.8.0**」，用户可见面一节标题改为 `Since **0.8.0**`，两处「没有生产调用方」的
  断言改为「as of **0.11.9**」。`resume` 边界那一行写明它是在 DSH **0.2.1-rc.2** 上测的，并补充
  round 8 在 **0.2.2-rc.3** 上做的是安装/激活/设置面复查、**没有**重新测那条 journaling 边界，
  免得更新的版本看起来像更新的测量。

### Tests / 测试

- New `test/docs-architecture-version.spec.ts` (3 its): no release-relative phrase may appear,
  every `Status (` claim must carry a `since **X.Y.Z**` that does not lead the package version,
  and the resume boundary paragraph must keep naming both the measured version and the one that
  was only re-checked. Replayed red against the previous document (2 failed / 1 passed); the
  suite is 55 files / 1009 tests. / 新增 `test/docs-architecture-version.spec.ts`（3 条）：不得出现
  发布相对措辞；每条 `Status (` 断言必须带一个不超前于包版本的 `since **X.Y.Z**`；`resume` 边界
  段落必须同时写出「实测版本」与「只做复查的版本」。用上一版文档重放为红（2 failed / 1 passed）；
  套件为 55 文件 / 1009 测试。

## [0.11.9] - 2026-11-18

### Fixed / 修复

- **Progress tab: `执行` and `检查` are no longer reported as "not reported" / 进度页不再把「执行」「检查」显示成「事件中没有报告」** —
  the script records the plan-task group title (`任务 1 · 标题`) as the `phase` of every worker
  and verifier call, and the tab matched rows by `phase` alone. The two stages every run
  performs therefore never claimed a row and rendered empty with
  `Not reported in the events` (`进展`), while the rows sat in plan-task nodes right below
  them. A row whose phase names no stage is now also matched by its **role label**
  (`执行`/`检查`, `Execute`/`Check` from `memberLabel()`), and cross-referenced onto that
  stage's new `evidence` list: state comes from the stage's own rows when it has any and from
  its evidence when it has none. `members` stays the one home per row, so the track and the
  percentage still count the same rows, and a task titled `check the build` does not become
  `检查` because role tokens never match a phase. The stage meta line now reads
  `{count} rows ran inside the plan tasks below` / `{count} 行在下方任务节点中执行` instead of
  the not-reported copy, in both locales. / 脚本把每次 worker / verifier 调用的 `phase`
  写成计划任务组标题（`任务 1 · 标题`），而本 Tab 只按 `phase` 匹配行。于是每次运行都必然发生的
  「执行」「检查」两个阶段从来分不到行，渲染成空白并显示「事件中没有报告」，而真正跑过的行就
  摆在它们下面的任务节点里。现在 phase 命中不了任何阶段的行还会按**角色 label**
  （`执行`/`检查`、`Execute`/`Check`，由 `memberLabel()` 生成）判一次归属，并交叉引用到该阶段新增的
  `evidence` 列表：阶段有自己的行就以自己的行为准，没有才看 evidence。`members` 仍是每行唯一的家，
  所以轨道与百分比统计的仍是同一批行；标题里含 `check` 的任务不会因此变成「检查」（角色 token
  不参与 phase 匹配）。阶段 meta 行在两个语言里都改为
  `{count} 行在下方任务节点中执行` / `{count} rows ran inside the plan tasks below`。

### Tests / 测试

- `test/progress-tab.spec.ts` +6 and `test/client.spec.ts` +2 (54 files / 1006 tests, from 999):
  role-label evidence for Chinese and English labels, the failed/doing derivation, a stage's own
  rows winning over its evidence, no evidence invented for a label that names no stage, the
  browser mirror agreeing with the typed rules, and the rendered meta line in both locales. The
  two substring-decoy tests now use a label that names no stage, so they isolate the phase
  channel instead of passing for the wrong reason. / `test/progress-tab.spec.ts` 新增 6 条、
  `test/client.spec.ts` 新增 2 条（54 文件 / 1006 测试，原为 999）：中英文角色 label 的
  evidence、failed/doing 推导、阶段自有行优先于 evidence、没有阶段可归时**不**编造 evidence、
  浏览器镜像与类型规则一致、两个语言下的渲染 meta 行。两条子串诱饵测试改用不含阶段名的 label，
  使它们只检验 phase 通道，而不是因为错误的原因通过。

## [0.11.8] - 2026-11-18

### Changed / 变更

- **DSH `0.2.2-rc.3` is now verified for install, activation and settings projection / DSH `0.2.2-rc.3` 的安装、激活与设置面已有实测** —
  the docs said the bundle "installs and composes" on `0.2.2-rc.3` while behaviour was only
  verified on `0.2.1-rc.2`. A real isolated profile (`web` template, `dsh plugin add` of this
  checkout as a `link:` dependency, `workflow-ptc` re-enabled) was booted on `0.2.2-rc.3`: the
  only boot output was the URL line (no `pending` row, no `did not activate` warning) and
  `POST /api/settings/describe` projected 23 namespaces, one of them `grok-workflow` with
  `autoGenerate: true`. Both READMEs and `docs/LOCAL-TESTING.md` now say exactly that. The
  model-backed message through `grok_workflow` remains **unverified**: the isolated profile has
  no credential and the run stops with
  `MISSING_CREDENTIAL: llm-deepseek: no API key for provider route "deepseek-official"`, which
  is recorded as blocked rather than reported as a pass. / 文档原先只说该 bundle 在
  `0.2.2-rc.3` 上「可安装并进入组合图」，行为却只在 `0.2.1-rc.2` 上验证过。本轮用真实孤立 profile
  （`web` 模板、以 `link:` 依赖方式 `dsh plugin add` 本检出、重新启用 `workflow-ptc`）在
  `0.2.2-rc.3` 上启动：启动输出只有一行 URL（没有 `pending` 行、没有 `did not activate` 警告），
  `POST /api/settings/describe` 投出 23 个命名空间，其中包括 `autoGenerate: true` 的
  `grok-workflow`。两份 README 与 `docs/LOCAL-TESTING.md` 现在如实写清这一点。经
  `grok_workflow` 的真模型消息仍未验证：孤立 profile 没有凭据，运行以
  `MISSING_CREDENTIAL: llm-deepseek: no API key for provider route "deepseek-official"`
  停下，记为 blocked 而不是 pass。

### Docs / 文档

- `docs/LOCAL-TESTING.md`: a new trap (a `web`-template profile has no `headless` command —
  `dsh --profile <name> headless "task"` is rejected with `too many arguments` and `--host` is
  an unknown option there) and the `MISSING_CREDENTIAL` line a fresh isolated profile produces,
  with the rule that a key is never copied out of another profile to make the smoke test pass. /
  `docs/LOCAL-TESTING.md` 新增一条坑：`web` 模板创建出的 profile 没有 `headless` 命令
  （`dsh --profile <name> headless "task"` 会被 `too many arguments` 拒绝，`--host` 也属未知选项），
  以及全新孤立 profile 会输出的 `MISSING_CREDENTIAL` 行，并写明不得为了糊弄冒烟测试而从别的
  profile 拷密钥。

## [0.11.7] - 2026-11-18

### Docs / 文档

- **The tag inventory is now audited, and the one non-release tag is named / 标签清单已对账，唯一的非发布标签已写明** —
  all 32 remote tags were compared tag-by-tag with the README published list and with
  `package.json` at each tag's commit: 31 release tags match their version, the lists in both
  languages are ascending, duplicate-free, end at the current release and contain no extra or
  missing entry, every tag object is identical locally and on `origin`, and `HEAD` equals
  `origin/main`. The single exception is the prerelease `v0.2.0-rc.1`, which predates the
  release workflow and sits on a commit whose `package.json` still says `0.1.0`; a published
  tag is never moved, so both READMEs now state that it is not a release, and
  `test/docs-version.spec.ts` fails if that note disappears. / 32 个远端标签逐个与 README
  已发布列表、以及各标签所在提交的 `package.json` 对账：31 个发布标签与版本号一致，中英两份
  列表升序、无重复、末项为当前发布、无多余也无缺失，每个标签对象本地与 `origin` 完全相同，
  `HEAD` 与 `origin/main` 一致。唯一例外是预发布标签 `v0.2.0-rc.1`——它早于发布流程，所在提交的
  `package.json` 仍写着 `0.1.0`；已发布标签永不移动，因此两份 README 都写明它不属于发布版本，
  该说明若消失 `test/docs-version.spec.ts` 会失败。

### Tests / 测试

- `test/docs-version.spec.ts` 7 → 8 `it`s: the documented prerelease exception may not be
  removed silently. No skip, no loosened assertion. / `test/docs-version.spec.ts` 从 7 个 `it`
  增至 8 个：已写明的预发布例外不得被悄悄删掉。无跳过、无放宽断言。

## [0.11.6] - 2026-11-18

### Fixed / 修复

- **The local-testing guide named tarballs this release never produced / 本地测试指南指向本版本从未产出的压缩包** —
  four install examples in `docs/LOCAL-TESTING.md` said `dsh-grok-workflow-0.2.0.tgz` /
  `-0.2.1.tgz` while the release line is `0.11.x`, so a reader following the guide hits a
  missing file. All four now name the current artifact, and `.rsi/tools/bump-version.py`
  rewrites the name on every bump, with `test/docs-config-keys.spec.ts` failing if either
  side drifts. / `docs/LOCAL-TESTING.md` 的四处安装示例写着
  `dsh-grok-workflow-0.2.0.tgz` / `-0.2.1.tgz`，而发布线早已是 `0.11.x`，照文档操作会找不到文件。
  四处已改为当前产物名；`.rsi/tools/bump-version.py` 在每次升版本时同步改写该名字，
  `test/docs-config-keys.spec.ts` 任一侧漂移都会失败。
- **A repaired configuration value was documented as a load-time rejection / 一个被修复的配置值写成了载入期拒绝** —
  the troubleshooting entry quoted `roles.synthesizer is set but synthesis is "deterministic"`,
  a message this build never emits. `apply()` repairs a stored `synthesis: "deterministic"` to
  `layered` (and `synthesis: "model"` with an empty synthesizer chain likewise) *before*
  `resolveConfig` runs, so the guide now quotes the two messages the code actually produces —
  `unknown configuration key "triageModel"; accepted keys: …` and
  `synthesis must be "model" or "layered", got "…"` — and states which values are repaired
  instead of refused. / 排障条目引用了本构建从不输出的
  `roles.synthesizer is set but synthesis is "deterministic"`。`apply()` 会在 `resolveConfig`
  之前把存量 `synthesis: "deterministic"` 修复为 `layered`（`synthesis: "model"` 配空的
  synthesizer 链同理），因此文档现改为引用代码真正会输出的两条消息——
  `unknown configuration key "triageModel"; accepted keys: …` 与
  `synthesis must be "model" or "layered", got "…"`——并说明哪两个取值是被修复而非拒绝。
- **The Chinese README used a different notation for the fixed caps / 中文 README 对固化上限用了不同写法** —
  `maxActiveRuns` 每会话 `2` / `maxActiveRunsTotal` 每进程 `8` now reads
  `maxActiveRuns=2`（每会话） / `maxActiveRunsTotal=8`（每进程）, matching the English
  `key=value` form so one guard binds both READMEs to the constants. No number changed. /
  中文改与英文相同的 `key=value` 写法，一份守卫即可把两份 README 钉到同一批常量；数值未变。

### Tests / 测试

- `test/docs-config-keys.spec.ts` 7 → 12 `it`s: `docs/LOCAL-TESTING.md` must name every
  `CONFIG_KEYS` entry and state the count the code enforces, must quote
  `FIXED_MAX_RETRIES` / `FIXED_MAX_ACTIVE_RUNS` / `FIXED_MAX_ACTIVE_RUNS_TOTAL` /
  `DEFAULT_TIMEOUT_MS`, must name only tarballs equal to `package.json`'s version, and must
  quote only messages `src/config.ts` can produce; both READMEs must state all seven fixed
  caps read from the constants. No skip, no loosened assertion. / 
  `test/docs-config-keys.spec.ts` 从 7 个 `it` 增至 12 个：`docs/LOCAL-TESTING.md` 必须点全
  `CONFIG_KEYS` 每一项并写出与代码一致的键数，必须引用
  `FIXED_MAX_RETRIES` / `FIXED_MAX_ACTIVE_RUNS` / `FIXED_MAX_ACTIVE_RUNS_TOTAL` /
  `DEFAULT_TIMEOUT_MS`，只能写与 `package.json` 版本相同的压缩包名，只能引用
  `src/config.ts` 真会输出的消息；两份 README 必须写出从常量读出的七条固化上限。
  无跳过、无放宽断言。

## [0.11.5] - 2026-11-18

### Fixed / 修复

- **Redaction missed four credential shapes and rewrote non-secret code / 脱敏漏掉四类凭据形状，还会改写非敏感代码** —
  `src/redact.ts` now covers (1) a `Cookie`/`Set-Cookie` header written inside a quoted shell
  argument (`curl -H 'Cookie: PHPSESSID=…'`), where the old pattern only matched at line start,
  (2) presigned-URL signatures `X-Amz-Signature`, `X-Goog-Signature` and the generic `auth`
  query parameter, (3) PGP armored `BEGIN PGP PRIVATE KEY BLOCK` blocks, whose banner the PEM
  rule could not match, and (4) short values of `SECRET_KEY` / `PRIVATE_TOKEN`, which the env
  rule's key alternation lacked. Two false positives are gone: `key-value-env` no longer ends a
  value inside a call, a comparison or a code keyword (`const token = await refreshToken()`,
  `if (password == null)` are left untouched), and its value now terminates at a token boundary
  so `db_pass=hunter2;user=app` keeps `;user=app` instead of swallowing it. An already-redacted
  placeholder (`X-Amz-Credential=[REDACTED AWS ACCESS KEY]`) is no longer re-redacted into
  `[REDACTED] AWS ACCESS KEY]`. / `src/redact.ts` 现在覆盖：（1）写在
  shell 引号参数里的 `Cookie`/`Set-Cookie` 头（`curl -H 'Cookie: PHPSESSID=…'`），旧规则只在行首匹配；
  （2）签名链接参数 `X-Amz-Signature`、`X-Goog-Signature` 与通用 `auth`；（3）PGP armor 的
  `BEGIN PGP PRIVATE KEY BLOCK` 块（PEM 规则匹配不到它的横幅）；（4）`SECRET_KEY` / `PRIVATE_TOKEN`
  的短值（env 规则的键名分支原本没有它们）。同时修掉两个误伤：`key-value-env` 不再把值截断在调用、
  比较或代码关键字中间（`const token = await refreshToken()`、`if (password == null)` 原样保留），
  值现在在 token 边界结束，`db_pass=hunter2;user=app` 会保留 `;user=app` 而不再整段吞掉；
  已脱敏的占位符（`X-Amz-Credential=[REDACTED AWS ACCESS KEY]`）不会再被打成
  `[REDACTED] AWS ACCESS KEY]`。

### Docs / 文档

- Both READMEs and `docs/ARCHITECTURE.md` now name the covered credential families, the
  two deliberate asymmetries (over-redaction preferred to rewriting code; a value ends at a
  token boundary) and the known base64-PEM gap; a docs test fails if a family disappears from
  any of the three documents. / 两份 README 与 `docs/ARCHITECTURE.md` 现在列出覆盖的凭据族、
  两处有意取舍（宁可多脱敏，也不改写代码；值在 token 边界结束）以及已知的 base64-PEM 缺口；
  任一份文档丢掉某个族都会让文档测试失败。

### Tests / 测试

- `test/redact.spec.ts` 24 → 32 `it`s: quoted-header cookies, three signed-URL families, PGP
  armor, env value termination, placeholder stability, the code non-rewrite cases, deep-copy
  header keys (`x-api-key`/`secretKey`), and a documentation guard over
  `README.md`/`README.zh-CN.md`/`docs/ARCHITECTURE.md`; the prompt-parity corpus grew from 22
  to 29 samples so the generated script mirror is checked on the new shapes too. / 
  `test/redact.spec.ts` 从 24 个 `it` 增至 32 个：引号内 Cookie 头、三类签名链接、PGP armor、
  env 值边界、占位符稳定、代码不改写、深拷贝头部键（`x-api-key`/`secretKey`），以及对
  `README.md`/`README.zh-CN.md`/`docs/ARCHITECTURE.md` 的文档守卫；提示词一致性用例的语料
  从 22 条增至 29 条，新形状在生成脚本里同样被核对。

## [0.11.4] - 2026-11-18

### Fixed / 修复

- **Settings-page scalar count said seven, the code enforces eight / 设置页标量数写成七个，代码实际是八个** —
  `CONFIG_KEYS` carries nine keys with only `roles` non-scalar, so the scalar settings are
  `toolName`, `mode`, `grokDefault`, `synthesis`, `maxConcurrency`, `maxTasks`, `timeoutMs`,
  `configVersion` (8); both READMEs said seven and now say eight. `test/types/js-yaml.d.ts`
  adds a local `declare module 'js-yaml'` shim (minimal `load` signature) so
  `npm run typecheck` passes without a new dependency, without moving `js-yaml` to
  `dependencies`, and without `ts-ignore` (TS7016). / `CONFIG_KEYS`
  九项中只有 `roles` 是非标量，标量应为 `toolName`、`mode`、`grokDefault`、`synthesis`、
  `maxConcurrency`、`maxTasks`、`timeoutMs`、`configVersion` 共 8 个；两份 README 都写成七个，
  现已改为八个。`test/types/js-yaml.d.ts` 以本地 `declare module 'js-yaml'`
  垫片（含最小 `load` 签名）修通 `npm run typecheck`（TS7016），未新增依赖、
  未把 `js-yaml` 移入 `dependencies`、未使用 `ts-ignore`。

### Tests / 测试

- `test/docs-config-keys.spec.ts` (+4): the configuration-surface size both READMEs state
  must equal `CONFIG_KEYS.length`, every YAML config example must load via `resolveConfig`,
  and the chain limit / role count must quote the enforced `50 routes` with none of the stale
  `three routes` / `four role chains` wording (plus a hard-limit-table row pinning the
  `50`); the 4 new `it` blocks are untouched by the
  typecheck fix. / 两份 README 声明的配置面大小必须等于 `CONFIG_KEYS.length`、
  每个 YAML 配置示例必须经 `resolveConfig` 载入通过、链上限与角色数必须引用实际执行的
  `50 routes` 且不得残留 `three routes` / `four role chains` 旧表述（另加硬上限表行级钉住
  `50`）；修 typecheck 时
  未改动新增的 4 个 `it` 断言。

## [0.11.3] - 2026-11-18

### Fixed / 修复

- **Two configuration keys the loader rejects were missing from the READMEs' list of
  removed keys / 载入时会拒绝的两个配置键，从未出现在 README 的"已删除键"清单里** —
  `triageModel` and `maxActiveRunsTotal` are both in `REMOVED_CONFIG_KEYS`, so a patch that
  still carries either fails to load with `unknown configuration key`; neither name appeared
  in `README.md` or `README.zh-CN.md`, so the person holding that patch had nothing to read.
  Both are now named (the per-process cap was described only as "`8` per process"), and
  `test/docs-config-keys.spec.ts` makes the code's two lists the contract for what the
  READMEs must document. / `triageModel` 与 `maxActiveRunsTotal` 都在
  `REMOVED_CONFIG_KEYS` 里，补丁还带着它们就会 `unknown configuration key` 载入失败，而两份
  README 都没提这两个名字——拿着旧补丁的人查不到任何说明。现在两个键都点名了（每进程上限
  原来只写作「每进程 `8`」），并由 `test/docs-config-keys.spec.ts` 把代码里的两张清单变成
  README 必须满足的约定。

### Tests / 测试

- `test/docs-config-keys.spec.ts` (3): every accepted key must be tabulated and every removed
  key must be named in both READMEs, and the two lists must stay disjoint
  (`REJECT`-worthy key drift is now a red test); red before this round with
  `README.md never mentions the removed key triageModel`.

## [0.11.2] - 2026-11-18

### Fixed / 修复

- **The v0.9.0 release notes were filed under v0.9.1, so v0.9.0 had no changelog entry
  at all / v0.9.0 的发布说明被挪到 v0.9.1 名下，v0.9.0 从此没有更新日志** —
  the `v0.9.1` release commit renamed the `## [0.9.0]` heading in place instead of adding a
  section, so the eleven bilingual entries that shipped the Progress tab are now labelled
  `0.9.1`, and the actual `0.9.1` note (stored caps clamp at load) was later promoted into
  `0.9.2`. The `0.9.0` section is restored verbatim from the commit that released it
  (`2d2b347:CHANGELOG.md`, byte-identical body), the clamp note is back under `0.9.1`, and
  `test/docs-version.spec.ts` now fails when a published tag has no section of its own or
  when the sections are not newest-first. / `v0.9.1` 的发版提交没有新增小节，而是把
  `## [0.9.0]` 的标题就地改名为 `0.9.1`：随进度 Tab 一起发出去的十一条中英条目现在挂在
  `0.9.1` 名下，真正的 `0.9.1` 说明（存量上限载入即钳制）后来又被并入 `0.9.2`。现在
  `0.9.0` 小节从发布它的那次提交逐字恢复（`2d2b347:CHANGELOG.md`，正文逐字节相同），
  钳制说明回到 `0.9.1`；`test/docs-version.spec.ts` 在「已发布标签没有自己的小节」或
  「小节不是由新到旧」时失败。

### Tests / 测试

- `test/docs-version.spec.ts` (7): every published tag must own a `## [x.y.z]` section and
  the sections must be ordered newest-first; red before this round with
  `no changelog section for v0.9.0`.

## [0.11.1] - 2026-11-18

### Fixed / 修复

- **The READMEs no longer advertise a release from three versions ago /
  README 不再推荐三个版本之前的发布** — both languages still said "the package
  version in this repository is `0.8.0`", pinned `#v0.8.0` in every install
  example, and stopped the published-tag list at `v0.8.0`, while the package was
  at `0.11.0` and nine more tags had been pushed. The declared version, the
  install examples, the tag-naming sentence and the published list now come from
  the real tags and are checked by `test/docs-version.spec.ts`, which fails the
  build when the prose and `package.json` disagree. / 中英两份 README 都还写着"本
  仓库声明的包版本是 `0.8.0`"、安装示例固定 `#v0.8.0`、已发布列表停在 `v0.8.0`，而
  包已经是 `0.11.0`、另有九个标签已推送。声明的版本、安装示例、正文里点名的标签、已发布
  列表现在都来自真实标签，并由 `test/docs-version.spec.ts` 钉住：说明文字与
  `package.json` 不一致时构建失败。

### Tests / 测试

- `test/docs-version.spec.ts` (6): declared version in both languages, every
  `plugin add` pin, bare `#vX.Y.Z` prose, published list ordering + last entry,
  and the newest changelog heading all agree with `package.json`.

## [0.11.0] - 2026-11-18

### Added / 新增

- **The run deadline is a setting now: `timeoutMs` / 运行死线变成配置项：`timeoutMs`** —
  the deadline was a fixed internal 60 minutes: raising it for a long job meant
  editing the plugin, and "which deadline was in force?" was only answerable from
  a report. It is now the ninth configuration key (settings page: **Run deadline
  (ms)**, `field.timeoutMs`), defaulting to `3600000` (60 min, the value t45
  measured), `0` = unlimited (no timer is armed). Any non-negative integer up to
  `Number.MAX_SAFE_INTEGER` is accepted; a negative, fractional, `NaN` or
  non-numeric value fails the load with its own reason instead of being
  rewritten. A value above `2147483647` (the largest `setTimeout` delay, which
  Node would fire immediately) is treated as unlimited internally while the
  report and the checkpoint record the configured number honestly. /
  死线以前是写死的 60 分钟：长活想放宽只能改插件，"实际生效的是哪个死线"也只能从报告里
  找。现在它是第九个配置键（设置页 **运行死线（毫秒）**，`field.timeoutMs`），默认
  `3600000`（60 分钟，t45 实测的值），`0` = 不限时（不设 timer）。接受
  `0 … Number.MAX_SAFE_INTEGER` 的任意整数；负数、小数、`NaN`、非数字一律载入失败并给出
  原因，不会被悄悄改写。大于 `2147483647`（`setTimeout` 上限，Node 会立刻触发）的值内部
  按不限时处理，报告与 checkpoint 仍如实记录配置的数字。

## [0.10.2] - 2026-11-17

### Fixed / 修复

- **Settings page no longer crashes on dirty stored data / 设置页不再被脏存量整页崩掉** —
  a non-object `roles` section (null, string, array from a legacy patch or hand edit)
  no longer throws the whole page; the page shows empty chains instead. A stored enum
  value outside the offered options (e.g. a legacy `mode`) is now a red validation
  error that blocks save instead of a green light that the Host then refuses.
  `validate` / `emptyCapWarn` / `opsFor` / `catalog` / `translate` all tolerate null
  inputs without throwing. / 存量 `roles` 非对象（旧补丁或手改留下的 null、字符串、
  数组）不再整页崩，显示空链即可。存量枚举值不在选项里（如旧 `mode`）现在红错锁保存，
  不再绿灯放行再被 Host 拒载。`validate` / `emptyCapWarn` / `opsFor` / `catalog` /
  `translate` 全加空值防御，不再抛错。

## [0.10.1] - 2026-11-17

### Fixed / 修复

- **Settings page: save-blocking bugs fixed, professional rewrite / 设置页：修好存不上，又重画了一遍** —
  execution order is now 1 break-down / 2 do / 3 check / **4 supervise** / 5 wrap-up,
  and the render order matches the numbers; role names carry their numbers
  (`4 · 监督`) in both languages. Mode is two radio cards (Auto / Full) instead
  of a dropdown that hid the difference; the two numbers are steppers (− / ＋,
  clamped 1–100) and the missing `unit.jobs` / `unit.tasks` keys are filled so the
  suffix no longer renders as `—`. Every route row now has a per-run cap input
  (empty = unlimited): a dirty stored cap finally has somewhere to be fixed —
  before, it failed validation with no editor and locked Save forever. Rows that
  block the save are outlined red inline (`missingModel` from one tap on
  `+ Add a backup`, `badCap`, duplicates). Empty chains say plainly that empty
  means "follows this chat, no backup set". Save / refuse / failure copy is in
  plain words. / 执行顺序现为拆活 1 / 干活 2 / 检查 3 / **监督 4** / 收尾 5，
  渲染顺序与序号一致；角色名自带序号（`4 · 监督`），中英双语。模式改双卡片二选一
  （自动挡 / 全员上），不再是藏起差异的下拉；两数字改步进器（− / ＋，钳制 1–100），
  补上缺的 `unit.jobs` / `unit.tasks` 键，后缀不再显示 `—`。每行加单次上限输入框
  （空 = 不限）：存量脏 cap 终于有地方改 —— 以前它校验不过又没编辑框，保存永远锁死。
  卡住保存的行行内红框标出（点一下 `＋ 加备选` 出空行没填完、`badCap`、重复）。
  空链明说空 = "跟这次对话用同一个，没加备选"。保存 / 拒绝 / 失败文案全换白话。

## [0.10.0] - 2026-11-17

### Added / 新增

- **Fifth role `supervisor`: one supervision call per task attempt / 第五角色`监督`：每任务每尝试一次监督调用** —
  a new `roles.supervisor` chain runs after verification and before synthesis;
  it can only fail a task, never pass one, and the settings page shows it as
  the fifth row （拆活/干活/检查/收尾/**监督**）. The per-task budget backstop
  is now `(50+50+50)×4=600` child calls.
  / 新增 `roles.supervisor` 链，在检查之后、收尾之前运行；只能判失败、不能判通过；
  设置页显示为第五行（拆活/干活/检查/收尾/**监督**）。单任务预算上限更新为
  `(50+50+50)×4=600` 次子调用。

### Changed / 变更

- **Settings slim-down: 8 keys stay, 24 removed with fixed behavior
  / 设置页瘦身：保留 8 键，删除 24 键并固化行为** —
  the configuration surface keeps exactly 8 keys (`toolName`, `mode`,
  `grokDefault`, `roles`, `synthesis`, `maxConcurrency`, `maxTasks`,
  `configVersion`). The other 24 keys are no longer accepted: a profile patch
  that still carries one is rejected as an unknown key (R-06), and the plugin
  runs on fixed internal values instead —
  `maxRetries=1`, `timeoutMs=3600000` (60 min),
  `humanSummary=true`, `showDiagnostics=false`, `answerStrategy=in-turn`,
  `triageModel` unset (inherit the run's route), `triageClassifier=rules`,
  `triageFollowupAsFast=true`, `instantReceipt=true`,
  `historyTurns=20` / `historyChars=20000`, `maxQueuedMessages=4`,
  `recordRuns=true`, `showProgress=true`, `recordLimit=256`,
  `switchOn=[]` (built-in policy), `subagentProvider` unset,
  gate always on (`enforceGate`/`gateRequired`/`gateScope`/`gatePreset`
  removed).
  The settings page shows `mode` as `auto`/`full` (`auto` = `triage`
  semantics); the gate delivers `in-turn` only (`relay`/`append` removed —
  they lose the answer on a one-shot app); output is markdown direct from the
  model (`synthesis` keeps `layered` default / `model` optional, `humanSummary`
  always on).
  Migration: delete the 24 keys from your profile patch; if you relied on a
  removed value (e.g. a longer `timeoutMs`, `showDiagnostics: true`, a
  `triageModel` override), there is no replacement — the fixed value above
  applies.
  / 配置表面只保留 8 个键（`toolName`、`mode`、`grokDefault`、`roles`、
  `synthesis`、`maxConcurrency`、`maxTasks`、`configVersion`）。
  其余 24 个键不再接受：旧补丁里还带着会被当未知键拒载（R-06），插件按
  固定内置值运行 —— `maxRetries=1`、`timeoutMs=3600000`（60 分钟）、
  `humanSummary=true`、`showDiagnostics=false`、`answerStrategy=in-turn`、
  `triageModel` 未设（继承本轮路由）、`triageClassifier=rules`、
  `triageFollowupAsFast=true`、`instantReceipt=true`、
  `historyTurns=20` / `historyChars=20000`、`maxQueuedMessages=4`、
  `recordRuns=true`、`showProgress=true`、`recordLimit=256`、
  `switchOn=[]`（内置策略）、`subagentProvider` 未设、门控恒开
  （`enforceGate`/`gateRequired`/`gateScope`/`gatePreset` 删除）。
  设置页 `mode` 显示为 `auto`/`full`（`auto` 即 `triage` 语义）；门控只走
  `in-turn` 投递（`relay`/`append` 删除 —— one-shot 下答案会丢）；输出为
  模型直出的 markdown（`synthesis` 保留 `layered` 默认 / `model` 可选，
  `humanSummary` 恒开）。
  迁移：从 profile 补丁里删掉这 24 个键；若以前依赖过被删的值（如更长的
  `timeoutMs`、`showDiagnostics: true`、`triageModel` 覆盖），没有替代项 ——
  一律按上面的固定值生效。

## [0.9.4] - 2026-11-16

### Added / 新增

- **A missing structured result gets one same-attempt resubmit before any retry
  / 交卷缺失先补交一次，不花重试次数** —
  when a worker call produces no structured result (the child fetched its data
  but never called the submit tool, returned nothing, or crashed the schema
  call), the same attempt now asks once more with a prompt that forbids redoing
  completed work: fetch only what is still missing, then submit immediately.
  The resubmit spends no retry budget (`attempts` stays one entry, marked
  `resubmitted: true`) and only format gaps qualify — transport/model failures,
  setup faults, and explicit non-format failures keep their original path, and a
  second miss records the attempt as failed under the normal retry policy.
  Verification strictness is unchanged: prose without a structured result still
  verifies nothing.
  / 当某次 worker 调用没有返回结构化结果（子会话取到了数据但没调交卷工具、
  返回空、无结构化值），同一次 attempt 先补问一次：prompt 禁止重做已完成的工作，
  只取还缺的、然后立刻交卷。补交不花重试额度（`attempts` 仍是一条，标
  `resubmitted: true`）；只有格式缺失才补交，传输/模型失败、setup 故障、
  明确的非格式失败走原路径；补交再缺才记 attempt 失败、进正常重试。
  核验严格性不变：没有结构化结果的 prose 依然核验不了任何东西。

## [0.9.3] - 2026-11-16

### Added / 新增

- **The Progress tab is now a seven-segment spine with one expanding branch
  / 进度 Tab 改为七段脊 + 单展开分支** —
  the track takes the full width once (seven equal segments, never sideways scroll);
  members grow downward inside the expanded segment only (accordion, one open at a time;
  failed first, else running, else collapsed to counts). An expanded branch shows three
  member cards and folds the rest into a real `+N` line; a failed segment carries a 2px
  red bar, a red dot and a count badge (never a whole red column); blocked is a dashed
  grey edge; the running connector is a flowing blue dashed line, never green. A
  "jump to first failure" button appears only when there is a failure. Under 480px the
  spine turns into a vertical step list (no sideways scroll); colours stay on
  `var(--dsw-alias-*)` tokens with icon + text fallbacks. Only rendering + CSS changed:
  folding, percentage, blocked derivation and the event contract are untouched.
  / 轨道只占一次满宽（七段等分，永不横滚）；成员只在当前展开段下方纵向生长（手风琴，
  同时只开一段：优先失败段，其次运行段，否则全收成计数）。展开段默认露三个成员卡，
  其余收成实数 `+N` 行；失败段只标一处（2px 左红条 + 列头红点 + 计数 badge，不整列描红）；
  阻塞用灰虚边；运行中连线用蓝色流动虚线，绝不用绿。有失败才出现"跳到首个失败"按钮。
  480px 以下轨道转竖排（无横滚）；颜色全走 `var(--dsw-alias-*)`，图标 + 文字兜底。只改了
  渲染 + CSS：折叠、百分比、blocked 推导、事件契约一律未动。

- **The answer comes first, the process is folded away; the main thread speaks first and works in the background
  / 答案为本、过程折叠，主会话先说话、边聊边干** —
  a Q&A run now opens with the direct answer (`答案：… / Answer: …`), followed by what to do next;
  the process tally (`N 项任务核验通过 / verified of N`) lives only in the two-sentence tail, never at
  the opening, and station IDs, coordinates, model routes, deadlines and shell output never reach the
  visible block (they stay in the ledger for `showDiagnostics`). The synthesizer prompt carries hard
  rules (no status-line opening, no machine tokens, paraphrase evidence instead of quoting it, one
  language per clause), enforced by a host-side style guardrail that falls back to the deterministic
  narrative. On an interactive surface the team no longer blocks the main thread: a live first answer
  (written fresh per message by one light model call over the `triageModel` route — structure is fixed,
  wording never is) enters the turn immediately while the workflow runs in the background with the
  progress board; a failed first-answer call degrades to a plainly-labelled template fallback. Saying
  "stop X / focus on Y" cancels the in-flight round and restarts narrowed (whole-round cancel +
  narrow restart; no subtask-level redirect in V1). Headless one-shot keeps the old blocking behaviour
  (`in-turn` fallback) so the final answer is never lost; `answerStrategy` default (`in-turn`), `full`
  pipeline bytes, all caps, verification, redaction, unload-cancel, and every switch default are unchanged.
  / 问答类任务现在首屏就是直接答案（`答案：… / Answer: …`），其次是下一步；过程计数（`N 项任务核验通过 /
  verified of N`）只出现在末尾两句收束语里，站号、坐标、模型路由、时限、shell 输出一律不进可见块
  （`showDiagnostics` 打开才在台账里看）。synthesizer prompt 加硬约束（禁状态行开头、禁机器 token、
  证据只转述不贴原文、单句单语言），宿主侧风格 guardrail 兜底，不合规就回落确定性叙事。可交互会话里
  团队不再挂死主会话：一次轻量模型调用（走 `triageModel` 快手链路）按固定信息结构现场写首答、当即
  `enter`，工作流后台跑、进度节点照常；首答失败则明说降级为模板兜底。说"停掉 X / 重点查 Y"即取消整轮
  并窄化重起（V1 无子任务级重定向）。headless 单发保持阻塞旧行为（`in-turn` 回落），最终答案不丢；
  `answerStrategy` 默认值（`in-turn`）、`full` 管线字节、全部上限、核验、脱敏、unload 取消与各开关默认
  全部不变。

## [0.9.2] - 2026-11-15

### Added / 新增

- **The answer you read opens with the plain-language block, and the machine ledger is no longer part of it
  / 你读到的答复以人话块开头，机器台账不再算答复的一部分** —
  the message this plugin delivers now carries the plain-language block between the relay markers — what
  was done, what came of it, what to do next, in both languages — and the machine ledger is folded *below*
  the closing marker under an explicit guard line that tells the main model never to quote, mention or
  summarise it. The ledger still travels inside the message, because that is the durable copy the Progress
  node detail and the cross-round carry-over read back out of the transcript, but it is no longer what the
  reader sees. `showDiagnostics` puts the ledger back inside the markers for a reader who asks for it.
  Machine detail that a task result can quote (shell commands with flags, digests and hex dumps, URLs and
  file paths, bare file names, fenced and inline code, relay markers) is stripped from the human lines; a
  line that was nothing but machine detail is dropped rather than handed to the reader, while a failure
  reason keeps its own wording.
  / 插件出站的消息现在把人话块放在标记之间——做了什么、结果怎样、下一步，两种语言各一段；机器台账折到
  结束标记**之后**，由一行显式守卫说明「这是给你的内部上下文，不许引用、提及或概括」。台账仍随消息
  留存，因为 Progress 节点详情与跨轮延续正是从 transcript 把它读回来，但它不再是读者看到的东西；
  `showDiagnostics` 打开时台账回到标记内。任务结果里可能被引用的机器细节（带参数的 shell 命令、
  摘要与十六进制转储、URL 与文件路径、裸文件名、围栏与行内代码、relay 标记）会从人话行里剥掉，
  整行都是机器细节的直接丢弃而不是塞给读者；失败原因保留自己的措辞。

### Fixed / 修复

- **Every numeric hard cap now lives in one clamp table, and a clamped value warns once per load
  / 数值硬上限收敛到一张钳制表，钳制告警每次载入一条（B02、B04）** —
  `LIMIT_CAPS` is the single declaration of which numeric keys clamp at a hard maximum and where that
  maximum is (every bound reads `HARD_LIMITS`), and both the schema side (`clampedLimit`) and the
  load-time repair (`repairLimitOverruns`) take their bound from it: a new cap is one line instead of two
  bounds that drift apart. Both layers only keep books; `announceOverruns()` is the single voice and
  de-duplicates by `field:stored`, so a patch that is still over the cap no longer prints one warning per
  message. Ten fields clamp (concurrency, retries, queue length, history turns and chars, tasks, timeout,
  active runs, record limit); per-route `maxInFlight` and `configVersion` are deliberately outside the
  table.
  / `LIMIT_CAPS` 是「哪些数值键按硬上限钳制、界在哪」的唯一声明（界一律读 `HARD_LIMITS`），schema 侧
  （`clampedLimit`）与载入期修复（`repairLimitOverruns`）都从这张表取界：新增上限改一行，不再两处
  各写一个界而漂移。两层钳制都只记账，`announceOverruns()` 是唯一发声点并按 `field:stored` 去重，
  补丁仍超限时不再每条消息刷一条告警。表内 10 个字段（并发、重试、队列长度、历史轮数与字符、
  任务数、超时、活跃 run、记录上限）；每路由 `maxInFlight` 与 `configVersion` 刻意不在表内。

- **The settings banner names the value you stored, not the one that took effect
  / 设置页横幅说的是你存下的值，不是生效后的值（B01）** —
  a banner that read the projected (already clamped) value would show `6` for a patch that says `8` — it
  would quietly change the user's words. It now reads the stored user layer and shows what was actually
  written.
  / 横幅若读投影（已被钳制的）值，补丁写 `8` 会显示成 `6`，等于替用户改口；现在读用户层，显示真正
  写下的值。

- **The progress tab stops drawing stages nothing ever ran
  / 进度 Tab 不再画出没跑过的阶段** —
  a stage token containing Latin letters must now sit on a word boundary (CJK tokens still match as
  substrings), because loose matching read `ui` out of `build`, `tag` out of `stage`/`target` and `sync`
  out of `async`, and drew three stages nobody ran. The node detail takes its seven fields down a fixed
  source ladder — the `stage-detail` event, then the child session's explicit coordination block, then
  `not reported` — and only parses the three explicit block shapes, so prose is never guessed into
  fields; `Copy coordination block` enables only when the block was really parsed. A connector is filled
  only when the node on its left is `done` (the attribute is absent rather than `"false"`), and
  `failed`/`blocked` leave it empty on purpose: the line is evidence, not decoration. A node's ring
  carries one state glyph, replaced by the row count when the node aggregates several rows.
  / 阶段 token 含拉丁字母的现在必须落在词边界（CJK token 仍按子串匹配），因为松匹配从 `build` 里读出
  `ui`、从 `stage`/`target` 里读出 `tag`、从 `async` 里读出 `sync`，凭空画出三个没人跑过的阶段。
  节点详情七个字段走固定来源阶梯——`stage-detail` 事件、子会话显式协调块、`not reported`——只认三种
  显式块形态，散文永不猜成字段；`Copy coordination block` 只在真的解析到块时才可点。连线只在左侧
  节点自己 `done` 时填充（属性缺席而不是 `"false"`），`failed`/`blocked` 故意留空：线是证据，不是
  装饰。节点环里一个状态字形，聚合多行时换成行数。

### Tests / 测试

- **Two gate tests waited on the wrong condition and are re-synchronized (`test/gate.spec.ts` only)
  / 两条 gate 测试等错了条件，已重新同步（只改 `test/gate.spec.ts`）** —
  no product behaviour changed. The queue-full test waited for one relay follow-up, which the refusal
  notice already satisfies, so it re-dispatched while the admitted batch was still draining, was refused
  by the same full queue, and never started the run it is about; it now waits for both messages. The
  append test waited for two session appends, which the run's own progress events already satisfy, so it
  asserted before the answer was written; it now waits for the `assistant/message`. Both were
  timing-sensitive on this host (red locally, green in CI on Node 22/24 at the same commit); the new
  conditions are ordering-based, not clock-based.
  / 产品行为未变。队列满那条等的是「一条 relay follow-up」，而拒绝通知本身就满足它，于是在被受理的
  批次还在排空时就重发、又被同一个满队列拒绝，它要验证的那次 run 根本没起来；现在等两条消息都到。
  append 那条等「两条 session append」，而 run 自己的进度事件就满足它，于是断言早于答复落盘；现在
  等 `assistant/message`。两条在本机是时序敏感的（同一个提交本机红、CI 的 Node 22/24 绿）；新条件
  依据的是先后顺序，不是时钟。

## [0.9.1] - 2026-11-15

### Fixed / 修复

- **Stored `maxConcurrency` / `maxRetries` over the hard maximum no longer disables the whole plugin
  / 存量 `maxConcurrency` / `maxRetries` 超上限不再让整个插件起不来** —
  a profile patch written before v0.9.0 (e.g. `maxConcurrency: 8`, `maxRetries: 5`) now activates
  at the documented caps (`6` / `3`) with one bilingual warning per field instead of failing the
  whole `grok-workflow` row with `ValidationError`. Values below the minimum, non-numbers, and
  programmatic `resolveConfig` overruns still fail closed (R-06); the caps themselves are unchanged.
  / v0.9.0 之前写的 profile 补丁（如 `maxConcurrency: 8`、`maxRetries: 5`）现在按文档上限
  （`6` / `3`）钳制生效，每项一条中英告警，不再让整行 `grok-workflow` 报 `ValidationError`
  起不来。低于下限、非数字、程序化 `resolveConfig` 越界仍硬拒绝（R-06），上限本身不变。

## [0.9.0] - 2026-11-15

### Added / 新增

- **A third tab shows what the workflow is doing, folded from the events it records
  / 第三个 Tab 展示工作流正在做什么 —— 全部由它自己记录的事件折叠而来** —
  the session now has three tabs, `Chat / Trajectory / Progress` (对话 / 轨迹 / 进度). The progress
  tab is not selected by default and adds no setting, no button and no new registration elsewhere.
  The track is folded from the four `tool-workflow/*` events this plugin already records
  (`run-start`, `agent-start`, `agent-end`, `run-end`): a stage the engine never reported stays
  `pending` with `Not reported in the events` instead of borrowing a neighbour's state, and the
  percentage is `settled/declared` — absent when no row is declared, never a guess. The states are
  `pending`, `doing`, `done`, `cancelled` (the engine's own word), plus two the view derives and
  explains on the node itself: `failed` (wins over an unfinished row) and `blocked` (a run that ended
  over a row it never settled, with the reason). Clicking a node opens a three-part detail popover:
  the header, `Engine facts` (seq / label / phase / child session / outcome / duration, verbatim from
  the events) and `Stage report` (seven fields, each with its own source badge; `—` plus
  `Source: not reported` when nothing was recorded, and `Copy coordination block` disabled rather than
  claiming there is something to copy). `Open child session` really opens the child. At ≤480 px the
  detail becomes a bottom drawer with single-column fields; every ring and dot colour comes from a
  `var(--dsw-alias-…)` design token with the old hex as fallback, so dark mode follows the theme
  without a separate stylesheet.
  / 会话有三个 Tab：`对话 / 轨迹 / 进度`。进度 Tab 不默认选中，也不新增设置项、按钮或别处的注册。
  轨道只从插件已经记录的四个 `tool-workflow/*` 事件折叠：引擎没报的阶段保持 `pending` 并标注
  「事件里没有报告」，不借邻居状态；百分比是「已结算 / 已声明」，没有声明行时整段缺席，不做猜测。
  状态为 `pending`、`doing`、`done`、`cancelled`（引擎原话），另加两个由视图派生并在节点上说明理由的：
  `failed`（压过未完成行）与 `blocked`（运行结束却留下未结算行，并给出原因）。点节点开三段浮层：头部、
  `Engine facts`（seq / 标签 / 阶段 / 子会话 / 结果 / 时长，逐字取自事件）、`Stage report`（七个字段各带
  来源徽标；没有记录就是 `—` 加「事件里没有报告」，`Copy coordination block` 在无协调块时置灰，而不是
  谎报可复制）。`Open child session` 真的能打开子会话。≤480 px 详情变底部抽屉、字段单列；环与点的颜色
  全部来自 `var(--dsw-alias-…)` 设计 token（旧 hex 兜底），深色主题无需另写样式表即可跟随。

### Fixed / 修复

- **The plugin declares a real DSH version range, and declares it in one place
  / 插件声明真实的 DSH 版本区间，且只声明一处 (B01)** —
  `engines.dsh` is now `>=0.2.1-rc.2 <0.3.0` instead of the single fixed version `0.2.1-rc.2`, and the
  hand-written `dsh.compatibility` block (`dsh` / `profiles` / `dshReleases`) is gone: one source of
  truth for "which runtime can install this". Measured on the real runtime `0.2.2-rc.3` the check
  reports no unmet requirement, while a control range (`<0.2.0`) is still refused — so the check is
  not vacuous. The boundary is recorded honestly: DSH evaluates a range with `includePrerelease`, so
  `<0.3.0` also admits `0.3.0-rc.*`.
  / `engines.dsh` 由固定版本 `0.2.1-rc.2` 改为区间 `>=0.2.1-rc.2 <0.3.0`，并删除手写的
  `dsh.compatibility`（`dsh` / `profiles` / `dshReleases`）整块——「哪个运行时能装」只有一处真源。
  在真实运行时 `0.2.2-rc.3` 上判定为无未满足要求，而对照区间 `<0.2.0` 仍被拒绝，说明检查不是空转。
  边界如实记录：DSH 用 `includePrerelease` 判区间，故 `<0.3.0` 也会放行 `0.3.0-rc.*`。

- **The front desk stops misfiling the messages it reads / 前台不再误读它读到的消息 (B02, B09)** —
  two fixes in `src/triage.ts`: the signal scan is bounded (`TRIAGE_LIMITS.signalChars`), so a 32k
  paste no longer costs seconds inside one message's scan; and a three-part list written with 顿号 or
  full-width commas counts as three things instead of one, so it is no longer answered by a single
  quick worker. The front desk's own reply is also read as one answer rather than thrown away.
  / `src/triage.ts` 两处修复：信号扫描有界（`TRIAGE_LIMITS.signalChars`），32k 粘贴不再让单条消息的
  扫描按秒计；用顿号或全角逗号写的三件事算三件事，不再被压成单个 quick worker。前台自己的回复也按
  「一个答复」解析，不再被整段丢弃。

- **A message that answers the pending question and carries new work is one job, not two half-jobs
  / 「先回答、再派新活」是一条工作，不是两个半截 (B05)** —
  the worker receives the answered request and the new work in the same message, and the answer is
  described as what it is instead of being dressed up as the task objective.
  / 工人在同一条消息里拿到被回答的请求和新工作；答复按其本来面目描述，不再被包装成任务目标。

- **The gate keeps what it must remember, and names its own reason
  / 门禁记住该记的，理由出自它自己 (B04, B06, B08, B18)** —
  a second question no longer erases the still-unanswered first one (B04); the resumed request is cut
  to the objective budget instead of refusing the whole run (B08); when this plugin is itself the
  writer of a claimed batch (`relay` / `append`), the history read that follows leaves those ids out,
  so the message the user just typed is not replayed as context (B06); and the opt-in hybrid
  classifier's verdict carries its own sentence instead of borrowing the rules sentence (B18).
  / 第二个问题不再抹掉仍未作答的第一个（B04）；复述的请求裁剪到 objective 预算内，而不是拒绝整轮
  （B08）；当本插件自己就是被 claim 批次的写者（`relay` / `append`）时，随后的历史读排除这些 id，
  用户刚打的字不会被当上下文回放（B06）；可选的混合分类器给出的档位带它自己的理由句，不借用规则句
  （B18）。

- **`/grok` only says "on" about a toggle the session can show
  / `/grok` 只在会话真能出示记录时才说「已开启」 (B03)** —
  the command reads the record back after writing. A session that refuses the append, or accepts it
  without committing it, settles as an error that states the state the session really has
  (`the toggle is still off`), never the success wording; an agent without a session settles as an
  error too.
  / 命令写入后读回记录：会话拒绝写入、或接受了却没落地，都以失败结算并说出真实状态（「开关仍是关闭」），
  绝不使用成功文案；没有会话的 agent 同样按失败结算。

- **A failure reason that merely contains a ledger word is no longer deleted
  / 只是包含台账词的失败原因不再被删掉 (B10)** —
  the guard that keeps machine ledger labels out of the human block was a raw substring scan, so a real
  reason such as `task aborted before any attempt: [infrastructure/timeout] …` was dropped line by line
  and the reader saw a bare title with no reason at all. The guard is anchored / whole-word now, and the
  two fields carrying the run's own failure text (`incomplete[].reason`, `task.error`) are no longer
  scrubbed field-by-field. A line that really is a ledger label is still dropped.
  / 把人话块里台账标签挡掉的守卫原来是裸子串扫描，于是 `task aborted before any attempt:
  [infrastructure/timeout] …` 这种真实原因被逐行丢掉，读者只看到标题、没有原因。现在守卫改成锚定 /
  整词，且承载运行自身失败文本的两个字段（`incomplete[].reason`、`task.error`）不再逐字段清洗；
  真正是台账标签的行仍然被挡掉。

- **Concurrency and retries are back inside the documented envelope, and the per-task call backstop is
  the worst legal case / 并发与重试回到文档契约内，单任务调用上界取最坏合法值 (B07)** —
  hard caps `maxConcurrency` 1,000,000 → 6 and `maxRetries` 10 → 3, defaults 4 / 2 → 3 / 1, declared
  once as `DEFAULT_MAX_CONCURRENCY` / `DEFAULT_MAX_RETRIES`; the generated script's numbers stay in
  parity by test. `maxAttemptsPerTask` 1100 → 400, derived as `(50 + 50) × (3 + 1)` — the worker plus
  verifier chain ceilings at the retry cap — with the guard still `>`, so the worst legal combination
  loads and only "widened a limit and forgot this" trips it. A default run's checkpoint therefore no
  longer reports a contract violation; older files still load, because the read side stays lenient and
  reports an out-of-envelope row instead of migrating it.
  / 硬上限 `maxConcurrency` 1,000,000 → 6、`maxRetries` 10 → 3，默认 4 / 2 → 3 / 1，单一声明
  `DEFAULT_MAX_CONCURRENCY` / `DEFAULT_MAX_RETRIES`；生成脚本里的数字由测试保持同步。
  `maxAttemptsPerTask` 1100 → 400，取值 = `(50 + 50) × (3 + 1)`（worker 与 verifier 的链上限 × 重试
  上限），守卫仍是 `>`，所以最坏合法组合能通过，只有「放宽了某个上限却忘了这里」才会撞到。默认运行的
  checkpoint 因此不再记录越界；旧文件仍能读——读侧保持宽松，只报告越界而不迁移。

- **The checkpoint records the run's real identity, and stops visibly instead of silently
  / 检查点记录运行的真实身份，停止时可见而不是静默 (B12–B15)** —
  the durable task identity comes from the engine's `meta.name` (redacted and bounded) and
  `stages` / `agents` are always present instead of `undefined` (B12); staleness is judged on its own
  1 s–24 h range rather than the write interval, and a stamp in the future is "possibly live", never
  stale (B13); at most one write per run file is in flight, and two ids that sanitize to the same name
  stay separate (B14); an absent `limits` block is recorded as the contract defaults, and the loop that
  gives up says so exactly once, visibly (B15).
  / 持久任务身份取自引擎 `meta.name`（脱敏且有界），`stages` / `agents` 恒存在而非 `undefined`
  （B12）；陈旧判定用自有 1 s–24 h 区间而不是写间隔，未来时间戳算「可能仍活」、绝不算陈旧（B13）；
  同一 run 文件同时只有一个写在飞，两个清洗后同名的 id 仍分开（B14）；缺省 `limits` 按契约默认值
  记录，放弃写入时只说一次且可见（B15）。

- **The browser bundle stops leaking key ids and stops overflowing narrow windows
  / 浏览器端不再泄露 key、不再在窄窗溢出** —
  status dots come from the design tokens (`var(--dsw-alias-…)`, old hex as fallback) so they follow
  the theme; a translation the framework cannot resolve never renders the key id (this bundle's own
  table answers first, then `—`); an engine status the panel does not word renders `状态未知` /
  `Unknown` and still counts in its phase summary; the settings page keeps `loading`, `error` (the
  reason, plus one retry) and `unavailable` (a good answer that does not serve this namespace) apart
  instead of showing "读取中…" forever after a failed read, and advertises the Host's real ranges
  (`maxConcurrency` 1–6, `maxRetries` 0–3, defaults 3 and 1); a field row collapses to one column at
  ≤560 px so the card no longer overflows; and a task row stops printing the engine's own child label
  (`` `${name} child ${callId}` ``) — it shows neutral `Subagent` / `子代理` plus the call state, and
  shows any other label exactly as recorded without guessing a role.
  / 状态点改用设计 token（`var(--dsw-alias-…)`，旧 hex 兜底），跟随主题；框架解析不出的翻译不再把 key
  显示出来（先查本包自己的词表，再退到 `—`）；面板不认识的引擎状态显示「状态未知」并仍计入阶段汇总；
  设置页把「加载中 / 失败（带原因 + 一次重试）/ 不可用（答复正常但不含本命名空间）」三态分开，
  读取失败不再永远显示「读取中…」，且只提供 Host 真实接受的范围（`maxConcurrency` 1–6、
  `maxRetries` 0–3，默认 3 / 1）；字段行在 ≤560 px 收成单列，卡片不再横向溢出；任务行不再直接印
  引擎自己的子标签（`` `${name} child ${callId}` ``），改用中性的「子代理 / Subagent」加调用状态，
  其它标签按记录原样显示、不猜角色。

- **Docs match the code again / 文档与代码重新对齐** —
  `README` / `README.zh-CN` describe the front desk (the tier on the answer's first line) and the
  opt-in per-session toggle instead of "every message runs the full workflow", and the DSH badge reads
  `0.2.x`; `docs/ARCHITECTURE.md` states the real envelope (default 3 / max 6, default 1 / max 3) and
  explains why the checkpoint read side stays lenient; `docs/LOCAL-TESTING.md` corrects the defaults
  (`maxTasks` 12, `timeoutMs` 3600000); `docs/task-progress-panel.md` gains the client-surface
  hardening section and the rule about engine child labels.
  / `README` / `README.zh-CN` 改讲前台（档位写在回答首行）与按会话开启的开关，不再说「每条消息都走
  全流程」，DSH 徽章改为 `0.2.x`；`docs/ARCHITECTURE.md` 写清真实包络（默认 3 / 上限 6、默认 1 /
  上限 3）并解释 checkpoint 读侧为何保持宽松；`docs/LOCAL-TESTING.md` 修正默认值（`maxTasks` 12、
  `timeoutMs` 3600000）；`docs/task-progress-panel.md` 增加客户端加固一节与「不印引擎子标签」的规则。

## [0.8.0] - 2026-11-13

### Added / 新增

- **The human conclusion now has its own delivery layer — the reader contract is unchanged
  / 人话结论有了独立的交付层 —— 读者契约不变** —
  new `src/delivery/` (`humanConclusion` + `machineLedger` + `deliverReport`) composes the
  relay-ready text for every `RunOutcome` in `src/run.ts`: the human block first, the machine
  ledger only when the live `showDiagnostics` switch asks for it (default off). `report.ts`
  stays the canonical machine renderer for the tool surface; the delivery layer is the relay
  handoff for `runWorkflow` exits (validated report, kept cancellation, deadline, engine error).
  It never dresses a failure as success, never drops `uncertainties`, and never lets an internal
  id reach a human. The user-visible contract is unchanged: the same head, the same ledger
  rules, the same switches — only the composer moved, so no path can deliver a bare machine
  report again.
  / 新增 `src/delivery/`（`humanConclusion` ＋ `machineLedger` ＋ `deliverReport`），为 `src/run.ts`
  的每个 `RunOutcome` 拼出可直接转发的文本：人话块在前，机器台账只在 `showDiagnostics` 打开时才跟
  在后面（默认关）。`report.ts` 仍是工具面的机器渲染器；交付层是 `runWorkflow` 各退出的转发装配
  （核验报告、保留的取消、超时、引擎错误）。它永不把失败打扮成成功、永不丢 `uncertainties`、永不
  让内部 id 进人话。读者契约不变：同样的头、同样的台账规则、同样的开关——只是装配点收拢了，所以
  任何路径都不再能交出裸机器报告。

- **Each run now writes one bounded, checksummed checkpoint file — what you see does not change
  / 每轮运行写一份有界、带校验的检查点文件 —— 你看到的内容不变** —
  new `src/checkpoint/` (versioned schema + atomic writer + engine wiring) and `src/resume/`
  (validator + restore policy) record how a workflow run can be captured and later re-driven.
  The installed plugin changes in no user-visible way: no report line, no setting, no button. What a run gains is a JSON
  file — `checkpoint-<runId>.json` under `$DSH_HOME` or `GROK_WORKFLOW_CHECKPOINT_DIR` plus
  `checkpoints/grok-workflow`, else `~/.dsh/checkpoints/grok-workflow` — rewritten every 30 s
  (bounded to 1 s–300 s, timer `unref()`ed so it never keeps the process alive), plus a terminal
  one at the end and a `cancelled` one when the plugin unloads mid-run. Recording can never break
  the run it records: a failed write is a warning and a counter, and after 3 consecutive failures
  that run stops being retried.
  A checkpoint is one JSON file per run. The writer writes a hidden `*.tmp` in the target
  directory, fsyncs it, then renames it into place (atomic on POSIX and Windows), and removes
  the temporary file on any failure — a reader never sees a half-written checkpoint and a
  failed write leaves the previous one intact. The file carries a sha-256 over its canonical
  payload (sorted keys, no `undefined` fields), and `readCheckpoint` refuses a file whose
  bytes no longer match. Hard bounds: 1 MiB per file (the writer refuses before touching the
  disk, the reader `stat`s before parsing), 128 plan/task rows, 512 agent rows, 16 stages,
  1,024 evidence rows, a 4,000-character objective, 600-character titles and acceptance
  criteria, 1,000-character errors and claims, 400-character locators, and a
  12,000-character min-context digest. Oversized free text is truncated with an explicit
  ellipsis; a count above its ceiling and a file above 1 MiB are refused. Every free-text
  field is redacted at build time, so a checkpoint carries no secrets and is safe to attach
  to an Issue.
  Refusals are a closed vocabulary. Writing or reading a run document fails as exactly
  `invalid`, `too-large`, `integrity` or `io`; restoring fails as exactly
  `version-mismatch`, `corruption` or `conflict` — the restore format is version 1 with
  envelope `grok-workflow.resume-checkpoint`, and any other version is refused rather than
  migrated. Restore fails closed: `evaluateResumeCheckpoint` returns a refusal instead of a
  plan whenever validation refuses, so a corrupt, foreign-version or wrong-run checkpoint can
  never trigger an automatic restart. `resume` here never means engine-level resume (the shipped engine journals nothing, stated as a limitation): it means starting a new run that re-drives the unfinished tasks from the recorded context, because the verified rows say which work is already done. Retention keeps exactly five journaled states
  (completed, interrupted, failed, gated, evidence-incomplete) together with their outputs,
  files and evidence, and never retains a bare `success` mark — a self-report is not
  verification, so that task goes back to the planner instead.
  / 新增 `src/checkpoint/`（版本化 schema ＋ 原子写入器 ＋ 引擎接线）与 `src/resume/`（校验器 ＋
  恢复策略），把「一轮工作流怎么记录、怎么重跑未完成部分」落成有界文档。本版装好后没有任何用户可见
  变化：不增加报告行、不增加设置项、不增加按钮。一轮运行
  多的只是一个 JSON 文件——`$DSH_HOME` 或 `GROK_WORKFLOW_CHECKPOINT_DIR` 下的
  `checkpoints/grok-workflow`（否则 `~/.dsh/checkpoints/grok-workflow`）里的
  `checkpoint-<runId>.json`，每 30 秒重写一次（限制在 1 秒–300 秒，定时器 `unref()`，不会吊住
  进程），结束时写一份终态，插件中途卸载则写一份 `cancelled`。记录永远不会破坏被记录的工作：
  写失败只产生一条警告和一个计数器，连续失败 3 次后该轮停止重试。
  一个运行 = 一个 JSON 文件。写入器先在同目录写隐藏 `*.tmp`、fsync，再 rename 到位（POSIX 与
  Windows 都原子），任何失败都会删掉临时文件——读者永远不会看到写了一半的检查点，写失败也不会
  毁掉上一份。文件带 sha-256（覆盖规范化 JSON：键排序、无 `undefined` 字段），`readCheckpoint`
  会让字节对不上的文件直接失败。硬上限：单文件 1 MiB（写入前拒绝、读取先 stat 再解析）、
  128 条计划/任务行、512 条 agent 行、16 个阶段、1,024 条证据、目标 4,000 字符、标题与验收条款
  600 字符、错误与结论 1,000 字符、定位符 400 字符、最小上下文摘要 12,000 字符。自由文本超长按
  显式省略号截断；计数越界与文件超 1 MiB 直接拒绝。所有自由文本在构建期过脱敏，因此检查点不含密钥，
  可以直接贴进 Issue。
  拒绝原因是一套封闭词表：读写运行文档只可能是 `invalid` / `too-large` / `integrity` / `io`；
  恢复只可能是 `version-mismatch` / `corruption` / `conflict`——恢复文档格式版本固定为 1、信封
  `grok-workflow.resume-checkpoint`，其他版本一律拒绝、不做迁移。恢复是失败关闭的：只要校验拒绝，
  `evaluateResumeCheckpoint` 就返回拒绝而不产出计划，所以损坏、版本不符或不属于本轮的检查点永远
  无法触发自动重跑。这里的 `resume` 从不是引擎级恢复（随附引擎无日志、无恢复，已声明为限制）：
  它指带着已记录上下文起一个新轮次，把未完成任务重跑一遍，因为已核验行说明了哪些活已经干完。
  保留策略只保留五种已记账状态（completed / interrupted / failed / gated /
  evidence-incomplete）及其产出、文件、证据，裸 `success` **永不**保留——自我声明不是验证，
  这类任务回到规划器重排。

- **A third value for `synthesis`: `layered` — the answer is in plain language even when no model
  answers / `synthesis` 多了第三个取值 `layered`——模型答不出来，结论照样是人话** —
  `deterministic` (the default, behaviour unchanged) aggregates by rule and ships the report;
  `model` spends one synthesizer call on the narrative. `layered` keeps the verified report as the
  only source of fact and adds a natural-language summary built in the script itself, which *is*
  the answer whenever the model path is unavailable — no synthesizer chain configured, every route
  dead, an empty or invalid summary, or a text the guardrail refuses. One constrained polish call
  is made only when `roles.synthesizer` is non-empty, and it may rewrite nothing but
  `synthesis.summary`. Its text is checked deterministically before use: it cannot claim full
  success while the run is not `completed`, cannot claim passing tests when no checker verified a
  pass, cannot deny the incomplete items or open questions the report lists, and cannot cite a
  backticked path or command the report does not contain. A polished answer also gets the report's
  own notes appended (unfinished items, open questions, and test counts split into
  checker-verified vs executor-reported), so a fluent summary cannot quietly drop them. With
  `humanSummary: false` a `layered` run composes no narrative at all and spends no synthesizer
  call — the machine report is the whole answer, exactly as `deterministic` behaves. With
  `showDiagnostics` on, the narrative carries one provenance line saying whether it is the
  polished text, the model narrative, or the deterministic fallback and why, paid out of the same
  character budget below. Bounds:
  2,000 characters for the summary and 6,000 for the digest the polish may read, mirrored as
  `HARD_LIMITS.synthesisSummaryChars` / `HARD_LIMITS.synthesisDigestChars` and pinned equal on both
  sides of the script boundary by `test/synthesis-guardrails.spec.ts`. The report's
  `synthesis.mode` still carries only `deterministic`/`model` — it says whether a polish call was
  in play, never the policy. A value outside the three is refused at load with a named error
  instead of falling through silently. The `README.md` value table now lists all three values.
  / `deterministic`（默认，行为不变）按规则聚合并给出报告；`model` 花一次合成调用写叙述；
  `layered` 以核验过的报告为唯一事实来源，另在脚本内建一段自然语言结论——只要模型这条路不可用
  （没配 synthesizer 链、所有路由都挂、摘要为空或非法、被事实护栏拒），这段就是最终结论。只有
  `roles.synthesizer` 非空时才额外做一次受约束的润色调用，且只允许改写 `synthesis.summary`。
  润色文本在使用前过一道确定性护栏：运行状态不是 `completed` 时不得声称全部通过；没有检查者核验过的
  通过时不得声称测试通过；不得否认报告里列出的未完成项与待确认项；反引号里引用的路径或命令必须在报告
  里真实存在。润色稿还会附上报告自己的附注（未完成项、待确认项，以及把「检查者核验」与「执行者自报」
  分开统计的测试计数），流利的总结没法把它们悄悄省掉。`humanSummary: false` 时 `layered` 一轮完全
  不写叙述、也不花合成调用——机器报告就是全部答复，与 `deterministic` 完全一致。打开
  `showDiagnostics` 时，叙述尾部会多一行来源说明（润色稿 / 模型直写 / 确定性回退及原因），并从下面
  同一个字符预算里支出。上限：结论 2,000 字符、润色可读的摘要
  6,000 字符，两侧常量分别落在 `HARD_LIMITS.synthesisSummaryChars` /
  `HARD_LIMITS.synthesisDigestChars`，由 `test/synthesis-guardrails.spec.ts` 钉住。报告的
  `synthesis.mode` 仍只有 `deterministic`/`model`——它说明这一轮有没有发生润色调用，不表示策略。
  三个取值之外的值在载入时直接报出具体错误，不会静默落空。这些是**未提交、不在已安装插件里**的工作树
  代码；`README.md` 的设置取值表当时仍写两值。

### Changed / 变更

- **Every final answer now opens in plain language — including the ones that failed — while the
  machine ledger stays hidden until you ask for it / 每种最终结果现在都用一句人话开场，失败的也一样
  ——机器台账仍默认隐藏** —
  the plain-language head used to be composed in two places (the front desk's team branch and
  `/grok on`), so any other path could hand back the raw ledger: a PARTIAL that arrived through the
  front desk opened at `Grok workflow: PARTIAL`, and a failed run got no head at all. One composer,
  `humanHead()`, now serves every path that can deliver a report — the front-desk answer, `/grok on`,
  and the report kept from a cancelled run — and every status. `completed` keeps the `0.7.0` wording
  unchanged. `partial` keeps the same marker, names up to three unfinished items and says what to do
  next. `failed` gets its own marker (`【人话结论·未完成】` / `【Plain summary · not completed】`) that
  never reuses the success sentence, one bounded reason line, and advice matched to the measured
  failure category (infrastructure, configuration, quality, cancelled, unknown). It is deterministic
  on purpose: no model call, so engine call counts and the one-shot budget are untouched. It is
  bounded: two summary lines (400 characters), three named unfinished items, a 200-character reason.
  `humanSummary: false` still means no head at all. Diagnostics stay opt-in: `showDiagnostics` is
  still default **off**, and the switch now actually reaches two paths that used to ignore it — the
  report text delivered to the reader (it had only been wired into the PTC `render` tool, so turning
  it on in the settings changed nothing about the answer received) and the report kept in a
  cancelled answer. `Uncertainties` stay visible with the switch off, in all of these paths.
  / 人话结论以前只在两处拼（前台团队分支与 `/grok on`），其它路径就只能把机器台账原样交出去：经前台
  到达的 PARTIAL 会以 `Grok workflow: PARTIAL` 开头，失败的运行连一句开场都没有。现在由同一个
  `humanHead()` 服务所有可能交付报告的路径——前台答复、`/grok on`、以及被取消时保留的报告——并且覆盖
  每一种状态。`completed` 与 `0.7.0` 的措辞完全一致。`partial` 保留同一标记，点名最多三项没做成的
  事，并给出下一步。`failed` 用自己独占的标记（`【人话结论·未完成】` / `【Plain summary · not
  completed】`），永不复用成功句式，附一行有界的失败原因，并按实测的失败类别
  （infrastructure / configuration / quality / cancelled / unknown）给出可执行的下一步。它刻意是
  确定性的：不调模型，所以引擎调用数与前台上限一分不动。它是有界的：摘要两行（400 字符）、最多点名
  三项未完成、原因 200 字符。`humanSummary: false` 仍然表示完全不加这段。诊断仍是按需：
  `showDiagnostics` 仍默认**关**，而这个开关现在真正到达了两处本来无视它的路径——交付给读者的报告正文
  （过去只接进了 PTC 的 `render` 工具，在设置里打开对实际收到的答复毫无影响），以及被取消答复里保留的
  那份报告。开关关着的时候，`不确定项` 在这些路径上照旧可见。

### Known limitations / 已知限制

- **Checkpoints accumulate and resume means re-driving, not continuing / 检查点会持续累积；恢复指重跑未完成部分，不是继续原轮** —
  this round ships recording plus the re-drive policy. One file per run id is rewritten in place
  while the run lives, a terminal copy is left behind, and **nothing prunes the directory**, so the
  files are the price of retention in disk space. `src/resume/` (validator + retention policy) is
  imported only by tests, and `resumeDecision` — the host-side "should a new run re-drive from
  this file?" helper — has no production caller. `resume` never claims engine-level resume (the
  shipped engine journals nothing, stated as a limitation) and the release never terminates a run:
  recording is best-effort and unload-bounded, and a refused disk costs a warning line, never the
  report. Both halves are deliberate, not bugs.
  / 本轮交付记录＋重跑策略：每个 run id 一个文件，运行期间原地重写，结束留一份终态，**没有任何
  清理逻辑**，所以累积的磁盘占用就是保留期的代价。`src/resume/`（校验器 ＋ 保留策略）只被测试引用，
  `resumeDecision`（host 侧「要不要从这个文件起新的一轮重跑未完成任务」）没有生产调用方。这里的
  `resume` 从不是引擎级恢复（随附引擎无日志、无恢复，已声明为限制），本版也不终止任何运行：记录是
  尽力而为、卸载有界，磁盘写失败只记一条警告，永不吞掉报告。这两点都是有意为之，不是缺陷。

## [0.7.0] - 2026-11-08

### Added / 新增

- **`/grok on` speaks plainly, and the ledger is opt-in / `/grok on` 也说人话，机器台账改为按需显示** —
  `full` mode bypassed the front desk, so a team run answered with the machine ledger only
  (`Grok workflow: … / Model routes: … / Deadline: … / Route switches: …`) and nothing a reader
  could act on. A full-mode run now opens with the same deterministic 【人话结论】 header the triage
  path already wrote (`任务 N/M 项已核验通过` + the first lines of the synthesis), and a failed run
  still opens as a failure — the header is only composed for `completed`/`partial`. New
  `showDiagnostics` setting (default **off**): the ledger lines (`Model routes`, `Deadline`,
  `Route switches`, route overflows, `Errors`) now render only when it is on. `Uncertainties` stay
  visible in both cases: they are truthful caveats, and carry-over parses them back out of an
  earlier round, so hiding them would silently drop follow-up context. The success preamble also
  stopped forbidding all commentary: up to three plain sentences may precede the verbatim report.
  / `full` 模式绕开了前台，团队档只回一串机器台账（`Grok workflow: … / Model routes: … /
  Deadline: … / Route switches: …`），没有一句能直接用的结论。现在 `full` 也会在报告前加同样的
  【人话结论】（`任务 N/M 项已核验通过` ＋ 汇总首句），失败仍是失败样式——只有 `completed`/`partial`
  才拼这段。新增 `showDiagnostics` 开关（默认**关**）：`模型路由`/`时限`/`路由切换`/`溢出`/`错误`
  这些台账行只在打开时输出；`不确定项` 两种情况下都保留——它是诚实的限定语，且跨轮承接要靠它从
  上一轮报告里解析回来，藏掉会静默丢失追问上下文。成功报告的说明文字也不再一律禁止评论：
  允许先给三句以内人话，再原样贴原文。

### Fixed / 修复

- **Saved role/model settings now actually reach the run / 保存的模型设置现在真正生效** —
  a settings save wrote the profile patch, bumped the revision and reported no error, yet every
  child of the next workflow still used the previous chain (`roles.worker` first entry ignored;
  the models observed were the ones from the process's start-up snapshot). Cause: the gate read
  `safe()` (the live holders) for classification, history bounds and queue limits, then handed the
  closure's **load-time** `ResolvedConfig` to `runWorkflow` and to both `runSingleCall` sites
  (triage classifier, quick worker) — so an edit reached admission and never reached a child. The
  three call sites now receive the live snapshot, which is what "an edit applies to the next
  message" was always documented to mean. Regression:
  `test/reliability.spec.ts` → "uses the live roles chain for a gated run, not the load-time
  snapshot" (negative control without the fix fails with
  `expected 'old-model' to be 'wb/cn:deepseek-v4.1-flash'`).
  / 设置页保存后，补丁文件、revision 都对、也没有报错，但下一轮工作流的每个子代理仍在用旧链路
  （`roles.worker` 第一名被忽略，实际用的是进程启动那一刻的快照）。原因：网关用 `safe()`（实时持有值）
  做分类、历史与排队上限，却把闭包里的**开机快照** `ResolvedConfig` 传给了 `runWorkflow` 和两处
  `runSingleCall`（前台分类、快速应答）——于是编辑只作用于准入，永远到不了子代理。三处改为传实时快照，
  这才是"编辑对下一条消息生效"本来的含义。回归测试见上，去掉修复即失败，正是用户看到的现象。

- **Finished subtasks in the chat task list stay clickable / 聊天任务列表中已完成子任务保持可点击** —
  in the chat sidebar task list a *running* subtask row (for example `任务 1 · …`) was a link, but
  every finished row rendered as inert text: the planner row `规划助手已完成`, a task's `执行` /
  `检查` rows — none of them could be opened, so the output of a completed subtask was unreachable.
  The stock task-list renderer gates the row link on the member still running
  (`navigableMembers()` in `@deepseek-ai/dsh-client-ui-workflow-run` requires
  `member.status === 'running'`), which is exactly backwards for a reader who wants to inspect
  what a finished subtask did. This plugin now re-registers the keyed `workflow-run` chat node
  (`conversation.chat.node`, the slot contract's own "reusing a key replaces that node renderer"
  extension point) with the same projection and wording and one deliberate difference: a member
  row is a link whenever its child session can be opened — running, completed, failed, cancelled
  or interrupted — and clicking it opens the child session exactly like a running row does. A row
  whose child session cannot be resolved stays inert text rather than opening the wrong session.
  The registration sits at `priority: -1`, below the stock renderer's default, because the runtime
  shadows a keyed entry by priority and the same key at the same priority fails the *other*
  registrant's whole boot fiber (measured: without the priority the stock
  `dsh-client-ui-workflow-run` client failed web boot with "1 entry did not activate"). The stock
  renderer stays live-but-shadowed and resumes when the plugin unloads.
  在聊天侧栏任务列表里，运行中的子任务行（例如 `任务 1 · …`）是链接，但所有已结束的行都渲染成
  不可点的文字：规划助手行「规划助手已完成」、各任务的「执行」「检查」行都打不开，已完成子任务
  的输出根本看不到。库存任务列表渲染器把行链接限制在"成员仍在运行"（`navigableMembers()` 要求
  `member.status === 'running'`），这对想查看已完成子任务做了什么的读者恰恰相反。本插件现在重新
  注册键控 `workflow-run` 聊天节点（`conversation.chat.node`，槽位契约自带的"复用同键即替换该节点
  渲染器"扩展点），投影与文案保持一致，只有一处刻意差异：只要成员的子会话能打开——运行中、已完成、
  失败、已取消或已中断——该行就是链接，点击后与运行中的行一样打开子会话；子会话无法解析的行仍保持
  不可点文字，而不是打开错误的会话。注册带 `priority: -1`（低于库存渲染器的默认值）：运行时按键控
  优先级做遮蔽，同键同优先级会让**另一个**注册者的整条启动 fiber 失败（实测：不加优先级时库存
  `dsh-client-ui-workflow-run` 客户端报 "1 entry did not activate" 启动失败）。库存渲染器保留为
  被遮蔽的活条目，插件卸载时自动恢复。

- **Task-team children are named after their work / 任务团队子代理按其工作命名** —
  in the Web GUI's subagent panel every workflow child showed up as `任务团队 child N`
  (front-desk calls: `Front desk child 1`) with the child's prompt opener (`You are the
  planning agent`) as the session title. The workflow guest computes the script's label
  but drops it before the host starts the child, and the PTC host hardcodes
  `<run name> child N` as the child's durable descriptor label — exactly the field the
  panel renders (`dsh-client-ui-subagent` shows `entry.label ?? entry.id`). This plugin
  now runs its workflows on a twin of the runtime's own PTC engine whose `subagents`
  view derives each child's durable label from the prompt's first line, and every prompt
  builder opens with that title: the planner is `规划助手`, a worker its task title, the
  verifier `检查 · <task title>`, the synthesizer `汇总助手`, and the front-desk calls
  their tier names (`快速应答` / `前台直答` / `快速执行` / `任务分类`). DSH core is not
  modified: the twin is built from the injected engine's own constructor, `subagents` is
  the only decorated service, and any non-PTC engine is used unchanged.
  在 Web GUI 的子代理面板里，任务团队的每个子代理都显示为 `任务团队 child N`（前台单调用为
  `Front desk child 1`），副标题是子代理提示词的开头（`You are the planning agent`）：
  workflow guest 算出了脚本给的 label，却在宿主启动子代理前把它丢掉，PTC 宿主写死了
  `<run 名> child N` 作为子代理的持久 descriptor 标签——这正是面板渲染的字段
  （`dsh-client-ui-subagent` 显示 `entry.label ?? entry.id`）。本插件现在把工作流跑在
  运行时自己的 PTC 引擎的一个孪生实例上，其 `subagents` 视图从提示词首行推导每个子代理的
  持久标签，且所有提示词构造器都以该标题开头：规划者为 `规划助手`，工人为任务标题，
  检查者为 `检查 · <任务标题>`，汇总者为 `汇总助手`，前台各调用为其档位名
  （`快速应答` / `前台直答` / `快速执行` / `任务分类`）。不修改 DSH core：孪生实例用注入
  引擎自己的构造器构建，`subagents` 是唯一被装饰的服务，非 PTC 引擎原样使用。

## [0.6.0] - 2026-11-07

### Added / 新增

- **Empty-cap heads-up and single-run scope docs for route caps / 空 Cap 提醒与单 run 作用域说明** —
  a role chain with 2+ routes but every `maxInFlight` blank now shows a yellow heads-up on the
  settings page (`warn.emptyCap`, both languages) instead of silently never overflowing: blank =
  unlimited = never yields, and only a capped route yields when full. The cap hint/placeholder
  copy and the load-time `validateRoutes` notes say the same rule in both languages. `docs/ARCHITECTURE.md`
  now states the scope explicitly: the per-route in-flight counters live inside one workflow run
  and `Route overflows …` can only ever describe yielding inside the run that produced it. No routing
  behavior changed; the warning never blocks Save and the notes never fail the load.
  当一条角色链有 2 条以上路由、但 `maxInFlight` 全空时，设置页会显示黄色提醒（`warn.emptyCap`，
  中英双语），不再静默地"永远不溢出"：留空=不限=不让路，只有填了上限的路由才会在打满时让路。
  上限的 hint/placeholder 文案与加载时 `validateRoutes` 的 notes 用中英双语写明同一规则；
  `docs/ARCHITECTURE.md` 明确作用域：每条路由的在飞计数只活在单次 workflow run 内，
  `Route overflows …` 只可能描述产生它的那一次 run 内部的让路。不改任何选路行为；提醒不拦保存，
  notes 不会导致加载失败。

- **Cross-run route hint with local-vs-hint overflow rendering / 跨 run 路由 hint 与本地/跨 run 让路分开渲染** —
  at admission the plugin snapshots an approximate global busy hint (route labels other live
  runs configured, run-level only, never exact sub-call counts) and passes it as `args.busyRoutes`;
  the script only reorders untried routes (busy lanes yield to non-busy ones, never removed) and
  records a deprioritized lane as `<label> (cross-run hint)` in the existing `skippedBusy` evidence,
  reusing the overflow fields. No failure semantics change: `switchOn`/retries/counts are untouched,
  the child-agent budget ignores the hint, and a solitary run omits the key so its report is
  byte-identical to before. `Route overflows (cross-run hint):` renders separately from the local
  `Route overflows (full lane yielded, not failures):` line, and the routing ledger carries the same
  evidence through `recordRouting`.
  准入时插件对近似全局忙闲做一次快照（其它 live run 配置过的路由标签，仅 run 级估计，不含精确子调用
  计数），经 `args.busyRoutes` 下发；脚本只重排未试路由顺序（忙 lane 给非忙让路，不删除），被 hint
  挤到后面的记为 `<label> (cross-run hint)`，复用现有 `skippedBusy` 证据字段。不改失败语义：
  `switchOn`/重试/计数不动，子代理预算忽略 hint；孤立 run 不带该键，报告与之前逐字节一致。
  `Route overflows (cross-run hint):` 与本地 `Route overflows (full lane yielded, not failures):`
  分开渲染，路由台账经 `recordRouting` 同步透传同一证据。

## [0.5.1] - 2026-11-07

### Fixed / 修复

- **The quick worker now gets the context it was already being classified against /
  快手档拿到它本来就在被据以分类的上文** —
  a follow-up such as "用人话告诉我刚才那份研究的结论" was correctly recognised as a follow-up
  from the conversation, but the single worker that answered it received **only the bare
  request**: it was triaged with the conversation in hand and then dispatched blind, so it
  replied "I am a single turn, I cannot see the research above" and asked the user to restate
  what the session already held. The quick-tier prompt now carries a bounded, redacted
  `Context (do not ask for what is already here):` block — the recalled material when the
  recall pass hit (excerpt plus the file/URL locators it came from), otherwise the bounded
  conversation turns plus the cross-round digest, capped at 4 000 characters — and is told not
  to claim it cannot see earlier turns and not to ask for anything already present. A first
  message carries no context at all, so its prompt stays byte-identical to `0.5.0`; nothing is
  invented, no extra model call is made, and no new configuration key is added (PR #41,
  commit `45d721a`).
  像"用人话告诉我刚才那份研究的结论"这样的追问，本来就已经被判定为"有上文的追问"，但真正作答的
  那个快手档工人只收到 **bare request**：分诊时手里有会话、派活时却把上文丢了，于是它回一句
  "我这轮是单次进来的，看不到上面的研究结果"，要求用户把会话里已有的内容再说一遍。快手档提示词
  现在会带上一个有界、脱敏的 `Context (do not ask for what is already here):` 块——回捞命中时是
  回捞到的材料（摘录 + 它的文件/URL 定位符），否则是有界的会话轮次加跨轮 digest，合计上限
  4000 字符——并明确要求"不得声称看不到前文、不得索要已经在这里的内容"。首条消息完全不带上下文，
  提示词与 `0.5.0` 逐字节一致；全程不编造、不增加模型调用、不新增配置键（PR #41，提交 `45d721a`）。

## [0.5.0] - 2026-11-06

### Added / 新增

- **Look it up before asking / 先回捞，后提问** —
  when the front desk was about to ask the user a clarification ("please restate it"), it asked
  without ever checking what the conversation already held: in
  `session-7e079b80-1a57-451b-aca4-795d24a14c4d` the research results were right there in the
  transcript and the follow-up was still met with a request to repeat them. The last step before a
  clarification question now is a **read**: the conversation so far, the validated reports this
  plugin already wrote for earlier rounds, and the memory markdown files already on disk
  (`<cwd>/docs/knowledge/*.md`, override with `GROK_WORKFLOW_KNOWLEDGE_DIRS`). A hit answers from
  that material — one worker, the material in the prompt, and an explicit instruction never to
  claim it cannot see earlier turns and never to ask for work that is already there — and the
  answer states where it came from. A miss in a session that has already said something asks exactly
  once and adds one line saying where it looked and which specific detail is missing, instead of
  asking for the whole task again. Nothing is ever invented, and a session that has not said
  anything yet produces exactly the same question as before, byte for byte — even when memory files
  exist on disk, because there is no earlier wording for the question to point at. This costs
  nothing when it is not needed: the read runs only on messages that would otherwise be a
  clarification question, is bounded (6 turns / 3 000 characters of conversation, 4 earlier rounds /
  4 000 characters of digest, 12 files / 2 400 characters each / 16 000 characters total), is
  redacted, and is read-only — it creates no archive and no new record type.
  前台原本在准备向用户提问（"请重新说明"）时，从不检查会话里已经有什么：在
  `session-7e079b80-1a57-451b-aca4-795d24a14c4d` 里研究结果就在会话中，追问却仍被要求重述。
  现在发出澄清问题之前的最后一步是**先读**：本会话上文、插件自己为前序轮次写入的已验证报告、
  以及磁盘上已有的记忆 markdown 文件（`<cwd>/docs/knowledge/*.md`，可用
  `GROK_WORKFLOW_KNOWLEDGE_DIRS` 更改）。命中即据材料作答——只派一个工人、材料进提示词，并明确
  要求"不得声称看不到前文、不得让用户重复已给出的内容"，回答里还会注明材料出处；未命中才提问**一次**，
  若这个会话里已经说过话，提问下方再补一行"查过哪里、还缺哪一个具体信息"。全程不编造：还没说过话的
  会话，得到的问题与改动前逐字节一致（即使磁盘上有记忆文件——此时没有可指认的上文，原来那句就是最
  诚实的形式）。不需要时不花任何代价：只在"本来要提问"的消息上才检索，
  且有界（会话 6 轮 / 3000 字符，前序 4 轮 / 4000 字符 digest，记忆文件 12 个 / 每个 2400 字符 /
  合计 16000 字符）、脱敏、只读——不新增归档、不新增记录类型。

- **Cross-round context carry-over / 跨轮上下文延续** —
  every round is a fresh set of child agents, and until now the second round of a long
  conversation started from zero: it could answer "I am a single turn, I cannot see the research
  above" and ask the user to repeat what they had already given. Each run now compiles the
  earlier rounds of the same session into one **bounded, structured digest** (round objective,
  verified criteria with their evidence, open questions, uncertainties, final-answer excerpt and
  the file/URL locators the evidence quoted) and injects it into the planner, worker, verifier
  and synthesizer prompts, with explicit instructions never to claim it cannot see earlier turns
  and never to ask for information that is already there. The digest is compiled from the
  validated reports this plugin itself wrote into the transcript (never a model paraphrase), is
  redacted, is capped by the existing `historyTurns` / `historyChars` budget and by a hard ceiling
  of 24 rounds / 12 000 characters, keeps the newest round and names how many it dropped, and
  renders nothing at all when the session has no earlier round — first-round prompts are
  byte-identical to before. A child that needs more detail is told to read the listed prior
  outputs instead of asking the user. No new configuration key, no new storage format, no extra
  model call.
  每一轮的子代理都是全新上下文：此前长会话的第 2 轮会从零开始，甚至自述"我这轮是单次进来的，
  看不到刚才上面的研究结果"，要求用户重述已给出的信息。现在每轮都会把同一会话内的前序轮次编译成
  **有界结构化 digest**（该轮目标、已核验判据及其证据、未决问题、不确定项、结论摘要、证据引用的
  文件/URL 定位符），注入规划、执行、校验、汇总四个角色的提示词，并明确要求"不得声称看不到前文、
  不得让用户重复已给出的信息"。digest 只从插件自己写入会话的已验证报告编译（不经模型转述）、经过
  脱敏，受既有 `historyTurns` / `historyChars` 预算与硬上限（24 轮 / 12000 字符）双重约束，超限时
  保留最新一轮并写明丢弃了多少轮；没有任何前序轮次时完全不渲染——首轮提示词与此前逐字节一致。
  需要更多细节的子代理被要求去读列出的先前产物，而不是回头问用户。不新增配置键、不新增存储格式、
  不增加任何模型调用。

- **Incremental memory archive / 随做随存的增量记忆归档** —
  a round's result now lands in a durable, greppable archive the moment the round settles,
  instead of waiting for someone to hand-edit `STATE.md` / `HANDOFF.md` at session exit. A new
  `src/memory/` module appends one JSON line per settled child agent and one per finished round
  to `$DSH_HOME/memory/grok-workflow/archive.jsonl` (override with `GROK_WORKFLOW_MEMORY_DIR`),
  carrying the objective, the status, the verified criteria with their evidence, the child's own
  declared result — bounded and redacted. The file is append-only (`O_APPEND`, one line per
  entry, existing bytes never rewritten), entry ids are deterministic (`run:<runId>`,
  `run:<runId>:agent:<seq>`), and a repeated write is a no-op, so replaying a round cannot
  duplicate history. Archiving is not a config switch and is not gated on the progress panel: a
  memory gap is not a presentation choice. The front desk archives too — a cheap-tier answer is a
  real round result — and a failed write only costs a warning line, never the run. Any later
  session reads it back without the plugin loaded: `node lib/memory/cli.js recent [--limit N]
  [--json] [--kinds round,agent] [--dir PATH]`.
  一轮的结果现在在**轮次结算时刻**就落进可检索的持久归档，不再等会话收尾时有人手工改
  `STATE.md` / `HANDOFF.md`。新增 `src/memory/`：每个结算的子代理、每个结束的轮次各向
  `$DSH_HOME/memory/grok-workflow/archive.jsonl` 追加一行 JSON（可用 `GROK_WORKFLOW_MEMORY_DIR`
  改位置），带目标、状态、已核验判据及其证据、子代理自己申报的结果，全部有界并脱敏。文件只追加
  （`O_APPEND`、一条一行、已有字节永不改写），条目 id 确定（`run:<runId>`、
  `run:<runId>:agent:<seq>`），重复写入是无操作，同一轮重放也不会重复历史。归档不是配置开关，
  也不受进度面板开关控制：记忆缺口不是展示偏好。前台档同样归档（快手档回答也是真实的轮次结果），
  写入失败只丢一行告警，绝不拖垮运行。任何后续会话无需加载插件即可读回：
  `node lib/memory/cli.js recent [--limit N] [--json] [--kinds round,agent] [--dir PATH]`。

## [0.4.0] - 2026-11-06

### Added / 新增

- **History-aware follow-up triage / 追问可接上文，不再掉进寒暄** —
  a follow-up fragment ("说人话", "继续", "详细点" …) with conversation history now routes
  `fast/followup` instead of the greeting template; without history it asks instead of
  answering from the template. Disable with `triageFollowupAsFast: false`.
  有上文时"说人话/继续/详细点"走快手档（`fast/followup`），不再回寒暄模板；首条无上文时改为追问确认。
  可用 `triageFollowupAsFast: false` 关闭。
- **Hybrid front-desk classifier (opt-in) / 混合分诊（可选）** —
  `triageClassifier: rules` (default) keeps pure string rules byte-for-byte; `hybrid` adds one
  model call only for unclear cases (`ask`/`ambiguous-escalate`, or `chat` with history),
  falling back to the rules verdict on any failure.
  默认 `rules` 纯规则零行为变化；`hybrid` 仅在拿不准时多花一次模型调用，失败回退规则结果。
- **Team-tier instant receipt + plain-language lead-in / 团队档即时回执与人话导读** —
  the team tier posts its tier line immediately (`instantReceipt`, default on) so a long run
  never looks blank, and prepends a deterministic `【人话结论】 verified/total` lead-in before
  the machine report (`humanSummary`, default on). Both are pure additions with zero extra
  model calls. 团队档先回档位行（`instantReceipt` 默认开），运行时不再白屏；报告前加确定性
  `【人话结论】` 导读（`humanSummary` 默认开）。两者零额外模型调用。

## [0.3.0] - 2026-11-03

### Fixed / 修复

- **Synthesis/synthesizer mismatch warns and repairs instead of deactivating / 合成配置不一致改为告警并修复，不再直接停用** —
  only two recoverable shapes are repaired at load: a non-empty `roles.synthesizer` chain with
  `synthesis: deterministic` now takes effect as `model`, and `synthesis: model` with an empty
  chain takes effect as `deterministic`. Each repair logs a warning naming the effective value
  （文案含"已按…生效，请在设置页确认"）, keeps the tool, gate and settings page fully active, and
  marks the one-line signature as `synthesis=<mode> (repaired)`. Unknown keys, unknown providers,
  undeclarated models, out-of-range numbers and malformed chains still fail hard (R-06 unchanged),
  and the settings page blocks Save on the same two mismatches with a red bilingual error.
  仅两种"可恢复不一致"做修复：总结链非空但汇总方式是 `deterministic` 时按 `model` 生效；
  汇总方式是 `model` 但总结链为空时按 `deterministic` 生效。修复会打 warn 日志（文案含"已按…生效，
  请在设置页确认"），工具/门禁/设置面照常启用，有效配置签名带 `synthesis=<mode> (repaired)` 自证标记。
  未知键、未知 provider、不在目录的模型、越界数字、畸形链一律仍抛错（R-06 不动）；设置页对同样两种
  不一致红字拦 Save（中英双语）。

## [0.2.7] - 2026-11-03

### Added / 新增

- **Per-route concurrency cap with overflow to the next route / 每条路由的并发上限，打满就溢出到下一条** —
  each route in a role's chain can carry an optional `maxInFlight` (1–64, blank = unlimited),
  set in the settings page's third box per row or in the profile patch. While a capped route is
  full, a new call overflows to the next route in chain order instead of queueing on the full one;
  only when every route is full does the call wait for a drain. A full lane is never a failure:
  it advances no fallback, costs no retry attempt, and is recorded separately (`skippedBusy` /
  `queuedMs`, rendered as `Route overflows …` rather than `Route switches:`), so "used route B
  because route A was full" never reads as "route A failed".
  角色链里每条路由可配可选的 `maxInFlight`（1–64，留空=不限），在设置页每行第三个框或 profile
  patch 里填写。某条路由打满时，新调用按链顺序溢出到下一条，而不是排队等它；只有所有路由都满
  才等待腾位。打满不是失败：不推进备用链、不消耗重试，在报告里单独呈现（`skippedBusy` /
  `queuedMs`，`Route overflows …` 而非 `Route switches:`），"因为 A 满了所以用了 B"
  永远不会被读成"A 失败了"。

### Fixed / 修复

- **The first message of a session no longer disappears while the team runs / 会话的第一条消息不再"消失"** —
  with the default `in-turn` strategy the gate waited for the whole workflow before handing the
  claimed message back to the loop, and the loop is the only writer of `user/message` events, so
  the transcript held no message at all for the entire run: the GUI showed an empty turn with just
  the running/planning status, and a page reload lost what the user had typed. The claimed message
  is now published to the transcript before the wait (same id, source and `rpcId`, exactly once),
  and the entered step carries only the report; thinking/planning stays a status indicator.
  默认 `in-turn` 策略下，网关要等整个工作流跑完才把已认领的消息交回循环，而循环是 `user/message`
  事件的唯一写入者 —— 于是整段运行期间会话里一条消息都没有：界面只剩「正在分析请求/规划中」状态，
  刷新页面后用户输入的内容彻底消失。现在网关在等待之前就把原消息写进会话（同 id、同 source、
  保留 `rpcId`，且只写一份），进入的步骤只携带报告；思考/规划只作为状态显示。

## [0.2.6] - 2026-11-02

### Changed / 变更

- **Settings page visual polish, three live-screenshot passes / 设置页三轮视觉打磨，均有真机截图** —
  info hierarchy and breathing (title ladder, hint styles, hairline row dividers, unified
  32px/8px controls, unit suffixes like ms/retries/turns, restyled status line, card-ified
  role chains with numbered badges, solid-blur sticky footer), alignment and rhythm
  (two-column baselines, semantic green ON switch, disclosure markers, right-aligned
  revision), and details (dashed empty state, tinted error box, hover/focus/disabled
  states, 340px internal chain scroll, bilingual EN/ZH overflow checks). No config keys,
  bounds, validation or wiring changed — styles, grouping order and copy only.
  信息层级与呼吸感（标题阶梯、hint 样式、行分隔线、统一 32px/8px 控件、ms/次/轮等单位后缀、
  状态行重塑、角色链卡片化+序号徽、实底毛玻璃吸底栏）、对齐与节奏（两列基线、语义绿 ON 开关、
  折叠箭头、修订号右对齐）、细节定稿（虚线空态、红底错误框、hover/focus/disabled 三态、
  链内 340px 滚动、中英双语溢出检查）。未动任何配置键、上限、校验与接线，只改样式、分组顺序与文案。

## [0.2.5] - 2026-11-01

The novice settings page: the Settings → Plugins → `Grok workflow` page now speaks one
language at a time — exactly the language DSH is set to — with plain words instead of
field keys and jargon. On top of that: history, concurrency, retry, task and timeout
bounds are relaxed for long jobs, and every role chain holds up to 50 backup routes.

新手设置页：设置 → 插件 → `Grok workflow` 页面一次只说一种语言——严格跟随 DSH 的语言设置，
用人话代替字段键与黑话。在此之外：历史、并发、重试、任务与超时上限为长任务放宽，每条角色链
最多可放 50 条备用路由。

### Added / 新增

- **Novice-oriented settings page, strictly single-locale / 新手向设置页，严格单语** —
  the page renders only the active system language (no raw field keys, no mixed bilingual
  lines), shows a live one-line status under the intro (`OFF — plain chat` / `ON — smart
  triage` / `ON — full team`, following the current draft and never saved), and groups the
  controls into Mode / Who does it / Limits / More (collapsed) / Advanced — leave alone /
  Status. Role names are plain words (Planner / Executor / Checker / Summarizer); every
  row explains what happens if you leave it alone.
  页面只渲染当前系统语言（不显示 raw 字段键，不中英混排），页头有一句跟随当前草稿的实时状态
  （关着 / 智能分诊 / 全员出动，只展示、不保存），控件按"模式 / 谁来干 / 上限 / 其他（默认折叠）/
  高级（别碰）/ 运行状态"分组。角色名是人话（规划 / 执行 / 检查 / 总结），每行都写了"不动会怎样"。
- **Provider → model dropdowns fed by the runtime / 通道→模型双下拉，目录来自运行时** —
  role chains and the triage model use provider→model dropdowns listing the models the
  runtime declares; when the runtime exposes no catalog both controls fall back to free
  text. Leaving a chain blank still means "use the model you are already talking to".
  角色链与分诊模型用"通道→模型"双下拉，选项是运行时已声明的模型；读不到目录就回退手写框。
  留空仍表示"用跟你对话的模型"。
- **switchOn as seven checkboxes, all checked by default / switchOn 改为七个勾选框，默认全勾** —
  one box per switchable failure class with plain names; all checked is the built-in
  behavior (switch only when the road is broken). Content failures never switch, they
  retry in place.
  每个可切换失败类别一个勾选框，名字是人话；全勾就是内置行为（路不通才换人）。内容没做好
  永远不换人，原地重试。
- **Long-chain + high-retry heads-up / 长链+高重试提醒** — a long backup chain combined
  with high retries shows a warning above the save button; it never blocks saving.
  备用链很长、重试又高时，保存按钮上方会有一句提醒；只提醒，不拦保存。

### Changed / 变更

- **Bounds relaxed for long jobs / 上限为长任务放宽** — `historyTurns` 0–1000000
  (default `12`), `historyChars` 0–1000000 (default `20000`), `maxConcurrency` 1–1000000
  (default `4`), `maxRetries` 0–10 (default `2`), `maxTasks` 1–100 (default `12`),
  `timeoutMs` up to 7 days (`604800000`, default still 60 minutes), each role chain up
  to `50` backup routes (was 3). The generated script's defensive clamps mirror the
  backend limits and a test pins them equal. The per-task call backstop is now an
  extreme 1100-call guard instead of a 6-call budget.
  `historyTurns` 0–1000000（默认 `12`）、`historyChars` 0–1000000（默认 `20000`）、
  `maxConcurrency` 1–1000000（默认 `4`）、`maxRetries` 0–10（默认 `2`）、`maxTasks` 1–100
  （默认 `12`）、`timeoutMs` 最长 7 天（`604800000`，默认仍 60 分钟）、每条角色链最多
  `50` 条备用路由（原来 3 条）。生成脚本里的兜底值与后端上限对齐，并有测试钉死两者一致。
  单任务调用预算从 6 次改为 1100 次的极端兜底。
- **Option and error copy in plain words / 选项与报错改成人话** — answer strategy,
  synthesis, gate scope and switch classes render localized display names (stored values
  stay English); validation errors keep their `{key, params}` data shape but read as
  plain sentences in both languages.
  回答策略、汇总方式、门禁范围、切换类别显示本地化名称（存值保持英文）；校验错误保持
  `{key, params}` 数据形态，但两边都是人话。

## [0.2.4] - 2026-11-01

The opt-in release: the workflow no longer hijacks every message — a session is plain chat until
you turn the workflow on with `/grok`. On top of that: the progress panel groups by task, the
workflow objective limit is 32,000 characters, the planner-failure fallback is sharded, and the
Issue #22 Phase 1 dialogue-reliability fixes (PR #23) ship in this version. Nothing here restates
a `0.2.3` change, and the `0.2.3` / `0.2.2` / `0.2.1` / `0.2.0` / `0.1.0` sections are untouched.

选择加入的版本：工作流不再拦截每条消息——会话默认是普通聊天，用 `/grok`
显式开启后才走工作流。在此之外：进度面板按任务分组、工作流目标上限提到 32,000
字符、规划失败回退改为分片、Issue #22 Phase 1 对话可靠性修复（PR #23）随本版发布。
不重复 `0.2.3` 已发布的内容；`0.2.3` / `0.2.2` / `0.2.1` / `0.2.0` /
`0.1.0` 章节保持不动。

### Added / 新增

- **`/grok` on/off workflow toggle / `/grok` 工作流开关** — the mandatory workflow is now a
  per-session switch you flip with a command instead of something that hijacks every message out of
  the box. `/grok` turns it ON (every user message runs the plan→execute→verify→report workflow);
  `/grok off` turns it OFF (normal chat — the workflow only runs if the model calls the
  `grok_workflow` tool). Default is **off** (`grokDefault: 'off'`): you opt in per session. The
  toggle is durable (survives restart / resume / fork) and lives in the session log, so it is never
  silently lost. `/grok` appears in interactive UIs (Web / CLI); headless and ACP surfaces have no
  command menu and follow `grokDefault`.
  把"每条消息强制走工作流"改成会话级、可用命令随时切的开关，不再一装上就每条都拦：`/grok` 开
  （每条用户消息都走 规划→执行→验证→汇报 的完整流程），`/grok off` 关（回普通聊天，只有模型主动
  调用 `grok_workflow` 工具才跑）。默认**关**（`grokDefault: 'off'`），按会话自行开启。开关状态
  挺过 重启 / 恢复 / 分身，存在会话日志里、不会被静默丢掉。`/grok` 在有命令面的界面（Web / CLI）
  可用；headless / ACP 无命令菜单，跟随 `grokDefault`。

### Changed / 变更

- **The progress panel groups by task, not by role / 进度面板改为按任务分组** — a run used to
  show two long role lists (`Execute`, `Verify`) with machine labels like
  `grok-worker-t1-a2`. It now shows one group per task, headed `任务 1 · <任务标题>` /
  `Task 1 · <task title>`, with rows `执行` / `执行（尝试 2）` / `检查` / `规划助手` /
  `汇总助手`. No `grok-` prefix, attempt marker, fallback marker, internal task id or child run id
  is shown any more; they all remain in the report. Two tasks with the same title never merge, a
  long title is shortened to 24 characters plus `…` in the header only (the report keeps it whole),
  and a retry is visible as “（尝试 2）” rather than as a second task.
  一次运行以前显示两条按角色分的长列表（执行、检查），行名是 `grok-worker-t1-a2` 这类机器名。
  现在每个任务一组，组头是 `任务 1 · <任务标题>`，行名是 `执行` / `执行（尝试 2）` / `检查` /
  `规划助手` / `汇总助手`；不再出现 `grok-` 前缀、尝试标记、回退标记、内部任务 ID 或子运行 ID
  （它们都还在报告里）。同名任务不会合并，过长的标题只在组头截断到 24 字加省略号（报告里保留全文），
  重试写作「尝试 2」而不是第二个任务。
- **Panel copy follows the language setting / 面板措辞跟随语言设置** — `zh` and `en` strings come
  from one table (`src/naming.ts`), selected by the DSH `locale` preference with `zh` as the
  default. No new configuration key: there is nothing to name by hand. A run already on screen keeps
  the words it was written with.
  中英文措辞来自同一张表（`src/naming.ts`），按 DSH 的 `locale` 偏好选择，默认中文；没有新增配置项，
  无需手工命名。已经显示出来的运行保持它写入时的措辞。

- **The workflow objective limit is 32,000 characters / 工作流目标上限为 32,000 字符** — the gate
  and the direct `grok_workflow` tool used to refuse any objective over 4,000 characters. The limit
  is now 32,000 characters (`TASK_LIMITS.objectiveChars`); per-task bounds are unchanged (task
  objective / expectedOutput / context ≤ 4,000 characters each). The 4,001–32,000 range used to be
  the exact window where the planner-failure fallback was re-rejected; it is now covered by the
  sharded fallback in Fixed. Tests: `test/objective-limit.spec.ts`.
  闸门与直接调用 `grok_workflow` 工具以前拒绝任何超过 4,000 字符的目标，现在上限为 32,000 字符
  （`TASK_LIMITS.objectiveChars`）；每任务边界不变（任务目标 / 预期输出 / 上下文各 ≤ 4,000
  字符）。4,001–32,000 正是以前规划失败回退会被二次拒绝的窗口，现在由 Fixed 里的分片回退覆盖。
  测试见 `test/objective-limit.spec.ts`。

### Fixed / 修复

- **A failed planner no longer drops a long objective / 规划失败不再丢掉长目标** — when planning
  failed, the fallback plan carried the whole objective in one task, which the 4,000-character
  per-task bound then rejected: a 4,001–32,000 character objective could pass the front desk and
  still fail with `workflow result fallback plan.tasks[0].objective is N characters, over the
  4000-character per-task limit`. The fallback now splits the objective into contiguous shards of
  at most `taskTextChars` characters; concatenating the shard objectives reproduces the original
  byte for byte, every shard carries the same `origin_goal_id`, and the run reports `partial` with
  `planning.source: "fallback"` instead of failing. The segment count follows the splitter rather
  than `maxTasks`, so the configured task cap cannot reject the fallback a second time. 规划失败时，
  回退计划以前把整个目标塞进一个任务，随后被每任务
  4,000 字符上限拒绝：4,001–32,000 字符的目标能过前置检查，却仍会以
  `workflow result fallback plan.tasks[0].objective is N characters, over the 4000-character
  per-task limit` 失败。现在回退计划把目标切成每片不超过 `taskTextChars` 的连续分片，分片目标顺序
  拼接后与原文逐字节一致，所有分片共享同一个 `origin_goal_id`，运行以 `partial` 收尾并保留
  `planning.source: "fallback"`，不再失败。分段数由切分器本身决定而不是 `maxTasks`，
  配置的任务上限不会二次拒绝回退计划。
- **The fallback now survives objectives that used to knock it out / 极端目标不再把回退计划打回** —
  three review findings on the segmented fallback, each reproduced by a test before it was fixed.
  (1) A boundary that backs off a surrogate pair adds a segment, so a 32,000-character objective can
  split into nine segments while the cap was derived from `ceil(chars / 4000)` = 8; with
  `maxTasks: 6` that fallback was rejected as over the task cap. The cap now comes from the splitter
  itself (`src/shards.ts`), which the generated script and host validation share. (2) An objective
  dense in JSON escapes — 32,000 quote characters — serialized to ~67,000 characters and tripped the
  48,000-character aggregate budget, which bounds task text a planner or caller *authored*; the
  fallback carries the caller's own characters, so the validator now checks the segments directly
  (they must be exactly what the splitter produces) instead of applying that budget. (3) Segments
  were max-sized slices, so a 4,001-character objective produced a 4,000-character task and a
  one-character one, every shard shared one generic criterion, and cuts could land mid-sentence.
  Segments are now balanced, aligned to a nearby paragraph/sentence/word break, and each segment's
  criterion names the segment it covers, so a verifier confirms the piece it was handed and no shard
  stands in for the whole objective. 针对分段回退的三条审查意见，每条都先由测试复现再修：
  ① 分片边界若切开代理对会后退一位，32,000 字符的目标可能切成 9 段，而上限仍按
  `ceil(chars / 4000)` = 8 计算，`maxTasks: 6` 时该回退计划会被判为超出任务上限；现在上限直接取自
  切分器（`src/shards.ts`），脚本与宿主校验共用同一份实现。② 充满 JSON 转义的目标（32,000 个引号）
  序列化后约 67,000 字符，会撞上 48,000 字符的合计预算——那个预算约束的是规划器/调用方*撰写*的
  任务文本，而回退计划只是调用方自己的字符，因此校验改为直接核对分段（必须与切分器产出完全一致），
  不再套用该预算。③ 以前按上限切片，4,001 字符的目标会切出一个 4,000 字符任务和一个单字符任务，
  所有分片共用一条通用验收标准，切点还可能落在句子中间；现在分段均衡、优先对齐附近的段落/句子/
  词语边界，且每段的标准明确写出它覆盖的是哪一段，核查只确认它拿到的那一片，任何一片都不能代表
  整个目标。
- **A rejected run no longer reads as finished / 被否决的运行不再显示成已完成** — the run node used
  to be closed with the engine's stop reason, and a verifier rejection ends the program normally, so
  a team where no task passed still showed `已完成` on the node and on both rows. The node is now
  closed with the task-level result: every task verified → `已完成`; `partial`/`failed` → `失败`;
  no report → `失败`. 运行节点以前用引擎的停止原因收尾，而核查否决是正常结束，所以一个没有任何任务
  通过的运行，节点和两行都显示「已完成」。现在节点按任务级结果收尾：全部任务通过才是「已完成」，
  `partial`/`失败` 显示「失败」，没有报告也显示「失败」。
- **The panel no longer overstates what happened / 面板不再夸大结果** — a completed child call is
  not a passed task: a finished call is worded `执行代理已结束` / `检查调用已结束`, an ended call can
  never produce the words “任务已完成” or “检查通过”, and no percentage, token count, ETA or invented
  activity is rendered anywhere. A task verdict (`任务通过` / `任务未通过`) comes only from the
  report, and a test fails if the panel and the report disagree.
  子调用结束不等于任务通过：结束的调用写作「执行代理已结束」「检查调用已结束」，永远不会变成
  「任务已完成」「检查通过」；不显示百分比、token 数、预计剩余时间或任何编造的活动。任务结论
  （「任务通过」「任务未通过」）只来自报告，面板与报告不一致时测试会失败。

- **A failed job can no longer be reported `COMPLETED` / 失败的活不会再被报成 COMPLETED** — found by a
  real-model E2E run (`wb/cn:deepseek-v4.1-flash`): a write into `/proc` that the worker itself
  reported blocked still came back `Grok workflow: COMPLETED`, because the planner had rewritten the
  objective into "attempt it and report honestly" and the verifier passed those rewritten criteria.
  Verification now requires the executor's own status to be `completed` — a self-reported
  `partial`/`failed` is an admission, not something a verifier can overturn — and the planner is
  forbidden from substituting "attempt and report" for the requested end state. Regression test in
  `test/orchestrator.spec.ts`; re-run now reports `FAILED`.
  真模型 E2E 抓到的缺陷：worker 自己都报"被阻塞"的 `/proc` 写入，最终仍返回 `COMPLETED`——planner 把目标
  改写成"尝试一下并如实报告"，验证员对着改写后的标准判了通过。现在要求执行者自报必须是 `completed`
  才可能通过验证（自报 `partial`/`failed` 是承认，验证员不能翻案），并禁止 planner 用"尝试并报告"
  替换目标要求的终态。`test/orchestrator.spec.ts` 加了回归，复测返回 `FAILED`。

- **`/grok` now means the full workflow, not the front desk / `/grok` 真的走完整流程** — the command
  promised the full plan→execute→verify workflow while a deployment `mode: triage` quietly answered
  simple messages from a template. An explicit `/grok` now records `workflowMode: 'full'` on the
  session and the gate honours it; a config-level `grokDefault: 'on'` still respects `mode`, so a
  deployment can choose triage. Tests: `test/triage.spec.ts`, `test/mode.spec.ts`,
  `test/command.spec.ts`.
  命令文案承诺完整流程，但部署的 `mode: triage` 会把简单消息静默交给模板回答。现在显式 `/grok` 会在
  会话里记 `workflowMode: 'full'`，闸门照此执行；配置级 `grokDefault: 'on'` 仍尊重 `mode`，部署方
  仍可选分诊。测试见 `test/triage.spec.ts` / `test/mode.spec.ts` / `test/command.spec.ts`。


### Fixed — Issue #22 Phase 1 对话可靠性 / dialogue reliability (reviewed, ships in this release)

- **P0-1 用户原话不再丢失 / the user's own message stays in the transcript** — `in-turn` 路径过去只把
  插件生成的 relay/report 消息放进 `enter.messages`，而 `AgentLoop.preStep()` 已经把这一批消息从
  inbox 里 `claim` 走了，于是模型转写里根本没有用户自己那句话。现在本条决策先带上被 claim 的消息
  （同一个对象：id、source、正文、附件结构都不变），报告紧随其后；`relay` / `append` 因为整步被
  `reject`，由插件自己把那句话写进 session，两条路径各自只有一个写入者，因此不会重复。
  过去 `enter.messages` 只放报告、而用户消息被 `inbox.claim` 移除后无人提交——这就是原话丢失的原因。
- **P0-2 确认档不再丢上下文 / a confirmation answer keeps the task** — `pendingAsks` 过去只存时间戳，
  用户回答「简单」后快手档只收到这两个字。现在 pending 保存 `originalRequest` 与 `askedAt`（TTL 仍为
  10 分钟），快手档与团队档收到的都是「原始任务 + 用户选择简单/团队模式（选择词不是任务目标）」；
  过期、插件重载、被别的消息顶掉时都会明说，不猜原始任务；同一 pending 只能被消费一次。
- **P0-3 内部错误一定有用户可见终态 / every internal error ends visibly** — 分类失败过去是静默
  `reject`（用户看到空白回合），现在是带上原因的通知消息且保留原话；失败话术不会出现
  「已完成/已开启」这类成功措辞；有意取消、超时、插件卸载与内部异常各有独立终态。
- **取消时原话与终态都不再消失 / a cancelled turn keeps the message and states its end** — 真机 GUI
  复核发现的 P0-1 × P0-4 缺口：in-turn 路径里用户那句话已经被 `inbox.claim` 取走，若这一回合被取消，
  决策只能 `reject`，于是 session 里既没有 `user/message` 也没有任何停止原因（实测会话事件只有
  `inbox/spliced` → `run-end cancelled` → `turn/end aborted`）。现在取消走 `commitCancelled()`：先按
  原对象提交被 claim 的那批消息（这一步整步已被 reject，插件是唯一写入者，不会重复），再写一条
  助手消息说明 `运行已取消（cancelled）…已完成的部分保留…`。GUI 截图与回归用例见
  `docs/knowledge/evidence/p1-gui/`。
- **P0-4 取消到达终态并保留已完成的工作 / cancellation ends, and keeps finished work** — 已经 aborted
  的 signal 不会再启动引擎（过去会先启动再取消，白跑一次 planner/worker）；运行被停止时，引擎已经
  产出的报告会被保留：已验证任务原样保留，未完成的任务标为 `interrupted`、未开始的任务标为
  `not started`，运行级错误分类为 `cancelled`（不是质量失败），面板随之收尾。

### Notes / 说明

- **This release changes the default behaviour / 本版改变默认行为** — a fresh install no longer
  runs the workflow for every message: sessions start as plain chat (`grokDefault: 'off'`) until
  `/grok` turns the workflow on for that session. Set `grokDefault: 'on'` to keep the previous
  always-on posture (deployments may still choose `mode` for triage).
  新装插件不再对每条消息跑工作流：会话默认是普通聊天（`grokDefault: 'off'`），用 `/grok`
  为该会话显式开启后才走工作流。需要以前常开姿态的部署请设 `grokDefault: 'on'`
  （仍可用 `mode` 选择分诊）。
- **Real-GUI verification, stated honestly / 真机 GUI 验证（诚实口径）** — `/grok` switching and
  the settings-page card were verified on a real Web GUI driven by a real (off-screen headless)
  Chromium against an isolated instance (VALIDATION Round 15): default plain chat → `/grok` full
  run → `/grok off` back to plain chat, plus card render / save / persist / take-effect-on-new-session.
  Two deviations are stated, not hidden: the browser window was off-screen (the machine has no
  X11 display), and every model round ran on `wb/cn:glm-5.3-flash` instead of the originally
  planned model. `relay` / `append` delivery on a long-lived GUI session remains `NOT_RUN`.
  `/grok` 可切与设置页卡片已在真 Web GUI 上验证：真（离屏 headless）Chromium 驱动隔离实例，
  默认普通聊天 → `/grok` 完整运行 → `/grok off` 回普通聊天，以及卡片渲染 / 保存 / 持久化 /
  对新会话生效（VALIDATION Round 15）。两处偏离如实说明、不隐瞒：浏览器窗口是离屏的（本机无 X11
  显示），全部模型轮次用的是 `wb/cn:glm-5.3-flash` 而非原定模型。长驻 GUI 会话里的 `relay` /
  `append` 投递仍为 `NOT_RUN`。

## [0.2.3] - 2026-10-28

The front desk release: every user message now passes a front desk that states its tier in
public. `0.2.2` behaved exactly as before unless `mode` was changed — nothing here restates a
`0.2.2` change, and the `0.2.2` / `0.2.1` / `0.2.0` / `0.1.0` sections are untouched.

**What the tiers actually do, after the t53 review:** the first draft of this feature answered
short questions and short two-step instructions from the greeting template — it looked like it
worked and did no work at all. That is fixed, and the ordering that caused it is now a tested
contract (see Fixed).

### Added / 新增

- **Front desk with four tiers / 前台四档分流** — every user message now passes a front desk that
  states which tier it chose and why, and never silently takes a cheaper path: `直答档` answers
  small talk from a template (no model call), `快手档` answers a single-step request with one
  worker, `团队档` runs the full workflow with a greeting and the progress panel, and `确认档` asks
  `这个要动用团队吗？可回复：简单 / 团队` and remembers the answer. Tier wording, greeting and
  answer follow the language of the message. 每条消息都先过前台：前台公开写明走了哪一档、为什么，
  绝不静默降级——直答档用模板秒回（不花调用）、快手档派一个工人、团队档跑完整工作流（带开工迎宾
  与进度面板）、拿不准就反问一句并记住回答；档位措辞跟随消息语言。
- Three new settings, in the existing settings page and both languages: `mode` (`triage` /
  `full`), `triageAsk`, `triageModel`. Configuration keys 23 → 26.
  设置页新增三项（中英双语）：`mode`（分流 / 全团队）、`triageAsk`、`triageModel`；配置键 23 → 26。

### Compatibility / 兼容

- `mode: 'full'` reproduces the previous behaviour exactly — every message runs the team, no tier
  line, no greeting — and is pinned by a test. `mode: 'full'` 逐字节复现旧行为（每条消息都走团队，
  无档位行、无迎宾语），并有测试钉住。

### Fixed / 修复

- **Short questions and short two-step instructions were answered as small talk** (t53 F1, blocker).
  The "short and inert ⇒ direct tier" shortcut ran before the sequencing and question rules, so
  `为什么天空是蓝的`, `先备份然后升级` and `这个报错 src/triage.ts:42` were answered with a greeting
  template: the tier line was honest, the work never happened. The shortcut now runs after every
  strong signal, a question always costs at least one worker, and a pointer that carries a path, an
  error code or a snippet is dispatched instead of being asked about. Enumerations (`1) … 2) …`,
  `一、… 二、…`) and semicolons count as sequencing. 短问句与短两步指令曾被当成寒暄用模板答掉（档位
  行诚实、活儿没干）：短路规则现在排在全部强信号之后，问句至少一个工人，带路径/错误码/代码片段的
  "这个报错"直接派工而不反问；序号、顿号、分号都算多步。
- A bare `简单` / `团队` with no question waiting no longer guesses (and no longer crashes): it says
  that the pending question expired or the plugin reloaded. 无待答问题时的裸"简单/团队"不再猜、也不
  崩，而是明说上一轮没有待回答的分流问题。

### Notes / 说明

- The pending question and its answer live in plugin memory for ten minutes and are consumed when
  used, so a reload or a longer pause forgets them; the next bare choice word says so. 确认档的问题与
  回答存在插件内存里，10 分钟、用后即弃，重载或超时后会明说。
- The greeting arrives **with** the final answer, not before it: under `in-turn` a turn admits one
  plugin message, so during the run the visible signal is the progress board. 迎宾语随最终回答一起
  到达（`in-turn` 下一轮只允许一条插件消息），运行期间可见的是进度面板。
- The quick tier is "one call in the common case": when the plain call returns nothing, one
  structured retry follows, and the answer text still says one worker. 快手档常态一次调用；第一次
  没有产出时会重试一次结构化调用，措辞仍是"一个工人"。

## [0.2.2] - 2026-10-28

Incremental release on top of the published `0.2.1`: the deadline became a real bound, model
routing became visible in every report, and a verified task stopped being failed for the
verifier's prose. Nothing here restates a `0.2.1` change.

**On "quality":** this release fixes a decision defect, it does not raise the quality of the
models. Measured in the test home before the fix: 12 reports — 1 `COMPLETED`, 8 failed for the
defect described under Fixed, 3 cancelled by deliberate probes (deadline / unload). With the
shipped default chains (one `deepseek-v4.1-flash` route per role, `maxRetries: 0`) a verifier
that reports a *blocking* problem still fails the task, and that is the intended behaviour. If
you want stricter or looser verification, that is a model choice
(`roles.verifier`), not something this release tunes for you.

`0.2.1` 之上的增量版本：截止时间成为真正的上限、模型路由在每份报告里可见、已通过的任务不再
因为 verifier 的一句散文备注被判失败；不重复 `0.2.1` 已经发布过的改动。

**关于"质量"：** 本版修的是**判定缺陷**，不是把模型变强。修复前测试 home 实测：12 份报告 ——
1 份 `COMPLETED`、8 份因 Fixed 里描述的缺陷失败、3 份是被刻意取消的探针（超时 / 卸载）。按默认
链（每角色一条 `deepseek-v4.1-flash`、`maxRetries: 0`），verifier 报告**阻塞性**问题时任务依然
会失败，这是预期行为。想要更严或更松的验证属于模型选择（`roles.verifier`），本版不替你调。

### Added / 新增
- **The Web GUI shows the run while it happens / Web 界面现在能看见工作流在跑。** The plugin
  writes the four session events the stock conversation panel folds into a **workflow-run
  node** (`tool-workflow/run-start`, `agent-start`, `agent-end`, `run-end` — the same family
  and the same payload fields the in-tree workflow tool writes, pinned by a contract test).
  A message now produces a live node ~60 ms after the turn opens — before any subagent
  exists, which is exactly the window that used to be empty — with one member row per
  subagent appearing and settling as the run proceeds (planner → workers → verifiers) and a
  terminal status (`Completed` / `Cancelled` / `Failed`) at the end. Measured on a real
  profile: node at ~0.26 s after Send, members 0 → 1 → 2 → 3, `run-start` written at turn
  level 78 s before the step opened, and a run stopped from the GUI closing as `cancelled`.
  / 插件写入会话面板折叠成 **工作流运行节点** 的四个事件（`tool-workflow/run-start`、
  `agent-start`、`agent-end`、`run-end`，事件族与字段形状与 in-tree 工作流工具完全一致，
  由契约测试钉死）。发一条消息后 **约 60 ms** 主窗口即出现运行节点——**早于任何子代理存在**，
  正是过去那段空白；成员行随子代理出现与结束逐条增长（planner → worker → verifier），
  结束时给出终态（已完成 / 已取消 / 失败）。真机实测：点发送后约 0.26 s 节点可见，成员
  0 → 1 → 2 → 3，`run-start` 写在 turn 级、比 step 出现早 78 s，GUI 上停止的运行以
  `cancelled` 收尾。
- **Settings: `showProgress` switch / 设置页新增 `showProgress` 开关。** One checkbox, on by
  default, in both languages: turn it off and the run writes nothing but its messages, so a
  session log carries no run events at all. That makes 23 configuration keys.
  / 设置页加一个默认开启的双语复选框：关掉后运行只写消息不写任何运行事件，会话日志里完全
  没有运行痕迹。配置面因此变为 23 个键。
- **Run name carries the task count when it is known / 已知任务数时，运行名带任务数。**
  A run started with a caller-supplied plan is titled `grok-workflow · 3 tasks` (the panel's
  title is the run name). A run that plans first keeps the bare name, because the count does
  not exist at the moment the node must appear — the panel's live member count covers it.
  / 调用方给了计划时运行名形如 `grok-workflow · 3 tasks`（面板标题就是运行名）；先规划后
  执行的运行保持裸名——节点出现的那一刻任务数还不存在，此时由面板的实时成员计数代替。

### Fixed / 修复
- **A verified task is no longer failed for the verifier's opinion / 已通过的任务不再因为
  verifier 的一句备注被判失败。** The task decision now belongs to the verifier's structured
  judgement — `verdict` plus one `criteria` entry per acceptance criterion with `met` and
  evidence. Its prose `issues` list used to override that judgement, so a verifier that said
  `pass` with every criterion met still failed the task for writing down a caveat. The cost was
  visible: in the test home **8 of 12 recorded reports failed for this reason** — including all
  five t46 acceptance rounds, whose notes say "non-blocking", "minor observation rather than a
  failure", "does not affect any acceptance criterion". A verified task's notes are now carried
  into the report's `Uncertainties` as `verifier note: …` instead of being turned into a
  failure, and the verifier prompt states that `issues` is for blocking problems only (residual
  doubt belongs in `confidence`). A criterion marked `met: false`, or `verdict: fail`, still
  fails the task — that part is unchanged and pinned by tests.
  / 任务判定回归 verifier 的**结构化判断**：`verdict`，加上每条验收标准一条带 `met` 与证据的
  `criteria`。此前它的散文字段 `issues` 会覆盖该判断——verifier 判定 `pass` 且每条标准都满足，
  只要它顺手写下一句保留意见，任务依然判失败。代价是实测的：测试 home **12 份报告里有 8 份**
  因此失败，包括 t46 的 5 轮验收，而那些备注自己写着"non-blocking"（非阻塞）、"minor
  observation rather than a failure"（只是小观察不是失败）、"不影响任何验收条款"。现在已通过
  任务的备注会以 `verifier note: …` 进入报告 `Uncertainties` 而不是变成失败，verifier 提示词
  也写明 `issues` 只用于**阻塞性问题**（残余疑虑请写 `confidence`）。`met: false` 或
  `verdict: fail` 仍然判失败——这部分没变，且有测试钉住。
- **The deadline is now the plugin's own hard bound, and it says so / 截止时间现在是插件自己
  的硬上限，并说明它的数值。** `timeoutMs` was enforced by aborting a signal and then waiting
  for the engine to settle; a measured run was still working minutes after its 60 s deadline,
  and its cancellation was reported as "cancelled by its caller" — pointing at the wrong actor.
  The run result now races the plugin's own deadline, so the caller always gets the timeout
  report on time, the cancel reason names the deadline it hit, and every report carries a
  `Deadline: <n> ms per run` line. / 过去的 `timeoutMs` 只是中断一个 signal 然后等引擎收尾；
  实测有运行在 60 s 截止后数分钟仍在工作，取消原因还写成"由调用方取消"，把责任指错了人。
  现在运行结果与插件自己的截止时间赛跑：调用方总能按时拿到超时报告，取消原因写明打中的
  截止值，每份报告带一行 `Deadline: <n> ms per run`。
- **`Model routes:` is always printed, and a failure report no longer claims `inherit` /
  报告始终打印 `Model routes:`，失败报告不再谎称 `inherit`。** The line used to be skipped
  whenever every configured chain was empty, so "nothing configured" and "the line is missing"
  looked identical; a timeout or unload report hard-coded an all-empty routing block even when
  the run had been handed a chain. Unset roles now say `inherit`, and failure reports derive
  their chains from the configuration in force. / 该行过去在所有角色链为空时被整行省略，
  "没配置"与"这行没打印"看起来一样；超时/卸载报告还用写死的空路由块，哪怕运行确实拿到了
  链。现在未配置的角色显示 `inherit`，失败报告按生效配置生成链。
- **An unload can finally be explained / 插件被卸载终于能查到原因。** When the plugin is
  unloaded, it now writes a `plugin:grok-workflow/dispose` record into every affected session
  *before* cancelling anything — time, uptime, trigger class (`management` / `shutdown` /
  `test` / `unknown`), the redacted call-site frames,
  how many runs were live, and each run's id and age — plus one diagnostics line. The
  cancelled report is also split by cause: a run killed by an unload now says so
  (`grok_workflow was cancelled because the plugin was unloaded while the run was in flight`),
  distinct from `cancelled by its caller`. Before this, two runs in two workspaces were
  cancelled 573 ms apart and the only trace was "was cancelled before it produced a report".
  The class is decided by a **signal probe**, not by guessing from the stack: the plugin
  subscribes to shutdown signals at load time and records any that arrive before disposal
  (a shutdown signal ⇒ `shutdown`). The redacted call-site frames are a tie-breaker only,
  because on a real instance both a SIGTERM and a settings-page toggle show nothing but
  cordis internals within the frame budget. `unknown` is a legitimate answer — an
  in-process unload on the test instance recorded `signals: []` and `trigger: unknown` —
  and the record always carries the raw material so the class can be re-derived.
  / 插件被卸载时，**先**写入 `plugin:grok-workflow/dispose` 记录再取消运行：时间、存活时长、
  触发类别（`management`/`shutdown`/`test`/`unknown`）、脱敏调用栈帧、
  当时活跃 run 数与每个 run 的 id 与时长，并输出一行诊断日志。取消报告同时按原因拆分：
  被卸载打断的运行明说"插件在运行期间被卸载"，与"被调用方取消"区分开。此前两个 workspace
  的 run 相隔 573 ms 被取消，唯一痕迹只有一句"was cancelled before it produced a report"。
  触发类别由**信号探针**决定而非从调用栈猜：插件加载时订阅关闭信号，并记录在卸载之前是否
  收到过（收到即 `shutdown`）。脱敏调用栈帧只作并列依据——真机上 SIGTERM 与设置页停用两者
  可见帧全是 cordis 内部帧，单靠栈只能答 `unknown`。`unknown` 是合法答案（测试实例上一次
  进程内卸载记录到 `signals: []`、`trigger: unknown`），记录里始终带着原始材料可复核。
- **A cut run tells the user through its report, and an idle disable stays silent /
  被切断的运行通过报告告知用户，空闲停用则完全安静。** If a run was actually interrupted, its
  session gets one notice row (no model call): what was interrupted, that the cause was an
  unload and not a deadline, and that messages until re-enable are answered directly. That row
  is **written to the session log but not rendered** by the stock conversation panel in DSH
  `0.2.1-rc.2` — it sits at a `(turn, step)` that never opens a step, and the panel starts an
  assistant row only on `step/start` — so the row's job is the ledger plus the next turn's
  context, and the **report is the user-visible channel**: the cancelled run's report names the
  unload as the cause. Disabling the plugin on purpose while nothing runs writes **nothing**
  into any session — a direct answer is the expected behaviour there.
  / 只有在**确有运行被切断**时，该会话才会写入一条提示行（不花模型调用）：说清被中断的工作、
  原因是卸载而非超时、以及恢复前的消息将直答。该行在 DSH `0.2.1-rc.2` 的原生会话面板里
  **只写入、不渲染**——它落在一个从未开启 step 的 `(turn, step)` 上，而面板只为 `step/start`
  开启助手行——因此它的作用是台账 + 下一轮上下文，**用户可见的告知通道是报告**：被取消那次
  运行的报告明说原因是插件卸载。**空闲**时停用插件（用户有意为之）不向任何会话写入任何内容
  ——此时直答就是预期行为。
- **One session can no longer starve the others / 一个会话不再能饿死其它会话。** The active-run
  cap is now per session (`maxActiveRuns`, default 2) with a process-wide backstop
  (`maxActiveRunsTotal`, default 8), and a refusal names the holders: `already has 2 active
  run(s) in this session; maxActiveRuns is 2 per session (holding: run 3f5c… (running 14m38s),
  run 9b02… (running 2m01s))`. Measured before the fix: two long runs in one session refused
  three other sessions across three workspaces.
  / 并发槽位改为**按会话**（`maxActiveRuns`，默认 2）+ 进程级兜底（`maxActiveRunsTotal`，默认 8），
  拒绝文案写明占槽者（run id 与已跑时长）。修复前实测：一个会话两个长 run 拒掉了三个 workspace 的
  三个会话。
- **Default deadline raised to 60 minutes / 默认超时提高到 60 分钟。** The 30-minute default was
  measured to be a knife-edge, not a margin: two four-task runs were killed at 30m00s and
  30m01s, while real four-task runs finish in 878 s / 1148 s / 1801 s. Hard ceiling unchanged
  (24 h), settings page range unchanged.
  / 30 分钟默认值是刀口而非余量：两个四任务运行分别在 30m00s 与 30m01s 被杀，而真实四任务运行用时
  878 s / 1148 s / 1801 s。硬上限（24 h）与设置页范围不变。

### Changed / 变更
- **The settings page speaks the language DSH is set to / 设置页跟随 DSH 的语言设置（中英双语）。**
  Every string on the page — card title and one-line summary, group headings, per-field labels,
  numeric ranges, the per-role chain editor (add / remove / placeholder / empty-chain hint),
  read-only rows, Save / Discard / Saving, the save outcome and every validation finding — now
  resolves through the composition's own locale plugin (`@deepseek-ai/dsh-client-locale`) instead
  of being printed as one hardcoded bilingual line. The bundle registers its dictionary
  (`ctx.locale.register('grok-workflow', { zh, en })`) and declares `locale: 'grok-workflow'` on its
  `plugins.item` slot, so Settings → General → Language switches the page, the card title and the
  card summary in place — the same setting that drives `<html lang>`. The browser's `navigator`
  language is never consulted, and a composition with no locale service still mounts the page in
  English rather than not at all.
  / 页面全部文案（卡片标题与一行简介、分组标题、字段标签、数值范围、按角色链编辑器、只读行、
  保存/放弃/保存中、保存结果、以及全部校验错误）改为经由组合自带的 locale 插件
  （`@deepseek-ai/dsh-client-locale`）解析，不再打印硬编码的中英混排一行字；bundle 注册自己的
  字典并给 `plugins.item` 槽声明 `locale`，因此"设置 → 通用 → 语言"切换即让页面、卡片标题与
  简介就地换语言——与驱动 `<html lang>` 的是同一个设置。**不**读取浏览器 `navigator` 语言；
  组合里没有 locale 服务时页面仍以英文挂载，而不是整页缺失。
- **Validation findings are data, not prose / 校验结果是数据而不是成品句子。** `validate()`
  returns `{ key, params }` findings and the page renders them through the active language, so one
  draft reports identically in both languages and a language switch re-renders findings already on
  screen instead of stranding the old wording. / `validate()` 返回 `{ key, params }`，由页面按当前
  语言渲染；同一份草稿在中英文下报同一批问题，切换语言时已在屏幕上的错误会一起换语言。

## [0.2.1] - 2026-10-27

Incremental release on top of the published `0.2.0`: everything below is **new since** that tag —
nothing in this section restates a change that `0.2.0` already shipped.

`0.2.0` 之上的增量版本：本节全部是**自该 tag 以来新增**的内容，不重复 `0.2.0` 已经发布过的改动。

### English

#### Added
- **Settings page in the Web GUI / Web 图形界面的设置页。** The plugin now ships its own
  browser bundle, so the Plugins page shows a **Grok workflow** card with all 21
  configuration keys: the 17 live fields (gate, context and concurrency limits,
  synthesis, failure classes, run records) and the 4 structural keys read-only with
  their reason. Per-role fallback chains are edited in place (add / remove / edit a
  route, up to three per role), invalid input is refused before it reaches the Host,
  and a save applies to the **next** message. The page appears only while the Host
  serves the namespace, so an inactive plugin shows no card instead of a dead form.
  / 插件自带浏览器端 bundle：插件页出现 **Grok workflow** 卡片，渲染全部 21 个配置键
  （17 个可编辑的活动字段 + 4 个只读结构性字段并给出原因），支持按角色链的增删改
  （每角色最多 3 条），非法输入在提交前被拦下并列出原因，保存后对**下一条消息**生效；
  命名空间未提供时整页不出现，而不是显示一个坏掉的表单。
- **Activation prerequisite documented / 记录激活前提。** `@deepseek-ai/dsh-web-app` ships
  `workflow-ptc` disabled, so installing the bundle puts the row in the graph while the
  plugin stays `pending (waiting for service: workflowEngine)`. The install steps now
  include re-enabling a workflow provider, plus the four checks that prove activation
  (clean boot, served namespace, GUI card, `grok_workflow` in a real session's tool
  list). / `dsh-web-app` 层默认禁用 `workflow-ptc`，装包只让行进入组合图而插件停在
  `pending`；安装步骤已补上"启用一个工作流 provider"和四条激活校验。

### 简体中文

#### 新增
- **Web 图形界面的设置页。** 插件自带浏览器端 bundle：插件页出现 **Grok workflow** 卡片，
  渲染全部 21 个配置键（17 个可编辑的活动字段 + 4 个只读结构性字段并给出原因），支持按角色
  链的增删改（每角色最多 3 条），非法输入在提交前被拦下并列出原因，保存后对**下一条消息**
  生效；命名空间未提供时整页不出现，而不是显示一个坏掉的表单。
- **记录激活前提。** `@deepseek-ai/dsh-web-app` 层默认禁用 `workflow-ptc`，装包只让行进入
  组合图而插件停在 `pending (waiting for service: workflowEngine)`；安装步骤已补上"启用一个
  工作流 provider"和四条激活校验。

## [0.2.0] - 2026-10-26

### English

#### Added

- **Mandatory entry (the gate).** The plugin now claims every user message
  through `agent/pre-step`, runs the full plan → execute → verify → synthesise
  workflow, and delivers the result inside the same turn (`answerStrategy:
  in-turn`, the default). Turning a message away is a stated decision: an empty
  or over-long message (over 4000 characters) is refused with its reason
  printed, and nothing is executed. Delivery is de-duplicated per message, so
  re-dispatching a batch cannot start a second run, and the queue per agent is
  bounded (`maxQueuedMessages`).
- **Per-role model routing with ordered fallback chains.** `roles.planner`,
  `roles.worker`, `roles.verifier` and `roles.synthesizer` each take up to three
  routes (`{ provider, model }`, or a bare model id as shorthand). Every child
  call is routed by role, and a route-level failure advances that role's chain.
  The routes actually used are recorded in the report (`routing`) and rendered in
  the answer, so a chain that never took effect cannot look like routing that
  works.
- **Switch policy you can inspect.** `switchOn` lists the failure classes that
  advance a chain (default: the built-in policy). Content failures
  (`task-failed`, `verification-failed`) never advance — a different model would
  be looking at the same evidence — and a typo in `switchOn` is refused at load
  instead of silently never switching.
- **Failure class and category in every report.** Each failure carries what
  happened (`class`, e.g. `rate-limit`, `timeout`, `verification-failed`) and
  who has to fix it (`category`: `infrastructure`, `quality`, `configuration`,
  `cancelled`, `unknown`). The rendered answer adds a `Failures:` line, so a
  provider outage is not read as poorly done work.
- **A settings surface that is the same truth as the runtime.** The exported
  `Config` is projected into the standard DSH settings UI; fields are live
  (an edit reaches the next message, an invalid edit is refused with its reason
  while delivery keeps the last valid snapshot). Unknown configuration keys are
  rejected with the closest accepted key instead of being ignored, and
  `roles`/`synthesis` are validated against the providers the runtime actually
  has. Run records (`recordRuns`, `recordLimit`) can be turned off or capped.
- **Write-path isolation for parallel tasks.** A plan task may declare
  `writesPaths`; tasks whose declared paths overlap run one after another, and
  everything else keeps running in parallel. `[]` means "writes nothing";
  declaring nothing means "unknown" and is treated conservatively. Overlap is
  decided lexically (`.`, `..`, separators, case) with segment-wise prefixes, so
  `src` covers `src/a.ts` while `src/a` does not cover `src/ab`.
- **A real-engine contract test base and a reliability suite.** The tests drive
  the actual `@deepseek-ai/dsh-workflow-ptc` engine (script VM, guest program,
  `agent()` contract, result materialization) with a scripted subagent provider,
  and cover cancellation, deadlines, the concurrency cap, duplicate starts,
  recursion refusal, context bounds, secret redaction, partial results, unload
  and reload. 264 deterministic tests across 18 files; no online model is needed.
  Process confinement, sandbox policy and capability gating remain out of scope.

#### Changed
- **`enforceGate` is `true` by default: every user message now goes through the
  workflow.** This is the point of the release and also the biggest visible
  change from `0.1.0`, where the tool only ran when a model chose to call it.
  Set `enforceGate: false` to get the `0.1.0` behaviour back (the tool stays
  available, the gate does not intercept).
- The answer is delivered inside the turn by default (`answerStrategy:
  in-turn`). `relay` and `append` remain selectable for long-lived surfaces; on a
  one-shot headless run they deliver after the process has begun tearing down.
- Acceptance criteria must stay distinct after normalization (trailing sentence
  punctuation, collapsed whitespace and case are ignored when matching a
  verifier result), so `["Do X.", "do x"]` is now rejected.
- The planner prompt receives the objective as redacted JSON data rather than
  raw interpolated text, matching how worker and verifier prompts are built.
- The report validator now enforces what it documented: deep-checked attempt
  payloads against closed unions, confirmed evidence traceable to the task's
  last attempt, unique task ids, `limits.maxTotalAgents` inside the request
  builder's window, and every failed task present exactly once in `incomplete`.
- The package version is `0.2.0`, the changelog keeps one bilingual section per
  version, and `npm run ci` runs typecheck, lint, build and the full suite.

#### Fixed
- An infrastructure failure no longer escapes as a raw exception. Every
  transport-level failure (429, timeout, connection reset, missing model, a
  crashed child) now produces a structured report with
  `category: infrastructure`; the worst case is one failed row per task.
- Redaction rules have a single source (`REDACTION_RULES`) and the workflow
  script's prompt-side redactor is generated from it. Added Azure SAS
  (`sig`/`signature`) and `Authorization: Basic` coverage.
- Verification no longer compares acceptance-criterion text byte-for-byte, so a
  verifier that copies a criterion with a trailing period, different spacing or
  different case no longer fails every attempt.
- A run-level failure (deadline, cancellation, an unvalidatable report) now
  prints its `Failures:` line from the run-level error categories instead of
  showing none.
- A malformed routing record no longer discards the whole ledger, and the
  delivery fallback keeps the last valid configuration instead of the load-time
  one, so a later invalid edit cannot silently undo an edit that had taken
  effect.

#### Breaking notes (`0.1.0` → `0.2.0`)
- **Mandatory entry is on by default.** If you want the old opt-in behaviour,
  set `enforceGate: false`. A deployment that must never degrade silently should
  also set `gateRequired: true`, which turns "this runtime has no `agent/pre-step`
  hook" into a load error instead of a warning.
- **The report is additive but extended:** task rows gain `writesPaths` (array or
  `null`), failures gain `class` and `category`, and `plan.tasks` must match
  `tasks` field for field. Consumers that reject unknown fields must be updated;
  consumers that ignore them keep working.
- **Configuration keys are validated.** Unknown keys are rejected at load with a
  suggestion, and `roles` chains are refused when empty models, duplicate routes
  or more than three routes are present. A configuration that loaded under
  `0.1.0` because a key was silently ignored may now fail loudly — that is
  intentional.
- **Criteria distinctness** can reject input that `0.1.0` accepted.
- Requires DSH `0.2.1-rc.2` and Node.js 22 or newer; the `0.1.0` peer set is not
  supported.

### 简体中文

#### 新增

- **强制入口（闸门）**：插件现在通过 `agent/pre-step` 认领每一条用户消息，执行完整的
  规划 → 执行 → 验证 → 汇总工作流，并在**同一轮**内交付结果（`answerStrategy:
  in-turn` 为默认）。拒绝一条消息也是明示决定：空消息或超过 4000 字符的消息会被打印
  拒绝原因且不执行任何工作。每个消息的交付做了去重，同一批被重复派发也不会启动第二次
  运行；每个 agent 的等待队列有上限（`maxQueuedMessages`）。
- **按角色模型路由 + 有序备用链**：`roles.planner`、`roles.worker`、`roles.verifier`、
  `roles.synthesizer` 各自最多三条路由（`{ provider, model }`，也接受裸模型 id 简写）。
  每次子代理调用按角色取路由，路由级失败会推进该角色的链。实际用到的路由写进报告
  (`routing`) 并渲染在答案里，因此"配了但没生效"不会被误当成"配好了"。
- **可检视的切换策略**：`switchOn` 列出允许推进备用链的失败类别（默认=内置策略）。
  内容类失败（`task-failed`、`verification-failed`）永不推进——换模型看到的是同样的
  证据；`switchOn` 里写错类别会在载入时被拒绝，不会变成"永不切换"。
- **每份报告都带失败类别与归类**：每个失败同时给出发生了什么（`class`，例如
  `rate-limit`、`timeout`、`verification-failed`）和该谁修（`category`：
  `infrastructure`、`quality`、`configuration`、`cancelled`、`unknown`）。渲染的答案
  增加 `Failures:` 行，provider 故障不会被读成"活干得不好"。
- **设置面与运行时同一真相**：导出的 `Config` 会被投影成 DSH 标准设置页；字段是活值
  （编辑对下一条消息生效，非法编辑以原因被拒绝，投递继续使用上一次合法快照）。未知
  配置键会被拒绝并给出最接近的合法键，而不是被静默忽略；`roles`/`synthesis` 会对照
  运行时实际拥有的 provider 校验。运行记录可用 `recordRuns`/`recordLimit` 关闭或封顶。
- **并行任务的写路径隔离**：计划任务可声明 `writesPaths`，声明路径重叠的任务依次执行，
  其余保持并行。`[]` 表示"不写文件"；什么都不声明表示"未知"，按保守方式处理。重叠判定
  是词法的（`.`、`..`、分隔符、大小写）且按段比较前缀，因此 `src` 覆盖 `src/a.ts`，
  而 `src/a` 不覆盖 `src/ab`。
- **真实引擎契约测试基座与可靠性套件**：测试直接驱动真正的
  `@deepseek-ai/dsh-workflow-ptc` 引擎（脚本 VM、guest 程序、`agent()` 契约、结果
  物化），配合脚本化的子代理 provider，覆盖取消、超时、并发上限、重复启动、递归拒绝、
  上下文边界、密钥脱敏、部分完成、卸载与重载。264 个确定性测试 / 18 个文件，无需在线
  模型。进程隔离、沙箱策略与能力门禁仍不在覆盖范围内。

#### 变更
- **`enforceGate` 默认 `true`：每条用户消息都会走完整工作流。** 这正是本版本的目的，
  也是相对 `0.1.0` 最大的可见变化——`0.1.0` 只有模型主动调用工具时才运行。若想恢复
  `0.1.0` 的行为，设 `enforceGate: false`（工具仍可用，闸门不再拦截）。
- 答案默认在同一轮内交付（`answerStrategy: in-turn`）。`relay`、`append` 仍可选用，
  适用于长驻界面；在一次性 headless 运行中它们在进程开始销毁后才投递。
- 验收标准归一化后必须互不相同（匹配验证结果时忽略结尾句读、多余空白与大小写），
  `["Do X.", "do x"]` 这类输入现在会被拒绝。
- 规划提示词接收经脱敏的 JSON 形式目标，与 worker、verifier 提示词的构造方式一致。
- 报告校验器补齐了声明的约束：逐次尝试载荷按闭合枚举深度校验、confirmed 证据必须可追溯
  到该任务最后一次验证、任务 id 唯一、`limits.maxTotalAgents` 落在请求构造器取值区间、
  每个失败任务在 `incomplete` 中恰好出现一次。
- 版本号改为 `0.2.0`；更新日志每个版本保持中英对照；`npm run ci` 运行 typecheck、
  lint、build 与完整测试。

#### 修复
- 基础设施故障不再以裸异常逃逸。所有传输层故障（429、超时、连接重置、模型不存在、
  子代理崩溃）都会产出结构化报告并标注 `category: infrastructure`；最坏情况是每个任务
  一行失败。
- 脱敏规则改为单一来源（`REDACTION_RULES`），工作流脚本内的提示词脱敏器由它生成；
  新增 Azure SAS（`sig`/`signature`）与 `Authorization: Basic` 覆盖。
- 验证不再逐字比较验收标准文本，验证者抄错结尾句号、空白或大小写不会再导致每次尝试失败。
- 运行级失败（超时、取消、报告无法校验）也会打印 `Failures:` 行（取自运行级错误类别），
  而不是什么都不显示。
- 单条畸形路由记录不再毁掉整份台账；投递回落改取**上一次合法配置**，因此后续非法编辑
  无法静默撤销已经生效的编辑。

#### 破坏性说明（`0.1.0` → `0.2.0`）
- **强制入口默认开启。** 需要旧的可选行为请设 `enforceGate: false`。要求"绝不静默降级"
  的部署还应收紧 `gateRequired: true`：把"运行时没有 `agent/pre-step` 钩子"从警告变成
  载入错误。
- **报告为纯增量但已扩展**：任务行新增 `writesPaths`（数组或 `null`），失败新增 `class`
  与 `category`，且 `plan.tasks` 必须与 `tasks` 逐字段一致。拒绝未知字段的消费方需要
  适配；忽略未知字段的消费方不受影响。
- **配置键会校验**：未知键在载入时被拒绝并给出建议；`roles` 链出现空模型、重复路由或
  超过三条会被拒绝。`0.1.0` 下因键被静默忽略而"能用"的配置，现在可能直接报错——这是
  有意为之。
- **验收标准去重**可能拒绝 `0.1.0` 曾接受的输入。
- 需要 DSH `0.2.1-rc.2` 与 Node.js 22 及以上；`0.1.0` 的 peer 集合不再受支持。

## [0.1.0] - 2026-10-25

### English

#### Added
- Initial version of Grok Workflow for DSH, an external DSH bundle exposing the `grok_workflow` tool.
- Bounded plan, parallel execution, independent verification, limited retries, and a structured final report.
- Configurable limits for concurrency, retries, task count, execution deadline, and active workflow runs.
- English and Simplified Chinese setup documentation, architecture notes, acceptance checks, tests, and an optional GitHub Issue watcher.

#### Fixed and hardened
- Validate workflow reports before presenting them as results, including explicit `completed`, `partial`, and `failed` invariants.
- Bound task input and report payload sizes, and redact common credential formats from model-facing diagnostics.
- Treat GitHub Issue content as untrusted input and restrict credential variables passed to watcher wake processes.
- Test the committed `lib/` build output so a stale compiled package cannot silently pass CI.

### 简体中文

#### 新增
- Grok Workflow for DSH 首个版本：作为 DSH 外部 bundle，提供 `grok_workflow` 工具。
- 支持有限规划、并行执行、独立验证、有限重试和结构化结果汇总。
- 支持配置并发数、重试次数、任务数、执行时限和同时运行的工作流数量。
- 提供英文与简体中文文档、架构说明、验收清单、自动化测试，以及可选的 GitHub Issue 监控脚本。

#### 修复与安全加固
- 在展示结果前校验工作流报告，明确约束 `completed`、`partial` 和 `failed` 状态。
- 限制任务输入和报告大小，并对模型可见的诊断信息中的常见凭据格式进行脱敏。
- 将 GitHub Issue 内容视为不可信输入，并限制监控脚本唤醒进程可继承的凭据环境变量。
- 在 CI 中检查已提交的 `lib/` 构建产物，避免过期编译文件在测试通过后被错误打包。
