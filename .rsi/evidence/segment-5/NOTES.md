# Objective segment 5/5 — the repeat-run ("continuous iteration") requirement, verified on the working tree

Recorded: 2026-11-19T07:4x +08:00, device `agent-45`.
Base: `HEAD = 37cb0fc` = `origin/main`, branch `main`, 46 dirty entries (`git status --porcelain | wc -l`).
Verified object: **the working tree**, not a commit. See "What this does not prove".

## What the requirement is

The original objective asks for three connected pieces, and all three have to be real:

1. a switch next to the session composer that opens/closes the repeat run;
2. the `loop*` parameters on the settings page (stored, validated, projected);
3. a Host Schedule heartbeat that actually drives the rounds (one durable `rrule` row, target =
   the same session), with a stop that exists.

## Premise that must not be lost: none of this is in `HEAD`

| check | command | result |
| --- | --- | --- |
| the composer switch is not in `HEAD` | `git show HEAD:src/client/index.js \| grep -c 'composer.dock'` | `0` |
| the brakes module is not in `HEAD` | `git cat-file -e HEAD:src/loop-brakes.ts` | `fatal: path 'src/loop-brakes.ts' exists on disk, but not in 'HEAD'` (exit 128) |

So on `HEAD` the user-reachable path is still "hand-POST the route" (D-069「现状」), and `v0.11.15`
ships the loop *service* without the switch. Everything below rides on uncommitted work.

Fingerprints of the exact bytes verified (`sha256sum | cut -c1-12`):

```
55483a52622f  src/loop.ts
6543545e5e3f  src/loop-surface.ts
34f56e7095ab  src/loop-brakes.ts
d290765594d6  src/client/index.js
332d23134642  src/gate.ts
c4d053572df3  src/config.ts
```

(`loop.ts`, `loop-surface.ts` and `config.ts` match the §0 fingerprints recorded in `RESEARCH.md` A26,
so those three files have not drifted since that measurement.)

Re-hashed after the runs finished (`sha256sum`): all six values unchanged, so the tree did not move
under this measurement. `src/client/index.js` *did* change once earlier in the hour (07:35:02), which
is why every command below ran on a copy rather than on the live tree.

## 1. The composer switch

- Registration: `src/client/index.js:3732` `name: 'conversation.composer.dock'`, id
  `grok-workflow-loop`, `order: 90`, mounted from `startLoopSwitch()` (`:3730`) and called from the
  bundle's `apply` (`:3935`). The route it calls is `src/client/index.js:3527`
  `const LOOP_ROUTE_PATH = '/grok-workflow/loop'` — the same one the Host registers.
- The landing slot is a real platform slot, not a private convention:
  `dsh-client-ui-conversation/src/client/apply.ts:477` declares
  `'conversation.composer.dock': { kind: 'list', scope: 'session' }` and
  `.../skeleton/InputBar.tsx:596-598` renders it inside the composer card, only for the composer
  variant with a live session.
- `props.sessionId` is real: DSH's session plugin augments session-scoped slot props with it
  (`dsh-client-ui-session/lib/types/client/index.d.ts:80-84`, `interface SessionStandardProps {
  … sessionId: SessionId … }`), which is why the registration needs no `inject` face of its own.
- Behaviour is pinned, not assumed (`test/client.spec.ts`, 92 tests): mount reads `status` once and
  refuses to flip while the read is in flight; a click sends `open` then, on the next click, `close`;
  a 403 keeps the switch on its last known state and says "only you"; a 503 says the Host has no
  scheduler; a non-JSON answer becomes `loop/response`, not a state change; the section never touches
  `conversation.input.model`, `querySelector`, or `getElementById`.

## 2. The settings-page parameters

- Four keys with descriptions and bounds: `src/config.ts:388-399` (`loopEnabled`,
  `loopMaxRounds` 1–100, `loopFailStreak` 1–20, `loopIntervalMin` 0–10080, `0` = the loop's floor),
  clamp/repair at `:792-795`.
- The page groups them (`src/client/index.js:62-65`, group `loop`) and words them in both languages
  (`:122-125` / `:308-311`), with unit hints at `:1346-1348`.
- `docs/` surface stays pinned: `test/docs-config-keys.spec.ts` (12 tests) and
  `test/docs-version.spec.ts` (8 tests) pass; `test/settings-projection.spec.ts` (4) passes.

## 3. The Host Schedule heartbeat

- Route: `src/loop-surface.ts:132-133` registers `kind: 'exact'`, `path: LOOP_ROUTE_PATH` only when
  `webServer` + `connection` are composed; the handler's first act is the composition's own fence
  (`:249 connection?.requestRejection(req)`).
- `open` is user-only **structurally**: `src/loop.ts:373-380` throws `loop/user-only` for any defined
  actor, and the route calls it with no actor (`src/loop-surface.ts:302-308`). The model-facing
  `grok_loop` tool keeps `open` in its schema only so the refusal is readable and testable
  (`test/loop-surface.spec.ts:100-104` asserts the throw).
- The durable row is one `rrule` task targeting the session itself: `src/loop.ts:420-425`
  `service.create({ title, prompt, timing: { kind: 'rrule', rrule }, target: { kind: 'session', sessionId } })`,
  with the round bound written into the rule (`src/loop.ts:303`
  `RRULE:FREQ=MINUTELY;INTERVAL=…;COUNT=…`). A re-open refreshes the live row instead of adding a
  second one; `close` deletes and then reads the catalog back (`src/loop.ts:431-460`).
- No Schedule service ⇒ `loop/unavailable` ⇒ HTTP 503 (`src/loop-surface.ts:315`).
- Delivery is recognised before the user-source filter: `src/gate.ts:495-496` →
  `classifyHeartbeat` (`:546-564`), which answers `pass/loop-continuation` or `loop-stop`; a stop
  deletes the row and rejects the step with zero model calls. The brakes that decide `loop-stop` live
  in `src/loop-brakes.ts` (442 lines: operator stop file, disposed plugin, fail streak, daily cap,
  token budget, time budget), each derived from records that already exist — no timer, no queue.
- The keys are read by the *running* bundle, not only by the page:
  `test/loop-runtime-wiring.spec.ts` loads `lib/index.js` through the real Loader with the real tool
  registry, puts a recording Schedule beside it, writes a configuration, and asserts what Schedule
  was asked to store (5 tests).

## Verification I ran myself (snapshot, so concurrent writers cannot fake it)

The tree is being edited by other tasks (`src/client/index.js` changed at 07:35:02, `README.md` at
07:35:55). To keep the measurement honest I copied the tree *excluding* `node_modules`, `.git`,
`out`, `.tmp`, session state, symlinked `node_modules`, and ran everything there
(`.tmp/seg5-snapshot`, removed afterwards).

| command (in the snapshot) | result | log |
| --- | --- | --- |
| `npx tsc -p tsconfig.json --noEmit` | exit 0, no output | `typecheck.txt` |
| `npm run build` | exit 0, `client bundle: 224412 bytes` | `build.txt` |
| `npx vitest run` (whole suite) | exit 0 — **62 files / 1139 tests passed** | `full-vitest.txt` |
| targeted loop+client set¹ | exit 0 — **10 files / 262 tests passed** | `targeted-vitest.txt` |

¹ `test/client.spec.ts` 92 · `test/loop.spec.ts` 30 · `test/loop-surface.spec.ts` 16 ·
`test/loop-brakes.spec.ts` 35 · `test/loop-runtime-wiring.spec.ts` 5 · `test/config.spec.ts` 36 ·
`test/config-limits-repair.spec.ts` 24 · `test/settings-projection.spec.ts` 4 ·
`test/docs-config-keys.spec.ts` 12 · `test/docs-version.spec.ts` 8.

Lint, run on the real tree (the snapshot path is inside gitignored `.tmp/`, so oxlint skips it):
`npx oxlint src test` → exit 0, **22 warnings / 0 errors**, same count as the `v0.11.15` gate —
no new warning came with the switch or the brakes (`lint-repo.txt`).

## The committed artifacts are the build of this source

After `npm run build` in the snapshot I compared a 145-file md5 manifest of `lib/` against the
working tree's `lib/`: `diff` empty (`lib-snapshot.md5`, `lib-repo.md5`, `lib-diff.txt`, 0 bytes).
That includes `lib/client.js` (the switch) and `lib/loop-brakes.{js,d.ts,d.ts.map}` (145 = the 141
files `v0.11.15` shipped + 4 new). So nothing here is a source change that never reached its build.

## What this does not prove (stated, not implied)

- **NOT_RUN — a live GUI click.** No DSH instance was started, so "the switch appears under the
  composer in a real browser and opens a row" is proven only against the platform's declared slot
  contract and the bundle's own tests, not against a running Web GUI. Starting one is a separate,
  operator-visible action.
- **NOT_RUN — a real heartbeat delivery.** No Schedule task was created, edited or deleted on this
  machine (D-066: the first heartbeat is an operator action).
- **No commit, tag or push** was made from this segment, and nothing was published to npm. The 46
  dirty entries, including `src/loop-brakes.ts` and the switch, are still unreviewed work of another
  writer; per `HANDOFF.md` and the attempt-2 note they must not be swept into a release commit.
- The composer switch is verified against the *current* tree. If another task rewrites
  `src/client/index.js` or `src/loop*.ts` after 07:4x, re-run the targeted set before quoting this
  record: fingerprints above are the only safe way to say "this is what I measured".

## Files

`typecheck.txt` · `build.txt` · `full-vitest.txt` · `targeted-vitest.txt` · `lint-repo.txt` ·
`anchors.txt` (HEAD/status/line-anchor capture) · `lib-snapshot.md5` · `lib-repo.md5` ·
`lib-diff.txt`
