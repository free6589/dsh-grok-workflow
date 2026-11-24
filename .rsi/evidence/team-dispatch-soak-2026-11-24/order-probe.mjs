// Verification rig (not product code): does the board preserve arrival order across reopen?
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
const ids = (await after.list()).map((r) => r.id)
console.log(JSON.stringify({ lib: libPath.split('/').slice(-4, -1).join('/'), created: order, reopened: ids, arrivalPreserved: JSON.stringify(ids) === JSON.stringify(order) }))
