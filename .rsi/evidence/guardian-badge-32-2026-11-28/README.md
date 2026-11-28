# Guardian 徽标两处验收问题 · 修复证据（fix/guardian-badge-32）

- 日期：2026-11-28 · 级别：CONFIRMED（源码 + 真实 Chromium 实测）
- 分支：`fix/guardian-badge-32`（从当前工作区状态建，含原来那堆徽标改动，只修不合并不 push）
- 上一轮验收的两个毛病：
  1. 新守卫小方块压住了原来的状态字（重叠约 140 平方像素）——已挪开，两者并排不压。
  2. 点开详情后字挤成一竖条（宽只有 28 像素）——详情弹层已恢复正常宽度（和原来大块差不多宽），字横排。

## 1. 修了什么（只动 `src/client/progress-tab.js` 三处样式，其余是重建产物 + 测试断言）

| # | 改动 | 为什么 |
| --- | --- | --- |
| 1 | `.gw-progress-corner`：`position: relative` → `static`，`margin-inline-start: -2px` → `0`（另加 `margin: 0; align-self: center`） | 负边距把 14px 小方块往状态胶囊身上拉了 2px，是压住状态字的直接原因。静态流 + 零边距后小方块只占页头 `gap` 里的自己那一格，与胶囊并排不压 |
| 2 | `.gw-progress-details`：加 `align-self: stretch; width: 100%; box-sizing: border-box`（保留 `flex: 1 0 100%`） | 详情层是页头第二行整行。原来只有 `flex-basis: 100%`，一旦被外部写成窄 `width`（如验收看到的 28px）整块就被挤成一竖条；现在整行宽度钉死，和原来大块同宽，字横排 |
| 3 | 新增 `.gw-progress-guardian-blocks > * { min-width: 120px; }`（网格仍是两列，`repeat(2, minmax(0, 1fr))` 不动） | 极窄祖先下格子会被压到几个像素宽、字竖排。子项最小 120px 后窄屏是整体换行不断字，不再出现一字一行的竖条 |

测试里新钉了三条样式断言（`test/client.spec.ts` 徽标用例内）：
`corner` 无负边距（`margin-inline-start: 0` 且不含 `-`）、`details` 整行（`flex: 1 0 100%` + `width: 100%`）、格子保底（`blocks > * min-width: 120px`）。
原有 14px 方块尺寸断言与 `grid-template-columns: repeat(2, …)`、`grid-column: 1 / -1` 断言原样保留。

门禁约束守住：全部规则仍以 `.gw-progress` 开头、无字面色值（token 写法不变）、页面顺序 header → figure → Guardian → dock 不变（只改了三条样式，没动结构）。

## 2. 复现与验证（真实 Chromium headless + 真实 shipped bundle 渲染）

量法：`src/client/index.js` 用测试同款 stub React 渲染真实页头（含 badge + details + Guardian 四格）→ 静态 HTML 内联 shipped CSS → 三档视口实测 `getBoundingClientRect`。

| 视口 | 徽标 rect | 状态胶囊 rect | 重叠徽标×胶囊 | 重叠徽标×运行名 | 详情宽 / 页宽 | Guardian 宽 | 格子宽 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1440 | (1422, 18, 14, 14) | (1341.98, 12, 70.02, 26) | **0** | **0** | 1432 / 1440 | 1432 | 699 / 699 / 699 / 1404 |
| 760 | (742, 18, 14, 14) | (661.98, 12, 70.02, 26) | **0** | **0** | 752 / 760 | 752 | 359 / 359 / 359 / 724 |
| 420 | (482, 18, 14, 14) | (401.98, 12, 70.02, 26) | **0** | **0** | 492 / 500 | 492 | 229 / 229 / 229 / 464 |

- 徽标 14×14 与胶囊同排（y 18 vs 12，同属页头第一行），运行名宽 1327.98（1440 下）无被压。
- 详情层与 Guardian 同页宽（只差页头左右 padding），字横排：`.gw-progress-count` 首格值 `w=211`（420 下一行字宽，非一字一列）。
- 对照：验收说的 28px 窄条是病态（给 details 写死 `width:28px` 可复现出一竖条）；修复后正常渲染三档全是整行宽。

## 3. 门禁（逐字命令 + 结果）

```text
node scripts/assemble-client.mjs        # EXIT 0（fragments → src/client/index.js）
cmp lib/client.js src/client/index.js   # 无输出，EXIT 0
npx tsc --noEmit                        # EXIT 0
npm run lint                            # 14 warnings, 0 errors（与基线一致，均为既有）
npx vitest run test/client.spec.ts test/progress-panel.spec.ts
# Test Files 2 passed (2) · Tests 211 passed (211)
```

## 4. 提交

- 只提交到本分支 `fix/guardian-badge-32`，不合并 main、不 push。
- 本次改动文件：`src/client/progress-tab.js`（3 处样式）→ 重建 `src/client/index.js` + `lib/client.js` → `test/client.spec.ts`（+5 行断言）。`src/client/i18n.js`、`test/progress-panel.spec.ts` 的其余 diff 是建分支时带过来的上一轮改动，未动。
- 工作区 `.tmp/badge32/` 为本次量测草稿（gitignored），未提交；`git status --short` 无 `*.log/*.tgz/*.bak` 残留。
