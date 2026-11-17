#!/usr/bin/env python3
"""Close out one RSI round: bump, changelog, CI, evidence, ledger, commit, tag, push.

The engineering work of a round is done before this runs. Everything here is
mechanical and every recorded number comes from a command this script actually ran
(or from parsing its output), so the ledger cannot claim a result that did not
happen.

Usage: finish-round.py --round 2 --version 0.11.2 --spec /tmp/rsi-round-2.json

Spec fields (JSON, all required unless noted):
  title             short theme, one line
  changelog         markdown body for the new `## [x.y.z]` section (starts with "### ")
  report            markdown body for .rsi/ROUND.md (appended, starts with "## Round N")
  log               {"theme": str, "result": str, "suggestion": str}
  commit_message    full commit message

Exit codes: 0 committed+tagged+pushed, 1 refused (CI red / secret scan / spec bad).
"""

import argparse
import datetime
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / ".rsi" / "evidence"
SECRET_PATTERNS = [
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}"),
    re.compile(r"\bsk-[A-Za-z0-9]{20,}"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"(?i)\b(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*['\"]?[A-Za-z0-9/+_-]{16,}"),
]


def run(cmd: list[str], **kwargs) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=ROOT, text=True, **kwargs)


def fail(message: str) -> int:
    print(f"REFUSED: {message}", file=sys.stderr)
    return 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--round", type=int, required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--spec", required=True)
    parser.add_argument("--resume", action="store_true", help="tree already bumped+changelog'd; redo CI and finish")
    args = parser.parse_args()

    spec = json.loads(pathlib.Path(args.spec).read_text())
    for key in ("title", "changelog", "report", "log", "commit_message"):
        if not spec.get(key):
            return fail(f"spec missing {key}")

    round_dir = EVIDENCE / f"round-{args.round:03d}"
    round_dir.mkdir(parents=True, exist_ok=True)
    tag = f"v{args.version}"

    existing = run(["git", "tag", "-l", tag], capture_output=True).stdout.strip()
    if existing:
        return fail(f"tag {tag} already exists")
    if not (ROOT / "package.json").read_text().count('"version"'):
        return fail("package.json unreadable")

    # 1. Version claims (package.json, package-lock.json, both READMEs, published list).
    if args.resume:
        bumped = subprocess.CompletedProcess([], 0, "resumed: bump and changelog already applied\n", "")
    else:
        bumped = run([sys.executable, ".rsi/tools/bump-version.py", args.version], capture_output=True)
    print(bumped.stdout.strip())
    if bumped.returncode != 0:
        return fail(f"bump-version failed: {bumped.stderr.strip()}")

    # 2. Changelog section, inserted directly above the newest existing section.
    changelog_path = ROOT / "CHANGELOG.md"
    if args.resume:
        print("resumed: changelog section already in place")
    changelog = changelog_path.read_text()
    heading = f"## [{args.version}] - {datetime.date.today().isoformat()}\n\n"
    if not args.resume:
        first_section = re.search(r"^## \[\d+\.\d+\.\d+\]", changelog, re.M)
        if not first_section:
            return fail("no versioned changelog section to insert above")
        body = spec["changelog"].strip("\n") + "\n\n"
        changelog = changelog[: first_section.start()] + heading + body + changelog[first_section.start():]
        changelog_path.write_text(changelog)

    # 3. CI. Red means the round does not ship; the tree stays dirty for the operator.
    ci_log = round_dir / "ci.txt"
    with ci_log.open("w") as handle:
        process = run(["npm", "run", "ci"], stdout=handle, stderr=subprocess.STDOUT)
    ci_text = ci_log.read_text()
    files = re.search(r"Test Files\s+(\d+) passed(?:,\s*(\d+) failed)?", ci_text)
    tests = re.search(r"Tests\s+(\d+) passed(?:,\s*(\d+) failed)?", ci_text)
    if process.returncode != 0:
        return fail(f"npm run ci exited {process.returncode}; see {ci_log}")
    if not files or not tests:
        return fail("could not parse vitest summary out of the CI log")
    ci_summary = (
        f"npm run ci exit 0 · {files.group(1)} test files passed · {tests.group(1)} tests passed"
    )
    print(ci_summary)

    # 4. Written records: ROUND.md, LOG.md, ledger, evidence.
    git_diffstat = run(["git", "diff", "--stat"], capture_output=True).stdout.strip()
    round_md = ROOT / ".rsi" / "ROUND.md"
    round_md.write_text(
        round_md.read_text().rstrip("\n")
        + "\n\n"
        + spec["report"].strip("\n").replace("{{CI}}", ci_summary).replace("{{TAG}}", tag)
        + "\n"
    )

    stamp = datetime.datetime.now().astimezone().strftime("%Y-%m-%dT%H:%M%z")
    log_row = (
        f"| {args.round} | {stamp} | {spec['log']['theme']} | {spec['log']['result']} | "
        f"`.rsi/evidence/round-{args.round:03d}/` | {spec['log']['suggestion']} |\n"
    )
    log_path = ROOT / ".rsi" / "LOG.md"
    text = log_path.read_text()
    if not text.endswith("\n"):
        text += "\n"
    log_path.write_text(text + log_row)

    (round_dir / "git.txt").write_text(
        f"round {args.round} · tag {tag}\n{ci_summary}\n\ndiffstat before commit:\n{git_diffstat}\n"
    )
    ledger_line = {
        "round": args.round,
        "theme": spec["title"],
        "status": "OK",
        "tag": tag,
        "ci": ci_summary,
        "evidence": f".rsi/evidence/round-{args.round:03d}/",
        "at": stamp,
        "commit": f"resolves via `git rev-parse {tag}^{{commit}}`",
    }
    with (ROOT / ".rsi" / "ledger.jsonl").open("a") as handle:
        handle.write(json.dumps(ledger_line, ensure_ascii=False) + "\n")

    # 5. Stage, scan for secrets, commit, tag, push.
    staged = run(
        [
            "git",
            "add",
            "-A",
            "--",
            "src",
            "test",
            "lib",
            "docs",
            ".rsi",
            "README.md",
            "README.zh-CN.md",
            "CHANGELOG.md",
            "package.json",
            "package-lock.json",
        ]
    )
    if staged.returncode != 0:
        return fail(f"git add failed: {staged.stderr.strip()}")
    staged_diff = run(["git", "diff", "--cached"], capture_output=True).stdout
    for pattern in SECRET_PATTERNS:
        hit = pattern.search(staged_diff)
        if hit:
            return fail(f"staged diff looks like it contains a credential: {hit.group(0)[:24]}…")

    commit = run(["git", "commit", "-F", "-"], input=spec["commit_message"], capture_output=True)
    if commit.returncode != 0:
        return fail(f"git commit failed: {commit.stderr.strip() or commit.stdout.strip()}")
    tag_create = run(["git", "tag", "-a", tag, "-m", f"{tag} — {spec['title']}"], capture_output=True)
    if tag_create.returncode != 0:
        return fail(f"git tag failed: {tag_create.stderr.strip()}")
    push_main = run(["git", "push", "origin", "main"], capture_output=True)
    if push_main.returncode != 0:
        return fail(f"git push main failed: {push_main.stderr.strip()}")
    push_tag = run(["git", "push", "origin", tag], capture_output=True)
    if push_tag.returncode != 0:
        return fail(f"git push {tag} failed: {push_tag.stderr.strip()}")

    head = run(["git", "rev-parse", "--short", "HEAD"], capture_output=True).stdout.strip()
    print(json.dumps({"round": args.round, "tag": tag, "commit": head, "ci": ci_summary}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
