#!/usr/bin/env bash
# Verification rig (not product code). Launches headless Chromium with the native
# CDP endpoint drive.mjs attaches to. Foreground + exec so the caller owns it as a
# managed background job (a detached child is reaped when the tool call returns).
#   ./chrome.sh <debugPort>
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
DEBUG_PORT=${1:?usage: chrome.sh <debugPort>}
PROFILE_DIR=$HERE/chrome
rm -rf "$PROFILE_DIR"
mkdir -p "$PROFILE_DIR"
exec /usr/bin/chromium \
  --headless=new \
  --remote-debugging-port="$DEBUG_PORT" \
  --remote-debugging-address=127.0.0.1 \
  --remote-allow-origins='*' \
  --no-sandbox \
  --disable-gpu \
  --disable-dev-shm-usage \
  --no-first-run \
  --no-default-browser-check \
  --disable-extensions \
  --window-size=1440,960 \
  --user-data-dir="$PROFILE_DIR" \
  about:blank
