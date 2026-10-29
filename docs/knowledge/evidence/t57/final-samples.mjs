const { classifyTriage, triageSignals } = await import('/tmp/t57-clean/lib/triage.js')
const Q=[ '明天限行尾号是几','这段正则匹配什么','缓存什么时候失效','为什么连接池会打满','要不要加索引','磁盘还剩多少','这几个环境变量哪个优先',
 'does the retry use exponential backoff','is there a rate limit on this api','how do I rotate the secret','can you check the log for 500s' ]
const M=[ '先跑类型检查，再打包，最后发灰度','备份现有配置并迁移到新目录','一、改 schema 二、补数据 三、验接口','清理日志、重建索引、通知值班','拉分支并回滚上次发布',
 'bump the version then publish the tag','write the changelog and also update the lockfile' ]
const O=[ ['好的','chat'],['把这个改一下','ask'],['这个报错 stacks/worker.ts:88 怎么解','fast'],['team','chat'] ]
const rows=[]
let qf=0, mf=0
for (const t of Q){ const v=classifyTriage({text:t,mode:'triage',ask:true}); const ok=v.tier!=='chat'; if(!ok)qf++; rows.push([t,'≥fast',v.tier,v.reason,ok?'ok':'BAD',triageSignals(t)]) }
for (const t of M){ const v=classifyTriage({text:t,mode:'triage',ask:true}); const ok=v.tier==='team'; if(!ok)mf++; rows.push([t,'team',v.tier,v.reason,ok?'ok':'BAD',triageSignals(t)]) }
for (const [t,e] of O){ const v=classifyTriage({text:t,mode:'triage',ask:true}); rows.push([t,e,v.tier,v.reason,v.tier===e?'ok':'BAD',triageSignals(t)]) }
for (const [t,e,got,reason,ok,s] of rows){
  console.log(`${ok==='ok'?'OK ':'BAD'} | ${t.padEnd(44)} exp=${e.padEnd(5)} got=${got.padEnd(5)} ${reason.padEnd(16)} q${s.question?1:0} m${s.multiStep?1:0} k${s.concrete?1:0} d${s.deliverables} a${s.action?1:0} len${t.length}`)
}
const bad = rows.filter(r=>r[4]==='BAD').length
console.log(`\n问句类 ${Q.length} 条 → 低于快手档: ${qf}   |  多步类 ${M.length} 条 → 非团队档: ${mf}`)
console.log(`整体: ${rows.length} 条，合理 ${rows.length-bad}，不合理 ${bad} → 合理率 ${((rows.length-bad)/rows.length*100).toFixed(1)}%`)
