# 被删键从「拒载」改成「忽略 + 点名」：门禁 + 隔离真机读数（2026-11-25）

验收对象：分支 **`fix-removed-keys-warn`**（worktree `.agents/worktrees/fix-removed-keys-warn`），基线 `main` 尖端
**`c3d729f`**（0.13.37 收口之后）。产品决定是 `docs/knowledge/DECISIONS.md` 的 **`D-155`**（只为被删键推翻 `R-06`；
未知键、拼错、非法值、越界数字照旧拒载）。旧契约（拒载）的历史读数是
`docs/knowledge/evidence/m3-3-2026-11-25/README.md` 与 `docs/knowledge/VALIDATION.md` 的同日条。

环境：Node **v26.8.1**；DSH **0.2.2-rc.3**；隔离 scratch home `.tmp/soak-removed-keys/dsh-home`
（profile **`web-clone`**，`node scripts/clone-profile.mjs` 从 live `~/.dsh/profiles/web` 克隆），端口 **127.0.0.1:3331**；
headless Chromium（`/usr/bin/chromium` + 本机 playwright）。
**live `~/.dsh` 与 3080 上的实例全程未写、未重载、未重启**（本会话的沙箱本身把 `~/.dsh` 挂成只读，任何误写都会被 EROFS 挡下，
本轮也确实撞到过两次：`dsh web --help` 与 `dsh --help` 不带 `DSH_HOME` 时会尝试写 live profile，均被拒绝、未落一字节）。

口径：`AGENTS.md` §2 的四个状态词。每条结论都回指下面的一个读数或一个命令。

## 清单

| 文件 | 是什么 | 支撑哪条结论 |
| --- | --- | --- |
| `boot-with-mode.excerpt.txt` | 带 `mode: triage` 行那次真机启动的摘录（URL 行 + 全文 grep 计数） | ① 这一行**照常激活**：`did not activate` / `pending` / `startup failed` 全为 **0** |
| `describe-with-mode.json` | 同一实例 `settings/describe` 里 `grok-workflow` 那一项的事实（命名空间总数、`autoGenerate`、`user` 键集） | ① 命名空间在、`autoGenerate: true`；③ 页面数据侧：`user` 里**没有** `mode`（见 §三.3 的如实说明） |
| `warn-probe-with-mode.txt` | 用**安装进档案的那份构建**（`<clone>/node_modules/dsh-grok-workflow/lib/index.js`）驱动 `apply()`，记录 logger 收到什么 | ② 警告原文点名 `mode`、只播一次（两次重读后仍是 1 行） |
| `warn-probe-without-mode.txt` | 同一探针、同一构建，只是档案里删掉了 `mode:` 行 | ④ 对照：警告消失，工具照旧注册 |
| `boot-without-mode.excerpt.txt` | 删掉那一行后的真机启动摘录 | ④ 对照：激活照旧、无警告 |
| `describe-without-mode.json` | 对照实例的 `settings/describe` 事实 | ④ 对照：命名空间与键集不变 |
| `gate.out` | `TMPDIR=$PWD/.tmp npm run ci` 的完整转录（HEAD = 记忆提交 `092146e`；同样的树、只差随后那一行文档 amend） | **EXIT=0**：`99 files / 1862 tests`、`15 warnings / 0 errors`、`lib/ … (281 files, byte-identical)`、`client bundle: 338664 bytes` |
| `settings-page-workflow.png` | 真 Chromium 打开隔离实例的设置页 → **Workflow** 一栏（1500×1000 全页） | ③ 设置页真的渲染出来（并见 §三.3 对「提示条没出现」的说明） |
| 本文件 | 命令、读数、原文引用、`NOT_RUN` 与不符预期之处 | 全部 |

`token.txt`、cookie、克隆报告正文与会话正文**刻意没有拷进来**；本文件与上面的文件里不出现 token、密钥或会话正文。
scratch `.tmp/soak-removed-keys/`（克隆 home、tgz、探针、截图原图、boot 全日志）收尾整棵删除。

## 一、改了什么（一句话）

`REMOVED_CONFIG_KEYS` 的 25 个键不再让整行拒载：`assertKnownKeys` 把它们记进一个模块缓冲（`takeRemovedKeys()`），
`apply()` 的 `readConfig()` 用 `removedKeyWarning(key)` 在载入日志里点名播一次（per-load `Set` 去重），
`resolveConfig` 的返回值不为它们保留任何东西；设置页按同一份名单渲染一条提示（`data-warn="removed"`），
未知键/拼错/非法值/越界数字全部照旧拒载。

## 二、真机安装身份（`CONFIRMED`）

```
$ node scripts/clone-profile.mjs --src ~/.dsh/profiles/web --home .tmp/soak-removed-keys/dsh-home \
    --name web-clone --force
clone-profile: ok — …/profiles/web-clone
  files 7720 -> 7720 (88421847 bytes)
  links 5 (relinked 2, already dangling in the source 1)
  parity 5/5 equal after redaction
  dependencies 17 declared, 0 unresolved (8/21 bundles from the installation)
  credentials redacted: 1 line(s) in 1 file(s); vendored fixtures: 4 file(s)

$ npm pack --pack-destination .tmp/soak-removed-keys      # → dsh-grok-workflow-0.13.37.tgz（158 files）
$ DSH_HOME=<scratch>/dsh-home dsh plugin --profile web-clone add \
    file:<scratch>/dsh-grok-workflow-0.13.37.tgz
Done in 1.8s using pnpm v12.4.2
$ node -p "require('<clone>/node_modules/dsh-grok-workflow/package.json').version"
0.13.37
$ readlink -f <clone>/node_modules/dsh-grok-workflow     # 落在 profile 内 ⇒ 真拷贝，不是软链
$ sha256sum <clone>/node_modules/dsh-grok-workflow/lib/client.js lib/client.js
37298edb81e1afd6cea2be144abac2477938e93ca8e79e061246f2f585343ff5  <clone>/…/lib/client.js
37298edb81e1afd6cea2be144abac2477938e93ca8e79e061246f2f585343ff5  lib/client.js
```

克隆出来的档案里 `grok-workflow` 那一行**本来就带着** `mode: triage`（`cordis.patch.yml:563`，来自 live 档案），
所以「档案留 mode 行」这个前提不是我造出来的——它是真实用户的现状。

## 三、四条读数

### 3.1 ① 这一行照常激活（`CONFIRMED`）

```
$ DSH_HOME=<scratch>/dsh-home dsh --profile web-clone --no-open --host 127.0.0.1 --port 3331
dsh web: http://127.0.0.1:3331/?token=<redacted>
$ grep -c 'did not activate' boot-with-mode.log      → 0
$ grep -c 'pending'          boot-with-mode.log      → 0
$ grep -c 'startup failed'   boot-with-mode.log      → 0
```

`settings/describe`（RPC envelope `{type:"client-request",rpcId,method:"settings/describe",payload:{args:{}}}`）：
**24 个命名空间**，`grok-workflow` 在、`autoGenerate: true`、`applies: "live"`（`describe-with-mode.json`）。
对照旧契约：同一个前提在 0.13.37 上是 `dsh: warning: 1 entry did not activate` +
`grok-workflow (dsh-grok-workflow): Error: removed configuration key "mode": …`
（历史读数见 `docs/knowledge/VALIDATION.md` 的 m3-3 同日条）。**这就是本轮要消灭的症状，现在不出现了。**

### 3.2 ② 日志里有明确警告，且点名 `mode`（`CONFIRMED`，观测方式见 §三.2 的说明）

DSH 0.2.2-rc.3 **不把 cordis `logger.warn` 导出到 stdout**（同一事实早已记在 `docs/knowledge/RESEARCH.md`：
「插件 headless 输出里 cordis logger.warn 不可见」），所以 boot 日志里看不到这行——`removed configuration key`
与插件任何 `config` 警告都搜不到（见 `boot-with-mode.excerpt.txt` 的 grep 计数）。因此这一条用**安装进档案的那份构建**
直接驱动 `apply()`，用一个记录 logger 收下原文：

```
$ node warn-probe.mjs <clone>/node_modules/dsh-grok-workflow/lib/index.js <clone>/cordis.patch.yml
config keys the host would hand over: mode, grokDefault, maxConcurrency, timeoutMs, loopEnabled, loopMaxRounds, loopFailStreak, roles, guardianModel

[warn lines naming a removed key]
configuration key "mode" was removed in an earlier release: its stored value is ignored, and the rest of the row loads
normally (delete that line when convenient). 已忽略已删除的配置键 "mode"：存的值不生效，这一行其余配置照常载入，方便时可把那一行删掉

count: 1
tool registered: true

after two more reads, warn lines naming a removed key: 1
```

三点：**点名 `"mode"`**；**工具注册成功**（`grok_workflow`，即这一行真的活了）；**再去读两次仍是 1 行**
（用工具自己的入口触发两次读取，`readConfig` 每次消息都跑，去重是 per-load `Set`）。原文与全文见
`warn-probe-with-mode.txt`。

### 3.3 ③ 设置面：页面渲染 `CONFIRMED`，提示条 `NOT_OBSERVED`（如实记录）

真 Chromium 打开隔离实例 → 设置 → **Workflow**：整页表单渲染（`data-field` 覆盖 14 个字段 + 5 条角色链），
`console_errors: []`、`page_errors: []`，见 `settings-page-workflow.png`。

同一页面上**没有** `data-warn="removed"` 的提示条，原因是实测出来的、不是猜的：

```
describe-with-mode.json:
  grok_workflow.user_keys = [grokDefault, maxConcurrency, timeoutMs, loopEnabled,
                             loopMaxRounds, loopFailStreak, roles, guardianModel]
  grok_workflow.user_has_mode    = false
  grok_workflow.value_has_mode   = false
```

**宿主的 `user` 层是已经按 schema 过滤过的**：档案补丁里那一行 `mode: triage` 在 `settings/describe` 的 `user` 里
根本不存在（`value` 里同样没有）。于是页面那一半的取数（`entry.user`）在这台宿主上**永远扫不到残留键**——
提示条是「取到了就画、取不到就不画」的诚实实现，但在 DSH 0.2.2-rc.3 上取不到。

这条与派单时的预期（「`entry.user` 仍带 `mode`，页面据此渲染提示」）**不符**，我不写成一个假通过：
页面那一半在产品里已经写好并有用例钉住（`test/config-limits-repair.spec.ts` 的
「client settings page: leftover removed-key banner (D-155)」用一份带 `user.mode` 的文档渲染出两条点名行），
**但在这台宿主上不可见**。要它可见需要一个插件自己的路由把残留键报给页面（README 的下一步写在
`docs/knowledge/VALIDATION.md` 与 `HANDOFF.md`），本轮**没有**做那一步，因为那会新增一条宿主路由面，
而不属于「同一份名单换个播法」这个改动范围。

### 3.4 ④ 对照：删掉 `mode:` 行，警告消失、激活照旧（`CONFIRMED`）

```
$ sed -i '563{/^    mode: triage$/d}' <clone>/cordis.patch.yml
$ node warn-probe.mjs <clone>/…/lib/index.js <clone>/cordis.patch.yml
config keys the host would hand over: grokDefault, maxConcurrency, timeoutMs, loopEnabled, loopMaxRounds,
                                      loopFailStreak, roles, guardianModel
[warn lines naming a removed key]
count: 0
tool registered: true
after two more reads, warn lines naming a removed key: 0

$ dsh --profile web-clone --no-open --host 127.0.0.1 --port 3331     # 重启同一实例
grep -c 'did not activate' → 0；describe → 24 namespaces，grok-workflow 在、autoGenerate: true
```

同一台机、同一份克隆、同一个构建，只差那一行：**警告不是常驻噪音**，它跟着那一行出现和消失，
而激活与工具注册两种情况完全一样。

## 四、没做到 / 没跑的（不美化）

- **`NOT_OBSERVED`**：DSH 的 boot stdout 里那行警告。原因见 §三.2（`logger.warn` 不到 stdout），
  用安装构建 + 记录 logger 顶替，原始句子在 `warn-probe-with-mode.txt`。
- **`NOT_RUN`**：一轮真实模型工作流（`grok_workflow` 真跑一遍）。本轮改的是载入期配置校验，
  真机样本只需要「这一行激活 + 警告 + 对照」，跑模型既不改这个结论又消耗额度；`AGENTS.md` 要求的
  live soak 我会在 §五 明确列为未跑，不写成跑过。
- **不符预期**：§三.3 的设置页提示条在这台宿主上看不到（数据被宿主过滤），原因与下一步已写明。
