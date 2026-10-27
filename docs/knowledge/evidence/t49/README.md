# t49 — why the quality results were 0/5, and what 0.2.2 may claim

v0.2.2 release close-out, from t48's review items R1–R7. The load-bearing part is R2: the test
home held 12 reports with a single `COMPLETED`, and t46's five acceptance rounds were all
`FAILED / Failures: 1 quality`. This directory holds the analysis and the before/after runs of the
fix that came out of it.

Same instance discipline as Rounds 6–8: test home `/home/fish/dsh-v022-home`, profile
`web-v022-test`, listener `127.0.0.1:3100`. The live `:3090` instance (pid 1773499) was not
touched — and its profile, which the user has since edited, was neither read nor written by t49.

## 1. The twelve reports, classified

`A-report-verdicts.txt` (extracted from the session logs; the eight reason strings are quoted in
full there):

| Group | Count | Reason in the report |
|---|---|---|
| `COMPLETED` | 1 | — |
| failed — **quality** | **8** | all eight: `incomplete (quality): verifier reported issues: …` |
| failed — infrastructure / cancelled | 3 | two 60 000 ms deadline probes + one unload probe from t47: deliberate kills |

No report anywhere says `verifier verdict was fail`, `criterion not met`,
`criterion has no evidence` or `verifier supplied no checked evidence`.

## 2. Root cause — prose overrode the verdict (our defect)

`checkVerification` (`src/script.ts`) tests in this order: no structured result → executor failed →
`verdict !== 'pass'` → `issues.length > 0` → no checked evidence → criteria count → per-criterion
`met`/evidence. The reason string we observed is produced by the **fourth** test, and the fourth is
only reachable when the third did not fire. Therefore in all eight runs the verifier returned
`verdict: 'pass'`, and the task failed purely because its prose `issues` list was non-empty.

The notes say so themselves, verbatim:

- `Minor inaccuracy, non-blocking: the executor summary says "All five acceptance checks pass" although there are seven acceptance criteria. The substance of all seven still verified true on disk.`
- `Minor inaccuracy ... recorded as a minor observation rather than a failure ... does not affect any acceptance criterion`
- `Criterion 5 is verifiable only by attribution, not by a VCS diff ...` (a limitation of the evidence, not a failed criterion)
- `可验证证据种类受限 ... 不过该引述短小且四条验收条款均可直接逐字核对，风险很低`
- `处理合理，不影响本次字节级验证结论 ... 故判定为满足，但属于需注意的边界事实`

So the answer to *"is `deepseek-v4.1-flash` too strict as a verifier, or too weak as a worker?"*
is **neither**: it was passing the work and adding a caveat, and the plugin converted the caveat
into a failure. Secondary observation from the same data: the flash verifier never marked a single
criterion `met: false` in these twelve runs — model strength was not the limiting factor here.

## 3. The fix (0.2.2)

- The decision is `verdict` + one `criteria` entry per acceptance criterion with `met` and
  non-empty evidence (plus non-empty `checkedEvidence` and matching criteria count). `issues` no
  longer decides anything.
- A verified task's notes are carried into the report as `Uncertainties` → `verifier note: …`, so
  the reader still sees "this evidence is indirect" and nothing is silently dropped.
- The verifier prompt now defines `issues` as blocking problems only — each must be reflected in
  `verdict: fail` / `met: false` — and points residual doubt at `confidence`.
- Unchanged on purpose: `met: false` or `verdict: fail` still fails the task, and with
  `maxRetries: 0` a genuine quality problem is still a hard fail on the first attempt.

## 4. Verification

| Check | Result | Where |
|---|---|---|
| Three new tests: notes-only pass → `COMPLETED` with the notes in `Uncertainties`; `met: false` despite `pass` → failed; `verdict: fail` → failed. The `issues` strings are the **verbatim live ones** | pass (24/24 in `test/config.spec.ts`) | `test/config.spec.ts` |
| Mutation: restore `if (issues.length > 0) return { passed: false, … }` | **2 of the 3 new tests fail** → the tests really do detect the old behaviour | run in this task, see `notes.txt` |
| Live A/B, same three flash routes, the objectives that failed in t46 rounds 1/4/3 | before: `FAILED (quality)`; after: **`COMPLETED`, 1 task, 1 verified, one attempt** | `Q2-report.txt`, `Q4-report.txt`, `Q5-report.txt`, `Q5-run.png`, `Q5-run.log` |
| `npm run ci` | 21 files / **336 tests**, typecheck + lint clean | `notes.txt` |

**Honest limit of the live A/B:** in all three post-fix runs the verifier recorded *no* issues at
all, so the live delta is *consistent* with the fix but not *discriminating* — it does not by itself
prove the new branch was taken. The discriminating evidence is the branch-order argument in §2
(it is a proof, given the reason strings) plus the mutation-verified tests. Do not quote the live
runs as if they had exercised the notes path.

## 5. Two operational notes

1. **Read the Plugins-page switch; do not infer arming from `cordis.patch.yml`.** On a fresh boot at
   05:12 the card read *disabled* while the patch said `disabled: false`, and a message sent then
   was answered directly — no gate, no `plugin:grok-workflow/delivery` record in the session log
   (`Q1-first-probe.log`, `Q1-pre-fix-shot-no-run.png`). Clicking the switch armed it immediately: no
   restart, and the patch file's mtime did not change. A later fresh boot read *enabled*
   (`P1-plugins-switch.png`). The safe rule is the empirical one.
2. **This instance runs 20 bundles**, `@orbisapp/remote-dsh` included (t48 restored it), which closes
   the one-bundle gap in Round 6 row (h): boot still reports exactly the same three pre-existing
   non-activations.

## 6. Release wording (R2's consequence)

"Quality" must not be claimed. Precisely: the workflow **ran** every time (terminal state, no
hangs, fail-closed) and its reports told the truth, but it **accepted** almost nothing — 1 of 12
reports — and the reason was a defect on our side, now fixed. Post-fix, the shipped default
(`flash` for all three roles, `maxRetries: 0`) got 3 of 3 objectives through on the first attempt;
that is a sample of three, on one objective family each, and it is reported as such.

## Files

| File | What it shows |
|---|---|
| `A-report-verdicts.txt` | all 12 reports classified, the eight quality reason strings in full, and the branch-order proof |
| `Q2-report.txt`, `Q4-report.txt`, `Q5-report.txt` | the three post-fix reports: `COMPLETED`, 1/1 verified, `Model routes:` with the three flash chains, `Deadline: 3600000 ms` |
| `Q5-run.png`, `Q5-run.log` | the run node on screen and the probe's timing log (103.2 s) |
| `Q1-first-probe.log`, `Q1-pre-fix-shot-no-run.png` | the disabled-switch observation: no run, direct answer |
| `P1-plugins-switch.png` | the Plugins card, switch ON |
| `instance-facts.txt` | instance, bundle count, boot warnings, installed-vs-repo md5, the three runs |
| `notes.txt` | commands, timings, the mutation run, and what was deliberately not done |
