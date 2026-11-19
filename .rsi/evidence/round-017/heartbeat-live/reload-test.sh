#!/usr/bin/env bash
# Reload/unload semantics of an open loop, measured in one process namespace so the
# script can signal its own child: SIGTERM (graceful) vs SIGKILL (hard).
set -uo pipefail
EV="/home/fish/projects_mine/dsh-grok-workflow/.rsi/evidence/round-017/heartbeat-live"
PORT="${PORT:-3273}"
SID_FILE="$EV/instance/.reload-session"
OUT="$EV/results/08-reload-semantics.txt"
export PORT
mkdir -p "$EV/results"
: >"$OUT"

say() { echo "$@" | tee -a "$OUT"; }

BOOT_LOG=""
boot() {
  BOOT_LOG="$EV/instance/boot-reload-$1.tmp"
  : >"$BOOT_LOG"
  cd "$EV/workspace"
  PROBE_STUB_KEY=probe-stub-placeholder \
  DSH_HOME="$EV/instance/dsh-home" \
    dsh --profile live-verify --host 127.0.0.1 --port "$PORT" --no-open >>"$BOOT_LOG" 2>&1 &
  CHILD=$!
  for _ in $(seq 1 90); do
    grep -q "127.0.0.1:$PORT" "$BOOT_LOG" 2>/dev/null && return 0
    kill -0 "$CHILD" 2>/dev/null || { say "boot failed (child exited)"; return 1; }
    sleep 1
  done
  say "boot timeout"
  return 1
}

refresh_token() {
  TOKEN=$(grep -o "token=[A-Za-z0-9_-]\{10,\}" "$BOOT_LOG" | tail -1 | cut -d= -f2-)
  ( umask 077; printf '%s' "$TOKEN" >"$EV/instance/.token" )
  rm -f "$EV/instance/.cookies.json"
  cd "$EV"
  node probe-http.mjs login >>"$OUT" 2>&1
}

rows() {
  node -e '
    const fs = require("node:fs")
    const path = process.argv[1]
    try {
      const s = JSON.parse(fs.readFileSync(path, "utf8"))
      const tasks = s.tables.tasks
      console.log("stored heartbeat rows:", JSON.stringify(Object.keys(tasks)))
    } catch (error) { console.log("storage unreadable:", String(error.message)) }
  ' "$EV/instance/dsh-home/storages/schedule.json" | tee -a "$OUT"
}

cd "$EV"
say "# $(date -Is) reload/unload semantics"
say "## boot 1"
boot 1 || exit 1
refresh_token

SID=$(cat "$SID_FILE" 2>/dev/null || true)
if [ -z "$SID" ]; then say "no session id"; exit 1; fi
say "session=$SID"
node probe-http.mjs post /grok-workflow/loop "{\"action\":\"open\",\"sessionId\":\"$SID\"}" >>"$OUT" 2>&1
rows

say "## SIGTERM (graceful stop)"
kill -TERM "$CHILD"
for _ in $(seq 1 30); do kill -0 "$CHILD" 2>/dev/null || break; sleep 1; done
kill -0 "$CHILD" 2>/dev/null && { say "child survived SIGTERM; sending SIGKILL"; kill -9 "$CHILD"; }
sleep 1
rows

say "## boot 2 after SIGTERM"
boot 2 || exit 1
refresh_token
node probe-http.mjs post /grok-workflow/loop "{\"action\":\"status\",\"sessionId\":\"$SID\"}" >>"$OUT" 2>&1
rows

say "## re-open then SIGKILL (hard stop)"
node probe-http.mjs post /grok-workflow/loop "{\"action\":\"open\",\"sessionId\":\"$SID\"}" >>"$OUT" 2>&1
kill -9 "$CHILD"
sleep 1
rows

say "## boot 3 after SIGKILL"
boot 3 || exit 1
refresh_token
node probe-http.mjs post /grok-workflow/loop "{\"action\":\"status\",\"sessionId\":\"$SID\"}" >>"$OUT" 2>&1
rows

say "## cleanup: close the loop"
node probe-http.mjs post /grok-workflow/loop "{\"action\":\"close\",\"sessionId\":\"$SID\"}" >>"$OUT" 2>&1
rows
kill -TERM "$CHILD" 2>/dev/null
sleep 2
say "# done"
