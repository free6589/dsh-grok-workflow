# Archive: retired working-tree artifacts

Files here were once present in the working tree but are no longer part of it.
They are kept (byte-identical) so nothing is lost, and so the tree can be brought
back to a clean, publishable state. Being under `.rsi/`, they are process records:
not shipped (`package.json` `files` covers `lib/**`, `cordis.patch.yml`, the two
READMEs, `CHANGELOG.md`, `LICENSE`, `docs/images` and `docs/*.md` only).

## `settings-simple-mock.html`

- **Provenance**: operator-authored settings-page mock, created 2026-11-17 00:12,
  kept at the repository root as an untracked file through rounds 15–20. It was the
  design input for the simplified settings surface implemented in
  `src/client/index.js` (`T5 simplified surface`, see the comment at
  `src/client/index.js:35`) and recorded in `docs/knowledge/DECISIONS.md` D-055
  (mock 三轮定稿: master switch / execution model with five roles × fallback +
  supervision / advanced two numbers).
- **Why it left the root**: `.rsi/STATE.md` used to list it as a deliberately
  untracked file, which meant every `git status` in this repo carried a permanent
  `?? settings-simple-mock.html` line. The 2026-11-19 worktree-cleanup task requires
  a tree with no untracked residue, so the file was archived here instead of being
  deleted: the content stays reachable, the root stays clean, and the design record
  the mock fed into is already version-controlled.
- **Integrity**: `sha256 3fe1e657e697cbdb99bf8089a323f5efe09bbf12b1845e58f146fc4ad3cfaf34`,
  179 lines / 8856 bytes, identical to the copy that was at the repository root
  (verified with `cmp` before the root copy was removed).
- **Restore**:
  `cp .rsi/archive/settings-simple-mock.html ./settings-simple-mock.html`
  It is a self-contained static page (no external assets), so it opens directly in a
  browser after the copy.
