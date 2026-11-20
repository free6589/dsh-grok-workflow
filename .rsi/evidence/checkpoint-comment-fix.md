# Checkpoint byte-bound comment accuracy — locked with a deterministic test

Task: `checkpoint_comment`. Scope: comment accuracy in `src/checkpoint/schema.ts`, one
new deterministic regression spec, this evidence note. No runtime behaviour change, no
commit, no `lib/` rebuild, no full CI.

## What the numbers actually are (derived, not quoted)

A sealed checkpoint file is `canonicalJson(payload) + ,"integrity":{...}`. The record
repeats the byte count in decimal, so its length is one fixed part plus one byte per
digit:

| quantity | value | how it was measured |
| --- | --- | --- |
| fixed part of the record | 122 bytes | `fileBytes - payloadBytes - digits` on a real sealed 4,000-byte payload (`test/checkpoint-bound.spec.ts:92-97`) |
| record at a 7-digit count | 129 bytes | 122 + 7 |
| `CHECKPOINT_LIMITS.maxBytes` (file bound) | 1,048,576 | `src/checkpoint/schema.ts:67` |
| legal payload top | 1,048,447 | 1,048,576 − 129, written at and read back in the spec |

`src/checkpoint/writer.ts:86-89` refuses the *file* (`fileBytes > maxBytes`), so the
payload ceiling is 129 bytes below the constant; `sealCheckpoint` in isolation
(`src/checkpoint/schema.ts:455-462`) still seals a payload up to `maxBytes` in memory.
The two bounds are what the comment now has to keep apart.

## Before / after (src/checkpoint/schema.ts)

Before — the constant carried a one-line doc that named no payload consequence, which is
the line a reader consults when they see `maxBytes`:

```ts
export const CHECKPOINT_LIMITS = {
  /** Maximum whole-file size accepted by writer and reader. */
  maxBytes: 1_048_576,
```

After (`src/checkpoint/schema.ts:58-66`):

```ts
export const CHECKPOINT_LIMITS = {
  /**
   * Maximum whole-file size accepted by writer and reader — a *file* bound, not
   * a payload bound. A sealed file is the canonical payload plus its `integrity`
   * record, which is 122 fixed bytes plus the decimal digits of the byte count
   * (129 bytes at a 7-digit count), so the legal payload tops out at 1,048,447
   * rather than here. {@link sealCheckpoint} on its own still seals a payload up
   * to `maxBytes` in memory; `writeCheckpoint` is what refuses the file that
   * would result. Pinned by `test/checkpoint-bound.spec.ts`.
   */
  maxBytes: 1_048_576,
```

The same numbers are also stated in the `integrity.bytes` comment
(`src/checkpoint/schema.ts:867-876`), which is unchanged by this round.

## Carried uncertainty, restated accurately

The uncertainty carried from prior rounds was that `schema.ts` said the refused band ran
to 1,048,576 while the true payload top is 1,048,447. The *sentence* that said that (on
`integrity.bytes`) was already corrected earlier: commit `a97d099` ("the payload-ceiling
comment claimed 129 bytes it did not have", RSI round 31). What remained unstated, and is
what this round fixes, is the number at the constant itself: `maxBytes` still read as "the
size a payload may be", which is exactly the reading that produced the original error. No
runtime line was touched — `git diff` is one docblock:

```
$ git diff --stat src/checkpoint/schema.ts
 src/checkpoint/schema.ts | 10 +++++++++-
 1 file changed, 9 insertions(+), 1 deletion(-)
```

## The locking test

`test/checkpoint-bound.spec.ts` (new, 5 tests, offline, no model, fixed `NOW`, scratch dir
under `tmpdir()`):

1. `measures the integrity record and derives the payload ceiling from it` — seals a real
   4,000-byte payload, measures the fixed part of the record (122), asserts the ceiling has
   7 digits, that the record there is 129 bytes, and that `maxBytes - 129 === 1,048,447`;
   then seals a payload of exactly the ceiling and asserts the record is 129 bytes.
2. `writes at the payload ceiling and reads the file back intact` — `writeCheckpoint` at
   1,048,447 produces a file of exactly 1,048,576 bytes; `readCheckpoint` returns the same
   `integrity.bytes` and checksum (writer/reader bound locked in one assertion pair).
3. `refuses one payload byte above the ceiling as too large` — 1,048,448 is `too-large`,
   while `sealCheckpoint` alone still accepts it (pins *which* bound refuses it).
4. `refuses a file above the bound before parsing it` — a 1,048,577-byte file is
   `too-large` from `readCheckpoint` (stat-before-parse).
5. `keeps the maxBytes comment stating the ceiling and the record it comes from` — reads
   `src/checkpoint/schema.ts` back and requires the `maxBytes` docblock to contain
   `1,048,447` and `129`.

Test 5 is the comment lock; it was checked red instead of assumed:

```
$ # comment mutated back to "tops out at 1,048,576", only that line changed
$ npx vitest run test/checkpoint-bound.spec.ts
 ❯ test/checkpoint-bound.spec.ts:145:21
    145|     expect(comment).toContain(PAYLOAD_CEILING.toLocaleString('en-US'))
 Test Files  1 failed (1)
      Tests  1 failed | 4 passed (5)
```

Only the comment assertion failed; the arithmetic and writer/reader assertions passed,
which is what shows the prose is locked independently of the behaviour. The source was
restored and verified byte-identical (`md5sum -c`) before the final run below.

## Scoped verification (the only suite run)

```
$ npx vitest run test/checkpoint-bound.spec.ts test/checkpoint-schema.spec.ts

 ✓ test/checkpoint-bound.spec.ts (5 tests) 1489ms
     ✓ measures the integrity record and derives the payload ceiling from it  643ms
     ✓ refuses one payload byte above the ceiling as too large  544ms
 ✓ test/checkpoint-schema.spec.ts (38 tests) 1229ms
     ✓ bounds the payload by the file bound minus the integrity record  568ms

 Test Files  2 passed (2)
      Tests  43 passed (43)
   Start at  16:08:16
   Duration  3.18s
EXIT=0
```

Static checks on the touched files (not `npm run ci`):

```
$ npx oxlint src/checkpoint/schema.ts test/checkpoint-bound.spec.ts
Found 0 warnings and 0 errors.  (2 files, 96 rules)
$ npx tsc -p tsconfig.json --noEmit
TSC_EXIT=0
```

`npm run ci` was **NOT_RUN** by instruction (the task states it is not required). Because
src comments are emitted into `lib/`, committing this comment without `npm run build`
would leave `lib/checkpoint/schema.js` one docblock stale; `lib/` is explicitly out of
scope here (and `verify:lib` compares committed HEAD, so it still reports the last
commit as consistent). Whoever commits this must run `npm run build` then
`npm run verify:lib` first.

## Out-of-scope observations (not changed)

- `src/checkpoint/writer.ts:15-18` still documents "3. **Bounded IO.** The writer refuses a
  payload above `CHECKPOINT_LIMITS.maxBytes` before touching the disk". The refusal is on
  the *file*, so that sentence carries the same imprecision this round fixed in
  `schema.ts`; `writer.ts` was outside the allowed edit set for this task.
- While this round ran, another process was editing this same checkout: `test/delivery-human-block.spec.ts`
  (first seen modified at 16:07:35, later grown to 191 changed lines), then `src/delivery/index.ts`
  (24 changed lines), and `.rsi/evidence/baseline-round39.md` appeared untracked. None of these
  are mine and none were touched. Consequently a bare `git diff` in this shared checkout is not
  a list of this task's changes: this task's contribution is exactly
  `src/checkpoint/schema.ts` (one docblock), `test/checkpoint-bound.spec.ts` (new), and this note.

## Files

- `src/checkpoint/schema.ts` — docblock on `CHECKPOINT_LIMITS.maxBytes` only (9 added, 1
  removed line, all comments).
- `test/checkpoint-bound.spec.ts` — new, 5 tests.
- `.rsi/evidence/checkpoint-comment-fix.md` — this note.

设备=n/a（本会话未暴露 lingshu 记忆工具），时间 2026-11-20
