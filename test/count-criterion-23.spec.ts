import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * 计数口径钉子 (fix/method-c2-23)：错误数只从权威信号读，不认关键词命中。
 *
 * 背景（方法学 C2）：八轮会话日志里 grep `error` 得 3219 处命中，而工具结果自身
 * `isError: true` 的真错误只有 505 处——多出来的命中来自报错正文、README、CHANGELOG、
 * 巡检脚本自己的输出，以及"计数口径"这条规则本身的引文。关键词命中的是**词**，
 * 不是**错**，这种自指污染让"错误偏多"的结论从方法上就不成立。
 *
 * 本钉子只钉口径的存在与三项权威信号，不改任何巡检逻辑、不动 `src/`：
 * 它断言 `docs/knowledge/TESTING.md` 里写着这条纪律，且点名 `isError`、job 落定、
 * `turn/end` 三个读数口。规则被删或被改成"看关键词"就变红。
 */
const testing = readFileSync(new URL('../docs/knowledge/TESTING.md', import.meta.url), 'utf8')

describe('计数口径：错误数只读权威信号 (c2-23)', () => {
  it('TESTING.md 的规则表里有一条编号的「计数口径」纪律', () => {
    expect(testing).toMatch(/^\d+\. \*\*计数口径/m)
  })

  it('这条纪律点名三项权威信号：isError / job 落定 / turn_end', () => {
    expect(testing, '口径没有点名 `isError`').toContain('isError')
    expect(testing, '口径没有点名 job 落定').toContain('落定')
    expect(testing, '口径没有点名 `turn/end`').toContain('turn/end')
  })

  it('这条纪律明确拒绝把关键词命中当成错误数', () => {
    expect(testing).toContain('关键词命中')
    expect(testing, '口径必须写明关键词数不得写成错误数').toMatch(/不得写成.{0,4}错误/)
  })
})
