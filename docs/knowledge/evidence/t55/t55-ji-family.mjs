const { classifyTriage } = await import('/tmp/t55-clean/lib/triage.js')
for (const t of ['3+4 等于几','三加四等于几','1+1 等于几？','五乘六得几','9 的平方根是几','还有几台机器在线','node 版本最低要求是几','数据库里还剩几条记录']) {
  const v = classifyTriage({ text: t, mode: 'triage', ask: true })
  console.log(`${v.tier.padEnd(5)} ${v.reason.padEnd(15)} ${t}`)
}
