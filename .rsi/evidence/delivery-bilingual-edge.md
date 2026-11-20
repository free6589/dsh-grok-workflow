# Delivery: bilingual truncation edges (round 37, attempt 2)

Scope: `src/delivery/index.ts` (`cutCodeUnits`, `composeHuman` → `composeHumanParts` +
`clampHumanBlock`, `pairCaps`, `humanConclusion`) and `test/delivery-human-block.spec.ts`.
Working tree only: nothing committed, nothing pushed, no full CI, no credentials touched.
All times are local (Asia/Singapore), 2026-11-20.

Attempt 2 changes relative to attempt 1: the pair-budget arithmetic is extracted into an
exported pure `pairCaps` and pinned by five direct tests (attempt 1 left it untested because
no fixture drives both blocks to the cap at once), and the `lib/` artifacts that a concurrent
build had swept this change into are restored to `HEAD` so this task's diff no longer carries
`lib/`.

## What was wrong (CONFIRMED, measured)

Round 36 kept head+tail *inside* one language block; the edges around it leaked.

1. **The pair clamp was a blind cut.** `humanConclusion` did
   `both.length <= cap ? both : \`${both.slice(0, cap - 1)}…\``. One block at the
   single-pass cap plus one one character short plus the two-character separator is
   **4801** — one over `MAX_HUMAN_CHARS * 2` — and the cut then ate the last characters
   of the **second** language's verdict. Replayed against `HEAD`'s module
   (probe output below): `knob=220 en=2399 zh=2400 concat=4801 out=4800 zhTailWhole=false`,
   tail `"…明细已记入台…"` where it used to read `"…明细已记入台账。"`.

2. **The middle cut ignored line breaks and inserted no marker.** The over-cap block ended
   `"...note note note note note no"` immediately followed by the verdict: a half-word
   stitched onto the conclusion, with nothing telling the reader that text was missing.

3. **Every clamp cut through UTF-16 code units.** `oneLine` and the block cut used
   `String#slice`, so a cut between the halves of an astral character left a lone surrogate
   (renders as a replacement box). Measured on the pre-fix source with a caveat of
   `'😀'.repeat(200)`: `high surrogate at 1721`.

4. **When the cap could not hold head and verdict, the verdict was dropped**
   (`budget <= 0 → head.slice(0, MAX - 1) + '…'`). The count lives only in the tail, so the
   tail is the wrong end to sacrifice.

## Fix

- `cutCodeUnits(text, max)` — one surrogate-safe cut used by `oneLine` and by the block clamp.
- `composeHumanParts(report, lang)` returns `{ block, tail }`, so the caller knows which
  sentence is the verdict instead of re-deriving it by suffix comparison.
- `clampHumanBlock(block, tail, cap)` reserves `…\n` + the whole verdict first, shrinks the
  head only if the cap cannot hold both, ends the cut middle on a line break when its window
  has one (every line there is bounded by `oneLine`, so at most one bounded line is given
  back), and marks the junction with `…`.
- `pairCaps(firstLen, secondLen, budget)` — the pair is bounded by **allocating** the budget
  (`min(len, floor(budget / 2))`, then whatever the shorter block does not need is topped up)
  instead of slicing the concatenation, so a block is cut only when the two together
  genuinely overflow and no block can be dropped or blind-sliced. It is a pure function and
  is exported *for this spec*: the arithmetic is what failed, so it is pinned with the
  incident's own numbers.
- Under-cap behaviour is untouched: `clampHumanBlock` returns the block as-is when
  `block.length <= cap`, and under-cap allocation gives each block its full length.

## Red → green

Command (every run below):

```
cd /home/fish/projects_mine/dsh-grok-workflow && npx vitest run test/delivery-human-block.spec.ts
```

RED — the edge tests against the round-36 module, run in a scratch copy of the tree with
`git show HEAD:src/delivery/index.ts` as `src/delivery/index.ts` (the repo's own source was
never overwritten this time; `pairCaps` does not exist at `HEAD`, so the arithmetic block is
removed from the scratch copy to let the behavioural tests load):

```
     ✓ keeps the head and the verdict when the block is over budget 3ms
     ✓ still fits a short block unchanged 1ms
     ✓ keeps the second language head and verdict, not just the first 3ms
     × keeps the second language verdict whole when the first block is at the cap 144ms
     × keeps both verdicts when the first language is Chinese 130ms
     ✓ charges neither language more than the single-pass cap 237ms
     × keeps the head and the whole verdict and cuts only at a line boundary 4ms
     × marks the cut so a reader knows the middle is missing 2ms
     × keeps the same guarantee in the Chinese block 2ms
     × leaves no lone surrogate when a caveat is longer than one clamped line 2ms
     × leaves no lone surrogate in either language of a bilingual pair 3ms
     ✓ is exactly the two single-language blocks and one blank line 7ms
     ✓ adds no cut marker to a block that fits 1ms
      Tests  7 failed | 16 passed (23)
```

Failure texts, verbatim:

```
AssertionError: expected 'Answer: Done.\nNext: The direction wa…' to contain '以上是结论（6 项里 1 项可用，5 项没做成）；明细已记入台账。'
AssertionError: expected [ 'high surrogate at 1721' ] to deeply equal []
AssertionError: expected [ 'high surrogate at 1655', …(1) ] to deeply equal []
AssertionError: expected [ 'Answer: Done.', …(14) ] to include '…'
```

The 13 tests the spec had at `HEAD`, plus three of the new guards (`charges neither language
more than the single-pass cap` and the two under-cap identity tests), pass before and after —
16 of 23 in the scratch copy — which is what makes the seven above defects rather than a
rewrite. The spec is 28 tests now (13 at `HEAD` + 15 new).

GREEN — after the fix, twice in a row (same command, no state carried between runs):

```
 ✓ test/delivery-human-block.spec.ts (28 tests) 780ms

 Test Files  1 passed (1)
      Tests  28 passed (28)
```

Delivery-adjacent specs (nothing else regressed):

```
npx vitest run test/delivery.spec.ts test/delivery-human-block.spec.ts \
  test/gate-partial-head.spec.ts test/human-output-contract.spec.ts test/gate.spec.ts
  → Test Files 5 passed (5) / Tests 116 passed (116)
```

Static checks on the changed code:

```
npx tsc -p tsconfig.json --noEmit                                   → exit 0
npx oxlint src/delivery/index.ts test/delivery-human-block.spec.ts  → Found 0 warnings and 0 errors. (96 rules, 2 files)
```

## Boundary measured old vs new (temporary probes, both removed afterwards)

Round-36 pair formula replayed on the old module's own single-language blocks:

```
PROBE_OLD knob=219 en=2399 zh=2399 concat=4800 out=4800 zhTailWhole=true
PROBE_OLD knob=220 en=2399 zh=2400 concat=4801 out=4800 zhTailWhole=false tail=" note n\n以上是结论（6 项里 1 项可用，5 项没做成）；明细已记入台…"
PROBE_OLD knob=221 en=2399 zh=2400 concat=4801 out=4800 zhTailWhole=false tail=" note n\n以上是结论（6 项里 1 项可用，5 项没做成）；明细已记入台…"
PROBE_OLD knob=222 en=2399 zh=2399 concat=4800 out=4800 zhTailWhole=true
```

The same knobs on the fixed module, plus the allocation arithmetic:

```
PROBE_NEW caps(2400,2400)=[2399,2399] caps(2400,2399)=[2399,2399] caps(2400,100)=[2400,100] caps(300,500)=[300,500]
PROBE_NEW knob=220 en=2310 zh=2400 caps=[2310,2400] biLen=4712 halves=2 enHead=true enTail=true zhTail=true
PROBE_NEW knob=221 en=2310 zh=2400 caps=[2310,2400] biLen=4712 halves=2 enHead=true enTail=true zhTail=true
PROBE_NEW knob=222 en=2312 zh=2161 caps=[2312,2161] biLen=4475 halves=2 enHead=true enTail=true zhTail=true
```

Under-cap output is byte-identical between the round-36 module and the fixed one — same
length and same sha256 prefix for both single-language blocks and for the bilingual pair,
in both orders (`biIsConcat=true`):

```
[OLD] PROBE_UNDER partial zh=301/f8d45421778eeee9 en=455/a0defe945d22d3f1 bi=758/5c8ef78bfb649c25 biIsConcat=true
[NEW] PROBE_UNDER partial zh=301/f8d45421778eeee9 en=455/a0defe945d22d3f1 bi=758/5c8ef78bfb649c25 biIsConcat=true
[OLD] PROBE_UNDER edge60  zh=2240/7da5fe2ba69cf9fe en=2391/82b6abd4cf4e4357 bi=4633/62be4f50678f0d42 biIsConcat=true
[NEW] PROBE_UNDER edge60  zh=2240/7da5fe2ba69cf9fe en=2391/82b6abd4cf4e4357 bi=4633/62be4f50678f0d42 biIsConcat=true
```

## The tests (deterministic: real validator, no engine, no clock, no network)

Fixture `edgeReport({ knob, mark, emoji })` builds a legal six-task PARTIAL report through
`assertWorkflowReport`; `knob` is the length of one failure reason, so the composed block
moves **one code unit per step** and the sweep walks the whole boundary (under, at, over the
cap) in both languages.

| test | pins |
| --- | --- |
| `keeps the second language verdict whole when the first block is at the cap` | en-first pair, 121 knobs: total ≤ 4800, both heads, `EN_TAIL` **and** `ZH_TAIL` intact, no lone surrogate |
| `keeps both verdicts when the first language is Chinese` | the mirrored order, same assertions |
| `charges neither language more than the single-pass cap` | each half ≤ 2400 and both halves present |
| `gives both blocks room when each one sits on the single-pass cap` | `pairCaps(2400, 2400, 4798) = [2399, 2399]` (neither language emptied) |
| `closes the 4801 window the blind pair cut fell through` | `2400 + 2399 + 2 = 4801`; the split returns `[2399, 2399]`, the shorter block keeps **all** 2399, and the overflow is charged to the block with slack |
| `never shortens a pair that already fits` | `[300,500]`, `[1200,3598]`, `[1,1]` come back unchanged |
| `hands the unused half to the block that needs it` | `pairCaps(2400, 100, 4798) = [2400, 100]` — the long block is delivered whole instead of clipped for symmetry |
| `never returns a negative cap, whatever the budget` | budgets `0, 1, 3, 10, -5`: caps ≥ 0 and their sum ≤ the (clamped) budget |
| `keeps the head and the whole verdict and cuts only at a line boundary` (en + zh) | over-cap block: head kept, verdict kept, every content line still ends with the fixture's `ENDZ` sentinel (a mid-line cut loses it) |
| `marks the cut so a reader knows the middle is missing` | the `…` junction line exists |
| `leaves no lone surrogate …` (single block + bilingual pair) | astral-safe cut |
| `is exactly the two single-language blocks and one blank line` | under-cap bilingual output is byte-identical to `zh + "\n\n" + en` both ways round |
| `adds no cut marker to a block that fits` | no `…`, verdict intact |

## Honest limits

- **The pair-level *cut* still never fires end to end.** With the line-break-aware block
  clamp, an over-cap block lands at or below the cap and the composed pair tops out at
  `biLen=4712` in the sweep; no legal report in this fixture family drives both blocks to
  2399+ at once (the two languages share the run's own content and differ by a fixed
  boilerplate delta). What is now pinned is the arithmetic itself (`pairCaps`, five direct
  tests with the incident's numbers) rather than a composed call that reaches the branch.
  The end-to-end guarantee is still observable: the sweep is red on the old source at the
  4801 window and green now.
- **`keepTail.length >= cap` (verdict-only fallback) is unreachable in practice**: the head
  is ≤ ~408 characters and the tail ≤ ~90, so the reservation always leaves room. Kept as a
  guard so a future cap change cannot regress to dropping the verdict; not covered by a test.
- **One bounded line of budget can be given back** at a cut to reach a line break, so an
  over-cap block is slightly shorter than the cap (`en=2310` where the old cut used 2399).
  Deliberate — whole statements over maximal character use — and the cap still holds; but
  over-cap output shape differs from round 36, which is a visible change, not a pure fix.
- **`pairCaps` is exported for the spec.** It is a pure helper with one production caller;
  the export exists so the allocation can be tested without a fixture that cannot exist.
- **`lib/` is out of scope and is left at `HEAD`.** A concurrent build in this checkout had
  emitted this change into `lib/delivery/index.js` (16:12:36); it was restored to `HEAD`
  with `git checkout -- lib/` (`git status -- lib/` → empty, `grep -c "Round 37"
  lib/delivery/index.js` → 0). `scripts/verify-lib.mjs` builds `HEAD` in a temp dir and never
  reads the working tree's `lib/`, so this changes nothing it measures. Whoever commits this
  must run `npm run build` then `npm run verify:lib`, or `lib/` will be one round stale.

## Working-tree scope

Edited by this task:

- `src/delivery/index.ts`
- `test/delivery-human-block.spec.ts`
- `.rsi/evidence/delivery-bilingual-edge.md` (this file)

`git diff --name-only` at the end of this attempt:

```
src/checkpoint/schema.ts            ← NOT this task (round-39 checkpoint-comment worker)
src/delivery/index.ts               ← this task
test/delivery-human-block.spec.ts   ← this task
```

**Not mine, present in the same working tree** — other round-39 workers share this checkout;
their mtimes and their own evidence files show the split:

```
16:06:55  test/checkpoint-bound.spec.ts        (new, untracked)
16:07:57  src/checkpoint/schema.ts             (their `maxBytes` docblock fix)
16:09:25  .rsi/evidence/baseline-round39.md
16:10:30  .rsi/evidence/triage-round39.md
```

`src/checkpoint/schema.ts` is a comment-only change (10 lines) that
`.rsi/evidence/checkpoint-comment-fix.md` describes in its own words; its untracked
`test/checkpoint-bound.spec.ts` is its test. I did not edit, revert or commit any of those
files: reverting another worker's uncommitted source would destroy their work, so the overlap
is reported instead of "cleaned up". Everything else in the tree (`lib/**`) is byte-identical
to `HEAD`.

---

## Independent re-verification (2026-11-20, attempt 3 — this run)

Everything above was re-run from scratch here rather than taken on trust; the numbers below are
this run's own output. All times local (Asia/Singapore).

### Red, reproduced myself (not carried over)

The probe spec was rebuilt from the current spec by dropping only the `pairCaps` import token and
the pair-arithmetic `describe` block (that helper does not exist at `HEAD` and would fail to
load), then run with `git show HEAD:src/delivery/index.ts` swapped into `src/delivery/index.ts`:

```
cd /home/fish/projects_mine/dsh-grok-workflow
npx vitest run test/tmp-oldcode-probe.spec.ts        # against HEAD's module
 Test Files  1 failed (1)
      Tests  7 failed | 16 passed (23)
```

```
AssertionError: expected 'Answer: Done.\nNext: The direction wa…' to contain '以上是结论（6 项里 1 项可用，5 项没做成）；明细已记入台账。'
AssertionError: expected '答案：Done.\n下一步：方向对了但没达到验收标准；把验收标准说细一点再…' to contain 'That is the conclusion (1 of 6 usable…'
AssertionError: expected [ Array(1) ] to deeply equal []
AssertionError: expected [ 'Answer: Done.', …(14) ] to include '…'
AssertionError: expected [ Array(1) ] to deeply equal []
AssertionError: expected [ 'high surrogate at 1721' ] to deeply equal []
AssertionError: expected [ 'high surrogate at 1655', …(1) ] to deeply equal []
```

The fixed source was then restored from a byte copy and the probe spec deleted
(`git status test/tmp-oldcode-probe.spec.ts` → not present).

### Green, in an isolated tree

The shared checkout's `npm run typecheck` is red for a reason that is **not** this task: another
round-39 worker has an untracked `test/config-chain-types.spec.ts` in the tree
(`error TS2352`, `roles.worker` cast). A pristine `git archive HEAD` export typechecks clean, so
CI was run in an isolated tree — `git archive HEAD` + only this task's two files + the CHANGELOG
entry:

```
cd /tmp/iso && npm run ci
  tsc -p tsconfig.json --noEmit        → TYPECHECK_EXIT=0
  oxlint src test                      → LINT_EXIT=0 (Found 24 warnings and 0 errors)
  node scripts/verify-lib.mjs          → lib/ at eab7692 is the build of src/ at eab7692 (153 files, byte-identical)
  vitest run                           → Test Files 70 passed (70) / Tests 1284 passed (1284)   FULL_EXIT=0
```

`HEAD` carried 1269 tests, so `1284 - 1269 = 15` is exactly the number of guards this spec adds.

Determinism of the named file, two consecutive runs in that tree:

```
 ✓ test/delivery-human-block.spec.ts (28 tests) 795ms
 Test Files  1 passed (1) / Tests  28 passed (28)
 ✓ test/delivery-human-block.spec.ts (28 tests) 808ms
 Test Files  1 passed (1) / Tests  28 passed (28)
```

Changelog-adjacent specs after the `[Unreleased]` entry was added
(`test/docs-version.spec.ts`, `test/gate.spec.ts`, `test/i18n-parity.spec.ts`,
`test/delivery-human-block.spec.ts`): 4 files / 94 tests, `EXIT=0`.

### What this run changed on top of the earlier attempt

- `CHANGELOG.md` — one `[Unreleased] / Fixed` bullet, English and Simplified Chinese (the
  delivered bilingual text changes shape at the boundary, so it is user-visible and the repo
  rule in `AGENTS.md` requires the entry).
- `lib/delivery/index.js`, `.d.ts`, and their two map files — the build of the changed module.
  A concurrent worker's `npm run build` in this checkout had already emitted them from the
  working-tree `src/`, and they are **kept** rather than reverted: `scripts/verify-lib.mjs`
  compares `HEAD`'s `lib/` with the build of `HEAD`'s `src/`, so a commit that carried
  `src/delivery/index.ts` without its artifact would fail `npm run ci` at `verify:lib`. The
  four files are byte-identical to the artifact the isolated tree verified
  (`diff -q` on each → `same`), where `verify:lib` printed
  `lib/ at eab7692 is the build of src/ at eab7692 (153 files, byte-identical)`.
  `lib/checkpoint/*` — the same build's output for the other round-39 worker's uncommitted
  `src/checkpoint/schema.ts` — was restored to `HEAD` (`git checkout -- lib/checkpoint/`), so
  this task's diff stays inside the truncation module.

### Green in the shared checkout too, after the other worker fixed their spec

By 18:20 the shared tree's typecheck was clean again, so the real `npm run ci` was run there
(the tree the verifier will see, including the other round-39 workers' untracked specs):

```
cd /home/fish/projects_mine/dsh-grok-workflow && npm run ci
 Test Files  72 passed (72)
      Tests  1295 passed (1295)
REAL_CI_EXIT=0
```

72 files / 1295 tests against 70 / 1284 in the isolated tree: the difference is the two other
workers' untracked specs (`test/checkpoint-bound.spec.ts`, `test/config-chain-types.spec.ts`),
not this task's. `lib/delivery/*` was then confirmed byte-identical to the isolated tree's copy
and `lib/checkpoint/*` restored to `HEAD`, as described above.
