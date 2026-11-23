/**
 * The plugin's team workflow engine: the runtime's own published PTC engine,
 * executed over a context view whose `subagents.startActivation` gives every
 * child a descriptive durable display label.
 *
 * Why this seam exists (fix_child_names): the workflow guest computes the
 * script's label (`opts.label ?? defaultLabel(prompt)`) but forwards only
 * prompt/schema/provider/model across the worker boundary, and the PTC host
 * hardcodes `` label: `${meta.name} child ${callId}` `` when it calls
 * `subagents.startActivation` (dsh-workflow-ptc host `startChild`). That spec
 * label is what `startLocal` snapshots into the child's durable
 * `subagent/descriptor` event, and the Web GUI's team panel renders it as the
 * child's primary name (`dsh-client-ui-subagent` shows `entry.label ?? entry.id`).
 * The one channel the plugin controls at that boundary is the child prompt,
 * whose first line every prompt builder in this plugin makes the child's
 * display title; the view derives the label from it with the guest's own
 * `defaultLabel` rule (first line, 48 code points).
 *
 * Boundary: DSH core is untouched. The engine class is not re-implemented —
 * the twin is built from the constructor of the very engine instance the
 * runtime injected, so it follows the host's engine implementation. The
 * context view only decorates `subagents` (and neutralizes the `Service`
 * base's registration, so the runtime's own `workflowEngine` service stays
 * untouched everywhere); every other property is the real runtime service.
 * When the injected engine is not the published PTC engine (unit-test fakes,
 * foreign implementations), the injected engine is returned unchanged.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Config } from '@deepseek-ai/dsh-workflow-ptc'
import type { WorkflowEngine } from '@deepseek-ai/dsh-workflow'
import type { ChildOutcome, ChildOutcomeLog, ChildTerminal } from './child-outcomes.js'
import { childStopPhrase, createChildOutcomeLog, emptyChildOutcomeLog, roleOfChildTitle } from './child-outcomes.js'
import { sessionPosition, sessionVerdict } from './child-evidence.js'

/** Code points a derived child label may occupy — the guest's own defaultLabel rule. */
export const CHILD_LABEL_LIMIT = 48

const LABEL_ELLIPSIS = '…'

/**
 * The activation-spec slice the rewrite reads and rewrites (structural, untrusted
 * shape).
 *
 * Two shapes reach this seam and both are real. The published engine builds the
 * spec flat — `{ label, prompt, agentOptions, parent, cwd, … }` — and that is what
 * every production child sends. The engine contract harness builds the same two
 * fields one level down under `request`, which is also the shape an older
 * host-side mirror used. Reading only `request.prompt` and `request.agentOptions`
 * therefore produced an empty title and an `inherit` route on every real run: the
 * label stayed the engine's own, the role was never parsed, and the null-collapse
 * repair had no group to match. Both reads are kept, flat first.
 */
export interface ActivationSpecView {
  label: string
  /** Flat shape (what the published engine sends). */
  prompt?: readonly { type?: string, text?: string }[]
  /** Flat shape, same provenance as {@link prompt}. */
  agentOptions?: { provider?: unknown, model?: unknown }
  /** Nested shape (engine contract harness, older host mirror). */
  request?: {
    prompt?: readonly { type?: string, text?: string }[]
    agentOptions?: { provider?: unknown, model?: unknown }
  }
}

/** The prompt blocks of an activation, whichever of the two shapes it arrived in. */
function promptBlocks(spec: ActivationSpecView): readonly { type?: string, text?: string }[] | undefined {
  if (Array.isArray(spec.prompt)) return spec.prompt
  const nested = spec.request?.prompt
  return Array.isArray(nested) ? nested : undefined
}

/** The route options of an activation, whichever shape it arrived in. */
function specRouteOptions(spec: ActivationSpecView): { provider?: unknown, model?: unknown } | undefined {
  return spec.agentOptions ?? spec.request?.agentOptions
}

/**
 * Derive a child display label from its prompt: the first line, trimmed, capped
 * at {@link CHILD_LABEL_LIMIT} code points (a surrogate pair is never split).
 * @param prompt - the child prompt text, or anything.
 * @param fallback - the label to keep when no usable first line exists.
 * @returns the display label.
 */
export function childLabelFromPrompt(prompt: unknown, fallback: string): string {
  if (typeof prompt !== 'string') return fallback
  const newline = prompt.indexOf('\n')
  const line = (newline === -1 ? prompt : prompt.slice(0, newline)).trim()
  if (line === '') return fallback
  const characters = Array.from(line)
  if (characters.length <= CHILD_LABEL_LIMIT) return line
  return `${characters.slice(0, CHILD_LABEL_LIMIT).join('')}${LABEL_ELLIPSIS}`
}

/**
 * Rewrite one activation spec's label from its prompt's first line, returning
 * the spec untouched when the first line yields nothing (or the same label).
 * @param spec - the activation spec as the engine built it.
 * @returns the spec carrying the descriptive label.
 */
export function rewriteActivationLabel<T extends ActivationSpecView>(spec: T): T {
  const blocks = promptBlocks(spec)
  const first = Array.isArray(blocks)
    ? blocks.find(block => typeof block?.text === 'string')
    : undefined
  const label = childLabelFromPrompt(first?.text, spec.label)
  return label === spec.label ? spec : { ...spec, label }
}

/** Backstop limits for the twin engine — the published PTC engine's own defaults. */
const TWIN_ENGINE_DEFAULTS: Config = {
  provider: 'spawn',
  maxConcurrentAgents: 0,
  maxTotalAgents: 1000,
  maxItemsPerCall: 4096,
  syncTimeoutMs: 5000,
}

/**
 * Adopt only the runtime engine's own config keys the twin understands
 * (shape-checked per key), so an operator's tuning of the runtime engine's
 * backstops carries over instead of silently reverting to defaults.
 */
function mirroredConfig(injected: object): Config {
  const source = (injected as { config?: Record<string, unknown> }).config
  if (typeof source !== 'object' || source === null) return TWIN_ENGINE_DEFAULTS
  const config: Record<string, unknown> = { ...TWIN_ENGINE_DEFAULTS }
  for (const key of Object.keys(TWIN_ENGINE_DEFAULTS) as (keyof Config)[]) {
    const value = source[key]
    if (typeof value === typeof (TWIN_ENGINE_DEFAULTS[key] as number | string)) config[key] = value
  }
  return config as Config
}

type StartActivation = (spec: ActivationSpecView) => Promise<unknown>

/** The activation receipt the engine's `startChild` keeps, as far as this seam reads it. */
interface ActivationReceipt {
  childId?: unknown
  result?: unknown
}

/**
 * Read one field off a settled child result without trusting its shape: the
 * receipt and its result cross a provider seam, so every read is defensive and a
 * hostile getter must not break the engine call that produced it.
 * @param value - the receipt or the settled result.
 * @param key - the field to read.
 * @returns The string value, or `undefined`.
 */
function field(value: unknown, key: string): string | undefined {
  try {
    if (value === null || typeof value !== 'object') return undefined
    const read = (value as Record<string, unknown>)[key]
    return typeof read === 'string' ? read : undefined
  } catch {
    return undefined
  }
}

/** The route label a child asked for (`provider/model`, or `inherit`). */
function requestedRoute(spec: ActivationSpecView): string {
  const agentOptions = specRouteOptions(spec)
  const provider = typeof agentOptions?.provider === 'string' ? agentOptions.provider : undefined
  const model = typeof agentOptions?.model === 'string' ? agentOptions.model : undefined
  if (provider !== undefined && model !== undefined) return `${provider}/${model}`
  return model ?? 'inherit'
}

/**
 * What this seam reads out of an activation spec: the child's title line and the
 * route it asked for.
 *
 * Exported because it is the whole of the spec-shape contract and both shapes are
 * real: the published engine sends it flat, the older host mirror nested it under
 * `request`. A case that drives only one shape cannot see the other break, which
 * is exactly how the seam read nothing on every production run while the unit
 * cases were green.
 * @param spec - the activation spec, in either shape.
 * @returns The title line and the route label (`provider/model`, or `inherit`).
 */
export function activationFacts(spec: ActivationSpecView): { title: string, route: string } {
  return { title: promptTitle(spec), route: requestedRoute(spec) }
}

/** The child's display title: the first line of the prompt, as the label rewrite reads it. */
function promptTitle(spec: ActivationSpecView): string {
  const blocks = promptBlocks(spec)
  const first = Array.isArray(blocks) ? blocks.find(block => typeof block?.text === 'string') : undefined
  const text = typeof first?.text === 'string' ? first.text : ''
  const cut = text.indexOf('\n')
  return (cut === -1 ? text : text.slice(0, cut)).trim()
}

/**
 * Observe one child activation's terminal state into the log.
 *
 * This is the half of the null-collapse seam the plugin can see: the engine's
 * guest only receives `null` for a child that did not finish cleanly, but the
 * activation receipt's `result` settles with the real `stopReason` and the
 * provider's `diagnostic`. The observer is attached beside the engine's own
 * handling and never replaces it: it does not await, does not alter the promise
 * the engine holds, and swallows nothing it would have to report.
 *
 * The provider's own words are not on that result for an in-process child
 * (`captureLocalResult` carries no `diagnostic`), so the child's live session is
 * captured here — while the engine still holds it — and read at settlement for
 * the failure its own log recorded (`src/child-evidence.ts`). The capture is
 * taken at start because the engine disposes the child before the settlement
 * reaches this seam; a read-only observation that arrives later finds nothing.
 * @param outcomes - the log to write into.
 * @param spec - the activation spec the engine built (before the label rewrite).
 * @param receipt - what `startActivation` returned.
 * @param lookupSession - resolves a child session id to its live session object.
 */
function observeActivation(
  outcomes: ChildOutcomeLog,
  spec: ActivationSpecView,
  receipt: unknown,
  lookupSession: SessionLookup,
): void {
  try {
    const activation = (receipt === null || typeof receipt !== 'object' ? undefined : receipt) as ActivationReceipt | undefined
    const result = activation?.result
    if (result === null || typeof result !== 'object' || typeof (result as PromiseLike<unknown>).then !== 'function') return
    const childId = field(activation, 'childId')
    const { title, route } = activationFacts(spec)
    const identity = roleOfChildTitle(title)
    const label = typeof spec.label === 'string' ? spec.label : undefined
    const session = childId === undefined ? undefined : lookupSession(childId)
    const position = sessionPosition(session)
    const base = {
      ...childId === undefined ? {} : { childId },
      ...label === undefined ? {} : { label },
      ...identity === undefined ? {} : { role: identity.role, attempt: identity.attempt },
      route,
    }
    const record = (outcome: ChildTerminal): void => {
      try {
        outcomes.add({ ...base, ...outcome })
      } catch {
        // The log is a diagnostic; a refused write must not reject this handler,
        // which would surface as an unhandled rejection of the engine's own run.
      }
    }
    void (result as Promise<unknown>).then(
      settled => {
        const stopReason = field(settled, 'stopReason') ?? 'completed'
        const engineDiagnostic = field(settled, 'diagnostic')
        const verdict = stopReason === 'completed' ? undefined : sessionVerdict(session, position)
        const detail = engineDiagnostic ?? verdict?.failure?.message
        record({
          stopReason,
          ...detail === undefined ? {} : { diagnostic: detail },
          ...verdict?.failure?.code === undefined ? {} : { code: verdict.failure.code },
        })
      },
      (error: unknown) => {
        // The seam's infrastructure rejection: the run handle itself failed, so the
        // child never produced a stop reason. Its message is the only cause there is.
        record({ stopReason: 'rejected', diagnostic: error instanceof Error ? error.message : String(error) })
      },
    )
  } catch {
    // Observation is a diagnostic, never a run input: a receipt this seam cannot
    // read costs the evidence, not the child.
  }
}

/** Resolve a child session id to the live session object, or nothing. */
type SessionLookup = (childId: string) => unknown

/**
 * The live-session lookup this seam uses: the host's session store, read the way
 * every other transcript read in this plugin reads it (`ctx.get('sessions')` —
 * the documented accessor, because `sessions` is not in this plugin's `inject`
 * list). The engine's own context is the one resolved from, since that is the
 * scope the child sessions are created in.
 * @param resolveService - the engine-context service resolver.
 * @returns A lookup that answers `undefined` instead of throwing.
 */
function sessionLookupFor(resolveService: (name: string) => unknown): SessionLookup {
  return (childId: string) => {
    try {
      const store = resolveService('sessions') as { get?: (id: string) => unknown } | undefined
      if (store === undefined || store === null || typeof store.get !== 'function') return undefined
      return store.get(childId) ?? undefined
    } catch {
      return undefined
    }
  }
}

/**
 * A view of the subagent seam whose `startActivation` rewrites each child's
 * label and records the child's terminal state; every other member reaches the
 * real service. The real service object is never mutated.
 */
function labeledSubagents(subagents: object, outcomes: ChildOutcomeLog, lookupSession: SessionLookup): object {
  return new Proxy(subagents, {
    get(target, property, receiver) {
      if (property === 'startActivation') {
        const start = Reflect.get(target, property, receiver) as StartActivation
        return async (spec: ActivationSpecView) => {
          const receipt = await start.call(target, rewriteActivationLabel(spec))
          observeActivation(outcomes, spec, receipt, lookupSession)
          return receipt
        }
      }
      return Reflect.get(target, property, receiver)
    },
  })
}

/**
 * The twin engine's context: a minimal service holder resolved from the
 * injected engine's OWN context (`Service.ctx` — the scope the real engine
 * runs in), NOT from the plugin's context and NOT as a proxy. Two cordis
 * facts shape this: the plugin's context cannot see the engine bundle's
 * services at all (isolate scoping — only injected names bridge), and on any
 * cordis context a *property* read of a service is isolate-guarded while the
 * explicit `ctx.get(name)` resolution is not ("cannot get property … without
 * inject" vs the service itself). So each member is read as a property first
 * (how the engine's own `start()` reaches them once running) and falls back
 * to `ctx.get(name)`. `reflect.provide` is neutralized so the `Service` base
 * leaves the twin unregistered and the runtime's own `workflowEngine`
 * service untouched.
 */
function twinContext(injected: object, outcomes: ChildOutcomeLog): Context {
  const engineCtx = (injected as { ctx?: unknown }).ctx as
    | (Record<string, unknown> & { get?: (name: string) => unknown })
    | undefined
  if (engineCtx === undefined || typeof engineCtx !== 'object') {
    throw new Error('the injected engine carries no context (Service.ctx missing)')
  }
  const resolveService = (name: string): unknown => {
    try {
      const value = engineCtx[name]
      if (value !== undefined) return value
    } catch {
      // Property access is isolate-guarded on cordis contexts; the explicit
      // resolution API below is not.
    }
    return typeof engineCtx.get === 'function' ? engineCtx.get(name) : undefined
  }
  const subagents = resolveService('subagents')
  const holder = {
    subagents: subagents === null || typeof subagents !== 'object'
      ? subagents
      : labeledSubagents(subagents as object, outcomes, sessionLookupFor(resolveService)),
    ptcRuntime: resolveService('ptcRuntime'),
    sandboxPolicy: resolveService('sandboxPolicy'),
    workingDirectory: resolveService('workingDirectory'),
    events: resolveService('events'),
    logger: resolveService('logger'),
    reflect: { provide: () => {} },
  }
  return holder as unknown as Context
}

/** The published PTC engine's own DI marker (dsh-workflow-ptc `PtcWorkflowEngine.inject`). */
const PTC_ENGINE_INJECT = ['subagents', 'ptcRuntime', 'sandboxPolicy', 'workingDirectory']

/**
 * Whether the injected engine is the published PTC engine, recognized by its
 * own static DI marker on its constructor — deliberately not `instanceof`,
 * because the runtime and the plugin load the package as separate module
 * instances, and deliberately not bare constructor re-invocation, which would
 * also rebuild a test fake's class.
 */
function isPublishedPtcEngine(injected: object): boolean {
  const proto = Object.getPrototypeOf(injected) as object | null
  const Ctor = (proto === null ? undefined : (proto as { constructor?: unknown }).constructor) as unknown
  if (typeof Ctor !== 'function') return false
  const inject = (Ctor as { inject?: unknown }).inject
  return Array.isArray(inject)
    && inject.length === PTC_ENGINE_INJECT.length
    && PTC_ENGINE_INJECT.every((name, index) => inject[index] === name)
}

function buildTwin(
  injected: object,
  log: TeamEngineLog | undefined,
  outcomes: ChildOutcomeLog,
): WorkflowEngine | undefined {
  if (!isPublishedPtcEngine(injected)) return undefined
  const Ctor = Object.getPrototypeOf(injected)?.constructor
  try {
    const twin = new (Ctor as new (ctx: Context, config: Config) => WorkflowEngine)(
      twinContext(injected, outcomes),
      mirroredConfig(injected),
    )
    if (typeof twin.start === 'function') return twin
  } catch (error) {
    log?.warn(`team engine: the PTC engine twin could not be built on this context: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
  log?.warn('team engine: the PTC engine twin built without a start(); using the injected engine')
  return undefined
}

const twins = new WeakMap<object, WorkflowEngine>()

/**
 * The engine the plugin's runs execute on.
 *
 * When the runtime injected the published PTC engine, this is a twin of it
 * over a label-rewriting context view (cached per context — cordis may return
 * a derived view of the service per access, so the context, not the service
 * instance, is the stable identity); otherwise the injected engine is returned
 * unchanged, because the label rewrite is defined against the PTC host's
 * `startActivation` call and cannot be presumed elsewhere. Every fallback is
 * announced through `log` once per context, so a silently degraded display
 * name is observable in the log alone.
 * @param ctx - the plugin's runtime context; its `workflowEngine` is the contract.
 * @param log - optional host logger for the fallback announcements.
 * @returns the engine to start runs on.
 */
export function teamWorkflowEngine(ctx: Context, log?: TeamEngineLog): WorkflowEngine {
  const injected = (ctx as { workflowEngine?: unknown }).workflowEngine
  if (injected === null || typeof injected !== 'object'
    || typeof (injected as WorkflowEngine).start !== 'function') {
    return injected as WorkflowEngine
  }
  const cached = twins.get(ctx as object)
  if (cached !== undefined) return cached
  let engine = injected as WorkflowEngine
  if (isPublishedPtcEngine(injected as object)) {
    const twin = buildTwin(injected as object, log, childOutcomeLog(ctx))
    if (twin !== undefined) engine = twin
  } else {
    const Ctor = Object.getPrototypeOf(injected as object)?.constructor as { name?: string } | undefined
    log?.warn(`team engine: the injected workflowEngine is not the published PTC engine (constructor ${Ctor?.name ?? 'unknown'}); child labels stay engine-generated`)
  }
  twins.set(ctx as object, engine)
  return engine
}

/** The one method of the host logger the seam needs. */
export interface TeamEngineLog {
  warn(message: string): unknown
}

const outcomeLogs = new WeakMap<object, ChildOutcomeLog>()

/**
 * The child-outcome log this context's engine writes into.
 *
 * One log per context, created on first use and shared by the twin and the run
 * that drives it: `mark()` before a run and `since(mark)` after it are what make
 * the evidence per-run without giving every run its own engine. A context whose
 * engine the plugin does not decorate (a non-PTC engine, a bare unit-test
 * context) gets an empty log, so `since()` answers "no evidence" rather than
 * "nothing happened".
 * @param ctx - the plugin's runtime context, the same object passed to `teamWorkflowEngine`.
 * @returns The context's child-outcome log.
 */
export function childOutcomeLog(ctx: Context): ChildOutcomeLog {
  const key = ctx as object
  if (key === null || typeof key !== 'object') return emptyChildOutcomeLog()
  const cached = outcomeLogs.get(key)
  if (cached !== undefined) return cached
  const created = createChildOutcomeLog()
  outcomeLogs.set(key, created)
  return created
}

/**
 * The cause phrase for one child, as the memory archive needs it: `undefined` when
 * this run recorded nothing for that child.
 * @param log - the context's child-outcome log.
 * @param childId - the child session id the engine reported.
 * @returns A bounded one-line cause, or `undefined`.
 */
export function childOutcomeCause(log: ChildOutcomeLog, childId: string | undefined): string | undefined {
  if (childId === undefined) return undefined
  const outcome: ChildOutcome | undefined = log.of(childId)
  return outcome === undefined ? undefined : childStopPhrase(outcome)
}
