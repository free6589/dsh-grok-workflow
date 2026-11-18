#!/usr/bin/env bash
# Round-start STOP check for the RSI loop.
#
# The loop must test `.rsi/STOP` before it picks a theme, and the check has to leave a
# trace: a prose sentence in STATE.md is not evidence. Every call appends one line to
# `.rsi/evidence/stop-probes.txt` (timestamp, round, cwd, exact command, verdict) and
# prints the same line, so the caller can stop immediately on `STOP PRESENT`.
#
# Usage: .rsi/tools/stop-probe.sh <round-number>
set -u

root=$(cd "$(dirname "$0")/../.." && pwd)
file="$root/.rsi/evidence/stop-probes.txt"
if [ ! -f "$file" ]; then
  printf '# Round-start STOP probes — one line per round, written by .rsi/tools/stop-probe.sh\n' > "$file"
fi

stamp=$(date -Iseconds)
if [ -e "$root/.rsi/STOP" ]; then
  verdict='STOP PRESENT'
else
  verdict='STOP ABSENT'
fi

line="$stamp round=${1:-?} cwd=$root cmd='test -e .rsi/STOP' -> $verdict"
printf '%s\n' "$line" >> "$file"
printf '%s\n' "$line"
