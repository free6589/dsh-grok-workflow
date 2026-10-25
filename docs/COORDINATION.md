# Cloud ↔ Local Coordination

## Roles

- **Local agent:** runs on the user's machine, owns real DSH installation,
  local profile testing, runtime evidence, and final local acceptance.
- **Cloud agent:** reads the same GitHub repository, reviews code and docs,
  proposes fixes, and may implement isolated tasks on a branch/PR. It must not
  claim local runtime verification.
- **User:** approves scope changes, repository creation/visibility changes,
  npm publication, and any operation that affects their DSH home.

## Shared memory

The Git repository is the only shared memory. Chat history is not a handoff.
The canonical files are `AGENTS.md` and `docs/knowledge/*.md`.

## Task flow

1. Local/cloud creates or updates the coordination Issue with a scoped task.
2. The implementer checks `BASE_COMMIT` and `git status` before editing.
3. The implementer pushes a branch and opens a PR; direct pushes to `main` are
   reserved for local-only memory updates when no review is needed.
4. A reviewer checks the contract, tests, and memory consistency.
5. The local agent reruns real runtime tests after merging any code that claims
   local acceptance.
6. Status comments use the block format in `AGENTS.md`.

## Conflict avoidance

- Do not edit the same files concurrently without an explicit assignment.
- Pull/rebase before starting work; never force-push.
- If a remote change conflicts with local uncommitted work, stop and report.
- If GitHub is unavailable, continue local work and record unsynced files and
  the exact failure in `STATE.md` and the final report.


## Active coordination issue

- `https://github.com/free6589/dsh-grok-workflow/issues/1`
- Title: `[COORDINATION] Cloud ↔ Local Agent`
- The issue contains the required FROM/TO/TASK/BASE_COMMIT/WORK_COMMIT/CHANGES/
  TESTS_RUN/TEST_RESULTS/LOCAL_RUNTIME_VERIFIED/BLOCKERS/NEXT_ACTION fields.
