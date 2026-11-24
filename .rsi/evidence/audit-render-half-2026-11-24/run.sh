#!/usr/bin/env bash
# Verification rig (not product code). One isolated soak turn:
#   ./run.sh <overlay.yml> <promptFile> <outFile>
# DSH_HOME and HOME are the scratch clone; the gateway key is sourced into the
# process environment only (never printed, never copied into the repo).
set -u
S=$(cd "$(dirname "$0")" && pwd)
export DSH_HOME=$S/dsh-home
export HOME=$S/home
export npm_config_cache=$S/npm-cache
export pnpm_config_store_dir=$S/pnpm-store
mkdir -p "$HOME" "$S/work"

set -a
# shellcheck disable=SC1091
. /home/fish/.dsh/bifrost.env
set +a

overlay=$(readlink -f "$1")
prompt=$(readlink -f "$2")
out=$3

cd "$S/work" || exit 2
start=$(date +%s)
timeout 1200 dsh --profile headless-soak --patch "$overlay" "$(cat "$prompt")" > "$out" 2>&1
code=$?
echo "exit=$code elapsed=$(( $(date +%s) - start ))s overlay=$overlay prompt=$prompt out=$out" | tee -a "$out"
exit "$code"
