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
/** A user naming the team outranks every other signal. */
const FORCE_TEAM = /(?:用|上|开|走|要|叫|让)(?:完整的?)?团队|团队(?:上|来|开工|模式)|(?:full|whole)\s+team|use\s+(?:the\s+)?team|force\s+(?:the\s+)?team|团队走一[遍轮趟]/i;
/** Answers to the front desk's own question. */
const PENDING_FAST = /^[\s\p{P}\p{S}]*(?:简单|快手|直接|快速|单干|自己|不用团队|别用团队|quick|simple|fast|solo|no team|skip)/iu;
const PENDING_TEAM = /^[\s\p{P}\p{S}]*(?:团队|完整|全流程|全部|用团队|team|full|yes|好)/iu;
/**
 * Filler a choice word may carry and still be *only* an answer ("简单", "简单的吧").
 *
 * The front desk asks "简单 / 团队", so the honest reading of the reply is the
 * choice plus a filler character or two — never a choice prefix in front of a
 * new task. Messages such as "好的，帮我看下 log" open with "好" but carry work;
 * treating the whole message as the answer threw that work away (B05).
 */
export const PENDING_FILLER_MAX = 2;
/** Padding a choice word may be wrapped in, and what is left once it is removed. */
const LEADING_NOISE = /^[\s\p{P}\p{S}]+/u;
/**
 * Read one reply as the answer to the front-desk question (B05).
 *
 * The choice word decides the tier ({@link PENDING_FAST} before
 * {@link PENDING_TEAM}: "不用团队" names the team and still selects the quick
 * tier). Everything after it is returned as `task`, so a caller can tell "简单"
 * from "简单，另外把 X 改成 Y" and keep the new work instead of discarding it.
 *
 * @param text - the user's reply.
 * @returns the answer, or `undefined` when the reply is not an answer at all.
 */
export function pendingAnswer(text) {
    for (const [pattern, tier] of [[PENDING_FAST, 'fast'], [PENDING_TEAM, 'team']]) {
        const match = pattern.exec(text);
        if (match === null)
            continue;
        const task = text.slice(match[0].length).replace(LEADING_NOISE, '').trim();
        return {
            choice: match[0].replace(LEADING_NOISE, '').trim(),
            tier,
            task,
            bare: task.length <= PENDING_FILLER_MAX,
        };
    }
    return undefined;
}
/** Greetings, thanks and acknowledgements: no work to route at all. */
const CHAT_EXACT = /^(?:hi|hello|hey|yo|hiya|你好|您好|嗨|哈喽|哈啰|在吗|在么|谢谢|多谢|感谢|谢了|thank you|thanks|thx|ty|ok|okay|好的|好|收到|了解到|明白了|明白|嗯+|哦+|再见|拜拜|晚安|早上好|上午好|中午好|下午好|晚上好)(?:[\s!！。,.，~～?？…、]*)$/i;
/** Questions about the plugin itself: informational, answerable in one short call. */
const CHAT_ABOUT = /(?:你是谁|你叫什么|你能做什么|你会什么|怎么用|如何使用|有哪些功能|做不了什么|\b(?:who are you|what can you do|how do i use|what does this do)\b)/iu;
/**
 * Follow-up on prior conversation ("继续", "详细点", …): only a follow-up when
 * there is history to follow up on (`historyNonEmpty`), otherwise it is read
 * as an ordinary message. Placed before the small-talk rules so a bare
 * "继续" never becomes a greeting template.
 */
const FOLLOW_UP = /(?:说人话|人话|通俗|白话|接着说|继续|详细点|再讲|再说说|展开)/i;
/**
 * A bare choice word with no question waiting for it.
 *
 * The pending answer lasts ten minutes and lives in plugin memory, so a reload or a
 * pause can leave "团队" hanging with nothing to answer. It must not crash and must not
 * silently start a run the user did not pair with a task — see {@link chatReply}.
 */
const BARE_CHOICE = /^(?:简单|快手|直接|快速|单干|团队|完整|全流程|quick|simple|fast|team|full)(?:[\s\p{P}\p{S}]*)$/iu;
/**
 * A question. Short questions used to be read as small talk, which answered them with
 * a greeting template and did no work at all (t53 F1). A question is at least a quick
 * answer: it always names something to find out.
 */
const QUESTION = /(?:[?？]|什么|为什么|为啥|怎么|怎样|如何|几(?![十百千万乎])|多少|哪些?|哪儿?|是否|能不能|可不可以|解释|介绍|定义|含义|区别|原理|吗[\s\p{P}]*$|\b(?:what|why|how|which|when|who|whose|where|explain|describe|compare|is it|are there|can you|does it|what's)(?![\w-])|\b(?:is|are|was|were|does|do|did|can|could|should|would|will|have|has)\s+(?:it|this|that|there|these|those|the|a|an|my|your|our|we|you|i|any|anyone|someone|anything|something)(?![\w-]))/iu;
/**
 * Question *shapes*, not a longer word list.
 *
 * t57's adversarial probes were "端口 8080 被谁占了", "logs 里 500 多不多" and
 * "我该用 yarn 还是 pnpm": every one of them is an obvious question to a reader and
 * none of them contains a word from the dictionary. Patching word by word would have
 * kept losing that game, so the shapes are recognised directly:
 *
 *   A不A      — any single-character verb/adjective repeated around 不/没 (多不多, 是不是,
 *               能不能, 有没有, 会不会 …). One character of context is enough; no list.
 *   还是      — a choice between two things, unless it is the adverb "still"
 *               (但是/可是/仍然/依然, or 还是 + 觉得/认为/想/喜欢/了).
 *   谁        — a person question, unless it is reported speech (问/说/告诉/知道 … 谁).
 */
const A_NOT_A = /([\u4e00-\u9fff])[不没]\1/u;
const CHOICE = /(?<![但可仍依])还是(?!觉|认|想|喜|了)/u;
const WHO = /谁/u;
const WHO_REPORTED = /(?:问|说|告诉|知道)[^。！？?!]{0,6}谁/u;
/** "我还是觉得…" / "他还是走了" are statements, not choices between two things. */
const STATEMENT_CHOICE = /还是\s*(?:觉得|认|想|喜|倾|没|不|未|无|要|是|[^，。！？?,]{0,4}了)/u;
/**
 * Enumeration: numbered or bulleted steps, or semicolons separating actions.
 *
 * "1) 备份  2) 升级" is two steps whatever its length, and so is "备份；升级".
 */
const ENUMERATION = /(?:^|[\n。；;])\s*(?:\d{1,2}\s*[).、．]|[一二三四五六七八九十]{1,3}\s*[、.)]|[-*•]\s+\S)/u;
/**
 * A list of three or more items, separated by 顿号 or a full-width comma
 * ("改配置、重启、验证" / "改配置，重启，验证").
 *
 * Three items in one breath is a plan with parts; two items ("读、写") is usually one
 * action described twice, which is why the count is three and not two. D-025 states
 * that 顿号 counts as sequencing, and this is the rule that makes the statement true.
 * The full-width comma is the same list written the other way round, and reading it
 * as one clause answered it with a single quick worker instead of the team (B09).
 *
 * A list inside a *question* is a choice, not a plan: "A、B、C哪个更快" names three
 * things to compare and asks about them, and reading that as sequencing sent it to
 * the team before the question rule could answer it (B09). The caller therefore
 * applies this signal only when the message is not a question — see
 * {@link triageSignals}.
 */
const COMMA_LIST = /(?:[^\s、，。；;:：]{1,10}[、，]){2,}/u;
/**
 * Concrete anchors: a path, a file name, an error code, a quoted snippet.
 *
 * The quantifier on the first alternative is **bounded** ({1,120}) on purpose.
 * An unbounded `[\w./-]+\.` backtracks over every character of a run for every
 * start position, which is quadratic: measured 2,090 ms on a 32k paste of one
 * letter and 8,519 ms at 64k, all inside the front desk's per-message scan (B02).
 * The bound stops the backtracking at 120 characters; a file name longer than
 * that is not a name this rule needs to recognise.
 *
 * Written with character classes for the slash and the backtick: both are regex
 * literals' own delimiters/quotes and a literal `\/` here ended the pattern early.
 */
const CONCRETE = /(?:[\w./-]{1,120}\.(?:ts|tsx|js|mjs|cjs|json|md|ya?ml|py|go|rs|sh|toml|ini|lock)\b|(?:^|[\s"'\u0060(])(?:src|lib|test|docs|packages|apps)[/]|\b[A-Z]{2,}-\d{2,}\b|\bE[A-Z]{3,}\b|\b0x[0-9a-f]{4,}\b|[\u0060][^\u0060]+[\u0060]|\b(?:error|traceback|stack trace)\b|报错[:：]|错误码)/iu;
/** Sequencing or enumeration: a task with several parts. */
const MULTI_STEP = /(?:先[^。；;!?！？]{0,20}(?:然后|再|接着|之后|最后)|并且|然后|接着|同时|以及|顺便|再把|再帮|之后|第一|首先|其次|最后|并(?:补|写|加|跑|执行|提交|验证|测试|实现|整理|更新|输出|记录|修复|创建|生成|通知|备份|复制|拷贝|升级|部署|删除|修改|发送|打印|回复|迁移|发布|回滚|回退|重启|验证|灰度)|\bstep\s*1\b|\bthen\b|\band\s+also\b|\bafter\s+that\b|\bfirst\b[^.!?\n]{0,40}\b(?:then|second|next)\b|\bafterwards\b|\bfinally\b)/iu;
/** Work that produces or changes an artefact, i.e. what a team is for. */
const DELIVERABLE = /(?:实现|开发|重构|重写|修复|改成|改造|设计|规划|审查|评审|测试|部署|发布|迁移|优化|补全|补齐|编写|写一|生成|整理|分析|调研|对比|矩阵|证据|文档|报告|方案|脚本|代码|接口|配置|题库|教程|\b(?:implement|refactor|rewrite|fix|design|plan|review|tests?|deploy|release|migrate|optimi[sz]e|write|generate|analys|analyz|compare|matrix|evidence|document|report|script|code|api|config)(?![\w./-]))/iu;
/** One concrete action, which is what a single fast worker can do. */
// English verbs need word boundaries: without them `run.ts` (a file name) reads as
// the verb "run", which pushed a refactor objective onto the quick tier.
const ACTION = /(?:算|查|找|列|读|看|改|加|跑|执行|运行|打印|输出|回答|告诉|翻译|总结|归纳|转换|格式化|计算|统计|\b(?:convert|run|execute|print|read|find|list|count|add|rename|translate|summari[sz]e|answer|tell|format)(?![\w./-]))/iu;
/** Words that make an objective vague on its own ("改一下那个"). */
const VAGUE = /(?:那个|这个|那些|这些|它(?!们)|\bthat\b|\bthis\b|\bit\b)/i;
/**
 * Sentence terminators, used as a crude clause count.
 *
 * The full-width comma is here because it is how a Chinese command list is
 * usually written: "改配置，重启，验证" is the same three steps as the 顿号 form,
 * and counting it as one clause answered it with a single quick worker (B09).
 * 顿号 is deliberately *not* a clause break — three 顿号 items are the
 * {@link COMMA_LIST} signal, and counting them twice would make a question that
 * lists choices look like a plan.
 */
const CLAUSE_BREAK = /[。；;，,!！?？]+|\.\s/g;
/** Limits that separate "one shot" from "a plan". */
export const TRIAGE_LIMITS = {
    /** A message longer than this is treated as multi-part work. */
    teamChars: 200,
    /** A chat message is short: a greeting plus padding, never a request. */
    chatChars: 40,
    /**
     * Characters of one message the signal scan reads (B02).
     *
     * Every pattern in {@link triageSignals} is a single pass over its input, but a
     * pasted wall of text makes each pass long — and the pre-B02 `CONCRETE` made
     * one of them quadratic. The head of a message carries the anchors a front desk
     * can act on, so the scan stops there. `long` is still judged on the whole
     * message, which is why a huge paste keeps its tier.
     */
    signalChars: 4_096,
};
/** True when the text contains CJK characters. */
function hasCjk(text) {
    return /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3040-\u30FF]/.test(text);
}
/**
 * Language of one message: CJK present means Chinese, else English.
 *
 * Deliberately not "the Host locale": see the module note and D-022.
 * @param text - the user message.
 * @returns `zh` or `en`.
 */
export function detectLanguage(text) {
    return hasCjk(text) ? 'zh' : 'en';
}
/** Count of separate clauses, capped at three (only the split matters). */
function clauseCount(text) {
    const parts = text.split(CLAUSE_BREAK).filter(part => part.trim() !== '');
    return Math.min(3, parts.length);
}
/**
 * Extract the signals that decide a tier.
 * @param text - the user message.
 * @returns the signals, never throwing.
 */
export function triageSignals(text) {
    const body = text.trim();
    // The scan is bounded (B02, {@link TRIAGE_LIMITS.signalChars}): `long` is the
    // only signal that has to see the whole message, and it is a length check.
    const head = body.slice(0, TRIAGE_LIMITS.signalChars);
    const hits = new Set();
    for (const match of head.matchAll(new RegExp(DELIVERABLE.source, 'giu')))
        hits.add(match[0].toLowerCase());
    // A question is decided first, because it changes what a 顿号 list means: three
    // items in a question are three things being compared ("A、B、C哪个更快"), not
    // three steps to run (B09).
    const question = QUESTION.test(head) ||
        A_NOT_A.test(head) ||
        (CHOICE.test(head) && !STATEMENT_CHOICE.test(head)) ||
        (WHO.test(head) && !WHO_REPORTED.test(head));
    return {
        deliverables: hits.size,
        multiStep: MULTI_STEP.test(head) ||
            ENUMERATION.test(head) ||
            (!question && COMMA_LIST.test(head)),
        action: ACTION.test(head),
        long: body.length > TRIAGE_LIMITS.teamChars,
        clauses: clauseCount(head),
        // "这个报错" is not vague when the message also names a path, a code or a snippet:
        // there is something to look at, so the front desk answers instead of asking.
        vague: VAGUE.test(head) && hits.size === 0 && !CONCRETE.test(head),
        question,
        concrete: CONCRETE.test(head),
    };
}
/**
 * Limits of the look-up pass.
 *
 * The matching limits keep the rule conservative: two anchors, or one anchor
 * plus an explicit pointer at earlier material. One common bigram is not
 * evidence that the material answers the message, and a false hit is worse than
 * a question — it would answer with something the user did not ask about.
 */
export const RECALL_LIMITS = {
    /** Distinct anchors a content match needs. */
    minTokens: 2,
    /** Characters a source needs before a bare "刚才那份" may use it. */
    minSubstantive: 120,
    /** Characters kept from the excerpt shown to the worker and the user. */
    excerptChars: 700,
    /** Characters of lead-in kept before the first anchor in the excerpt. */
    excerptLead: 160,
    /** Anchors reported back (to the user and in the ledger). */
    tokens: 8,
    /** Locators reported back. */
    locators: 4,
    /** Sources one pass may consider. */
    sources: 24,
    /** Turns of conversation the gate forwards to the pass. */
    turns: 6,
    /** Characters of conversation the gate forwards to the pass. */
    historyChars: 3_000,
    /** Earlier rounds compiled into the digest the pass may read. */
    rounds: 4,
    /** Characters of that digest. */
    digestChars: 4_000,
    /** Memory files one pass reads. */
    files: 12,
    /** Characters kept from one memory file. */
    fileChars: 2_400,
    /** Characters of memory files one pass reads in total. */
    totalChars: 16_000,
};
/**
 * Words that carry no subject: an anchor built from them would match any text. *
 * Latin tokens are filtered whole; CJK is reduced to bigrams, so the bigrams of
 * the same function words are listed instead. Deictic bigrams ("刚才", "上面")
 * are deliberately in here as well: they point at material without naming it,
 * which is what {@link PRIOR_REF} handles on its own.
 */
const ANCHOR_STOP_EN = new Set([
    'the', 'and', 'but', 'for', 'with', 'without', 'from', 'into', 'over', 'under', 'about', 'after',
    'before', 'again', 'also', 'just', 'very', 'more', 'most', 'some', 'any', 'all', 'not', 'yes',
    'you', 'your', 'yours', 'our', 'ours', 'their', 'them', 'they', 'this', 'that', 'these', 'those',
    'there', 'here', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'whose', 'why', 'how',
    'can', 'could', 'should', 'would', 'will', 'shall', 'may', 'might', 'must', 'have', 'has', 'had',
    'was', 'were', 'been', 'being', 'does', 'did', 'doing', 'done', 'its', 'it', 'them', 'then',
    'than', 'too', 'such', 'same', 'other', 'another', 'each', 'few', 'both', 'own', 'only', 'onto',
    'please', 'thanks', 'thank', 'okay', 'sure', 'well', 'now', 'still', 'yet', 'ever', 'once',
    'say', 'said', 'tell', 'told', 'see', 'seen', 'look', 'looked', 'show', 'shown', 'give', 'gave',
    'need', 'needs', 'want', 'wants', 'make', 'made', 'take', 'took', 'get', 'got', 'let', 'lets',
    'again', 'above', 'below', 'earlier', 'previous', 'last', 'next', 'one', 'two', 'three',
]);
const ANCHOR_STOP_ZH = new Set([
    '这个', '那个', '这些', '那些', '这样', '那样', '这么', '那么', '这份', '那份', '这里', '那里',
    '一下', '一点', '一些', '一个', '一件', '一起', '一样', '一直', '一遍', '一次', '一般',
    '我们', '你们', '他们', '她们', '它们', '自己', '大家', '帮我', '给你', '给我', '帮忙',
    '时候', '什么', '怎么', '怎样', '为什', '如何', '多少', '哪些', '哪个', '哪儿',
    '可以', '可能', '不是', '就是', '还有', '已经', '因为', '所以', '但是', '然后', '接着',
    '现在', '刚才', '刚刚', '上面', '前面', '之前', '以上', '下面', '后面', '之后', '上一',
    '应该', '需要', '知道', '看看', '说说', '讲讲', '再说', '说出', '出来', '起来', '下去',
    '是不', '是的', '没有', '有点', '也是', '也就', '还是', '或者', '如果', '虽然', '于是',
]);
/** Latin anchors shorter than this carry no subject; numbers are kept from two digits. */
const ANCHOR_MIN_LATIN = 3;
/**
 * A message pointing at earlier material without naming it ("刚才那份", "上面说的",
 * "the above", "previous round"). On its own this is not a question about anything
 * new: it is a request to reuse what the session already has.
 */
const PRIOR_REF = /(?:刚才|刚刚|上面(?:说|那|提)?|前面(?:说|那|提)?|之前(?:说|那|提)?|上一轮|上一条|上一(?:个|份|次)|那份|这份|那个报告|你(?:刚|之前|前面)说|\b(?:earlier|previous|above|last round|before that|as you said)\b)/iu;
/** Anchors of one message: latin words, numbers and CJK bigrams, minus stop words. */
function anchorsOf(text) {
    const out = new Set();
    const lowered = text.toLowerCase();
    for (const match of lowered.matchAll(/[a-z0-9][a-z0-9_.:/-]*/g)) {
        const token = match[0].replace(/[_.:/-]+$/, '');
        if (token.length < ANCHOR_MIN_LATIN)
            continue;
        if (ANCHOR_STOP_EN.has(token))
            continue;
        out.add(token);
    }
    for (const match of text.matchAll(/[\u4e00-\u9fff]+/g)) {
        const run = match[0];
        if (run.length < 2)
            continue;
        for (let index = 0; index + 1 < run.length; index += 1) {
            const bigram = run.slice(index, index + 2);
            if (ANCHOR_STOP_ZH.has(bigram))
                continue;
            out.add(bigram);
        }
    }
    return [...out];
}
/** Collapse whitespace and bound one line of material. */
function clampLine(text, max) {
    const compact = text.replace(/\s+/g, ' ').trim();
    return compact.length <= max ? compact : `${compact.slice(0, Math.max(0, max - 1))}…`;
}
/** The part of one source that carries the first anchor found, bounded. */
function excerptAround(text, anchors) {
    const compact = text.replace(/\s+/g, ' ').trim();
    const lower = compact.toLowerCase();
    let at = -1;
    for (const anchor of anchors) {
        const index = lower.indexOf(anchor.toLowerCase());
        if (index < 0)
            continue;
        at = at < 0 ? index : Math.min(at, index);
    }
    if (at < 0)
        return clampLine(compact, RECALL_LIMITS.excerptChars);
    const start = Math.max(0, at - RECALL_LIMITS.excerptLead);
    const head = start === 0 ? '' : '…';
    return head + clampLine(compact.slice(start, start + RECALL_LIMITS.excerptChars), RECALL_LIMITS.excerptChars);
}
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
export function recallFromPrior(input) {
    const anchors = anchorsOf(input.text);
    const sources = input.sources
        .filter(source => source.text.trim() !== '')
        .slice(0, RECALL_LIMITS.sources);
    const checked = sources.map(source => source.locator).slice(0, RECALL_LIMITS.locators);
    const wanted = anchors.slice(0, RECALL_LIMITS.tokens);
    if (sources.length === 0)
        return { kind: 'miss', tokens: wanted, checked: [] };
    if (anchors.length === 0 && !PRIOR_REF.test(input.text)) {
        return { kind: 'miss', tokens: [], checked };
    }
    // Best source first: the one that carries most of the message's anchors wins,
    // and ties keep the earlier source (history before memory, as the gate passes
    // them in that order), so the same input always yields the same excerpt.
    let best;
    for (const source of sources) {
        const lower = source.text.toLowerCase();
        const matched = anchors.filter(anchor => lower.includes(anchor.toLowerCase()));
        if (matched.length < RECALL_LIMITS.minTokens)
            continue;
        if (best === undefined || matched.length > best.matched.length)
            best = { source, matched };
    }
    if (best !== undefined) {
        return {
            kind: 'hit',
            reason: 'content-match',
            tokens: best.matched.slice(0, RECALL_LIMITS.tokens),
            locators: [best.source.locator],
            excerpt: excerptAround(best.source.text, best.matched),
        };
    }
    if (PRIOR_REF.test(input.text)) {
        const substantial = sources.filter(source => source.text.trim().length >= RECALL_LIMITS.minSubstantive);
        if (substantial.length > 0) {
            const chosen = substantial[0];
            return {
                kind: 'hit',
                reason: 'prior-reference',
                tokens: wanted,
                locators: substantial.map(source => source.locator).slice(0, RECALL_LIMITS.locators),
                excerpt: excerptAround(chosen.text, wanted),
            };
        }
    }
    return { kind: 'miss', tokens: wanted, checked };
}
/** Fallback sentence, also used by the two ambiguity rules. */
const AMBIGUOUS = {
    zh: '信号互相矛盾或线索不足，前台不猜。',
    en: 'the signals conflict or stay too thin, so the front desk does not guess.',
};
/** One sentence per rule, in the message's language. */
const DETAIL = {
    'mode-full': {
        zh: '插件配置为 full 模式：每条消息都走完整工作流，不做分流。',
        en: 'the plugin runs in full mode: every message gets the whole workflow, no triage.',
    },
    'pending-team': {
        zh: '你刚才回答「团队」，按你的选择走团队档。',
        en: 'you just answered "team", so this one runs the team.',
    },
    'pending-fast': {
        zh: '你刚才回答「简单」，按你的选择走快手档。',
        en: 'you just answered "simple", so this one runs as a quick single worker.',
    },
    'forced-team': {
        zh: '你的消息里点名了团队，直接升级为团队档。',
        en: 'your message names the team, so it is escalated to the team tier.',
    },
    'small-talk': {
        zh: '这是问候/寒暄，没有要做的事，前台直接回答。',
        en: 'this is a greeting or acknowledgement with nothing to do, so the front desk answers directly.',
    },
    'about-plugin': {
        zh: '这是在问插件本身能做什么，一次短回答即可。',
        en: 'this asks what the plugin itself can do, answerable in one short reply.',
    },
    question: {
        zh: '这是一个问题，需要查证后才能回答，至少派一个工人去做。',
        en: 'this is a question that needs looking up before it can be answered, so at least one worker does the looking.',
    },
    followup: {
        zh: '这是对上文的追问，有历史可接，一个工人一次就能答。',
        en: 'this is a follow-up on the conversation so far, so one worker answers it in a single pass.',
    },
    recalled: {
        zh: '这条本来会先问你一句，但所需信息已经在会话上文或磁盘记忆里，先回捞再作答。',
        en: 'this would normally be a question, but the material the session already holds answers it, so it is looked up and answered instead of asked about.',
    },
    'stale-choice': {
        zh: '上一轮没有待回答的分流问题（可能插件重载或超时），所以这条没有派工；要用团队请直接说「用团队」加任务。',
        en: 'no front-desk question is waiting for an answer (the plugin may have reloaded, or it expired), so nothing was dispatched; say "use the team" together with the task to escalate.',
    },
    'single-step': {
        zh: '目标是单一动作、线索完整，一个工人一次就能做完。',
        en: 'the request is one concrete action with complete context, so one worker finishes it in a single pass.',
    },
    'multi-step': {
        zh: '目标里有多步工序或交付物，需要规划、执行与复核。',
        en: 'the objective has several steps or a real deliverable, so it needs planning, execution and verification.',
    },
    'long-objective': {
        zh: '目标太长，按多步任务处理。',
        en: 'the objective is long enough to be a plan, not a single action.',
    },
    ambiguous: {
        zh: '信号互相矛盾或线索不足，前台不猜。',
        en: 'the signals conflict or stay too thin, so the front desk does not guess.',
    },
    'ambiguous-escalate': {
        zh: '信号互相矛盾或线索不足，而「拿不准就问」已关闭，按团队档处理。',
        en: 'the signals conflict or stay too thin, and asking is disabled, so it runs the team by default.',
    },
};
/** Tier names shown to the user. */
const TIER_LABEL = {
    chat: { zh: '直答档', en: 'direct' },
    fast: { zh: '快手档', en: 'quick' },
    team: { zh: '团队档', en: 'team' },
    ask: { zh: '确认档', en: 'confirm' },
};
/**
 * Decide the tier of one message.
 *
 * Order of authority, highest first: `full` mode, the answer to a previous
 * question, an explicit escalation, small talk, then the signal balance. A `full`
 * shape that carries {@link TriageInput.escape} drops only the first of those: the
 * rest of the chain decides, and a question the rules cannot settle becomes the
 * team instead of being asked.
 *
 * @param input - message plus policy.
 * @returns the verdict, with a machine reason and a human sentence.
 */
export function classifyTriage(input) {
    const text = input.text.trim();
    const lang = detectLanguage(text);
    const escaped = input.mode === 'full' && input.escape === true;
    const verdict = (tier, reason, greeting = false) => ({
        // The escape hatch has no front desk to ask through, so an `ask` verdict
        // settles as the team; the rule that produced it keeps its own reason.
        tier: escaped && tier === 'ask' ? 'team' : tier,
        reason,
        detail: (DETAIL[reason] ?? AMBIGUOUS)[lang],
        lang,
        greeting,
    });
    if (input.mode === 'full' && !escaped)
        return verdict('team', 'mode-full');
    // Look before asking ({@link recallFromPrior}): a message the rules cannot
    // separate is not necessarily one the session cannot answer. When the gate's
    // look-up pass found the material, the question becomes an answer — tier
    // `fast`, reason `recalled` — and the user is never asked to repeat what the
    // conversation already holds. Without a pass (`prior` undefined) this is the
    // pre-existing choice, byte for byte.
    const ambiguousVerdict = () => {
        if (input.prior?.kind === 'hit')
            return verdict('fast', 'recalled');
        return input.ask ? verdict('ask', 'ambiguous') : verdict('team', 'ambiguous-escalate', true);
    };
    if (input.pending === true) {
        // The reply is read as the answer to the question, whether it is the choice
        // alone or a choice followed by new work (B05) — {@link resumedRequest} is
        // what tells those two apart when the worker text is composed.
        const answer = pendingAnswer(text);
        if (answer?.tier === 'fast')
            return verdict('fast', 'pending-fast');
        if (answer?.tier === 'team')
            return verdict('team', 'pending-team', true);
    }
    else if (BARE_CHOICE.test(text)) {
        // A choice word with no question waiting for it: the pending answer expired, or
        // the plugin was reloaded. Never start a run the user did not pair with a task,
        // and never crash — say what happened (t53 F1, item 6).
        return verdict('chat', 'stale-choice');
    }
    if (FORCE_TEAM.test(text))
        return verdict('team', 'forced-team', true);
    // History-aware follow-up: "继续 / 详细点 / 说人话 …" is a request for more
    // of the conversation so far, never small talk — but only when there is
    // history to follow up on and the shortcut is enabled. Without history it
    // falls through to the ordinary rules (often a question or ask), so a
    // first-message "继续" cannot invent context.
    if (input.followupAsFast !== false && input.historyNonEmpty === true && FOLLOW_UP.test(text)) {
        return verdict('fast', 'followup');
    }
    if (CHAT_EXACT.test(text))
        return verdict('chat', 'small-talk');
    if (text.length <= TRIAGE_LIMITS.chatChars && CHAT_ABOUT.test(text))
        return verdict('chat', 'about-plugin');
    const signals = triageSignals(text);
    // A pointer with no named object ("改一下那个") is the clearest case for the
    // question: everything else can be argued from the text, this cannot. A pointer
    // that comes with a path, a code or a snippet is not vague — see CONCRETE — and a
    // pointer inside a question ("这个得几") is answerable by looking, so it is not
    // "insufficient clues", it is a lookup.
    if (signals.vague && !signals.question) {
        return ambiguousVerdict();
    }
    if (signals.long)
        return verdict('team', 'long-objective', true);
    // Sequencing is the strongest team signal there is: "先…然后…" is two steps by
    // construction, and no amount of shortness or action verbs makes it one call. It is
    // tested before every cheap rule, including the short-inert one (t53 F1, item 1).
    if (signals.multiStep)
        return verdict('team', 'multi-step', true);
    // Team pressure: two or more distinct deliverables, sequencing, or three clauses.
    const teamPoints = (signals.deliverables >= 2 ? 2 : 0)
        + (signals.multiStep ? 1 : 0)
        + (signals.clauses >= 3 ? 1 : 0);
    // Fast pressure: one executable action, one clause, short body.
    const fastPoints = (signals.action || signals.deliverables === 1 ? 1 : 0)
        + (signals.clauses === 1 ? 1 : 0)
        + (text.length <= 120 ? 1 : 0);
    if (teamPoints >= 2)
        return verdict('team', 'multi-step', true);
    if (teamPoints === 1 && fastPoints <= 1)
        return verdict('team', 'multi-step', true);
    // A question is never answered from a greeting template: it names something to find
    // out, so at minimum one worker does the finding (t53 F1, item 2).
    if (signals.question)
        return verdict('fast', 'question');
    // Short and inert: a remark, not a request. Only now may the template answer.
    // ...and it must never swallow a message that names something to look at: "这个报错
    // src/x.ts:42" is short and has no verb, but there is work in it (t53 F1, item 5).
    // A follow-up fragment ("继续", "说人话") is never inert either: with history it
    // was already routed to fast/followup above; without history there is nothing to
    // follow up on, so ask instead of answering from a greeting template.
    if (text.length <= TRIAGE_LIMITS.chatChars && !signals.deliverables && !signals.action && !signals.concrete && signals.clauses === 1) {
        if (FOLLOW_UP.test(text)) {
            return ambiguousVerdict();
        }
        return verdict('chat', 'small-talk');
    }
    if (teamPoints >= 1 && fastPoints >= 2) {
        // Both readings are defensible: this is exactly the case the question exists for.
        return ambiguousVerdict();
    }
    if (fastPoints >= 2)
        return verdict('fast', 'single-step');
    return ambiguousVerdict();
}
/**
 * Read one reply as the answer to the front-desk question.
 *
 * Only the first token decides; anything else falls back to ordinary
 * classification so a user who ignores the question is not stuck.
 * @param reply - the user's next message.
 * @returns `team`, `fast`, or `undefined` when the reply is not an answer.
 */
export function resolvePending(reply) {
    const text = reply.trim();
    if (PENDING_FAST.test(text) && !PENDING_TEAM.test(text))
        return 'fast';
    if (PENDING_TEAM.test(text) && !PENDING_FAST.test(text))
        return 'team';
    return undefined;
}
/**
 * The line every answer starts with: the tier and why.
 * @param verdict - one classification.
 * @returns a single-line statement in the message's language.
 */
export function triageLine(verdict) {
    const label = TIER_LABEL[verdict.tier][verdict.lang];
    return verdict.lang === 'zh'
        ? `档位：${label} — 因为：${verdict.detail}`
        : `Tier: ${label} — because ${verdict.detail}`;
}
/**
 * Opening line of a team answer (legacy template).
 *
 * Kept byte-identical: existing tests pin both languages, and the interactive
 * first answer (firstAnswerPrompt) replaces its *use*, not its wording.
 * @param lang - language of the message.
 * @returns the greeting.
 */
export function greetingLine(lang) {
    return lang === 'zh'
        ? '收到！团队开工中，施工牌在旁边。'
        : 'Got it — the team is on it; the live progress board sits beside this message.';
}
/**
 * The one question the front desk asks when the tier is unclear.
 * @param lang - language of the message.
 * @returns the question, with the two accepted replies.
 */
export function askLine(lang) {
    return lang === 'zh'
        ? '这个要动用团队吗？可回复：简单 / 团队。'
        : 'Should this use the full team? Reply "quick" or "team".';
}
/** One-line list of anchors, or the honest "no named object" fallback. */
function anchorList(tokens, lang) {
    const kept = tokens.filter(token => token.trim() !== '').slice(0, RECALL_LIMITS.tokens);
    if (kept.length > 0)
        return kept.join(lang === 'zh' ? '、' : ', ');
    return lang === 'zh' ? '明确的对象（具体是哪一份/哪一段）' : 'the specific thing being referred to';
}
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
export function missingNote(lang, miss) {
    const anchors = anchorList(miss.tokens, lang);
    const places = miss.checked.length;
    return lang === 'zh'
        ? `（先查后问：已检索会话上文与磁盘记忆 ${places} 处，其中没有能回答这条的材料；还缺：${anchors}。补上这一项就够了。）`
        : `(Looked first: ${places} piece(s) of the conversation and the memory files on disk were searched and none of them answers this. Still missing: ${anchors}. Adding just that is enough.)`;
}
/**
 * Where a looked-up answer came from, stated in the answer itself.
 * @param lang - language of the message.
 * @param hit - the successful look-up.
 * @returns one parenthetical naming the locators.
 */
export function recalledNote(lang, hit) {
    const locators = hit.locators.slice(0, 3).map(locator => clampLine(locatorLabel(locator, lang), 80));
    const where = locators.length === 0 ? (lang === 'zh' ? '已有材料' : 'material already on hand') : locators.join(lang === 'zh' ? '；' : '; ');
    return lang === 'zh'
        ? `（先查后答：这条据已有材料作答（${where}），没有反过来问你。）`
        : `(Looked it up first: answered from material already on hand (${where}); nothing was asked back.)`;
}
/**
 * Chinese wording for the two location labels the gate passes in.
 *
 * A memory file is named by its path, which reads the same in any language; the
 * conversation and the earlier rounds are named by the gate with English labels,
 * and an answer written in Chinese should not end with a parenthetical in
 * English. Anything else is passed through unchanged.
 *
 * @param locator - the locator the gate supplied.
 * @param lang - language of the message.
 * @returns the locator as the user should read it.
 */
function locatorLabel(locator, lang) {
    if (lang !== 'zh')
        return locator;
    if (locator === 'conversation so far')
        return '本会话上文';
    const rounds = /^earlier rounds in this session \((\d+)\)$/.exec(locator);
    if (rounds !== null)
        return `本会话前序 ${rounds[1]} 轮报告`;
    return locator;
}
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
export function recallPrompt(verdict, request, hit) {
    const material = hit.excerpt === '' ? '' : hit.excerpt;
    return [
        // First line = the child's durable display label (src/team-engine.ts).
        verdict.lang === 'zh' ? '快速应答' : 'Quick answer',
        'You are the single worker of a coding assistant, answering a follow-up from material the session already holds.',
        'The material below was retrieved BEFORE anything was asked back: it is the conversation so far and the memory files on disk.',
        'Answer from this material and quote the lines that carry the answer.',
        'Never say you cannot see earlier turns, and never ask the user to repeat or restate work that is already here.',
        'Only if a detail this request needs is genuinely absent from the material, name that one detail in a sentence — do not ask for the whole task again.',
        verdict.lang === 'zh' ? '用中文回答，直接给结论。' : 'Answer in English, giving the conclusion directly.',
        `--- MATERIAL (${hit.locators.join(' | ')}) ---`,
        material,
        '--- END MATERIAL ---',
        '',
        'Request:',
        request,
    ].join('\n');
}
/**
 * Label of a completed front-desk answer (chat and fast tiers).
 * @param verdict - one classification.
 * @returns a short parenthetical for the answer body.
 */
export function tierNote(verdict) {
    if (verdict.lang === 'zh') {
        return verdict.tier === 'chat'
            ? '（这条没有动用团队，前台直答。）'
            : '（这条只派了一个工人，没有开完整团队。）';
    }
    return verdict.tier === 'chat'
        ? '(No team was started: the front desk answered directly.)'
        : '(One worker was sent, not the full team.)';
}
/**
 * Compose the text a worker/planner must see after a confirmation answer (P0-2).
 *
 * The selection is stated as a *decision about the original request*, not as a new
 * request: a worker that received only "简单" would either do nothing or invent a
 * task. Two shapes are possible:
 *
 * 1. **The answer alone** ("简单", "简单的吧") — the choice, and nothing else to do.
 * 2. **An answer that also carries work** ("简单，另外帮我看下 log") — the choice
 *    *and* a new task in one message. Both are named: dropping the new task as
 *    "not a task objective" is how real work got lost (B05).
 *
 * @param verdict - the tier the answer selected.
 * @param originalRequest - the request the front-desk question was about.
 * @param answer - the user's confirmation message, verbatim.
 * @returns the resumed request text.
 */
export function resumedRequest(verdict, originalRequest, answer) {
    const trimmed = answer.trim();
    const shape = pendingAnswer(trimmed);
    const choice = shape === undefined || shape.choice === '' ? trimmed : shape.choice;
    const task = shape !== undefined && !shape.bare ? shape.task : '';
    const team = verdict.tier === 'team';
    if (verdict.lang === 'zh') {
        const lines = [
            '原始任务：',
            originalRequest,
            '',
            // Only the choice word is quoted: quoting the whole message would repeat the
            // new task, which the section below states on its own.
            `用户的确认：${team ? '用户选择团队模式' : '用户选择简单模式'}（「${choice}」是对上一个确认档问题的回答）。`,
        ];
        if (task !== '')
            lines.push('', '这条消息里还带了新任务，和上面的原始任务一起做：', task);
        return lines.join('\n');
    }
    const lines = [
        'Original request:',
        originalRequest,
        '',
        `User confirmation: ${team ? 'the user chose the team mode' : 'the user chose the simple mode'} ("${choice}" answers the previous confirm question).`,
    ];
    if (task !== '')
        lines.push('', 'This message also carries new work; do it together with the original request:', task);
    return lines.join('\n');
}
/**
 * User-visible note when a confirmation question expired before it was answered.
 *
 * The front desk may not reconstruct the original request from an expired entry:
 * a ten-minute-old guess is worse than saying the question expired (P0-2).
 * @param lang - language of the message.
 * @returns one sentence to put at the top of the answer.
 */
export function expiredAskNote(lang) {
    return lang === 'zh'
        ? '上一次的确认档问题已经过期（超过 10 分钟），我没有把它当作任务；要继续做，请把原来的任务重新描述一次。'
        : 'The previous confirm question expired (more than 10 minutes ago), so it was not treated as a task; describe the original task again if you still want it done.';
}
/**
 * User-visible note when a pending confirmation exists but the message is not an answer.
 * @param lang - language of the message.
 * @returns one sentence to put at the top of the answer.
 */
export function unusedAskNote(lang) {
    return lang === 'zh'
        ? '上一条确认档问题没有得到「简单」或「团队」的回答，所以它已经作废；这条按新消息重新判断，要接着做请把任务再说一次。'
        : 'The previous confirm question never got a "quick" or "team" answer, so it is void; this message was routed on its own, so restate the task if you want it continued.';
}
/**
 * The line that turns a natural answer into a schema-shaped one.
 *
 * Only used on the retry (see `runSingleCall`): measured on :3100, the plain call
 * returns the child's text reliably, while a schema-constrained call occasionally
 * answers in prose and the guest collapses that to `{"reply":null}`.
 */
const JSON_DEMAND = 'Return only a JSON object with one field: {"reply": "<your answer>"}.';
/**
 * Prompt for the one call a quick answer spends.
 *
 * Both tiers share the call but not the contract: a chat answer is two sentences
 * and must not start work, while a fast answer is the deliverable itself. The
 * prompt states the tier so the child cannot silently escalate either way.
 * @param verdict - the tier the front desk chose.
 * @param request - the user message (already composed with history).
 * @param wantJson - when true, demand the `{"reply": ...}` shape (retry only).
 * @param context - bounded conversation/carry-over block the child may answer from.
 *   Empty keeps the pre-v0.5.1 prompt byte-identical; non-empty is rendered as a
 *   `Context (do not ask for what is already here):` block before `Request:` so a
 *   follow-up like "用人话告诉我刚才…" no longer answers blind.
 * @returns the child prompt.
 */
export function singleCallPrompt(verdict, request, wantJson = false, context = '') {
    const contextBlock = context.trim() === ''
        ? []
        : ['Context (do not ask for what is already here):', context.trim(), ''];
    if (verdict.tier === 'chat') {
        return [
            // First line = the child's durable display label (src/team-engine.ts).
            verdict.lang === 'zh' ? '前台直答' : 'Front-desk answer',
            'You are the front desk of a coding assistant. Answer this message in one or two short sentences.',
            // Not "do not call tools": the structured result is returned through a tool,
            // so forbidding tools makes the child answer in prose and the guest collapses
            // its reply to null (measured on :3100: agentsStarted=1, value={"reply":null}).
            'Do not start any task and do not claim work was done.',
            verdict.lang === 'zh' ? '用中文回答，把回答写进 reply 字段。' : 'Answer in English, inside the reply field.',
            // The schema is the transport, so the prompt has to say so: a child that
            // answers in prose returns no structured value, and the guest collapses that
            // to null (measured on :3100 before this line existed).
            'Return only a JSON object with one field: {"reply": "<your answer>"}.',
            '',
            'Message:',
            request,
        ].join('\n');
    }
    return [
        // First line = the child's durable display label (src/team-engine.ts).
        verdict.lang === 'zh' ? '快速执行' : 'Front-desk task',
        'You are the single worker of a coding assistant, answering one simple request in one pass.',
        'Do the request and give the result directly: state what you did or what the answer is, briefly.',
        'Do not plan, do not delegate, do not write a report.',
        verdict.lang === 'zh' ? '用中文回答。' : 'Answer in English.',
        ...wantJson ? [JSON_DEMAND] : [],
        '',
        ...contextBlock,
        'Request:',
        request,
    ].join('\n');
}
/** Classify a chat message into one of the canned buckets. */
export function chatBucket(text) {
    const body = text.trim();
    if (CHAT_ABOUT.test(body))
        return 'about';
    if (/^(?:谢谢|多谢|感谢|谢了|thank you|thanks|thx|ty)/i.test(body))
        return 'thanks';
    if (/^(?:再见|拜拜|晚安|bye|goodbye|good night)/i.test(body))
        return 'farewell';
    if (/^(?:ok|okay|好的|好|收到|了解|明白了?|明白|嗯+|哦+)/i.test(body))
        return 'ack';
    return 'greeting';
}
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
export function chatReply(verdict, request) {
    if (verdict.reason === 'stale-choice') {
        return verdict.lang === 'zh'
            ? '上一轮没有待回答的分流问题（可能插件重载或超时），所以这条没派工。要说用团队，请把它和任务写在一起，例如「用团队：把 X 改成 Y」。'
            : 'No front-desk question is waiting for an answer (the plugin may have reloaded, or it expired), so nothing was dispatched. To use the team, name it together with the task, e.g. "use the team: change X to Y".';
    }
    const bucket = chatBucket(request);
    if (verdict.lang === 'zh') {
        switch (bucket) {
            case 'thanks': return '不客气。需要干活的时候直接说，我会按难易决定是派一个工人还是开团队。';
            case 'farewell': return '好，随时回来。';
            case 'ack': return '收到。下一件事直接说就行。';
            case 'about': return '我是这条消息的前台：每条消息都先过我这里，我再决定走哪一档——闲聊直接答、简单任务派一个工人、复杂任务开团队（规划+干活+检查+交工单），拿不准就反问你一句。团队档会显示进度面板，你说「用团队」可以随时强制升级。';
            default: return '你好！我在。要做事就直接说：简单的我派一个工人，复杂的我开团队，拿不准我会先问你一句。';
        }
    }
    switch (bucket) {
        case 'thanks': return 'You are welcome. Say the word when there is work: I send one worker for a simple task and the team for a complex one.';
        case 'farewell': return 'See you.';
        case 'ack': return 'Got it. Send the next one whenever you are ready.';
        case 'about': return 'I am the front desk for this conversation: every message passes me first, and I pick the tier — direct for small talk, one worker for a simple task, the full team (plan, execute, verify, report) for a complex one, and a question when it is unclear. The team tier shows a live progress board, and saying "use the team" always escalates.';
        default: return 'Hello! I am here. Say what you need: one worker for something simple, the team for something complex, and I will ask which when it is unclear.';
    }
}
/* ------------------------------------------------- first answer (live) ---- */
/**
 * Bounds for the live first answer.
 *
 * The context the first-answer call may read is bounded once, here: history /
 * carry-over / memory summary, at most 2 000 characters, possibly empty.
 */
export const FIRST_ANSWER_LIMITS = {
    /** Characters of context the first-answer prompt carries. */
    contextChars: 2_000,
    /** Live zh answer budget (characters). */
    zhChars: 120,
    /** Live en answer budget (words). */
    enWords: 80,
    /** Sanitized first-answer ceiling (only bites when the model ignored the budget). */
    sanitizedChars: 800,
};
/**
 * Prompt for the one call a live first answer spends.
 *
 * First line is the child's durable display label (`首答`), exactly like the
 * other front-desk prompts. The body forces a fresh, short, user-language answer
 * with a fixed four-part shape and an explicit forbidden list, so each receipt
 * is written live per message instead of pasted from a template.
 *
 * @param request - the user original.
 * @param context - bounded history/carry-over/memory summary, possibly empty.
 * @param lang - the message language; picks the answer language and budget.
 * @returns the child prompt.
 */
export function firstAnswerPrompt(request, context, lang) {
    const bounded = (context ?? '').slice(0, FIRST_ANSWER_LIMITS.contextChars);
    const languageLine = lang === 'zh'
        ? 'Language: Chinese (中文). Write the answer in Chinese.'
        : 'Language: English. Write the answer in English.';
    const lengthLine = lang === 'zh'
        ? `Length: at most ${FIRST_ANSWER_LIMITS.zhChars} Chinese characters. Hard limit.`
        : `Length: at most ${FIRST_ANSWER_LIMITS.enWords} English words. Hard limit.`;
    return [
        '首答',
        'You are the front desk of a coding assistant. Give an instant first answer while the team works in the background.',
        languageLine,
        'Write fresh each time, no boilerplate, no fixed sentences.',
        lengthLine,
        'Cover four points in order, concisely:',
        '① what you heard the user wants (one sentence);',
        '② what can be said now, and what honestly needs verification (name what must be checked, never invent conclusions);',
        '③ which 2-4 directions the background subtasks will check (directions only, no conclusions, no promises);',
        '④ how to interrupt: the user can say ‘停掉X/重点查Y’ ("stop X / focus on Y") to redirect, and the live progress board beside this message shows the run (word this naturally).',
        'FORBIDDEN in your answer: ledger labels (Grok workflow, Objective, Plan, Failures, Confirmed evidence, Incomplete, Model routes, Deadline, Route switches, Errors, Synthesis, Uncertainties, etc.), counts and tallies, station numbers, coordinates, file paths, shell commands, code, model or route names, the fixed sentence “正在执行，进度节点在旁” (and its English twin "Running now; the live progress board sits beside this message."), repeating the same content in Chinese and English.',
        'Context (bounded, may be empty; history/carryover/memory summary — do not ask for what is already here):',
        bounded === '' ? '(empty)' : bounded,
        '',
        'Request (the user original — answer this):',
        request,
    ].join('\n');
}
/** Ledger-shaped lines that must never reach a first answer. */
const FIRST_ANSWER_TAINTED = [
    /^\s*(?:Grok workflow:|Objective:|Plan:|Failures:|Plan failure:|Confirmed evidence:|Incomplete:|Final answer:|Model routes:|Deadline:|Route switches:|Route overflows|Errors:|Synthesis:|Uncertainties:)/i,
    /runId|taskId|childId|chainIndex/i,
    /\battempt:/i,
];
/** Machine detail stripped from a first answer (simplified delivery-side strip). */
const FIRST_ANSWER_MACHINE = [
    /```[\s\S]*?```/g,
    /`[^`\n]*`/g,
    /\bhttps?:\/\/\S+/g,
    /\bfile:\/\/\S+/g,
    /(?:^|[\s(（"'=])(?:~|\.{1,2})?\/[\w.@%+-]+(?:\/[\w.@%+-]+)+/g,
    /\b[\w-]+(?:\.[\w-]+)*\.(?:ts|tsx|js|mjs|cjs|json|md|ya?ml|lock|sh|py|log|txt|csv|png|jpe?g|svg|zip|gz)\b/gi,
    /\b[0-9a-f]{8,64}\b/gi,
    /\b(?:npm|pnpm|npx|yarn|vitest|jest|tsc|git|curl|wget|docker|python3?|pip3?)\s+[^，。；\n]{0,120}/gi,
];
/**
 * Scrub a live first answer the way the delivery side scrubs its human block.
 *
 * Simplified, dependency-free copy of the delivery idea (the delivery helpers are
 * not exported): drop ledger-labelled lines, strip machine detail, collapse
 * whitespace per line, and ceiling the result. Never throws; empty in means empty out.
 *
 * @param text - the model text.
 * @returns the cleaned text, possibly empty when nothing survivable remains.
 */
export function sanitizeFirstAnswer(text) {
    const kept = [];
    for (const raw of String(text ?? '').split('\n')) {
        const line = raw.trimEnd();
        if (line.trim() === '')
            continue;
        if (FIRST_ANSWER_TAINTED.some(pattern => pattern.test(line)))
            continue;
        kept.push(line);
    }
    let out = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    for (const pattern of FIRST_ANSWER_MACHINE) {
        pattern.lastIndex = 0;
        out = out.replace(pattern, ' ');
    }
    const lines = out
        .split('\n')
        .map(line => line.replace(/[ \t]+/g, ' ').trim())
        .filter(line => line !== '');
    out = lines.join('\n')
        .replace(/（\s*）|\(\s*\)/g, '')
        .trim();
    if (out.length > FIRST_ANSWER_LIMITS.sanitizedChars) {
        out = `${out.slice(0, FIRST_ANSWER_LIMITS.sanitizedChars - 1)}…`;
    }
    return out;
}
/**
 * Explicit template fallback entered when the lightweight first-answer call fails.
 *
 * It says so plainly (no silent template), names the background directions, the
 * progress board, and the redirect wording. The zh text carries the exact phrase
 * the contract pins; the en text carries its equivalent.
 *
 * @param lang - the message language.
 * @param requestSnippet - user original, quoted truncated to show what was heard.
 * @returns the fallback text.
 */
export function firstAnswerFallback(lang, requestSnippet = '') {
    const snippet = requestSnippet.trim().slice(0, 24);
    if (lang === 'en') {
        const heard = snippet === '' ? 'your request' : `“${snippet}”`;
        return [
            `First answer is a template fallback: the light model did not reply. I heard ${heard}.`,
            'The background team will check along planning, execution and verification before concluding; the live progress board beside this message shows the run.',
            `To redirect, say 'stop X / focus on Y'.`,
        ].join(' ');
    }
    const heard = snippet === '' ? '你的这条消息' : `“${snippet}”`;
    return `首答是模板兜底：轻量模型没回。已听懂${heard}；后台将分拆解、执行、核验几路核验后再给结论，进度节点在旁可看；要调整就说‘停掉X/重点查Y’，我会重定向。`;
}
//# sourceMappingURL=triage.js.map