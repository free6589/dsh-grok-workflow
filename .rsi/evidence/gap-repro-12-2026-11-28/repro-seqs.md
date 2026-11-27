# 复现：run 686af548 seq30 failed 之后 20 行内无补派

- 工作目录：`/home/fish/projects_mine/dsh-grok-workflow/.tmp/wt-gap-12`（分支 `fix/gap-repro-12`，基线 `9977211`）
- 源档（只读，未改）：`/home/fish/projects_mine/dsh-grok-workflow/.rsi/evidence/compact-repair-20261120/session-3a683cb6-before.jsonl.zstd`
- 本地副本：本目录 `session-3a683cb6-before.jsonl.zstd`（sha256 与源档一致：`9e82a087ead5c882f077d2d28cfabaf52f612b54eef652ce4be29c8bb5fe1064`）
- 解压产物：本目录 `session-3a683cb6-before.jsonl`，7478 行，sha256 `21bde5f94836e91fad0012bb0af5f3f388cdf29940deb50d32c83eba78e41ca5`
- 行号约定：解压后 jsonl 行号；`line = seq + 2`（第 1 行是 `session` 头，seq 从 0 起）。
- 附加产物：`window-lines-3045-3072.txt`（窗口逐行）、`run-686af548-all-events.txt`（该 run 全部 62 条事件）、`retry-vs-failure.txt`（重派标签对照）

## 结论（一句话）

**复现成功**：run `686af548-aebb-4767-a855-b0bf8e45381a` 的 task 30（`汇总助手`）在 line 3046 / seq 3044 记 `outcome=failed` 后，紧随的 20 行内没有任何 `agent-start`／重派动作，run 在 2 行之后就 `run-end stopReason=error` 收尾，交付记为 `partial`。

---

## 1. 复制源档并解压（逐字命令 + 结果）

```bash
EV=.rsi/evidence/gap-repro-12-2026-11-28
mkdir -p "$EV"
cp -p /home/fish/projects_mine/dsh-grok-workflow/.rsi/evidence/compact-repair-20261120/session-3a683cb6-before.jsonl.zstd "$EV/session-3a683cb6-before.jsonl.zstd"
sha256sum /home/fish/projects_mine/dsh-grok-workflow/.rsi/evidence/compact-repair-20261120/session-3a683cb6-before.jsonl.zstd "$EV/session-3a683cb6-before.jsonl.zstd"
```
```
9e82a087ead5c882f077d2d28cfabaf52f612b54eef652ce4be29c8bb5fe1064  /home/fish/projects_mine/dsh-grok-workflow/.rsi/evidence/compact-repair-20261120/session-3a683cb6-before.jsonl.zstd
9e82a087ead5c882f077d2d28cfabaf52f612b54eef652ce4be29c8bb5fe1064  .rsi/evidence/gap-repro-12-2026-11-28/session-3a683cb6-before.jsonl.zstd
```

```bash
zstd -d -f session-3a683cb6-before.jsonl.zstd -o session-3a683cb6-before.jsonl
wc -l session-3a683cb6-before.jsonl
```
```
session-3a683cb6-before.jsonl.zstd: 15821237 bytes
7478 session-3a683cb6-before.jsonl
```

---

## 2. seq 3043 / 3044 关键字段摘录

命令：

```bash
grep -n -m3 '"seq":3043' session-3a683cb6-before.jsonl | cut -c1-400
grep -n -m3 '"seq":3044' session-3a683cb6-before.jsonl | cut -c1-400
```

结果（原文，未裁剪字段）：

| 行号 | 事件 | seq | 关键字段 |
|---|---|---|---|
| 3045 | `tool-workflow/agent-start` | 3043 | `runId=686af548-aebb-4767-a855-b0bf8e45381a`, `seq=30`（任务序号）, `label=汇总助手`, `phase=汇总`, `childId=b156a65e-46b2-4906-b617-9a7f782fcd70`, `time=1795111931203` |
| 3046 | `tool-workflow/agent-end` | 3044 | `runId=686af548-aebb-4767-a855-b0bf8e45381a`, `seq=30`, **`outcome=failed`**, `time=1795112099181` |

原文：

```json
{"type":"tool-workflow/agent-start","seq":3043,"time":1795111931203,"data":{"runId":"686af548-aebb-4767-a855-b0bf8e45381a","seq":30,"label":"汇总助手","phase":"汇总","childId":"b156a65e-46b2-4906-b617-9a7f782fcd70"}}
{"type":"tool-workflow/agent-end","seq":3044,"time":1795112099181,"data":{"runId":"686af548-aebb-4767-a855-b0bf8e45381a","seq":30,"outcome":"failed"}}
```

说明：`agent-end` 只有 `outcome`，无 `error`／`status`／`retry` 字段；失败原因不在该条，而在紧随的 routing 记录（见第 3 节 line 3047）。

## 2b. seq 2997 / 3002（同一 run 的对照记录）

命令与结果：

```bash
python3 - <<'PY'
import json
lines=open('session-3a683cb6-before.jsonl',encoding='utf-8').read().splitlines()
for i,l in enumerate(lines,1):
    r=json.loads(l)
    if r.get('seq') in (2997,3002):
        print(f"line {i} type={r.get('type')} seq={r.get('seq')}")
        print(json.dumps(r,ensure_ascii=False)[:900]); print()
for ln in range(2999,3007):   # 邻近上下文
    r=json.loads(lines[ln-1]); d=r.get('data') or {}
    print(ln, r.get('type'), r.get('seq'), json.dumps({k:d[k] for k in ('runId','seq','outcome','label','phase','childId') if k in d},ensure_ascii=False)[:200])
PY
```
```
line 2999 type=tool-workflow/agent-start seq=2997
{"runId":"686af548-aebb-4767-a855-b0bf8e45381a","seq":16,"label":"监督","phase":"任务 2 · Audit two-heartbeat iden…","childId":"5e145de0-1d47-47f3-a6c7-fd0c63008939"}
line 3004 type=tool-workflow/agent-end   seq=3002
{"runId":"686af548-aebb-4767-a855-b0bf8e45381a","seq":16,"outcome":"completed"}
```
同一窗口内还有 line 3002 / seq 3000：`label=执行（尝试 2）`，`phase=任务 1 · Fix /grok on message blo…`，说明**同一 run 内 task 级重派确实会发生**，且它的形态是"新的 agent-start + 标签带（尝试 2）"。这一点是判定 task 30 无补派的关键对照。

---

## 3. failed 之后 20 行清单（证明无补派）

命令：

```bash
python3 - <<'PY'
import json
lines=open('session-3a683cb6-before.jsonl',encoding='utf-8').read().splitlines()
out=[]
for ln in range(3045,3073):
    r=json.loads(lines[ln-1]); d=r.get('data') or {}
    keep={k:d[k] for k in ('runId','seq','outcome','label','phase','childId','stopReason') if k in d}
    if isinstance(keep.get('runId'),str) and len(keep['runId'])>8: keep['runId']=keep['runId'][:8]
    if isinstance(keep.get('childId'),str): keep['childId']=keep['childId'][:8]
    out.append(f"{ln:5d} seq={r.get('seq'):<5} {r.get('type'):<32} {json.dumps(keep,ensure_ascii=False)}")
open('window-lines-3045-3072.txt','w',encoding='utf-8').write("\n".join(out)+"\n")
print("\n".join(out))
PY
```

结果（failed 之后 20 行 = line 3047..3066）：

```
 3045 seq=3043  tool-workflow/agent-start        {"runId": "686af548", "seq": 30, "label": "汇总助手", "phase": "汇总", "childId": "b156a65e"}
 3046 seq=3044  tool-workflow/agent-end          {"runId": "686af548", "seq": 30, "outcome": "failed"}      <-- 失败点
 3047 seq=3045  plugin:grok-workflow/routing     {}                                                       <-- 1  routing（事后记录，非派发）
 3048 seq=3046  tool-workflow/run-end            {"runId": "686af548", "stopReason": "error"}             <-- 2  run 直接结束
 3049 seq=3047  plugin:grok-workflow/delivery    {"outcome": "partial", "phase": "delivered"}             <-- 3  交付 partial
 3050 seq=3048  step/start                       {}                                                       <-- 4
 3051 seq=3049  user/message                     {}                                                       <-- 5
 3052 seq=3050  user/message                     {}                                                       <-- 6
 3053 seq=3051  request/header                  {}                                                       <-- 7
 3054 seq=3052  assistant/message               {}                                                       <-- 8
 3055 seq=3053  tool/call                       {}                                                       <-- 9
 3056 seq=3054  job/registered                  {"label": "git status --short --branch; ..."}            <-- 10
 3057 seq=3055  job/settled                     {"status": "completed"}                                  <-- 11
 3058 seq=3056  tool/result                     {}                                                       <-- 12
 3059 seq=3057  step/end                        {}                                                       <-- 13
 3060 seq=3058  agent/inbox/spliced             {}                                                       <-- 14
 3061 seq=3059  step/start                      {}                                                       <-- 15
 3062 seq=3060  user/message                    {}                                                       <-- 16
 3063 seq=3061  assistant/message               {}                                                       <-- 17
 3064 seq=3062  tool/call                       {}                                                       <-- 18
 3065 seq=3063  tool/result                     {}                                                       <-- 19
 3066 seq=3064  step/end                        {}                                                       <-- 20
```

第 21 行起（3067..3072）仍是主会话普通事件：`step/start`、`assistant/message`、`tool/call`、`todo/write`、`tool/result`、`step/end`。

（注：line 3056/3057 的 `label` 值较长，此处按"保留关键行"裁剪为 `...`；未裁剪全文见本目录 `window-lines-3045-3072.txt`。）

**判定依据（三条互相独立）：**

1. **窗口内 0 个 `tool-workflow/agent-start`**，也 0 个 `subagent/*` 派发事件；20 行里只有 1 条 routing 记录 + 1 条 run-end + 1 条 delivery + 17 条主会话事件。
2. **run 已结束**：line 3048 `tool-workflow/run-end`，`stopReason=error` —— 失败后 2 行就收尾，没有留给补派的位置。
3. **全档该 runId 最后一次出现就是 run-end**：

```bash
grep -n -o '686af548-aebb-4767-a855-b0bf8e45381a' session-3a683cb6-before.jsonl | cut -d: -f1 | tr '\n' ' '
```
```
2948 2950 2951 ... 3039 3041 3042 3043 3045 3046 3048
```
（首现 line 2948 `run-start`，末现 line 3048 `run-end`；之后全档再无该 runId —— 不存在延后补派或 resume。）

**任务级重派统计**（`retry-vs-failure.txt`）：run `686af548` 共 30 个 task，每个 task 的 `agent-start` 计数全为 1；其中 task 17/19/21/22/24/26 的标签本身就叫 `执行（尝试 2）`／`检查（尝试 2）`（说明重派机制在该 run 内处于工作状态），而 **task 30 `汇总助手` 只有一次 start，全档不存在 `汇总（尝试 2）` 或任何 `seq=30` 的第二次 start**。

```
task 24  starts=1 label=检查（尝试 2）
task 26  starts=1 label=检查（尝试 2）
task 29  starts=1 label=监督
task 30  starts=1 label=汇总助手      <-- 失败任务，无（尝试 2）
```

**失败归类**（line 3047 routing 记录的 `switches`，共 9 条，全部 `attempt=1`）：

```
by (role,attempt,outcome): {('worker',1,'failed'):4, ('worker',1,'ok'):2, ('verifier',1,'failed'):1, ('supervisor',1,'failed'):1, ('synthesizer',1,'failed'):1}
failureClass: format-error ×7
reasons: "child returned no valid structured result" ×7
any attempt>1: False
```
即 `synthesizer`（对应 task 30 汇总）失败分类是 `format-error`（子代理没返回合法结构化结果），而 routing 记录里没有任何 `attempt>1` 的切换/重试条目。

---

## 4. 复现判定

**复现成功。** 归档证据与"run 686af548 seq30 failed 后 20 行无补派"的描述完全一致：失败 event（`agent-end seq=30 outcome=failed`）之后，紧随的 3 行是 routing 记录、`run-end stopReason=error`、`delivery outcome=partial`，20 行内无任何补派动作，也无延后补派；同一 run 其他任务（17/19/21/22/24/26）都出现过 `（尝试 2）` 形式的 task 级重派，唯独最后的汇总任务没有，说明缺失在汇总阶段的补派路径，而不是重派机制整体失效。
