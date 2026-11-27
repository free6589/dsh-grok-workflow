# Firefox tri-state evidence (+ Chromium control) — fix/browser-firefox-safari

Same static bundle harness, two engines, three states each.
No live DSH, no network, no product change (`src/client/index.js == lib/client.js`).

## What ran

- Harness: `.tmp/tri-ff/tri-harness.html` (built by `.tmp/tri-ff/tri-harness.mjs` from the shipped `lib/client.js` + real `GROK_WORKFLOW_PROGRESS.fold/component/css`).
- Soak: `.tmp/tri-ff/soak-tri.mjs` — firefox 157 (`firefox-1555`) + chromium 156 control, viewport 1280x1000, one `page.evaluate` reading per state next to its screenshot, `console error` + `pageerror` collected.
- States: `waiting` (zero declarations) / `running` (open retry shape) / `done` (completed stop).

## Readings (from `readings.json`, same instant as each PNG)

Firefox `Mozilla/5.0 (X11; Linux x86_64; rv:157.0) Gecko/20100101 Firefox/157.0`:

| file | chip | chipState | line | dockFill | pnodes/rings/checks | stuck |
| --- | --- | --- | --- | --- | --- | --- |
| `firefox-waiting.png` | 等你点头 | waiting | 第 1 步，共 7 步（7 层流程） | 开工 | 5/0/5 | false |
| `firefox-running.png` | 进行中 | running | 第 4 步，共 7 步（7 层流程） · 还剩约 1 分 0 秒 | (none) | 10/12/5 | false |
| `firefox-done.png` | 已完成 | done | 第 7 步，共 7 步（7 层流程） | (none) | 8/6/5 | false |

Chromium control UA `HeadlessChrome/156.0.0.0 Safari/537.36`: identical chips/states/lines/dock/pnodes/rings/checks per state (files `chromium-*.png`).

Console: firefox `{console: [], page: []}`, chromium `{console: [], page: []}` (`console.json`).

## Safari / WebKit: NOT_RUN (recorded, not forged)

- Local `~/.cache/ms-playwright/` has firefox-1555 + chromium-1248 only; no webkit engine.
- `npx playwright install webkit` needs sudo/root deps and fails in this session; no network download performed.
- Guard `test/browser-tri-states.spec.ts` asserts no `webkit`/`safari` key in `readings.json` so a forged entry would fail the gate.

## Red line

- `~/.dsh` untouched, no live profile, no 3080, no restart.
- Scratch stays in `.tmp/tri-ff/` (gitignored); durable evidence only here.
