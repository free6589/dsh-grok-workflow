#!/usr/bin/env bash
# Verification rig (not product code). One isolated soak turn:
#   ./run.sh <overlay.yml> <promptFile> <outFile>
# DSH_HOME and HOME are the scratch clone; the gateway key is sourced into the
# process environment only (never printed, never copied).
set -u
ROOT=/home/fish/projects_mine/dsh-grok-workflow
HERE=$(cd "$(dirname "$0")" && pwd)
SOAK=${SOAK_DIR:-$HERE}

export DSH_HOME=$SOAK/dsh-home
export HOME=$SOAK/home
mkdir -p "$HOME" "$SOAK/work"

set -a
# shellcheck disable=SC1091
. /home/fish/.dsh/bifrost.env
set +a

overlay=$(readlink -f "$1")
prompt=$(readlink -f "$2")
out=$(readlink -f "$3" 2>/dev/null || echo "$3")

cd "$SOAK/work" || exit 2
start=$(date +%s)
timeout 1500 dsh --profile headless-soak --patch "$overlay" "$(cat "$prompt")" > "$out" 2>&1
code=$?
echo "exit=$code elapsed=$(( $(date +%s) - start ))s overlay=$overlay out=$out" | tee -a "$out"
exit "$code"
