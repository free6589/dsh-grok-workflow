#!/usr/bin/env bash
# Does a tripped brake reach a real delivery? The operator's stop marker is created
# before the delivery, so a working heartbeat path would answer `loop/stop-file` and
# delete the heartbeat row. The row surviving is the observable.
set -uo pipefail
EV="/home/fish/projects_mine/dsh-grok-workflow/.rsi/evidence/round-017/heartbeat-live"
OUT="$EV/results/03-stop-file-unreachable.txt"
PORT=3271
: >"$OUT"
say() { echo "$@" | tee -a "$OUT"; }
http() { PORT=$PORT node "$EV/probe-http.mjs" "$@" 2>&1 | tee -a "$OUT"; }
ask() { "$EV/qa.sh" "$@" 2>&1 | tee -a "$OUT"; }

say "# $(date -Is) stop marker vs a real delivery"
cd "$EV/workspace"
PROBE_STUB_KEY=probe-stub-placeholder DSH_HOME="$EV/instance/dsh-home" \
  dsh --profile live-verify --host 127.0.0.1 --port "$PORT" --no-open >"$EV/instance/boot-stopfile.tmp" 2>&1 &
CHILD=$!
for _ in $(seq 1 90); do
  grep -q "127.0.0.1:$PORT" "$EV/instance/boot-stopfile.tmp" 2>/dev/null && break
  kill -0 "$CHILD" 2>/dev/null || { say "boot failed"; exit 1; }
  sleep 1
done
say "boot: $(sed -E 's/token=[A-Za-z0-9_-]+/token=[REDACTED]/g' "$EV/instance/boot-stopfile.tmp" | tail -1)"
TOKEN=$(grep -o "token=[A-Za-z0-9_-]\{10,\}" "$EV/instance/boot-stopfile.tmp" | tail -1 | cut -d= -f2-)
( umask 077; printf '%s' "$TOKEN" >"$EV/instance/.token" )
rm -f "$EV/instance/.cookies.json"
cd "$EV"
http login
sleep 3

SID=$(ask session "{\"cwd\":\"$EV/workspace\"}" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d).result.sessionId)}catch{console.log("")}})')
say "session=$SID"
http post /grok-workflow/loop "{\"action\":\"open\",\"sessionId\":\"$SID\"}"
TASK=$(ask catalog '{}' | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const rows=JSON.parse(d).result;console.log(rows[0]?.id??"")})')
say "task=$TASK"

say "## create the operator stop marker the brakes read (session cwd/.rsi/STOP)"
mkdir -p "$EV/workspace/.rsi" && printf 'stop\n' >"$EV/workspace/.rsi/STOP" && ls -l "$EV/workspace/.rsi/STOP" | tee -a "$OUT"

say "## deliver while the marker exists"
ask run "{\"id\":\"$TASK\"}"
sleep 14
say "## row state after the delivery (a tripped brake would have deleted it)"
ask catalog '{}'
node -e '
const fs = require("node:fs")
const store = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
console.log("stored rows:", JSON.stringify(Object.keys(store.tables.tasks)))
' "$EV/instance/dsh-home/storages/schedule.json" | tee -a "$OUT"

say "## cleanup: remove the marker and close the loop"
rm -f "$EV/workspace/.rsi/STOP"
http post /grok-workflow/loop "{\"action\":\"close\",\"sessionId\":\"$SID\"}"
ask catalog '{}'
kill -TERM "$CHILD" 2>/dev/null
sleep 2
say "# done"
