#!/usr/bin/env bash
# Ask the in-host probe to run one operation and print its answer.
# The sequence number is epoch milliseconds: the probe ignores anything not greater than
# the highest it has already served, and a fresh host process starts from zero.
# usage: qa.sh <op> [extra-json]
set -euo pipefail
EV="/home/fish/projects_mine/dsh-grok-workflow/.rsi/evidence/round-017/heartbeat-live"
OP="$1"; EXTRA="${2:-{\}}"
SEQ=$(date +%s%3N)
RES="$EV/qa/res-$SEQ.json"
node -e '
const fs = require("node:fs")
const [seq, op, extra, dir] = process.argv.slice(1)
const body = Object.assign({ seq: Number(seq), op }, JSON.parse(extra))
fs.writeFileSync(`${dir}/cmd.json`, `${JSON.stringify(body)}\n`)
' "$SEQ" "$OP" "$EXTRA" "$EV/qa"
for _ in $(seq 1 120); do
  [ -s "$RES" ] && { cat "$RES"; exit 0; }
  sleep 0.5
done
echo "{\"op\":\"$OP\",\"error\":\"timeout waiting for the probe\"}" >&2
exit 2
