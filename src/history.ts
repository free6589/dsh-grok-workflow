/**
 * Bounded conversation history for gate-routed messages.
 *
 * A follow-up message ("now do the same for the other file") is meaningless to a
 * planner that never saw the previous exchange, so the gate forwards a bounded,
 * redacted excerpt of the durable conversation. The budget is deliberately small:
 * it is context, not the objective.
 */

import type { Message } from '@deepseek-ai/dsh-llm'
import type { Session } from '@deepseek-ai/dsh-session'
import { redactSecrets } from './redact.js'
import { RELAY_SOURCE_KIND } from './answer.js'

/** Source kinds that belong to this plugin and must not be replayed as user history. */
const PLUGIN_SOURCE_KINDS = new Set([RELAY_SOURCE_KIND])

/** Bounds applied to the forwarded history. */
export interface HistoryBounds {
  /** Prior exchanges to forward (each exchange is one user plus one assistant message). */
  turns: number
  /** Total character budget for the rendered history block. */
  chars: number
}

/** Per-message cap so one huge answer cannot consume the whole budget. */
const MESSAGE_CAP = 1_500

/**
 * How far past MESSAGE_CAP redaction may look for the far end of a secret
 * that starts inside the cap (a PEM block, a long JWT, an sk- token). The
 * per-message regex cost stays bounded at MESSAGE_CAP + REDACT_SPAN.
 */
const REDACT_SPAN = 8_192

/** PEM/PGP open marker: a block whose END lies past the window never matches. */
const KEY_BEGIN_MARKER = '-----BEGIN '
const KEY_END_MARKER = '-----END '

/**
 * Fail closed on a key block cut off by the redaction window: when the text
 * carries an open marker with no matching close marker, the tail from the
 * marker on is key material that no rule could match, so drop it in favour of
 * the placeholder. Complete blocks are already replaced by `redactSecrets`
 * and never reach this check.
 */
function dropDanglingKeyBlock(text: string): string {
  const begin = text.indexOf(KEY_BEGIN_MARKER)
  if (begin === -1) return text
  if (text.indexOf(KEY_END_MARKER, begin) !== -1) return text
  return `${text.slice(0, begin)}[REDACTED PRIVATE KEY]`
}

/** Plain text of one message, or an empty string when it carries none. */
function textOf(message: Message): string {
  const parts: string[] = []
  for (const block of message.content) {
    if (typeof block !== 'object' || block === null) continue
    const candidate = block as { type?: unknown; text?: unknown }
    if (candidate.type !== 'text' || typeof candidate.text !== 'string') continue
    parts.push(candidate.text)
  }
  return parts.join('\n').trim()
}

/** True when the message is a plugin-relayed report rather than user speech. */
function isPluginMessage(message: Message): boolean {
  const source = message.source as { kind?: unknown } | undefined
  return typeof source?.kind === 'string' && PLUGIN_SOURCE_KINDS.has(source.kind)
}

/**
 * Render the most recent conversational messages as a bounded context block.
 *
 * @param messages - durable conversation messages in order.
 * @param bounds - turn and character bounds.
 * @param excludeIds - message ids to leave out. The gate's `relay`/`append`
 *   strategies write the claimed batch themselves before the run starts (the step
 *   is rejected, so nothing else would), and the history read that follows must
 *   not hand the words the user just typed back to the run as "prior
 *   conversation": the objective would carry the message twice — once as history,
 *   once as the current request.
 * @returns the rendered block, or an empty string when there is nothing to forward.
 */
export function renderHistory(
  messages: readonly Message[],
  bounds: HistoryBounds,
  excludeIds: readonly string[] = [],
): string {
  if (bounds.turns <= 0 || bounds.chars <= 0) return ''
  const excluded = excludeIds.length === 0 ? undefined : new Set(excludeIds)
  const wanted = bounds.turns * 2
  const recent: { role: string; text: string }[] = []
  for (const message of messages) {
    if (message.role !== 'user' && message.role !== 'assistant') continue
    if (excluded !== undefined && excluded.has(String(message.id))) continue
    if (isPluginMessage(message)) continue
    // Redact *first* on a bounded window, then truncate: redaction runs on at
    // most MESSAGE_CAP + REDACT_SPAN characters, so a very long message never
    // pays unbounded regex time, and a secret straddling the cap is still
    // matched whole (rules below fire on the far end, and the character
    // classes they use consume body characters, not whitespace alone, so
    // spaces/punctuation on one side do not hide the shape). A key block cut
    // off with its END past the window matches no rule by construction, so it
    // is dropped fail-closed. Benign text never contains a BEGIN marker, so it
    // passes through byte-identical.
    const raw = textOf(message)
    const truncated = raw.length > MESSAGE_CAP
    const window = truncated ? raw.slice(0, MESSAGE_CAP + REDACT_SPAN) : raw
    const redactedWindow = redactSecrets(window)
    // The window is only longer than the cap so redaction can see past it:
    // render at most one cap of text (plus the truncation ellipsis below).
    const redacted = truncated ? redactedWindow.slice(0, MESSAGE_CAP) : redactedWindow
    const text = truncated ? dropDanglingKeyBlock(redacted) : redacted
    if (text === '') continue
    recent.push({
      role: message.role === 'user' ? 'User' : 'Assistant',
      text: truncated ? `${text.slice(0, MESSAGE_CAP)}…` : text,
    })
  }
  const selected: typeof recent = []
  let budget = bounds.chars
  for (let index = recent.length - 1; index >= 0 && selected.length < wanted && budget > 0; index -= 1) {
    const entry = recent[index]!
    const cost = entry.text.length + entry.role.length + 2
    if (cost > budget && selected.length > 0) break
    selected.push({ role: entry.role, text: entry.text.slice(0, Math.max(0, budget)) })
    budget -= Math.min(cost, budget)
  }
  selected.reverse()
  if (selected.length === 0) return ''
  const lines = selected.map(entry => `${entry.role}: ${entry.text}`)
  return ['Conversation so far (context only):', ...lines].join('\n')
}

/** Render the durable history of one session, tolerating an unavailable session. */
export function collectHistory(
  session: Session | undefined,
  bounds: HistoryBounds,
  excludeIds: readonly string[] = [],
): string {
  if (session === undefined || typeof session.deriveMessages !== 'function') return ''
  try {
    return renderHistory(session.deriveMessages(), bounds, excludeIds)
  } catch {
    return ''
  }
}

/** Room kept for the history block before it is worth attaching at all. */
const MIN_BLOCK_ROOM = 16

/**
 * Fit an inherited-work block into the room the objective leaves for it.
 *
 * The digest is ordered oldest → newest, so the *newest* decisions are the ones
 * worth keeping when it has to shrink: the header line stays, then whole trailing
 * lines are kept from the end until the room runs out, and a `…` line states that
 * earlier lines were omitted. Lines are never cut in half.
 * @param digest - the rendered inheritance digest (already under its own 8K cap).
 * @param room - characters available for this block.
 * @returns the block, or `''` when not even the header fits.
 */
function fitInheritance(digest: string, room: number): string {
  if (digest === '' || room < MIN_BLOCK_ROOM) return ''
  if (digest.length <= room) return digest
  const lines = digest.split('\n')
  const header = lines[0] ?? ''
  if (header.length + 2 > room) return ''
  // Only the decision lines are worth keeping when the block has to shrink: a
  // `detail` line describes a decision, so keeping details without their lines
  // would hand the reader conclusions with no subjects. The newest decisions are
  // kept, the oldest give way, and `…` says so.
  const decisions = lines.slice(1).filter(text => !text.startsWith('  detail ') && !text.startsWith('[truncated:'))
  const kept: string[] = []
  let used = header.length
  for (let index = decisions.length - 1; index >= 0; index -= 1) {
    const text = decisions[index]!
    if (used + 1 + text.length + 2 > room) break
    used += 1 + text.length
    kept.unshift(text)
  }
  if (kept.length === 0) return ''
  return `${[header, ...kept].join('\n')}\n…`
}

/**
 * Compose the gate objective from forwarded history, inherited work and the current
 * message.
 *
 * The three blocks are ordered oldest → newest: inherited work first (what earlier
 * rounds already verified, with its own 8K budget from `src/carryover.ts`), then the
 * rendered conversation history, then the current request. When the limit is tight
 * the *oldest* block is the one that gives way — history is dropped before any
 * inherited decision, and inherited lines are dropped from their old end — because a
 * round that already verified work must not lose that list to a stale transcript.
 *
 * @param history - already rendered history block, or an empty string.
 * @param request - the current user message text.
 * @param limit - maximum length of the composed objective; the current message is never shortened.
 * @param inheritance - rendered L1 inheritance digest, or an empty string on a first round.
 * @returns the objective, or `undefined` when the current message alone exceeds the limit.
 */
export function composeObjective(
  history: string,
  request: string,
  limit: number,
  inheritance = '',
): string | undefined {
  // The limit applies to the user's message itself: it is the instruction that
  // must arrive whole, so a message at the limit is never refused because the
  // "Current request:" label would push the composed objective one line over.
  if (request.length > limit) return undefined
  const base = `Current request:\n${request}`
  // The label is dropped rather than shortening the message: at the very top of
  // the range the objective is exactly the request, with nothing attached.
  if (base.length > limit) return request
  // Two characters separate the blocks, and the ellipsis needs one more.
  let room = limit - base.length - 2
  const inherited = fitInheritance(inheritance, room)
  if (inherited !== '') room -= inherited.length + 2
  const historyBlock = ((): string => {
    if (history === '') return ''
    if (room < MIN_BLOCK_ROOM) return ''
    return history.length > room ? `${history.slice(0, room - 1)}…` : history
  })()
  const blocks = [inherited, historyBlock, base].filter(block => block !== '')
  return blocks.join('\n\n')
}
