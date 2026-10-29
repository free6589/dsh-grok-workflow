const { classifyTriage, triageSignals } = await import('/tmp/t57-clean/lib/triage.js')
const cases = [
  ['端口 8080 被谁占了', '问句(谁)'],
  ['logs 里 500 多不多', '问句(多不多)'],
  ['这玩意儿能不能跑起来', '问句+指向'],
  ['几十个任务在排队吗', '几十 不该被当问句?'],
  ['读、写这两个操作有区别吗', '两项顿号不该当多步'],
  ['改配置、重启', '两项顿号（设计上不算多步）'],
  ['先看看日志', '只有“先”没有“然后”'],
  ['的 and also the', '干扰串'],
  ['deploy 到 staging 还是 prod 好', '二选一问句'],
  ['我该用 yarn 还是 pnpm', '二选一问句'],
]
for (const [t,note] of cases) {
  const v = classifyTriage({ text: t, mode: 'triage', ask: true })
  const s = triageSignals(t)
  console.log(`${v.tier.padEnd(5)} ${v.reason.padEnd(15)} q${s.question?1:0} m${s.multiStep?1:0} v${s.vague?1:0} | ${t}   ← ${note}`)
}
