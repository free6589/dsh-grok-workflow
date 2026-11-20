#!/usr/bin/env bash
# Heartbeat guard for the RSI loop: resume, skip, or stop before a round is opened.
#
# A heartbeat turn is one scheduled delivery. This script is the first thing that turn
# runs, and its first word decides what the turn may do:
#
#   RESUME  exit 0   the previous round is closed and no stop condition holds: start one round
#   SKIP    exit 10  a round is already open (tree dirty / report open / ledger out of step):
#                    open no new round, pick no theme, edit nothing
#   STOP    exit 20  `.rsi/STOP` exists, the BLOCKED streak reached the threshold, the round cap
#                    was reached, or this is the `threshold`-th consecutive skip of the same
#                    unclosed round: open no round and print the stop summary instead
#
# It is read-only apart from two lines it may append: `.rsi/evidence/heartbeat-guard.log`
# with `--record` (runtime counter for the stall rule; `*.log` is gitignored), and, with
# `--prompt`, nothing at all. It never edits STATE/LOG/ROUND, never touches git, never
# creates a schedule task, and never echoes file contents into its output.
#
# Usage:
#   heartbeat-guard.sh [--root DIR] [--round N] [--threshold N] [--max-rounds N]
#                      [--record] [--prompt]
#
#   --root DIR        repository to inspect (default: the repository this script is in)
#   --round N|auto    round number this heartbeat would open (default: highest round + 1).
#                     `auto` derives it the way the plan does — the higher of `ROUND.md` and
#                     `ledger.jsonl`, plus one — so one constant prompt can be armed once and
#                     open every round of the budget (`.rsi/HEARTBEAT-PROMPT.md`)
#   --threshold N     consecutive BLOCKED rounds / consecutive skips that stop the loop
#                     (default 3, matching DEFAULT_LOOP_FAIL_STREAK in src/config.ts)
#   --max-rounds N    refuse to open a round above N; 0 means no cap (default 0 — the RSI
#                     loop's own cap is the operator's, the plugin's default 10 is for its
#                     repeat-run surface and would end this loop at round 11)
#   --record          append this verdict to `.rsi/evidence/heartbeat-guard.log`
#   --prompt          print the heartbeat prompt from `.rsi/HEARTBEAT.md` with the last-round
#                     summary and this round's numbers filled in; implies no logging
set -u

root=$(cd "$(dirname "$0")/../.." && pwd)
round=0
round_auto=0
threshold=3
max_rounds=0
record=0
prompt=0

while [ $# -gt 0 ]; do
  case "$1" in
    --root) root=${2:-}; shift 2 ;;
    --round) round=${2:-}; shift 2 ;;
    --threshold) threshold=${2:-}; shift 2 ;;
    --max-rounds) max_rounds=${2:-}; shift 2 ;;
    --record) record=1; shift ;;
    --prompt) prompt=1; shift ;;
    -h|--help) sed -n '2,45p' "$0"; exit 0 ;;
    *) printf 'heartbeat-guard: unknown argument %s\n' "$1" >&2; exit 64 ;;
  esac
done

case "$round" in
  auto) round_auto=1; round=0 ;;
esac

for pair in "round:$round" "threshold:$threshold" "max-rounds:$max_rounds"; do
  name=${pair%%:*}
  value=${pair#*:}
  if [ "$name" = round ] && [ "$round_auto" -eq 1 ]; then continue; fi
  case "$value" in
    ''|*[!0-9]*) printf 'heartbeat-guard: --%s must be a whole number, got "%s"\n' "$name" "$value" >&2; exit 64 ;;
  esac
done
if [ "$threshold" -lt 1 ]; then
  printf 'heartbeat-guard: --threshold must be at least 1\n' >&2
  exit 64
fi
if [ ! -d "$root/.rsi" ]; then
  printf 'heartbeat-guard: %s/.rsi is not a directory; --root must name the repository\n' "$root" >&2
  exit 65
fi

rsi="$root/.rsi"
round_md="$rsi/ROUND.md"
ledger="$rsi/ledger.jsonl"
state="$rsi/STATE.md"
handoff="$root/docs/knowledge/HANDOFF.md"
template="$rsi/HEARTBEAT.md"
log="$rsi/evidence/heartbeat-guard.log"

# Highest round a report exists for, and the highest round the ledger admits to.
round_max=0
if [ -f "$round_md" ]; then
  found=$(grep -oE '^## Round [0-9]+' "$round_md" | grep -oE '[0-9]+$' | sort -n | tail -1)
  [ -n "$found" ] && round_max=$found
fi

ledger_max=0
if [ -f "$ledger" ]; then
  found=$(grep -oE '"round"[[:space:]]*:[[:space:]]*[0-9]+' "$ledger" | grep -oE '[0-9]+$' | sort -n | tail -1)
  [ -n "$found" ] && ledger_max=$found
fi

# Consecutive BLOCKED rounds at the tail of the ledger. A line without a status stops the
# count: only an unbroken run of recorded BLOCKED rounds may stop the loop.
blocked_streak=0
if [ -f "$ledger" ]; then
  blocked_streak=$(awk '
    { lines[NR] = $0 }
    END {
      n = 0
      for (i = NR; i > 0; i--) {
        if (lines[i] ~ /"status"[[:space:]]*:[[:space:]]*"BLOCKED"/) { n++; continue }
        if (lines[i] ~ /"status"[[:space:]]*:/) break
      }
      print n
    }' "$ledger")
fi

# The trailing round section exists but never recorded a status: the round was opened and
# abandoned, so the next heartbeat must not open another one on top of it.
report_open=0
if [ -f "$round_md" ]; then
  if awk '
    /^## Round [0-9]+/ { seen = 1; found = 0; next }
    seen && /^- \*\*status:\*\*/ { found = 1 }
    END { exit (seen && !found) ? 0 : 1 }
  ' "$round_md"; then
    report_open=1
  fi
fi

# Tracked modifications only. Untracked files are deliberately ignored: this repository keeps
# two of them on purpose (the operator's settings mock, and evidence bundles whose `*.log`
# members are gitignored), and mid-round evidence is untracked until the round commits.
git_ok=0
dirty_count=0
dirty_first=''
if command -v git >/dev/null 2>&1 && git -C "$root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git_ok=1
  tracked=$(git -C "$root" status --porcelain --untracked-files=no 2>/dev/null)
  if [ -n "$tracked" ]; then
    dirty_count=$(printf '%s\n' "$tracked" | wc -l | tr -d ' ')
    dirty_first=$(printf '%s\n' "$tracked" | head -1 | cut -c4-)
  fi
fi

if [ "$round" -le 0 ]; then
  if [ "$round_auto" -eq 1 ]; then
    # The higher of the two records, exactly as `.rsi/tools/iterate-plan.mjs` counts a spent
    # round: a round recorded in one place was still spent, so the next one is above it.
    round=$((round_max + 1))
    [ "$ledger_max" -ge "$round" ] && round=$((ledger_max + 1))
  else
    round=$((round_max + 1))
  fi
fi

# Which signal says the previous round is not closed. First match wins; each code is stable
# because the stall counter groups consecutive skips by it.
unclosed=''
if [ "$report_open" -eq 1 ]; then
  unclosed=round-report-open
elif [ "$round_max" -gt "$ledger_max" ]; then
  unclosed=round-without-ledger
elif [ "$ledger_max" -gt "$round_max" ]; then
  unclosed=ledger-without-round
elif [ "$dirty_count" -gt 0 ]; then
  unclosed=dirty-tracked
fi

verdict=RESUME
code=none
if [ -e "$rsi/STOP" ]; then
  verdict=STOP
  code=stop-file
elif [ "$max_rounds" -gt 0 ] && [ "$round" -gt "$max_rounds" ]; then
  verdict=STOP
  code=round-cap
elif [ "$blocked_streak" -ge "$threshold" ]; then
  verdict=STOP
  code=blocked-streak
elif [ -n "$unclosed" ]; then
  verdict=SKIP
  code=$unclosed
fi

# The stall rule: a round that stays unclosed for `threshold` consecutive heartbeats is a
# blocked loop too — every one of those turns spends quota to learn nothing. Counted from the
# guard log, per code, so a different unclosed signal starts its own run.
unclosed_skips=0
if [ -f "$log" ] && [ -n "$unclosed" ]; then
  unclosed_skips=$(awk -v code="$code" '
    { lines[NR] = $0 }
    END {
      n = 0
      for (i = NR; i > 0; i--) {
        if (lines[i] !~ /verdict=SKIP/) break
        if (lines[i] ~ ("code=" code "([[:space:]]|$)")) { n++; continue }
        break
      }
      print n
    }' "$log")
fi
# The current heartbeat is the next skip in the run, so the run reaches the threshold when the
# prior skips are one short of it: threshold 3 stops on the third heartbeat, not the fourth.
if [ "$verdict" = SKIP ] && [ $((unclosed_skips + 1)) -ge "$threshold" ]; then
  verdict=STOP
  code=stall-unclosed
fi

if [ "$prompt" -eq 1 ]; then
  if [ ! -f "$template" ]; then
    printf 'heartbeat-guard: %s is missing; the prompt lives there\n' "$template" >&2
    exit 65
  fi
  if ! awk '/<!-- heartbeat-template:start -->/{inside=1;next}/<!-- heartbeat-template:end -->/{inside=0}inside' "$template" | grep -q '[^[:space:]]'; then
    printf 'heartbeat-guard: %s has no text between the heartbeat-template markers\n' "$template" >&2
    exit 65
  fi
  summary=$(mktemp)
  trap 'rm -f "$summary"' EXIT
  {
    printf '### Loop records at the time this heartbeat was armed\n\n'
    if [ -f "$state" ]; then
      printf -- '- `.rsi/STATE.md` header: %s\n' "$(grep -m1 '^Updated:' "$state" | cut -c1-240)"
    fi
    if [ -f "$ledger" ]; then
      printf -- '- `.rsi/ledger.jsonl`, last row: %s\n' "$(tail -1 "$ledger" | cut -c1-600)"
    fi
    if [ -f "$handoff" ]; then
      printf -- '- `docs/knowledge/HANDOFF.md`, newest entry: %s\n' "$(grep -m1 '^## ' "$handoff" | cut -c1-240)"
    fi
    if [ -f "$round_md" ]; then
      printf '\n### `.rsi/ROUND.md`, the trailing round section (quoted)\n\n'
      awk '/^## Round [0-9]+/ { buf = "" } /^## Round [0-9]+/ || buf != "" { buf = buf $0 "\n" } END { printf "%s", buf }' "$round_md" | head -n 18
    fi
  } > "$summary"
  awk -v roundno="$round" -v thr="$threshold" -v streak="$blocked_streak" -v file="$summary" '
    function emit(   line) {
      while ((getline line < file) > 0) print line
      close(file)
    }
    /<!-- heartbeat-template:start -->/ { inside = 1; next }
    /<!-- heartbeat-template:end -->/ { inside = 0; next }
    !inside { next }
    /^\{\{LAST_ROUND_SUMMARY\}\}$/ { emit(); next }
    {
      gsub(/\{\{NEXT_ROUND\}\}/, roundno)
      gsub(/\{\{THRESHOLD\}\}/, thr)
      gsub(/\{\{BLOCKED_STREAK\}\}/, streak)
      print
    }' "$template"
  exit 0
fi

printf '%s code=%s next_round=%s threshold=%s max_rounds=%s blocked_streak=%s round_max=%s ledger_max=%s dirty_tracked=%s report_open=%s unclosed_skips=%s\n' \
  "$verdict" "$code" "$round" "$threshold" "$max_rounds" "$blocked_streak" "$round_max" "$ledger_max" "$dirty_count" "$report_open" "$unclosed_skips"
if [ "$dirty_count" -gt 0 ]; then
  printf 'first uncommitted: %s\n' "$dirty_first"
fi
if [ "$git_ok" -eq 0 ]; then
  printf 'git unavailable: dirtiness not checked\n'
fi

if [ "$record" -eq 1 ]; then
  mkdir -p "$rsi/evidence"
  printf '%s verdict=%s code=%s next_round=%s blocked_streak=%s dirty_tracked=%s\n' \
    "$(date -Iseconds)" "$verdict" "$code" "$round" "$blocked_streak" "$dirty_count" >> "$log"
fi

case "$verdict" in
  RESUME) exit 0 ;;
  SKIP) exit 10 ;;
  *) exit 20 ;;
esac
