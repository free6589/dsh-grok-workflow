#!/usr/bin/env bash
# Same chain, but with NO model credential: the round's model call must fail closed with
# MISSING_CREDENTIAL after the delivery was accepted. This is the BLOCKED boundary the
# verification reports, observed rather than asserted.
set -uo pipefail
EV="/home/fish/projects_mine/dsh-grok-workflow/.rsi/evidence/round-017/heartbeat-live"
OUT="$EV/results/04-model-boundary-blocked.txt"
PORT=3271
: >"$OUT"
say() { echo "$@" | tee -a "$OUT"; }
ask() { "$EV/qa.sh" "$@" 2>&1 | tee -a "$OUT"; }
http() { PORT=$PORT node "$EV/probe-http.mjs" "$@" 2>&1 | tee -a "$OUT"; }
say "# $(date -Is) model boundary without a credential"
cd "$EV/workspace"
DSH_HOME="$EV/instance/dsh-home" dsh --profile live-verify --host 127.0.0.1 --port "$PORT" --no-open >"$EV/instance/boot-nocred.tmp" 2>&1 &
CHILD=$!
for _ in $(seq 1 90); do
  grep -q "127.0.0.1:$PORT" "$EV/instance/boot-nocred.tmp" 2>/dev/null && break
  kill -0 "$CHILD" 2>/dev/null || { say "boot failed"; exit 1; }
  sleep 1
done
say "boot: $(sed -E 's/token=[A-Za-z0-9_-]+/token=[REDACTED]/g' "$EV/instance/boot-nocred.tmp" | tail -1)"
TOKEN=$(grep -o "token=[A-Za-z0-9_-]\{10,\}" "$EV/instance/boot-nocred.tmp" | tail -1 | cut -d= -f2-)
( umask 077; printf '%s' "$TOKEN" >"$EV/instance/.token" )
rm -f "$EV/instance/.cookies.json"
cd "$EV"
http login
sleep 3
SID=$(ask session "{\"cwd\":\"$EV/workspace\"}" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d).result.sessionId)}catch{console.log("")}})')
say "session=$SID"
http post /grok-workflow/loop "{\"action\":\"open\",\"sessionId\":\"$SID\"}"
TASK=$(ask catalog '{}' | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const rows=JSON.parse(d).result;console.log(rows[0]?.id??"")})')
ask run "{\"id\":\"$TASK\"}"
sleep 12
say "## the turn's outcome from the Session log"
zstdcat "$EV"/instance/dsh-home/sessions/*/"$SID"/session.v4.jsonl.zstd | node -e '
let d = ""
process.stdin.on("data", (c) => { d += c }).on("end", () => {
  for (const line of d.trim().split("\n").filter(Boolean)) {
    const event = JSON.parse(line)
    if (event.type !== "assistant/attempt" && event.type !== "turn/end") continue
    const text = JSON.stringify(event.data).slice(0, 700)
    console.log(`${event.seq}\t${event.type}\t${text}`)
  }
})' | tee -a "$OUT"
say "## close"
http post /grok-workflow/loop "{\"action\":\"close\",\"sessionId\":\"$SID\"}"
ask catalog '{}'
kill -TERM "$CHILD" 2>/dev/null
sleep 2
say "# done"
