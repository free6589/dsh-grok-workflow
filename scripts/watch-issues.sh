#!/usr/bin/env bash
# Poll a GitHub repository's open issues and wake a DSH agent when something
# new appears. The watcher stores only issue metadata/comments in its state
# directory; it never logs credentials.
set -euo pipefail
umask 077

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly ROOT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
readonly REPO="${WATCH_REPO:-free6589/dsh-grok-workflow}"
readonly POLL_SECONDS="${WATCH_POLL_SECONDS:-60}"
readonly MAX_ISSUES="${WATCH_MAX_ISSUES:-100}"
readonly STATE_DIR="${WATCH_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/dsh-grok-workflow/issue-watch}"
readonly STATE_FILE="$STATE_DIR/state.json"
readonly EVENTS_FILE="$STATE_DIR/pending/events.ndjson"
readonly PROMPT_DIR="$STATE_DIR/pending/prompts"
readonly ARCHIVE_DIR="$STATE_DIR/archive"
readonly LOG_FILE="${WATCH_LOG_FILE:-$STATE_DIR/watch.log}"
readonly WAKE_LOG="${WATCH_WAKE_LOG:-$STATE_DIR/wake.log}"
readonly QUEUE_FILE="$STATE_DIR/pending/prompt-queue.txt"
QUEUED_PROMPT=""
readonly WAKE_MODE="${WATCH_WAKE_MODE:-dsh}" # dsh | command | noop
readonly WAKE_COMMAND="${WATCH_WAKE_COMMAND:-}"
readonly DSH_BIN="${DSH_BIN:-dsh}"
readonly DSH_PROFILE="${DSH_PROFILE:-grok-workflow-dev}"
readonly DSH_SESSION_ID="${DSH_SESSION_ID:-}"
PATCH_FILE="${DSH_PATCH:-}"
readonly DSH_ENV_FILE="${DSH_ENV_FILE:-$HOME/.dsh/bifrost.env}"
readonly WAKE_TIMEOUT="${WATCH_WAKE_TIMEOUT:-3600}"
readonly SELF_MARKER="<!-- dsh-issue-watcher:ignore -->"

[[ "$REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || { printf 'watch-issues: WATCH_REPO must be owner/repo\n' >&2; exit 2; }
case "$WAKE_MODE" in dsh|command|noop) ;; *) printf 'watch-issues: WATCH_WAKE_MODE must be dsh, command, or noop\n' >&2; exit 2 ;; esac

mkdir -p "$STATE_DIR" "$STATE_DIR/pending" "$PROMPT_DIR" "$ARCHIVE_DIR"

# Out-of-the-box support for this repository's isolated test profile. A caller
# that needs another DSH home can set DSH_HOME explicitly.
if [[ -z "${DSH_HOME:-}" && -f "$ROOT_DIR/.dsh-home/profiles/$DSH_PROFILE/cordis.yml" ]]; then
  export DSH_HOME="$ROOT_DIR/.dsh-home"
fi
if [[ -z "$PATCH_FILE" && -f "$ROOT_DIR/.dsh-home/gw-model.patch.yml" ]]; then
  PATCH_FILE="$ROOT_DIR/.dsh-home/gw-model.patch.yml"
fi

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$LOG_FILE"
}

die() {
  log "ERROR: $*"
  printf 'watch-issues: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage: scripts/watch-issues.sh [--once] [--help]

Poll GitHub issues every WATCH_POLL_SECONDS (default 60) and start a DSH
headless turn for new issues, new comments, or issue updates. The first run
creates a baseline and does not wake for existing issues.

Environment:
  WATCH_REPO=owner/repo              Repository to watch
  WATCH_POLL_SECONDS=60              Poll interval
  WATCH_STATE_DIR=...                State, queue, and log directory
  WATCH_WAKE_MODE=dsh                dsh | command | noop
  WATCH_WAKE_COMMAND='...'           Command used with WATCH_WAKE_MODE=command
  DSH_BIN=dsh                        DSH executable
  DSH_PROFILE=grok-workflow-dev      DSH profile to wake
  DSH_SESSION_ID=...                 Optional existing DSH session to resume
  DSH_ENV_FILE=...                   Optional environment file to source
  WATCH_WAKE_TIMEOUT=3600            Kill a wake after this many seconds

The DSH wake receives the event text on stdin. With WATCH_WAKE_MODE=noop the
prompt is written under the state directory instead, which is useful for
testing or for wiring another notification system.
USAGE
}

ONCE=0
for arg in "$@"; do
  case "$arg" in
    --once) ONCE=1 ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument: $arg" ;;
  esac
done

command -v gh >/dev/null 2>&1 || die "gh is required"
command -v jq >/dev/null 2>&1 || die "jq is required"
[[ "$POLL_SECONDS" =~ ^[1-9][0-9]*$ ]] || die "WATCH_POLL_SECONDS must be a positive integer"
[[ "$MAX_ISSUES" =~ ^[1-9][0-9]*$ ]] || die "WATCH_MAX_ISSUES must be a positive integer"

# One watcher per state directory. The lock is held for the process lifetime.
exec 9>"$STATE_DIR/watch.lock"
if ! flock -n 9; then
  log "another watcher already holds $STATE_DIR/watch.lock; exiting"
  exit 0
fi

if [[ ! -f "$STATE_FILE" ]]; then
  printf '%s\n' "{\"version\":1,\"repo\":\"$REPO\",\"lastPollAt\":null,\"issues\":{}}" > "$STATE_FILE"
fi

# Read optional model credentials only in the wake child (never print them).
source_wake_env() {
  if [[ -n "$DSH_ENV_FILE" && -f "$DSH_ENV_FILE" ]]; then
    # shellcheck disable=SC1090
    set -a
    . "$DSH_ENV_FILE"
    set +a
  fi
}

reap_wake() {
  if [[ -n "${WAKE_PID:-}" ]] && ! kill -0 "$WAKE_PID" 2>/dev/null; then
    local rc=0
    wait "$WAKE_PID" || rc=$?
    log "wake pid=$WAKE_PID finished rc=$rc"
    WAKE_PID=""
  fi
  if [[ -z "${WAKE_PID:-}" && -s "$QUEUE_FILE" ]]; then
    local next
    next=$(head -n 1 "$QUEUE_FILE" || true)
    if [[ -n "$next" ]]; then
      tail -n +2 "$QUEUE_FILE" > "$QUEUE_FILE.tmp" && mv "$QUEUE_FILE.tmp" "$QUEUE_FILE"
      [[ -f "$next" ]] && start_wake "$next"
    fi
  fi
}

run_wake() {
  local prompt_file="$1"
  local rc=0
  {
    printf '\n=== wake %s ===\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    source_wake_env
    if [[ "$WAKE_MODE" == "command" ]]; then
      [[ -n "$WAKE_COMMAND" ]] || { echo "WATCH_WAKE_COMMAND is empty"; exit 64; }
      if command -v timeout >/dev/null 2>&1; then
        timeout "$WAKE_TIMEOUT" bash -lc "$WAKE_COMMAND" < "$prompt_file"
      else
        bash -lc "$WAKE_COMMAND" < "$prompt_file"
      fi
    else
      local args=(--profile "$DSH_PROFILE")
      [[ -n "$PATCH_FILE" ]] && args+=(--patch "$PATCH_FILE")
      [[ -n "$DSH_SESSION_ID" ]] && args+=(--session-id "$DSH_SESSION_ID")
      args+=(--json)
      if command -v timeout >/dev/null 2>&1; then
        timeout "$WAKE_TIMEOUT" "$DSH_BIN" "${args[@]}" < "$prompt_file"
      else
        "$DSH_BIN" "${args[@]}" < "$prompt_file"
      fi
    fi
  } >> "$WAKE_LOG" 2>&1 || rc=$?
  printf '%s\n' "$rc" > "$STATE_DIR/last-wake.status"
  return 0
}

start_wake() {
  local prompt_file="$1"
  if [[ -n "${WAKE_PID:-}" ]] && kill -0 "$WAKE_PID" 2>/dev/null; then
    printf '%s\n' "$prompt_file" >> "$QUEUE_FILE"
    QUEUED_PROMPT="$prompt_file"
    log "wake already running; prompt queued at $prompt_file"
    return 0
  fi
  if [[ "$WAKE_MODE" == "noop" ]]; then
    local out="$ARCHIVE_DIR/$(basename "$prompt_file")"
    cp "$prompt_file" "$out"
    printf '%s\n' "noop" > "$STATE_DIR/last-wake.status"
    log "noop wake; prompt saved at $out"
    return 0
  fi
  ( run_wake "$prompt_file" ) &
  WAKE_PID=$!
  log "wake started pid=$WAKE_PID prompt=$prompt_file"
}

build_prompt() {
  local prompt_file="$1"
  {
    printf 'GitHub issue watcher event\n'
    printf 'Repository: %s\n' "$REPO"
    printf 'Detected: %s\n\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    jq -r '
      if .type == "new_issue" then
        "NEW ISSUE #\(.number): \(.title)\nURL: \(.url)\n"
      elif .type == "new_comments" then
        "NEW COMMENTS on #\(.number): \(.title)\nURL: \(.url)\n" +
        ([.comments[] | "- \(.author) at \(.createdAt):\n\(.body)\n"] | join("\n"))
      else
        "ISSUE UPDATED #\(.number): \(.title)\nURL: \(.url)\n"
      end
    ' "$EVENTS_FILE"
    printf '\nRead the affected issue(s) and follow the repository AGENTS.md. '
    printf 'Take action only within this repository. Do not print credentials or tokens. '
    printf 'If you reply on GitHub, include the exact marker %s in the comment so the watcher does not wake on its own reply.\n' "$SELF_MARKER"
  } > "$prompt_file"
}

# Return a comment array for one issue. One page is enough for this repository;
# --slurp keeps the result valid if a page is ever split.
fetch_comments() {
  local number="$1"
  local raw
  raw=$(gh api --paginate --slurp "repos/$REPO/issues/$number/comments?per_page=100" 2>>"$LOG_FILE") || return 1
  printf '%s\n' "$raw" | jq -c 'add // []'
}

process_cycle() {
  local issues_file="$STATE_DIR/issues.snapshot.json"
  local raw_issues="$STATE_DIR/issues.raw.json"
  if ! gh issue list --repo "$REPO" --state open --limit "$MAX_ISSUES" \
      --json number,title,url,updatedAt,comments > "$raw_issues" 2>>"$LOG_FILE"; then
    log "issue list failed; keeping previous state"
    return 1
  fi
  # Keep only the comment count. Comment bodies are fetched only when activity
  # is detected and are kept out of the durable state file.
  if ! jq '[.[] | {number,title,url,updatedAt,commentCount:(.comments|length)}]' \
      "$raw_issues" > "$issues_file"; then
    log "issue list normalization failed; keeping previous state"
    return 1
  fi
  rm -f "$raw_issues"

  local first_run=0
  [[ "$(jq -r '.lastPollAt // empty' "$STATE_FILE")" == "" ]] && first_run=1

  local event_count=0
  local issue number updated count title url old_entry old_updated old_count
  while IFS= read -r issue; do
    number=$(jq -r '.number' <<<"$issue")
    updated=$(jq -r '.updatedAt' <<<"$issue")
    count=$(jq -r '.commentCount' <<<"$issue")
    title=$(jq -r '.title' <<<"$issue")
    url=$(jq -r '.url' <<<"$issue")
    old_entry=$(jq -c --arg n "$number" '.issues[$n] // empty' "$STATE_FILE")
    if [[ -z "$old_entry" ]]; then
      if [[ "$first_run" -eq 0 ]]; then
        jq -nc --arg type new_issue --argjson n "$number" --arg title "$title" --arg url "$url" \
          --arg updated "$updated" --argjson count "$count" \
          '{type:$type,number:$n,title:$title,url:$url,updatedAt:$updated,commentCount:$count}' >> "$EVENTS_FILE"
        event_count=$((event_count + 1))
      fi
      jq --arg n "$number" --arg updated "$updated" --argjson count "$count" \
        '.issues[$n] = {updatedAt:$updated,commentCount:$count,lastActivityAt:$updated,lastCommentId:0}' \
        "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
      continue
    fi
    old_updated=$(jq -r '.updatedAt' <<<"$old_entry")
    old_count=$(jq -r '.commentCount // 0' <<<"$old_entry")
    if [[ "$updated" == "$old_updated" && "$count" == "$old_count" ]]; then
      continue
    fi

    local comments='[]' last_activity new_comments='[]' last_id=0
    last_activity=$(jq -r '.lastActivityAt // .updatedAt' <<<"$old_entry")
    if (( count > old_count )); then
      if ! comments=$(fetch_comments "$number"); then
        log "comments for #$number failed; will retry next poll"
        continue
      fi
      new_comments=$(jq -c --arg last "$last_activity" --arg marker "$SELF_MARKER" '
        [ .[] | select(.created_at > $last) | select((.body // "") | contains($marker) | not)
          | {id,author:(.user.login // "unknown"),body:((.body // "")[0:1200]),createdAt:.created_at,url:.html_url} ]
      ' <<<"$comments")
      last_id=$(jq -r '[.[].id] | max // 0' <<<"$comments")
      if [[ "$(jq 'length' <<<"$new_comments")" -gt 0 ]]; then
        jq -nc --arg type new_comments --argjson n "$number" --arg title "$title" --arg url "$url" \
          --argjson comments "$new_comments" \
          '{type:$type,number:$n,title:$title,url:$url,comments:$comments}' >> "$EVENTS_FILE"
        event_count=$((event_count + 1))
        last_activity=$(jq -r '[.[].createdAt] | max // empty' <<<"$new_comments")
        [[ -n "$last_activity" ]] || last_activity="$updated"
      else
        last_activity="$updated"
      fi
    else
      # A title/body edit (or a deletion) changed updatedAt without a new comment.
      if [[ "$first_run" -eq 0 ]]; then
        jq -nc --arg type issue_updated --argjson n "$number" --arg title "$title" --arg url "$url" --arg updated "$updated" \
          '{type:$type,number:$n,title:$title,url:$url,updatedAt:$updated}' >> "$EVENTS_FILE"
        event_count=$((event_count + 1))
      fi
      last_activity="$updated"
    fi

    jq --arg n "$number" --arg updated "$updated" --argjson count "$count" \
      --arg last "$last_activity" --argjson lastid "$last_id" \
      '.issues[$n] = {updatedAt:$updated,commentCount:$count,lastActivityAt:$last,lastCommentId:$lastid}' \
      "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
  done < <(jq -c '.[]' "$issues_file")

  jq --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '.lastPollAt=$now' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"

  if [[ "$first_run" -eq 1 ]]; then
    log "baseline created for $REPO (no wake for existing issues)"
    return 0
  fi
  if [[ "$event_count" -eq 0 ]]; then
    log "poll: no changes"
    return 0
  fi

  local prompt_file="$PROMPT_DIR/$(date -u +%Y%m%dT%H%M%SZ)-$$.txt"
  build_prompt "$prompt_file"
  mv "$EVENTS_FILE" "$ARCHIVE_DIR/events-$(date -u +%Y%m%dT%H%M%SZ)-$$.ndjson"
  start_wake "$prompt_file"
  log "poll: $event_count event(s)"
}

reap_wake
SLEEP_PID=""
trap 'kill "${SLEEP_PID:-}" 2>/dev/null || true; [[ -n "${WAKE_PID:-}" ]] && kill "$WAKE_PID" 2>/dev/null || true; exit 0' INT TERM
log "watcher starting repo=$REPO interval=${POLL_SECONDS}s state=$STATE_DIR"
while :; do
  reap_wake
  process_cycle || true
  reap_wake
  if [[ "$ONCE" -eq 1 ]]; then
    if [[ -n "${WAKE_PID:-}" ]]; then
      wait "$WAKE_PID" || true
      WAKE_PID=""
    fi
    break
  fi
  sleep "$POLL_SECONDS" &
  SLEEP_PID=$!
  wait "$SLEEP_PID" || true
done
