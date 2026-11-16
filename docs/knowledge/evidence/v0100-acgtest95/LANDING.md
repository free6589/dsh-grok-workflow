# v0.10.0 真机验收证据（profile `acgtest95` / 端口 `:3231`，2026-11-17）

- **实例**：`DSH_HOME=<repo>/.dsh-home/acgv095`、profile `acgtest95`、`--host 127.0.0.1 --port 3231 --no-open`、
  宿主 `dsh 0.2.2-rc.3`、模型路由为机器本地网关 `127.0.0.1:18088`（`apiKeyEnv: BIFROST_VIRTUAL_KEY`，
  键值只在环境里，本目录不含任何凭证）。
- **安装**：`npm pack` → `.tmp/v095/dsh-grok-workflow-0.9.4.tgz`（472,958 B，82 files）→
  `dsh plugin --profile acgtest95 add file:…`（exit 0）→ 已装 `lib/client.js` md5
  `d1e2df8ccd5e0337d58f2c805bd6521d` 与仓库同名文件一致。
- **复现**：本目录 `patch.yml` 即当次 overlay（8 键 + `workflow-ptc` 重启用）；
  `probe7.py` / `step-settings2.py` / `step-interact.py` / `step-interact2.py` / `step-settle.py`
  为当次 chromium(playwright) 驱动，URL 从环境变量 `DSH_URL` 读取（token 不进脚本）。
- **截图**：
  - `01-home.png` — 新装实例首页，模型显示 `DeepSeek V4.1 Flash (cn)`（overlay 生效）。
  - `07-builtin-plugins.png` — Plugins 页列出 **Grok workflow**（插件确实激活）。
  - `09-grok-settings.png` — 8 键设置页：开关 On / Mode auto / 五角色链（含 Supervisor）/ 两数字 + Save。
  - `12-progress-tab.png` — 运行 1：7 段进度脊，`3/3 · 100%`，`scrollW == innerW`。
  - `21-run2-progress.png` — 运行 2（进行中）：Synthesize `0/1 · 1 running`，单分支展开。
  - `32-run2-final-chat.png` — 运行 2 收尾：首答 7s + 后台「1/1 项任务已由独立检查核验」。
- **台账（本地，不入库）**：`.dsh-home/acgv095/memory/grok-workflow/archive.jsonl`
  末条 = `run:eef1f4b7-7f1d-442b-96af-438a82f09c47` `status=completed` / verified 1/1 /
  confirmed 6 criteria / task `weather-3cities-summary`。
- **已知缺口**：`Execute` / `Verify` 段渲染为 `Not reported in the events`（`members=0`），
  与台账"已执行并核验"矛盾；归因未定（见 VALIDATION Round 47）。
