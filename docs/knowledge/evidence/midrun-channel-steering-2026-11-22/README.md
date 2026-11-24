# 证据 — 跑中通道转向的地基事实（2026-11-22）

配套设计：`docs/knowledge/DESIGN-midrun-channel-steering.md`（附录 A 逐条引用本目录的抓取）。

抓取方式全部是本机只读命令，没有改任何文件、没有读凭据。采样时间 2026-11-22 18:15–18:25 +08:00。

| 文件 | 证明什么 |
| --- | --- |
| `guest-globals.txt` | 脚本沙箱由 `vm.createContext({})` 建，只注入 `agent / parallel / pipeline / phase / log / args` |
| `engine-channel.txt` | `args` 起跑时 `structuredClone`；host 侧对运行只有整轮 `cancel(reason)` |
| `gate-cancel-path.txt` | 同一会话跑中新消息走「整轮 cancel + 窄重启」，旧需求与新需求由 `carriedPendingRequest()` 拼接 |
| `tool-scope.txt` | 插件用 `ctx.tools.register` 注册工具；现有工具对子代理可见（故显式拒绝子代理）；子代理只在给了 `toolFilter` 时收窄工具集 |
| `script-realm.txt` | 脚本侧注释同样写明 realm 无 `setTimeout`；波调度入口 `runWaves()` |

复现命令（在仓库根执行）：

```bash
grep -o "const globals = {[^}]*}" node_modules/@deepseek-ai/dsh-workflow-ptc/lib/index.js
grep -o 'vm\.createContext({}[^)]*)' node_modules/@deepseek-ai/dsh-workflow-ptc/lib/index.js
sed -n '636,642p' node_modules/@deepseek-ai/dsh-workflow-ptc/lib/index.js
sed -n '272,290p' node_modules/@deepseek-ai/dsh-workflow-ptc/lib/index.js
sed -n '1374,1392p' src/gate.ts
sed -n '826,834p' src/gate.ts
sed -n '252,262p' src/index.ts
sed -n '338,346p' "$(npm root -g)/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-subagent/lib/index.js"
sed -n '103,110p' src/script.ts
```

结论只有一条在设计里起作用：**host 没有任何办法往运行中的 workflow 脚本推东西**，
波边界拉取是唯一不碰 DSH core 的通道。
