// Red/green probe for the three structural facts the new client tests pin.
// Runs the same stub-React load against HEAD's bundle and the working-tree bundle.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..')

function load(path) {
  const source = readFileSync(path, 'utf8')
  let registration
  const globalRecord = globalThis
  const previous = globalRecord.window
  globalRecord.window = { __ModuleLoader__: { load: (spec) => { registration = spec } } }
  try { new Function(source)() } finally { globalRecord.window = previous }
  const stubReact = {
    createElement: (type, props, ...children) => {
      const element = { type, props: props ?? {}, children: children.flat(Infinity) }
      return typeof type === 'function' ? type(element.props) : element
    },
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: () => {},
    useMemo: (factory) => factory(),
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  }
  return registration.factory((id) => {
    if (id === 'react') return stubReact
    throw new Error(`unexpected require ${id}`)
  })
}

function walk(node, out = []) {
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (Array.isArray(node)) { for (const child of node) walk(child, out); return out }
  if ('type' in node && 'props' in node) { out.push(node); walk(node.children, out) }
  return out
}

function probe(path) {
  const bundle = load(path)
  const progress = bundle.GROK_WORKFLOW_PROGRESS
  const t = (key, values) => bundle.GROK_WORKFLOW_INTERNALS.translate('zh', key, values)
  const member = (seq, phase, outcome) => ({ seq, label: `执行 ${seq}`, childId: `child-${seq}`, order: seq - 1, phase, ...outcome === undefined ? {} : { outcome } })
  const run = { runId: 'r', name: '任务团队', anchorSeq: 1, members: [member(1, '执行', 'completed'), member(2, '执行', undefined)] }
  const tree = progress.component({ t, progressT: t, useGrokProgress: (select) => select({ runs: [run], activeRun: run }) })
  const elements = walk(tree)
  const track = elements.find((element) => element.props['data-gw-progress-track'] === true)
  const branch = elements.find((element) => typeof element.props['data-gw-progress-branch'] === 'string')
  const metas = elements.filter((element) => element.props['data-gw-progress-meta'] === true)
  return {
    'branch is a sibling inside the flex track (defect A)': track !== undefined && branch !== undefined && walk(track.children).includes(branch),
    'CSS draws the 28px state ring (defect B)': progress.css.includes('.gw-progress-ring {'),
    'CSS still ships the head-striking seg-line (defect C)': progress.css.includes('.gw-progress-seg-line'),
    'meta line has a tooltip when clipped (defect D)': metas.length > 0 && metas.every((meta) => typeof meta.props['title'] === 'string'),
  }
}

const before = probe(join(here, 'base/client-index.js'))
const after = probe(join(repo, 'src/client/index.js'))
const rows = Object.keys(before).map((fact) => ({ fact, 'HEAD (before)': before[fact], 'working tree (after)': after[fact] }))
console.table(rows)
const wrong = rows.filter((row) => row['HEAD (before)'] === row['working tree (after)'])
console.log(wrong.length === 0
  ? 'PROBE: every pinned fact differs between HEAD and the working tree (the new tests fail on HEAD).'
  : `PROBE: ${wrong.length} fact(s) did not change: ${wrong.map((row) => row.fact).join('; ')}`)
process.exitCode = wrong.length === 0 ? 0 : 1
