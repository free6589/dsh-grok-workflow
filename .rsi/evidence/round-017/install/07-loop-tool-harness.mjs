// Exercise the grok_loop tool of the *installed* artifact (the profile's node_modules),
// with a recording LoopService stub. No model, no network.
//
// Usage:
//   GROK_LOOP_SURFACE="$DSH_HOME/profiles/r17-web/node_modules/dsh-grok-workflow/lib/loop-surface.js" \
//     node 07-loop-tool-harness.mjs
const surface = process.env.GROK_LOOP_SURFACE ?? process.argv[2]
if (!surface) {
  console.error('set GROK_LOOP_SURFACE (or pass argv[2]) to the installed lib/loop-surface.js')
  process.exit(2)
}
const { createLoopTool } = await import(surface)

const calls = []
const snap = (sessionId, open) => ({ open, sessionId })
const loops = {
  available: () => true,
  open: async (req, actor) => { calls.push(['open', req, actor]); return snap(req.sessionId, true) },
  close: async (req, actor) => { calls.push(['close', req, actor]); return snap(req.sessionId, false) },
  status: async (req) => { calls.push(['status', req]); return snap(req.sessionId, false) },
  stopAll: async () => 0,
  forgetSession: async () => 0,
}
const tool = createLoopTool(loops)
const exec = { agent: { session: { id: 'session-abc' } } }
const out = []
out.push(['tool name', tool.name])

const r1 = await tool.execute({ action: 'status' }, exec)
out.push(['status result', JSON.stringify(r1)])

const r2 = await tool.execute({ action: 'close' }, exec)
out.push(['close result', JSON.stringify(r2)])

let refusal = null
try { await tool.execute({ action: 'open' }, exec) } catch (e) { refusal = { name: e.name, code: e.code, message: e.message } }
out.push(['open refusal', JSON.stringify(refusal)])
out.push(['open calls scheduled', calls.filter(c => c[0] === 'open').length])

let foreign = null
try { await tool.execute({ action: 'status', sessionId: 'session-other' }, exec) } catch (e) { foreign = e.message }
out.push(['foreign session', String(foreign)])

let noAgent = null
try { await tool.execute({ action: 'status' }, {}) } catch (e) { noAgent = e.message }
out.push(['no agent', String(noAgent)])

let badAction = null
try { await tool.execute({ action: 'nope' }, exec) } catch (e) { badAction = e.message }
out.push(['bad action', String(badAction)])

for (const [k, v] of out) console.log(`${k}: ${v}`)
