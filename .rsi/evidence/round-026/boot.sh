#!/usr/bin/env bash
# Round-026 live harness: boot the copied profile, mint the browser cookie from the
# printed launch URL, hand off to the driver. The launch URL carries a one-time token;
# it is written to a private file under /tmp and never echoed.
set -euo pipefail

WORK=/tmp/gwfx26
REPO=/home/fish/projects_mine/dsh-grok-workflow
PORT=3451
LOG="$WORK/boot.log"

: > "$LOG"
setsid dsh --profile loopfix-verify --port "$PORT" --no-open > "$LOG" 2>&1 &
BOOT_PID=$!
echo "boot pid=$BOOT_PID"

for _ in $(seq 1 120); do
  if grep -q "dsh web: http" "$LOG"; then break; fi
  sleep 1
done

URL=$(grep -m1 -oE "dsh web: http[^[:space:]]+" "$LOG" | sed 's/^dsh web: //')
if [ -z "${URL:-}" ]; then echo "no launch URL printed" >&2; exit 1; fi
printf '%s' "$URL" > "$WORK/boot-url.txt"
chmod 600 "$WORK/boot-url.txt"

# Mint the cookie jar (the root page answers a valid token with a Set-Cookie + redirect).
curl -sS -c "$WORK/cookies.txt" -b "$WORK/cookies.txt" -L -o /dev/null "$URL"
chmod 600 "$WORK/cookies.txt"
echo "cookie jar lines=$(grep -c 'dsh-auth-' "$WORK/cookies.txt" || true)"

echo "$BOOT_PID" > "$WORK/boot.pid"
