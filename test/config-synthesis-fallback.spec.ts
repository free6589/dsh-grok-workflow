import { describe, expect, it } from 'vitest'
import {
  describeResolvedConfig,
  repairSynthesisInconsistency,
  resolveConfig,
} from '../src/config.js'
import { apply } from '../src/index.js'

/**
 * P1 synthesis fallback (T4): `deterministic` was removed from the schema and
 * `model` requires a chain, so both recoverable mismatches repair to
 * `layered`; everything else still fails hard (R-06).
 *
 * Mutation meaning: removing the repair — or widening it to swallow other
 * errors — must fail this file: the a/b cases assert a repaired value where
 * the pinned rule demands a throw, and the throw cases assert the repair
 * refuses to touch anything it must not.
 */
describe('config synthesis fallback (P1)', () => {
  it('repairs (a): non-empty synthesizer chain + deterministic takes effect as layered', () => {
    const raw = { roles: { synthesizer: [{ model: 'writer' }] }, synthesis: 'deterministic' } as never
    // The pinned hard-fail rule still throws: the repair is a load-time twin,
    // not a weakening of `resolveConfig` itself.
    expect(() => resolveConfig(raw)).toThrow(/synthesis must be "model" or "layered"/)
    const { repaired, warnings } = repairSynthesisInconsistency(raw)
    expect(repaired.synthesis).toBe('layered')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('已按 layered 生效，请在设置页确认')
    // The repaired shape resolves and activates.
    const config = resolveConfig(repaired)
    expect(config.synthesis).toBe('layered')
    expect(config.roles.synthesizer).toEqual([{ model: 'writer' }])
  })

  it('repairs (b): model + empty chain takes effect as layered', () => {
    const raw = { synthesis: 'model' } as never
    expect(() => resolveConfig(raw)).toThrow(/requires a non-empty roles.synthesizer/)
    const { repaired, warnings } = repairSynthesisInconsistency(raw)
    expect(repaired.synthesis).toBe('layered')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('已按 layered 生效，请在设置页确认')
    const config = resolveConfig(repaired)
    expect(config.synthesis).toBe('layered')
    expect(config.roles.synthesizer).toEqual([])
  })

  it('leaves consistent configs untouched with no warnings', () => {
    const plain = repairSynthesisInconsistency({})
    expect(plain.warnings).toEqual([])
    expect(plain.repaired).toEqual({})

    const modelOk = repairSynthesisInconsistency({
      synthesis: 'model',
      roles: { synthesizer: [{ model: 'writer' }] },
    } as never)
    expect(modelOk.warnings).toEqual([])
    expect(modelOk.repaired.synthesis).toBe('model')
  })

  it('does not touch or swallow any other error (R-06 stays hard fail)', () => {
    // Unknown key: the repair must not normalize it away.
    const unknown = { nope: 1 } as never
    const kept = repairSynthesisInconsistency(unknown)
    expect(kept.warnings).toEqual([])
    expect(kept.repaired).toBe(unknown)
    expect(() => resolveConfig(kept.repaired)).toThrow(/unknown configuration key/)

    // Out-of-range number with an otherwise repairable shape: repair fires on
    // the mismatch, but resolving the repaired shape still throws on the
    // number — exactly what `apply()` relies on to stay hard fail.
    const badNumber = {
      synthesis: 'model',
      maxConcurrency: 0,
    } as never
    const { repaired } = repairSynthesisInconsistency(badNumber)
    expect(repaired.synthesis).toBe('layered')
    expect(() => resolveConfig(repaired)).toThrow(/maxConcurrency must be an integer/)

    // Malformed chain entry is not a mismatch shape at all.
    const badChain = { roles: { worker: [{ model: '' }] } } as never
    expect(repairSynthesisInconsistency(badChain).warnings).toEqual([])
    expect(() => resolveConfig(badChain)).toThrow(/non-empty model id/)
  })

  it('marks the repaired config in the one-line signature so the log is self-proving', () => {
    const repaired = resolveConfig(
      repairSynthesisInconsistency({ roles: { synthesizer: [{ model: 'writer' }] }, synthesis: 'deterministic' } as never).repaired,
    )
    repaired.synthesisRepaired = true
    expect(describeResolvedConfig(repaired)).toContain('synthesis=layered (repaired)')

    const plain = resolveConfig({})
    expect(describeResolvedConfig(plain)).toContain('synthesis=layered')
    expect(describeResolvedConfig(plain)).not.toContain('(repaired)')
  })
})

/**
 * `apply()` load-time twin of the repair: the two recoverable mismatches warn
 * (with 请在设置页确认) and keep the tool/gate/settings surface alive, while
 * anything else still throws at load (R-06). Deleting the `try/catch` in
 * `readConfig` fails the first two cases; widening the repair to swallow other
 * errors fails the third.
 */
describe('apply() load-time synthesis fallback (P1)', () => {
  interface FakeTool { name: string }
  class FakeCtx {
    readonly warnings: string[] = []
    readonly infos: string[] = []
    readonly toolsByName = new Map<string, FakeTool>()
    get tool(): FakeTool | undefined { return this.toolsByName.get('grok_workflow') }
    readonly tools = {
      register: (tool: FakeTool) => {
        this.toolsByName.set(tool.name, tool)
        return () => { if (this.toolsByName.get(tool.name) === tool) this.toolsByName.delete(tool.name) }
      },
    }
    readonly systemPrompt = {
      section: () => () => {},
      getSectionOrder: () => 2600,
    }
    logger = () => ({
      warn: (message: string) => { this.warnings.push(message) },
      info: (message: string) => { this.infos.push(message) },
    })
    effect = (installer: () => unknown) => installer()
    // Real cordis Context always exposes `on`; these tool-path tests run on a
    // runtime with the hook, so stub it (the hookless runtime is pinned in gate.spec.ts).
    readonly on = (): (() => void) => () => {}
  }

  it('activates on (a): chain non-empty + deterministic warns and takes effect as layered', () => {
    const ctx = new FakeCtx()
    expect(() => apply(ctx as never, { roles: { synthesizer: [{ model: 'writer' }] }, synthesis: 'deterministic' } as never)).not.toThrow()
    expect(ctx.tool?.name).toBe('grok_workflow')
    expect(ctx.warnings.some(w => w.includes('已按 layered 生效，请在设置页确认'))).toBe(true)
    expect(ctx.infos.some(i => i.includes('synthesis=layered (repaired)'))).toBe(true)
  })

  it('activates on (b): model + empty chain warns and takes effect as layered', () => {
    const ctx = new FakeCtx()
    expect(() => apply(ctx as never, { synthesis: 'model' } as never)).not.toThrow()
    expect(ctx.tool?.name).toBe('grok_workflow')
    expect(ctx.warnings.some(w => w.includes('已按 layered 生效，请在设置页确认'))).toBe(true)
    expect(ctx.infos.some(i => i.includes('synthesis=layered (repaired)'))).toBe(true)
  })

  it('still throws at load on anything the repair must not touch (R-06)', () => {
    expect(() => apply(new FakeCtx() as never, { maxRetires: 2 } as never))
      .toThrow(/unknown configuration key/)
    // B07 made a stored *overrun* (maxConcurrency over its cap) recoverable at load,
    // so the hard-fail witness here is a value the limit repair must not touch: below
    // the minimum was never legal, so it still refuses the load
    // (`test/config-limits-repair.spec.ts` pins the other side).
    expect(() => apply(new FakeCtx() as never, { maxConcurrency: 0 } as never))
      .toThrow(/maxConcurrency must be an integer/)
    // A repairable shape hiding a second defect stays hard fail: the number
    // error must surface, not the repair warning.
    const ctx = new FakeCtx()
    expect(() => apply(ctx as never, { synthesis: 'model', maxConcurrency: 0 } as never))
      .toThrow(/maxConcurrency must be an integer/)
    expect(ctx.tool).toBeUndefined()
  })
})
