# 证据：S1 逐字引文关（绕闸钉子）

采集者：`dispatcher-s1-nail/evidence-worker`（证据小工；只读产品代码，未改一行产品代码，未提交，未跑全量 ci，未碰 live）
采集时间：2026-11-28 04:30–04:47 +08:00
采集地点：worktree `/home/fish/projects_mine/dsh-grok-workflow/.tmp/wt-s1-21`，分支 `fix/s1-quote-21`
结论：钉子**红→绿成立**，但红只有 **2/14**——基线错的是「整句被折行/多空格挡回去」这两条假阴（把真同意判成没同意），不是「切词能绕过引文关」。另外 12 条基线本来就对，作用是回归钉，不是新机制。门禁两命令全绿（`tsc EXIT=0`、`lint EXIT=0`）。

## 1. 基线与分支

| 角色 | SHA | 说明 |
| --- | --- | --- |
| 基线（`origin/main`） | `ae787501ddf2382b58119112ac5088c48e16cc90` | `git rev-parse origin/main`；也是本分支 HEAD |
| 分支 | `fix/s1-quote-21` | 工作树 `.tmp/wt-s1-21`；`git status --short --branch` = `## fix/s1-quote-21...origin/main`，**尚无提交**，改动全在工作区 |
| 本地 `main` 尖端 | `e19e8e2d25e7de50b5ad7cfdbec9b11269ba3219` | 另一块（deadcode 合流）在采集期间推进的本地提交，尚未推送；`ae78750` 仍是它的祖先，本分支基线未变 |

本分支含改动：`src/block/{index,preview,tools}.ts`（+29/−3，`preview.ts` 26+2、`tools.ts` 2+1、`index.ts` 1+0）、`lib/block/*` 重建产物（+56/−13，`npm run build` 产出、无手改）、`docs/ARCHITECTURE.md` 一行（1+1）、新增未跟踪 spec `test/s1-quote-21.spec.ts`（189 行 / 14 its）。`git diff --stat` = **15 文件 +86/−17**（未跟踪的 spec 不计入，故实际新增行数大于 86）。

## 2. 钉子结论（`CONFIRMED`）

钉子文件：`test/s1-quote-21.spec.ts`（新建，未跟踪）。分两组 14 例：

| 组 | 例数 | 钉什么 |
| --- | --- | --- |
| `CARVED-QUOTE：不是整句就拒绝` | 9 | 从原话里切词、只取片段、拆到两条消息、打乱词序、只回礼貌话——只要不是整句连续出现，一律 `approval-required`；拒绝时账本一行不写 |
| `WHOLE-QUOTE：整句逐字就放行引文关` | 5 | 整句原样（含前后寒暄）放行；`approved=false` 时应停在第五道 `not-approval`；**折行**与**词间多空格**也算整句 |

改动机制（`src/block/preview.ts` 新增导出 `carriesQuote`）：把消息与引文各自去掉空白后做**连续子串**判定，`startBlock` 第四道关与 `tools.ts` 里「引文命中哪条消息、定 approval.kind」的查找都改用它；`docs/ARCHITECTURE.md` 第 4 道关的描述同步改成「one contiguous run, whitespace aside」。判据仍是子串，不是按词命中——这是「切词不能绕过」的那一半。

### 红→绿（本人实跑，不是转抄）

| 阶段 | 命令 | 结果 |
| --- | --- | --- |
| 红（基线 `ae78750`，detached 临时 worktree，同一份 spec） | `npx vitest run test/s1-quote-21.spec.ts` | **2 failed / 12 passed (14)**，`EXIT=1` |
| 绿（`fix/s1-quote-21` 工作区，改后） | `npx vitest run test/s1-quote-21.spec.ts` | **14 passed (14)**，`EXIT=0` |

基线那 2 条红是且只是：

- `整句逐字但折了行（复制预览时常有的折行）→ 放行` —— `expected 'approval-required' to be 'not-approval'`（`spec.ts:183`）
- `整句逐字但词间多了空格（打字习惯）→ 放行` —— 同样 `approval-required` ≠ `not-approval`（`spec.ts:187`）

基线代码是 `message.includes(quote)`（基线 `ae78750` 树的 `src/block/preview.ts:548`），所以「折行/多空格」这种**同一句话的打字差异**被当成没说过，真同意被挡回来。改后空白差异不再是拒绝理由；标点、词序、缺字仍然算不同句子。

### 诚实口径（重要）

1. **红只有 2 条**：14 例里 12 例在基线就过——9 条 CARVED 本来就全拒（`includes` 已经不给片段留口），另 3 条整句/寒暄/落行也过。所以钉子钉住的真实缺陷是**假阴**（真同意被误拒），不是**假阳**（切词绕过）。把「机制存在」说成「基线能绕过」是不诚实的，这里不这么说。
2. 包工头转来的红数是「2 failed / 9 passed」（11 例），那是 spec 早期草稿的规模；交付的 14 例版本由我在基线实测为 **2 failed / 12 passed**。两个数不矛盾，口径以上面实测为准。
3. 新增 3 条（寒暄、落行、approved=true 写账本）是绿侧钉子，作用是防止以后把「整句放行」改坏，不冒充修好的缺陷。
4. 相关旧 spec（`block-intake` 等）包工头报 **170 passed**；我**没有**复跑（`NOT_RUN`，转抄并标注）。
5. `npm run verify:lib` **`NOT_RUN`**：它比对的是已提交树，本工作区改动全未提交，跑了只会报不一致、不构成证据；留给落盘/发版门禁跑。

## 3. 门禁结论（`CONFIRMED`，本人复跑，与门禁小工两遍一致）

| 命令 | EXIT | 输出要点 |
| --- | --- | --- |
| `npx tsc --noEmit` | **0** | 零输出（0 行） |
| `npm run lint`（`oxlint src test`） | **0** | `Found 17 warnings and 0 errors.` / `205 files` / `96 rules`；新增 spec 零告警 |

`17 warnings / 0 errors` 与门禁小工两遍同值；本人实跑只见 `205 files`，基线文件数（转抄为 204）**未单独复量**，故只认「警告数未因新 spec 增加」这一点，不把 204→205 当实测。门禁小工第一遍与第二遍均为 `EXIT=0`；本人第三遍独立复跑同值，故该结论不是单方自报。

## 4. 命令 + EXIT 表（逐字见 `commands.log`）

| # | 命令 | EXIT | 结果 |
| --- | --- | --- | --- |
| 1 | `git rev-parse origin/main` | 0 | `ae787501ddf2382b58119112ac5088c48e16cc90` |
| 2 | `git status --short --branch` | 0 | `## fix/s1-quote-21...origin/main` + 15 M + 1 `??` |
| 3 | `npx vitest run test/s1-quote-21.spec.ts`（临时 worktree @ `ae78750`） | 1 | 红：2 failed / 12 passed (14) |
| 4 | `npx vitest run test/s1-quote-21.spec.ts`（本工作区，改后） | 0 | 绿：14 passed (14) |
| 5 | `npx tsc --noEmit` | 0 | 零输出 |
| 6 | `npm run lint` | 0 | 17 warnings / 0 errors，205 files |
| 7 | `git diff --stat` | 0 | 15 files changed, 86 insertions(+), 17 deletions(-) |

## 5. 边界

- 未跑全量 `npm run ci`（按块内轻门禁口径，全量留给发版提交）。
- 未跑 `npm run verify:lib`（见上，未提交树不适用）。
- 未碰 live 实例、未重启服务、未推远端、未提交。
- 临时基线 worktree `.tmp/wt-s1q21-red` 用完已 `git worktree remove --force`；本目录外无残留。
- 本目录只有三份文件：`README.md`、`commands.log`、`diff-stat.txt`。
