#!/usr/bin/env bash
# Isolated user-perspective soak for the settings-page upgrade button.
#
# Runs against the forked copy of the live `web` profile under .tmp/soak-update,
# never the live home: it starts its own dsh instance on its own port, drives the
# real settings page in a real Chromium, clicks the real buttons, and reads the
# installed version back from the profile on disk afterwards.
#
# Usage: ./run_soak.sh <port> <out-prefix>
set -u
here="$(cd "$(dirname "$0")" && pwd)"
port="${1:-18321}"
prefix="${2:-soak}"
export DSH_HOME="$here/dsh-home"
unset DSH_WEB_URL || true

cd "$here" || exit 1
mkdir -p "$here/home" "$here/pnpm-store" "$here/npm-cache"
HOME="$here/home" XDG_DATA_HOME="$here/home/.local/share" \
  npm_config_store_dir="$here/pnpm-store" pnpm_config_store_dir="$here/pnpm-store" \
  npm_config_cache="$here/npm-cache" \
  dsh --profile web --patch "$here/overlay-soak.yml" --no-open --host 127.0.0.1 --port "$port" \
  > "$prefix-boot.log" 2>&1 &
boot_pid=$!

url=""
for _ in $(seq 1 60); do
  url="$(grep -o 'http://127.0.0.1:[0-9]*/?token=[A-Za-z0-9_-]*' "$prefix-boot.log" | head -n1)"
  [ -n "$url" ] && break
  sleep 1
done
if [ -z "$url" ]; then
  echo "BLOCKED: no url in $prefix-boot.log" >&2
  tail -5 "$prefix-boot.log" >&2
  kill "$boot_pid" 2>/dev/null
  exit 1
fi

echo "INSTANCE=$url"
python3 "$here/click_soak.py" "$url" "$prefix" > "$prefix-result.json" 2> "$prefix-click.err"
click_status=$?
echo "CLICK_EXIT=$click_status"
tail -5 "$prefix-click.err" >&2 || true

# Read the outcome out of the profile on disk, not out of the click.
installed="$(node -p "require('$DSH_HOME/profiles/web/node_modules/dsh-grok-workflow/package.json').version" 2>/dev/null)"
spec="$(node -p "JSON.stringify(require('$DSH_HOME/profiles/web/package.json').dependencies['dsh-grok-workflow'])" 2>/dev/null)"
echo "PROFILE_SPEC=$spec"
echo "INSTALLED_VERSION=$installed"
echo "CARD=$(head -c 1200 "$prefix-result.json" 2>/dev/null)"

kill "$boot_pid" 2>/dev/null
wait "$boot_pid" 2>/dev/null
exit "$click_status"