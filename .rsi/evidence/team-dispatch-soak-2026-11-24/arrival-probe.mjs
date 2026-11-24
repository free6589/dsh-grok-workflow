const [libPath, board] = process.argv.slice(2)
const lib = await import(libPath)
const open = lib.openTaskboard ?? lib.openBoard
const fs = await import('node:fs')
fs.rmSync(board, { recursive: true, force: true })
const order = ['zeta', 'alpha', 'mid']
{
  const tb = await open(board)
  for (const id of order) await tb.create({ id, title: `t ${id}` })
}
const after = await open(board)
const hasArrival = typeof after.arrival === 'function'
const ids = hasArrival ? after.arrival().map((r) => r.id) : (await after.list()).map((r) => r.id)
console.log(JSON.stringify({ api: hasArrival ? 'arrival()' : 'list()', created: order, reopened: ids, arrivalPreserved: JSON.stringify(ids) === JSON.stringify(order) }))
