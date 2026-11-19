#!/usr/bin/env bash
# Round-18 install acceptance harness — installs FROM GITHUB TAG, not a local tarball.
# Verifies v0.11.17 is installable and operable exactly the way a user installs it:
#   dsh plugin --profile <name> add github:free6589/dsh-grok-workflow#v0.11.17
# Adapted from round-17's tarball harness: only the artifact source changed
# (GitHub tag instead of `npm pack` output); the probe surface is identical, plus
# one new check — the installed package must carry lib/guardian.js (the 0.11.17 feature).
# Raw logs land in .tmp/r18/logs/ (gitignored); evidence files are written from them;
# the scratch (including the launch token and cookie jar) is deleted afterwards.
set -euo pipefail

R=/home/fish/projects_mine/dsh-grok-workflow
W=$R/.tmp/r18
L=$W/logs
PORT=${PORT:-3442}
TAG=${TAG:-v0.11.17}
SPEC="github:free6589/dsh-grok-workflow#${TAG}"

rm -rf "$W"
mkdir -p "$W" "$L"

# 1. isolated home + install FROM GITHUB
export DSH_HOME=$W/home
dsh --profile acc-tag --from-default-profile web --help > "$L/template.out" 2>&1 || { cat "$L/template.out"; exit 1; }
set +e
dsh plugin --profile acc-tag add "$SPEC" > "$L/add.out" 2> "$L/add.err"
ADD_RC=$?
set -e
{
  echo "cmd        : DSH_HOME=$DSH_HOME dsh plugin --profile acc-tag add $SPEC"
  echo "exit       : $ADD_RC"
  echo "--- stdout ---"; cat "$L/add.out"
  echo "--- stderr ---"; cat "$L/add.err"
  echo "--- profile package.json (dsh + dependencies) ---"
  node -e 'const p=require(process.argv[1]);console.log(JSON.stringify({dsh:p.dsh,dependencies:p.dependencies},null,1))' "$DSH_HOME/profiles/acc-tag/package.json"
  echo "--- installed package ---"
  node -e 'const p=require(process.argv[1]);console.log(p.name+"@"+p.version+" dsh="+JSON.stringify(p.dsh))' "$DSH_HOME/profiles/acc-tag/node_modules/dsh-grok-workflow/package.json"
  echo "--- installed lib entries (guardian must be present) ---"
  ls "$DSH_HOME/profiles/acc-tag/node_modules/dsh-grok-workflow/lib/guardian.js" "$DSH_HOME/profiles/acc-tag/node_modules/dsh-grok-workflow/lib/guardian.d.ts"
  node -e 'const g=require(process.argv[1]);console.log("guardian exports: "+Object.keys(g).sort().join(","))' "$DSH_HOME/profiles/acc-tag/node_modules/dsh-grok-workflow/lib/guardian.js"
} > "$L/02-install.txt"
[ "$ADD_RC" -eq 0 ] || { echo "INSTALL FAILED"; exit 1; }

# 2. enable the workflow provider (the web template ships workflow-ptc disabled)
cat > "$DSH_HOME/profiles/acc-tag/cordis.patch.yml" <<'YML'
- id: workflow-ptc
  disabled: false
  config:
    provider: spawn
YML
dsh --profile acc-tag --dump-config > "$L/dump-config.txt" 2>&1 || true

# 3. boot in the background and probe
dsh --profile acc-tag --host 127.0.0.1 --port "$PORT" --no-open > "$L/boot.log" 2>&1 &
PID=$!
cleanup() { kill "$PID" 2>/dev/null || true; wait "$PID" 2>/dev/null || true; }
trap cleanup EXIT
for _ in $(seq 1 240); do
  grep -q "127.0.0.1:$PORT" "$L/boot.log" && break
  kill -0 "$PID" 2>/dev/null || { echo "boot died"; cat "$L/boot.log"; exit 1; }
  sleep 0.5
done
TOKEN=$(grep -oE 'token=[A-Za-z0-9._~-]+' "$L/boot.log" | head -1 | cut -d= -f2)
: "${TOKEN:?no launch token in boot log}"
JAR=$W/cookies.txt
BASE=http://127.0.0.1:$PORT

code_auth=$(curl -s -o /dev/null -w '%{http_code}' -c "$JAR" "$BASE/?token=$TOKEN")
# Connection RPC envelope: {type:"client-request", rpcId, method:"<endpoint>", payload}
rpc() { # rpc <endpoint-path> <payload-json> <outfile>
  curl -s -b "$JAR" -H 'Content-Type: application/json' -H "Origin: $BASE" \
    -X POST "$BASE/api/$1" \
    -d "{\"type\":\"client-request\",\"rpcId\":\"r18-$1\",\"method\":\"$1\",\"payload\":{\"args\":$2}}" > "$3"
}
rpc settings/describe '{}' "$L/describe.json"
rpc session/create "{\"request\":{\"cwd\":\"$R\"}}" "$L/session-create.json"
SID=$(node -e 'const r=require(process.argv[1]);const s=r.result??r;console.log((s.value??s).sessionId??"")' "$L/session-create.json")
[ -n "$SID" ] || { echo "no session id"; head -c 600 "$L/session-create.json"; exit 1; }
rpc session/prompt "{\"request\":{\"requestId\":\"r18-probe\",\"sessionId\":\"$SID\",\"mode\":\"queue\",\"content\":[{\"type\":\"text\",\"text\":\"Reply with the single word: ok\"}]}}" "$L/prompt.json"
sleep 8
LOG=$(ls "$DSH_HOME"/sessions/*/"$SID"/session.v4.jsonl.zstd 2>/dev/null | head -1 || true)
if [ -n "$LOG" ]; then zstd -dc "$LOG" > "$L/session.jsonl" 2>/dev/null || true; else echo "no session log yet" > "$L/session.jsonl"; fi

# loop route: status -> open -> status -> close -> status
loop() { curl -s -b "$JAR" -H 'Content-Type: application/json' -H "Origin: $BASE" \
  -X POST "$BASE/grok-workflow/loop" -d "{\"action\":\"$1\",\"sessionId\":\"$SID\"}" -w '\nHTTP %{http_code}\n'; }
{ loop status; loop open; cp "$DSH_HOME/storages/schedule.json" "$L/schedule-open.json" 2>/dev/null || true; loop status; loop close; loop status; cp "$DSH_HOME/storages/schedule.json" "$L/schedule-closed.json" 2>/dev/null || true; } > "$L/loop.txt"
curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -H 'Content-Type: application/json' -H "Origin: $BASE" \
  -X POST "$BASE/grok-workflow/loop" -d "{\"action\":\"nope\",\"sessionId\":\"$SID\"}" > "$L/loop-bad-action.code" || true
curl -s -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -H "Origin: $BASE" \
  -X POST "$BASE/grok-workflow/loop" -d '{"action":"status"}' > "$L/loop-no-cookie.code" || true
curl -s -o /dev/null -w '%{http_code}' -b "$JAR" "$BASE/grok-workflow/loop" > "$L/loop-get.code" || true

# 4. client bytes: src vs lib vs installed copy
{
  echo "src/client/index.js : $(sha256sum "$R/src/client/index.js" | cut -d' ' -f1)"
  echo "lib/client.js       : $(sha256sum "$R/lib/client.js" | cut -d' ' -f1)"
  echo "installed copy      : $(sha256sum "$DSH_HOME/profiles/acc-tag/node_modules/dsh-grok-workflow/lib/client.js" | cut -d' ' -f1)"
  cmp -s "$R/src/client/index.js" "$R/lib/client.js" && echo "cmp src vs lib      : identical" || echo "cmp src vs lib      : DIFFER"
  cmp -s "$R/lib/client.js" "$DSH_HOME/profiles/acc-tag/node_modules/dsh-grok-workflow/lib/client.js" && echo "cmp lib vs installed  : identical" || echo "cmp lib vs installed  : DIFFER"
  echo "--- guardian: repo lib vs installed ---"
  sha256sum "$R/lib/guardian.js" "$DSH_HOME/profiles/acc-tag/node_modules/dsh-grok-workflow/lib/guardian.js"
  cmp -s "$R/lib/guardian.js" "$DSH_HOME/profiles/acc-tag/node_modules/dsh-grok-workflow/lib/guardian.js" && echo "cmp guardian.js       : identical" || echo "cmp guardian.js       : DIFFER"
} > "$L/client-bytes.txt"

# 5. the plugin's own diagnostics line, computed by the INSTALLED code from the live descriptor
node -e '
const fs = require("node:fs")
const raw = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
const body = raw.result?.ok === true ? raw.result.value : raw.result ?? raw
if (!Array.isArray(body.namespaces)) { console.error("no namespaces in describe response"); process.exit(2) }
const descriptor = body.namespaces.find(n => n.ns === "grok-workflow")
fs.writeFileSync(process.argv[2], JSON.stringify(descriptor, null, 1))
' "$L/describe.json" "$L/descriptor.json"
cat > "$W/diagnostics.mjs" <<'MJS'
import { readFileSync } from 'node:fs'
import { describeSurface } from './node_modules/dsh-grok-workflow/lib/settings.js'
const descriptor = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const ctx = {
  get(name) {
    if (name !== 'settings') return undefined
    return { describe: () => [descriptor], configure: () => undefined }
  },
}
const report = describeSurface(ctx)
console.log(JSON.stringify(report, null, 1))
MJS
cp "$W/diagnostics.mjs" "$DSH_HOME/profiles/acc-tag/diagnostics.mjs"
( cd "$DSH_HOME/profiles/acc-tag" && node diagnostics.mjs "$L/descriptor.json" ) > "$L/diagnostics.txt" 2>&1 || true

# 6. keep the raw boot/session artifacts the evidence cites
grep -v 'token=' "$L/boot.log" > "$L/boot.redacted.log" || true
echo "$SID" > "$L/session-id.txt"
echo "auth http code: $code_auth" > "$L/http-codes.txt"
echo "session: $SID" >> "$L/http-codes.txt"

cleanup
trap - EXIT
echo "run complete: $W"
