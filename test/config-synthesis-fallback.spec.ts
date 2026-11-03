import { describe, expect, it } from 'vitest'
import {
  describeResolvedConfig,
  repairSynthesisInconsistency,
  resolveConfig,
} from '../src/config.js'
import { apply } from '../src/index.js'

/**
 * P1 synthesis fallback: only the two recoverable synthesis/synthesizer
 * mismatches are repaired; everything else still fails hard (R-06).
 *
 * Mutation meaning: `test/config.spec.ts` and `test/routing.spec.ts` pin the
 * hard-fail rule (`resolveConfig` throws for both mismatches). Removing the
 * repair — or widening it to swallow other errors — must fail this file:
 * the a/b cases assert a repaired value where the pinned rule demands a
 * throw, and the throw cases assert the repair refuses to touch anything
 * it must not.
 */
describe('config synthesis fallback (P1)', () => {
  it('repairs (a): non-empty synthesizer chain + deterministic takes effect as model', () => {
    const raw = { roles: { synthesizer: [{ model: 'writer' }] } } as never
    // The pinned hard-fail rule still throws: the repair is a load-time twin,
    // not a weakening of `resolveConfig` itself.
    expect(() => resolveConfig(raw)).toThrow(/synthesis is "deterministic"/)
    const { repaired, warnings } = repairSynthesisInconsistency(raw)
    expect(repaired.synthesis).toBe('model')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('已按 model 生效，请在设置页确认')
    // The repaired shape resolves and activates.
    const config = resolveConfig(repaired)
    expect(config.synthesis).toBe('model')
    expect(config.roles.synthesizer).toEqual([{ model: 'writer' }])
  })

  it('repairs (b): model + empty chain takes effect as deterministic', () => {
    const raw = { synthesis: 'model' } as never
    expect(() => resolveConfig(raw)).toThrow(/requires a non-empty roles.synthesizer/)
    const { repaired, warnings } = repairSynthesisInconsistency(raw)
    expect(repaired.synthesis).toBe('deterministic')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('已按 deterministic 生效，请在设置页确认')
    const config = resolveConfig(repaired)
    expect(config.synthesis).toBe('deterministic')
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
      maxRetries: 99,
    } as never
    const { repaired } = repairSynthesisInconsistency(badNumber)
    expect(repaired.synthesis).toBe('deterministic')
    expect(() => resolveConfig(repaired)).toThrow(/maxRetries must be an integer/)

    // Malformed chain entry is not a mismatch shape at all.
    const badChain = { roles: { worker: [{ model: '' }] } } as never
    expect(repairSynthesisInconsistency(badChain).warnings).toEqual([])
    expect(() => resolveConfig(badChain)).toThrow(/non-empty model id/)
  })

  it('marks the repaired config in the one-line signature so the log is self-proving', () => {
    const repaired = resolveConfig(
      repairSynthesisInconsistency({ roles: { synthesizer: [{ model: 'writer' }] } } as never).repaired,
    )
    repaired.synthesisRepaired = true
    expect(describeResolvedConfig(repaired)).toContain('synthesis=model (repaired)')

    const plain = resolveConfig({})
    expect(describeResolvedConfig(plain)).toContain('synthesis=deterministic')
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
    tool: FakeTool | undefined
    readonly tools = {
      register: (tool: FakeTool) => { this.tool = tool; return () => { this.tool = undefined } },
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
  }

  it('activates on (a): chain non-empty + deterministic warns and takes effect as model', () => {
    const ctx = new FakeCtx()
    expect(() => apply(ctx as never, { roles: { synthesizer: [{ model: 'writer' }] } } as never)).not.toThrow()
    expect(ctx.tool?.name).toBe('grok_workflow')
    expect(ctx.warnings.some(w => w.includes('已按 model 生效，请在设置页确认'))).toBe(true)
    expect(ctx.infos.some(i => i.includes('synthesis=model (repaired)'))).toBe(true)
  })

  it('activates on (b): model + empty chain warns and takes effect as deterministic', () => {
    const ctx = new FakeCtx()
    expect(() => apply(ctx as never, { synthesis: 'model' } as never)).not.toThrow()
    expect(ctx.tool?.name).toBe('grok_workflow')
    expect(ctx.warnings.some(w => w.includes('已按 deterministic 生效，请在设置页确认'))).toBe(true)
    expect(ctx.infos.some(i => i.includes('synthesis=deterministic (repaired)'))).toBe(true)
  })

  it('still throws at load on anything the repair must not touch (R-06)', () => {
    expect(() => apply(new FakeCtx() as never, { maxRetires: 2 } as never))
      .toThrow(/unknown configuration key/)
    expect(() => apply(new FakeCtx() as never, { maxRetries: 99 } as never))
      .toThrow(/maxRetries must be an integer/)
    // A repairable shape hiding a second defect stays hard fail: the number
    // error must surface, not the repair warning.
    const ctx = new FakeCtx()
    expect(() => apply(ctx as never, { synthesis: 'model', maxRetries: 99 } as never))
      .toThrow(/maxRetries must be an integer/)
    expect(ctx.tool).toBeUndefined()
  })
})
