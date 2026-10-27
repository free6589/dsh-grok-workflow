# Evidence bundle `evidence/t32/` — provenance

**What this directory is:** the Playwright evidence for the Web GUI settings page (requirement D)
and the activation mechanism, as re-taken in **t35** against plugin build **`0.2.1`**. The
screenshots and the `.txt` assertion files belong together: each `.txt` holds the DOM values the
neighbouring screenshot shows, so a claim can be checked without re-running the browser.

**Provenance, and why the directory is still called `t32`:**

| round | what happened |
|---|---|
| t32 | first attempt at the GUI closed loop. Its screenshots (`20-*`, `21-*`, `22-*`, `31-*`, `33-*`, `41-*`, `43-*`, `60-*`) were taken against a **stale install**: `dsh plugin add` had been given the same `file:` tarball path twice, which pnpm treats as a no-op, so the browser was running older bytes than the repository. Review (t34/F1) caught exactly that — evidence must be the delivered bytes. |
| t35 | re-installed from a **fresh path** with the `0.2.1` artifact, restarted the instance and **re-took every screenshot**; the t32 files listed above were deleted, not kept alongside. Everything in this directory is therefore t35 evidence under the t32 directory name. |
| t36/t37 | documentation-only corrections (release history, risk wording). No screenshot was re-taken, and none needed to be: the client bundle invariant — `68324a754a54ce36e6775618314592c5` for `src/client/index.js`, `lib/client.js`, `package/lib/client.js` in the tarball and the copy installed in the test profile — is unchanged. |

**Build the evidence describes:** `dsh-grok-workflow@0.2.1`, tarball md5
`3132a852aaef196e6dde311dd1d62c5a` (43 files, 120.9 kB, npm shasum
`b22595e9f0625182d5a2316c158d9ead1df64292`), installed into the throw-away profile
`web-grok-debug` (`DSH_HOME=/home/fish/dsh-layerfs`, `127.0.0.1:3199`). The user's live instance
(`:3090`) was never restarted, killed or reconfigured, and the profile is not the user's `web`
profile.

**Files:** `01`–`15`, each `.png` with its `.txt` where the numbers matter — see the table in
[`VALIDATION.md`](../../VALIDATION.md) (Round 3, "Screenshots and DOM assertions"). `14-host-refusal.txt`
is a boot-log excerpt rather than a screenshot: it records the Host refusing a saved chain whose
model the provider does not enumerate, which is the boundary between what the page can validate and
what only the Host can.
