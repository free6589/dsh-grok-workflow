### Fixed / 修复

- **A bilingual delivery no longer loses the second language's verdict at the 4800-character cap / 双语交付在 4800 字符上限处不再丢掉第二种语言的结论** —
  The pair of blocks was bounded by slicing their concatenation, and one block at the
  single-pass cap (2400) plus one a character short (2399) plus the two-character
  separator is 4801 — one over. The blind cut then ate the last characters of the
  *second* language's verdict (`明细已记入台…`), which is the language the mirror exists
  to serve. The budget is now split between the two blocks, so only middle text can go
  and both verdicts survive; a block over its own cap is cut at a line boundary and the
  junction is marked with `…` instead of being sewn mid-word, and no cut ever splits an
  astral character (which used to leave a lone surrogate that renders as a replacement
  box).
  / 两个块此前是把拼接结果直接截断来限长的：一块正好在单遍上限（2400）、另一块差一个字
  （2399），加上两字符分隔符就是 4801，超出一个字符。这一刀于是吃掉了**第二种**语言结论的
  末尾（`明细已记入台…`），而那份镜像正是为这类读者存在。现在预算在两块之间分配，只有中间
  正文会被舍弃，两种语言的结论都完整保留；单块自身超限时按行边界裁剪并留下 `…` 接缝标记，
  不再切在词中间，也不会切断增补字符（此前会在末尾留下一个孤立代理项，渲染成替换方块）。
- **The ledger's `Model routes:` line refuses a route that is not a `provider/model` label / 台账的 `Model routes:` 一行现在拒绝非 `provider/model` 标签的条目** —
  That line is the one place a delivery restates a *configuration*, and it handed the report's
  chain straight to `Array#join`: a number, a `null` or an object inside a chain was coerced
  into a readable route (`worker=a/m1 → 7 → `), and a chain that was not an array at all threw
  a bare `TypeError` out of the ledger, naming neither the role nor the position. Every entry
  is checked now and the refusal carries its path and the shape found
  (`roles.worker[1] must be a "provider/model" string, got number`). A malformed chain costs
  the ledger line, never the answer; an absent chain still reads `inherit`.
  / 这一行是交付里唯一复述**配置**的地方，它此前把报告的链直接交给 `Array#join`：链里的数字、
  `null` 或对象会被拼成一条看着像真配置的路由（`worker=a/m1 → 7 → `），而根本不是数组的链
  会从台账里抛出裸 `TypeError`，既不报角色也不报位置。现在每个条目都检查，拒绝时写明路径与
  实测形状（`roles.worker[1] must be a "provider/model" string, got number`）。链坏掉只损失
  台账那一行，不会牵连结论；缺省的链照旧读作 `inherit`。
