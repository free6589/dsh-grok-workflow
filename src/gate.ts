/**
 * Mandatory-entry gate.
 *
 * Requirement: every top-level user message goes through the full workflow and
 * the main model cannot answer on its own.
 *
 * Mechanism, verified against DSH 0.2.1-rc.2:
 * - `agent/pre-step` is dispatched before every model request, including
 *   tool-continuation steps, so it is the only unavoidable admission point.
 * - `{kind:'reject'}` is the only decision that reliably produces zero model
 *   calls; `{kind:'enter', messages: []}` still issues a request because other
 *   listeners inject context into any `enter` decision.
 * - A rejected batch never becomes a `user/message` event, so this plugin keeps
 *   its own delivery records and delivers the validated report afterwards.
 *
 * The gate fails closed: when it cannot run the workflow it still refuses the
 * step and states the reason, because passing the message through would let the
 * main model answer directly.
 *
 * Three answer strategies, all fail-closed:
 * - `in-turn` (**default**): await the run inside this listener, then `enter`
 *   the step with the report, so the main model finalises it while the turn is
 *   still open. The only strategy that survives a one-shot app: with `relay`
 *   and `append` the run continues after the turn closes `blocked`, and a
 *   one-shot process tears the agent tree down at that moment (G-18/F9), which
 *   loses the answer and breaks R-001. Measured end to end with this plugin's own
 *   strategy (t25: exit 0 with the report vs exit 1 and no output for `relay`).
 * - `relay`: return `reject`, run in the background, deliver in a new turn.
 *   Needs a long-lived app to keep the tree alive; not measurable in headless
 *   one-shot mode (NR-1).
 * - `append`: like `relay`, but writes into the closed turn (`surfaceOp:'append'`);
 *   degraded, no stream and no usage accounting (NR-3).
 *
 * Only `relay`/`append` use the per-agent queue, because only they can have several
 * runs in flight for one agent. `in-turn` is already serialized by the loop (one step
 * at a time) and keeps its own bound through `maxActiveRuns`.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import type { Session } from '@deepseek-ai/dsh-session'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { noticeEnterText, noticeText, relayText, RELAY_SOURCE_KIND } from './answer.js'
import { collectHistory, composeObjective } from './history.js'
import { TASK_LIMITS } from './input.js'
import { alreadyRouted, deliveryKey, recordDelivery } from './records.js'
import type { DeliveryPhase } from './records.js'
import { redactError } from './redact.js'
import type { ActiveState, RunOutcome, WorkflowLogger } from './run.js'
import { runWorkflow } from './run.js'
import type { ResolvedConfig, WorkflowReport } from './types.js'

/** Payload shape of one `agent/pre-step` dispatch. */
export interface PreStepPayload {
  agent: Agent
  messages: UserMessage[]
  turn: number
  step: number
  signal: AbortSignal
}

/** Dependencies of the gate. */
export interface GateDeps {
  ctx: Context
  config: ResolvedConfig
  state: ActiveState
  logger: WorkflowLogger
}

/** One admitted batch, as carried through the gate. */
interface GateEntry {
  key: string
  agentId: string
  messageIds: string[]
  turn: number
  /** Step that owned the rejected batch; used only by the append strategy. */
  step?: number
}

/** One agent's serialized gate work. */
interface AgentQueue {
  /** Tail of the per-agent chain; each admitted batch waits for the previous one. */
  tail: Promise<void>
  /** Batches admitted but not finished. */
  queued: number
}

/** Verdict for one claimed batch. */
type Classification =
  | { kind: 'pass'; reason: string }
  | { kind: 'admit'; agent: Agent; agentId: string; key: string; request: string; turn: number }

/**
 * Workflow answer for one admitted batch, before a transport is chosen.
 *
 * `report` and `notice` are kept apart because they are not interchangeable: a
 * report means a run happened and the batch is claimed for good, while a notice
 * means nothing ran and the batch must stay routable.
 */
type Answer =
  | { kind: 'report'; report: WorkflowReport; outcome: string }
  | { kind: 'notice'; reason: string; outcome: string }

/** Plain text of one user message. */
function textOf(message: UserMessage): string {
  const parts: string[] = []
  for (const block of message.content) {
    if (typeof block !== 'object' || block === null) continue
    const candidate = block as { type?: unknown; text?: unknown }
    if (candidate.type !== 'text' || typeof candidate.text !== 'string') continue
    parts.push(candidate.text)
  }
  return parts.join('\n').trim()
}

/** Session of an agent, when the runtime exposes one. */
function sessionOf(agent: Agent): Session | undefined {
  return agent.session
}

/** Stable identity used in delivery keys and queue keys. */
function agentIdOf(agent: Agent): string {
  const session = sessionOf(agent)
  const id = session === undefined ? undefined : String(session.id)
  return id === undefined || id === '' ? 'unknown-agent' : id
}

/**
 * Decide what to do with one claimed batch.
 *
 * Classification reads `payload.messages` only: `decision.messages` is appended
 * to by other listeners, so it cannot identify a new user message.
 */
export function classifyPreStep(
  deps: Pick<GateDeps, 'config'>,
  payload: PreStepPayload,
): Classification {
  const messages = Array.isArray(payload.messages) ? payload.messages : []
  // Tool continuation or wake: nothing was claimed, so no run may start.
  if (messages.length === 0) return { kind: 'pass', reason: 'empty-batch' }
  const userMessages = messages.filter(message => {
    const source = message.source as { kind?: unknown } | undefined
    return source?.kind === 'user'
  })
  // Context, notices and this plugin's own relay report: never a user request.
  if (userMessages.length === 0) return { kind: 'pass', reason: 'non-user-source' }
  const agent = payload.agent
  const session = sessionOf(agent)
  const header = session?.header
  const depth = header?.delegationDepth ?? 0
  if (header?.origin === 'subagent' || depth > 0) return { kind: 'pass', reason: 'subagent' }
  // U-7: an external plugin cannot register into a preset, so `preset` scope is
  // expressed as an allow-list on the session header. Sessions outside the named
  // preset keep their ordinary behaviour.
  if (deps.config.gateScope === 'preset' && header?.agentPreset !== deps.config.gatePreset) {
    return { kind: 'pass', reason: 'out-of-scope' }
  }
  const agentId = agentIdOf(agent)
  const key = deliveryKey(agentId, userMessages)
  // One user message must start at most one workflow, across restarts and forks.
  if (alreadyRouted(session, key)) return { kind: 'pass', reason: 'already-routed' }
  const request = userMessages.map(textOf).filter(text => text !== '').join('\n\n')
  return { kind: 'admit', agent, agentId, key, request, turn: payload.turn }
}

/**
 * Deliver the answer in a new turn owned by the plugin (strategy `relay`).
 *
 * The message carries this plugin's source kind, so the gate recognises its own
 * answer on the next turn and never routes it again.
 */
async function deliverRelay(agent: Agent, text: string): Promise<boolean> {
  try {
    await agent.whenIdle()
  } catch {
    // A disposed agent cannot accept delivery; the failure is recorded by the caller.
  }
  try {
    const message = createUserMessage({
      content: [{ type: 'text', text }],
      source: { kind: RELAY_SOURCE_KIND },
    })
    agent.followup(message)
    return true
  } catch {
    return false
  }
}

/**
 * Deliver the answer by writing it into the closed turn (strategy `append`).
 *
 * Degraded and experimental: no stream, no usage accounting, and the turn still
 * ends `blocked`, so a one-shot app reports a non-zero exit. The write happens
 * only after the turn closed, because a write during the turn races the loop's
 * own step messages and loses. The turn-order case is not measured yet (NR-3).
 */
async function deliverAppend(
  agent: Agent,
  text: string,
  turn: number,
  step: number,
): Promise<boolean> {
  try {
    await agent.whenIdle()
  } catch {
    // See deliverRelay: a disposed agent cannot accept delivery.
  }
  const session = sessionOf(agent)
  if (session === undefined) return false
  try {
    // The user message is committed by this plugin: a rejected batch never
    // becomes a user/message event, so the report would otherwise be orphaned.
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text }],
      source: { kind: RELAY_SOURCE_KIND },
    }), { surfaceOp: 'append' })
    const options = agent.options ?? {}
    session.append('assistant/message', {
      turn,
      step,
      message: createAssistantMessage({
        content: [{ type: 'text', text }],
        source: {
          provider: options.provider ?? 'grok-workflow',
          model: options.model ?? 'workflow-report',
        },
      }),
      stream: [],
    }, { surfaceOp: 'append' })
    return true
  } catch {
    return false
  }
}

/** Install the gate; returns false when the runtime cannot host `agent/pre-step`. */
export function installGate(deps: GateDeps): boolean {
  const { ctx, config, state, logger } = deps
  const host = ctx as unknown as { on?: (event: string, handler: unknown) => () => void }
  const on = host.on
  if (typeof on !== 'function') {
    // Fail-open by default (a runtime without the hook cannot be policed), but a
    // deployment that promises mandatory entry sets gateRequired to turn this
    // silent degradation into a load-time error.
    if (config.gateRequired === true) {
      throw new Error('enforceGate requires the agent/pre-step hook, which this runtime does not expose (gateRequired is true)')
    }
    logger.warn('agent/pre-step is unavailable: mandatory entry is disabled in this runtime; set gateRequired to fail instead')
    return false
  }
  const queues = new Map<string, AgentQueue>()

  const record = (agent: Agent, entry: GateEntry, phase: DeliveryPhase, outcome: string): void => {
    recordDelivery(sessionOf(agent), {
      v: 1,
      key: entry.key,
      agentId: entry.agentId,
      messageIds: entry.messageIds,
      phase,
      turn: entry.turn,
      outcome,
    }, logger)
  }

  const entryOf = (verdict: Extract<Classification, { kind: 'admit' }>, payload: PreStepPayload): GateEntry => ({
    key: verdict.key,
    agentId: verdict.agentId,
    messageIds: payload.messages.map(message => String(message.id)).sort(),
    turn: verdict.turn,
    step: payload.step,
  })

  /**
   * Refusals that need no run at all.
   *
   * Both are stated to the user instead of letting the model answer, and neither
   * claims the batch (`failed`, not `delivered`), so a corrected message can
   * still be routed later.
   */
  const refusalOf = (
    verdict: Extract<Classification, { kind: 'admit' }>,
  ): { reason: string; outcome: string } | undefined => {
    if (verdict.request.trim() === '') {
      // An attachment-only or empty message has nothing to route: refuse it
      // explicitly instead of spending a full workflow run on an empty objective.
      return { reason: 'the message contains no text to route', outcome: 'empty-request' }
    }
    if (`Current request:\n${verdict.request}`.length > TASK_LIMITS.objectiveChars) {
      // Too large to route: refuse and say so instead of letting the model answer.
      return {
        reason: `the message is longer than the ${TASK_LIMITS.objectiveChars}-character workflow objective limit`,
        outcome: 'objective-too-long',
      }
    }
    return undefined
  }

  /**
   * Run the workflow for one admitted batch and produce its answer.
   *
   * Composes the objective here, not at admission: a queued follow-up must see
   * the answer the previous run just delivered, so history is read as late as
   * possible. Never throws — a run that cannot start becomes a notice.
   */
  const produceAnswer = async (
    agent: Agent,
    request: string,
    signal?: AbortSignal,
  ): Promise<Answer> => {
    const objective = composeObjective(
      collectHistory(sessionOf(agent), { turns: config.historyTurns, chars: config.historyChars }),
      request,
      TASK_LIMITS.objectiveChars,
    )
    if (objective === undefined) {
      return {
        kind: 'notice',
        reason: `the message is longer than the ${TASK_LIMITS.objectiveChars}-character workflow objective limit`,
        outcome: 'objective-too-long',
      }
    }
    let outcome: RunOutcome
    try {
      // The gate owns the user-visible answer, so failures become reports here;
      // only conditions that prevent starting at all reach the catch below.
      outcome = await runWorkflow({
        ctx, config, state, logger, agent, objective, failureMode: 'report',
        ...signal === undefined ? {} : { signals: [signal] },
      })
    } catch (error) {
      // Busy instance, unloaded plugin or an unbuildable request: state it, do not bypass.
      const reason = redactError(error)
      logger.warn(`gate could not start the workflow: ${reason}`)
      return { kind: 'notice', reason, outcome: 'start-failed' }
    }
    return {
      kind: 'report',
      report: outcome.report,
      outcome: outcome.ok ? outcome.report.status : (outcome.cause ?? 'failed'),
    }
  }

  /** User-visible text for one answer under one strategy. */
  const answerText = (answer: Answer, inTurn: boolean): string => {
    if (answer.kind === 'report') return relayText(answer.report)
    return inTurn ? noticeEnterText(answer.reason) : noticeText(answer.reason)
  }

  /**
   * Deliver one answer in a later turn and record the outcome; never throws.
   *
   * Only a real workflow report may mark the batch `delivered`: a notice means no
   * run happened, so the batch must stay routable (phase `failed`).
   */
  const deliverAndRecord = async (
    agent: Agent,
    entry: GateEntry,
    answer: Answer,
  ): Promise<void> => {
    const text = answerText(answer, false)
    const delivered = config.answerStrategy === 'append'
      ? await deliverAppend(agent, text, entry.turn, entry.step ?? 0)
      : await deliverRelay(agent, text)
    if (answer.kind === 'report' && delivered) {
      record(agent, entry, 'delivered', answer.outcome)
      return
    }
    record(agent, entry, 'failed', delivered ? answer.outcome : 'delivery-failed')
    if (!delivered) logger.warn(`gate could not deliver the workflow answer for ${entry.key}`)
  }

  /**
   * Admit one batch and answer it after the turn closes (`relay`/`append`).
   *
   * Kept separate so the listener itself stays total: this function may throw,
   * the listener turns any throw into a refusal (never a silent pass).
   */
  const admitInBackground = (
    verdict: Extract<Classification, { kind: 'admit' }>,
    payload: PreStepPayload,
  ): void => {
    const { agent } = verdict
    const entry = entryOf(verdict, payload)
    const refusal = refusalOf(verdict)
    if (refusal !== undefined) {
      record(agent, entry, 'failed', refusal.outcome)
      void deliverAndRecord(agent, entry, { kind: 'notice', reason: refusal.reason, outcome: refusal.outcome })
      return
    }
    const accepted = enqueue(verdict.agentId, async () => {
      await deliverAndRecord(agent, entry, await produceAnswer(agent, verdict.request))
    })
    if (accepted) {
      // Recorded only once the run is really queued: a refused batch must stay
      // routable, while an accepted one is claimed for good.
      record(agent, entry, 'started', 'admitted')
      return
    }
    logger.warn(`gate queue is full for ${verdict.agentId}: refusing ${verdict.key}`)
    record(agent, entry, 'failed', 'queue-full')
    // Never await delivery here: this listener runs inside the step driver and
    // `whenIdle()` cannot resolve until it returns.
    void deliverAndRecord(agent, entry, {
      kind: 'notice',
      reason: `this agent already has ${config.maxQueuedMessages} queued message(s) waiting for the workflow`,
      outcome: 'queue-full',
    })
  }

  /** The step message that carries the report into the open turn. */
  const enterMessage = (text: string): UserMessage => createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: RELAY_SOURCE_KIND },
  })

  /**
   * Answer inside the open step (`in-turn`).
   *
   * The turn stays open for the whole run, so the report is entered as the step's
   * message and the main model finalises it in the same turn. Cancellation stays
   * honest: the turn's own signal is passed into the run, and an aborted turn
   * returns `reject` instead of entering a step nobody will read. This path never
   * waits for `whenIdle()` — the turn is the thing that would go idle.
   */
  const answerInTurn = async (
    verdict: Extract<Classification, { kind: 'admit' }>,
    payload: PreStepPayload,
  ): Promise<PreStepDecision> => {
    const { agent } = verdict
    const entry = entryOf(verdict, payload)
    const signal = payload.signal
    const aborted = (): boolean => signal?.aborted === true
    const enter = (text: string): PreStepDecision => ({ kind: 'enter', messages: [enterMessage(text)] })
    if (aborted()) {
      record(agent, entry, 'failed', 'aborted')
      return { kind: 'reject' }
    }
    const refusal = refusalOf(verdict)
    if (refusal !== undefined) {
      record(agent, entry, 'failed', refusal.outcome)
      return enter(answerText({ kind: 'notice', reason: refusal.reason, outcome: refusal.outcome }, true))
    }
    // `started` before the wait: a crash inside the run must not leave the batch
    // routable, because the workflow may already have executed tool effects.
    record(agent, entry, 'started', 'admitted')
    const answer = await produceAnswer(agent, verdict.request, signal)
    if (aborted()) {
      // The turn was cancelled while the run was in flight: nobody will read an
      // entered step, and the run already stopped on the same signal.
      record(agent, entry, 'failed', 'aborted')
      return { kind: 'reject' }
    }
    record(agent, entry, answer.kind === 'report' ? 'delivered' : 'failed', answer.outcome)
    return enter(answerText(answer, true))
  }

  /** Serialize one agent's batches and bound the queue. */
  const enqueue = (agentId: string, task: () => Promise<void>): boolean => {
    const current = queues.get(agentId)
    if (current !== undefined && current.queued >= config.maxQueuedMessages) return false
    const queue: AgentQueue = current ?? { tail: Promise.resolve(), queued: 0 }
    queue.queued += 1
    queues.set(agentId, queue)
    queue.tail = queue.tail
      .then(task)
      .catch((error: unknown) => {
        logger.warn(`gate task failed: ${redactError(error)}`)
      })
      .finally(() => {
        queue.queued -= 1
        if (queue.queued === 0 && queues.get(agentId) === queue) queues.delete(agentId)
      })
    return true
  }

  const handle = async (payload: PreStepPayload, next: () => Promise<PreStepDecision>): Promise<PreStepDecision> => {
    let verdict: Classification
    try {
      verdict = classifyPreStep(deps, payload)
    } catch (error) {
      // Fail closed: an internal error must not turn into a direct model answer.
      logger.warn(`gate classification failed: ${redactError(error)}`)
      return { kind: 'reject' }
    }
    // Pass-through calls the next listener untouched: a foreign failure must
    // surface as that listener's failure, not as this gate's refusal.
    if (verdict.kind === 'pass') return next()
    if (config.answerStrategy === 'in-turn') {
      try {
        return await answerInTurn(verdict, payload)
      } catch (error) {
        // Totality with an answer: an internal failure is still stated, because a
        // plain refusal would leave a one-shot app with no user-visible output.
        const reason = redactError(error)
        logger.warn(`gate could not answer in-turn: ${reason}`)
        try {
          return { kind: 'enter', messages: [enterMessage(noticeEnterText(reason))] }
        } catch {
          return { kind: 'reject' }
        }
      }
    }
    try {
      admitInBackground(verdict, payload)
    } catch (error) {
      // Totality: a throw here would end the turn with an error and no answer.
      logger.warn(`gate could not admit the message: ${redactError(error)}`)
    }
    return { kind: 'reject' }
  }

  // Call through the context: cordis event registration is receiver-bound.
  host.on?.('agent/pre-step', handle)
  return true
}
