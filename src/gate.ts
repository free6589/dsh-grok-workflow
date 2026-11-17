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
 * - A rejected batch never becomes a `user/message` event. P0-1: `preStep()` takes
 *   the admitted batch out of the inbox (`inbox.claim`), and `step()` commits
 *   exactly `decision.messages` — so a decision that lists only this plugin's
 *   report deletes what the user typed, and no `session.append()` can be added on
 *   top of `enter.messages` without writing the same words twice. The two
 *   strategies therefore need two different writers: `in-turn` returns the claimed
 *   messages plus the report (the loop writes them), while `relay`/`append` reject
 *   the step, so the plugin commits the claimed message itself before delivering.
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
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Message, UserMessage } from '@deepseek-ai/dsh-llm'
import { readdirSync, readFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { acceptedEnterText, frontDeskText, noticeEnterText, noticeText, relayText, RELAY_SOURCE_KIND } from './answer.js'
import { carryoverBounds, carryoverForSession, inheritanceForSession } from './carryover.js'
import { humanConclusion } from './delivery/index.js'
import { collectHistory, composeObjective, renderHistory } from './history.js'
import { TASK_LIMITS } from './input.js'
import { inspectPrompt, refuseOversizePrompt } from './intake.js'
import { isModeEnabled, readModeRecord } from './mode.js'
import {
  alreadyRouted,
  appendAssistantInStep,
  appendInstantReceipt,
  deliveryKey,
  openStepOf,
  recordDelivery,
  recordTerminal,
} from './records.js'
import type { DeliveryPhase } from './records.js'
import { redactError, redactSecrets } from './redact.js'
import type { ActiveState, RunOutcome, WorkflowLogger } from './run.js'
import { runSingleCall, runWorkflow } from './run.js'
import { isLoopHeartbeat, scheduleServiceOf } from './loop.js'
import { createLoopBrakes } from './loop-brakes.js'
import type { LoopBrakeCode, LoopBrakePort } from './loop-brakes.js'
import {
  FIXED_HISTORY_CHARS, FIXED_HISTORY_TURNS, FIXED_INSTANT_RECEIPT, FIXED_MAX_QUEUED_MESSAGES,
  FIXED_SHOW_DIAGNOSTICS, FIXED_TRIAGE_ASK, FIXED_TRIAGE_FOLLOWUP_AS_FAST,
} from './config.js'
import {
  askLine, chatReply, classifyTriage, detectLanguage, expiredAskNote, firstAnswerFallback, firstAnswerPrompt,
  missingNote, recallFromPrior,
  recallPrompt, recalledNote, resolvePending, resumedRequest, sanitizeFirstAnswer, singleCallPrompt,
  tierNote, triageLine,
  unusedAskNote, RECALL_LIMITS,
} from './triage.js'
import type { PendingAsk, RecallHit, RecallMiss, RecallSource, TriageLang, TriageVerdict } from './triage.js'
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
  /**
   * Read the current configuration. Called at every decision so a settings edit
   * applies to the next admitted message; when absent the load-time snapshot is
   * used (tests and embeddings without a settings surface).
   */
  readConfig?: () => ResolvedConfig
  /**
   * The last configuration that validated. Delivery decisions fall back to it, so
   * a broken edit cannot silently undo an edit that had already taken effect.
   */
  lastGoodConfig?: () => ResolvedConfig
  /**
   * Where the memory files the look-up pass may read live.
   *
   * Defaults to `<cwd>/docs/knowledge` (the directory this plugin's own
   * `AGENTS.md` names as durable memory), or to `GROK_WORKFLOW_KNOWLEDGE_DIRS`
   * when that environment variable is set. Tests pass a temporary directory so
   * the pass is deterministic and never depends on the repository's own docs.
   */
  memoryDocRoots?: readonly string[]
  /**
   * Loop brakes for a Host heartbeat delivery.
   *
   * Omitted means "no driver is wired": a heartbeat still passes as
   * `loop-continuation`, but nothing is counted and no brake can trip. The composition
   * builds the real port in {@link installGate}; tests pass a stub to pin one brake
   * without a Schedule service.
   */
  loop?: LoopBrakePort
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
   * A heartbeat whose brakes tripped: the loop is stopped and the step is refused.
   * Its own verdict rather than a `pass` reason, because the caller has to delete the
   * stored Schedule row — a label would leave that work undone.
   */
  | { kind: 'loop-stop'; agentId: string; code: LoopBrakeCode; detail: string }

/**
 * Workflow answer for one admitted batch, before a transport is chosen.
 *
 * `report` and `notice` are kept apart because they are not interchangeable: a
 * report means a run happened and the batch is claimed for good, while a notice
 * means nothing ran and the batch must stay routable.
 */
type Answer =
  | {
    kind: 'report'
    report: WorkflowReport
    outcome: string
    /**
     * Front-desk lines (tier, greeting, notes) rendered above the human block.
     *
     * The plain-language summary is *not* part of this field any more: it is
     * composed by `renderHumanReport` inside `relayText`, so the header and the
     * body cannot drift into saying the same thing twice.
     */
    header?: string
    /** Reader's language, which picks the leading line of the bilingual block. */
    lang?: TriageLang
  }
  | {
    kind: 'direct'
    /** Text the front desk produced itself (chat answer, quick answer, question). */
    text: string
    outcome: string
  }
  | { kind: 'notice'; reason: string; outcome: string }

/** Plain text of one message, whatever wrote it. */
function textOfBlock(message: { content?: readonly unknown[] }): string {
  const parts: string[] = []
  for (const block of message.content ?? []) {
    if (typeof block !== 'object' || block === null) continue
    const candidate = block as { type?: unknown; text?: unknown }
    if (candidate.type !== 'text' || typeof candidate.text !== 'string') continue
    parts.push(candidate.text)
  }
  return parts.join('\n').trim()
}

/** Plain text of one user message. */
function textOf(message: UserMessage): string {
  return textOfBlock(message)
}

/** Durable messages of one session, tolerating a runtime that cannot list them. */
function messagesOf(session: Session | undefined): readonly Message[] {
  if (session === undefined || typeof session.deriveMessages !== 'function') return []
  try {
    return session.deriveMessages()
  } catch {
    return []
  }
}

/** Session of an agent, when the runtime exposes one. */
function sessionOf(agent: Agent): Session | undefined {
  return agent.session
}



/**
 * True when this run can answer live and deliver the team result later (B: 边聊边干).
 *
 * All-or-nothing: any failure here is a silent `false`, so the caller falls back
 * to `answerInTurn` and always produces a final answer.
 *
 * A one-shot run has no followup turn to deliver into: probing
 * `agent.whenIdle`/`followup` keeps this to genuinely interactive runs, so
 * @param agent - the agent that would deliver in the background.
 * @returns true only when `whenIdle` and `followup` are both functions and the
 *   session is present. Anything else (one-shot, followup unavailable) is a
 *   silent `false` and the caller falls back to `answerInTurn`.
 */
export function canBackgroundDeliver(agent: Agent): boolean {
  try {
    const candidate = agent as unknown as {
      whenIdle?: unknown
      followup?: unknown
      session?: unknown
    }
    if (typeof candidate.whenIdle !== 'function') return false
    if (typeof candidate.followup !== 'function') return false
    return sessionOf(agent) !== undefined
  } catch {
    return false
  }
}

/**
 * Bounded context snapshot the live first answer may read (history / carry-over /
 * memory, 2 000 characters; possibly empty).
 *
 * Failure-tolerant: any read error yields a shorter context (or an empty one)
 * rather than losing the first answer.
 */
function firstAnswerContext(
  session: Session | undefined,
  history: string,
): string {
  try {
    const carryover = carryoverForSession(session, {
      rounds: FIXED_HISTORY_TURNS,
      chars: FIXED_HISTORY_CHARS,
    }).digest
    let memory = ''
    try {
      memory = readMemoryDocs(memoryDocRoots(), RECALL_LIMITS)
        .map(doc => `${doc.path}: ${doc.text}`)
        .join('\n')
    } catch {
      memory = ''
    }
    return [history, carryover, memory]
      .map(part => part.trim())
      .filter(part => part !== '')
      .join('\n\n')
      .slice(0, 2_000)
  } catch {
    return ''
  }
}

/**
 * One live first answer for a team message.
 *
 * The call is intentionally decoupled from the background start: a slow or
 * failed first answer never blocks the workflow run — the failure path still
 * enters a plainly-labelled template fallback, so the first visible line always
 * says what it is. The live text is scrubbed the way the delivery side scrubs
 * its human block (drop ledger lines, strip machine detail).
 *
 * `call` is injected so the module stays testable without an engine; production
 * wires it to one `runSingleCall` (`label: 'first-answer'`, `triageModel` route).
 *
 * @param agent - owning agent (kept for call-site symmetry; unused by the helper itself).
 * @param request - the user original.
 * @param history - bounded context snapshot, possibly empty.
 * @param tier - the team verdict (language only; never the tier sentence itself).
 * @param call - the one first-answer call; absent means "no live text".
 * @returns the first-answer text (live or template fallback, never empty).
 */
export async function produceFirstAnswer(
  agent: Agent,
  request: string,
  history: string | undefined,
  tier: TriageVerdict,
  call?: (prompt: string) => Promise<{ ok: true, text: string } | { ok: false, reason: string }>,
): Promise<string> {
  void agent
  let raw = ''
  try {
    const outcome = call === undefined
      ? undefined
      : await call(firstAnswerPrompt(request, history ?? '', tier.lang))
    if (outcome !== undefined && outcome.ok) raw = sanitizeFirstAnswer(outcome.text)
  } catch {
    raw = ''
  }
  if (raw.trim() !== '') return raw
  return firstAnswerFallback(tier.lang, request)
}

/* ------------------------------------------------- look up, then ask ------ */

/**
 * Directories the look-up pass reads memory files from.
 *
 * The default is the workspace's own `docs/knowledge` — the directory this
 * plugin's `AGENTS.md` defines as durable memory — so an installation that keeps
 * that convention gets the behaviour with no configuration at all.
 * `GROK_WORKFLOW_KNOWLEDGE_DIRS` (path-delimiter separated) replaces it for
 * installations that keep memory somewhere else.
 *
 * @param env - process environment (injected for tests).
 * @param cwd - working directory the default root is resolved against.
 * @returns absolute or cwd-relative roots, in the order they are read.
 */
export function memoryDocRoots(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string[] {
  const configured = (env.GROK_WORKFLOW_KNOWLEDGE_DIRS ?? '').trim()
  if (configured !== '') {
    return configured.split(delimiter).map(entry => entry.trim()).filter(entry => entry !== '')
  }
  return [join(cwd, 'docs', 'knowledge')]
}

/** One memory file read from disk; `text` is already redacted and bounded. */
export interface MemoryDoc {
  path: string
  text: string
}

/**
 * Read the markdown memory files under the given roots.
 *
 * Read-only, bounded, and never fatal: a missing directory, an unreadable file
 * or a permissions error skips that entry, because a look-up that cannot read is
 * a look-up that found nothing — not a failed turn. Files are sorted by name so
 * the same directory always yields the same material, and every body passes
 * `redactSecrets` before it can reach a prompt or an answer.
 *
 * @param roots - directories to read (see {@link memoryDocRoots}).
 * @param bounds - file count and character bounds.
 * @returns the files that could be read, in deterministic order.
 */
export function readMemoryDocs(
  roots: readonly string[],
  bounds: { files: number, fileChars: number, totalChars: number } = RECALL_LIMITS,
): MemoryDoc[] {
  const docs: MemoryDoc[] = []
  let spent = 0
  for (const root of roots) {
    let names: string[]
    try {
      names = readdirSync(root, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
        .map(entry => entry.name)
        .sort()
    } catch {
      continue
    }
    for (const name of names) {
      if (docs.length >= bounds.files || spent >= bounds.totalChars) return docs
      let raw = ''
      try {
        raw = readFileSync(join(root, name), 'utf8')
      } catch {
        continue
      }
      const body = redactSecrets(raw)
      const kept = body.length > bounds.fileChars ? `${body.slice(0, bounds.fileChars)}…` : body
      if (kept.trim() === '') continue
      docs.push({ path: join(root, name), text: kept })
      spent += kept.length
    }
  }
  return docs
}

/**
 * Everything one look-up pass may answer from, in the order it is trusted.
 *
 * Only existing material is read — the durable conversation, the validated
 * reports this plugin already wrote into it, and the memory files already on
 * disk. Nothing is created, archived or written here: this is a read of what the
 * session has, which is exactly what makes "answer from history" honest.
 *
 * The message being answered is excluded: both answer strategies publish the
 * claimed batch before the answer is produced (P0-5), so the session already
 * contains the very words being classified — and a look-up that matched them
 * would "find" the message in itself and answer every question with the question.
 *
 * @param session - the session that owns the message; `undefined` is legal.
 * @param roots - memory directories to read.
 * @param exclude - text of the message being answered, dropped from the material.
 * @returns bounded sources; empty when nothing exists yet.
 */
export function collectRecallSources(
  session: Session | undefined,
  roots: readonly string[],
  exclude = '',
): RecallSource[] {
  const sources: RecallSource[] = []
  const wanted = exclude.trim()
  const messages = messagesOf(session)
  const prior = wanted === '' ? messages : messages.filter(message => textOfBlock(message).trim() !== wanted)
  const history = renderHistory(prior, { turns: RECALL_LIMITS.turns, chars: RECALL_LIMITS.historyChars })
  if (history.trim() !== '') sources.push({ kind: 'history', locator: 'conversation so far', text: history })
  // The reports this plugin wrote for earlier rounds are excluded from
  // `collectHistory` (they are plugin messages, not user speech) — and they are
  // precisely where a round's research results live. The same compiled digest the
  // run already uses is read here, read-only and bounded, so a follow-up about an
  // earlier round is answerable from it.
  const carryover = carryoverForSession(session, { rounds: RECALL_LIMITS.rounds, chars: RECALL_LIMITS.digestChars })
  if (carryover.digest.trim() !== '') {
    sources.push({ kind: 'history', locator: `earlier rounds in this session (${carryover.rounds})`, text: carryover.digest })
  }
  for (const doc of readMemoryDocs(roots)) sources.push({ kind: 'memory', locator: doc.path, text: doc.text })
  return sources.slice(0, RECALL_LIMITS.sources)
}

/**
 * The messages an `enter` decision still owes after the batch was published.
 *
 * P0-5: `in-turn` writes the claimed batch itself before the run, so the decision
 * must not carry it again — `AgentLoop.step()` appends every non-runtime-context
 * entry of `decision.messages` as a `user/message` event, and the session has no
 * id-based dedupe, so keeping the batch here would render the user's words twice.
 * Runtime context (and anything else a downstream listener added) stays.
 */
function withoutClaimed(base: readonly UserMessage[], claimed: readonly UserMessage[]): UserMessage[] {
  const claimedIds = new Set(claimed.map(message => message.id))
  return base.filter(message => !claimedIds.has(message.id))
}

/** Stable identity used in delivery keys and queue keys. */
function agentIdOf(agent: Agent): string {
  const session = sessionOf(agent)
  const id = session === undefined ? undefined : String(session.id)
  return id === undefined || id === '' ? 'unknown-agent' : id
}

/**
 * Read the configuration for one classification, degrading to the load-time
 * snapshot when the live values do not validate.
 */
function readScope(deps: Pick<GateDeps, 'config' | 'readConfig'>): ResolvedConfig {
  if (deps.readConfig === undefined) return deps.config
  try {
    return deps.readConfig()
  } catch {
    return deps.config
  }
}

/**
 * Decide what to do with one claimed batch.
 *
 * Classification reads `payload.messages` only: `decision.messages` is appended
 * to by other listeners, so it cannot identify a new user message.
 */
export function classifyPreStep(
  deps: Pick<GateDeps, 'config' | 'readConfig' | 'loop'>,
  payload: PreStepPayload,
): Classification {
  const messages = Array.isArray(payload.messages) ? payload.messages : []
  // Tool continuation or wake: nothing was claimed, so no run may start.
  if (messages.length === 0) return { kind: 'pass', reason: 'empty-batch' }
  // A Host heartbeat is the one non-user message this gate knows how to route: it
  // continues the session's own work and must never be read as a request, and it is
  // the only place the loop's brakes can run — the delivery is the driver's whole
  // clock. Placed before the source filter, which would otherwise swallow it as
  // `non-user-source` and let the turn run with no stop condition at all.
  const heartbeat = messages.find(message => isHeartbeatMessage(message))
  if (heartbeat !== undefined) return classifyHeartbeat(deps, payload)
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
  // T4: the gate is always on for every session (gateScope/gatePreset removed).
  // The config default comes from the same live scope an edit updates, so a
  // settings edit is honored; placed here so the more specific pass reasons
  // above keep their labels.
  if (!isModeEnabled(session, readScope(deps).grokDefault === 'on')) {
    return { kind: 'pass', reason: 'mode-off' }
  }
  const agentId = agentIdOf(agent)
  const key = deliveryKey(agentId, userMessages)
  // One user message must start at most one workflow, across restarts and forks.
  if (alreadyRouted(session, key)) return { kind: 'pass', reason: 'already-routed' }
  const request = userMessages.map(textOf).filter(text => text !== '').join('\n\n')
  return { kind: 'admit', agent, agentId, key, request, turn: payload.turn }
}

/**
 * True when this message is a loop heartbeat delivered by the Host.
 *
 * Two facts have to agree: the delivery source (`schedule`) and the ownership marker
 * this plugin writes into every prompt it creates. Either alone is spoofable — a user
 * can paste the marker, and a scheduled reminder can carry arbitrary text — so the pair
 * is what identifies the heartbeat.
 */
function isHeartbeatMessage(message: UserMessage): boolean {
  const source = message.source as { kind?: unknown } | undefined
  if (source?.kind !== 'schedule') return false
  return isLoopHeartbeat(textOf(message))
}

/**
 * Route one heartbeat: continuation, or a stop that spends nothing.
 *
 * The continuation branch starts **no** run — the heartbeat turn is the session's own
 * ordinary turn — so `maxConcurrency` and `maxRetries` are untouched by construction;
 * this path can never add a second in-flight workflow. A tripped brake is answered with
 * `reject`, the one decision that produces zero model calls, and the stored Schedule row
 * is deleted by the caller so the heartbeat cannot arrive again.
 */
function classifyHeartbeat(
  deps: Pick<GateDeps, 'config' | 'readConfig' | 'loop'>,
  payload: PreStepPayload,
): Classification {
  const session = sessionOf(payload.agent)
  // A delegated child never owns a loop: Schedule targets the session the user opened,
  // so a heartbeat here is a mis-targeted delivery, and charging it would put the
  // parent's accounting into the child's log.
  const header = session?.header
  if (header?.origin === 'subagent' || (header?.delegationDepth ?? 0) > 0) return { kind: 'pass', reason: 'subagent' }
  const agentId = agentIdOf(payload.agent)
  if (deps.loop === undefined) return { kind: 'pass', reason: 'loop-continuation' }
  const input = {
    sessionId: agentId,
    session,
    config: readScope(deps),
  }
  const verdict = deps.loop.review(input)
  if (verdict.kind === 'stop') {
    return { kind: 'loop-stop', agentId, code: verdict.code, detail: verdict.detail }
  }
  // Charged before the turn runs: an admitted round consumes a slot and may already
  // have spent quota even if the turn then crashes.
  deps.loop.admit(input)
  return { kind: 'pass', reason: 'loop-continuation' }
}

/**
 * The receipt a `full`-mode turn shows when the team runs behind it.
 *
 * It is the whole user-visible content of that turn, so it has to say three
 * things without them: the message was accepted (not answered), the report comes
 * as its own message, and sending more meanwhile is expected rather than lost.
 *
 * @param lang - the message's language.
 * @returns one short paragraph, never empty.
 */
export function acceptedReceipt(lang: TriageLang): string {
  if (lang === 'en') {
    return [
      'Accepted. This message is running the full plan → execute → verify workflow now.',
      'The report arrives as its own message when the run finishes; you can keep sending meanwhile, and a new message starts its own run behind this one.',
    ].join(' ')
  }
  return [
    '已接单：这条消息正在按整套流程（拆解 → 执行 → 核验）运行。',
    '跑完会单独发一条结论给你；期间可以继续发消息，新消息会排在这次之后各自开工。',
  ].join('')
}

/**
 * User-visible terminal for a cancelled turn (P0-4).
 *
 * A cancellation that ends silently is indistinguishable from a hang, and the two
 * used to be exactly that. The text names the state, keeps the completed/partial
 * split honest, and never reads as success.
 *
 * The kept report is stated as a human conclusion (`humanConclusion`), never
 * relayed: `relayText` would wrap it in the success preamble, the
 * `REPORT_BEGIN/END` markers and the folded machine ledger, and a cancelled
 * turn must never wear the packaging of a finished run.
 *
 * @param reason - Optional measured reason; empty when there is none to state.
 * @param report - Report the run produced before it was stopped, when there is one.
 * @param opts - the user's language (T4: human block always on, diagnostics always off).
 */
export function cancelledText(
  reason: string,
  report?: WorkflowReport,
  opts: { lang?: TriageLang } = {},
): string {
  const verified = report?.tasks.filter(task => task.status === 'verified').length ?? 0
  const total = report?.tasks.length ?? 0
  const lines = report === undefined
    ? [
      '运行已取消（cancelled）：这条消息没有完成，也没有可交付的结果。',
      '没有可保留的核验报告；未完成的部分不再继续，要接着做请把任务重新发一次。',
    ]
    : [
      '运行已取消（cancelled）：工作流在全部任务完成前停止。',
      // R11: no task row means the run stopped before planning produced work
      // (a plan or deadline failure), so the honest count is "nothing started",
      // not `0/0` — a reader cannot parse that, and it reads as "nothing was
      // verified" rather than "nothing was ever started".
      total === 0
        ? '取消前还没有任何一项任务开工，所以没有核验结果；下方保留当时的结论，技术细节在进度节点里。总体状态仍为取消，不代表完成了什么。'
        : '取消前已有 ' + verified + '/' + total + ' 项任务核验通过；下方保留人话结论，技术细节在进度节点里。总体状态仍为取消，不代表全部完成。',
    ]
  const trimmed = reason.trim()
  if (trimmed !== '') lines.push('原因：' + trimmed)
  if (report !== undefined) {
    // Round 28: the kept report is stated as a human conclusion, not relayed.
    // `relayText` wraps the human block in the success preamble, the
    // `REPORT_BEGIN/END` markers and the folded machine ledger — that packaging
    // says "the workflow finished", which a cancelled turn must never claim.
    // The verified rows survive inside the conclusion text; the ledger stays in
    // the progress node, where it was already recorded.
    lines.push('', '取消前保留的工作流报告：', humanConclusion(report, {
      ...opts.lang === undefined ? {} : { lang: opts.lang },
    }))
  }
  return lines.join('\n')
}

/**
 * Plain-language head for a finished run (B plan, widened here).
 *
 * Kept as a named export so existing callers keep working; the composition itself
 * lives in `src/delivery/index.ts` (`humanConclusion`), which is the one module
 * that decides what a reader is told. This wrapper exists so the gate never grows
 * a second wording of its own — the drift that produced a PARTIAL answer opening
 * at `Grok workflow: PARTIAL` (session-4c562307).
 *
 * Deterministic on purpose: no model call, so engine call counts and the one-shot
 * budget are unchanged.
 *
 * T4: the human block is always on — `enabled` stays as a parameter so existing
 * callers keep compiling, but it is ignored.
 *
 * @param report - validated report.
 * @param lang - language of the user's request; picks which block leads.
 * @param enabled - ignored (always on).
 * @returns the head block.
 */
export function humanHead(report: WorkflowReport, lang: TriageLang, enabled: boolean): string | undefined {
  void enabled
  return humanConclusion(report, { lang: lang === 'en' ? 'en' : 'zh' })
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


/** Install the gate; returns false when the runtime cannot host `agent/pre-step`. */
export function installGate(deps: GateDeps): boolean {
  const { ctx, config, state, logger } = deps
  // Live configuration (DD-9 1-2): a settings edit is picked up by the next
  // admission, and never by work that already started. A broken edit refuses the
  // next message with its reason instead of half-applying, and delivery decisions
  // fall back to the last good snapshot so an in-flight answer still lands.
  let warnedLiveFailure = false
  const live = (): ResolvedConfig => deps.readConfig === undefined ? config : deps.readConfig()
  const fallback = (): ResolvedConfig => deps.lastGoodConfig === undefined ? config : deps.lastGoodConfig()
  const safe = (): ResolvedConfig => {
    try {
      return live()
    } catch (error) {
      // Not the load-time snapshot: an edit that already took effect must survive a
      // later invalid edit, so delivery falls back to the last good one (F1).
      if (!warnedLiveFailure) {
        warnedLiveFailure = true
        logger.warn(`configuration is invalid, keeping the last good snapshot: ${redactError(error)}`)
      }
      return fallback()
    }
  }
  const host = ctx as unknown as { on?: (event: string, handler: unknown) => () => void }
  const on = host.on
  if (typeof on !== 'function') {
    // T4: no gateRequired switch anymore — a runtime without the hook is always
    // fail-open with a warning, never a load error.
    logger.warn('agent/pre-step is unavailable: mandatory entry is disabled in this runtime')
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
    const refusal = inspectPrompt(verdict.request)
    if (refusal === undefined) return undefined
    // Empty and oversize are the two boundaries the intake pass owns: refuse
    // explicitly, with the measured count and the action that fixes it, instead of
    // letting the model answer a prompt the workflow was never given (P0-3).
    return { reason: refusal.text, outcome: refusal.code === 'empty' ? 'empty-request' : 'objective-too-long' }
  }

  /**
   * Sessions whose last message was the front desk's question (t52).
   *
   * Process-local and short-lived by design: the question is answered in the next
   * message of the same conversation, so a Map is the right lifetime. The TTL
   * stops a stale question from swallowing an unrelated message an hour later.
   *
   * P0-2: the entry keeps the request the question was about, not just a clock
   * reading. "简单" answered from a bare timestamp left the quick worker with one
   * word as its whole task, and nothing could tell it what to do. Persisting this
   * to disk is deliberately not done here: the in-memory Map is the same trust
   * boundary the session history already has, and a lost entry is recoverable by
   * asking the user (see {@link takePending}).
   */
  const pendingAsks = new Map<string, PendingAsk>()
  const PENDING_TTL_MS = 10 * 60_000

  /** A consumed pending question, and whether its TTL had already run out. */
  type PendingLookup = { kind: 'live', ask: PendingAsk } | { kind: 'expired', ask: PendingAsk }

  /**
   * Consume the pending question for one agent.
   *
   * The entry is removed either way: a question may be answered once, and an
   * expired one must not be re-consumed by the message after that.
   */
  const takePending = (agentId: string): PendingLookup | undefined => {
    const ask = pendingAsks.get(agentId)
    if (ask === undefined) return undefined
    pendingAsks.delete(agentId)
    return Date.now() - ask.askedAt <= PENDING_TTL_MS ? { kind: 'live', ask } : { kind: 'expired', ask }
  }

  /**
   * What the front desk remembers when a second question arrives unanswered (B04).
   *
   * The entry is overwritten by every question, so keeping only the newest request
   * threw the earlier one away: the user then answered "简单/团队" about two
   * requests and the run was handed one of them. Both are carried, joined line by
   * line, within the workflow objective budget the pair is later composed against.
   * The newest message is kept whole — it is what the user just typed — and the
   * earlier one is cut, with an ellipsis marking the cut, when the two together
   * would not fit.
   *
   * @param older - request the previous question asked about.
   * @param newer - request this question asks about.
   * @returns one request text for the shared pending entry.
   */
  const carriedPendingRequest = (older: string, newer: string): string => {
    const joined = `${older}\n${newer}`
    if (joined.length <= TASK_LIMITS.objectiveChars) return joined
    const room = TASK_LIMITS.objectiveChars - newer.length - '…\n'.length
    // `room <= 0` means the newest message alone already fills the budget; it is
    // the one that must survive, and it is admitted only at or below the limit.
    return room <= 0 ? newer : `${older.slice(0, room)}…\n${newer}`
  }

  /**
   * The request a worker is given after a confirmation answer, inside the budget (B08).
   *
   * {@link resumedRequest} quotes the original request verbatim and appends the
   * confirmation wording, so a request at (or near) the objective limit composed
   * one line over it: {@link composeObjective} then refused the run outright —
   * "longer than the 32000-character workflow objective limit" — after the pending
   * entry had already been consumed, which lost the task instead of running it.
   * The quote of the original request is cut to fit and the cut is marked; the
   * confirmation sentence itself is never dropped.
   *
   * @param verdict - the tier the answer selected (its language picks the wording).
   * @param originalRequest - the request the front-desk question was about.
   * @param answer - the user's confirmation message.
   * @returns the resumed request, never longer than `TASK_LIMITS.objectiveChars`.
   */
  const resumedTarget = (verdict: TriageVerdict, originalRequest: string, answer: string): string => {
    const limit = TASK_LIMITS.objectiveChars
    const composed = resumedRequest(verdict, originalRequest, answer)
    if (composed.length <= limit) return composed
    const marker = '…'
    // Measure the fixed wording of *this* verdict and confirmation, then give the
    // quote of the original request what is left.
    const room = limit - resumedRequest(verdict, '', answer).length - marker.length
    if (room >= 0) return resumedRequest(verdict, `${originalRequest.slice(0, room)}${marker}`, answer)
    // The confirmation message alone fills the budget (a padded message at the
    // limit): cut the quoted answer too, keeping the choice sentence intact.
    const answerRoom = Math.max(0, limit - resumedRequest(verdict, marker, '').length - marker.length)
    return resumedRequest(verdict, marker, `${answer.slice(0, answerRoom)}${marker}`)
  }

  /**
   * Run the workflow for one admitted batch and produce its answer.
   *
   * Composes the objective here, not at admission: a queued follow-up must see
   * the answer the previous run just delivered, so history is read as late as
   * possible. `history` overrides that read for `in-turn`, which publishes the
   * batch first and must not see it as prior conversation (P0-5). Never throws —
   * a run that cannot start becomes a notice.
   */
  const produceAnswer = async (
    agent: Agent,
    request: string,
    signal?: AbortSignal,
    history?: string,
  ): Promise<Answer> => {
    const limits = safe()
    // A session-level `/grok` record selects the workflow shape explicitly; the
    // deployment's `mode` only decides what a config-level default does. Without
    // this, `/grok` would promise the full workflow while the front desk quietly
    // answered from a template (t59 finding).
    const sessionShape = readModeRecord(agent.session)?.workflowMode
    const effectiveMode = sessionShape ?? limits.mode
    // Front desk (t52, plan C): the tier is decided per message, before any run
    // starts, and the decision is part of the answer text. `full` keeps the
    // pre-t52 behaviour byte for byte: no tier line, no greeting, no cheap call.
    if (effectiveMode !== 'full') {
      const agentId = agentIdOf(agent)
      // Consumed before classification: at most one message answers a question,
      // and an expired entry has to be stated rather than silently reused (P0-2).
      const pending = takePending(agentId)
      const live = pending?.kind === 'live' ? pending.ask : undefined
      // History-aware follow-up: reuse the in-turn snapshot when present; only
      // the relay/append path (history === undefined) reads it here.
      const histForTriage = history ?? collectHistory(sessionOf(agent), { turns: FIXED_HISTORY_TURNS, chars: FIXED_HISTORY_CHARS })
      const historyNonEmpty = histForTriage.trim() !== ''
      const tier0 = classifyTriage({
        text: request,
        mode: effectiveMode,
        ask: FIXED_TRIAGE_ASK,
        pending: live !== undefined,
        historyNonEmpty,
        followupAsFast: FIXED_TRIAGE_FOLLOWUP_AS_FAST,
      })
      // T4: classifier is always `rules` (hybrid model-call fallback removed).
      let tier = tier0
      // Look it up before asking (v0.5, `history_first_no_reask`).
      //
      // The failing session asked the user to repeat research results the
      // conversation already held. So the last step before a clarification
      // question goes out is a read: the conversation so far, the validated
      // reports of earlier rounds, and the memory files already on disk. A hit
      // re-decides the tier (still deterministic, still rules) and the material
      // answers; a miss leaves the question untouched and adds one line naming
      // what is missing. No source at all (a brand-new session) changes nothing,
      // so the first message of a fresh conversation is byte-identical.
      let recalled: RecallHit | undefined
      let missing: RecallMiss | undefined
      if (tier.tier === 'ask') {
        const roots = deps.memoryDocRoots ?? memoryDocRoots()
        const sources = collectRecallSources(sessionOf(agent), roots, request)
        const lookup = recallFromPrior({ text: request, sources })
        if (lookup.kind === 'hit') {
          recalled = lookup
          tier = classifyTriage({
            text: request,
            mode: effectiveMode,
            ask: FIXED_TRIAGE_ASK,
            pending: live !== undefined,
            historyNonEmpty,
            followupAsFast: FIXED_TRIAGE_FOLLOWUP_AS_FAST,
            prior: lookup,
          })
        } else if (sources.some(source => source.kind === 'history')) {
          // A session where the user has already said something: the question says
          // where the look-up went and what is missing. A session where nothing has
          // been said yet keeps the pre-existing question byte for byte — there is no
          // earlier wording to point at, so the original sentence is already honest.
          missing = lookup
        }
      }
      // A confirmation question that is gone must be visible: the front desk may
      // not guess what the user meant, and the user must know why nothing ran.
      const expired = pending?.kind === 'expired' ? expiredAskNote(tier.lang) : ''
      // A live question the user did not answer (they changed subject instead) is
      // void as well, and saying so is cheaper than a wrong guess.
      const unused = live !== undefined && resolvePending(request) === undefined && tier.reason !== 'pending-fast' && tier.reason !== 'pending-team'
        ? unusedAskNote(tier.lang)
        : ''
      const note = expired !== '' ? expired : unused
      const lead = note === '' ? [] : [note, '']
      // The request a worker is given: the user's words, resumed against the
      // request the question was about (P0-2). Without this the quick tier would
      // be handed "简单" and nothing else. Bounded by the objective limit, because
      // the resumed text is what the run is composed from (B08).
      const target = live === undefined || (tier.reason !== 'pending-fast' && tier.reason !== 'pending-team')
        ? request
        : resumedTarget(tier, live.originalRequest, request)
      if (tier.tier === 'ask') {
        // No run and no answer: the front desk asks, and the next message from
        // this session is read as the answer (takePending above). The question is
        // asked once, and it says where the look-up went and what is missing —
        // never "repeat what you said".
        pendingAsks.set(agentId, {
          // A question that replaces an unanswered one keeps both requests (B04):
          // the answer that finally arrives is the answer to both.
          originalRequest: live === undefined ? request : carriedPendingRequest(live.originalRequest, request),
          askedAt: Date.now(),
        })
        return {
          kind: 'direct',
          text: [...lead, triageLine(tier), '', askLine(tier.lang), ...missing === undefined ? [] : [missingNote(tier.lang, missing)]].join('\n'),
          outcome: 'triaged-ask',
        }
      }
      if (tier.tier === 'chat') {
        // Instant by construction: a template, not a call (see chatReply).
        return {
          kind: 'direct',
          text: [...lead, triageLine(tier), '', chatReply(tier, request), '', tierNote(tier)].join('\n'),
          outcome: 'triaged-chat',
        }
      }
      if (tier.tier === 'fast') {
        // Fast-path context (v0.5.1): a follow-up like "用人话告诉我刚才…" is
        // classified from history but the single worker used to receive only the
        // bare request — so it answered blind ("I am a single turn, I cannot
        // see the research above"). Hand it the same bounded conversation /
        // digest the recall pass already read: empty on a first message (prompt
        // stays byte-identical), bounded and redacted otherwise.
        const fastContext = recalled !== undefined
          ? [recalled.excerpt, `(${recalled.locators.join(' | ')})`].filter(part => part !== '').join('\n')
          : [histForTriage, carryoverForSession(sessionOf(agent), { rounds: FIXED_HISTORY_TURNS, chars: FIXED_HISTORY_CHARS }).digest]
            .map(part => part.trim()).filter(part => part !== '').join('\n\n').slice(0, 4000)
        const call = await runSingleCall({
          ctx, config: limits, state, logger, agent,
          prompt: recalled === undefined ? singleCallPrompt(tier, target, false, fastContext) : recallPrompt(tier, target, recalled),
          label: 'quick-worker',
          ...signal === undefined ? {} : { signals: [signal] },
        })
        if (!call.ok) {
          // State the failure; never upgrade a "quick" answer into a team run,
          // which would make the tier line a lie.
          return {
            kind: 'notice',
            reason: `${triageLine(tier)} — the ${tier.tier} tier could not answer: ${call.reason}`,
            outcome: 'front-desk-failed',
          }
        }
        return {
          kind: 'direct',
          text: [
            ...lead, triageLine(tier), '', call.text, '',
            ...recalled === undefined ? [] : [recalledNote(tier.lang, recalled)],
            tierNote(tier),
          ].join('\n'),
          outcome: recalled === undefined ? 'triaged-fast' : 'triaged-recalled',
        }
      }
      // Team tier, in-turn fallback: live receipt first so the run never looks
      // blank while in flight (pure addition; a failed append only costs the
      // receipt, never the run). The receipt is the live first answer (C: 现场写),
      // never the fixed template sentence.
      //
      // The row may only be attached to an open step (`openStepOf`): DSH's token
      // meter pairs every `assistant/message` with a `step/start`, and one unpaired
      // row makes every later replay throw, which is what stalls compaction and
      // breaks `/compact` for the rest of the session. `agent/pre-step` is
      // dispatched *before* the step opens, so on this runtime the row is refused —
      // and the model call that composes its text is then paid for nothing. Both
      // are skipped together, and the run's live progress reaches the user through
      // the `tool-workflow/*` node instead (`src/records.ts`, progress records).
      const receiptSession = sessionOf(agent)
      if (FIXED_INSTANT_RECEIPT && receiptSession !== undefined && openStepOf(receiptSession) !== undefined) {
        const context = firstAnswerContext(receiptSession, histForTriage)
        const fallback = await produceFirstAnswer(
          agent,
          target,
          context,
          tier,
          async prompt => runSingleCall({
            ctx, config: limits, state, logger, agent,
            prompt, label: 'first-answer',
          }),
        )
        const receipt = [...lead, triageLine(tier), fallback].filter(line => line !== '').join('\n')
        try {
          appendInstantReceipt(receiptSession, receipt, logger)
        } catch {
          // Receipt is best-effort by design.
        }
      }
      const answer = await runTeam(agent, target, signal, history, tier.lang)
      // The plain-language summary is no longer composed here: `relayText` calls
      // `renderHumanReport` for it, so this header carries only the front-desk
      // lines (tier, greeting, notes). Two composers printed the same conclusion
      // twice, and a status the header got wrong could not be corrected by the
      // body it sat above.
      const header = [...lead, triageLine(tier)].filter(line => line !== '').join('\n')
      return answer.kind === 'report' ? { ...answer, header, lang: tier.lang } : answer
    }
    return runTeam(agent, request, signal, history)
  }

  /**
   * The team tier: the pre-t52 workflow run, unchanged.
   *
   * Kept as its own function so the triage path above cannot accidentally change
   * what a full run does: it composes the objective as late as possible and turns
   * every failure into a report.
   */
  const runTeam = async (
    agent: Agent,
    request: string,
    signal?: AbortSignal,
    history?: string,
    lang?: TriageLang,
  ): Promise<Answer> => {
    // P0-5: `in-turn` publishes the claimed message before the run, so the caller
    // snapshots the history first and passes it here — otherwise the message the
    // user just typed would also appear as "conversation so far" and the objective
    // would carry it twice.
    // L1 inheritance (Q2, v0.13): the tasks an earlier round of this session already
    // verified are part of the objective itself, under their own 8K budget
    // (`INHERITANCE_LIMITS.chars`), so every child prompt that shows the objective —
    // planner, verifier, supervisor, synthesizer — reads the same "do not redo this"
    // decision instead of re-deriving it. `composeObjective` drops the oldest block
    // first when the objective budget is tight, so the inherited list survives a
    // long forwarded transcript.
    const objective = composeObjective(
      history ?? collectHistory(sessionOf(agent), { turns: FIXED_HISTORY_TURNS, chars: FIXED_HISTORY_CHARS }),
      request,
      TASK_LIMITS.objectiveChars,
      inheritanceForSession(sessionOf(agent)),
    )
    if (objective === undefined) {
      // Reached only after a message passed admission (a queued follow-up re-reads
      // the history late, which can push the composed objective over the budget).
      // Same refusal as the admission path, so the reader gets one rule, one
      // count and one next step in both languages.
      return {
        kind: 'notice',
        reason: refuseOversizePrompt(request.length).text,
        outcome: 'objective-too-long',
      }
    }
    let outcome: RunOutcome
    // Cross-round carry-over (v0.5). Every child agent of this round is fresh, so
    // the earlier rounds of this session are compiled into one bounded digest and
    // handed to the run: a follow-up is then answered from the earlier research
    // instead of asking the user to repeat what they already said. The digest is
    // read from the durable transcript (the validated reports this plugin wrote),
    // shares the configured history budget, and is empty on a first round.
    const carryover = carryoverForSession(sessionOf(agent), carryoverBounds({ historyTurns: FIXED_HISTORY_TURNS, historyChars: FIXED_HISTORY_CHARS }))
    if (carryover.digest !== '') {
      logger.info?.(`grok-workflow carry-over: ${carryover.rounds} earlier round(s), ${carryover.digest.length} chars`)
    }
    try {
      // The gate owns the user-visible answer, so failures become reports here;
      // only conditions that prevent starting at all reach the catch below.
      outcome = await runWorkflow({
        ctx, config: safe(), state, logger, agent, objective, failureMode: 'report',
        ...carryover.digest === '' ? {} : { carryover: carryover.digest },
        ...signal === undefined ? {} : { signals: [signal] },
      })
    } catch (error) {
      // Busy instance, unloaded plugin or an unbuildable request: state it, do not bypass.
      const reason = redactError(error)
      logger.warn(`gate could not start the workflow: ${reason}`)
      return { kind: 'notice', reason, outcome: 'start-failed' }
    }
    // B plan: `full` mode gets the same human block the front desk does —
    // `relayText` composes it from the report, so this path cannot hand the user
    // the machine ledger and nothing else (the user's own words for that were
    // "全是机器语言"). The language comes from the caller when a triage verdict
    // already measured it, and from the request otherwise.
    return {
      kind: 'report',
      report: outcome.report,
      outcome: outcome.ok ? outcome.report.status : (outcome.cause ?? 'failed'),
      lang: lang ?? detectLanguage(request),
    }
  }

  /**
   * User-visible text for one answer under one strategy.
   *
   * The `showDiagnostics` switch has to be passed here too: it was only wired into
   * the PTC `render` tool, so turning it on in the settings changed nothing about
   * the result the user actually receives. Default off, exactly as before — and
   * `humanSummary` rides along, because the plain-language block is composed
   * inside `relayText` and an opt-out has to reach it.
   */
  const answerText = (answer: Answer, inTurn: boolean): string => {
    if (answer.kind === 'report') {
      return relayText(answer.report, answer.header, {
        ...answer.lang === undefined ? {} : { lang: answer.lang },
        // Q11(c): the switch that decides whether the machine ledger rides inside
        // the relay or stays folded below it. Fixed off (T4), but consulted here —
        // this is the one place that composes the text the user actually receives.
        showDiagnostics: FIXED_SHOW_DIAGNOSTICS,
      })
    }
    if (answer.kind === 'direct') return frontDeskText(answer.text)
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
    // T4: only `in-turn` survives (`relay`/`append` removed): the turn that
    // admitted the batch also delivers it, via the plugin's own source message.
    const delivered = await deliverRelay(agent, text)
    // A `report` and a front-desk answer both settle the batch: the user has the
    // answer. Only a notice leaves it routable, because nothing was produced.
    if ((answer.kind === 'report' || answer.kind === 'direct') && delivered) {
      record(agent, entry, 'delivered', answer.outcome)
      return
    }
    record(agent, entry, 'failed', delivered ? answer.outcome : 'delivery-failed')
    if (!delivered) logger.warn(`gate could not deliver the workflow answer for ${entry.key}`)
  }

  /**
   * Write a claimed user message into the transcript (P0-1, P0-5).
   *
   * Two situations need this plugin as the writer:
   * - `relay` and `append` answer in a later turn, so they must return `reject`:
   *   the claimed batch is then never committed by the loop and the user's own
   *   words would disappear from the transcript.
   * - `in-turn` keeps the step open for the whole workflow, and the loop commits a
   *   claimed batch only when the step begins (`AgentLoop.step()`). Publishing
   *   before the wait is what makes the first message visible while the team runs;
   *   otherwise the transcript holds no `user/message` for the entire run (P0-5).
   *
   * The two writers must never touch the same message: `in-turn` excludes the
   * published batch from `enter.messages` (`withoutClaimed`), `relay`/`append`
   * reject the step. The message object is written unchanged — same id, same
   * source, same text and attachments — because a re-created "looks the same"
   * message would lose its identity and could be routed a second time.
   *
   * @returns true when the message is in the session surface.
   */
  const commitClaimed = (agent: Agent, claimed: readonly UserMessage[]): boolean => {
    const session = sessionOf(agent)
    if (session === undefined || claimed.length === 0) return false
    try {
      for (const message of claimed) session.append('user/message', message, { surfaceOp: 'append' })
      return true
    } catch (error) {
      // A session that refuses the write still gets the answer: losing the echo of
      // the question is bad, losing the answer as well would be worse.
      logger.warn(`gate could not keep the user message in the transcript: ${redactError(error)}`)
      return false
    }
  }

  /**
   * State a cancelled turn's terminal and keep what the user wrote (P0-1 + P0-4).
   *
   * A cancelled turn cannot be answered inside itself — the step is already gone,
   * so the decision has to be `reject`. That made cancellation lose the batch twice
   * over, which a real GUI session shows plainly: the message the user typed never
   * became a `user/message` event, and the stopped run left no reason in the
   * transcript. Because the step is rejected here, this plugin is the only writer,
   * so committing the claimed message cannot duplicate it: the original message
   * object is appended unchanged, then one assistant message carries the terminal.
   *
   * @param agent - Agent whose transcript keeps the batch.
   * @param payload - Rejected step whose batch is being committed.
   * @param text - User-visible terminal text; never a success sentence.
   * @param alreadySurfaced - The batch is already in the surface (P0-5 `in-turn`
   *   publishes it before the wait), so it must not be written a second time.
   * @returns true when the batch reached the session surface.
   */
  const commitCancelled = (
    agent: Agent,
    payload: PreStepPayload,
    text: string,
    alreadySurfaced = false,
  ): boolean => {
    const kept = alreadySurfaced ? true : commitClaimed(agent, payload.messages)
    const session = sessionOf(agent)
    if (session === undefined) return kept
    const options = agent.options ?? {}
    // `payload.step` is the step this pre-step *refused*, so it never opens: the
    // terminal cannot be attached to it without leaving an `assistant/message`
    // outside every `step/start`, which the token meter replays as a hard error and
    // which then stalls compaction and `/compact` for the rest of the session
    // (`openStepOf` in src/records.ts). The row is written only if some step is
    // open; otherwise the terminal survives as a durable record, so the reason and
    // any verified partial work are still readable from the session log.
    const written = appendAssistantInStep(
      session,
      text,
      {
        provider: options.provider ?? 'grok-workflow',
        model: options.model ?? 'workflow-report',
      },
      logger,
      'cancelled terminal',
    )
    if (!written) recordTerminal(session, text, logger)
    return kept
  }

  /**
   * Team tier on an interactive run (B: 边聊边干).
   *
   * triage-team + effectiveMode `triage` + background-deliverable agent: one
   * live first-answer call (label 'first-answer', `triageModel` route, history
   * snapshot taken before the first answer so the receipt cannot echo back as
   * history), entered into this turn (stepBase + withoutClaimed, P0-1/P0-5
   * semantics); the workflow is admitted behind it by reusing admitInBackground
   * (commitClaimed + enqueue + produceAnswer -> deliverAndRecord), whose
   * pre-step returns immediately with the first answer instead of awaiting the
   * workflow.
   *
   * Returns the `enter` decision with the first answer, or `undefined` when the
   * caller must keep the blocking path (full mode, one-shot/followup
   * unavailable, failed first answer with no downgrade, queue full): the
   * caller then falls back to answerInTurn's awaited run, which always produces
   * a final answer. Never throws: any internal failure is `undefined`
   * (fallback), never a lost answer.
   *
   * Cancellation / redirect reuse the existing machinery, no new bus: a new
   * message in the same session while a run is in flight cancels that run via
   * ActiveState.active/starting + run.cancel(reason) + dispose, then
   * commitCancelled + cancelledText lands the terminal; the narrowed rerun is
   * composed with carriedPendingRequest / resumedTarget (whole-round cancel +
   * narrow restart). V1 does no subtask-level directed cancel; alreadyRouted
   * stays the double-run guard; the per-agent enqueue path is reused as-is
   * (cancel/reject stays whole-queue: no task-level remove in V1).
   */
  const answerTeamInteractive = async (
    agent: Agent,
    admit: Extract<Classification, { kind: 'admit' }>,
    payload: PreStepPayload,
    base: readonly UserMessage[],
    history: string,
    opts: {
      enterAfter: (base: readonly UserMessage[], text: string, surfaced?: boolean) => PreStepDecision
      surfaced: boolean
      signal?: AbortSignal
    },
  ): Promise<PreStepDecision | undefined> => {
    try {
      const limits = safe()
      const sessionShape = readModeRecord(agent.session)?.workflowMode
      if ((sessionShape ?? limits.mode) !== 'triage') return undefined
      if (!canBackgroundDeliver(agent)) return undefined
      // The tier must actually be team: classify here from the same history
      // snapshot (cheap, deterministic); anything else is not this function's job.
      // Pending answers count: a bare '团队' reply to the front-desk question is
      // team only with pending:true (without it the same word is stale-choice
      // chat). takePending is consumed here (once), so the queued background run
      // below must NOT go through produceAnswer (which would take it again and
      // miss); it calls runTeam directly with the already-resumed target.
      const pending = takePending(admit.agentId)
      const live = pending?.kind === 'live' ? pending.ask : undefined
      const tier = classifyTriage({
        text: admit.request,
        mode: 'triage',
        ask: FIXED_TRIAGE_ASK,
        pending: live !== undefined,
        historyNonEmpty: history.trim() !== '',
        followupAsFast: FIXED_TRIAGE_FOLLOWUP_AS_FAST,
      })
      if (tier.tier !== 'team') {
        // Not ours: put the pending question back so the blocking path still
        // answers it (takePending consumed it above).
        if (pending !== undefined) pendingAsks.set(admit.agentId, pending.ask)
        return undefined
      }
      const target = live === undefined || (tier.reason !== 'pending-fast' && tier.reason !== 'pending-team')
        ? admit.request
        : resumedTarget(tier, live.originalRequest, admit.request)
      const context = firstAnswerContext(sessionOf(agent), history)
      let firstText = ''
      try {
        const call = await runSingleCall({
          ctx, config: safe(), state, logger, agent,
          prompt: firstAnswerPrompt(target, context, tier.lang),
          label: 'first-answer',
        })
        if (call.ok) firstText = sanitizeFirstAnswer(call.text)
      } catch {
        firstText = ''
      }
      const fellBack = firstText.trim() === ''
      const firstLine = fellBack ? firstAnswerFallback(tier.lang, target) : firstText
      const firstAnswer: Answer = {
        kind: 'direct',
        text: [triageLine(tier), '', firstLine].join('\n'),
        outcome: fellBack ? 'triaged-team-first-fallback' : 'triaged-team-first',
      }
      // Batch lifecycle: claim for good (started/admitted-team-background), then
      // the same background admission relay/append uses. enqueue is per-agent
      // serialized, so a newer message cancels/redirects through the same queue.
      const entry = entryOf(admit, payload)
      // Redirect-on-new-message (existing machinery, no new bus): if a newer
      // message for the same session arrives while this run is queued/running,
      // it cancels the in-flight run via the shared ActiveState (active run's
      // cancel + dispose, then commitCancelled + cancelledText lands the
      // terminal), and the narrowed rerun is composed with
      // carriedPendingRequest / resumedTarget (whole-round cancel + narrow
      // restart; V1 does no subtask-level directed cancel). alreadyRouted
      // stays the double-run guard. See handle()/answerInTurn abort paths and
      // run.ts disposeActiveState for the cancel side.
      record(agent, entry, 'started', 'admitted-team-background')
      const accepted = enqueue(admit.agentId, async () => {
        const lateHistory = collectHistory(
          sessionOf(agent),
          { turns: FIXED_HISTORY_TURNS, chars: FIXED_HISTORY_CHARS },
          entry.messageIds,
        )
        await deliverAndRecord(agent, entry, await runTeam(agent, target, undefined, lateHistory, tier.lang))
      })
      if (!accepted) return undefined
      return opts.enterAfter(base, answerText(firstAnswer, true), opts.surfaced)
    } catch (error) {
      logger.warn(`interactive team admission failed, falling back to in-turn: ${redactError(error)}`)
      return undefined
    }
  }

  /**
   * `full` mode on an interactive run: accept the message now, work behind it.
   *
   * `/grok on` writes `workflowMode: 'full'` (src/command.ts), which is the one
   * shape that skipped the interactive admission above and went straight to the
   * awaited run. `in-turn` keeps the step open for the whole run, and the loop
   * dispatches `agent/pre-step` for the next batch only after the current step
   * settles — so for the entire run (default deadline 60 minutes) every message
   * the user typed was accepted by the app and then never dispatched: the
   * transcript stayed silent and the composer looked broken. `/grok off` passed
   * messages through, which is exactly the reported contrast.
   *
   * This is the same admission the triage team path uses, minus the tier: `full`
   * has no front desk, so there is no tier line and no cheap first answer — the
   * receipt says what was accepted and that the report follows. The run keeps its
   * own bounds (`maxConcurrency`, `maxActiveRuns`, `maxRetries`) because it is the
   * same `runTeam`/`runWorkflow`; only the turn stops waiting for it.
   *
   * Only the *session* record (`/grok on`) takes this path. A deployment-level
   * `mode: 'full'` keeps T4 `in-turn` byte for byte: that shape is the documented
   * contract for a run that must finish inside its turn (and the 17 gate tests that
   * pin it), and changing it is its own decision, not a side effect of this fix.
   *
   * @returns the `enter` decision carrying the receipt, or `undefined` when the
   *   caller must keep the blocking path (config-level `full`, `triage` shape, a
   *   one-shot agent with no `followup`/`whenIdle`, or a full per-agent queue).
   *   Never throws.
   */
  const answerFullBehind = async (
    agent: Agent,
    admit: Extract<Classification, { kind: 'admit' }>,
    payload: PreStepPayload,
    base: readonly UserMessage[],
    opts: { enterAfter: (base: readonly UserMessage[], text: string, surfaced?: boolean) => PreStepDecision; surfaced: boolean },
  ): Promise<PreStepDecision | undefined> => {
    try {
      // The session record is the whole condition: `/grok on` writes
      // `workflowMode: 'full'`, and that record only exists where a `commands`
      // service is composed (an interactive UI). `limits.mode` — the deployment
      // default — deliberately does not reach here.
      if (readModeRecord(agent.session)?.workflowMode !== 'full') return undefined
      // A one-shot run has no later turn to deliver into: keep the blocking path.
      if (!canBackgroundDeliver(agent)) return undefined
      const entry = entryOf(admit, payload)
      const lang = detectLanguage(admit.request)
      const accepted = enqueue(admit.agentId, async () => {
        // Read history late and without this batch: a queued message must see the
        // answer the previous run just delivered, and must not read itself back.
        const lateHistory = collectHistory(
          sessionOf(agent),
          { turns: FIXED_HISTORY_TURNS, chars: FIXED_HISTORY_CHARS },
          entry.messageIds,
        )
        await deliverAndRecord(agent, entry, await runTeam(agent, admit.request, undefined, lateHistory, lang))
      })
      // `started` only once the batch is actually queued: `enqueue` schedules the task
      // on a later microtask, so this still lands before the run executes tool effects,
      // and a full queue — which falls back to the blocking path below — leaves no
      // record behind claiming a background run that never happened.
      if (!accepted) return undefined
      record(agent, entry, 'started', 'admitted-full-background')
      return opts.enterAfter(base, acceptedEnterText(acceptedReceipt(lang)), opts.surfaced)
    } catch (error) {
      logger.warn(`full-mode admission failed, falling back to in-turn: ${redactError(error)}`)
      return undefined
    }
  }

  /** The step message that carries the report into the open turn. */
  const enterMessage = (text: string): UserMessage => createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: RELAY_SOURCE_KIND },
  })

  /**
   * The messages one `enter` decision must carry (P0-1).
   *
   * `AgentLoop.preStep()` takes the admitted batch out of the inbox
   * (`inbox.claim`) and `step()` commits exactly `decision.messages` as
   * `user/message` events (`dsh-agent-loop/lib/index.js`, `step()`: every message
   * whose source is not `runtime-context` is appended). A decision that lists only
   * this plugin's report therefore *replaces* what the user typed: the batch was
   * already claimed, so the original message is never written and never appears in
   * `deriveMessages()` or in the GUI transcript. P0-1 is that defect.
   *
   * Calling `next()` yields the default decision (`[...claimed, runtimeContext]`),
   * so appending to it keeps the original message object — id, source, text and
   * attachments untouched — and cannot duplicate it either: `enter.messages` is the
   * only writer for a claimed batch, so a `session.append('user/message', …)` on top
   * of it would be a second copy of the same words.
   */
  const stepBase = async (
    payload: PreStepPayload,
    next: () => Promise<PreStepDecision>,
  ): Promise<UserMessage[] | undefined> => {
    try {
      const base = await next()
      // `undefined` means a downstream listener refused the step; the caller must
      // not enter a step that was refused, and the batch stays routable.
      if (base.kind === 'reject') return undefined
      // A listener that emptied the decision would drop the claimed message again,
      // so the claimed batch is the floor: what the user typed is never deleted.
      return base.messages.length > 0 ? [...base.messages] : [...payload.messages]
    } catch (error) {
      // A foreign listener's failure must not cost the user their own message.
      logger.warn(`gate kept the claimed messages after a pre-step failure: ${redactError(error)}`)
      return [...payload.messages]
    }
  }

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
    next: () => Promise<PreStepDecision>,
  ): Promise<PreStepDecision> => {
    const { agent } = verdict
    const entry = entryOf(verdict, payload)
    const signal = payload.signal
    const aborted = (): boolean => signal?.aborted === true
    /**
     * Enter the answer after the batch, never instead of it (P0-1).
     *
     * `surfaced` says this plugin already published the claimed batch to the
     * session surface (`publishClaimed` below), so the decision carries only what
     * is left — the report and any runtime context — and the user's words exist
     * exactly once. Without it the loop is the only writer and the batch must
     * stay in `messages`.
     */
    const enterAfter = (
      base: readonly UserMessage[],
      text: string,
      surfaced = false,
    ): PreStepDecision => ({
      kind: 'enter',
      messages: surfaced
        ? [...withoutClaimed(base, payload.messages), enterMessage(text)]
        : [...base, enterMessage(text)],
    })
    if (aborted()) {
      // Already cancelled when the message arrived: nothing ran, but the batch must
      // still survive the rejection and say why (P0-1 + P0-4).
      record(agent, entry, 'failed', 'aborted')
      commitCancelled(agent, payload, cancelledText('这条消息还没派工就被取消了，没有启动任何工人。'))
      return { kind: 'reject' }
    }
    const base = await stepBase(payload, next)
    if (base === undefined) {
      // Downstream refused this step: nothing will be committed, so the batch must
      // stay routable rather than be claimed by an answer nobody will read.
      record(agent, entry, 'failed', 'pre-step-refused')
      return { kind: 'reject' }
    }
    const refusal = refusalOf(verdict)
    if (refusal !== undefined) {
      record(agent, entry, 'failed', refusal.outcome)
      return enterAfter(base, answerText({ kind: 'notice', reason: refusal.reason, outcome: refusal.outcome }, true))
    }
    // `started` before the wait: a crash inside the run must not leave the batch
    // routable, because the workflow may already have executed tool effects.
    record(agent, entry, 'started', 'admitted')
    // P0-5: publish the batch *before* waiting for the run. `in-turn` holds the
    // step open for the whole workflow and the loop writes a claimed batch only
    // when the step begins, so an `enter`-only design left the transcript with no
    // `user/message` at all for the entire run: the GUI showed an empty turn with
    // nothing but the running status, and a reload lost the message completely.
    // The history snapshot is taken first, so the published message is not also
    // read back as prior conversation.
    const history = collectHistory(sessionOf(agent), { turns: FIXED_HISTORY_TURNS, chars: FIXED_HISTORY_CHARS })
    const surfaced = commitClaimed(agent, payload.messages)
    // B (边聊边干): triage-team on a background-deliverable agent answers the
    // live first answer in this turn and admits the workflow behind it.
    // answerStrategy is NOT consulted: the config default stays `in-turn`; this
    // branch changes only what triage-team does when the run is interactive.
    const interactive = await answerTeamInteractive(agent, verdict, payload, base, history, {
      enterAfter, surfaced, signal,
    })
    if (interactive !== undefined) return interactive
    // `full` (what `/grok on` selects) on the same kind of agent: accept the
    // message, run the team behind it, deliver the report as its own message.
    // Everything else (agent without followup/whenIdle — one-shot, headless)
    // keeps the blocking path, which always produces a final answer.
    const accepted = await answerFullBehind(agent, verdict, payload, base, {
      enterAfter, surfaced,
    })
    if (accepted !== undefined) return accepted
    const answer = await produceAnswer(agent, verdict.request, signal, history)
    if (aborted()) {
      // The turn was cancelled while the run was in flight: nobody can read an
      // entered step, and the run already stopped on the same signal — so the
      // transcript gets the batch and the cancelled terminal instead (P0-1 + P0-4).
      record(agent, entry, 'failed', 'aborted')
      const reason = answer.kind === 'notice' ? answer.reason : ''
      const partialReport = answer.kind === 'report' ? answer.report : undefined
      commitCancelled(agent, payload, cancelledText(reason, partialReport, {
        lang: detectLanguage(verdict.request),
      }), surfaced)
      return { kind: 'reject' }
    }
    record(agent, entry, answer.kind === 'notice' ? 'failed' : 'delivered', answer.outcome)
    return enterAfter(base, answerText(answer, true), surfaced)
  }

  /**
   * Enter a user-visible refusal instead of a silent `reject` (P0-3).
   *
   * A bare rejection is invisible: the app shows an empty turn and the user has no
   * way to tell an internal fault from a policy decision. The claimed message still
   * comes first, so the transcript keeps what they wrote (P0-1).
   */
  const enterRefusal = (payload: PreStepPayload, text: string): PreStepDecision => {
    try {
      const claimed = Array.isArray(payload.messages) ? payload.messages : []
      if (claimed.length === 0) return { kind: 'reject' }
      return { kind: 'enter', messages: [...claimed, enterMessage(text)] }
    } catch (error) {
      logger.warn(`gate could not state the failure: ${redactError(error)}`)
      return { kind: 'reject' }
    }
  }

  /**
   * Classification threw: still answer, with the reason (P0-3).
   *
   * Only a batch that carries a claimed user message is answered this way; a tool
   * continuation or a runtime-context batch has nothing to refuse, and entering a
   * notice there would answer a step the user never took.
   */
  const classificationFailure = (payload: PreStepPayload, reason: string): PreStepDecision => {
    let userClaimed = false
    try {
      userClaimed = (Array.isArray(payload.messages) ? payload.messages : [])
        .some(message => (message.source as { kind?: unknown } | undefined)?.kind === 'user')
    } catch {
      userClaimed = false
    }
    if (!userClaimed) return { kind: 'reject' }
    return enterRefusal(
      payload,
      noticeEnterText(`the mandatory workflow gate failed while reading this message: ${reason}`),
    )
  }

  /** Serialize one agent's batches and bound the queue. */
  const enqueue = (agentId: string, task: () => Promise<void>): boolean => {
    const current = queues.get(agentId)
    if (current !== undefined && current.queued >= FIXED_MAX_QUEUED_MESSAGES) return false
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

  /**
   * The loop driver's brakes.
   *
   * Built here rather than injected by the composition: a profile that composes
   * Schedule gets them without a second wiring point, and a profile without it gets a
   * port that can still stop on the operator marker and the session's own records but
   * has no row to delete. The Schedule lookup is lazy because the gate may be installed
   * before that service is mounted.
   */
  const loop: LoopBrakePort = deps.loop ?? createLoopBrakes({
    schedule: () => scheduleServiceOf(ctx as unknown as { get?: (name: string) => unknown }),
    logger,
    disposed: () => state.disposed,
  })
  const classifyDeps = {
    config,
    loop,
    ...deps.readConfig === undefined ? {} : { readConfig: deps.readConfig },
  }

  const handle = async (payload: PreStepPayload, next: () => Promise<PreStepDecision>): Promise<PreStepDecision> => {
    let verdict: Classification
    try {
      verdict = classifyPreStep(classifyDeps, payload)
    } catch (error) {
      // Fail closed (never a direct model answer) *and* visible (P0-3): the user
      // learns that the gate failed, instead of watching an empty turn.
      const reason = redactError(error)
      logger.warn(`gate classification failed: ${reason}`)
      return classificationFailure(payload, reason)
    }
    // A tripped brake is the one refusal that also has to remove the driver: the
    // heartbeat is refused (zero model calls) and its Schedule row is deleted, so the
    // loop cannot come back on the next occurrence.
    if (verdict.kind === 'loop-stop') {
      await loop.stop({ sessionId: verdict.agentId, code: verdict.code, detail: verdict.detail })
      return { kind: 'reject' }
    }
    // Pass-through calls the next listener untouched: a foreign failure must
    // surface as that listener's failure, not as this gate's refusal.
    if (verdict.kind === 'pass') return next()
    // T4: only `in-turn` survives — the turn that admitted the batch answers it.
    try {
      return await answerInTurn(verdict, payload, next)
    } catch (error) {
      // Totality with an answer: an internal failure is still stated, because a
      // plain refusal would leave a one-shot app with no user-visible output.
      // The claimed message is kept in front of the notice (P0-1).
      const reason = redactError(error)
      logger.warn(`gate could not answer in-turn: ${reason}`)
      return enterRefusal(payload, noticeEnterText(reason))
    }
  }

  // Call through the context: cordis event registration is receiver-bound.
  host.on?.('agent/pre-step', handle)
  return true
}
