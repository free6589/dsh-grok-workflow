import { existsSync, readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Wave4 fix/browser-firefox-safari: firefox tri-state evidence guard (red-first).
 *
 * Only pins the evidence this block owns: three firefox PNGs + readings.json +
 * zero console/page errors. No product behaviour change; webkit/safari stays
 * NOT_RUN (no local engine, no network download) and is recorded, not forged.
 */

const DIR = new URL('../.rsi/evidence/browser-firefox-safari/', import.meta.url)
const file = (name: string): string => new URL(name, DIR).pathname

function readings(): any {
  return JSON.parse(readFileSync(file('readings.json'), 'utf8'))
}

describe('browser tri-states evidence (firefox)', () => {
  it('ships three firefox PNGs (waiting / running / done)', () => {
    for (const name of ['firefox-waiting.png', 'firefox-running.png', 'firefox-done.png']) {
      const path = file(name)
      expect(existsSync(path), `${name} exists`).toBe(true)
      expect(statSync(path).size, `${name} non-empty`).toBeGreaterThan(5000)
    }
  })

  it('pins firefox readings: chips, dock button, and zero-error console', () => {
    const data = readings()
    const ff = data.firefox
    expect(ff.ua).toContain('Firefox/')
    expect(ff.title).toContain('waiting=waiting')
    expect(ff.title).toContain('running=running')
    expect(ff.title).toContain('done=done')
    const byId: Record<string, any> = {}
    for (const frame of ff.frames) byId[frame.id] = frame
    expect(byId.waiting.chip).toBe('等你点头')
    expect(byId.waiting.chipState).toBe('waiting')
    expect(byId.waiting.dockFill).toBe('开工')
    expect(byId.running.chip).toBe('进行中')
    expect(byId.running.chipState).toBe('running')
    expect(byId.done.chip).toBe('已完成')
    expect(byId.done.chipState).toBe('done')
    expect(ff.errors.console).toEqual([])
    expect(ff.errors.page).toEqual([])
  })

  it('keeps safari/webkit as recorded NOT_RUN, not forged evidence', () => {
    const data = readings()
    expect(data.webkit ?? data.safari, 'no webkit/safari engine evidence').toBeUndefined()
  })
})
