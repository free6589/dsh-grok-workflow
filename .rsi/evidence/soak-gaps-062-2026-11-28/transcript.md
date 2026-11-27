# 转录（逐字命令 + EXIT）

工作目录：`/home/fish/projects_mine/dsh-grok-workflow/.tmp/wt-soak-gaps-062`

## 命令 1 — 确认基线与证据目录现状

逐字命令：

```sh
pwd; git rev-parse HEAD; git branch --show-current; ls -la .rsi/evidence/ 2>&1 | head -n 50; echo "---"; ls .rsi/evidence/soak-gaps-062-2026-11-28/ 2>&1
```

输出要点：

- `pwd` → `/home/fish/projects_mine/dsh-grok-workflow/.tmp/wt-soak-gaps-062`
- `git rev-parse HEAD` → `3f26b7128ffcaecc7063d6f0a59f36c9dc3832c1`
- `git branch --show-current` → `fix/soak-gaps-062`
- 末尾 `ls .rsi/evidence/soak-gaps-062-2026-11-28/` → `No such file or directory`
- EXIT=2（仅末尾 ls 失败，属预期：目录尚不存在，后续由本小工新建）

## 命令 2 — 基线 SHA 二次确认

逐字命令：

```sh
git rev-parse HEAD; echo "EXIT=$?"
```

输出：

```text
3f26b7128ffcaecc7063d6f0a59f36c9dc3832c1
EXIT=0
```

## 命令 3 — 建目录并复核状态

逐字命令：

```sh
mkdir -p .rsi/evidence/soak-gaps-062-2026-11-28 && ls -ld .rsi/evidence/soak-gaps-062-2026-11-28; git branch --show-current; git rev-parse HEAD; git status --short --branch | head -n 20; ls .tmp/ 2>&1 | head -n 20
```

输出要点：

- 目录创建成功
- 分支 `fix/soak-gaps-062`，SHA 同上
- `git status --short --branch` 仅 `## fix/soak-gaps-062`（干净）
- `ls .tmp/` → `No such file or directory`（无 scratch 可清，属预期）

## 命令 4/5 — gitignore 核对

逐字命令：

```sh
git check-ignore -v .tmp 2>&1; echo "EXIT=$?"
git check-ignore -v .rsi/evidence/soak-gaps-062-2026-11-28 2>&1; echo "EXIT=$?"
grep -n "tmp\|rsi" .gitignore 2>&1 | head -n 20; echo "EXIT=$?"
```

输出要点：

- 前两条 EXIT=1（未命中忽略规则的字面语义，详见 README 说明）
- `grep` EXIT=0：`.gitignore` L28 注释 TMPDIR，L29 `.tmp/`
