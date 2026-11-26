# Horizontal fork panel — preview evidence (2026-11-26)

What this is: three Chromium screenshots of `task-fork.html`, a single-file preview of the new
progress panel, plus `measurements.json` — the numbers read straight out of the rendered DOM.

CONFIRMED, what produced it:

- the preview *is* the plugin's source, inlined byte-for-byte and run in the page: the model,
  the geometry, the stylesheet and the click handling are the shipping code, with a mini React
  (real `useState`, real effects, real clicks) standing in for the host's runtime;
- the data is two hand-written recorder streams folded by the bundle's own `progress.fold`:
  one run still working (last review unreported), one finished whose third summary draft is the
  one that shipped;
- Chromium 1248 (`/home/fish/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`), 2×
  device scale, 1440 × 900 and 390 × 844.

The preview file itself is scratch and lives outside the tree
(`/home/fish/projects_mine/dsh-grok-workflow/.tmp/mock/task-fork.html`).

## Two defects this preview reproduces and proves fixed (CONFIRMED, in this browser)

1. **A capsule cut its own word.** `汇总` and the shipped draft number shared one 88 px pill;
   the word lost and the page drew `汇`. A capsule that carries a badge now puts the badge on
   a second row inside the body (`gw-progress-pnode-detail`), and the layout gives that card
   48 px to stand on. Measured: `汇总` 57 px word in an 88 px capsule, `scrollWidth ==
   clientWidth` (whole), badge `第 3 稿` on its own row, capsule 88 × 49 — the column width is
   unchanged at 88.

2. **An opened call list was unreadable.** A real-install capture showed the row collapsed into
   a one-character-per-line column. Reproduced here first: the *list* was already the card's
   full width (186 px list under a 186 px card) — the crushed box was the **row's line column**
   (70 px), because the row was one grid line of clock + gate + title + verdict and a CJK title
   breaks anywhere, so the 1fr column had no floor. A row inside a card's list is now a
   wrapping flex: clock, gate and verdict on the first line, each `flex: none` + `nowrap`, and
   the title on a line of its own. Measured on three card widths: 186 → row 172 × 54, title
   164 × 19 (one line); 110 → row 96 × 91, title 88 × 38 (two lines, no character split);
   88 → row 74 × 85, role `规划助手` whole at 52 × 19. No row overflows (`scrollWidth −
   clientWidth = 0`).

3. **An opened list painted under the sibling cards.** Confirmed from the real capture: 任务 2 and
   任务 3 (bodies and ring dots) sat on top of the list's rows. The list carries `z-index: 3`, but
   the card it hangs from stayed `z-index: auto`, so that number only decided anything inside the
   card's own stacking chain — a host stylesheet is free to put a card's body in a context of its
   own, and then a card drawn later wins. The open card is now raised as a whole:
   `.gw-progress-pnode[data-open="true"] { z-index: 4 }`, closed cards keep `auto` and their
   document order, nothing is portalled and the list stays inside its card.

   Chromium, `document.elementsFromPoint()` at a point 任务 1's list and 任务 2 share:

   | state | topmost element | 任务 2's rank | t1 z-index | list z-index |
   |---|---|---|---|---|
   | closed | card 任务 2 | 0 | auto | — (not rendered) |
   | opened | row of 任务 1's list | 2 | 4 (`data-open="true"`) | 3 |
   | closed again | card 任务 2 | 0 | auto | — |

   In this page the list already won before the change (the card stayed `auto`, so the list's own
   `3` beat the sibling cards here); the host page's chain is what inverted it. Raising the card
   is the only rule that does not depend on that chain.

4. **The list had no background.** The rule asked for `--dsw-alias-bg-elevated`, falling back to
   `--dsw-alias-bg-l1` and then to `transparent`; the host's theme defines neither name (it has
   `bg-base`, `bg-layer-1/2/3`, `bg-overlay`), so the computed background was
   `rgba(0, 0, 0, 0)` and the sibling cards read through the list. The chain is now
   `var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base, Canvas))` — a surface the theme really
   has, ending in a system colour, so a theme with none of these tokens still paints an opaque
   panel that follows light or dark. Border and shadow unchanged. Measured in Chromium with the
   host's palette (no `bg-elevated`, no `bg-l1`): before `rgba(0, 0, 0, 0)`, after
   `rgb(255, 255, 255)`; with `bg-layer-1` and `bg-base` forced invalid, still
   `rgb(255, 255, 255)` (Canvas). This was the only occurrence of the two dead names in the sheet.

## measurements.json

| | 1440 × 900 | 390 × 844 |
|---|---|---|
| nodes / edges per figure | 17 / 24 | 17 / 24 |
| rings per task card | 6, 6, 6 | 6, 6, 6 |
| checks on 验收 | 5 | 5 |
| cards overflowing their column | none | none |
| wires crossing a card | none | none |
| every capsule word whole | yes (5 of 5, both figures) | yes |
| 汇总 capsule | 88 × 49 with `第 3 稿` (running: 88 × 32, no badge) | same |
| dock button (running / done) | 0 / 0 | 0 / 0 |
| `document.scrollWidth === clientWidth` | 1440 = 1440 | 390 = 390 |
| figure scrollWidth / clientWidth | 1170 / 1170 (no scroll) | 1024 / 320 (scrolls) |
| graph | 1170 × 382 | 1024 × 418 |

Opened list (t1, 186 px card): list 186 px (= card), 3 rows 60/60/59 px, title 164 px wide,
rows overflow 0.

What this is NOT: the real page in a real host. No live recorder, no second measured pass from
the host's observer, and the theme tokens are a stood-in palette. The page's own numbers come
from a later real-install soak; nothing here may be quoted as that soak's result.
