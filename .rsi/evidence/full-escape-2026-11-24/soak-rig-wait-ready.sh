#!/usr/bin/env bash
# Verification rig (not product code). Waits for the booted soak instance to answer
# HTTP 200 and prints the bare URL (no token — the GUI accepts the bare origin).
#   ./wait-ready.sh <overlay.yml>
set -uo pipefail
OVERLAY=$(readlink -f "${1:?usage: wait-ready.sh <overlay.yml>}")
PORT=$(cat "$OVERLAY.port")
URL="http://127.0.0.1:$PORT"
for i in $(seq 1 180); do
  code=$(curl -s -o /dev/null -m 2 -w '%{http_code}' "$URL/" 2>/dev/null)
  if [ "$code" = "200" ]; then
    echo "ready=$URL after ${i}s"
    exit 0
  fi
  sleep 1
done
echo "not ready after 180s (last http=$code)" >&2
exit 1
