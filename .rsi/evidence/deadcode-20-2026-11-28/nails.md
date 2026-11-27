# Nails — existence only

红线：本文件只收录「存在性」线索（声明位置、能否被读到）。不判定死因、不给出修法、
不改代码。钉子小工的结论由包工头合并；此处不替代、不预判。

状态标记：CONFIRMED = 本条由本工实跑命令或实读源码直接观察。

## 钉子 1 — copied 死状态

状态：CONFIRMED（存在性）
- `src/client/index.js:1672` — `const [copied, setCopied] = useState(false)`
- 写入点：`src/client/index.js:1706`（`const done = () => setCopied(true)`）、
  `src/client/index.js:1713`（catch 分支 `setCopied(true)`）
- 读取点：无。全文件 grep `copied` 仅命中 1672 / 1706 / 1713 三处（另有 88 行为
  无关文案字符串 `"3. A live check on a copied profile ..."`），读数从未被使用。
- 第三方旁证：`npm run lint` 输出 `eslint(no-unused-vars): Variable 'copied' is
  declared but never used`，定位 `src/client/index.js:1672:14`。

## 钉子 2 — PANEL_STACK_WIDTH 死常量

状态：CONFIRMED（存在性）
- 源码声明：`src/client/index.js:3926` — `const PANEL_STACK_WIDTH = 720`
- 构建产物同址副本：`lib/client.js:3926` — `const PANEL_STACK_WIDTH = 720`
- 引用点：无。`src` / `lib` / `test` 全域 grep 只命中上述两处声明本身。
- 相邻注释自述（非本工结论，仅摘录原文，行 3928-3931）：
  「the stylesheet keeps its own 720 copy for wrapping cards; the list no longer
  reads it. `matchMedia` is not read anywhere on this page now.」
- 第三方旁证：`npm run lint` 输出 `eslint(no-unused-vars): Variable
  'PANEL_STACK_WIDTH' is declared but never used`，定位 `src/client/index.js:3926:11`。
