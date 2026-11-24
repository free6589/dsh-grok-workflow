#!/usr/bin/env bash
# Verification rig (not product code). Runs one GUI scenario and records which
# sessions it created plus whether any of them started a workflow run — an
# independent check that does not depend on reading the GUI text.
#   ./scenario.sh <name> <plan.json>
# Assumes chrome.sh and boot.sh are already up; ports come from the overlay files.
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
NAME=${1:?usage: scenario.sh <name> <plan.json>}
PLAN=$(readlink -f "${2:?usage: scenario.sh <name> <plan.json>}")
OVERLAY=$(readlink -f "${OVERLAY:-$HERE/overlay-baseline.yml}")
PORT=$(cat "$OVERLAY.port")
TOKEN_FILE="$OVERLAY.token"
DEBUG_PORT=${DEBUG_PORT:-9223}
OUT=$HERE/runs/$NAME
SESS=$HERE/dsh-home/sessions
mkdir -p "$OUT"

snapshot_sessions() { find "$SESS" -mindepth 2 -maxdepth 2 -type d -printf '%f\n' 2>/dev/null | sort; }

BEFORE=$(snapshot_sessions)
started=$(date -Is)
node "$HERE/drive.mjs" "$DEBUG_PORT" "$PORT" "$TOKEN_FILE" "$OUT" "$PLAN" 2>&1 | tee "$OUT/drive.log"
driveCode=${PIPESTATUS[0]}
finished=$(date -Is)
AFTER=$(snapshot_sessions)

NEW=$(comm -13 <(echo "$BEFORE") <(echo "$AFTER"))
: > "$OUT/sessions.txt"
: > "$OUT/workflow-evidence.txt"
for sid in $NEW; do
  f=$(find "$SESS" -mindepth 3 -maxdepth 3 -path "*/$sid/session.v4.jsonl.zstd" | head -1)
  [ -n "$f" ] || continue
  title=$(zstd -dc "$f" 2>/dev/null | grep -m1 '"session/title"' | sed -E 's/.*"title":"([^"]*)".*/\1/' | head -c 60)
  runs=$(zstd -dc "$f" 2>/dev/null | grep -c '"type":"tool-workflow/run-start"')
  agents=$(zstd -dc "$f" 2>/dev/null | grep -c '"type":"tool-workflow/agent-start"')
  mode=$(zstd -dc "$f" 2>/dev/null | grep -c '"type":"plugin:grok-workflow/mode"')
  printf '%s | run-start=%s agent-start=%s grok-mode=%s | %s\n' "$sid" "$runs" "$agents" "$mode" "$title" >> "$OUT/sessions.txt"
  if [ "$runs" -gt 0 ]; then
    {
      echo "== session $sid ($title)"
      zstd -dc "$f" 2>/dev/null | grep -o '"type":"tool-workflow/[a-z-]*"' | sort | uniq -c
    } >> "$OUT/workflow-evidence.txt"
  fi
done

cat > "$OUT/_scenario.json" <<JSON
{"name":"$NAME","plan":"$PLAN","startedAt":"$started","finishedAt":"$finished",
 "port":$PORT,"overlay":"$OVERLAY","driveExit":$driveCode,
 "newSessions":$(printf '%s\n' "$NEW" | grep -c . || true),
 "workflowRunStarts":$(grep -c 'run-start=[1-9]' "$OUT/sessions.txt" 2>/dev/null || echo 0)}
JSON

echo "--- scenario $NAME: driveExit=$driveCode, new sessions:"
cat "$OUT/sessions.txt"
[ -s "$OUT/workflow-evidence.txt" ] && { echo "--- workflow evidence:"; cat "$OUT/workflow-evidence.txt"; }
exit "$driveCode"
