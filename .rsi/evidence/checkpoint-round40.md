# Checkpoint bound: comment accuracy locked by a deterministic spec (round 40)

Scope: the `CHECKPOINT_LIMITS.maxBytes` docblock in `src/checkpoint/schema.ts`, its
checkpoint spec `test/checkpoint-bound.spec.ts`, and this note. No runtime line changed,
no `lib/` rebuild, no commit, no full CI.

## 1. Provenance (what this round did and did not author)

The docblock and the first version of the spec were authored by the round-39
`checkpoint_comment` attempt in this same checkout (`git status` shows
`M src/checkpoint/schema.ts`, `?? test/checkpoint-bound.spec.ts`). This round:

1. derived the numbers again from the code instead of reading them out of the note or
   the comment (below), so the claim is checked rather than inherited;
2. strengthened the comment lock, which as inherited only asserted that the right
   numbers were *present* — a comment that kept a stale "tops out at 1,048,576"
   sentence beside them would have passed;
3. re-ran the scoped suite and recorded it here.

So the diff this task owns is: one docblock (`schema.ts`), one spec file
(`checkpoint-bound.spec.ts`), this note. Nothing else.

## 2. The numbers, derived from the implementation

`canonicalJson` (src/checkpoint/schema.ts:410-440) sorts keys, and `sealCheckpoint`
(:455-462) appends one `integrity` record. The extra bytes over the payload are
therefore `,"integrity":{"algorithm":"sha256","checksum":"<64 hex>","bytes":<digits>}`:

| quantity | value | how it was measured |
| --- | --- | --- |
| fixed part of the record | 122 bytes | sealed file − payload − digits, on a real 553-byte payload: `fileBytes 678 − 553 − 3 = 122` |
| digits at the ceiling | 7 | `1,048,447` |
| record at the ceiling | 129 bytes | 122 + 7 |
| `maxBytes` (file bound) | 1,048,576 | `src/checkpoint/schema.ts:67` |
| legal payload ceiling | 1,048,447 | largest `n` with `n + 122 + digits(n) ≤ 1,048,576` |
| file at the ceiling | 1,048,576 | `1,048,447 + 129` |
| file one payload byte over | 1,048,577 | `1,048,448 + 129` → refused |

Derivation run against the real modules (throwaway script in `/tmp`, deleted after;
`buildCheckpoint` + `sealCheckpoint` + `canonicalJson` + `stripIntegrity`):

```
{ payloadBytes: 553, fileBytes: 678, digits: 3, fixed: 122, maxBytes: 1048576 }
derived ceiling: 1048447 record: 129 file: 1048576 over-by-one file: 1048577
```

The refusal is on the *file*, on both sides: writer `src/checkpoint/writer.ts:86-89`
(`fileBytes > CHECKPOINT_LIMITS.maxBytes`) and reader `:145-146` (`info.size >` the same
constant, stat-before-parse). `sealCheckpoint` alone only refuses a *payload* above
`maxBytes`, i.e. it accepts 1,048,576 bytes of payload that `writeCheckpoint` then
refuses as a 1,048,705-byte file. That distinction is exactly what the docblock states:

```
Maximum whole-file size accepted by writer and reader — a *file* bound, not
a payload bound. A sealed file is the canonical payload plus its `integrity`
record, which is 122 fixed bytes plus the decimal digits of the byte count
(129 bytes at a 7-digit count), so the legal payload tops out at 1,048,447
rather than here. {@link sealCheckpoint} on its own still seals a payload up
to `maxBytes` in memory; `writeCheckpoint` is what refuses the file that
would result. Pinned by `test/checkpoint-bound.spec.ts`.
```

Every sentence in it maps to code: "file bound, not payload bound" → writer:86-89;
"122 fixed bytes plus the decimal digits" → §2 derivation; "129 at a 7-digit count" →
129; "tops out at 1,048,447" → derived ceiling; "sealCheckpoint on its own still seals
a payload up to maxBytes" → schema.ts:458 checks the payload against `maxBytes`. No
stale sentence remains at the constant: the other two `maxBytes` mentions in the file
are accurate as written (`:55` reader refuses a *file* larger than the bound, `:453`
`sealCheckpoint` refuses a *payload* above it), and the `integrity.bytes` comment
(`:867-876`) states the same 122/129/1,048,447 triple.

## 3. The locking test

`test/checkpoint-bound.spec.ts` — 5 tests, offline (imports are `node:fs/promises`,
`node:os`, `node:path`, `vitest`, and the two checkpoint modules only), fixed
`NOW = 1_700_000_000_000`, scratch dir under `tmpdir()` named with pid + random suffix,
removed in `afterEach`. Payload sizes are reached exactly by choosing the evidence-row
count and filling the remainder with the min-context digest, and the helper throws if it
does not land on the target — so no test depends on a megabyte scan.

1. `measures the integrity record and derives the payload ceiling from it` (:91) —
   seals a 4,000-byte payload and asserts the fixed record part is 122 and the count has
   4 digits; asserts the ceiling has 7 digits, the record there is 129, and
   `maxBytes − 129 === 1,048,447`; then seals exactly the ceiling and checks the record.
2. `writes at the payload ceiling and reads the file back intact` (:111) —
   `writeCheckpoint` at the ceiling reports `bytes === 1,048,576`; `readCheckpoint`
   returns the same `integrity.bytes` and checksum.
3. `refuses one payload byte above the ceiling as too large` (:122) — 1,048,448 is
   `too-large`, while `sealCheckpoint` alone still accepts it (pins *which* bound refuses).
4. `refuses a file above the bound before parsing it` (:131) — a 1,048,577-byte file is
   `too-large` from `readCheckpoint`.
5. `keeps the maxBytes comment stating the ceiling and the record it comes from` (:136) —
   the comment lock. **Changed this round:** it now anchors on the last `/**` before the
   `maxBytes: 1_048_576` declaration instead of on the phrase "Maximum whole-file size
   accepted" (so wording may change, numbers may not), requires `1,048,447`, `122` and
   `129` in that docblock, and rejects a stale `/tops out at 1,048,576/` sentence.

## 4. Red, not assumed

Both variants ran in a throwaway copy of the working tree (`/tmp/ckpt-red2`, `node_modules`
symlinked, live tree untouched, copy deleted afterwards) with only the comment edited:

```
--- variant A: ceiling claim replaced by the file bound ---
     × keeps the maxBytes comment stating the ceiling and the record it comes from
      Tests  1 failed | 4 passed (5)          A_EXIT=1

--- variant B: correct numbers kept, stale sentence appended ---
     × keeps the maxBytes comment stating the ceiling and the record it comes from
      Tests  1 failed | 4 passed (5)          B_EXIT=1
```

Variant B is the case the inherited assertion missed; the negative check catches it.
In both variants only the comment assertion fails — the arithmetic and writer/reader
assertions stay green, which is what shows the prose is locked independently of the
behaviour.

## 5. Scoped verification (the only suite run)

```
$ npx vitest run test/checkpoint-bound.spec.ts test/checkpoint-schema.spec.ts \
    test/checkpoint-wiring.spec.ts test/checkpoint-engine-wire.spec.ts
 ✓ test/checkpoint-bound.spec.ts (5 tests) 1497ms
 ✓ test/checkpoint-engine-wire.spec.ts (2 tests) 3652ms
 ✓ test/checkpoint-schema.spec.ts (38 tests) 1242ms
 ✓ test/checkpoint-wiring.spec.ts (31 tests) 516ms
 Test Files  4 passed (4)
      Tests  76 passed (76)
SCOPE_EXIT=0
```

`test/checkpoint-bound.spec.ts` alone: `5 passed (5)`, exit 0 — run three times over the
round (before and after the test-5 change), same result each time.

Static checks on the touched files only (not `npm run ci`, per task):

```
$ npx oxlint src/checkpoint/schema.ts test/checkpoint-bound.spec.ts
Found 0 warnings and 0 errors.  (2 files, 96 rules)      LINT_EXIT=0
$ npx tsc -p tsconfig.json --noEmit
                                                          TSC_EXIT=0
```

`npm run ci` and `npm run build`: **NOT_RUN** by instruction.

## 6. Footprint

Footprint at end of round 40 (verified after the `lib/` reconciliation in §8):

```
$ git status --short src/checkpoint test/checkpoint-bound.spec.ts lib/
 M src/checkpoint/schema.ts
?? test/checkpoint-bound.spec.ts
$ git status --short lib/
                                        (empty — 0 lines)
$ git diff --stat src/checkpoint/schema.ts
 src/checkpoint/schema.ts | 10 +++++++++-
 1 file changed, 9 insertions(+), 1 deletion(-)
```

- `src/checkpoint/schema.ts` — docblock only (9+/1−), sha256 `df9bfa9b…1834f3c7d`.
- `test/checkpoint-bound.spec.ts` — new, 5 tests, sha256 `357e0cd6…bb2d6b6bb`.
- `.rsi/evidence/checkpoint-round40.md` — this note. The sibling
  `.rsi/evidence/checkpoint-comment-fix.md` is the round-39 attempt's note for the same
  docblock; it is left as it was, and this note supersedes it on the test-5 description.
- `lib/checkpoint/**`: **clean at HEAD** — `git status --short lib/` returns nothing and
  the four artifacts hash to their committed content. This did not hold when §6 was first
  written; see §8 for what changed and why.

The tree is shared: `M CHANGELOG.md`, `M src/delivery/index.ts` and
`M test/delivery-human-block.spec.ts` belong to a concurrent writer, not to this task; none
of them was touched here. A bare `git diff` in this checkout is therefore not a list of
this task's changes.

**Correction to the first version of this section.** It claimed `lib/checkpoint/**` had no
diff and quoted a `git status --short` that ended at the new spec. That was true when typed
(19:08) and false by 19:15: a full build elsewhere in the shared checkout emitted this
task's uncommitted docblock into `lib/checkpoint/schema.{js,d.ts,js.map,d.ts.map}`, so the
delivered tree carried a modified `lib/`. The claim is fixed by restoring those artifacts,
not by editing the sentence, and the reconciled state is quoted above.

## 7. Carried caveats

- **`lib/` is stale by design, and that has a commit-order consequence.** Comments are
  emitted into `lib/`, so `lib/checkpoint/schema.js:54` still carries the old one-line
  docblock while `src/` carries the new one — verified on the restored file, not assumed:
  the line reads `/** Maximum whole-file size accepted by writer and reader. */`. Whoever
  commits this must run `npm run build` and then `npm run verify:lib` first; committing
  `src/` alone would make the committed `lib/` differ from the build of committed `src/`,
  which `verify:lib` reports as inconsistent. `lib/` was out of scope for this task, so no
  build was run and the artifacts were put back to HEAD (§8).
- `src/checkpoint/writer.ts:15-18` still says "The writer refuses a payload above
  `CHECKPOINT_LIMITS.maxBytes` before touching the disk" — the refusal is on the file, so
  that sentence carries the imprecision this round fixed in `schema.ts`. `writer.ts` was
  outside the allowed edit set.
- Test 5 reads the source file, so it is a source-level lock: it fails if the docblock is
  removed entirely, and it cannot detect a stale claim moved into a different comment
  block in the same file. The `integrity.bytes` comment is checked only by eye here.
- The numbers are locked at the current 7-digit ceiling. A future `maxBytes` that changed
  the digit width would need `CEILING_DIGITS`/`PAYLOAD_CEILING` updated in the spec — test
  1 fails loudly rather than silently re-deriving, which is intended.

## 8. Attempt 2: `lib/` reconciled, lock re-proved independently

The verifier rejected round-40 attempt 1 on one criterion only — `lib/` was not untouched
in the delivered tree — while confirming the comment, the spec and the scoped run. This
attempt addressed exactly that and re-derived the rest rather than trusting the note.

### 8.1 The numbers, re-derived without the spec

Certifying the comment using only the spec that guards it would be circular, so the numbers
were recomputed straight from the modules this attempt (throwaway `/tmp/ckpt-evidence/
derive.mts`, `tsx`, importing the real `src/checkpoint/schema.ts`):

```
payload0 552 file0 677 digits 3 fixed 122 maxBytes 1048576
ceiling 1048447 recordAtCeiling 129 fileAtCeiling 1048576 overByOneFile 1048577
DERIVE_EXIT=0
```

`fixed = file − payload − digits` is the same 122 the docblock states; the ceiling is the
largest `n` with `n + 122 + digits(n) ≤ 1,048,576`, which is 1,048,447; the file at the
ceiling is exactly 1,048,576 and one payload byte more is 1,048,577. Every figure in the
comment matches an independently computed value, so criterion 1 rests on arithmetic rather
than on the test's own constants.

### 8.2 What was wrong and what closed it

At inspection the tree carried four modified artifacts:

```
$ git status --short lib/
 M lib/checkpoint/schema.d.ts
 M lib/checkpoint/schema.d.ts.map
 M lib/checkpoint/schema.js
 M lib/checkpoint/schema.js.map
$ ls -la lib/checkpoint/schema.js
-rw-r--r-- 1 fish fish 40672 Nov 20 19:15 lib/checkpoint/schema.js
```

`git diff lib/checkpoint/` was **exactly and only** this task's uncommitted docblock
(60-line patch, 4 files, 20 insertions / 4 deletions: the one-line comment replaced by the
nine-line docblock, plus the two `.map` files re-pointing at it). No third-party content,
no delivery or other module. So the cause was a full `npm run build` run elsewhere in the
shared checkout at 19:15 — six minutes after this note was first written at 19:08 — which
is why the note's own status snapshot was falsified rather than wrong when typed.

A build is out of scope here, so the artifacts were restored to HEAD instead:

```
$ git restore -- lib/checkpoint/schema.js lib/checkpoint/schema.d.ts \
                lib/checkpoint/schema.js.map lib/checkpoint/schema.d.ts.map
RESTORE_EXIT=0
$ git status --short lib/ | wc -l
0
$ sha256sum lib/checkpoint/schema.js
da322d2aebce13dbe474634fae1832d9bf9cfbf061988fc8b7f869cbe8b1339a  lib/checkpoint/schema.js
```

The pre-restore diff and hashes are kept in `/tmp/ckpt-evidence/` for the record. `lib/` is
now byte-identical to HEAD, which is what "lib/ untouched" can mean for a task that is not
allowed to build. `src/checkpoint/schema.ts` was re-hashed after the revert and still reads
`df9bfa9b…1834f3c7d`; the spec still reads `357e0cd6…bb2d6b6bb`, so nothing about the
deliverable moved while `lib/` was put back.

### 8.3 The lock, re-proved in an isolated copy

A fresh throwaway copy (this round's own `/tmp/ckpt-iso-round40-3403840`: `src/`, the one
spec, `package.json`, `tsconfig.json`, `vitest.config.ts`, `node_modules` symlinked; live
tree never edited; directory removed after) first ran green unmutated (`5 passed`, exit 0),
then took three comment-only mutations:

```
C  original pre-fix one-liner restored
   × keeps the maxBytes comment stating the ceiling and the record it comes from
   AssertionError: expected '/** Maximum whole-file size accepted …' to contain '1,048,447'
   Tests  1 failed | 4 passed (5)                                   ISO_C_EXIT=1

A  ceiling off by one ("tops out at 1,048,448")
   × keeps the maxBytes comment stating the ceiling and the record it comes from
   AssertionError: expected '/**\n   * Maximum whole-file size acc…' to contain '1,048,447'
   Tests  1 failed | 4 passed (5)                                   ISO_A_EXIT=1

B  correct numbers kept, stale "tops out at 1,048,576" appended
   × keeps the maxBytes comment stating the ceiling and the record it comes from
   AssertionError: expected '/**\n   * Maximum whole-file size acc…' not to match /tops out at 1,048,576/
   Tests  1 failed | 4 passed (5)                                   ISO_B_EXIT=1
```

Variant C matters most: it is the *actual* text this task replaced, and it fails. Variant B
is the case the inherited assertion missed. In all three, only test 5 fails while tests 1–4
(the arithmetic, writer and reader assertions) stay green — the prose is locked, and it is
locked separately from the behaviour it describes.

### 8.4 Scoped run, this attempt

```
$ npx vitest run test/checkpoint-bound.spec.ts
 ✓ test/checkpoint-bound.spec.ts (5 tests) 1484ms
 Test Files  1 passed (1) / Tests  5 passed (5)                    BOUND_EXIT=0

$ npx vitest run test/checkpoint-bound.spec.ts test/checkpoint-schema.spec.ts \
    test/checkpoint-wiring.spec.ts test/checkpoint-engine-wire.spec.ts
 ✓ test/checkpoint-schema.spec.ts (38 tests) 1274ms
 ✓ test/checkpoint-wiring.spec.ts (31 tests) 526ms
 Test Files  4 passed (4) / Tests  76 passed (76)                  SCOPE_EXIT=0
```

No network, no model, no build, no `npm run ci`, no commit, no push. The isolated copy was
deleted (`no iso dirs remain`) and the live `src/checkpoint/` shows only the one modified
file.

### 8.5 Re-check before hand-off

The `lib/` drift was caused by *another* process building in this shared checkout, so it can
recur after this note is written. The state asserted in §6 is one command away from being
re-tested, and it is the last thing to run before trusting this file:

```
$ git status --short lib/ | wc -l        # must print 0
$ git status --short lib/checkpoint/     # must print nothing
```

If it prints anything, restore again with `git restore -- lib/checkpoint/` (the artifacts are
regenerable with `npm run build`) rather than editing this note.

设备=n/a（本会话未暴露 lingshu 记忆工具），时间 2026-11-20
