# round-025 — the shipped self-iteration default template

Status: `CONFIRMED` for everything below. This bundle is the evidence for the
change that ships the repository's own round prompt as the default of
`iterateTemplate`, plus the live check that the switch stores it.

## What changed

- `docs/iterate-template.md` — new: the reader-facing default template (POOL-first
  topic selection, small/big split, R1–R6, triple review, four brakes, forbidden
  zones) and why each section is there.
- `src/config.ts` — `DEFAULT_ITERATE_TEMPLATE` is now that template, byte for byte.
- `src/client/index.js` — the settings bundle's copy of the same default.
- `test/iterate-template.spec.ts` — new: doc ↔ constant byte-identity, the
  4000-character cap, and one assertion per required section.
- `test/loop-surface.spec.ts` — the iterate route's `status` action, and the
  template expectation now reads the constant instead of a literal first line.

## Local gates

`npm run ci` (typecheck, lint, verify:lib, full vitest) — exit 0:

```
Found 24 warnings and 0 errors.
> dsh-grok-workflow@0.12.1 verify:lib
lib/ at 6331329 is the build of src/ at 6331329 (153 files, byte-identical)
 Test Files  68 passed (68)
      Tests  1227 passed (1227)
```

That `verify:lib` line names the pre-change HEAD, which is what the check
compares; the post-commit run is recorded in `verify-lib-postcommit.txt`.
File count went 67 → 68 test files (baseline 63), so the count only increased.

## Live check (copied profile, production path)

- Profile: `loopfix-verify` (a copy that links this worktree), port 3451, booted
  with `dsh --profile loopfix-verify --port 3451 --no-open`; instance stopped
  afterwards. The operator's live profile was not touched.
- Driver: `live-iterate.mjs` — the real built bundle's iterate switch, mounted with
  **no** transport override, so every request goes through the page's own `fetch`
  into the real `/grok-workflow/iterate` route and the real `LoopService`.
- The stored template was already blank in the real settings mirror, so the open
  exercised the whitespace fallback rather than a leftover test template.
- Result (`live-iterate.txt`): one `RSI heartbeat` Schedule row written, 3239
  characters, byte-equal to `DEFAULT_ITERATE_TEMPLATE`; close deleted that row and
  nothing else; a second open/close cycle was equally clean.
- Storage residue: `~/.dsh/storages/schedule.json` afterwards holds exactly one
  row — the operator's pre-existing `派发个人助理灵感箱` task, untouched. The row the
  test opened is absent (`schedule-open-row.json` records it, filtered to the test
  session, with a prompt hash instead of the prompt).

## Redaction

- `boot.redacted.txt` is the boot log with the printed `token=` value, any
  `dsh-auth-…` name and any `v1.eyJ…` cookie value replaced by `<redacted>`.
- The cookie jar lived at `/tmp/gwfx25/cookies.txt`, was never copied into this
  bundle, and was deleted with the temporary directory.
- No credential value appears in any file here; the only `dsh-auth-` string is the
  boolean prefix check in the driver's source.

## NOT_RUN

- A real scheduled delivery of the `RSI heartbeat` row (arming and waiting for one
  occurrence) — that would spend an interval of real time and is the operator's
  call (D-066). The row's stored prompt and rrule are what this bundle verifies.
- A manual browser click-through with a screenshot; the same switch was driven
  through its real component over the real transport instead.
