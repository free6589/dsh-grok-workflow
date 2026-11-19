// In-host probe for the round-17 heartbeat live verification.
//
// This module is loaded by the isolated DSH instance's real Loader as an ordinary
// plugin row. It mocks nothing: it holds the Host's real `schedule` service, the real
// `sessionController`, and the real plugin modules from this repository's built `lib/`.
// It exposes a file queue (`cmd.json` -> `res-<seq>.json`) so the driver shell can ask
// the *host process* to perform an operation it cannot reach over HTTP (Schedule's
// manual delivery, the loop service's unload/archive cleanups).
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const REPO = fileURLToPath(new URL('../../../../../', import.meta.url))

const { createLoopService, isLoopHeartbeat } = await import(new URL('lib/loop.js', `file://${REPO}`).href)
const { createLoopTool } = await import(new URL('lib/loop-surface.js', `file://${REPO}`).href)
const { classifyPreStep } = await import(new URL('lib/gate.js', `file://${REPO}`).href)

export const name = 'live-verify-probe'
export const inject = ['schedule', 'sessionController']

export function apply(ctx, config) {
  const dir = config.dir
  const log = (text) => appendFileSync(join(dir, 'probe.log'), `${new Date().toISOString()} ${text}\n`)
  log(`probe applied; repo=${REPO} here=${HERE}`)

  const logger = { info: (text) => log(`INFO ${text}`), warn: (text) => log(`WARN ${text}`) }
  const service = () => createLoopService({ schedule: () => ctx.get('schedule'), logger })

  let seq = 0
  // The host composes more than one Context carrying this row, so two probe instances
  // poll the same queue. `wx` makes the first answer win and the duplicate a no-op.
  const answer = (cmd, payload) => {
    try {
      writeFileSync(join(dir, `res-${cmd.seq}.json`), `${JSON.stringify({ seq: cmd.seq, op: cmd.op, ...payload }, null, 2)}\n`, { flag: 'wx' })
    } catch (error) {
      log(`op=${cmd.op} seq=${cmd.seq} already answered (${String(error?.code ?? error)})`)
      return
    }
    log(`op=${cmd.op} seq=${cmd.seq} -> ${'ok' in payload ? `ok=${payload.ok}` : `error=${payload.error?.code ?? payload.error?.message}`}`)
  }

  const run = async (cmd) => {
    switch (cmd.op) {
      case 'introspect': {
        const names = (target) => {
          const out = new Set()
          for (let proto = Object.getPrototypeOf(target); proto !== null && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
            for (const key of Object.getOwnPropertyNames(proto)) out.add(key)
          }
          return [...out].sort()
        }
        const controller = ctx.get('sessionController') ?? ctx.sessionController
        return {
          ok: true,
          result: {
            services: Object.keys(ctx.root?.registry ?? ctx.registry ?? {}).slice(0, 5),
            hasSessionControllerService: controller !== undefined,
            sessionController: controller === undefined ? [] : names(controller),
            schedule: ctx.get('schedule') === undefined ? [] : names(ctx.get('schedule')),
          },
        }
      }
      case 'classify': {
        // The real classifier, fed the exact message object the Session log recorded for
        // a Schedule delivery. No mock: this is the shipped `classifyPreStep`.
        const payload = {
          messages: [cmd.message],
          agent: { session: { id: cmd.sessionId, header: {} } },
          turn: 1,
        }
        const verdict = classifyPreStep({ config: {} }, payload)
        return { ok: true, result: { kind: verdict.kind, reason: verdict.reason ?? null, code: verdict.code ?? null } }
      }
      case 'heartbeat-probe':
        return { ok: true, result: { text: cmd.text.slice(0, 120), isLoopHeartbeat: isLoopHeartbeat(cmd.text) } }
      case 'session': {
        const created = await ctx.sessionController.create({ cwd: cmd.cwd })
        return { ok: true, result: { sessionId: String(created.sessionId), agentPreset: created.agentPreset ?? null } }
      }
      case 'catalog':
        return { ok: true, result: await ctx.get('schedule').catalog() }
      case 'run':
        return { ok: true, result: await ctx.get('schedule').run({ id: cmd.id }) }
      case 'history':
        return { ok: true, result: await ctx.get('schedule').history({ id: cmd.id }) }
      case 'status':
        return { ok: true, result: await service().status({ sessionId: cmd.sessionId }) }
      case 'open-with-actor':
        return {
          ok: true,
          result: await service().open({ sessionId: cmd.sessionId }, cmd.actor).then(
            (snapshot) => ({ outcome: 'opened', snapshot }),
            (error) => ({ outcome: 'refused', code: error.code ?? null, message: error.message }),
          ),
        }
      case 'tool-open': {
        const tool = createLoopTool(service())
        try {
          await tool.execute({ action: 'open', sessionId: cmd.sessionId }, {
            agent: { session: { id: cmd.sessionId } },
            signal: new AbortController().signal,
          })
          return { ok: true, result: { outcome: 'opened' } }
        } catch (error) {
          return { ok: true, result: { outcome: 'refused', code: error.code ?? null, message: error.message } }
        }
      }
      case 'forget':
        return { ok: true, result: { deleted: await service().forgetSession(cmd.sessionId) } }
      case 'stopall':
        return { ok: true, result: { deleted: await service().stopAll(cmd.reason ?? 'probe') } }
      default:
        return { ok: false, error: { message: `unknown op ${String(cmd.op)}` } }
    }
  }

  const timer = setInterval(() => {
    const path = join(dir, 'cmd.json')
    if (!existsSync(path)) return
    let cmd
    try {
      cmd = JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      return
    }
    if (typeof cmd.seq !== 'number' || cmd.seq <= seq) return
    seq = cmd.seq
    log(`op=${cmd.op} seq=${cmd.seq} started`)
    void run(cmd).then(
      (payload) => answer(cmd, payload),
      (error) => answer(cmd, { ok: false, error: { code: error?.code ?? null, message: String(error?.message ?? error) } }),
    )
  }, 250)
  timer.unref?.()
}
