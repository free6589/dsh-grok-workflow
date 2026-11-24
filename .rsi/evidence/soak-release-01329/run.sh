#!/usr/bin/env bash
# One soak run: isolated DSH_HOME and HOME, the machine's existing gateway key
# sourced into the environment only, output captured to the file given.
#
#   ./run.sh <overlay.yml> <promptFile> <outFile>
set -u
ROOT=/home/fish/projects_mine/dsh-grok-workflow
SOAK=$ROOT/.tmp/soak-01329
overlay=$(readlink -f "$1")
prompt=$(readlink -f "$2")
out=$(readlink -f "$3" 2>/dev/null || echo "$3")

export DSH_HOME=$SOAK/dsh-home
export HOME=$SOAK/home
mkdir -p "$HOME" "$SOAK/work"

set -a
# shellcheck disable=SC1091
. /home/fish/.dsh/bifrost.env
set +a

cd "$SOAK/work" || exit 2
start=$(date +%s)
dsh --profile headless-soak --patch "$overlay" "$(cat "$prompt")" > "$out" 2>&1
code=$?
echo "exit=$code elapsed=$(( $(date +%s) - start ))s overlay=$overlay prompt=$prompt" >> "$out"
echo "exit=$code elapsed=$(( $(date +%s) - start ))s"
