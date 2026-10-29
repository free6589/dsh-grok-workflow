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
 * Label of a completed front-desk answer (chat and fast tiers).
 * @param verdict - one classification.
 * @returns a short parenthetical for the answer body.
 */
export declare function tierNote(verdict: TriageVerdict): string;
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