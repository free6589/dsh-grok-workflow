/**
 * r2 helpers — retry of stage D's evidence set (agent-32, 2026-11-15).
 *
 * Reuses `lib.mjs` (the DOM contract, the strip/residue probes and `shot` are the
 * same measurements the first pass used, so the two passes are comparable) and adds
 * only what a *fresh* isolated home needs: waiting for the composer instead of for an
 * existing session row, and a state file of its own (`run-state-r2.json`) so the
 * first pass's `run-state.json` is not clobbered.
 */
import fs from 'node:fs'
import path from 'node:path'

export * from './lib.mjs'
import { OUT, redact } from './lib.mjs'

export const STATE_R2 = path.join(OUT, 'run-state-r2.json')

export function loadR2 () {
  return fs.existsSync(STATE_R2) ? JSON.parse(fs.readFileSync(STATE_R2, 'utf8')) : {}
}
export function mergeR2 (patch) {
  const next = { ...loadR2(), ...patch }
  fs.writeFileSync(STATE_R2, JSON.stringify(next, null, 2))
  return next
}
export function saveStage (name, obj) {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj, null, 2))
}

/** Wait until the app is usable: a composer to type into and a booted client bundle. */
export async function waitReady (p, ms = 90000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const n = await p.locator('[contenteditable="true"]').count()
    if (n > 0) { await p.waitForTimeout(2500); return true }
    await p.waitForTimeout(1000)
  }
  return false
}

/** The live URL with the one-time token stripped, so it can be logged. */
export const safeUrl = (p) => redact(p.url())

/** Sidebar rows: the session titles the app really renders, for re-entry by name. */
export const sidebarRows = (p) => p.evaluate(() => {
  const out = []
  for (const el of document.querySelectorAll('a,button,[role="link"],[role="button"]')) {
    const t = (el.innerText || '').trim().replace(/\s+/g, ' ')
    if (/scratch|待办|stat|sha256/i.test(t) && t.length < 160) out.push(t)
  }
  return Array.from(new Set(out)).slice(0, 10)
})

/** Re-enter a session by clicking the sidebar row whose text matches `frag`. */
export async function openSessionRow (p, frag, ms = 45000) {
  const row = p.getByText(frag, { exact: false }).first()
  if (await row.count() === 0) return false
  await row.click().catch(() => {})
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await p.locator('[data-chat-flow-kind="assistant-step"]').count() > 0) {
      await p.waitForTimeout(2000)
      return true
    }
    await p.waitForTimeout(1000)
  }
  return false
}
