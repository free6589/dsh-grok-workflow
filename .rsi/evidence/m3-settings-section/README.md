# Settings placement (M3.3 follow-up) — evidence

Build: `feat/m3-delete-gate` + the settings commit, version 0.13.34.
Real machine: DSH 0.2.2-rc.3, Node v26.8.1, scratch home `.tmp/m3-settings-soak/dsh-home`
(clone of the live web profile), plugin installed from the worktree, port 3317,
headless Chromium via Playwright. Live `~/.dsh` untouched; scratch deleted afterwards.

| file | what it shows |
| --- | --- |
| `01-settings-panel.png` | the Host Settings panel's left column: 通用设置 / 模型 / 内置插件 / 生图配置 / Agent 预设 / 按模型配置提示词 / LLM 错误重试 / 会话修复 / **Workflow** / 打开配置文件 |
| `02-workflow-section.png` | the `Workflow` section selected, page top: master switch, role chains |
| `03-workflow-bottom.png` | the same page bottom: the heartbeat template, the version card, the fixed 保存 / 放弃修改 / revision footer |
| `04-plugins-card.png` | the Plugins page still carries the `Grok workflow` card — one page, two entry points |

Migration note recorded while taking these: the cloned profile still carried the
removed key `mode: triage`, so the first boot logged `removed configuration key
"mode": … delete it from your patch` and skipped that row. Deleting the line in the
scratch copy made the plugin activate. **The live profile has the same line**
(`~/.dsh/profiles/web/cordis.patch.yml:563`), so it must be deleted before upgrading
to this build, or the workflow will not mount.
