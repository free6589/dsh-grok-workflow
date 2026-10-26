# Grok Workflow for DSH 0.2.0 — release notes draft

**Status: draft.** The `v0.2.0` tag and the GitHub Release are created by the release
operator **after** the final acceptance pass, following
[the release guide](../RELEASING.md). This file is the human draft of what that release says; the
text the release workflow actually publishes is the bilingual `## [0.2.0]` section of
[CHANGELOG.md](../../CHANGELOG.md), extracted verbatim.

## What this release is

`0.2.0` makes the workflow **mandatory for user messages** and turns the plugin from "a tool
the model may call" into "the path every user message takes":

- **Mandatory entry.** An `agent/pre-step` gate claims each user message, runs the full
  plan → execute → verify → synthesise workflow, and answers inside the same turn. Turning a
  message away is a stated decision: an empty message or an objective over 4000 characters is
  refused with its reason, and nothing runs.
- **Per-role model routing with ordered fallback chains.** `roles.{planner,worker,verifier,synthesizer}`
  each take up to three routes; route-level failures advance that role's chain, content
  failures retry on the same route, and the routes actually used are recorded in the report and
  printed in the answer.
- **Failure classification.** Every failure carries `class` (what happened) and `category`
  (`infrastructure` / `quality` / `configuration` / `cancelled` / `unknown`), plus a rendered
  `Failures:` line — a provider outage is no longer indistinguishable from poorly done work.
- **A settings surface that is the runtime's own truth.** The exported `Config` is projected
  into DSH's standard settings page; edits are live, unknown keys are rejected with a
  suggestion, and chains are validated against the providers the runtime really has.
- **Write-path isolation for parallel tasks.** Tasks may declare `writesPaths`; overlapping
  declarations are serialized, everything else stays parallel.
- **Reliability and safety suite.** Cancellation, deadlines, concurrency caps, duplicate
  starts, recursion refusal, context bounds, redaction, partial results, unload/reload — all
  covered by deterministic tests that drive the real PTC engine.

## Breaking changes (read before upgrading)

1. **`enforceGate` defaults to `true`.** Every user message now runs the workflow. Set
   `enforceGate: false` for the `0.1.0` behaviour (tool available, no interception); add
   `gateRequired: true` if a runtime without `agent/pre-step` must fail loudly instead of
   warning.
2. **The report is extended** (additive, but strict consumers must be updated): task rows gain
   `writesPaths`, failures gain `class` and `category`, and `plan.tasks` must equal `tasks`
   field for field.
3. **Configuration is validated.** Unknown keys are rejected with the closest accepted key;
   chains are refused for empty models, duplicate routes or more than three routes. A
   configuration that "worked" in `0.1.0` because a key was silently ignored may now fail
   loudly.
4. **Acceptance criteria must stay distinct after normalization** (trailing punctuation,
   whitespace and case are ignored when matching a verifier result).

## Artifact

| | `0.1.0` | `0.2.0` |
|---|---:|---:|
| Files in the tarball | 33 | **42** |
| Tarball size | 61,281 B | **107,991 B** |
| Both READMEs (EN + zh) | yes | yes |
| `CHANGELOG.md` in the package | yes | yes |
| `test/`, `scripts/`, `docs/knowledge/` in the package | no | no |

The size increase is the routing/gate/configuration code plus the bilingual changelog section;
the `files` whitelist was narrowed at the same time (`docs/*.md` + `docs/images` instead of all
of `docs/`), so the development knowledge base is no longer shipped.

## Verification behind this release

- `npm run ci` — typecheck, lint (0 warnings / 0 errors), build, **264 tests / 18 files**.
- Clean copy: `npm ci` then `npm run ci` — same result, no reliance on an existing tree.
- Isolated profile: `dsh plugin add` of the packed tarball into a fresh `DSH_HOME` profile, then
  a real one-shot turn (`hi`) that produced a validated workflow report
  (`Grok workflow: COMPLETED`).
- Settings identity: `node scripts/smoke-settings-identity.mjs` feeds the built plugin the
  descriptor produced by the DSH installation's own `dsh-settings` projection — the plugin
  recognises the page (`identified by value`) instead of reporting it unreadable.
- Real headless one-shot delivery with a live model route: the report reached the user in the
  same turn (`scripts/e2e-headless-in-turn.sh`).

## Known limitations (unchanged honesty)

- GUI-side measurements remain NOT_RUN: long-lived delivery (NR-1), the stock form rendering of
  `roles` (NR-7), an in-place settings `update()` against a live holder (NR-8), and the
  settings page's identity check against a live `SettingsForms` (the fixture now uses the
  runtime's own projection rules, but no GUI ever rendered it).
- Real provider failure texts (NR-5) and real-provider route switching end to end (NR-6) are
  not measured; unmatched failures are reported as `unknown` rather than guessed.
- **Planner fill-rate for `writesPaths` is not established** (NR-9): in the single measured
  sample, with the objective explicitly asking for declarations, the planner declared nothing.

## How to install

```sh
dsh plugin --profile <name> add github:free6589/dsh-grok-workflow#v0.2.0
```

Restart the profile afterwards. Roll back by installing `#v0.1.0`.

## Release procedure (operator)

1. Merge the release commit; confirm `package.json`, `package-lock.json` and the `## [0.2.0]`
   changelog heading all say `0.2.0`.
2. Run the release workflow against a `v0.2.0` tag created on that commit — it re-runs
   typecheck, lint, build, the committed-`lib/` check, tests, package checks, extracts the
   changelog section and attaches the tarball.
3. Do not move `v0.1.0` or any published tag; publish a new version instead.
