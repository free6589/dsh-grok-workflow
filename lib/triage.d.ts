/**
 * Front-desk triage (t52, plan C: greeting + difficulty split + ask when unsure).
 *
 * The requirement changed with explicit user authorisation (DECISIONS D-021):
 * "every message must run the full workflow" became "every message must pass the
 * front desk, the front desk states its tier in public, and it may never skip
 * silently". The front desk is therefore not a filter in front of the gate — it
 * is the gate's first decision, and its verdict is part of the answer text.
 *
 * Design constraints this module is written against:
 *
 * 1. **Cheap and fast.** Classification is pure string work: no model call, no
 *    I/O, no clock. A rule-based classifier costs microseconds, and the tiers it
 *    cannot separate are exactly the ones the user is asked about (the "ask"
 *    tier). A model call for classification was rejected: it would add a second
 *    cost and latency to every message — including the greeting that is supposed
 *    to be instant — and it moves the decision into a place the user cannot
 *    audit. The one model call a tier can spend is spent producing the answer.
 * 2. **The verdict is visible.** Every answer starts with {@link triageLine}:
 *    the tier, and the rule that put the message there. A wrong tier must be
 *    arguable, which is impossible if the reason stays inside the plugin.
 * 3. **Never guess silently.** When the signals conflict, the front desk asks
 *    one question instead of picking a tier; the answer is remembered for the
 *    next message ({@link resolvePending}).
 *    …but it never asks for something it already has: before a clarification
 *    question goes out, the conversation so far and the memory files on disk are
 *    searched ({@link recallFromPrior}), and a hit is answered from instead of
 *    asked about. That rule is the point of
 *    `session-7e079b80-1a57-451b-aca4-795d24a14c4d`, where results the session
 *    already held were met with a request to repeat them.
 * 4. **Escalation is always available.** A message that names the team is
 *    routed to the team regardless of every other signal ({@link FORCE_TEAM}).
 *
 * Language: the text of an answer follows the *message*, not the Host UI locale.
 * The locale preference is a browser setting (`dsh-client-locale` stores it in
 * the Host user-settings document under namespace `locale`), and a user who
 * writes Chinese while the UI is English still expects a Chinese greeting; the
 * message is the reliable signal and it is available synchronously here.
 * DECISIONS D-022 records the choice and what was rejected.
 */
/** Tier one message is routed to. */
export type TriageTier = 'chat' | 'fast' | 'team' | 'ask';
/** Language of the generated text. */
export type TriageLang = 'zh' | 'en';
/** How the front desk is allowed to behave. */
export interface TriagePolicy {
    /** `full` keeps the pre-t52 rule: every message runs the team. */
    mode: 'full' | 'triage';
    /** `false` never asks: an ambiguous message is escalated to the team. */
    ask: boolean;
}
/** What the classifier was given. */
export interface TriageInput extends TriagePolicy {
    /** The user message, already joined and trimmed. */
    text: string;
    /**
     * The previous message from this session was a front-desk question, so this
     * one is read as its answer before any other rule applies.
     */
    pending?: boolean;
    /**
     * Whether bounded conversation history before this message is non-empty.
     * Set by the gate from `collectHistory`; a follow-up phrase ("继续", "详细点" …)
     * only counts as a fast follow-up when there is something to follow up on.
     */
    historyNonEmpty?: boolean;
    /**
     * When false, the follow-up shortcut is disabled even with history
     * (mirrors `triageFollowupAsFast: false`); defaults to enabled.
     */
    followupAsFast?: boolean;
    /**
     * Outcome of the "look it up before asking" pass, run by the gate right before
     * a clarification question would go out: the conversation so far plus the
     * memory files already on disk, read and bounded by the caller.
     *
     * `undefined` means the pass did not run, and the front desk behaves exactly
     * as it did before this rule existed — that is what keeps a first message in a
     * fresh session byte-identical. A `hit` turns the question into an answer
     * (tier `fast`, reason `recalled`); a `miss` changes nothing here, and the gate
     * states what is missing next to the question.
     */
    prior?: RecallResult;
}
/** One classification. */
export interface TriageVerdict {
    tier: TriageTier;
    /** Stable machine-readable rule id; `tests` pin these and the ledger records them. */
    reason: string;
    /** One sentence stating the rule in the message's language. */
    detail: string;
    lang: TriageLang;
    /** The batch must run the whole workflow and gets the greeting. */
    greeting: boolean;
}
/** Limits that separate "one shot" from "a plan". */
export declare const TRIAGE_LIMITS: {
    /** A message longer than this is treated as multi-part work. */
    readonly teamChars: 200;
    /** A chat message is short: a greeting plus padding, never a request. */
    readonly chatChars: 40;
};
/**
 * Language of one message: CJK present means Chinese, else English.
 *
 * Deliberately not "the Host locale": see the module note and D-022.
 * @param text - the user message.
 * @returns `zh` or `en`.
 */
export declare function detectLanguage(text: string): TriageLang;
/**
 * Complexity signals of one message.
 *
 * Kept separate from the decision so the decision reads as a policy
 * ({@link classifyTriage}) and the evidence is inspectable.
 */
export interface TriageSignals {
    /** Distinct deliverable/change words present (the team's reason to exist). */
    deliverables: number;
    /** Sequencing or enumeration present. */
    multiStep: boolean;
    /** One concrete action verb present. */
    action: boolean;
    /** Long enough to be a plan rather than a request. */
    long: boolean;
    /** Several clauses. */
    clauses: number;
    /** Points at something without naming it. */
    vague: boolean;
    /** Asks something; a question is never answered from a greeting template. */
    question: boolean;
    /** Names something inspectable (path, code, snippet): never "just a remark". */
    concrete: boolean;
}
/**
 * Extract the signals that decide a tier.
 * @param text - the user message.
 * @returns the signals, never throwing.
 */
export declare function triageSignals(text: string): TriageSignals;
/**
 * One piece of material the front desk may answer from, handed in by the gate.
 *
 * The front desk itself does no I/O (rule 1 of the module note), so it never
 * reads a session or a file: it is given the text, already bounded and redacted,
 * and only decides whether that text answers the message.
 */
export interface RecallSource {
    /** `history` is the conversation so far; `memory` is a file already on disk. */
    kind: 'history' | 'memory';
    /** Where the text came from, shown to the user: a file path or a named block. */
    locator: string;
    /** The body, bounded by the caller. */
    text: string;
}
/** The material answers the message: answer from it instead of asking. */
export interface RecallHit {
    kind: 'hit';
    /**
     * `content-match`: the message names things the material contains.
     * `prior-reference`: the message points at earlier material ("刚才那份" / "the
     * above") and the material is substantial enough to be what it points at.
     */
    reason: 'content-match' | 'prior-reference';
    /** Distinct anchors that were found, in message order (bounded). */
    tokens: string[];
    /** Locators the answer comes from (bounded). */
    locators: string[];
    /** The part of the material that carries the answer, one bounded excerpt. */
    excerpt: string;
}
/** Nothing in the material answers the message: ask once, and say what is missing. */
export interface RecallMiss {
    kind: 'miss';
    /** The anchors the message asked about; what the user has to supply. */
    tokens: string[];
    /** Locators that were searched, so the question can state where it looked. */
    checked: string[];
}
/** Result of one look-up-before-asking pass. */
export type RecallResult = RecallHit | RecallMiss;
/**
 * Limits of the look-up pass.
 *
 * The matching limits keep the rule conservative: two anchors, or one anchor
 * plus an explicit pointer at earlier material. One common bigram is not
 * evidence that the material answers the message, and a false hit is worse than
 * a question — it would answer with something the user did not ask about.
 */
export declare const RECALL_LIMITS: {
    /** Distinct anchors a content match needs. */
    readonly minTokens: 2;
    /** Characters a source needs before a bare "刚才那份" may use it. */
    readonly minSubstantive: 120;
    /** Characters kept from the excerpt shown to the worker and the user. */
    readonly excerptChars: 700;
    /** Characters of lead-in kept before the first anchor in the excerpt. */
    readonly excerptLead: 160;
    /** Anchors reported back (to the user and in the ledger). */
    readonly tokens: 8;
    /** Locators reported back. */
    readonly locators: 4;
    /** Sources one pass may consider. */
    readonly sources: 24;
    /** Turns of conversation the gate forwards to the pass. */
    readonly turns: 6;
    /** Characters of conversation the gate forwards to the pass. */
    readonly historyChars: 3000;
    /** Earlier rounds compiled into the digest the pass may read. */
    readonly rounds: 4;
    /** Characters of that digest. */
    readonly digestChars: 4000;
    /** Memory files one pass reads. */
    readonly files: 12;
    /** Characters kept from one memory file. */
    readonly fileChars: 2400;
    /** Characters of memory files one pass reads in total. */
    readonly totalChars: 16000;
};
/**
 * Search the material already on hand for what this message asks about.
 *
 * Two ways to hit, in the order they are trusted:
 *
 * 1. **content-match** — the message names at least {@link RECALL_LIMITS.minTokens}
 *    distinct anchors that one source contains. Two anchors sharing a source is
 *    evidence; one common bigram is not.
 * 2. **prior-reference** — the message points at earlier material ("刚才那份",
 *    "上面说的", "the above") and at least one source is substantial
 *    ({@link RECALL_LIMITS.minSubstantive} characters, so small talk cannot
 *    masquerade as the thing being pointed at). Nothing new is asked here, which
 *    is exactly the case that must never come back as "please repeat it".
 *
 * Nothing is invented: a miss reports the anchors that were looked for and the
 * locators that were searched, so the question that follows can be specific.
 *
 * @param input - the message and the material already read by the gate.
 * @returns a hit with an excerpt, or a miss with what was looked for.
 */
export declare function recallFromPrior(input: {
    text: string;
    sources: readonly RecallSource[];
}): RecallResult;
/**
 * Decide the tier of one message.
 *
 * Order of authority, highest first: `full` mode, the answer to a previous
 * question, an explicit escalation, small talk, then the signal balance.
 *
 * @param input - message plus policy.
 * @returns the verdict, with a machine reason and a human sentence.
 */
export declare function classifyTriage(input: TriageInput): TriageVerdict;
/**
 * Read one reply as the answer to the front-desk question.
 *
 * Only the first token decides; anything else falls back to ordinary
 * classification so a user who ignores the question is not stuck.
 * @param reply - the user's next message.
 * @returns `team`, `fast`, or `undefined` when the reply is not an answer.
 */
export declare function resolvePending(reply: string): 'team' | 'fast' | undefined;
/**
 * The line every answer starts with: the tier and why.
 * @param verdict - one classification.
 * @returns a single-line statement in the message's language.
 */
export declare function triageLine(verdict: TriageVerdict): string;
/**
 * Opening line of a team answer.
 * @param lang - language of the message.
 * @returns the greeting.
 */
export declare function greetingLine(lang: TriageLang): string;
/**
 * The one question the front desk asks when the tier is unclear.
 * @param lang - language of the message.
 * @returns the question, with the two accepted replies.
 */
export declare function askLine(lang: TriageLang): string;
/**
 * What the question says when the look-up pass ran and found nothing.
 *
 * Appended to {@link askLine} — never merged into it — because the two say
 * different things: `askLine` asks the tier question, this one reports that the
 * session and the memory files were searched first and states what is missing.
 * It deliberately asks for one specific thing rather than for the whole task
 * again: making the user restate what they already said is the failure this
 * pass exists to remove.
 *
 * @param lang - language of the message.
 * @param miss - the failed look-up, with the anchors and the locators searched.
 * @returns one sentence to put under the question.
 */
export declare function missingNote(lang: TriageLang, miss: RecallMiss): string;
/**
 * Where a looked-up answer came from, stated in the answer itself.
 * @param lang - language of the message.
 * @param hit - the successful look-up.
 * @returns one parenthetical naming the locators.
 */
export declare function recalledNote(lang: TriageLang, hit: RecallHit): string;
/**
 * Prompt for the one call a looked-up answer spends.
 *
 * The worker receives the material the session and the memory files already
 * hold, and is told, in as many words, that it may not do what the failing
 * session did: claim it cannot see earlier work, or ask the user to repeat it.
 * When a detail really is absent it must name that detail — one line — rather
 * than asking for the whole task again.
 *
 * @param verdict - the recalled verdict (for the language).
 * @param request - the user message.
 * @param hit - the material that answered it.
 * @returns the child prompt.
 */
export declare function recallPrompt(verdict: TriageVerdict, request: string, hit: RecallHit): string;
/**
 * Label of a completed front-desk answer (chat and fast tiers).
 * @param verdict - one classification.
 * @returns a short parenthetical for the answer body.
 */
export declare function tierNote(verdict: TriageVerdict): string;
/**
 * What the front desk remembers about its own question (P0-2).
 *
 * A confirmation answer names a *tier*, not a task: "简单" on its own is not an
 * objective. The entry therefore keeps the request the question was about, so the
 * tier the user picked can be executed against the work they actually asked for.
 */
export interface PendingAsk {
    /** The request the front desk asked about, verbatim. */
    originalRequest: string;
    /** When the question was asked (epoch ms); the TTL is measured from here. */
    askedAt: number;
}
/**
 * Compose the text a worker/planner must see after a confirmation answer (P0-2).
 *
 * The selection is stated as a *decision about the original request*, not as a new
 * request: a worker that received only "简单" would either do nothing or invent a
 * task, and the phrase below is the one the acceptance for P0-2 pins.
 * @param verdict - the tier the answer selected.
 * @param originalRequest - the request the front-desk question was about.
 * @param answer - the user's confirmation message, verbatim.
 * @returns the resumed request text.
 */
export declare function resumedRequest(verdict: TriageVerdict, originalRequest: string, answer: string): string;
/**
 * User-visible note when a confirmation question expired before it was answered.
 *
 * The front desk may not reconstruct the original request from an expired entry:
 * a ten-minute-old guess is worse than saying the question expired (P0-2).
 * @param lang - language of the message.
 * @returns one sentence to put at the top of the answer.
 */
export declare function expiredAskNote(lang: TriageLang): string;
/**
 * User-visible note when a pending confirmation exists but the message is not an answer.
 * @param lang - language of the message.
 * @returns one sentence to put at the top of the answer.
 */
export declare function unusedAskNote(lang: TriageLang): string;
/**
 * Prompt for the one call a quick answer spends.
 *
 * Both tiers share the call but not the contract: a chat answer is two sentences
 * and must not start work, while a fast answer is the deliverable itself. The
 * prompt states the tier so the child cannot silently escalate either way.
 * @param verdict - the tier the front desk chose.
 * @param request - the user message (already composed with history).
 * @returns the child prompt.
 */
export declare function singleCallPrompt(verdict: TriageVerdict, request: string, wantJson?: boolean): string;
/** Which canned answer a chat message gets. */
export type ChatBucket = 'greeting' | 'thanks' | 'ack' | 'farewell' | 'about';
/** Classify a chat message into one of the canned buckets. */
export declare function chatBucket(text: string): ChatBucket;
/**
 * The direct-tier answer.
 *
 * A template, not a model call (t52): the tier's promise is *instant*, and a
 * measured one-call version of this tier returned `{"reply":null}` on the live
 * instance while the same script answered the quick tier correctly — a cost and a
 * failure mode for a sentence that has a fixed shape. The template names what the
 * plugin does, so "你能做什么" is answered rather than deflected.
 * @param verdict - the chat verdict (for the language).
 * @param request - the user message, for the bucket.
 * @returns the answer body.
 */
export declare function chatReply(verdict: TriageVerdict, request: string): string;
//# sourceMappingURL=triage.d.ts.map