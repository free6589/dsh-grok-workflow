# H1 findings：裸 virtual-key / unknown / model-unavailable 分类钉子（只观察，不改代码）

> 基线 HEAD=4849bdfcd9abe178a95fc1983d6a034430521468，分支 fix/h1-virtualkey-16。
> 以下为全仓 grep 命中清单（前 20 条，含行号）。HYPOTHESIS：裸 virtual-key 落 unknown → 应为 model-unavailable；修法 NOT_RUN。

## 1) `virtual key` 命中（裸 key 拒绝原文）

1. `test/child-evidence.spec.ts:42` — `401: {"message":"virtual key is required."}`, code AUTH
2. `test/child-evidence.spec.ts:158` — 断言短语含 `virtual key is required`
3. `test/planner-resubmit.spec.ts:255` — sessionFailure `401 virtual key is required`, code AUTH
4. `test/null-collapse.spec.ts:102` — `401 virtual key is required. Provide a virtual key via the x-bf-vk header.`
5. `test/null-collapse.spec.ts:111` — `401 virtual key is required.`
6. `test/null-collapse.spec.ts:371,382` — reason 含 `virtual key is required`
7. `test/dead-routes.spec.ts:558` — sessionFailure `401 virtual key is required`, code AUTH
8. `src/child-evidence.ts:12` — 注释 `401: {"message":"virtual key is required…"}`
9. `docs/knowledge/VALIDATION.md:1389` — `failureClass model-unavailable` + 理由逐字带 `401 Unauthorized: virtual key is required`
10. `docs/knowledge/VALIDATION.md:3353,3367` — 真机 4 worker 死于 `401 virtual key is required`, code AUTH

## 2) `model-unavailable` 分类钉子

11. `src/child-outcomes.ts:214` — `status 401/403/404 → 'model-unavailable'`
12. `src/child-outcomes.ts:257` — 模型正则（unknown model / no adapter 等）→ `model-unavailable`
13. `src/child-outcomes.ts:261` — `40[13]/unauthorized/forbidden/invalid api key…` → `model-unavailable`
14. `src/child-outcomes.ts:186-198` — AUTH/MISSING_CREDENTIAL/UNKNOWN_MODEL 等码表 → `model-unavailable`
15. `src/script.ts:782,788` — 同上两条正则的宿主侧镜像（guest/host 两张表）
16. `src/script.ts:962` — `refusalDeath(failure)`: `class === 'model-unavailable'` 且非 setup 故障

## 3) `unknown` 兜底钉子

17. `src/child-outcomes.ts:236` — `stop max-tokens/refusal → 'unknown'`
18. `src/child-outcomes.ts:263` — 分类兜底 `return 'unknown'`
19. `src/script.ts:785` — 注释：最常见拒绝被归为 `unknown`
20. `src/script.ts:795,824` — 兜底 `return 'unknown'`；`failureClass unknown → routeHealth unknown`

## 观察（不改代码）

- 裸 `virtual key is required` 文本命中多为 401+AUTH 场景；分类链上 401/403/AUTH 已有明确 `model-unavailable` 路径（11–16）。
- H1 关注点是**无状态码、无 AUTH 码的裸 key 文本**是否会滑入 17–20 的 `unknown` 兜底，需用最小复现钉死（NOT_RUN，本包不做）。
- 157 会话佐证与修法均不在本包内；本包仅收录基线与分类点清单。
