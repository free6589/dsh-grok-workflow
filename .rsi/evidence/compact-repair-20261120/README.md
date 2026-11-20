# 存量会话 seq 3553/5424 离线修复（2026-11-20）

`session-3a683cb6` 的两行 `assistant/message`（seq 3553、seq 5424，均为旧版
`workflow-notice` 卸载通知，写在 `step/start` 之外）让 token meter 每次回放都
抛 `token meter: assistant/message at seq 3553 has no matching step/start event`，
`compactNow()` 先测量 → `/compact` 跟着报错。`5fb5da0` 的闸门只防新增、不改历史，
所以这个会话需要一次离线修复。

## 修法（只变形状，不动文字、不动序号）

两行孤儿 `assistant/message` → 同 seq、同 time 的
`plugin:grok-workflow/terminal` 记录（`{v:1, text}`，文字逐字保留）。
`dispose` / `delivery` 记录不动；seq 连续性不变（0–7476）。

## 证据

- `session-3a683cb6-before.jsonl.zstd`：修复前备份（工作区内，原文件已替换）。
- `repair-measure.txt`：真实 DSH 0.2.2-rc.3 `Session.create` + `TokenMeter.measure`
  全量回放：修复前在 seq 3553 抛错；修复后 7507 事件、`totalTokens=508565` 正常通过。
