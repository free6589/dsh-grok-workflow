# team-dispatch-v1 branch setup — 2026-11-23

Task: branch_setup (wave 1), depends on baseline_confirm.
Repo: /home/fish/projects_mine/dsh-grok-workflow

## 1. Duplicate check first (`git branch -a`, `git ls-remote`)

```
* (HEAD detached at a6103ad)
+ main
  remotes/origin/HEAD -> origin/main
  remotes/origin/main
  team-dispatch-v1          <-- duplicate found
  fix/session-surface-head-6
+ fix-progress-task-number-first
+ feat/live-steering
  remotes/origin/fix/guardian-ui-and-timeout-budget
  feat/audit-layer
```

Remote heads (`git ls-remote --heads origin`):

```
b2c9286bf469a64af56dc1447cfeeaa1b87bd457	refs/heads/fix/guardian-ui-and-timeout-budget
e4e03e9d1c718edb1f5e5a747d2489c5348329a9	refs/heads/main
```

`team-dispatch-v1` did not exist on the remote. Local `team-dispatch-v1` was not
checked out in any worktree (`git branch --merged main` shows it without the `+`
marker; `git worktree list` did not list it).

### Duplicate provenance (stale, not live)

```
reflog: 903b9a3 team-dispatch-v1@{2026-11-23 04:39:28}: branch: Created from HEAD
        006a470 team-dispatch-v1@{2026-11-23 04:51:36}: commit: feat: team dispatch v1 — taskboard + dispatcher + handoff contract
        c2c8b53 team-dispatch-v1@{2026-11-23 05:02:56}: commit: chore(release): prepare v0.13.17
```

`git rev-list --left-right --count team-dispatch-v1...main` → `0  3`
(0 ahead / 3 behind main), and
`git merge-base --is-ancestor c2c8b53 main` → TRUE.

CONFIRMED: the old `team-dispatch-v1` tip c2c8b53 is an ancestor of main, i.e. the
branch was already merged. Per AGENTS.md §5 a merged branch left alive is litter.
No unique work existed on it, so nothing was lost by moving the pointer.

## 2. Branch created from main tip

main tip (`git rev-parse main` = `git rev-parse origin/main`):
`e4e03e9d1c718edb1f5e5a747d2489c5348329a9` (docs(memory): record 0.13.18 release)

Action: `git branch -f team-dispatch-v1 main`  → BRANCH_FF_OK

- old tip: `c2c8b53569b713126dd72f7228ff6afbd2c9fa2c`
- new tip: `e4e03e9d1c718edb1f5e5a747d2489c5348329a9`

This is a **fast-forward only** (old tip was an ancestor of main), not a history
rewrite: no commit became unreachable, no `--force` push, no push at all. The
previous tip stays reachable through main and through the branch reflog.

**BASE SHA (recorded): e4e03e9d1c718edb1f5e5a747d2489c5348329a9** = main = origin/main.

## 3. Checkout

Direct checkout in the primary worktree was refused by git, atomically:

```
$ git checkout team-dispatch-v1
error: Your local changes to the following files would be overwritten by checkout:
	docs/knowledge/STATE.md ... test/synthesis-guardrails.spec.ts   (22 files)
Please commit your changes or stash them before you switch branches.
Aborting
CHECKOUT_EXIT=1
```

Cause (CONFIRMED): the primary worktree holds 64 dirty paths
(37 modified + 27 untracked per baseline) on detached a6103ad, and 22 of them are
files that differ between a6103ad and main tip. Switching would destroy
uncommitted work. Git aborted without touching any file — `git status --porcelain`
still reports 64 entries and `git rev-parse HEAD` still `a6103ad` afterwards.

Chosen remedy: materialize the checkout in an isolated worktree (the repo's
existing pattern — `.agents/worktrees/` is gitignored via
`.agents/worktrees/.gitignore:1:*`), instead of stashing or discarding the dirty
tree. No stash created (baseline recorded "no stash"; that fact still holds).

```
$ git worktree add .agents/worktrees/team-dispatch-v1 team-dispatch-v1
Preparing worktree (checking out 'team-dispatch-v1')
HEAD is now at e4e03e9 docs(memory): record 0.13.18 release
```

Worktree list after:

```
/home/fish/projects_mine/dsh-grok-workflow                        a6103ad (detached HEAD)
.../.agents/worktrees/fix-progress-task-number-first              b61ff66 [fix-progress-task-number-first]
.../.agents/worktrees/fix-synth-resubmit                          e4e03e9 [main]
.../.agents/worktrees/team-dispatch-v1                            e4e03e9 [team-dispatch-v1]
.../.tmp/wt-steer                                                 3b793ac [feat/live-steering]
```

## 4. Verification

Inside `.agents/worktrees/team-dispatch-v1`:

- `git rev-parse --abbrev-ref HEAD` → `team-dispatch-v1`
- `git rev-parse HEAD` → `e4e03e9d1c718edb1f5e5a747d2489c5348329a9` → MATCH: branch HEAD == main tip
- `git status --short --branch` → `## team-dispatch-v1`, porcelain count 0 (clean)

Primary worktree untouched:
- HEAD still `a6103adeb5bce4df7ace1278e430a49489de3383` (detached)
- 64 dirty paths, unchanged

Remote untouched (no push performed): `git ls-remote --heads origin main` →
`e4e03e9d1c718edb1f5e5a747d2489c5348329a9`; local main = origin/main = e4e03e9.

## 5. Acceptance mapping

| Criterion | Status | Evidence |
|---|---|---|
| Branch team-dispatch-v1 exists from main tip SHA recorded | CONFIRMED | §2, §4 — branch tip == main == e4e03e9 |
| `branch -a` checked first for duplicates | CONFIRMED | §1 — duplicate found (stale, merged, 0/3) and handled by fast-forward |
| No force-push, no history rewrite | CONFIRMED | §2, §4 — FF only, ancestor proven, no push, remote main unchanged |

## 6. Notes / residual risk

- Downstream tasks running with cwd at the repo root will see detached a6103ad +
  the dirty tree, **not** the branch. Work for this branch must use cwd
  `.agents/worktrees/team-dispatch-v1` (branch checked out there).
- The stale branch was repurposed rather than deleted+recreated because the name
  is fixed by the task and the FF is lossless; deleting would have been
  equivalent but discards the audit trail.
- `LINGSHU_ACTOR` device attribution: not applicable, this is a git/host task.
