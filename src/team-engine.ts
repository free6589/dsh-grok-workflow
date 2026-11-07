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

/** Code points a derived child label may occupy — the guest's own defaultLabel rule. */
export const CHILD_LABEL_LIMIT = 48

const LABEL_ELLIPSIS = '…'

/** The activation-spec slice the rewrite reads and rewrites (structural, untrusted shape). */
export interface ActivationSpecView {
  label: string
  request: { prompt?: readonly { type?: string, text?: string }[] }
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
  const blocks = spec.request === undefined ? undefined : spec.request.prompt
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

/**
 * A view of the subagent seam whose `startActivation` rewrites each child's
 * label; every other member reaches the real service. The real service object
 * is never mutated.
 */
function labeledSubagents(subagents: object): object {
  return new Proxy(subagents, {
    get(target, property, receiver) {
      if (property === 'startActivation') {
        const start = Reflect.get(target, property, receiver) as StartActivation
        return async (spec: ActivationSpecView) => start.call(target, rewriteActivationLabel(spec))
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
function twinContext(injected: object): Context {
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
      : labeledSubagents(subagents as object),
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
): WorkflowEngine | undefined {
  if (!isPublishedPtcEngine(injected)) return undefined
  const Ctor = Object.getPrototypeOf(injected)?.constructor
  try {
    const twin = new (Ctor as new (ctx: Context, config: Config) => WorkflowEngine)(
      twinContext(injected),
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
    const twin = buildTwin(injected as object, log)
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
