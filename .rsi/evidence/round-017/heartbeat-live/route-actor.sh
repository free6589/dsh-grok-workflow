#!/usr/bin/env bash
# What does the ROUTE do with an `actor` field in the body? The service refuses a defined
# actor; the route has no actor parameter, so the field is either ignored or rejected.
set -uo pipefail
EV="/home/fish/projects_mine/dsh-grok-workflow/.rsi/evidence/round-017/heartbeat-live"
OUT="$EV/results/10-route-actor-field.txt"
PORT=3271
: >"$OUT"
say() { echo "$@" | tee -a "$OUT"; }
ask() { "$EV/qa.sh" "$@" 2>&1 | tee -a "$OUT"; }
http() { PORT=$PORT node "$EV/probe-http.mjs" "$@" 2>&1 | tee -a "$OUT"; }
say "# $(date -Is) route body carrying an actor"
cd "$EV/workspace"
DISABLE_SCHEDULE=1 PROBE_STUB_KEY=probe-stub-placeholder DSH_HOME="$EV/instance/dsh-home" \
  dsh --profile live-verify --host 127.0.0.1 --port "$PORT" --no-open >"$EV/instance/boot-actor.tmp" 2>&1 &
CHILD=$!
for _ in $(seq 1 90); do
  grep -q "127.0.0.1:$PORT" "$EV/instance/boot-actor.tmp" 2>/dev/null && break
  kill -0 "$CHILD" 2>/dev/null || { say "boot failed"; exit 1; }
  sleep 1
done
TOKEN=$(grep -o "token=[A-Za-z0-9_-]\{10,\}" "$EV/instance/boot-actor.tmp" | tail -1 | cut -d= -f2-)
( umask 077; printf '%s' "$TOKEN" >"$EV/instance/.token" )
rm -f "$EV/instance/.cookies.json"
cd "$EV"
http login
sleep 3
SID=$(ask session "{\"cwd\":\"$EV/workspace\"}" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d).result.sessionId)}catch{console.log("")}})')
say "session=$SID"
say "## POST open with an actor field in the body"
http post /grok-workflow/loop "{\"action\":\"open\",\"sessionId\":\"$SID\",\"actor\":\"session-actor-probe\"}"
say "## catalog after that request"
ask catalog '{}'
say "## cleanup"
http post /grok-workflow/loop "{\"action\":\"close\",\"sessionId\":\"$SID\"}"
ask catalog '{}'
kill -TERM "$CHILD" 2>/dev/null
sleep 2
say "# done"
