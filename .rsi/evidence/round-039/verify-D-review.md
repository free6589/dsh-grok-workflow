# RSI independent review — round-39 delivery change set (worker D, read-only)

Repo `/home/fish/projects_mine/dsh-grok-workflow`, branch `main`, HEAD `bffd0b4`.
Scope reviewed: UNCLOSED round-39 changes proposed for landing as `0.12.15`.
No edits/commits/builds/pushes/CI runs performed; read-only (`git diff/show/status`, `grep`, file reads).

## Verdict: PASS (conditional — one mandatory pre-stage deletion, see checklist item 1)

No red-line violation found in the tracked diff. The single leftover risk is the
untracked `test/tmp-ledger-probe.spec.ts`, which `finish-round.py`'s
`git add -A -- src test lib …` would stage and ship if not deleted first.

## Findings (expected vs observed)

1. **Single theme — PASS.** Expected: only `src/delivery`, `test/delivery-human-block`,
   `lib/delivery`, `POOL`, `stop-probes`, `.rsi/evidence` touched.
   Observed `git diff HEAD --stat`: exactly 8 files —
   `.rsi/POOL.md` (+27 R39 DONE entry), `.rsi/evidence/stop-probes.txt` (+1 guard line),
   `lib/delivery/index.{d.ts,d.ts.map,js,js.map}` (rebuilt artifacts),
   `src/delivery/index.ts` (+179/−24: `cutCodeUnits`, `composeHuman`→`composeHumanParts`
   + `clampHumanBlock`/`pairCaps`, `routeChains` validation), and
   `test/delivery-human-block.spec.ts` (+398/−2). Nothing outside the theme in
   tracked files. `git status --short` shows no other *modified* files.
2. **No weakened verification — PASS.** Expected: no deleted tests, no
   `.skip`/`.only`/`.todo`, no production loosening. Observed: the only 2 deleted
   lines in the spec diff are the old `import` lines, re-added in expanded form
   (`+import { deliverReport, humanConclusion, machineLedger, pairCaps } …`,
   `+import type { RoleName, WorkflowReport } …`). `grep -cE '\.skip|\.only|\.todo'`
   on the spec diff = **0**. No removed guard lines in `src` diff
   (`grep '^-[^-].*(throw|assert|Error|reject|valid|check)'` = empty).
3. **No new deps — PASS.** Expected: `git diff HEAD -- package.json package-lock.json`
   empty. Observed: empty (no output).
4. **Bilingual changelog ready — PASS.** Expected: EN+ZH for both bullets,
   `[Unreleased]` empty. Observed `.rsi/evidence/round-039/changelog-body.md` (30 lines):
   (a) EN "A bilingual delivery no longer loses the second language's verdict at the
   4800-character cap" + ZH "双语交付在 4800 字符上限处不再丢掉第二种语言的结论";
   (b) EN "The ledger's `Model routes:` line refuses a route that is not a
   `provider/model` label" + ZH "台账的 `Model routes:` 一行现在拒绝非
   `provider/model` 标签的条目". `CHANGELOG.md` `## [Unreleased]` is immediately
   followed by `## [0.12.14]` (empty), so `finish-round.py` inserts cleanly.
   `CHANGELOG.md` itself is unmodified in the tree, as expected pre-finish.
5. **Secret scan — PASS (clean).** Expected: staged diff empty; working-diff scan
   empty; no `cordis.patch.yml`/`LICENSE`/`.github` changes. Observed:
   `git diff HEAD --cached --stat` empty; `git diff HEAD -- src test lib CHANGELOG.md
   package.json | grep -nE 'BEGIN [A-Z ]*PRIVATE KEY|gh[pousr]_|sk-|AKIA|password\s*[:=]'`
   empty (exit 1, no match); `git status --short -- cordis.patch.yml LICENSE .github`
   empty. Evidence-note scan over `.rsi/evidence/*.md` + `round-039/` printed no
   matches (only placeholder-shaped prose, no key material).
6. **Staging risk — FLAGGED, actionable.** Expected: list untracked riders under
   `.rsi/evidence/`; tmp spec must not ship. Observed untracked riders:
   (a) `test/tmp-ledger-probe.spec.ts` (66 lines, `describe('probe')` /
   `it('measures the ledger clamp')` ending in `expect(true).toBe(true)`) — a
   leftover probe; `test/` is in the stage path, so it **MUST be deleted** before
   staging or it ships. (b) 19 untracked `.rsi/evidence/*.md` notes
   (baselines round-39/40, checkpoint ×2, ci-health, ci-lib ×2, delivery ×2,
   harness-round40, release-discipline-audit, runtime-audit, triage ×3,
   worklist-triage) + dirs `compact-audit/`, `harness/`, `heartbeat-rearm/`,
   `round-039/` (incl. `preserved/` with the deferred checkpoint-docblock patch +
   two `.spec.ts.txt` — correctly parked, not staged as live tests). All are
   evidence notes, no secrets — safe to ride along, though round-40 notes landing
   inside a round-39 release commit is untidy (advisory only, not a blocker).

## Landing checklist for the merger

1. [ ] **Delete** `test/tmp-ledger-probe.spec.ts` (`rm test/tmp-ledger-probe.spec.ts`;
   verify with `git status --short -- test/`). Do NOT ship it.
2. [ ] Re-run `git status --short` and confirm no other non-theme files appeared.
3. [ ] Run `python3 .rsi/tools/finish-round.py --round 39 --version 0.12.15`
   (inserts changelog body under empty `[Unreleased]`, stages theme paths only).
4. [ ] Inspect staged set (`git diff --cached --stat`): expect `src/delivery`,
   `test/delivery-human-block.spec.ts` (tmp spec absent), `lib/delivery`,
   `CHANGELOG.md`, `package.json` + `package-lock.json` (version bump),
   `.rsi/*` evidence/memory; nothing else.
5. [ ] Push normally; on failure retry ≤3 with backoff; **no force-push, no tag
   move** (release/tagging is the external release workflow's job post-CI).
6. [ ] Confirm CI green on the merged `main` commit before any `v0.12.15` tag.
