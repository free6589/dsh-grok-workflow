#!/usr/bin/env node
// Markdown readability gate for the Wave 0 thin design.
//
// The unit of judgement is a BLOCK, not a physical line: Chinese prose is
// hard-wrapped in the source, so a line may legitimately end on "，". What must
// never happen is that a rendered block — a paragraph, a bullet item, a table
// row — ends mid-sentence. That is what "无截断半句" means here.
//
// Checks, each mapped to an acceptance criterion of the Wave 0 task:
//   1. Fences balanced            — a stray fence swallows the rest of the file.
//   2. Table blocks rectangular   — a short row silently loses a column, and each
//                                   row must end with a pipe.
//   3. No block ends mid-sentence — the last line of a paragraph or bullet must not
//                                   end on ，、：； ,;: or an opening bracket, and
//                                   must not end on an ASCII letter/digit.
//   4. Brackets and code spans balanced per block — an odd （ or ` means a cut.
//   5. No placeholder residue     — TODO / TBD / XXX / 待补 / [姓名].
//
// Usage: node check-readability.mjs <file.md>
// Exit 0 clean, 1 findings, 2 usage error.

import { readFileSync } from 'node:fs'

const target = process.argv[2]
if (!target) {
  console.error('usage: node check-readability.mjs <file.md>')
  process.exit(2)
}

const text = readFileSync(target, 'utf8')
const lines = text.split('\n')
const findings = []

// --- 1. code fences -------------------------------------------------------
let inFence = false
let fences = 0
let fenceStart = 0
for (let i = 0; i < lines.length; i += 1) {
  if (/^\s*```/.test(lines[i])) {
    fences += 1
    if (!inFence) fenceStart = i + 1
    inFence = !inFence
  }
}
if (inFence) findings.push(`L${fenceStart}: code fence opened here is never closed`)
if (fences % 2 !== 0) findings.push(`file: ${fences} code fences (odd count)`)

// --- split the non-fence body into blocks --------------------------------
// kinds: heading | table | bullet | paragraph
const blocks = []
inFence = false
let current = null
const close = () => {
  if (!current) return
  // The next physical non-empty line tells a lead-in colon from a cut: a list, a
  // table or a fenced block below it means the colon was doing its job.
  let j = current.n + current.lines.length - 1
  while (j < lines.length && lines[j].trim() === '') j += 1
  current.nextRaw = j < lines.length ? lines[j].trim() : ''
  blocks.push(current)
  current = null
}

for (let i = 0; i < lines.length; i += 1) {
  const n = i + 1
  const raw = lines[i]
  if (/^\s*```/.test(raw)) { inFence = !inFence; close(); continue }
  if (inFence) continue
  const t = raw.trim()
  if (t === '') { close(); continue }
  if (t.startsWith('#')) { close(); blocks.push({ kind: 'heading', n, lines: [raw] }); continue }
  if (t.startsWith('|')) {
    if (current && current.kind === 'table') current.lines.push(raw)
    else { close(); current = { kind: 'table', n, lines: [raw] } }
    continue
  }
  if (/^([-*+]|\d+\.)\s+/.test(t)) {
    close()
    current = { kind: 'bullet', n, lines: [raw] }
    continue
  }
  if (current && (current.kind === 'paragraph' || current.kind === 'bullet')) current.lines.push(raw)
  else { close(); current = { kind: 'paragraph', n, lines: [raw] } }
}
close()

// --- 2. table blocks ------------------------------------------------------
for (const block of blocks) {
  if (block.kind !== 'table') continue
  const widths = new Set(block.lines.map(raw => (raw.match(/\|/g) ?? []).length))
  const last = block.n + block.lines.length - 1
  if (widths.size > 1) {
    findings.push(`L${block.n}-L${last}: table rows have ${[...widths].join('/')} pipes`)
  }
  block.lines.forEach((raw, index) => {
    if (!raw.trimEnd().endsWith('|')) findings.push(`L${block.n + index}: table row does not end with a pipe`)
  })
}

// --- 3/4/5. block-level prose checks ------------------------------------
const HALF_SENTENCE = /[，、：；,;:（「『“‘(]$/
const ASCII_TAIL = /[A-Za-z0-9]$/
const PLACEHOLDERS = /\b(TODO|TBD|FIXME|XXX)\b|待补|待填|\[姓名\]/

for (let index = 0; index < blocks.length; index += 1) {
  const block = blocks[index]
  if (block.kind === 'heading' || block.kind === 'table') continue
  const joined = block.lines.join('\n')
  const lastLine = block.lines[block.lines.length - 1]
  const tail = lastLine.trim()
  const endLine = block.n + block.lines.length - 1
  // A colon is a legitimate lead-in when a list or table follows immediately;
  // the same colon followed by more prose is a cut mid-sentence.
  const nextKind = blocks[index + 1]?.kind
  const nextIsFence = /^```/.test(block.nextRaw ?? '')
  const leadIn = tail.endsWith('：') && (nextKind === 'bullet' || nextKind === 'table' || nextIsFence)
  // A single-line metadata bullet (`- 键：值`) is a field, not a sentence: a date or
  // a token may legitimately end it without punctuation.
  // ...and only when the value itself looks like a field (a date, a path, a token
  // in backticks, a closing bracket), never when it ends on a bare Chinese
  // character — that is the shape of a cut, not a field.
  const metadataRow = block.kind === 'bullet'
    && block.lines.length === 1
    && /^[-*+]\s+[^，。；、：]{1,20}：\S/.test(tail)
    && /[0-9A-Za-z`）)】]$/.test(tail)

  if (leadIn || metadataRow) {
    // nothing to report: the block hands off to the list below it
  } else if (HALF_SENTENCE.test(tail)) {
    findings.push(`L${endLine}: block ends mid-sentence (${JSON.stringify(tail.slice(-1))})`)
  } else if (ASCII_TAIL.test(tail)) {
    findings.push(`L${endLine}: block ends on an ASCII letter/digit (possible cut): ${tail.slice(-30)}`)
  }

  for (const [open, charClose] of [['（', '）'], ['【', '】'], ['「', '」'], ['『', '』']]) {
    const o = (joined.match(new RegExp(open, 'g')) ?? []).length
    const c = (joined.match(new RegExp(charClose, 'g')) ?? []).length
    if (o !== c) findings.push(`L${block.n}-L${endLine}: unbalanced ${open}${charClose} (${o} open, ${c} close)`)
  }
  const ticks = (joined.match(/`/g) ?? []).length
  if (ticks % 2 !== 0) findings.push(`L${block.n}-L${endLine}: odd number of backticks (${ticks})`)

  const ph = joined.match(PLACEHOLDERS)
  if (ph) findings.push(`L${block.n}: placeholder residue ${JSON.stringify(ph[0])}`)
}

// --- advisory: blocks that end without sentence-final punctuation ---------
// This is a REPORT, not a pass/fail gate. A block ending on an ordinary Chinese
// character cannot be judged mechanically: hard-wrapped continuation lines look
// exactly like a cut. So every such end is listed for a human to eyeball, and the
// list is expected to contain only metadata rows (dates, paths, tokens).
const ADVISORY = []
for (const block of blocks) {
  if (block.kind === 'heading' || block.kind === 'table') continue
  // Trailing emphasis markers wrap the punctuation they follow (`…标准：**`), so they
  // must be stripped before asking what the sentence actually ended on.
  const tail = block.lines[block.lines.length - 1].trim().replace(/[*_]+$/, '')
  if (/[。！？：」』）】”]$/.test(tail)) continue
  ADVISORY.push({ line: block.n + block.lines.length - 1, tail: tail.slice(-36) })
}

// --- report --------------------------------------------------------------
const count = kind => blocks.filter(b => b.kind === kind).length
console.log(JSON.stringify({
  file: target,
  lines: lines.length,
  blocks: blocks.length,
  headings: count('heading'),
  bullets: count('bullet'),
  paragraphs: count('paragraph'),
  tableBlocks: count('table'),
  tableRows: blocks.filter(b => b.kind === 'table').reduce((sum, b) => sum + b.lines.length, 0),
  fences,
  findings: findings.length,
  advisoryEnds: ADVISORY.length,
}, null, 2))
if (ADVISORY.length > 0) {
  console.log('ADVISORY (block ends lacking sentence-final punctuation — confirm each is metadata):')
  for (const a of ADVISORY) console.log(`  - L${a.line}: ...${a.tail}`)
}
if (findings.length > 0) {
  console.log('FINDINGS:')
  for (const f of findings) console.log('  - ' + f)
  process.exit(1)
}
console.log('OK: no readability findings')
