# Objective segment 5/5 — the repeat-run requirement: verified on the tree, then landed

Recorded 2026-11-19T08:1x +08:00 by `agent-56` (closing segment of the objective).
Repository `/home/fish/projects_mine/dsh-grok-workflow`, branch `main`.

**Result:** commit `e11d1009e0fc8b89a1ec8f1e20260c0802427336`, pushed as a fast-forward
(`37cb0fc..e11d100`), remote CI run `44425357004` = **success** (Node 22 and Node 24), and
`npm run verify:lib` at that commit = `145 files, byte-identical`. No version bump, no tag, no
GitHub Release, no npm publish — see "What this does not do".

## 1. What the requirement is

The objective asks for three connected pieces, and all three have to be real and reachable:

1. a **switch next to the session composer** that opens and closes the repeat run;
2. the four **`loop*` parameters on the settings page** (stored, validated, projected);
3. a **Host Schedule heartbeat** that actually drives the rounds — one durable `rrule` row whose
   target is the same session — plus a stop that exists.

## 2. State on arrival (this is why the segment could not just be a report)

`HEAD` was `37cb0fc` = `origin/main`, and the three pieces existed only as **uncommitted work**
left by earlier segments and by a concurrent writer:

| check | command | result on arrival |
| --- | --- | --- |
| the composer switch is not in `HEAD` | `git show HEAD:src/client/index.js \| grep -c 'composer.dock'` | `0` |
| the brakes module is not in `HEAD` | `git cat-file -e HEAD:src/loop-brakes.ts` | exit 128, "exists on disk, but not in 'HEAD'" |
| the tree carried the work | `git status --porcelain \| wc -l` | 46 entries |
| the tree was quiescent | `ls --time-style=full-iso src/*.ts src/client/index.js test/*.spec.ts` + `list_agents` | last `src/` write 07:35:02, every other agent `inactive` |

So on the landed release (`v0.11.15`, `50c0321`) the user-reachable path was still "hand-POST the
route"; the switch existed only on disk. A segment that stopped at "it is all there in the working
tree" would have described a feature no release ships, which is exactly the state attempt 1
recorded (and why it was not enough).

Fingerprints of the bytes verified (`sha256sum | cut -c1-16`), identical at the start and the end of
this segment (`pre-fingerprints.txt` vs `post-fingerprints.txt`, `fingerprint-drift.txt` empty):

```
55483a52622f0f46  src/loop.ts
6543545e5e3f6310  src/loop-surface.ts
34f56e7095abf6cd  src/loop-brakes.ts
d290765594d62a3b  src/client/index.js
332d23134642460c  src/gate.ts
c4d053572df36194  src/config.ts
cd447a90194e4686  src/index.ts
```

## 3. The three pieces, with anchors

**The switch** — `src/client/index.js`: path constant `:3527` (`'/grok-workflow/loop'`, the same
route the Host registers), id `:3528` (`grok-workflow-loop`), order `:3529` (`90`), component
`:3665-3718`, additive registration `:3730-3743`
(`ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register(options, LoopSwitch))`),
mounted from `apply` at `:3935`, exported through the bundle face at `:4115-4120`. The slot is a
platform declaration, not a private convention: `dsh-client-ui-conversation/src/client/apply.ts:477`
declares `'conversation.composer.dock': { kind: 'list', scope: 'session' }`,
`skeleton/InputBar.tsx:596-598` renders it inside the composer card, and
`dsh-client-ui-session/lib/types/client/index.d.ts:80-84` puts `sessionId` in `SessionStandardProps`.
The switch reads `status` once on mount, never polls, sends `open`/`close` with no numbers of its
own, and does not flip on a refusal (403 → only you; 503 → no scheduler; non-JSON → `loop/response`).

**The parameters** — `src/config.ts:388-399` (four keys, bounds 1–100 / 1–20 / 0–10080, `0` = the
loop's floor), clamp/repair at `:792-795`, settings group and bilingual wording at
`src/client/index.js:62-65`, `:113-133`, `:176`.

**The heartbeat** — route `src/loop-surface.ts:133` (`kind: 'exact'`, `LOOP_ROUTE_PATH`) registered
only with `webServer` + `connection`, behind the composition's `connection.requestRejection`
(`:249`); `open` refuses any defined actor (`src/loop.ts:376`, `loop/user-only`); the durable row
is one `rrule` task with `target: { kind: 'session', sessionId }` (`src/loop.ts:424`) and the round
bound written into the rule (`:303`,
`DTSTART…\nRRULE:FREQ=MINUTELY;INTERVAL=<min>;COUNT=<rounds>`); no Schedule service → 503
(`src/loop-surface.ts:315`).

**The stop** — `src/loop-brakes.ts` answers continue/stop once per heartbeat, from facts that
already exist: the operator stop file (`.rsi/STOP`, `GROK_WORKFLOW_STOP_FILE`, `:52`/`:55`), the
disposed plugin, rounds that wrote no assistant message, rounds already admitted today (cap 24,
`:58`), a token allowance of 200 000 per admitted round up to 2 000 000 (`:67`/`:70`), and elapsed
time since the day's first round. `src/gate.ts:1541-1575` classifies a delivery, and a
`loop-stop` verdict deletes the Schedule row **before** rejecting the step, so the refusal costs
zero model calls and the loop cannot return on the next occurrence. The accounting is a session
record (`plugin:grok-workflow/loop-round`, `:210`), not a counter — a restarted Host still knows
what the loop spent.

## 4. Gates run by this segment (all on the quiescent tree, 07:52–08:10)

| command | result | log in this directory |
| --- | --- | --- |
| `npm run build` | exit 0, `client bundle: 224412 bytes → lib/client.js` | `build-seg5-attempt2.txt` |
| md5 manifest of all 145 `lib/` files, before vs after that build | **diff empty** — committed `lib/` is the build of this `src/` | `lib-before.md5`, `lib-after-build.md5`, `lib-build-idempotence.txt` |
| `npx tsc -p tsconfig.json --noEmit` | exit 0, no output | `typecheck-attempt2.txt` |
| `npx oxlint src test` | exit 0, 22 warnings / 0 errors (107 files) | `lint-attempt2.txt` |
| `npx vitest run` | exit 0, **62 files / 1139 tests passed** (24.21 s) | `full-vitest-attempt2.txt` |
| `npx vitest run test/docs-version.spec.ts test/docs-config-keys.spec.ts test/docs-architecture-version.spec.ts` | 3 files / 23 tests passed (after the doc edits) | `docs-guards.txt` |
| `npm run verify:lib` **before** the commit (checks `37cb0fc`) | `141 files, byte-identical` | `verify-lib-precommit.txt` |
| `npm run verify:lib` **after** the commit (checks `e11d100`) | `lib/ at e11d100 is the build of src/ at e11d100 (145 files, byte-identical)` | `verify-lib-postcommit.txt` |
| `git push origin main` | fast-forward `37cb0fc..e11d100`, `origin/main` = `e11d100` (captured after the fact with `rev-parse`, `merge-base --is-ancestor`, `show --stat`) | `landing.txt` |
| `gh run watch 44425357004` | exit 0; `Node 22` success, `Node 24` success | `ci-watch.txt` |

Per-file counts from that full run: `client.spec.ts` 92 · `loop.spec.ts` 30 ·
`loop-brakes.spec.ts` 35 · `loop-surface.spec.ts` 16 · `loop-runtime-wiring.spec.ts` 5 ·
`config.spec.ts` 36 · `config-limits-repair.spec.ts` 24 · `settings-projection.spec.ts` 4 ·
`docs-config-keys.spec.ts` 12 · `docs-version.spec.ts` 8. Baseline at `v0.11.15`: 60 files / 1081
tests → this tree adds 2 files / 58 tests, with no deletions and no `.skip`/`.only`/`.todo`.

## 5. What this segment changed in the repository

- `CHANGELOG.md` `[Unreleased]`: two `Added` entries, English and Simplified Chinese — the
  composer-dock switch, and "a heartbeat can now be stopped without waiting for the round cap"
  (including the two stated limits: the token figure is a budget, not a meter, and a round counts
  as failed only when it wrote no assistant message).
- `docs/knowledge/DECISIONS.md`: **D-072** — switch in the composer dock rather than the settings
  page, switch carries no numbers, stop = reject + delete the row, every brake input is a fact that
  already exists, and the two limits above. D-069's "no client control" paragraph and D-071's
  matching sentence now point at D-072 instead of asserting something the tree no longer does.
- `docs/knowledge/STATE.md`, `VALIDATION.md`, `HANDOFF.md`, `.rsi/ROUND.md` (Round 16),
  `.rsi/STATE.md`, `.rsi/ledger.jsonl`: this round's record, including the commit, push and CI ids.
- `src/`, `test/` code content: **unchanged by this segment** — it verified and landed the work that
  was already in the tree (fingerprints in §2, identical before and after). The commit therefore
  contains someone else's implementation plus this segment's records; §4 is the evidence that the
  combination is green, and `verify:lib` is the evidence that the committed artifacts are its build.

## 6. What this does not do (stated, not implied)

- **No release.** The version stays `0.11.15`; there is no `0.11.16` tag, no GitHub Release and no
  npm publish. The switch is user-visible, so the next authorized release is a patch that moves
  `[Unreleased]` into its own section. Creating a tag or a Release without operator authorization
  is outside this segment (AGENTS.md, release discipline).
- **No live proof.** No DSH instance was started, the switch was never clicked in a browser, and no
  real heartbeat was delivered. The switch is proven against the platform's declared slot contract,
  the real client bundle, and the bundle's own tests — not against a running GUI. The first
  heartbeat stays an operator action (D-066/D-071).
- **No Schedule task was created, edited or deleted**, and no approval/sandbox control was touched.
- The plugin-reload semantics of the Schedule sub-fiber (`src/index.ts:292`'s comment vs A27 §5)
  remain `HYPOTHESIS`; changing that comment would have rebuilt `src/index.ts` for a wording defect,
  so it was left alone.

## 7. Reproduce

```
git log -1 --format=%H%n%s e11d100          # the landed commit
git show --stat e11d100 | tail -3           # 84 files, +8136 −119
npm run verify:lib                          # 145 files, byte-identical at HEAD
npx vitest run                              # 62 files / 1139 tests
gh run view 44425357004                     # Node 22 + Node 24 success
```

`settings-simple-mock.html` stays untracked on purpose (a draft mock; round 15 reached the same
conclusion). This directory also keeps attempt 1's logs (`anchors.txt`, `full-vitest.txt`,
`targeted-vitest.txt`, `build.txt`, `lint-repo.txt`, `lib-repo.md5`, `lib-snapshot.md5`,
`lib-diff.txt`), which describe the same tree before it was committed; the `*-attempt2` files and
`landing.txt` are the ones this landed state is measured by.
