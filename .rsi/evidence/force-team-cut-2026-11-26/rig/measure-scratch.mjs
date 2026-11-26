// Soak scratch (not product code): measure the injected block in the request bodies the
// capture proxy recorded.
//
//   node measure.mjs <capture-dir> <installed lib/force-team.js>
//
// For each prompt of this run it finds the first recorded body that carries that prompt
// as model-facing user text, then reports, in bytes:
//   - the whole text the model reads for that message,
//   - the user's own words,
//   - the remainder,
// and checks the remainder against the installed build's TEAM_INSTRUCTION_ZH
// (imported from the plugin that was installed, not hand-copied from this script).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const captureDir = process.argv[2]
const installedLib = process.argv[3]
const { TEAM_INSTRUCTION_ZH, TEAM_INSTRUCTION_EN } = await import(pathToFileURL(installedLib).href)

const prompts = [
  ['A-obey', '开团：统计 README.md 有多少行、CHANGELOG.md 有多少行，两个都要数。'],
  ['B-ignore', '开团：1+1 等于几？'],
  ['C-olddeath', '开团：先读一下 README.md 的第一行，再读一下 CHANGELOG.md 的最后一行，然后直接告诉我这两行分别是什么。'],
  ['D-control', '先读一下 README.md 的第一行，再读一下 CHANGELOG.md 的最后一行，然后直接告诉我这两行分别是什么。'],
  ['E-extra', '开团：直接用 grok_workflow 工具跑这个活——objective 是统计 README.md 有多少行、CHANGELOG.md 有多少行，最后把两个数字都告诉我。'],
]

const files = readdirSync(captureDir).filter((f) => /^req-\d+\.json$/.test(f)).sort()
const bodies = files.map((f) => ({ file: f, raw: readFileSync(join(captureDir, f), 'utf8') }))

/** Every text a request hands to the model as a user message. */
const userTexts = (raw) => {
  let parsed
  try { parsed = JSON.parse(raw) } catch { return [] }
  const input = Array.isArray(parsed.input) ? parsed.input : []
  const out = []
  for (const item of input) {
    if (item?.role !== 'user') continue
    const blocks = Array.isArray(item.content) ? item.content : []
    for (const block of blocks) if (typeof block?.text === 'string') out.push({ kind: block.type, text: block.text })
  }
  return out
}

const report = []
for (const [tag, prompt] of prompts) {
  const hits = []
  for (const body of bodies) {
    const texts = userTexts(body.raw)
    for (const { kind, text } of texts) {
      if (!text.startsWith(prompt)) continue
      const prefixBytes = Buffer.byteLength(prompt, 'utf8')
      const whole = Buffer.from(text, 'utf8')
      const rest = whole.subarray(prefixBytes).toString('utf8')
      hits.push({
        file: body.file,
        blockKind: kind,
        contentBlocks: texts.length,
        requestBytes: Buffer.byteLength(body.raw, 'utf8'),
        modelTextBytes: whole.length,
        userWordsBytes: prefixBytes,
        remainderBytes: Buffer.byteLength(rest, 'utf8'),
        remainderEqualsZh: rest === TEAM_INSTRUCTION_ZH || rest === `\n${TEAM_INSTRUCTION_ZH}`,
        remainderEqualsEn: rest === TEAM_INSTRUCTION_EN || rest === `\n${TEAM_INSTRUCTION_EN}`,
        remainderHead: rest.slice(0, 40),
        zhBlockBytes: Buffer.byteLength(TEAM_INSTRUCTION_ZH, 'utf8'),
        carriesBlock: rest.includes('【强制：这一轮走团队模式】'),
      })
    }
  }
  const row = { tag, promptBytes: Buffer.byteLength(prompt, 'utf8'), hits: hits.length, first: hits[0] ?? null }
  report.push(row)
}

// How many recorded request bodies carry the block at all, and which.
const carry = bodies.filter((b) => b.raw.includes('【强制：这一轮走团队模式】')).map((b) => b.file)
const clean = bodies.filter((b) => !b.raw.includes('【强制：这一轮走团队模式】')).map((b) => b.file)
const out = { zhBlockBytes: Buffer.byteLength(TEAM_INSTRUCTION_ZH, 'utf8'), perPrompt: report, bodiesCarryingBlock: carry, bodiesWithoutBlock: clean }
console.log(JSON.stringify(out, null, 1))
writeFileSync(join(captureDir, 'injection-measurements.json'), JSON.stringify(out, null, 2))