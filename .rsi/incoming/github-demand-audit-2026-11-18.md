# GitHub demand audit — free6589/dsh-grok-workflow

Read-only audit. No comment, label, close, merge, push, or edit was made to GitHub or to
repository code/docs. This file is a new **untracked** artifact; delete it freely.

## 0. Query method and observation window (reproducible)

- **Observation window:** 2026-11-17T23:55Z → 2026-11-18T00:05Z (2026-11-18 07:55–08:05 +08).
- **Local baseline:** `HEAD = 17e3a12` on `main`, `package.json` version **0.11.3**, working tree
  dirty: `M README.md`, `M README.zh-CN.md`, `M test/docs-config-keys.spec.ts`; untracked `.rsi/`,
  `settings-simple-mock.html`, `docs/knowledge/evidence/test-baseline-2026-11-18/`.
  All code claims read from `src/` and `lib/` at that HEAD (the dirty files are docs/test only).
- **Tooling:** `gh 2.102.0`; authenticated as `free6589` with scopes `gist, read:org, repo, workflow`.
  Token value never printed, stored, or returned.

Commands run (each reproducible as-is from the repo root):

```bash
git status --short --branch && git log --oneline -3 && node -e "require('./package.json').version"
gh --version && gh auth status
gh issue list --repo free6589/dsh-grok-workflow --state all --limit 200 \
  --json number,title,state,createdAt,updatedAt,labels,author
gh pr list --repo free6589/dsh-grok-workflow --state all --limit 200 \
  --json number,title,state,createdAt,updatedAt,isDraft,headRefName,author
gh api graphql -f query='query { repository(owner:"free6589", name:"dsh-grok-workflow") {
  hasDiscussionsEnabled discussions(first:50){ totalCount nodes { number title } }
  issues(states: OPEN){ totalCount } issues(states: CLOSED){ totalCount }
  pullRequests(states: OPEN){ totalCount } pullRequests(states: CLOSED){ totalCount }
  pullRequests(states: MERGED){ totalCount } } }'
gh issue view 19 --repo free6589/dsh-grok-workflow --json body --jq .body
gh issue view 22 --repo free6589/dsh-grok-workflow --json body --jq .body
gh issue view 1  --repo free6589/dsh-grok-workflow --json comments --jq '.comments[-2:][]'
```

Probes (both reproduce the two confirmed defects):

```bash
node --input-type=module -e "import {deriveTrack} from './lib/progress-tab.js'; ..."
node --input-type=module -e "import {classifyTriage} from './lib/triage.js'; ..."
npx vitest run test/progress-tab.spec.ts test/triage.spec.ts
```

## 1. Inventory

| Surface | Totals | Open | Notes |
|---|---|---|---|
| Issues | 18 (15 closed, **3 open**) | **#1, #19, #22** | 0 labels on any issue; all authored by `free6589` |
| Pull requests | 27 (26 merged, 1 closed-unmerged) | **0 open** | #45 merged 2026-11-13 is the most recent |
| Discussions | **disabled** — `hasDiscussionsEnabled: false`, `totalCount: 0` | — | No discussion signal exists to audit |

Open items reviewed in full:

| # | Title | Status | Comments | Created / updated |
|---|---|---|---|---|
| #1 | [COORDINATION] Cloud ↔ Local Agent | OPEN — process log, not a request | 36 | 2026-10-25 / 2026-11-16T20:08:46Z |
| #19 | 深度审计报告：v0.2.3 发布与当前工作区（只读，2026-10-31） | OPEN — audit artifact, 43 findings, no per-finding status | 12 | 2026-10-31 / 2026-11-01T04:10:29Z |
| #22 | [UX] 对话可靠性与任务级进度面板（Phase 1–2） | OPEN — roadmap | 2 | 2026-11-01 / 2026-11-01T06:19:48Z |

Closed-unmerged PR: **#12** "security: treat issue watcher events as untrusted data" — superseded.

Historical context read: `docs/knowledge/STATE.md`, `CHANGELOG.md`, `docs/knowledge/VALIDATION.md`
(Round 47), `AGENTS.md`.

## 2. Re-verification of the historical demand signal

#19 targets v0.2.3 (2026-10-31), #22 targets 2026-11-01; the tree is now 0.11.3.
Legend: **CONFIRMED** = observed in source or by running code · **HYPOTHESIS** = plausible, unproven ·
**NOT_RUN** = not attempted (must not be counted as fixed or as open).

| Finding | Current state | Evidence |
|---|---|---|
| #19 A-01 failed work reported COMPLETED | **CONFIRMED fixed** — a non-completed execution cannot be verified | `src/script.ts:1129-1131` |
| #19 A-02 "简单/团队" answer treated as the task | **CONFIRMED fixed** — `originalRequest` carried; `resumedRequest()` composes target | `src/triage.ts:978-982`, `src/triage.ts:1000-1020` |
| #19 A-04 host validator ignores verifier verdict | **CONFIRMED fixed** — passed attempt must have `verdict === 'pass'`, non-empty evidence, matching criteria | `src/report.ts:470-499` |
| #19 A-05 user's original message never persisted | **CONFIRMED fixed** — claimed batch committed by `in-turn` before the run | `src/gate.ts:18-20`, `src/gate.ts:428-435` |
| #19 A-06 redaction misses JSON/unknown keys | **CONFIRMED fixed** — key-aware `redactDeep` + `isSensitiveKey`, provider-token shapes present | `src/redact.ts:184-219` |
| #19 A-07/A-08 README wrong claims / install pin | **CONFIRMED fixed** — pins are `#v0.11.3`, published-tag list ends at v0.11.3 | `README.md:48-51`, `README.md:299-302` |
| #19 A-10 unread `dsh.compatibility` metadata | **CONFIRMED fixed** — `engines.dsh` is a range; bundle/client metadata is the read form | `package.json` (`engines.dsh >=0.2.1-rc.2 <0.3.0`, `dsh.bundle`, `dsh.client`) |
| #19 A-15 model synthesis contradicts status | **CONFIRMED fixed** | `test/synthesis-guardrails.spec.ts` |
| #19 P3 CI never checks committed `lib/` | **CONFIRMED fixed** | `.github/workflows/ci.yml:30` (`git diff --exit-code -- lib/`) |
| #19 A-17 `setMode` failure still reports success | **CONFIRMED fixed** — read-back verify then `applied` gate | `src/command.ts:103-121` |
| #19 A-03 evidence is lexical | **STILL OPEN → C-3** | `src/report.ts:484-486`, `src/script.ts:1137-1147` |
| #19 A-13 triage misroutes negations | **CONFIRMED STILL OPEN → C-2** (reproduced) | `src/triage.ts:103`, `src/triage.ts:746` |
| #19 A-12 cross-run write conflicts | **STILL OPEN, explicitly deferred → C-6** | `src/paths.ts:1-18`; #22「暂不纳入本轮」 |
| #22 P0-1..P0-4, P1-1, P1-3 | **largely delivered** — cancellation has its own terminal + tests | `src/gate.ts:499-525`; `test/reliability.spec.ts:179-232`; `src/naming.ts:100-106` |
| #22 P1-2 per-task states | **STILL OPEN / blocked on host → C-4** | `src/report.ts:307-308`; no `awaiting-verification` vocabulary in `src/` |
| #19 A-09, A-11, A-14, A-16 and ~20 micro-items | **NOT_RUN** — neither re-confirmed nor shown fixed | — |

## 3. Backlog candidates (P0–P5)

Levels: **P0** core-promise broken / security / data loss · **P1** high-value user-visible
correctness · **P2** medium value or medium risk · **P3** low value / hygiene · **P4** deferred by
explicit decision or blocked on an external surface · **P5** non-issue, no action.

**There is no confirmed P0 in the current demand signal.** Every P0-class item from #19 is fixed in
the tree; the three open issues contain no security or data-loss claim that survives re-verification.

### C-1 · P1 · Progress spine denies Execute/Verify ran, while the rows sit in a task node

- **User value:** high. The user answers "did my work run and was it checked?" from this spine. In a
  completed run, Execute and Verify read "Not reported in the events" — the one screen built to show
  progress denies it happened.
- **Verification: CONFIRMED** (probe + project's own record):
  ```
  stage:start done 0 · stage:plan done 1 · stage:execute pending 0
  phase:任务 1 · 修复登录接口 done 2 · stage:verify pending 0
  stage:synthesize done 1 · stage:answer pending 0 · stage:end done 0   (percent 100)
  ```
  Workers/verifiers/supervisors are announced with `phase: taskGroupTitle(task)`, i.e.
  `任务 {index} · {title}`, which carries no spine token — so the spine stages stay `pending` and the
  rows become `extra` nodes. Project record: `docs/knowledge/STATE.md:12-13` (v0.10.0 known gap) and
  `docs/knowledge/STATE.md:1068-1069` (CONFIRMED symptom, **HYPOTHESIS** attribution — cause not located).
- **Risk:** medium. Current behaviour is *pinned* by `test/progress-tab.spec.ts:279-306` and
  `test/client.spec.ts:1415-1426`; a matcher change is a contract change, and a careless one can
  double-count the same member row in stage and task node.
- **Scale:** small–medium. `src/script.ts` announcement phases (1852/1912/1950), `src/progress-tab.ts`
  stage token table (181-188) + matcher (543-551), client copy (`src/client/index.js:193`); plus tests.
- **Compatibility impact:** none on the DSH host API. Changes a pinned internal contract and one
  rendered copy key. Must preserve #22's semantic limit: `agent-end: completed` is not "verified".
- **Evidence:** `src/script.ts:1852,1912,1950`; `src/naming.ts:103`; `src/progress-tab.ts:181-188,543-551`;
  `src/client/index.js:193`; `docs/knowledge/STATE.md:12-13,1068-1069`; probe above.

### C-2 · P1 · An explicit "don't use the team" is routed *into* the team tier

- **User value:** high. A refusal is overridden and the user pays for a planner + workers + verifier
  fan-out they explicitly declined.
- **Verification: CONFIRMED**, with root cause at regex level. `FORCE_TEAM` contains the alternation
  `(?:用|上|开|走|要|叫|让)(?:完整的?)?团队`, which matches the substring inside a negation:
  ```
  "不用团队"    match="用团队"      "别用团队模式" match="用团队"      "不要团队"    match="要团队"
  ```
  `classifyTriage` then returns `team/forced-team` for `不用团队，就解释一下`, `别用团队模式，简单说说`,
  `不要团队，只是问个问题`. `不用团队` is only special-cased inside `PENDING_FAST` (line 106), i.e.
  **only while a front-desk question is pending** — never on an unprompted message.
  `grep -rn '不用团队\|别用团队\|不要团队' test/` → **no matches** (untested).
- **Risk:** low–medium. A prefix guard is small, but it must not break the `PENDING_FAST` answer path
  ("简单 / 不用团队" as the *answer* to the question must still select the quick tier).
- **Scale:** small. One file (`src/triage.ts:103` + call site `746`) and its spec.
- **Compatibility impact:** none external. Changes triage routing only; interacts with #22 P0-2
  pending-answer semantics, which must stay green.
- **Related, unproven:** `改这个bug，再加测试` → `fast/single-step` (A-13's second claim) still reproduces,
  but whether a comma-joined "fix + add tests" should be team-tier is a product judgement — **HYPOTHESIS**.
- **Evidence:** probe above; `src/triage.ts:103,106,746`; no matching test.

### C-3 · P2 · Verification still accepts a fabricated locator

- **User value:** high in principle — "verified" is the product's core claim. But see risk.
- **Verification: CONFIRMED.** Both the script and the host validator accept evidence whenever
  `kind`/`locator`/`finding` are non-empty; nothing resolves a locator:
  `file:///does-not-exist` passes. No `existsSync`/`statSync` is applied to locators anywhere in
  `src/` (the only `readFileSync` uses are the memory archive and the settings/legacy-key reader).
- **Risk:** **high** — this is why it is P2 and not P1. Legitimate evidence locators include shell
  commands, test names, URLs, session ids and `/proc`-style paths that a naive resolver would reject.
  A premature fix would fail more real runs than it fixes. It needs a design decision on which
  locator kinds are checkable, which is a product-owner call, not an implementation detail.
- **Scale:** medium. `src/report.ts:484-486`, `src/script.ts:1137-1147`, verifier prompt wording
  (`src/script.ts:844,875`), plus a locator corpus in tests.
- **Compatibility impact:** none on the host. Tightens the acceptance contract for **all** runs,
  including existing recorded evidence; needs a migration story for resumed/checkpointed runs.
- **Evidence:** `src/report.ts:484-486`; `src/script.ts:1137-1147`; `grep -rn 'existsSync|statSync' src/`.

### C-4 · P4 · Per-task states (queued / awaiting-verification / retrying) do not exist

- **User value:** high, but **blocked on an external surface**, so P4.
- **Verification: CONFIRMED absent.** Member facts carry only `outcome`; the report's per-task status
  vocabulary is exactly `verified | failed`; no `awaiting-verification` / `retrying` task vocabulary
  exists in `src/`. #22 P1-2 itself requires first proving that a host task-progress / custom-node /
  UI-contribution API exists before writing any event.
- **Risk:** high if attempted naively — emitting events the host UI does not understand, or inventing
  child rows for waiting tasks, would be worse than the gap.
- **Scale:** unknown until the host API question is answered; potentially large.
- **Compatibility impact:** **host-dependent — HYPOTHESIS, unverified.** I did not inspect the
  installed DSH 0.2.2-rc.3 event/UI surface for such an API, so the feasibility and the version
  constraint are both unproven. Issue #22's own fallback is: ship P1-1 grouping, file a separate host
  proposal, do not fake it.
- **Evidence:** `src/progress-tab.ts:112-133`; `src/report.ts:306-308`; issue #22 P1-2 text.

### C-5 · P3 · `STATE.md` drifts four releases behind the tree

- **User value:** medium for agents, low for end users. `AGENTS.md` makes these files mandatory
  first-read, so a stale header sends every new agent to the wrong baseline.
- **Verification: CONFIRMED.** `docs/knowledge/STATE.md:3` says `Last updated: 2026-11-17`
  (**v0.10.0 发布准备完成**), baseline `ae0c6d3`; `package.json` is `0.11.3`; `CHANGELOG.md:8` has
  `## [0.11.3] - 2026-11-18`; `git tag` ends at `v0.11.3`.
- **Risk:** low. Text-only.
- **Scale:** one file (plus the matching hand-off note).
- **Compatibility impact:** none.
- **Evidence:** `docs/knowledge/STATE.md:3`; `package.json`; `CHANGELOG.md:8-10`; `git tag --sort=version:refname`.

### C-6 · P4 · Cross-run / cross-session write conflicts are unprotected

- **User value:** medium (potential silent file corruption between two concurrent runs).
- **Verification: CONFIRMED, and explicitly deferred by decision.** `src/paths.ts:1-18` documents that
  serialization is **within one plan** only; every child shares one cwd and there is no per-child
  `cwd`. Issue #22 lists 跨 workflow run 文件锁 under 「暂不纳入本轮」.
- **Risk:** medium–high. Real locking across runs needs a host-level primitive; a plugin-local lock
  file would be advisory only and could deadlock a crashed run.
- **Scale:** large.
- **Compatibility impact:** none external, but it is a genuine architecture addition, not a fix.
- **Evidence:** `src/paths.ts:1-18`; issue #22「暂不纳入本轮」.

## 4. Explicitly discarded — non-issues

| Item | Why discarded |
|---|---|
| #1 [COORDINATION] Cloud ↔ Local Agent | Process log, not a product request. 36 comments; last entry 2026-11-16T20:08:46Z reports v0.10.0 released. Stale relative to v0.11.3, but coordination hygiene rather than demand. |
| All 15 closed issues | Resolved. Spot-verified: #10 → `ci.yml:30`; #2/#14/#5 → `src/redact.ts`; #7/#3/#6/#4 → validation chain; #34 → PR #35. |
| PR #12 (closed, unmerged) | Superseded; the watcher ships as `scripts/watch-issues.sh` with coverage. Not an open demand. |
| Discussions | Do not exist (`hasDiscussionsEnabled: false`, `totalCount: 0`). Nothing to triage. |
| #19 A-01, A-02, A-04, A-05, A-06, A-07, A-08, A-10, A-15, A-17, P3-CI | Fixed in the tree — see §2 rows. No action. |
| #22 P0-1, P0-2, P0-3, P0-4, P1-1, P1-3 | Delivered; cancellation and Phase-1 dialogue are covered by `test/reliability.spec.ts:179-232` and `test/phase1-dialogue.spec.ts`. |
| "No open PRs" | Not a gap: 0 open PRs is a clean state, not demand. |

## 5. Not audited (NOT_RUN) — must not be read as open or fixed

- #19 **A-09, A-11, A-14** (routing/settings P2s, RC-01..06) — not re-checked.
- #19 **A-16** (evidence corpora reproducibility: build hashes absent from any commit, truncated
  shutdown JSON, missing artifacts) — not re-audited.
- #19's remaining micro-items (dangling `sourceMappingURL`s, `npm pack` empty gate, release sha256,
  O(events) scans, deadline-test flakiness) — not re-audited.
- #22 **P0-4** cancellation *end-to-end on a live host* — code and unit tests confirm the terminal and
  signal plumbing, but I did not perform a real-machine Stop; treat the live-run proof as absent.

## 6. Scope statement

This report supplies **external demand signal only**. P-levels are my judgement with stated reasons.
It confers no implementation authority; no code, doc, or GitHub state was changed.
