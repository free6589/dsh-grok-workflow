# Issue watcher

`scripts/watch-issues.sh` is an optional repository utility, not part of the
DSH plugin runtime. It polls the open issues and comments of a GitHub
repository every 60 seconds and starts a DSH headless turn when it sees new
activity. It uses the GitHub CLI (`gh`), `jq`, and `flock`; it does not require
a webhook, a public callback URL, or a GitHub token in the repository.

## Behavior

- **First run:** records a baseline of all currently open issues and their
  comment counts. Existing issues do not trigger a wake.
- **Later polls:** emits one event for a new issue, new comments, or a
  title/body update.
- **Self-replies:** comments containing the marker
  `<!-- dsh-issue-watcher:ignore -->` are ignored. The wake prompt tells the
  agent to put this marker in any GitHub reply it posts.
- **No false wake on unchanged polls:** only issue metadata (updated time,
  comment count, last activity) is stored in the durable state.
- **Bounded:** one wake runs at a time; additional prompts are queued. A wake
  is killed after `WATCH_WAKE_TIMEOUT` seconds (default 3600).
- **No credential logging:** the script never prints `DSH_ENV_FILE` or its
  values. Issue/comment text is kept in the private state directory and is
  passed to the wake prompt.

## Run

From the repository root:

```sh
# Baseline / one poll without starting an agent.
WATCH_WAKE_MODE=noop scripts/watch-issues.sh --once

# Poll forever and wake the configured DSH profile.
scripts/watch-issues.sh
```

The default state directory is
`${XDG_STATE_HOME:-$HOME/.local/state}/dsh-grok-workflow/issue-watch`.
It is created with mode `0700`; do not commit it.

## Wake target

By default the watcher runs:

```sh
dsh --profile grok-workflow-dev --json
```

It feeds the event prompt on stdin. If the repository's `.dsh-home` contains
that profile, the script uses it automatically; otherwise set `DSH_HOME` and
`DSH_PROFILE` explicitly.

To resume one existing DSH session instead of creating a new headless session:

```sh
DSH_SESSION_ID=session-... \
DSH_HOME=/path/to/dsh-home \
DSH_PROFILE=<profile> \
scripts/watch-issues.sh
```

The session must already exist. A dedicated issue-triage session is safer than
resuming a live interactive session.

The profile must use the headless app (the default `grok-workflow-dev` profile does). The prompt is supplied on stdin; `headless` is a profile name in DSH, not a subcommand of an arbitrary profile.

```sh
WATCH_WAKE_MODE=command \
WATCH_WAKE_COMMAND='my-notifier --stdin' \
scripts/watch-issues.sh
```

`WATCH_WAKE_MODE=noop` writes each prompt to
`issue-watch/archive/` and starts no process.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `WATCH_REPO` | `free6589/dsh-grok-workflow` | `owner/repo` to poll |
| `WATCH_POLL_SECONDS` | `60` | Poll interval; minimum 1 |
| `WATCH_MAX_ISSUES` | `100` | Open issues fetched per poll |
| `WATCH_STATE_DIR` | XDG state path | State, queue, logs, archived prompts |
| `WATCH_WAKE_MODE` | `dsh` | `dsh`, `command`, or `noop` |
| `WATCH_WAKE_COMMAND` | empty | Command for `command` mode; receives stdin |
| `WATCH_WAKE_TIMEOUT` | `3600` | Seconds before a wake is terminated |
| `DSH_BIN` | `dsh` | DSH executable |
| `DSH_PROFILE` | `grok-workflow-dev` | DSH headless profile to boot |
| `DSH_PATCH` | detected `gw-model.patch.yml` | Optional DSH patch overlay |
| `DSH_SESSION_ID` | empty | Existing DSH session to resume |
| `DSH_ENV_FILE` | `$HOME/.dsh/bifrost.env` | Optional env file for the wake child |

## Persistent user service

On a machine with a working user systemd bus, install a unit like:

```ini
[Unit]
Description=DSH GitHub issue watcher
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/fish/projects_mine/dsh-grok-workflow
Environment=DSH_HOME=/home/fish/projects_mine/dsh-grok-workflow/.dsh-home
Environment=DSH_PROFILE=grok-workflow-dev
Environment=WATCH_STATE_DIR=/home/fish/.local/state/dsh-grok-workflow/issue-watch
Environment=WATCH_POLL_SECONDS=60
EnvironmentFile=-/home/fish/.dsh/bifrost.env
ExecStart=/home/fish/projects_mine/dsh-grok-workflow/scripts/watch-issues.sh
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
```

```sh
systemctl --user daemon-reload
systemctl --user enable --now dsh-issue-watch.service
journalctl --user -u dsh-issue-watch.service -f
```

The current development sandbox has no user systemd bus; use `nohup` or the
service on the real host. The script owns its child wake process and terminates
it on `SIGINT`/`SIGTERM`.

## Verification

```sh
bash -n scripts/watch-issues.sh
npm test -- --run test/issue-watch.spec.ts
```

The regression test uses a fake `gh` executable, baselines one issue, then
replays a new comment and asserts that the generated prompt contains the
comment. It does not call GitHub or a model.
