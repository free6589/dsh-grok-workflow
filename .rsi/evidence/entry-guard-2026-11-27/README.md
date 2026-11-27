# entry-guard 390 证据（2026-11-27，分支 fix/entry-guard，基线 99a4088）

- `390-entry-guard.png`：可复现烘焙（chromium headless，viewport 390x460，底板 `.tmp/eg-bake/strip.html`，未提交）。
  按宿主折叠公式 `visibleViewLimit = max(1, floor((390-48)/120)) = 2`（chat 首位，其余按 order 取前 2）画出三格：
  chat order 0（首位）+ grok-progress order 5（390 可见，一次点击即达）+ trajectory order 10（折叠）。
- 烘焙命令：`chromium --headless=new --disable-gpu --hide-scrollbars --window-size=390,460 --screenshot=.rsi/evidence/entry-guard-2026-11-27/390-entry-guard.png "file://$PWD/.tmp/eg-bake/strip.html"`。
- 先红：`npx vitest run test/progress-entry.spec.ts` → 1 failed / 5 passed（`expected [ 'chat', 'host-new-view' ] to include 'grok-progress'`）。
- 后绿：同命令 → 7 passed；轻门禁 `tsc 0错 / oxlint 17w0e / 4 files 297 passed`。
- 未做：隔离家目录真机 soak（本轮以烘焙 PNG + spec 守卫代替，见 VALIDATION 本轮条）。
