# 「谁来干」卡里 429 开关那一行：隔离实例 + 用户视角读数（2026-11-25）

验收对象：分支 **`fix/ratelimit-toggle`**（worktree `.tmp/wt-ratelimit-toggle`），基线 `main` 尖端 **`4def476`**，
代码与测试提交 **`534b867`**（`feat(settings): the 429 switch gets a control — the last declared field without one`，
3 文件：`lib/client.js` 21/1、`src/client/index.js` 21/1、`test/client.spec.ts` 99/0）。
环境：Node **v26.8.1**、DSH **0.2.2-rc.3**；隔离 home `.tmp/soak-ratelimit/fresh-home`（`DSH_HOME`，profile **`web-clone`**），
端口 **3327**；headless Chromium（`/usr/bin/chromium`，Playwright/Python，viewport 1500×1000）。
**live `~/.dsh` 与 3080 上的实例全程未写、未重载、未重启。**
口径：`AGENTS.md` §2 的四个状态词。每条结论都能回指下面一个读数或一个文件路径。

## 清单

| 文件（原始位置） | 是什么 | 支撑哪条结论 |
| --- | --- | --- |
| `probe-settings-rows.json`（原 `.tmp/soak-ratelimit/probe-soak.json` + `probe-zh.json`） | 四次读数（英文默认、中文存后、点关、保存后、reload 后）+ 全部 `/api/settings*` 请求与响应体 + 页面异常数组 + 装上的构建哈希与版本 | ① 这一行在两个语言里都真的画出来了，文案取自字典；② 点击写的是 `set switchOnRateLimit=false`；③ reload 后仍是关；④ 全程 0 条页面异常 |
| `shot-roles-card-en.png` | 「谁来干 / Who does what」整卡（英文，默认值） | 行长在 Guardian 之后、五条角色链之前；开关在 On |
| `shot-roles-card-zh.png` | 同一张卡（中文，保存后 reload 的页面） | 中文行文案、开关在「关」、提示文字 |
| `shot-settings-workflow-en.png` / `-zh.png` | 设置面板整屏（左栏含 **Workflow / 工作流**，右栏是这张卡） | 设置页确实由插件的命名空间撑起来，不是别处 |

**scratch 的处置**：`.tmp/soak-ratelimit/`（含 `dsh-home`、`fresh-home`、`probe-home`、探针脚本、`boot*.log`、`url*.txt`）
全部在 gitignored 的 `.tmp/` 下，收尾时删除。**本目录只保留上面五个文件**；带页面 token 的 `url.txt`、凭据文件、会话正文
**刻意没有拷进来**，本 README 里也不出现 token、会话正文或凭据。

## 一、改了什么（一句话）

设置页「谁来干」卡里，`switchOnRateLimit`（默认 `true`）从「有文案没控件」变成一行真控件：`FieldRow` + `Toggle` + 提示段，
形状与 `replan`/`loopEnabled` 两行逐处对应；状态词复用页面已有的一对 On/Off（`option.replan.on` / `option.replan.off`），
**没有新增任何文案键**，`src/config.ts`、schema、默认值都没动。

## 二、门禁与构建（本 worktree）

`npm run build`：

```
client bundle: 331626 bytes → lib/client.js
```

```
$ git show 4def476:lib/client.js | wc -c
330313
```

**＋1313 字节**。

定向测试 `TMPDIR=$PWD/.tmp npx vitest run test/client.spec.ts test/i18n-parity.spec.ts test/config.spec.ts test/settings-projection.spec.ts`：

```
 ✓ test/client.spec.ts (144 tests) 448ms
 ✓ test/config.spec.ts (50 tests) 115ms
 ✓ test/settings-projection.spec.ts (4 tests) 21ms
 ✓ test/i18n-parity.spec.ts (6 tests) 8ms

 Test Files  4 passed (4)
      Tests  204 passed (204)
```

`EXIT=0`。反向验证：把新增的控件块临时摘掉、重建后，`-t "429 switch"` 的两条与 `-t "declared field"` 的总守卫一起变红
（`zh switchOnRateLimit has no row`），恢复后转绿。

## 三、真机读数

### 环境

| 项 | 读数 |
| --- | --- |
| 隔离 home | `.tmp/soak-ratelimit/fresh-home`（`DSH_HOME`），profile **`web-clone`** |
| profile 来源 | `dsh --profile web-clone --from-default-profile web`，再 `dsh plugin --profile web-clone add <packed tgz>` |
| 装上的版本 | `node -p "require('<profile>/node_modules/dsh-grok-workflow/package.json').version"` → **`0.13.36`** |
| 装上的字节 | `sha256(lib/client.js)` = **`f9408813d6312cecf1996a23245966ea7ce09a152a029f6d5311fe379f7f7ad0`**，与 worktree 的 `lib/client.js` **逐字节相同**（拷进 profile，不是软链） |
| 工作流 provider | profile patch 里 `- id: workflow-ptc … disabled: false`（web 层默认禁用，插件需要 `workflowEngine`） |
| 端口 | **3327**（`dsh --profile web-clone --host 127.0.0.1 --port 3327 --no-open`） |
| 模型回合 | **NOT_RUN**：隔离 profile 按设计不带凭据，本轮也不需要 |

### 读数一：英文行（默认值 `true`）

```
label        Switch model on 429
开关状态      aria-checked="true"，状态词 On
提示文字      On by default: a rate-limited (429) route advances to the next model in the chain.
             Off: only the other failure classes advance, and a 429 keeps the route for the task retry.
```

行结构与字典一致（`field.switchOnRateLimit` / `field.switchOnRateLimit.hint`），`data-field="switchOnRateLimit"` 落在行 wrapper 上，
`data-gw-ratelimit-hint` 落在提示段上。截图 `shot-roles-card-en.png`。

### 读数二：中文行（保存 `false` 后 reload 的页面）

```
label        限流（429）时换模型
开关状态      aria-checked="false"，状态词 关
提示文字      默认打开：限流（429）时换到链上的下一个模型。关掉后只有其它失败类别换人，429 留在原路由交给任务重试。
```

截图 `shot-roles-card-zh.png`。中文是**通过设置服务把 `locale.preference` 设成 `zh` 后 reload** 读到的
（`settings/mutate` → `{"ok":true}`，页面 `document.documentElement.lang` 变成 `zh-CN`），不是按字典脑补。

### 读数三：点一下 → 保存 → 落盘

点这一行的 `role="switch"` 后行内状态词从 `On` 变 `Off`、`aria-checked` 从 `true` 变 `false`；点 `Save` 之后，
客户端发出（原文）：

```json
{"type":"client-request","rpcId":"2fd10b60-8d7a-4ebc-87ce-5e0dc8108678",
 "method":"settings/mutate",
 "payload":{"args":{"ns":"grok-workflow","ops":[{"op":"set","path":["switchOnRateLimit"],"value":false}],"expectedRevision":0}}}
```

隔离 profile 的 `cordis.patch.yml` 里随即出现：

```yaml
- id: grok-workflow
  name: dsh-grok-workflow
  config:
    switchOnRateLimit: false
```

**保存真的落盘了**（不是只在内存里改了个开关）。

### 读数四：reload 后仍是关，页面不报错

`page.reload()` → 重新进 Settings → Workflow：该行 `aria-checked="false"`、状态词 `Off`，提示文字不变；
整段探针期间 `pageerror` 数组为空（`probe-settings-rows.json` 的 `page_errors: []`）。

## 四、与派单的偏差（如实记）

1. **隔离档案不是「克隆 live 的 web 档案」，而是「用出厂 web 模板新建 + 真装本 worktree 的构建」。**
   照派单先跑了 `node scripts/clone-profile.mjs --src ~/.dsh/profiles/web --home .tmp/soak-ratelimit/dsh-home --name web-clone`
   （`files 7720 -> 7720`、`parity 5/5`、1 行凭据按设计脱敏），删掉克隆里被移除的 `mode: triage`，把本 worktree 的构建拷进克隆的 profile
   （`sha256(lib/client.js)` 一致）。但那套克隆上，`POST /api/settings/describe` 的命名空间里**始终没有 `grok-workflow`**
   （22 个命名空间；同时插件自己的 client bundle 也没被页面请求过），因此没有「Workflow」这一栏可打开。
   换用 `--from-default-profile web` 新建的隔离 profile 真装 tgz 之后，同一个 `describe` 是 **23 个命名空间，含 `grok-workflow`**
   （`autoGenerate: true`）——页面才出现。克隆与模板两条路的差别没查到根因，本轮**只记录现象**，不写成结论；
   真机读数全部来自后者。
2. **中文不是点页面上的语言选择器切出来的**，而是对 `locale` 命名空间写 `preference: zh` 后 reload（见读数二）。
   页面文案本身仍是由页面自己的字典渲染的，读数没有造假。
3. 除此之外照派单执行：只改 `src/client/index.js`、`test/client.spec.ts`、`lib/client.js`；没加文案键；没动 `src/config.ts` 与 schema；
   没 push、没打 tag、没改版本号、没碰 live `~/.dsh`、没重启 3080。

## 五、这份证据里没有什么

不含任何 API key、页面 token、凭据或会话正文。请求体只摘了 `/api/settings/describe` 与 `/api/settings/mutate`；
截图只有设置面板与那张卡，不含地址栏与凭据页。带 token 的 `url.txt` 没有拷进来，`boot*.log` 与克隆报告也没有拷。
