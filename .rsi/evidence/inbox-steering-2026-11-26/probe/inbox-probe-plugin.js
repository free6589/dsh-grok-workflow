// Verification rig (not product code): records every live-inbox event the host
// dispatches, so "does agent/inbox/inserted fire while a tool call is running"
// is answered by a reading instead of an inference.
import { appendFileSync } from 'node:fs'

const LOG = process.env.INBOX_PROBE_LOG ?? '/tmp/inbox-probe.jsonl'

export const name = 'inbox-probe'

export function apply(ctx) {
  const line = (kind, payload) => {
    try {
      const msg = payload?.message
      const blocks = Array.isArray(msg?.content) ? msg.content : []
      const text = blocks
        .filter((b) => b && b.type === 'text')
        .map((b) => String(b.text ?? ''))
        .join(' ')
        .slice(0, 240)
      appendFileSync(LOG, JSON.stringify({
        at: new Date().toISOString(),
        t: Date.now(),
        kind,
        status: payload?.status ?? null,
        turn: payload?.turn ?? null,
        sessionId: payload?.agent?.session?.id ?? null,
        role: msg?.role ?? null,
        sourceKind: msg?.source?.kind ?? null,
        text,
      }) + '\n')
    } catch { /* the rig must never break the turn it measures */ }
  }
  ctx.effect(() => {
    const disposers = [
      ctx.on('agent/inbox/inserted', (p) => line('inserted', p)),
      ctx.on('agent/inbox/claimed', (p) => line('claimed', p)),
      ctx.on('agent/inbox/discarded', (p) => line('discarded', p)),
      ctx.on('agent/status', (p) => line('status', p)),
    ]
    return () => { for (const d of disposers) { try { if (typeof d === 'function') d() } catch { /* gone */ } } }
  })
}
