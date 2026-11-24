#!/usr/bin/env bash
# Verification rig (not product code). Boots one isolated DSH web instance for the
# soak: forked DSH_HOME + forked HOME, an unused port, the gateway key sourced into
# the process environment only (never written, never echoed).
#   ./boot.sh <overlay.yml> [port]
# Runs dsh in the FOREGROUND (exec) so the caller can own it as a managed
# background job — a detached `setsid` child is reaped when the tool call returns.
#
# The browser-trust token dsh prints at boot is written to <overlay>.token with
# 0600 and is never echoed here: this script only reports whether it exists.
set -uo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
OVERLAY=$(readlink -f "${1:?usage: boot.sh <overlay.yml> [port]}")
PORT_ARG=${2:-}

export DSH_HOME=${SOAK_DSH_HOME:-$HERE/dsh-home}
export HOME=${SOAK_HOME:-$HERE/home}
mkdir -p "$HOME" "$HERE/work"

# Never 3080 (the live instance) and never 3081.
pick_port() {
  local p
  for p in "${PORT_ARG:-}" 3199 3299 3399 3499 3599 3699 3799; do
    [ -n "$p" ] || continue
    [ "$p" = 3080 ] && continue
    [ "$p" = 3081 ] && continue
    if ! ss -ltnH 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${p}\$"; then
      echo "$p"
      return 0
    fi
  done
  return 1
}
PORT=$(pick_port) || { echo "no free port found" >&2; exit 2; }
echo "$PORT" > "$OVERLAY.port"
rm -f "$OVERLAY.token"
umask 077

set -a
# shellcheck disable=SC1091
. /home/fish/.dsh/bifrost.env
set +a
echo "keyPresent=$([ -n "${BIFROST_VIRTUAL_KEY:-}" ] && echo true || echo false)"
echo "pid=$$ port=$PORT"
echo "DSH_HOME=$DSH_HOME"
echo "HOME=$HOME"

cd "$HERE/work" || exit 2
# Tee the boot log, and lift the trust token into a 0600 file without printing it.
# `web` is not a positional subcommand: the profile IS the app (`--profile web-soak`).
dsh --profile web-soak --patch "$OVERLAY" --port "$PORT" --no-open 2>&1 \
  | tee "$OVERLAY.log" \
  | while IFS= read -r line; do
      if [ ! -s "$OVERLAY.token" ]; then
        case "$line" in
          *'dsh web: http'*'token='*)
            printf '%s' "${line##*token=}" | tr -d '\r' > "$OVERLAY.token"
            echo "trustToken=written"
            continue
            ;;
        esac
      fi
      printf '%s\n' "$line" | sed -E 's/token=[^ &]*/token=<redacted>/'
    done
