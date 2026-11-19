#!/usr/bin/env bash
# The core live chain, in one process namespace and one transcript:
#   status -> route open (user action) -> real Schedule row -> model-facing tool refusal
#   -> service refusal with an actor -> real delivery + receipt -> the session's own turn
#   -> shipped classifyPreStep on the delivered message -> close -> no row, no delivery.
set -uo pipefail
EV="/home/fish/projects_mine/dsh-grok-workflow/.rsi/evidence/round-017/heartbeat-live"
OUT="$EV/results/01-core-chain.txt"
PORT=3271
: >"$OUT"
say() { echo "$@" | tee -a "$OUT"; }
http() { PORT=$PORT node "$EV/probe-http.mjs" "$@" 2>&1 | tee -a "$OUT"; }
ask() { "$EV/qa.sh" "$@" 2>&1 | tee -a "$OUT"; }

say "# $(date -Is) heartbeat live chain (isolated instance, profile live-verify)"
cd "$EV/workspace"
PROBE_STUB_KEY=probe-stub-placeholder DSH_HOME="$EV/instance/dsh-home" \
  dsh --profile live-verify --host 127.0.0.1 --port "$PORT" --no-open >"$EV/instance/boot-core.tmp" 2>&1 &
CHILD=$!
for _ in $(seq 1 90); do
  grep -q "127.0.0.1:$PORT" "$EV/instance/boot-core.tmp" 2>/dev/null && break
  kill -0 "$CHILD" 2>/dev/null || { say "boot failed"; exit 1; }
  sleep 1
done
say "boot: $(sed -E 's/token=[A-Za-z0-9_-]+/token=[REDACTED]/g' "$EV/instance/boot-core.tmp" | tail -1)"
TOKEN=$(grep -o "token=[A-Za-z0-9_-]\{10,\}" "$EV/instance/boot-core.tmp" | tail -1 | cut -d= -f2-)
( umask 077; printf '%s' "$TOKEN" >"$EV/instance/.token" )
rm -f "$EV/instance/.cookies.json"
cd "$EV"
http login
# The probe row is composed once the plugin fibers are up; wait for its first answer.
sleep 3

say "## 1. create a real Session in the host"
SID=$(ask session "{\"cwd\":\"$EV/workspace\"}" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d).result.sessionId)}catch{console.log("")}})')
say "session=$SID"
[ -n "$SID" ] || { say "no session; aborting"; kill -TERM "$CHILD"; exit 1; }

say "## 2. status before any open"
http post /grok-workflow/loop "{\"action\":\"status\",\"sessionId\":\"$SID\"}"

say "## 3. open through POST /grok-workflow/loop (the switch: a user action, no actor)"
http post /grok-workflow/loop "{\"action\":\"open\",\"sessionId\":\"$SID\"}"

say "## 4. the row Schedule stored"
TASK=$(ask catalog '{}' | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const rows=JSON.parse(d).result;console.log(rows[0]?.id??"")})')
say "task=$TASK"

say "## 5. the model-facing tool refuses open (loop/user-only)"
ask tool-open "{\"sessionId\":\"$SID\"}"
say "## 6. the service refuses an Agent-attributed open (loop/user-only)"
ask open-with-actor "{\"sessionId\":\"$SID\",\"actor\":\"session-actor-probe\"}"
say "## 7. the refusals created no second row"
ask catalog '{}'

say "## 8. real Schedule delivery (manual run) + receipt"
ask run "{\"id\":\"$TASK\"}"

say "## 9. the delivered turn, from the Session log"
sleep 14
TRACE="$EV/results/02-session-trace.txt"
zstdcat "$EV"/instance/dsh-home/sessions/*/"$SID"/session.v4.jsonl.zstd | node -e '
let d = ""
process.stdin.on("data", (c) => { d += c }).on("end", () => {
  const events = d.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line))
  const out = []
  for (const event of events) {
    const text = event.data?.content?.[0]?.text ?? event.data?.message?.content?.[0]?.text ?? ""
    const source = event.data?.source?.kind ?? ""
    out.push(`${event.seq}\t${event.type}\t${source}\t${String(text).replace(/\s+/g, " ").slice(0, 120)}`)
  }
  console.log(out.join("\n"))
})' >"$TRACE"
say "session trace: $TRACE ($(wc -l <"$TRACE") events)"
say "--- schedule-sourced and assistant events ---"
grep -nE "schedule|assistant/message|turn/start|turn/end" "$TRACE" | tee -a "$OUT"

say "## 10. shipped classifyPreStep on the exact delivered message + isLoopHeartbeat"
zstdcat "$EV"/instance/dsh-home/sessions/*/"$SID"/session.v4.jsonl.zstd | node -e '
let d = ""
process.stdin.on("data", (c) => { d += c }).on("end", () => {
  const events = d.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line))
  const delivered = events.filter((e) => e.type === "user/message"
    && e.data?.source?.kind === "schedule"
    && String(e.data?.content?.[0]?.text ?? "").startsWith("[SCHEDULE REMINDER]"))
  const last = delivered[delivered.length - 1]
  require("node:fs").writeFileSync(process.argv[1], `${JSON.stringify(last.data, null, 2)}\n`)
})' "$EV/results/schedule-delivery-message.json"
MESSAGE=$(cat "$EV/results/schedule-delivery-message.json")
ask classify "{\"sessionId\":\"$SID\",\"message\":$MESSAGE}"
TEXT=$(node -e 'const fs=require("node:fs");const m=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(m.content[0].text)' "$EV/results/schedule-delivery-message.json")
ask heartbeat-probe "{\"text\":$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$TEXT")}"

say "## 11. close through the route"
http post /grok-workflow/loop "{\"action\":\"close\",\"sessionId\":\"$SID\"}"
say "## 12. status after close"
http post /grok-workflow/loop "{\"action\":\"status\",\"sessionId\":\"$SID\"}"
say "## 13. catalog after close (no row => nothing can deliver)"
ask catalog '{}'
say "## 14. a delivery attempt on the deleted row"
ask run "{\"id\":\"$TASK\"}"
say "## 15. the durable Schedule domain on disk"
node -e '
const fs = require("node:fs")
const store = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
console.log("stored rows:", JSON.stringify(Object.keys(store.tables.tasks)))
' "$EV/instance/dsh-home/storages/schedule.json" | tee -a "$OUT"

kill -TERM "$CHILD" 2>/dev/null
sleep 2
say "# done"
