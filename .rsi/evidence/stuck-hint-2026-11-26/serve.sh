#!/bin/bash
# Boot the isolated instance. Keys come from the live env file into THIS process only.
set -a
. "$HOME/.dsh/bifrost.env"
set +a
cd "$(dirname "$0")/../.."
exec env -u DSH_PROFILE -u DSH_PROFILE_DIR \
  DSH_HOME="$PWD/.tmp/stuck-hint/dsh-home" \
  dsh --profile web-clone --no-open --port "${PORT:-3421}"
