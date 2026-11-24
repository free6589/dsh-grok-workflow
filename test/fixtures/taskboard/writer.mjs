/**
 * Taskboard crash worker: a real OS process that mutates a real board until it
 * is killed, so the recovery test is not a simulation of a crash.
 *
 * It imports the **built** module (`lib/taskboard/`), not `src/`: this process
 * has no Vitest transform, and the store format it writes is the format the
 * committed artifact ships. `npm test` / `npm run ci` build before running, so
 * the artifact always matches the source under test.
 *
 * Environment:
 *   TASKBOARD_DIR       board directory (required)
 *   TASKBOARD_MODE       `loop` (default) or `hold-lock`
 *   TASKBOARD_PROGRESS  file that receives one line per persisted mutation
 *   TASKBOARD_PREFIX    task id prefix (default `crash`)
 *
 * `loop` creates → claims → completes rows forever; `hold-lock` takes the
 * board's claim-lock file and then blocks, which is what a process killed
 * inside a mutation leaves behind.
 */
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { openTaskboard } from '../../../lib/taskboard/index.js'

const dir = process.env.TASKBOARD_DIR
const progress = process.env.TASKBOARD_PROGRESS
const mode = process.env.TASKBOARD_MODE ?? 'loop'
const prefix = process.env.TASKBOARD_PREFIX ?? 'crash'

if (!dir) throw new Error('TASKBOARD_DIR is required')

function note(line) {
  if (progress) appendFileSync(progress, `${line}\n`)
}

if (mode === 'hold-lock') {
  const { mkdir, open } = await import('node:fs/promises')
  await mkdir(dir, { recursive: true })
  const lock = join(dir, '.store.jsonl.lock')
  const handle = await open(lock, 'wx')
  await handle.writeFile(`${process.pid}\n`, 'utf8')
  await handle.close()
  note('lock-held')
  // Block until the parent kills this process: the lock is now abandoned.
  // A bare unresolved promise would not hold the event loop open, so keep a
  // real timer (never fires within the test) as the reason to stay alive.
  setInterval(() => undefined, 60_000)
}

const board = await openTaskboard(dir)
for (let index = 0; ; index += 1) {
  const id = `${prefix}-${index}`
  await board.create({ id, title: `Crash row ${index}` })
  await board.claim(id, `worker-${index % 3}`)
  await board.complete(id)
  note(`done ${id}`)
}