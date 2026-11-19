#!/usr/bin/env python3
"""Measure the refused prompt at the DSH session level, without printing it.

Reads the operator's own DSH session files for this workspace and reports, per
`/grok` command invocation, how many characters/bytes the argument carried, what
the command settled to, and which of the events a real user message would have
produced are absent. Only counts and event names are printed: the prompt text,
which belongs to the operator, never leaves the session file.

Usage: python3 measure-intake-stall.py [--home ~/.dsh]
"""

import json
import os
import subprocess
import sys

WORKSPACE = '--home-fish-projects_mine-dsh-grok-workflow--'


def session_files(home: str) -> list[str]:
    root = os.path.join(home, 'sessions', WORKSPACE)
    found = []
    for name in sorted(os.listdir(root)):
        path = os.path.join(root, name, 'session.v4.jsonl.zstd')
        if os.path.exists(path):
            found.append(path)
    return found


def read_events(path: str) -> list[dict]:
    raw = subprocess.run(['zstd', '-dc', path], capture_output=True, check=False)
    events = []
    for line in raw.stdout.decode('utf-8', 'replace').splitlines():
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return events


def main() -> int:
    home = os.path.expanduser('~/.dsh')
    if '--home' in sys.argv:
        home = os.path.expanduser(sys.argv[sys.argv.index('--home') + 1])

    rows = []
    for path in session_files(home):
        events = read_events(path)
        kinds = {event.get('type') for event in events}
        for index, event in enumerate(events):
            if event.get('type') != 'command/run':
                continue
            data = event.get('data') or {}
            if data.get('name') != 'grok':
                continue
            args = data.get('args') or ''
            settle = next(
                (later.get('data') or {} for later in events[index + 1:]
                 if later.get('type') == 'command/done'
                 and (later.get('data') or {}).get('commandId') == data.get('commandId')),
                {},
            )
            rows.append({
                'session': os.path.basename(os.path.dirname(path)),
                'seq': event.get('seq'),
                'chars': len(args),
                'bytes': len(args.encode()),
                'settled': settle.get('kind'),
                'settled_text': settle.get('text'),
                'session_has_user_message': 'user/message' in kinds,
            })

    rows.sort(key=lambda row: row['chars'], reverse=True)
    print(f'{len(rows)} /grok invocations found')
    print(f'{"chars":>6} {"bytes":>6} {"settled":>8}  session / seq')
    for row in rows[:10]:
        print(f'{row["chars"]:>6} {row["bytes"]:>6} {str(row["settled"]):>8}  '
              f'{row["session"]} / {row["seq"]}')

    refused = [row for row in rows if row['chars'] > 200]
    print()
    print(f'{len(refused)} invocation(s) carried more than 200 characters')
    for row in refused:
        print(f'  {row["chars"]} chars / {row["bytes"]} bytes -> {row["settled_text"]!r}'
              f' (session has a user/message event: {row["session_has_user_message"]})')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
