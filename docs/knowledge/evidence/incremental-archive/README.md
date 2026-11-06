# Incremental memory archive — captured evidence (Round 22)

Raw captures from the real-machine run that backs `VALIDATION.md` Round 22. Nothing here is
hand-written prose about what the code should do: every file is the byte-for-byte output of a
command that was executed on this machine on 2026-11-06.

| File | What it is | How it was produced |
|---|---|---|
| `archive-run-77babf9f.jsonl` | the 4 archive entries the round produced (`agent:1/2/3` + `round`) | extract of `$DSH_HOME/memory/grok-workflow/archive.jsonl` for `runId=77babf9f-2b5a-467b-9caa-cab8c5801664` |
| `run-round-events.jsonl` | the `--json` event stream of that round | `dsh --profile incr --patch model.patch.yml --patch plugin.patch.yml --json "<two-step task>"` |
| `fresh-session-quotes-archive.jsonl` | a **new** session quoting the earlier round's entries | `dsh … --json "请在本机原样执行… node lib/memory/cli.js recent --limit 4"` |
| `cli-recent.txt` | the shipped reader's own output | `node lib/memory/cli.js recent --limit 5` with `DSH_HOME` pointed at the scratch home |

Environment for all of the above: `DSH_HOME=.workflow-artifacts/incr-archive-e2e/home` (a profile
built with `dsh --profile incr --from-default-profile headless`, so the live `:3090` profile was
never touched), model `wb/cn:deepseek-v4.1-flash`, plugin row
`file:///home/fish/projects_mine/dsh-grok-workflow/lib/index.js` with
`{answerStrategy: in-turn, showProgress: true, grokDefault: "on"}`.

Reproduce the reader side without any model at all:

```bash
DSH_HOME=<the home that ran the round> node <repo>/lib/memory/cli.js recent --limit 5
```

Expected: a `memory archive: N entries from …` header, then newest-first entries (`round`/`agent`),
each with the objective, the status, the verified criteria and their evidence. `--json` gives the
same entries as JSON. No entries prints `no entries` and exits 0.

The scratch home/profile/work dirs are deliberately **not** committed: they contain a real
transcript of a real run. The extracts above are the durable evidence.
