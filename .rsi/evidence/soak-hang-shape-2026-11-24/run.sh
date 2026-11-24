#!/usr/bin/env bash
# One soak run, self-contained: starts the fake gateway, runs one dsh turn
# against an isolated DSH_HOME and HOME, then stops the gateway.
#
# The machine's existing gateway key is sourced into the process environment
# only (never printed, never copied, never echoed).
#
#   ./run.sh <overlay.yml> <promptFile> <outFile> [gatewayLog]
set -u
ROOT=/home/fish/projects_mine/dsh-grok-workflow
HERE=$(cd "$(dirname "$0")" && pwd)
SOAK=${SOAK_DIR:-$ROOT/.tmp/soak-hang}
overlay=$(readlink -f "$1")
prompt=$(readlink -f "$2")
out=$(readlink -f "$3" 2>/dev/null || echo "$3")
gwlog=${4:-$HERE/gateway.log}

export DSH_HOME=$SOAK/dsh-home
export HOME=$SOAK/home
mkdir -p "$HOME" "$SOAK/work"

set -a
# shellcheck disable=SC1091
. /home/fish/.dsh/bifrost.env
set +a

rm -f "$gwlog"
node "$HERE/gateway.mjs" "$gwlog" > "$HERE/gateway.stdout.log" 2>&1 &
gw=$!
cleanup() { kill "$gw" 2>/dev/null; wait "$gw" 2>/dev/null; }
trap cleanup EXIT

# Wait for the listen line rather than sleeping a guessed amount.
for _ in $(seq 1 100); do
  if [ -f "$gwlog" ] && grep -q 'listening on 127.0.0.1:18593' "$gwlog"; then break; fi
  sleep 0.1
done

cd "$SOAK/work" || exit 2
start=$(date +%s)
timeout 1200 dsh --profile headless-soak --patch "$overlay" "$(cat "$prompt")" > "$out" 2>&1
code=$?
echo "exit=$code elapsed=$(( $(date +%s) - start ))s overlay=$overlay prompt=$prompt" >> "$out"
echo "exit=$code elapsed=$(( $(date +%s) - start ))s"
