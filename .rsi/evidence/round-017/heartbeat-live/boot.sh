#!/usr/bin/env bash
# Start the local model-boundary stub and boot the isolated DSH instance.
# The launch token is written to instance/.token (mode 600) and scrubbed from every
# log before it is kept; the run's final step deletes .token and the cookie jar.
set -euo pipefail
EV="/home/fish/projects_mine/dsh-grok-workflow/.rsi/evidence/round-017/heartbeat-live"
PORT="${PORT:-3271}"
STUB_PORT="${STUB_PORT:-3197}"

mkdir -p "$EV/instance"
cd "$EV/stub"
STUB_PORT="$STUB_PORT" nohup node stub-llm.mjs >"$EV/instance/stub.log" 2>&1 &
echo "stub_pid=$!" | tee "$EV/instance/stub-pid.txt"
sleep 1
curl -s "http://127.0.0.1:$STUB_PORT/v1/models" | head -c 200; echo

export DSH_HOME="$EV/instance/dsh-home"
cd "$EV/workspace"
nohup dsh --profile live-verify --host 127.0.0.1 --port "$PORT" --no-open \
  >"$EV/instance/boot-raw.tmp" 2>&1 &
echo "dsh_pid=$!" | tee "$EV/instance/dsh-pid.txt"

for _ in $(seq 1 120); do
  if grep -q "127.0.0.1:$PORT" "$EV/instance/boot-raw.tmp" 2>/dev/null; then break; fi
  if ! kill -0 "$(cut -d= -f2 "$EV/instance/dsh-pid.txt")" 2>/dev/null; then echo "instance died"; break; fi
  sleep 1
done

TOKEN="$(grep -o "token=[A-Za-z0-9_-]\{10,\}" "$EV/instance/boot-raw.tmp" | head -1 | cut -d= -f2- || true)"
if [ -n "${TOKEN:-}" ]; then
  ( umask 077; printf '%s' "$TOKEN" > "$EV/instance/.token" )
fi
sed -E 's/token=[A-Za-z0-9_-]+/token=[REDACTED]/g' "$EV/instance/boot-raw.tmp" > "$EV/instance/boot-redacted.log"
rm -f "$EV/instance/boot-raw.tmp"
echo "token_captured=$([ -s "$EV/instance/.token" ] && echo yes || echo no)"
echo "--- boot (redacted) ---"
cat "$EV/instance/boot-redacted.log"
