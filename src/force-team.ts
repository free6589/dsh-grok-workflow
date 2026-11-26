/**
 * Forced team routing: a keyword in the user's turn buys a hard instruction, and a
 * turn that then answers alone gets one refusal.
 *
 * Two halves, one listener on `agent/pre-step` — the only admission point the Host
 * gives this plugin, and the only `agent/*` waterfall a plugin can still register.
 * There is no turn-end hook and no post-step hook in DSH 0.2.1-rc.2: `turn/end` is a
 * session *event* the loop writes, not a dispatch a listener can answer (the only
 * pre-step-shaped dispatch in the installed tree is the one declared at
 * `@deepseek-ai/dsh-agent/lib/types/runtime-types.d.ts:333`). So both halves hang on
 * the same waterfall, and the difference between them is what they do to the
 * decision:
 *
 * 1. **Injection (rewrites `enter`).** When a user-authored message of the claimed
 *    batch asks for a team, the message handed to the model carries the same text
 *    plus one fixed instruction block. `next()` already produced the batch — its
 *    order, its ids, its runtime-context tail — so this listener maps over that
 *    list and changes exactly one thing per matched message: one more text block at
 *    the end. Nothing is rewritten, nothing is added to the session, no second
 *    message appears, and the user's own words stay a byte-identical prefix. That
 *    matters because `enter.messages` is the only writer for a claimed batch: a
 *    separate `session.append()` on top of it would be a second copy of the same
 *    words in the transcript (the P0-1 defect the old gate was fixed for).
 * 2. **The turn gate (replaces `enter` with `reject`).** A turn that matched and then
 *    asked for a second step without either writing a `tool-workflow/*` event or
 *    calling one of `TEAM_STARTING_TOOLS` was about to be worked alone. That step is
 *    refused once — `reject` is the only decision that reliably produces zero model
 *    calls — and the session gets one user-role row carrying the intake's bilingual
 *    refusal text, because a bare `reject` is invisible: the reader would see an
 *    empty turn and no reason (`src/intake.ts` is the one place that owns that
 *    wording).
 *
 * Why the instruction is a command and not a suggestion. A suggestion is a piece of
 * advice competing with everything else in context, and the case this feature exists
 * for is precisely the one where the model has already decided to answer on its own:
 * advice loses that competition by construction, and the user who said "开团" gets a
 * single-model answer anyway. The instruction therefore states a constraint on the
 * *shape* of the turn ("a single answer is not acceptable"), not a preference — and
 * the turn gate is what enforces it when the model ignores the constraint.
 *
 * Three rules keep this listener from becoming a second authority:
 *
 * - **Off is inert.** No `agent/pre-step` listener is registered when the load-time
 *   switch is off, so the chain a profile with `forceTeamRouting: false` carries is
 *   exactly the pre-feature chain. A switch turned off later (`/grok off`, or a live
 *   read of the same key) leaves the decision untouched — the identical object the
 *   loop proposed, not a copy that happens to match.
 * - **A brake never fires on evidence it cannot read.** An unreadable log is a
 *   warning and a pass, never a refusal: a gate that refuses a turn for a reason it
 *   cannot state is worse than the answer it was trying to stop.
 * - **One refusal per turn, and the turn is the whole scope.** The flag is in memory,
 *   keyed by session, and it is dropped the moment a turn shows a team or a turn
 *   boundary shows the flag has gone stale. Nothing here is durable state: a plugin
 *   reload loses a pending flag, which costs at most the one refusal it would have
 *   spent.
 */

import type { Session } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import type { ResolvedConfig } from './types.js'
import { refuseNonTeamTurn } from './intake.js'
import { readModeRecord } from './mode.js'
import { redactError } from './redact.js'
import { isUserAuthoredSource } from './user-source.js'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** The row this plugin writes when it refuses a turn for answering alone. */
    'grok-workflow-force-team': { kind: 'grok-workflow-force-team' }
  }
}

/** Source kind of the refusal row, so a transcript shows who wrote it. */
export const FORCE_TEAM_SOURCE_KIND = 'grok-workflow-force-team'

/** Chinese keywords. Matched as substrings: Chinese does not separate words. */
export const FORCE_TEAM_KEYWORDS_ZH = ['开团', '组队', '分工'] as const

/**
 * English keywords. Matched as whole words, case-insensitively.
 *
 * No stemming on purpose: `delegate` matches, and `delegated`, `delegates`,
 * `delegation`, `delegating` do not. The asymmetry is the point. A miss costs one
 * turn that the user can re-ask with the word itself; a false positive forces a team
 * run — several child calls and real quota — on a message that was describing the
 * past ("the delegated work is done"). The word boundary is drawn on ASCII letters,
 * digits and `_`, so `undelegate` and `delegate2` are not hits either.
 */
export const FORCE_TEAM_KEYWORDS_EN = ['delegate', 'form a team', 'split the work'] as const

/** Language of the instruction: the language of the turn that asked for it. */
export type ForceTeamLang = 'zh' | 'en'

/**
 * The fixed hard instruction, Chinese.
 *
 * One block, three numbered steps, a closing sentence — and the closing sentence is
 * an imperative ("第一步是拆活，现在就做。") rather than a request, so the block reads
 * as the shape this turn must take instead of one voice among several.
 */
export const TEAM_INSTRUCTION_ZH = [
  '【强制：这一轮走团队模式】',
  '这一轮不许单条作答。按顺序做完这三步：',
  '1. 先拆活——把要做的事拆成可以并行的任务，每个任务写清产出和验收标准；',
  '2. 再并发执行——用工作流/团队工具把这些任务并发派给子代理，不要自己一个个做完；',
  '3. 最后汇总——所有任务回来后按验收标准逐条核对，再给结论，没通过的必须写明没过。',
  '第一步是拆活，现在就做。',
].join('\n')

/** The same instruction, English, with the same three steps in the same order. */
export const TEAM_INSTRUCTION_EN = [
  '[Mandatory: this turn runs as a team]',
  'A single answer is not acceptable this turn. Do these three in order:',
  '1. split the work: break it into tasks that can run in parallel, each with its output and its acceptance check;',
  '2. run them concurrently: dispatch those tasks to subagents through the workflow or team tool instead of working through them yourself;',
  '3. summarise: when every task is back, check each against its acceptance criteria and then answer; anything that failed must be reported as failed.',
  'Start by splitting the work, now.',
].join('\n')

/** The instruction for one language. */
export function teamInstruction(lang: ForceTeamLang): string {
  return lang === 'zh' ? TEAM_INSTRUCTION_ZH : TEAM_INSTRUCTION_EN
}

/** A CJK character; the one signal that decides the instruction's language. */
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]/

/**
 * The instruction language for one piece of text.
 *
 * A CJK character means Chinese; otherwise Latin text means English. Text with
 * neither (empty, digits, punctuation) answers `zh`, which is this repository's
 * default language — guessing English from a blank string would put an English
 * command into a Chinese session.
 */
export function languageOf(text: string): ForceTeamLang {
  if (CJK.test(text)) return 'zh'
  return /[A-Za-z]/.test(text) ? 'en' : 'zh'
}

/** One English keyword as a whole-word pattern, whitespace runs included. */
function englishPattern(keyword: string): RegExp {
  const body = keyword.trim().split(/\s+/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')
  return new RegExp(`(?<![A-Za-z0-9_])${body}(?![A-Za-z0-9_])`, 'i')
}

const ENGLISH_PATTERNS = FORCE_TEAM_KEYWORDS_EN.map(englishPattern)

/**
 * Whether this text asks for a team.
 *
 * Chinese is a substring test (a keyword may sit inside a longer phrase and still be
 * the request); English is a whole-word test (see {@link FORCE_TEAM_KEYWORDS_EN} for
 * why the two sides are not symmetric).
 * @param text - one message's plain text.
 * @returns true when at least one keyword of either language is present.
 */
export function asksForTeam(text: string): boolean {
  if (text === '') return false
  if (FORCE_TEAM_KEYWORDS_ZH.some(keyword => text.includes(keyword))) return true
  return ENGLISH_PATTERNS.some(pattern => pattern.test(text))
}

/**
 * Whatever a batch element really is, read as a message or as nothing.
 *
 * The listener runs on **every** pre-step, including batches a caller or another
 * plugin built badly, so a `null` in the array has to read as "not a user message"
 * rather than take the turn down (the same rule the narrow heartbeat listener
 * follows). Everything below goes through here.
 */
function asMessage(value: unknown): UserMessage | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const candidate = value as { content?: unknown, source?: unknown }
  if (!Array.isArray(candidate.content)) return undefined
  return value as UserMessage
}

/** Plain text of one message, blocks joined the way the model reads them. */
export function messageText(message: UserMessage): string {
  const parts: string[] = []
  for (const block of Array.isArray(message.content) ? message.content : []) {
    const candidate = block as { type?: unknown, text?: unknown }
    if (candidate.type === 'text' && typeof candidate.text === 'string') parts.push(candidate.text)
  }
  return parts.join('\n')
}

/**
 * The same message with the instruction appended as one more text block.
 *
 * The message keeps its identity (`id`, `role`, `source`) and every existing block
 * byte-for-byte: the returned value is a shallow copy whose only difference is the
 * trailing block. Identity is what makes the injection free of side effects — the
 * loop commits this message instead of the one it claimed, so the transcript gains no
 * second row and the user's own text is never re-serialised.
 * @param message - the claimed user message that matched.
 * @param lang - language of the instruction.
 * @returns the message the step should enter with.
 */
export function withTeamInstruction(message: UserMessage, lang: ForceTeamLang): UserMessage {
  return {
    ...message,
    content: [...message.content, { type: 'text', text: teamInstruction(lang) }],
  }
}

/**
 * Whether this session is in grok mode, read the way the routing surface reads it.
 *
 * A session that wrote a toggle record answers with it; a session that never did
 * answers with the deployment default, which is the same reading `/grok status` and
 * the settings page report (D-154: the *routing* surface reports the effective value,
 * and this listener decides routing). The block admission keeps its stricter
 * record-only rule — that one is "did this session opt in to taking work", which is a
 * different question (`src/user-source.ts`).
 * @param session - the session whose toggle is read.
 * @param deploymentDefault - `grokDefault === 'on'`.
 * @returns true only when the session is in grok mode.
 */
export function grokModeOn(session: Session | undefined, deploymentDefault: boolean): boolean {
  return readModeRecord(session)?.enabled ?? deploymentDefault
}

/**
 * Whether this session is a delegated child rather than a conversation with a user.
 *
 * A child's "user" message is the prompt its parent wrote, so a keyword there is the
 * parent's task text, not a person asking for a team. Forcing a team inside a child
 * would nest teams and could refuse a child's own continuation step — the same reason
 * the narrow heartbeat listener never charges a beat to a child (`src/heartbeat-listen.ts`).
 * @param session - the dispatch's session.
 * @returns true for a subagent-origin session or any session at delegation depth > 0.
 */
export function isDelegatedSession(session: Session | undefined): boolean {
  try {
    const header = (session as { header?: { origin?: unknown, delegationDepth?: unknown } } | undefined)?.header
    if (header === undefined || header === null) return false
    if (header.origin === 'subagent') return true
    return typeof header.delegationDepth === 'number' && header.delegationDepth > 0
  } catch {
    // An unreadable header must not read as "this is a user's session": the listener
    // is the one place that can spend a refusal, so the safe answer is "not mine".
    return true
  }
}

/**
 * The tools a turn can start a team with, as the turn gate counts them.
 *
 * `grok_workflow` runs a workflow script through the engine, whose progress family
 * (`tool-workflow/*`) is written to the session while the run is alive.
 * `grok_open_block` is the block intake, and it writes its block to an on-disk JSONL
 * ledger (`src/block/store.ts`) and nothing to the session — so a block a turn opened
 * leaves no `tool-workflow/*` event, which is the defect this set exists to close: on
 * a real machine a model that formed its team through the intake was refused as if it
 * had started nothing.
 *
 * The rule is a named, exported set rather than an inline list so the next reader sees
 * which calls count, and the spec pins the membership.
 */
export const TEAM_STARTING_TOOLS = ['grok_workflow', 'grok_open_block'] as const

/** The same set, for the per-event lookups the log scan does. */
const TEAM_STARTING_TOOL_SET: ReadonlySet<string> = new Set(TEAM_STARTING_TOOLS)

/**
 * Whether one log event is a call to a team-starting tool made by this turn.
 *
 * The `turn` inside the call's own `data` is what decides, not its position in the
 * log: a call the previous turn made must never pay this turn's debt. A log this
 * build did not write — no `data`, a `name` that is not a string — reads as "not a
 * call" rather than throwing, because a gate may not refuse a turn for a reason it
 * cannot state.
 */
function isTeamStartingCall(event: unknown, turn: number): boolean {
  const data = (event as { data?: unknown }).data
  if (data === null || typeof data !== 'object') return false
  const call = data as { turn?: unknown, name?: unknown }
  if (call.turn !== turn) return false
  return typeof call.name === 'string' && TEAM_STARTING_TOOL_SET.has(call.name)
}

/**
 * Whether the given turn started a team since it opened.
 *
 * Two kinds of evidence, both read from the turn's own log and neither from a flag:
 *
 * - a `tool-workflow/*` event, the family a live workflow run writes;
 * - a `tool/call` to one of {@link TEAM_STARTING_TOOLS}.
 *
 * The second kind is not belt-and-braces: the block intake leaves no session event at
 * all (`grok_open_block` records its block in its own ledger and writes nothing here),
 * so the event family alone answered "no team" for a turn that had already opened a
 * block and started real work. The session log does record the call — `name` and
 * `turn` are in its `data` — and that is the evidence read below.
 * `undefined` means the log could not be read, which a caller must never turn into a
 * refusal.
 * @param session - the session whose log is read.
 * @param turn - the turn the question is about.
 * @returns true when a team event or a team-starting call followed this turn's
 * `turn/start`, false when neither did (or when this log never opened the turn),
 * `undefined` when unreadable.
 */
export function teamStartedInTurn(session: Session | undefined, turn: number): boolean | undefined {
  if (session === undefined || typeof session.ownEvents !== 'function') return undefined
  try {
    const events = session.ownEvents()
    let openedAt: number | undefined
    for (const event of events) {
      const data = (event as { data?: { turn?: unknown } }).data
      if (event.type === 'turn/start' && data?.turn === turn) openedAt = event.seq
    }
    if (openedAt === undefined) return false
    for (const event of events) {
      if (event.seq <= openedAt) continue
      const type: unknown = event.type
      if (typeof type === 'string' && type.startsWith('tool-workflow/')) return true
      if (type === 'tool/call' && isTeamStartingCall(event, turn)) return true
    }
    return false
  } catch {
    return undefined
  }
}

/** A turn that matched a keyword and has not shown a team yet. */
export interface TeamFlag {
  /** Turn that matched. */
  turn: number
  /** Step of that turn in which the match was seen. */
  step: number
  /** Characters measured in the matched message, for the refusal's own count. */
  chars: number
}

/** What the turn gate decided about one dispatch. */
export type TeamGateVerdict = 'none' | 'refuse' | 'stale'

/**
 * The turn gate, as a pure function of the flag and the evidence.
 *
 * - `refuse` — the flagged turn asked for another step and its log shows no team:
 *   the one case this gate exists for.
 * - `stale` — the flag belongs to an earlier turn. The runtime offered no pre-step
 *   inside that turn (the model answered in one step and the turn closed), so the
 *   only remaining opportunity would be to refuse a *different, newer* message for
 *   what an older turn did. That refuses the wrong turn and eats a message, so the
 *   flag is dropped instead; the injection was that turn's only lever.
 * - `none` — no flag, a team was found, the flag was set by this very step, or the
 *   evidence could not be read.
 * @param input - the pending flag, the dispatch's position, and the evidence.
 * @returns the verdict, without side effects.
 */
export function teamGateVerdict(input: {
  flag: TeamFlag | undefined
  turn: number
  step: number
  teamStarted: boolean | undefined
}): TeamGateVerdict {
  const { flag, turn, step, teamStarted } = input
  if (flag === undefined) return 'none'
  if (teamStarted === true) return 'none'
  if (flag.turn !== turn) return 'stale'
  // The step that set the flag cannot refuse itself, and no later step may inherit
  // the duty: the whole point of a turn-scoped flag.
  if (step <= flag.step) return 'none'
  if (teamStarted === undefined) return 'none'
  return 'refuse'
}

/** The decision the loop proposed, as far as this module reads it. */
type PreStepDecision =
  | { kind: 'reject' }
  | { kind: 'enter', messages: UserMessage[], startsRequestSeries?: true }

/** Payload shape of one `agent/pre-step` dispatch (only the fields read here). */
export interface ForceTeamPayload {
  agent?: { session?: Session } | undefined
  messages?: UserMessage[] | undefined
  turn?: number | undefined
  step?: number | undefined
}

/** Dependencies of the listener. */
export interface ForceTeamInput {
  /**
   * Host context; only `on` is used.
   *
   * Typed as `unknown` on purpose: cordis's `on` is a generic overload over its own
   * event map, so a structural parameter type cannot name it without importing the
   * whole event table. The runtime check below is what actually guards it.
   */
  ctx: { on?: unknown }
  logger: { warn(message: string): void }
  /** `true` registers the listener; anything else registers nothing at all. */
  enabled: boolean
  /** Load-time configuration, and the fallback a broken live read degrades to. */
  config: ResolvedConfig
  /** Live configuration reader; omitted means the load-time snapshot is final. */
  readConfig?: (() => ResolvedConfig) | undefined
}

/** The session id a dispatch belongs to, spelled exactly like the gate's own id. */
function sessionIdOf(payload: ForceTeamPayload): string {
  const id = payload.agent?.session?.id
  const text = id === undefined ? '' : String(id)
  return text === '' ? 'unknown-agent' : text
}

/**
 * Install the forced-team listener.
 *
 * @param input - context, logger, the switch and the configuration reader.
 * @returns The disposer cordis already owns; a no-op when the switch is off.
 */
export function installForceTeam(input: ForceTeamInput): () => void {
  const { ctx, logger, enabled } = input
  // Off is inert: not a listener that returns early, but no listener at all, so the
  // registered chain is exactly the pre-feature one.
  if (enabled !== true) return () => {}
  if (typeof ctx.on !== 'function') return () => {}
  const host = ctx as unknown as { on: (event: string, handler: unknown) => unknown }
  /** Pending flags, one per session. Never durable: a reload costs one refusal. */
  const flags = new Map<string, TeamFlag>()

  /** The live configuration, degrading to the load-time snapshot like the gate does. */
  const scope = (): ResolvedConfig => {
    if (input.readConfig === undefined) return input.config
    try {
      return input.readConfig()
    } catch {
      return input.config
    }
  }

  /**
   * Write the refusal where a reader can see it, and keep what the user wrote.
   *
   * The step is about to be rejected, so the loop commits nothing: this is the only
   * writer for that batch, which is why appending the claimed messages here cannot
   * duplicate them. On a multi-step turn the user's original message is already in
   * the transcript (a step ran before this gate could fire), and what is claimed at a
   * continuation step is `user`-authored (a steering message) or an injected notice;
   * only the former is re-published, because a `runtime-context` notice is the loop's
   * own row and writing it here would put the same words in the transcript twice.
   */
  const writeRefusal = (session: Session, payload: ForceTeamPayload, flag: TeamFlag): void => {
    try {
      for (const raw of payload.messages ?? []) {
        const message = asMessage(raw)
        if (message === undefined || !isUserAuthoredSource(message.source)) continue
        session.append('user/message', message, { surfaceOp: 'append' })
      }
      session.append('user/message', createUserMessage({
        content: [{ type: 'text', text: refuseNonTeamTurn(flag.chars).text }],
        source: { kind: FORCE_TEAM_SOURCE_KIND },
      }), { surfaceOp: 'append' })
    } catch (error) {
      // The refusal decision still stands: an unwritable transcript costs the reader
      // the line, not the brake.
      logger.warn(`force-team gate could not write its refusal: ${redactError(error)}`)
    }
  }

  /**
   * Rewrite the batch the loop proposed: instruction on matched messages, one
   * refusal if the gate says so.
   */
  const handle = async (payload: ForceTeamPayload, next: () => Promise<PreStepDecision>): Promise<unknown> => {
    const decision = await next()
    // A downstream listener's `reject` is final: there is no step to instruct and no
    // batch worth refusing twice.
    if (decision === null || decision === undefined || decision.kind !== 'enter') return decision
    const live = scope()
    if (live.forceTeamRouting !== true) return decision
    const session = payload.agent?.session
    // A delegated child is not a user's turn: its prompt belongs to its parent.
    if (isDelegatedSession(session)) return decision
    const sessionId = sessionIdOf(payload)
    const turn = typeof payload.turn === 'number' ? payload.turn : 0
    const step = typeof payload.step === 'number' ? payload.step : 0

    // The toggle is this listener's own gate: a session that is not in grok mode is
    // ordinary chat, and nothing here may touch it.
    let modeOn: boolean
    try {
      modeOn = grokModeOn(session, live.grokDefault === 'on')
    } catch (error) {
      logger.warn(`force-team: could not read this session's mode toggle, passing the turn through: ${redactError(error)}`)
      flags.delete(sessionId)
      return decision
    }
    if (!modeOn) {
      flags.delete(sessionId)
      return decision
    }

    // The turn gate. It runs before the injection because a refusal ends the turn:
    // instructing a step nobody will enter would be wasted text.
    const flag = flags.get(sessionId)
    if (flag !== undefined) {
      const teamStarted = teamStartedInTurn(session, turn)
      const verdict = teamGateVerdict({ flag, turn, step, teamStarted })
      if (verdict === 'refuse' && session !== undefined) {
        flags.delete(sessionId)
        writeRefusal(session, payload, flag)
        return { kind: 'reject' }
      }
      if (verdict === 'stale' || teamStarted === true) flags.delete(sessionId)
    }

    const messages = Array.isArray(decision.messages) ? decision.messages : []
    const matched = messages.filter((raw) => {
      const message = asMessage(raw)
      return message !== undefined && isUserAuthoredSource(message.source) && asksForTeam(messageText(message))
    })
    if (matched.length === 0) return decision
    const rewritten = messages.map((message) => {
      if (!matched.includes(message)) return message
      return withTeamInstruction(message, languageOf(messageText(message)))
    })
    const asked = messageText(matched[0]!)
    flags.set(sessionId, { turn, step, chars: asked.length })
    return { ...decision, messages: rewritten }
  }

  const dispose = host.on('agent/pre-step', handle)
  return typeof dispose === 'function' ? dispose as () => void : () => {}
}
