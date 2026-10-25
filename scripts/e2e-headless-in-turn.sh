#!/usr/bin/env bash
#
# Real headless end-to-end check for in-turn delivery (G-18/F9).
#
# What it proves, and why it cannot live in `npm test`:
# the gate must answer a one-shot `dsh headless` turn in the SAME turn. A CI lane
# has no model and no profile, so the turn cannot be driven end to end there; the
# engine-level timing is covered by `test/gate.spec.ts` ("in-turn delivery").
#
# Preconditions (checked below):
#   * a built bundle (`npm run build`), because the overlay points at lib/index.js;
#   * a DSH profile whose agent model route actually answers — pass it with
#     E2E_MODEL_PATCH=<file with the `agent-default-model` + `llm-pi-ai` rows>
#     or leave it out and let the profile's own default model be used.
#
# The run writes a session into $DSH_HOME (the DSH home you point at), which is
# why the script never sets DSH_HOME itself: choose the home you want polluted.
# The work directory is removed on exit unless E2E_WORKDIR was supplied (then it
# is kept for inspection) or E2E_KEEP=1 is set.
#
# Exit codes: 0 = the report reached the user in one turn; 1 = usage/precondition
# failure; 2 = the turn produced no report (the exact regression this guards).
set -u

REPO=$(cd "$(dirname "$0")/.." && pwd)
WORK=${E2E_WORKDIR:-$(mktemp -d "${TMPDIR:-/tmp}/dsh-grok-e2e-XXXXXX")}
# A caller-supplied E2E_WORKDIR may not exist yet; mktemp already created ours.
mkdir -p "$WORK"
LOG="$WORK/headless-in-turn.log"
PROMPT=${E2E_PROMPT:-"In one short sentence: why is a stub better than a mock for interfaces you do not own?"}
TIMEOUT=${E2E_TIMEOUT:-900}

fail() { printf 'FAIL: %s\n' "$1" >&2; exit "${2:-1}"; }

# The run writes a real session into $DSH_HOME, so the log is worth keeping on a
# failure. Keep the directory when the caller named it or asked for it.
KEEP=${E2E_KEEP:-0}
cleanup() {
  if [ "$KEEP" = "1" ] || [ -n "${E2E_WORKDIR:-}" ]; then
    printf 'kept: %s\n' "$WORK"
    return
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

command -v dsh >/dev/null 2>&1 || fail "dsh is not on PATH"
[ -f "$REPO/lib/index.js" ] || fail "build the bundle first: npm run build"

# Overlay 1: this plugin's row, by file URL, so nothing is installed into a profile.
cat > "$WORK/plugin.patch.yml" <<YAML
- insert:
    - id: grok-workflow
      name: file://$REPO/lib/index.js
      config:
        answerStrategy: in-turn
YAML
PATCHES=(--patch "$WORK/plugin.patch.yml")
if [ -n "${E2E_MODEL_PATCH:-}" ]; then
  [ -f "$E2E_MODEL_PATCH" ] || fail "E2E_MODEL_PATCH does not exist: $E2E_MODEL_PATCH"
  PATCHES+=(--patch "$E2E_MODEL_PATCH")
fi
PROFILE=${E2E_PROFILE:-headless}

printf 'dsh profile : %s\npatch       : %s\nlog         : %s\n' "$PROFILE" "$WORK/plugin.patch.yml" "$LOG"
set +e
timeout "$TIMEOUT" dsh --profile "$PROFILE" "${PATCHES[@]}" "$PROMPT" > "$LOG" 2>&1
status=$?
set -e

if [ "$status" -eq 124 ]; then fail "the turn did not finish within ${TIMEOUT}s (log: $LOG)" 2; fi
if ! grep -q 'GROK-WORKFLOW-REPORT' "$LOG"; then
  printf -- '--- captured output ---\n' >&2
  sed -n '1,60p' "$LOG" >&2
  fail "no workflow report reached the user (log: $LOG)" 2
fi
if [ "$status" -ne 0 ]; then fail "dsh exited $status but did deliver a report (log: $LOG)" 2; fi

printf 'PASS: the report reached the user in one turn\n'
grep -E 'Grok workflow: (COMPLETED|PARTIAL|FAILED)' "$LOG" | head -1
