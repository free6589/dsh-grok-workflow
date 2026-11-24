#!/usr/bin/env bash
# Verification rig (not product code). Installs one build into the forked profile
# as the `dsh-grok-workflow` package, so the profile row resolves to the measured
# artifact (see gen-overlay.mjs for why the row name cannot carry the path).
#   ./install-build.sh <overlay.yml>
# The build path is read from `<overlay>.buildpath`, written by gen-overlay.mjs.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
OVERLAY=$(readlink -f "${1:?usage: install-build.sh <overlay.yml>}")
BUILD_LIB=$(head -n1 "$OVERLAY.buildpath")
BUILD_DIR=$(dirname "$(dirname "$BUILD_LIB")")

PROFILE=${SOAK_PROFILE:-$HERE/dsh-home/profiles/web-soak}
PKG=$PROFILE/node_modules/dsh-grok-workflow

[ -f "$BUILD_LIB" ] || { echo "missing build artifact: $BUILD_LIB" >&2; exit 2; }
[ -d "$PKG" ] || { echo "missing forked package: $PKG" >&2; exit 2; }

rm -rf "$PKG/lib"
cp -a "$BUILD_DIR/lib" "$PKG/lib"
# package.json only carries name/version/main/exports; keep the forked package's
# own node_modules (its @deepseek-ai/dsh-tools link) untouched.
cp -a "$BUILD_DIR/package.json" "$PKG/package.json"

echo "installed: $BUILD_LIB"
echo "  -> $PKG/lib/index.js"
echo "  version: $(node -p "require('$PKG/package.json').version")"
echo "  sha256 : $(sha256sum "$PKG/lib/index.js" | cut -d' ' -f1)"
echo "  source : $(sha256sum "$BUILD_LIB" | cut -d' ' -f1)"
