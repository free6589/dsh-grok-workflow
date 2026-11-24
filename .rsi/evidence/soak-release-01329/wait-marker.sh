#!/usr/bin/env bash
# Bounded wait for the merge/CI marker, with a slow upstream-health probe so the
# wait is also when we learn whether the pinned model came back.
set -u
ROOT=/home/fish/projects_mine/dsh-grok-workflow
SOAK=$ROOT/.tmp/soak-01329
MARKER=$ROOT/.tmp/merge-ci-ok.md
WT=$ROOT/.tmp/wt-rel-0.13.29
out=$SOAK/wait.log
: > "$out"
set -a
# shellcheck disable=SC1091
. /home/fish/.dsh/bifrost.env
set +a

health() {
  local code
  code=$(curl -s -m 45 -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:18088/openai/v1/chat/completions \
    -H "authorization: Bearer $BIFROST_VIRTUAL_KEY" -H 'content-type: application/json' \
    -d '{"model":"wb/cn:deepseek-v4.1-flash","messages":[{"role":"user","content":"ok"}],"max_tokens":2}')
  echo "$(date -Is) health wb/cn:deepseek-v4.1-flash http=$code" >> "$out"
}

for i in $(seq 1 60); do
  if [ -f "$MARKER" ]; then
    echo "$(date -Is) MARKER PRESENT after $((i-1)) intervals" >> "$out"
    cat "$MARKER" >> "$out"
    echo "--- worktree HEAD: $(git -C "$WT" rev-parse HEAD)" >> "$out"
    exit 0
  fi
  echo "$(date -Is) wait interval=$i marker=absent wt-head=$(git -C "$WT" rev-parse --short HEAD)" >> "$out"
  case $((i % 10)) in 1) health ;; esac
  sleep 30
done
echo "$(date -Is) TIMEOUT: marker absent after 60 intervals" >> "$out"
exit 1
