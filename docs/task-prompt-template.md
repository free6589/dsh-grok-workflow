# Task prompt template — what a pasted team task must look like

Status: **since `[Unreleased]`**. Measured on DSH `0.2.1-rc.2` (the installed
runtime this repository is developed against).

This is the default template for a task a reader pastes into a session that runs
`dsh-grok-workflow`. It is the intake contract: the prompt assembly path in
`src/intake.ts` is the code that enforces the rules below, and
`test/intake.spec.ts` assembles this template and checks it against those rules.

## Why this file exists

A stored team task prompt was pasted into a fresh session and the session did
nothing. The prompt was **not** too long: it was 2 041 characters (3 697 bytes)
in one session and 2 032 characters (3 688 bytes) in another, against a
**32000**-character objective budget. Nothing was truncated and nothing was
cut.

The prompt's first line began with `/grok`:

```text
/grok 团队任务：实现「自我迭代」功能（…）
```

The host parses the first line of a message as a slash command and hands
everything after the command name to the handler as its argument
(`@deepseek-ai/dsh-commands` `parseCommand`, regex
`/^\/([a-z][a-z0-9_-]*)(?=$|[\t\n\r ])/u`). `/grok` accepts only `on`, `off` and
the empty argument, so a whole prompt that follows it settles as a one-line
usage error and is never sent as a message: the transcript records
`command/done` with `kind: "error"` and no `user/message`, no `agent/pre-step`
and no workflow run. That is the stall.

Two consequences, both enforced in code now:

- a non-toggle argument is refused **explicitly** — the argument that is a
  prompt gets the measured, bilingual refusal from `src/intake.ts`, naming the
  characters that were discarded (`src/command.ts`);
- the gate's own oversize refusal is bilingual and states the received count
  and the number of parts it would take to send the prompt through
  (`src/gate.ts`, `src/intake.ts`).

## Template

Use exactly this shape. Start with the task line, never with a slash command.

```task-prompt
# 团队任务：<一句话写清要做什么>

【背景】
仓库 <path>，分支 <branch>，当前 <version>。
<为什么做这件事，一两句，够派工即可。>

【要求】
1. <可验收的交付物一>
2. <可验收的交付物二>
3. 每处改动有改前失败、改后通过的测试；npm run ci 通过。

【边界】
<不许动的路径、不许改的开关、必须保留的行为。>

【收工】
工作树干净，CHANGELOG 记下改动，下一轮接手者能从证据接着干。
```

The headings `【…】` are the assembly sections: `assembleTaskPrompt` renders one
prompt from `heading` + `body` pairs and measures it against the budget, so the
test can prove the template itself fits.

## Rules the code enforces

1. **No leading slash command.** If the session needs the workflow switched on,
   send `/grok on` as its own message, wait for the toggle to settle, and send
   the task prompt as the next message. Never put the two in one line: the
   whole line is parsed as a command and the prompt is discarded.
2. **Budget: 32000 characters.** `TASK_LIMITS.objectiveChars`
   (`src/input.ts`) is the largest objective the workflow can be handed, and the
   intake limit is that same number — one limit, one meaning. A message over it
   is refused before any run, in both languages, with the received count and the
   number of parts it would take to send it through.
3. **Nothing is silently shortened.** Oversize and malformed prompts are
   refused, never truncated into a run; a refusal keeps the message routable so
   the corrected message can still be sent.
4. **Malformed prompts** — a prompt the commands layer swallowed (this file's
   stall), an empty message, or an oversize one — all answer with an explicit
   refusal text. Silence is treated as a defect: an empty turn is what made the
   original report impossible to diagnose.

## Evidence

- Session `session-042dfe19`: `command/run` name `grok`, `args` 2 041
  characters (3 697 bytes), followed by `command/done` `kind: "error"`, text
  `Usage: /grok [on|off]`; no `user/message`, no `agent/pre-step`, no run.
- Session `session-b7be2bd2`: the same shape twice (2 032 characters, 3 688
  bytes) at `command/done` seq 2945 and 2954, each after a `command/run` whose
  argument is the whole prompt.
- Limits cited: `src/input.ts` (`TASK_LIMITS.objectiveChars: 32_000`),
  `src/index.ts` (the tool description states 32000), `src/gate.ts`
  (`refusalOf`), `src/intake.ts` (`INTAKE_LIMITS.promptChars`).
