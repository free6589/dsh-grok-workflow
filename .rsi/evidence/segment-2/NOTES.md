# Segment 2/5 — the loop keys reach the running plugin (host loop service)

Recorded 2026-11-19 ~07:38 +08:00 by `agent-42` (delegated segment worker).
Tree: `main` @ `37cb0fc`, working tree **dirty** (shared with other agents; see "Shared tree").

## What this segment was

The objective text handed to this segment was a corrupted concatenation of two unrelated
skill descriptions (an image/video skill's "keep model and provider selection
capability-based" line, and a crash-diagnosis skill blurb) and carried no usable
requirement. The segment was therefore reconstructed from the session's own verified
context, which names the work unambiguously:

- prior round theme: "P4 新功能：连续迭代模式（composer 开关 + 设置页参数 + schedule 心跳驱动）";
- the open verifier item carried into this round: `host_loop_service (quality): verifier
  verdict was fail`;
- `.rsi/ROUND.md` Round 14 records the defect that verdict pointed at: the four `loop*`
  keys were "stored, validated and projected, and **nothing read them**".

So the segment is the **host loop service**: the runtime half that turns the four
`loop*` configuration keys into an actual Host Schedule heartbeat.

## State found on arrival (not authored by this segment)

The runtime was already written in the working tree, uncommitted, by earlier work and by
sibling agents in the same tree:

| file | what it holds |
| --- | --- |
| `src/loop.ts` | the loop service: policy, RRULE building, row selection, serialized mutations, cleanup |
| `src/loop-surface.ts` | `grok_loop` tool + `POST /grok-workflow/loop` route + unload/stop/archive cleanups |
| `src/loop-brakes.ts` | the per-heartbeat brakes (stop marker, disposed, fail streak, daily/token/time caps) |
| `src/index.ts:295-311` | the wiring: `createLoopService` with `policy: () => loopPolicyFromConfig(readConfig()…)` |
| `src/gate.ts:1535-1575` | the brakes mounted in the gate's `pre-step` path |
| `src/client/index.js` | the composer-dock switch that POSTs the route |
| `test/loop*.spec.ts`, `test/client.spec.ts` | unit coverage of the above |

Gates on that tree before this segment touched anything: `npx tsc --noEmit` exit 0,
`npx oxlint src test` 0 errors (22 warnings), `npx vitest run` **61 files / 1133 tests
passed** (`vitest-baseline-before-wiring.txt`).

## What this segment added

One file: `test/loop-runtime-wiring.spec.ts` (5 cases). It covers the one claim none of
the existing tests could make, because all of them build their own service:

> the **built bundle** (`lib/index.js`), loaded into a **real DSH Loader composition**,
> reads the operator's `loop*` configuration and asks **Schedule** for the rule those
> numbers produce.

Cases:

1. config `{ timeoutMs: 3600000, loopIntervalMin: 180, loopMaxRounds: 7, loopFailStreak: 4 }`
   → `POST /grok-workflow/loop {action:'open'}` answers 200 with `intervalMinutes: 180,
   rounds: 7`, and the `create` request actually issued to Schedule carries
   `RRULE:FREQ=MINUTELY;INTERVAL=180;COUNT=7`, title `Loop heartbeat`, target
   `{kind:'session', sessionId}` and a prompt containing "the last 4 rounds failed in a
   row" (the configured streak, not the default 3).
2. a requested `intervalMinutes` below the configured floor cannot shorten the wait
   (90 → 180), and a second open refreshes the row instead of minting a second one.
3. a connection-fence rejection (403) stops the request before Schedule is touched.
4. disposing the plugin fiber deletes the row it owns (no ownerless heartbeat) and
   withdraws `grok_loop`.
5. in a composition with no web surface the route is simply not registered, while
   `grok_workflow` and `grok_loop` still mount.

The composition uses the real `Loader`, `SystemPrompt`, `ToolRuntime` and the real plugin
lifecycle. Schedule and the web server are recording fakes — the host's timer and durable
store are expensive and nondeterministic, and this file makes no claim about them.

## Evidence

| file | what it shows |
| --- | --- |
| `gates.txt` | `tsc` exit 0 · `oxlint` 0 errors / 22 warnings, 107 files · `verify:lib` exit 0 (HEAD pair only) |
| `wiring-spec-green.txt` | the new file: 1 file / **5 tests passed** |
| `vitest-full-with-wiring.txt` | whole suite in the working tree: **62 files / 1139 tests passed**, exit 0 |
| `mutation-unwired-policy.txt` | mutation replay: replacing `lib/index.js`'s `loopPolicyFromConfig(live.…)` with `loopPolicyFromConfig(0,0,10,3)` makes **2 of the 5** cases fail (`intervalMinutes 180 → 90`, `rounds 7 → 10`); the fence/cleanup/mounting cases stay green because they do not read the policy |
| `worktree-lib-build-check.txt` | the working tree's `lib/` is byte-identical to a fresh build of the working tree's `src/` (145/145 files, 0 differing) |

The mutation replay is the reason to trust the new cases: a green run of a test that never
reads the wiring would prove nothing, and `npm run verify:lib` cannot see this either — it
exports **HEAD** and compares HEAD's `lib/` with HEAD's `src/`
(`scripts/verify-lib.mjs:4-13`), so an uncommitted `src/`+`lib/` pair is outside its
reach. That gap is covered here by `worktree-lib-build-check.txt`, which is exactly the
v0.11.14 incident class (a committed `lib/` one build behind its `src/`).

## Not done / not claimed

- **No commit, no push, no tag, no version bump.** The tree belongs to a multi-agent round
  and the release path is not this segment's call.
- **A real heartbeat was not delivered** (`NOT_RUN`): the Schedule service in these tests
  is a recorder. D-066 makes the first real heartbeat an operator action.
- **The composer switch was not clicked in a live GUI** (`NOT_RUN`); the route it posts to
  is covered above, the browser path is covered by `test/client.spec.ts`.
- **No claim about `loopEnabled` being read.** It is documented as not read
  (`README.md:228`, `README.md:234`) and `src/index.ts:299-300` says the same; the switch
  is the user's explicit override. This segment did not change that, and the new spec does
  not assert otherwise.
- **Memory files were not edited by this segment.** `docs/knowledge/*` and `.rsi/STATE.md`
  had a live writer (`docs/knowledge/*`, `README*.md`, `docs/LOCAL-TESTING.md` changed
  during this turn), so the round record is left to the lead/records owner to avoid a
  clobber. What belongs in it: the new spec, the counts above, and the two evidence items.

## Shared tree note (for whoever lands the round)

Counts move while this tree is shared: an earlier run of the same suite in this session
measured 61 files / 1133 tests, the run after this segment added its file measured
62 / 1139 — one file is mine (5 cases) and the extra case came from a concurrent writer.
Anyone pinning the suite size in `README.md` / `docs/LOCAL-TESTING.md` should re-measure at
commit time rather than copy these numbers.
