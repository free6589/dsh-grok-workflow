#!/usr/bin/env bash
# Put the built plugin of this worktree into the forked profile, as a real installed
# copy (a packed tarball, not a link: a link would let the install overwrite the tree
# under test). Then pin the installed copy's manifest version one release behind the
# newest published tag, because the card can only show its install button when the
# profile really is older than the newest release — with an identical version it would
# correctly say "已最新" and there would be nothing to click.
#
# Everything this touches lives under .tmp/soak-update/dsh-home.
set -eu
here="$(cd "$(dirname "$0")" && pwd)"
worktree="$(cd "$here/../.." && pwd)"
home="$here/dsh-home"

tgz="$(cd "$worktree" && npm_config_cache="$here/npm-cache" npm pack --pack-destination "$here" 2>&1 | tail -n1)"
echo "TGZ=$tgz"

DSH_HOME="$home" dsh plugin --profile web add "file:$here/$tgz" > "$here/prepare-install.log" 2>&1
echo "PNPM_EXIT=$?"

installed="$home/profiles/web/node_modules/dsh-grok-workflow/package.json"
node -e "
const fs = require('node:fs');
const p = JSON.parse(fs.readFileSync('$installed', 'utf8'));
p.version = '0.13.30';
fs.writeFileSync('$installed', JSON.stringify(p, null, 2) + '\n');
"
echo "PINNED=$(node -p "require('$installed').version")"
echo "SPEC=$(node -p "JSON.stringify(require('$home/profiles/web/package.json').dependencies['dsh-grok-workflow'])")"
sha256sum "$home/profiles/web/node_modules/dsh-grok-workflow/lib/index.js" \
  "$home/profiles/web/node_modules/dsh-grok-workflow/lib/client.js" \
  "$worktree/lib/index.js" "$worktree/lib/client.js"