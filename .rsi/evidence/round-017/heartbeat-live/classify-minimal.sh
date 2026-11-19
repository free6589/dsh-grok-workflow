#!/usr/bin/env bash
# Two live probes in one process namespace:
#   A. the shipped `classifyPreStep` fed the exact Schedule-delivered message object
#      (source.kind = 'schedule') from this instance's Session log;
#   B. the minimal composition (no Schedule service) answering the loop route.
set -uo pipefail
EV="/home/fish/projects_mine/dsh-grok-workflow/.rsi/evidence/round-017/heartbeat-live"
OUT="$EV/results/09-classify-and-minimal.txt"
SID="session-ca7cef6d-9f9e-41fa-bd7e-2d8f895c208d"
: >"$OUT"
say() { echo "$@" | tee -a "$OUT"; }

start() { # $1 profile  $2 port  $3 log
  cd "$EV/workspace"
  DSH_HOME="$EV/instance/dsh-home" dsh --profile "$1" --host 127.0.0.1 --port "$2" --no-open >"$3" 2>&1 &
  CHILD=$!
  for _ in $(seq 1 90); do
    grep -q "127.0.0.1:$2" "$3" 2>/dev/null && return 0
    kill -0 "$CHILD" 2>/dev/null || { say "boot failed for $1"; return 1; }
    sleep 1
  done
  say "boot timeout for $1"; return 1
}

login() { # $1 log  $2 port
  local token
  token=$(grep -o "token=[A-Za-z0-9_-]\{10,\}" "$1" | tail -1 | cut -d= -f2-)
  ( umask 077; printf '%s' "$token" >"$EV/instance/.token" )
  rm -f "$EV/instance/.cookies.json"
  cd "$EV"
  PORT="$2" node probe-http.mjs login >>"$OUT" 2>&1
}

say "# $(date -Is) classify + minimal-composition probes"

say "## A: shipped classifyPreStep on the real Schedule delivery"
start live-verify 3271 "$EV/instance/boot-classify.tmp" || exit 1
login "$EV/instance/boot-classify.tmp" 3271
MESSAGE=$(cat "$EV/results/schedule-delivery-message.json")
node -e '
const fs = require("node:fs")
const [message, sid, dir] = process.argv.slice(1)
fs.writeFileSync(`${dir}/cmd.json`, `${JSON.stringify({ seq: 30, op: "classify", sessionId: sid, message: JSON.parse(message) })}\n`)
' "$MESSAGE" "$SID" "$EV/qa"
for _ in $(seq 1 60); do [ -s "$EV/qa/res-30.json" ] && break; sleep 0.5; done
cat "$EV/qa/res-30.json" 2>/dev/null | tee -a "$OUT"

node -e '
const fs = require("node:fs")
const [message, dir] = process.argv.slice(1)
const text = JSON.parse(message).content[0].text
fs.writeFileSync(`${dir}/cmd.json`, `${JSON.stringify({ seq: 31, op: "heartbeat-probe", text })}\n`)
' "$MESSAGE" "$EV/qa"
for _ in $(seq 1 60); do [ -s "$EV/qa/res-31.json" ] && break; sleep 0.5; done
cat "$EV/qa/res-31.json" 2>/dev/null | tee -a "$OUT"

say "## A2: catalog is empty before shutdown (no heartbeat left behind)"
node -e '
const fs = require("node:fs")
fs.writeFileSync(process.argv[2], `${JSON.stringify({ seq: 32, op: "catalog" })}\n`)
' x "$EV/qa/cmd.json"
for _ in $(seq 1 60); do [ -s "$EV/qa/res-32.json" ] && break; sleep 0.5; done
cat "$EV/qa/res-32.json" 2>/dev/null | tee -a "$OUT"
kill -TERM "$CHILD" 2>/dev/null
sleep 3

say "## B: minimal composition (schedule disabled) — loop route must answer 503"
start live-verify-minimal 3272 "$EV/instance/boot-minimal.tmp" || exit 1
login "$EV/instance/boot-minimal.tmp" 3272
PORT=3272 node probe-http.mjs post /grok-workflow/loop "{\"action\":\"open\",\"sessionId\":\"$SID\"}" >>"$OUT" 2>&1
PORT=3272 node probe-http.mjs post /grok-workflow/loop "{\"action\":\"status\",\"sessionId\":\"$SID\"}" >>"$OUT" 2>&1
kill -TERM "$CHILD" 2>/dev/null
sleep 2
say "# done"
