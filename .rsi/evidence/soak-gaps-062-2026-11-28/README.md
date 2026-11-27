# 证据目录：soak-gaps-062-2026-11-28

- 证据目录路径：`.rsi/evidence/soak-gaps-062-2026-11-28/`
- 所属任务：dispatcher-soak-gaps-05（包工头S 读屏三态补测）下证据小工（agent-3）
- 采集时间：2026-11-28T00:14+08:00（Asia/Singapore）
- 工作目录（worktree）：`/home/fish/projects_mine/dsh-grok-workflow/.tmp/wt-soak-gaps-062`

## 基线

- 基线 SHA：`3f26b7128ffcaecc7063d6f0a59f36c9dc3832c1`（`git rev-parse HEAD` 实测，EXIT=0）
- 分支名：`fix/soak-gaps-062`（`git branch --show-current` 实测）
- 工作树状态：`git status --short --branch` 仅显示分支行 `## fix/soak-gaps-062`，无其他改动输出（干净）

## 命令清单（含逐字命令与 EXIT）

见 `transcript.md`。本小工实际执行的只读命令：

1. `pwd; git rev-parse HEAD; git branch --show-current; ls -la .rsi/evidence/ | head -n 50; echo "---"; ls .rsi/evidence/soak-gaps-062-2026-11-28/` — EXIT=2（末尾 `ls` 目标目录尚不存在，属预期；其余命令成功，基线 SHA 已确认）
2. `git rev-parse HEAD; echo "EXIT=$?"` — EXIT=0，输出 `3f26b7128ffcaecc7063d6f0a59f36c9dc3832c1`
3. `mkdir -p .rsi/evidence/soak-gaps-062-2026-11-28 && ls -ld ...; git branch --show-current; git rev-parse HEAD; git status --short --branch | head -n 20; ls .tmp/` — 目录创建成功；分支 `fix/soak-gaps-062`；SHA 同上；`git status` 干净；`.tmp/` 不存在（`ls .tmp/` 报错属预期，无 scratch 可清）
4. `git check-ignore -v .tmp` — EXIT=1（`.tmp` 被 `.gitignore` 第 28–29 行忽略，`check-ignore` 对"被忽略路径返回匹配行"的反向表述：此处 EXIT=1 且无输出表示……见下文读数说明）
5. `git check-ignore -v .rsi/evidence/soak-gaps-062-2026-11-28` — EXIT=1（证据目录未被忽略，可正常落盘版本控制）
6. `grep -n "tmp\|rsi" .gitignore | head -n 20` — EXIT=0，确认 `.gitignore` 第 28 行注释 TMPDIR，第 29 行 `.tmp/`

> 说明：`git check-ignore -v <path>` 对"被忽略"的路径打印规则并 EXIT=0；对"未被忽略"的路径无输出 EXIT=1。
> 实测 `.tmp` 返回 EXIT=1 且无输出——按 git 语义这表示 `.tmp`（空路径、目录尚不存在时按字面匹配）未命中忽略规则。
> 但 `.gitignore` 第 29 行明确写有 `.tmp/`，目录一旦创建即被忽略；本小工未创建 `.tmp/`（无 scratch 需求），故无残留可清。
> 该条不影响结论，仅如实记录。

## 读数（readings.json）

- `readings.json` 记录上述命令的结构化读数：基线 SHA、分支、工作树干净、证据目录已建、`.tmp/` 未使用。
- 无 PNG：本次无读屏/截图类读数，不生成图片。

## 团队内走读小工与三态小工产出摘要

- 走读小工（dispatcher-soak-gaps-05/agent-1，自动化等价走读）：**已完成**（包工头 2026-11-28 转交结果，本小工未独立复跑、如实转录，不代编）：
  - typecheck EXIT 0
  - progress-screen-walk.spec 5/5 PASS（306ms）
  - client.spec 153/153 PASS
  - DOM 序：bar < run < chip(role=status) < line < count < figure(role=group) < wires < pnodes(ol) < pnode×5 < li < dock
  - 证伪 ASSERT-FAIL：graph role navigation vs 实际 group，EXIT 1
  - NOT_RUN：真人读屏 / Safari / 真浏览器渲染、全量 ci
- 三态小工（dispatcher-soak-gaps-05/agent-2，三态 soak 补测）：**已完成**（包工头 2026-11-28 第二轮转交结果，本小工未独立复跑、如实转录，不代编）：
  - 基线 3f26b71（与本目录基线前缀一致）
  - clone-profile：web 7764 文件 parity 5/5、密钥已脱敏；headless 4 文件 parity 4/4
  - 密钥探针：BIFROST_VIRTUAL_KEY=PRESENT，AGENT2API/DEEPSEEK=MISSING
  - 确定性门禁：4 文件 20 测试 PASS（单跑曾因缺 `.tmp` 目录 FAIL，`mkdir` 后过）
  - 源码三态：waiting/running/done 推导存在
  - 真模型两轮 error 终轮（MISSING_CREDENTIAL → NO_ADAPTER），waiting/running/done 真机均 BLOCKED、未出现
  - 证伪 F1：真模型三态不可跑；F2：scratch 插件为 0.13.61、非本树构建
  - 红线：live 未碰、scratch 已删

## NOT_RUN / BLOCKED

- NOT_RUN：soak 运行读数 PNG（本次无读屏类操作，无需截图）；真人读屏/Safari/真浏览器渲染、全量 ci（走读小工转交结果中明确 NOT_RUN）；真模型 waiting/running/done 真机呈现（三态小工转交结果中明确 BLOCKED 未出现）。
- BLOCKED：真模型 waiting/running/done 真机呈现（MISSING_CREDENTIAL → NO_ADAPTER，无真模型适配器，waiting/running/done 真机均未出现；转交自三态小工结果）。本小工职责范围内无其他阻塞。

## 证伪条目

1. “证据目录已存在故复用”——证伪：采集前 `ls .rsi/evidence/soak-gaps-062-2026-11-28/` 返回“No such file or directory”（EXIT=2），目录为本小工新建，不存在复用第二份的问题；全树唯一一份。
2. “工作树有未提交改动污染基线”——证伪：`git status --short --branch` 仅分支行、无文件改动，基线干净。
3. “scratch 残留未清”——证伪：本小工未创建 `.tmp/`（`ls .tmp/` 证实不存在），且 `.gitignore` 第 29 行 `.tmp/` 覆盖 scratch 隔离要求；无残留。
4. “代编了兄弟小工数据”——证伪：走读/三态数据均为包工头转交的 agent-1/agent-2 最终结果（本小工仅转录、已注明来源，未独立复跑）；未虚构任何数据。
5. 补录记录：2026-11-28 包工头先后转交走读小工(agent-1)、三态小工(agent-2)完成结果后各补录一版，均仅改本证据目录 README + readings.json；基线 SHA、分支、本小工命令清单不变。

## 约束遵守声明

- 未写代码、未改源码/测试/文档/产物；除本证据目录外未动其他文件。
- 活动范围仅限 worktree `/home/fish/projects_mine/dsh-grok-workflow/.tmp/wt-soak-gaps-062` 内。
- scratch 只用 gitignored `.tmp/`（本次未使用，无需清理）。
