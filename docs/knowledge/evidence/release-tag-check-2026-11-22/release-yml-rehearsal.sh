#!/usr/bin/env bash
# Rehearse the release.yml version gate on the *next* release, without touching the repo.
#
# The gate is executed, not re-implemented: this script cuts the `run:` block of the
# `Verify tag, package version, and changelog; prepare release notes` step out of
# .github/workflows/release.yml verbatim, dedents it, and runs it in a scratch directory
# holding a copy of CHANGELOG.md, package.json and package-lock.json. Nothing is tagged,
# pushed or published, and the repo's own files are only read.
#
# Usage: bash release-yml-rehearsal.sh   (exit 0 when both the negative and the positive
#                                        rehearsal behave as designed)

set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../../.." && pwd)"
cd "$root"

work="$(mktemp -d "$root/.release-check-tmp/rehearsal.XXXXXX")"
trap 'rm -rf "$work"' EXIT
step="$work/release-yml-step.sh"

awk '
  /Verify tag, package version, and changelog/ { found = 1 }
  found && /^        run: \|$/ { inrun = 1; next }
  inrun && /^      - name:/ { exit }
  inrun { print }
' .github/workflows/release.yml | sed 's/^          //' > "$step"

echo "--- extracted release.yml gate step ($(wc -l < "$step") lines) ---"
head -3 "$step"
echo "..."

cp CHANGELOG.md package.json package-lock.json "$work/"

bump() {
  node -e '
    const fs = require("node:fs")
    for (const file of ["package.json", "package-lock.json"]) {
      const json = JSON.parse(fs.readFileSync(file, "utf8"))
      json.version = "0.12.20"
      if (json.packages && json.packages[""]) json.packages[""].version = "0.12.20"
      fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n")
    }
  ' || return 1
}
(cd "$work" && bump)
(cd "$work" && sed -i 's/^## \[Unreleased\] \/ 未发布$/## [0.12.20] - 2026-11-22/' CHANGELOG.md)

echo
echo "== negative: version bumped, section still named [Unreleased] =="
neg="$(mktemp -d "$root/.release-check-tmp/rehearsal-neg.XXXXXX")"
cp "$work/package.json" "$work/package-lock.json" "$neg/"
cp CHANGELOG.md "$neg/"
neg_out="$(cd "$neg" && RELEASE_TAG=v0.12.20 bash -euo pipefail "$step" 2>&1)"
neg_status=$?
printf '%s\n' "$neg_out" | grep -E 'is missing|is empty' | head -2
echo "negative exit=$neg_status (design: non-zero)"
rm -rf "$neg"

echo
echo "== positive: version bumped and the [Unreleased] entries renamed to [0.12.20] =="
pos_status=$(cd "$work" && RELEASE_TAG=v0.12.20 bash -euo pipefail "$step" >/dev/null 2>&1; echo $?)
echo "positive exit=$pos_status (design: 0)"
if [ -f "$work/release-notes.md" ]; then
  echo "release-notes.md: $(wc -l < "$work/release-notes.md") lines"
  head -4 "$work/release-notes.md"
else
  echo "release-notes.md: MISSING"
fi

echo
if [ "$neg_status" -ne 0 ] && [ "$pos_status" -eq 0 ]; then
  echo "rehearsal: PASS (gate rejects the unbumped section and accepts the release-prep one)"
  exit 0
fi
echo "rehearsal: FAIL"
exit 1
