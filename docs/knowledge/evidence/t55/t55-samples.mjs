const { classifyTriage, triageSignals } = await import('/tmp/t55-clean/lib/triage.js')
const cases = [
  // 短问句（中）
  ['明天要带伞吗', 'fast'],
  ['这个函数的时间复杂度是多少', 'fast'],
  ['vue3 和 react 哪个更适合小项目', 'fast'],
  ['为什么 npm install 会卡住', 'fast'],
  ['node 版本最低要求是几', 'fast'],
  // 短问句（英）
  ['is this repo using esm or cjs', 'fast'],
  ['what does the -u flag do in npm ci', 'fast'],
  ['how long does the build take', 'fast'],
  // 短两步
  ['先跑 lint 再提交', 'team'],
  ['备份一下数据库并通知我', 'team'],
  ['改完配置记得重启服务并回滚说明', 'team'],
  // 序号 / 顿号 / 分号 多步
  ['一、拉取代码 二、跑测试 三、发版', 'team'],
  ['1. 建分支 2. 改代码 3. 提 PR', 'team'],
  ['改配置、重启、验证', 'team'],
  // 带路径/错误码的模糊指向
  ['这个报错 src/triage.ts:120 是什么引起的', 'fast'],
  ['那个配置 packages/dsh/tsconfig.json 里的 target 要不要改', 'fast'],
  // 纯寒暄
  ['早上好呀', 'chat'],
  ['辛苦了', 'chat'],
  // 裸档位词（无 pending）
  ['团队', 'chat'],
  ['quick', 'chat'],
  // 有明显交付物的短句
  ['加一个 --verbose 开关到 CLI', 'fast'],
  ['写一份 README 的安装章节', 'fast'],
]
let bad = 0
const out = []
for (const [text, expected] of cases) {
  const v = classifyTriage({ text, mode: 'triage', ask: true })
  const s = triageSignals(text)
  const ok = v.tier === expected
  if (!ok) bad++
  out.push(`${ok ? 'OK ' : 'BAD'} | ${text.padEnd(42)} exp=${expected.padEnd(4)} got=${v.tier.padEnd(4)} ${v.reason.padEnd(15)} d${s.deliverables} m${s.multiStep?1:0} a${s.action?1:0} q${s.question?1:0} k${s.concrete?1:0} c${s.clauses}${s.vague?' v':''} len${text.length}`)
}
console.log(out.join('\n'))
console.log(`\n误判 ${bad}/${cases.length}`)
// 两条不变量
const q = ['为什么天空是蓝的','3+4 等于几','明天要带伞吗','is it safe to delete node_modules','怎么改端口'].map(t=>[t, classifyTriage({text:t,mode:'triage',ask:true})])
console.log('\n不变量A（短问句绝不用模板 chat）：')
for (const [t,v] of q) console.log(`  ${v.tier==='chat'?'VIOLATED':'ok      '} ${t} → ${v.tier}/${v.reason}`)
const m = ['先备份，然后升级','先建目录再拷文件','一、备份 二、升级','1) 备份 2) 升级','备份；升级；通知我','备份数据库并通知我','先跑 lint 再提交'].map(t=>[t, classifyTriage({text:t,mode:'triage',ask:true})])
console.log('\n不变量B（多步永不吃模板 chat）：')
for (const [t,v] of m) console.log(`  ${v.tier==='chat'?'VIOLATED':'ok      '} ${t} → ${v.tier}/${v.reason}`)
