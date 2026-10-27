# t42 — settings page in Chinese and English (provenance)

What this set proves: the **Grok workflow** settings page renders entirely in the language
the DSH **Settings → General → Language** row selects, and follows that row live — not the
browser's `navigator.language`.

## Where it was taken

| fact | value |
| --- | --- |
| instance | own debug profile `web-grok-debug` (`DSH_HOME=/home/fish/dsh-layerfs`), `http://127.0.0.1:3199` |
| launched as | `dsh --profile web-grok-debug --host 127.0.0.1 --port 3199 --no-open` |
| plugin source | `npm pack` of this tree → `dsh plugin --profile web-grok-debug add file:/tmp/t42-pack/r2/dsh-grok-workflow-0.2.1.tgz` |
| installed `lib/client.js` md5 | `380061bb878fa8bb209db8d2172aacda` (byte-identical to the built `lib/client.js` in this commit) |
| bundles | `["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-grok-workflow"]` |
| browser | Playwright 1.64.1, Chromium, `locale: en-US`, viewport 1500×1000 |
| live `:3090` | **not touched** — no restart, no install, no settings write |

## How the language was changed

Through the product, not through a test hook: sidebar **Settings** → the **Language** row
(the row `@deepseek-ai/dsh-client-locale` registers) → pick **中文**, then reload the page.
`capture.log` records each step and every assertion; `document.documentElement.lang` reads
`en` → click → `zh-CN` → reload → **still** `zh-CN`, which is what "the same source DSH
uses" means in practice (the durable preference, not a per-page guess).

## Files

| file | what it shows |
| --- | --- |
| `01-plugins-cards-en.png` | Plugins page, English: the card title and its one-line summary in English |
| `02-page-en.png` | the settings page itself, English (group headings, field labels, numeric ranges, chain editor, Save/Discard) |
| `03-plugins-cards-zh.png` | Plugins page, Chinese: same card, Chinese summary |
| `04-page-zh.png` | the settings page itself, Chinese (same fields, same layout) |
| `page-text-en.txt` / `page-text-zh.txt` | the full rendered text of both pages, so a reviewer can grep copy without OCR |
| `capture.log` | the exact step log and assertions of the run |

## Assertions the run enforced (both directions)

```
EN page has "Entry and gate": true          ZH page has 入口与门禁: true
EN page has "Per-role model chains": true   ZH page has 按角色模型链: true
EN page has "Save": true                    ZH page has 保存: true
EN page has "default 1800000": true         ZH page has 默认 1800000: true
EN page has no Chinese copy: true           ZH page has no English headings: true
```

## What a screenshot cannot prove, and what does

A screenshot cannot show the *mechanism* — that the copy comes from
`ctx.locale.register('grok-workflow', { zh, en })` and the framework's `t` seat rather than
from `navigator`. `test/client.spec.ts` pins that structurally: the bundle must register
both dictionaries on the locale service, must declare `locale: 'grok-workflow'` on its
`plugins.item` slot, must render the card summary from the seat it is handed, and must stay
mountable (English copy) in a composition with no locale service at all.
