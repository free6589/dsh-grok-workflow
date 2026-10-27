# Grok Workflow for DSH 0.2.1 — release notes

**Status: draft.** The `v0.2.1` tag and its GitHub Release are created by the release operator
**after** the final acceptance pass, following [the release guide](../RELEASING.md). The text the
release workflow publishes is the bilingual `## [0.2.1]` section of
[CHANGELOG.md](../../CHANGELOG.md), extracted verbatim.

## What this release is

`0.2.1` is an **incremental** release on top of the published `0.2.0` (tag `f7a244c`, GitHub
Release 2026-10-26T17:10:16Z, 42 files / 108,428 B — see
[RELEASE-NOTES-0.2.0.md](RELEASE-NOTES-0.2.0.md)). It adds the Web GUI settings page and documents
the activation prerequisite. What `0.2.0` shipped — the mandatory gate for user messages, per-role
ordered fallback chains, failure classification, write-path isolation, the reliability suite — is
unchanged, and is described once, in the `0.2.0` notes.

### New in `0.2.1`

- **A settings page in the Web GUI.** The plugin now ships its own browser bundle, so the Plugins
  page shows a **Grok workflow** card rendering all 21 configuration keys: 17 live fields, four
  per-role chains edited in place (add / remove / edit a route, at most three per role), and four
  structural keys shown read-only with the reason. Invalid input is refused with its reasons
  before it reaches the Host; a save applies to the **next** message and lands in the profile's
  `cordis.patch.yml`.
- **The page follows the row that projects the plugin's fields.** The settings namespace is the
  Loader row id, so a profile that renames the row moves the page instead of silently losing it;
  when no row projects the fields the browser console says so, naming the likely cause.
- **The activation prerequisite is documented, not implied.** `@deepseek-ai/dsh-web-app` ships
  `workflow-ptc` disabled, so on `dsh web` the composed row is necessary but not sufficient. The
  install and upgrade steps now include re-enabling a workflow provider, plus the four checks that
  prove activation (clean boot, served namespace, GUI card, `grok_workflow` in a real session's
  tool list).

## Breaking changes

**None since `0.2.0`.** The configuration surface, the report shape and the gate defaults are
unchanged. The one operational addition is the install-time step above: a profile on `dsh web`
that does not enable a workflow provider leaves the plugin `pending`, which looks like "the update
did nothing" rather than like an error.

## Artifact

| | `0.2.0` (published) | `0.2.1` |
|---|---:|---:|
| Files in the tarball | 42 | **43** |
| Tarball size | 108,428 B | **121.5 kB** |
| Browser bundle (`lib/client.js`) in the package | no | **yes** |
| Both READMEs (EN + zh) | yes | yes |
| `CHANGELOG.md` in the package | yes | yes |
| `test/`, `scripts/`, `docs/knowledge/` in the package | no | no |

The delta since `0.2.0` is the browser bundle (`lib/client.js`) plus its build script and tests; the
`files` whitelist is `lib/**/*.js`, `docs/*.md`, `docs/images` — so the
development knowledge base (`docs/knowledge/`, `docs/releases/`) is not shipped.

**The bytes that were verified are the bytes in the tarball** — measured, not asserted:

| artefact | md5 |
|---|---|
| `dsh-grok-workflow-0.2.1.tgz` | `b1401eeb9ba0f425ab646af7f9dc12be` (npm shasum `12ba3363ac515a02dc4125787c1c04508ef2edd8`) |
| `src/client/index.js` = `lib/client.js` = `package/lib/client.js` inside the tarball = the copy installed in the test profile | `68324a754a54ce36e6775618314592c5` |

`npm pack` is reproducible for this tree (two packs, same md5), so that tarball hash is a real
identity: rebuild it from the tagged commit and compare before publishing.

## Verification behind this release

- `npm run ci` — typecheck, lint (0 warnings / 0 errors), build, **284 tests / 19 files**. A
  clean copy (`rsync` without `node_modules`/`.git`, then `npm ci && npm run ci`) gives the same
  result.
- Isolated profile: `dsh plugin add` of the packed tarball into a fresh `DSH_HOME` profile, then
  a real one-shot turn (`hi`) that produced a validated workflow report
  (`Grok workflow: COMPLETED`).
- Settings identity: `node scripts/smoke-settings-identity.mjs` feeds the built plugin the
  descriptor produced by the DSH installation's own `dsh-settings` projection — the plugin
  recognises the page (`identified by value`) instead of reporting it unreadable.
- Real headless one-shot delivery with a live model route: the report reached the user in the
  same turn (`scripts/e2e-headless-in-turn.sh`).
- **Web GUI (new in `0.2.1`).** On a separate profile and a separate instance
  (`127.0.0.1:3199`, never the running one): the Plugins page renders a **Grok workflow**
  card; the page shows all 21 configuration keys and edits per-role chains in place; a
  Playwright run changed `maxConcurrency` 3 → 5 and appended a `planner` route, the write
  landed in the profile's `cordis.patch.yml`, survived a restart and appeared in
  `settings/describe`; invalid input is refused with reasons. A real GUI turn (`hi`) ran the
  full workflow and answered with a validated report — model routes and one real
  `format-error` route switch included. Details: `docs/knowledge/VALIDATION.md` Round 3.

## Known limitations (unchanged honesty)

- Long-lived delivery while the parent is idle (NR-1) is still unmeasured; `in-turn` — the
  default — does not depend on it.
- The settings page (NR-7) and a real settings edit against a live Loader (NR-8) are now
  **measured on a separate profile**, not on the user's primary instance; a settings edit
  applies to the next message, and a hand-edited patch file still needs a reload.
- Real provider failure texts (NR-5) and real-provider route switching end to end (NR-6) are
  not measured; unmatched failures are reported as `unknown` rather than guessed.
- **Planner fill-rate for `writesPaths` is not established** (NR-9): in the single measured
  sample, with the objective explicitly asking for declarations, the planner declared nothing.

## How to install

```sh
dsh plugin --profile <name> add github:free6589/dsh-grok-workflow#v0.2.1
```

Then **re-enable a workflow provider** in the profile's `cordis.patch.yml` — the web app
ships it disabled, and without it the plugin stays `pending (waiting for service:
workflowEngine)` with no tool, no gate and no settings page:

```yaml
- id: workflow-ptc
  config:
    provider: spawn
  disabled: false
```

Restart the profile afterwards. Roll back by installing `#v0.1.0`.

**Upgrading a live profile** (backup → install from a fresh path → verify the installed bytes →
check `dsh.profile.bundles` → 🔴 restart, which needs the user's authorisation) is written out
step by step in [`../LOCAL-TESTING.md`](../LOCAL-TESTING.md#activate-in-an-existing-live-profile--needs-the-operators-authorisation). The four checks that prove
the plugin is really active are in [`../LOCAL-TESTING.md`](../LOCAL-TESTING.md#enable).

## Release procedure (operator)

1. Merge the release commit; confirm `package.json`, `package-lock.json` and the `## [0.2.1]`
   changelog heading all say `0.2.1`.
2. Run the release workflow against a `v0.2.1` tag created on that commit — it re-runs
   typecheck, lint, build, the committed-`lib/` check, tests, package checks, extracts the
   changelog section and attaches the tarball.
3. Do not move `v0.1.0` or any published tag; publish a new version instead.
