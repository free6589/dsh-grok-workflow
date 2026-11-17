#!/usr/bin/env python3
"""Keep the version claims in package.json, package-lock.json and both READMEs in step.

RSI process tooling (not shipped). `test/docs-version.spec.ts` is the contract this
script satisfies; the script exists so a round can bump the release line without
hand-editing five places and getting one of them wrong.

Usage: bump-version.py 0.11.1
"""

import json
import re
import subprocess
import sys

VERSION_RE = re.compile(r"^\d+\.\d+\.\d+$")


def semver_key(tag: str):
    return tuple(int(part) for part in tag.lstrip("v").split("."))


def published_tags() -> list[str]:
    out = subprocess.check_output(["git", "tag", "-l", "v*"], text=True)
    tags = {
        tag
        for tag in out.split()
        if re.fullmatch(r"v\d+\.\d+\.\d+", tag)
    }
    return sorted(tags, key=semver_key)


def main() -> int:
    if len(sys.argv) != 2 or not VERSION_RE.fullmatch(sys.argv[1]):
        print("usage: bump-version.py MAJOR.MINOR.PATCH", file=sys.stderr)
        return 2
    version = sys.argv[1]
    tag = f"v{version}"

    tags = published_tags()
    if tag not in tags:
        tags = sorted(tags + [tag], key=semver_key)

    # package.json + package-lock.json (root version and the root package entry)
    for path in ("package.json", "package-lock.json"):
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)
        data["version"] = version
        if isinstance(data.get("packages"), dict) and "" in data["packages"]:
            data["packages"][""]["version"] = version
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(data, handle, indent=2, ensure_ascii=False)
            handle.write("\n")

    with open("README.md", encoding="utf-8") as handle:
        en = handle.read()
    with open("README.zh-CN.md", encoding="utf-8") as handle:
        zh = handle.read()

    # Declared package version sentence.
    en, en_hits = re.subn(
        r"(The package version in this repository is `)[^`]+(`)",
        rf"\g<1>{version}\g<2>",
        en,
    )
    zh, zh_hits = re.subn(
        r"(本仓库声明的包版本是 `)[^`]+(`)",
        rf"\g<1>{version}\g<2>",
        zh,
    )

    # Install examples pin the current release.
    en, en_pins = re.subn(r"(dsh-grok-workflow#)v\d+\.\d+\.\d+", rf"\g<1>{tag}", en)
    zh, zh_pins = re.subn(r"(dsh-grok-workflow#)v\d+\.\d+\.\d+", rf"\g<1>{tag}", zh)

    # Prose that names the tag directly, e.g. "`#v0.8.0` is the current release".
    en, en_bare = re.subn(r"`#v\d+\.\d+\.\d+`", f"`#{tag}`", en)
    zh, zh_bare = re.subn(r"`#v\d+\.\d+\.\d+`", f"`#{tag}`", zh)

    # Published tag list, regenerated from the real tags in this repository.
    en_list = ", ".join(f"`{item}`" for item in tags[:-1]) + f" and `{tags[-1]}`"
    zh_list = "、".join(f"`{item}`" for item in tags)
    en, en_list_hits = re.subn(
        r"(Published: ).*?(\. The unpinned command)",
        lambda match: f"{match.group(1)}{en_list}{match.group(2)}",
        en,
        count=1,
        flags=re.S,
    )
    zh, zh_list_hits = re.subn(
        r"(已发布：).*?(。未固定版本的命令)",
        lambda match: f"{match.group(1)}{zh_list}{match.group(2)}",
        zh,
        count=1,
        flags=re.S,
    )

    with open("README.md", "w", encoding="utf-8") as handle:
        handle.write(en)
    with open("README.zh-CN.md", "w", encoding="utf-8") as handle:
        handle.write(zh)

    print(
        f"version={version} declared(en={en_hits},zh={zh_hits}) "
        f"pins(en={en_pins},zh={zh_pins}) lists(en={en_list_hits},zh={zh_list_hits}) "
        f"bare(en={en_bare},zh={zh_bare}) published={len(tags)}"
    )
    missing = [name for name, hits in (("declared", en_hits), ("pins", en_pins), ("list", en_list_hits)) if hits == 0]
    if missing:
        print(f"pattern miss: {missing}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
