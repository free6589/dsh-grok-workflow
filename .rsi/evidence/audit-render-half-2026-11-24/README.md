# Audit render half — the report tail, red → green, gate, and one isolated soak (2026-11-24)

Durable record for the work block "audit render half": take `src/report-audit.ts`
+ its spec from `feat/audit-layer` @ `7626233`, adapt them to `0.13.32`, and
attach the full machine record as the report's **optional tail** — off by default,
attached by the host tool only when the run did not complete (D-131).

Everything here was produced by a command run in this block. Scratch lived in the
gitignored `.tmp/soak-audit/` and `.tmp/audit-render/`; the copies kept here are
the ones the claims are read from.

Branch `feat/audit-render-half`, base `main` @ `1f70103` (version `0.13.32`), two
local commits: `4502748` (feat) and the docs/memory commit that carries this file.
No push, no tag, no merge, no release.

---

## 1. Red first — the spec landed before the implementation

Command (both runs, worktree root):

```
npx vitest run test/report-audit.spec.ts
```

| run | what was missing | result | log |
| --- | --- | --- | --- |
| 1 | `src/report-audit.ts` did not exist | **exit 1**, `0 test`, `Error: Cannot find module '../src/report-audit.js' imported from …test/report-audit.spec.ts` | `red-1-module-missing.out` |
| 2 | module present, `renderReport` had **no `auditTrail` option**, `src/index.ts` not wired | **exit 1**, `Test Files 1 failed (1)`, **`Tests 10 failed \| 3 passed (13)`** — the ten red cases are exactly the ones that assert the record is attached or retrievable: plan provenance and splits, limits + five chains + the full call trail, every attempt's payloads, the whole evidence set, `renderAuditTrail` as the direct entry point, no carry-over line shape re-triggered, the failure record, the truncation marker, the tail append, and the host tool's status switch. The three that stayed green are exactly the "nothing changed" sentinels — "cannot mutate the record it renders", "keeps the carry-over contract intact in both views", "adds nothing at all unless the caller asks for it". So the whole renderer contract was red, not three cases. | `red-2-entry-missing.out` (line 19 `Failed Tests 10`, line 635 `Tests 10 failed \| 3 passed (13)`; 10 `×`, 3 `✓`) |

Green (same command, after `src/report-audit.ts` + `ReportReportOptions.auditTrail`
+ the `src/index.ts` wiring): **exit 0, `Test Files 1 passed (1)`, `Tests 13 passed (13)`**
(`green-spec-13.out`).

The 13 cases are the ten renderer examples named in the block brief, plus three
entry cases: absent/false `auditTrail` leaves the default text unchanged; `true`
appends the section after the guard line as the report's tail; the registered tool
attaches it for a non-completed run and not for a completed one. The branch's two
default-view examples and its diagnostics-ledger example were **not** taken (the
default view does not move in this half; `test/report.spec.ts` already covers the
ledger).

## 2. Gate

```
npm run ci
```

(`typecheck && lint && verify:lib && npm test`; Node v26.8.1, npm 11.19.0.)

| run | tree | result |
| --- | --- | --- |
| first (`ci-before-commit.out`) | working tree, pre-commit | **EXIT=0** — `Found 36 warnings and 0 errors.`; `lib/ at 1f70103 is the build of src/ at 1f70103 (245 files, byte-identical)`; `Test Files 102 passed (102)` / `Tests 1923 passed (1923)` |
| final (`ci-after-commit.out`) | committed pair at `4502748` | **EXIT=0** — `Found 36 warnings and 0 errors.`; `lib/ at 4502748 is the build of src/ at 4502748 (249 files, byte-identical)`; `Test Files 102 passed (102)` / `Tests 1923 passed (1923)` |

**Default-view parity, proved against the pre-change build** (`default-view-parity.out`,
rig `default-view-parity.mjs`):

```
node .rsi/evidence/audit-render-half-2026-11-24/default-view-parity.mjs $PWD 1f70103
# -> exit 0: same completed default chars=487 / diagnostics 817 / guard 487
#            same partial   default chars=576 / diagnostics 853 / guard 576
#            same failure   default chars=262 / diagnostics 547
#            COMPARISONS 10 DIFFS 0
```

The script exports `lib/` from `1f70103` (this branch's base, i.e. the renderer
before this change) into gitignored scratch and loads it as a second module
instance. It then builds identical reports with both validators — completed,
partial, and a fallback `failureReport` — and compares `renderReport` output
byte for byte with no options, with `showDiagnostics`, and with a guard. **10
comparisons, 0 differences**, plus `renderReport(r) === renderReport(r,
{auditTrail: false})` on both shapes. That is the direct evidence for "the
default view did not move", independent of the test suite.

The first `npm run ci` in this block was **red**, and the red was a real signal:
`test/human-output-contract.spec.ts` ("renders the registered tool view without the
ledger (T4 fixed)") failed on `expected … not to contain 'skipped busy'`, because
the tool view for a `partial` run now carries the trail. See §5.

Baseline `docs/knowledge/VALIDATION.md` (`feat/update-button`, `0.13.32`-era):
**101 files / 1910 tests**, `verify:lib` 245 files. Delta: **+1 file / +13 tests**;
`lib/` **245 → 249** (the four `report-audit.*` artifacts). oxlint unchanged at
36 warnings / 0 errors.

## 3. Isolated soak — one failing run, one completed run

### 3.1 Environment

- Scratch: `.tmp/soak-audit/` with its own `dsh-home`, `HOME`, `npm-cache`,
  `pnpm-store` — all inside the scratch dir.
- `dsh-home/profiles/web`: a byte copy (`cp -a`) of the **live** `~/.dsh/profiles/web`
  (97 MB). The source was read only; `~/.dsh` was never written, and this process
  cannot write it (a `dsh --profile web` run against it failed with
  `EROFS … /home/fish/.dsh/profiles/web/cordis.yml`).
- `dsh-home/profiles/headless-soak`: the shipped `headless` template
  (`dsh --profile headless-soak --from-default-profile headless --help`), because
  the web app takes no task argument: `dsh --profile web "say hi"` →
  `error: too many arguments. Expected 0 arguments but got 1: say hi.`
- Plugin installed as a **packed tarball**, never a symlink:

  ```
  npm_config_cache=<scratch>/npm-cache npm pack --pack-destination <scratch>
  DSH_HOME=<scratch>/dsh-home dsh plugin --profile web            add file:<scratch>/dsh-grok-workflow-0.13.32.tgz
  DSH_HOME=<scratch>/dsh-home dsh plugin --profile headless-soak  add file:<scratch>/dsh-grok-workflow-0.13.32.tgz
  ```

  both `INSTALL_EXIT=0` (`install-web-profile.out`, `install-headless-soak-profile.out`),
  version read back as **`0.13.32`** in both (`version-readback.out`), dependency
  pinned to the tarball path.
- Credentials: `. /home/fish/.dsh/bifrost.env` into the process environment only;
  no value is written anywhere in this directory. The overlay names the variable
  (`apiKeyEnv: BIFROST_VIRTUAL_KEY`), never the key.
- Model: the machine's own gateway on `127.0.0.1:18088`, model
  `agent2api/deepseek-v4.1-flash`, all five roles (`overlay-soak.yml`).

### 3.2 Build identity (the run really used the tarball-installed bytes)

`build-identity.out`, measured in one command:

```
tgz                                     fe7f9ff2322d7c7bc2a74539dff5fe93c1a35dcb74ba03f81b6ca57904734cfb
worktree  lib/index.js                  06c21cbb028096c09970564dce769b114d3b7a5cb818c63471e878681263eba6
web       …/dsh-grok-workflow/lib/index.js       06c21cbb…d2590   (identical)
soak-hl   …/dsh-grok-workflow/lib/index.js       06c21cbb…d2590   (identical)
client.js (worktree + both installs)    bf590225f350577e98b87f5a9648a770d375f44bfa92edfa4997c0249a64f80a
grep -c auditTrail  (worktree, web, headless-soak)   1 / 1 / 1
```

### 3.3 The failing run

```
./run.sh overlay-soak.yml prompt-failing.txt run-failing.out
# -> dsh --profile headless-soak --patch overlay-soak.yml "$(cat prompt-failing.txt)"
#    under `timeout 1200`, DSH_HOME/HOME = the scratch home
```

Prompt: one caller task whose single acceptance criterion is a contradiction —
"the observed evidence proves that today is Monday **and** also that it is not
Monday" — with `context` forbidding invented evidence.

Result: **report status `failed`**, harness `exit=1 elapsed=905s`
(`soak-run-failing.out`); the model's own last line is `failed`.

The tool result, read out of the scratch session store
(`sessions/--…-.tmp-soak-audit-work--/session-779c7b3b…/session.v4.jsonl.zstd`,
`tool/result` event, written verbatim to `tool-result-failing.txt`):

- **24 792 characters** total; the answer half is **2 691** characters and the trail
  is the remaining **22 101**.
- first line `Grok workflow: FAILED` — the answer half is unchanged in shape.
- `Technical audit trail` present, **`Audit trail complete.`** present (the trail was
  not truncated).
- the trail's own head, verbatim:

  ```
  Technical audit trail (complete machine record; display-only copy — hiding this section never deletes the validated report it renders):
  Status: FAILED
  Objective (full): Soak: an unsatisfiable acceptance criterion
  Schema: grok-workflow/v1
  Plan: source=caller; tasks=1; waves=1
  Plan splits (1):
  - plan task impossible "Prove the impossible date": objective=Produce evidence that today is simultaneously Monday and not Monday.; expected output: One sentence naming today's weekday.
    criteria: The observed evidence proves that today is Monday and also that today is not Monday.; context: This criterion is unsatisfiable by construction. Never fabricate evidence.; writes paths=none declared
  Plan waves (1):
  - wave 1: impossible
  Limits: maxConcurrency=2; maxRetries=1; maxTasks=10; maxTotalAgents=24; deadline=900000 ms; child budget=300000 ms
  Chains: planner=soak-live/agent2api/deepseek-v4.1-flash; worker=…; verifier=…; supervisor=…; synthesizer=…
  Calls (7 recorded child calls, in order):
  - worker chain 0 attempt 1 via soak-live/agent2api/deepseek-v4.1-flash — ok — task impossible
  ```

  (The `Chains:` line is elided for width here; the file has all five roles spelled
  out, `supervisor` included.)

### 3.4 The completed run (the negative half)

Same rig, `prompt-completed.txt`: one caller task that is answerable — "What is
2+2? Answer with the number." Harness `exit=0 elapsed=260s`
(`soak-run-completed.out`).

Tool result (`tool-result-completed.txt`, session `session-798abb42…`):

- **1 276 characters**, first line `Grok workflow: COMPLETED`.
- `Technical audit trail` **absent**; `Audit trail complete.` **absent**.
- last line is the guard line, exactly as before this change.

So the same harness, the same machine and a real model produce the trail for the
failing run and no trail for the completed one.

### 3.5 Control: the same failing prompt against the released build

A first attempt at the failing run was made before the tarball was re-packed from
the worktree — it packed the **main checkout** by mistake, so the profile got the
released `0.13.32` (`lib/index.js` `bebf2a06…`), not this build. That run is a
useful control, so its tool result is kept
(`tool-result-failing-control-released-build.txt`): **report status `FAILED`,
2 628 characters, no `Technical audit trail`**. Same prompt, same profile shape,
same model, same failing outcome — the only difference is the build, and the trail
follows the build. The false start is recorded rather than hidden because it is the
proof that this soak can tell the two builds apart.

### 3.6 Live home and the running instance

- `~/.dsh` was never written; it is read-only to this process (the EROFS above is
  the operating system's answer, not a promise).
- No server was left running: both runs are one-shot `dsh` processes under
  `timeout`, and the scratch instance is gone with the process. No live instance
  was restarted, reloaded or killed.
- At the time of this soak the live `web` profile's own `dsh-grok-workflow` reads
  **`0.13.32`** — the released build, not this one; this block did not upgrade it.

## 4. What is *not* proven here (honest boundaries)

1. **The web shell was not exercised.** The failing/completed runs used the headless
   app shell inside the same scratch home; the web app cannot take a prompt and a
   second long-lived server was out of bounds for this block. The change lives in
   the plugin's `render` path and report module, which are shell-independent — but
   "it renders in the browser UI" was **NOT_RUN** here.
2. **The run's plugin configuration is the overlay's, not the live profile's.** The
   forked web profile is where the tarball was installed and where the version was
   read back; the run mounted the same installed package but with `mode: full` and
   all five roles on the soak provider. The live profile's own role chains (which
   point at providers keyed inside the live home) were not used.
3. **Trail size on failures is real.** 2 691 → 24 792 characters for one task. A
   long failing run will approach `AUDIT_MAX_CHARS` (96 000) and then end with the
   truncation line; the unit test covers the truncation marker, not a real 96 KB
   run.
4. **Carry-over is safe by line shape, not by section body.** `parseReportRound`
   keeps appending `- ` rows to the last section header it saw, so audit rows
   appended after `Uncertainties:` would extend that section (bounded by
   `itemsPerSection = 6`). The spec pins the parsed scalars and task rows as equal
   between the two views and pins that no parameterised line shape is re-emitted;
   it does **not** claim section bodies are byte-equal. In the current wiring this
   cannot reach the digest — only plugin-authored relay messages are parsed, and the
   PTC tool result is not one — but a future caller that relays the audit text would
   pollute that section. See `docs/knowledge/RESEARCH.md`, 2026-11-24.
5. **`plan.tasks[].dependsOn` / `wave` never appear in a validated report.**
   `assertWorkflowReport` rebuilds `plan.tasks` field by field and drops both, so
   the trail renders them only when a record carries them (proven on a hand-carried
   display test). Fixing that is a validator change, i.e. judgment semantics, which
   this block does not touch.
6. **One existing case was narrowed** (§5). That is the only existing-suite edit in
   the block; if the intended contract is instead "the tool view never carries
   machine terms even for a failed run", the one-line revert is the `auditTrail`
   argument in `src/index.ts`, and the trail stays available through
   `renderAuditTrail`.

## 5. The one existing case that changed

`test/human-output-contract.spec.ts` → "renders the registered tool view without
the ledger (T4 fixed)". Before: the whole tool text must contain no internal term
(`skipped busy`, `cross-run hint`, …). After: the *answer half* must contain no
internal term (unchanged assertion, scoped by the new `splitAuditTail` helper), and
the tail must be the labelled, self-closing section. Rationale in D-131: the entry
decision deliberately gives a non-completed run's tool result the machine record,
so "tool view == answer" is no longer true — but "the answer carries no internal
term" is, and stays asserted.

## 6. Files

| file | what it is |
| --- | --- |
| `red-1-module-missing.out`, `red-2-entry-missing.out` | the two red runs (module missing; option/entry missing) |
| `green-spec-13.out` | `test/report-audit.spec.ts` 13/13 |
| `scoped-two-specs.out` | `test/human-output-contract.spec.ts` + `test/report-audit.spec.ts`, 23/23, after the T4 narrowing |
| `ci-before-commit.out`, `ci-after-commit.out` | `npm run ci`, pre-commit tree and committed pair at `4502748` |
| `soak-run-failing.out`, `soak-run-completed.out` | harness stdout for the two runs |
| `tool-result-failing.txt` | the failing run's full tool result (trail included, 24 792 chars) |
| `tool-result-completed.txt` | the completed run's full tool result (no trail, 1 276 chars) |
| `tool-result-failing-control-released-build.txt` | the same prompt against the released `0.13.32` (no trail) |
| `overlay-soak.yml`, `prompt-failing.txt`, `prompt-completed.txt`, `run.sh` | the soak rig, exactly as run |
| `install-web-profile.out`, `install-headless-soak-profile.out`, `version-readback.out`, `build-identity.out` | tarball install, version read-back, sha256 identity |
| `default-view-parity.mjs`, `default-view-parity.out` | old-vs-new renderer byte comparison: 10 comparisons, 0 diffs |
| `ci-final-head.out` | `npm run ci` at the final commit `e5f971b`: EXIT=0, `lib/ at e5f971b is the build of src/ at e5f971b (249 files, byte-identical)`, `102 files / 1923 tests` |
| `verify-lib-committed-pair.out` | `npm run verify:lib` on the committed pair: `249 files, byte-identical`. The sha in that log line (`ec65283`) is the docs commit as it stood before this file's name was fixed; the amend changed no tree, only that commit object — the claim is about the tree. |
