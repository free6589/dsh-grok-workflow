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
/** A user naming the team outranks every other signal. */
const FORCE_TEAM = /(?:用|上|开|走|要|叫|让)(?:完整的?)?团队|团队(?:上|来|开工|模式)|(?:full|whole)\s+team|use\s+(?:the\s+)?team|force\s+(?:the\s+)?team|团队走一[遍轮趟]/i;
/** Answers to the front desk's own question. */
const PENDING_FAST = /^[\s\p{P}\p{S}]*(?:简单|快手|直接|快速|单干|自己|不用团队|别用团队|quick|simple|fast|solo|no team|skip)/iu;
const PENDING_TEAM = /^[\s\p{P}\p{S}]*(?:团队|完整|全流程|全部|用团队|team|full|yes|好)/iu;
/** Greetings, thanks and acknowledgements: no work to route at all. */
const CHAT_EXACT = /^(?:hi|hello|hey|yo|hiya|你好|您好|嗨|哈喽|哈啰|在吗|在么|谢谢|多谢|感谢|谢了|thank you|thanks|thx|ty|ok|okay|好的|好|收到|了解到|明白了|明白|嗯+|哦+|再见|拜拜|晚安|早上好|上午好|中午好|下午好|晚上好)(?:[\s!！。,.，~～?？…、]*)$/i;
/** Questions about the plugin itself: informational, answerable in one short call. */
const CHAT_ABOUT = /(?:你是谁|你叫什么|你能做什么|你会什么|怎么用|如何使用|有哪些功能|做不了什么|\b(?:who are you|what can you do|how do i use|what does this do)\b)/iu;
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
 * A 顿号 list of three or more items ("改配置、重启、验证").
 *
 * Three items in one breath is a plan with parts; two items ("读、写") is usually one
 * action described twice, which is why the count is three and not two. D-025 states
 * that 顿号 counts as sequencing, and this is the rule that makes the statement true.
 */
const COMMA_LIST = /(?:[^\s、，。；;:：]{1,10}、){2,}/u;
/** Concrete anchors: a path, a file name, an error code, a quoted snippet. */
// Written with character classes for the slash and the backtick: both are regex
// literals' own delimiters/quotes and a literal `\/` here ended the pattern early.
const CONCRETE = /(?:[\w./-]+\.(?:ts|tsx|js|mjs|cjs|json|md|ya?ml|py|go|rs|sh|toml|ini|lock)\b|(?:^|[\s"'\u0060(])(?:src|lib|test|docs|packages|apps)[/]|\b[A-Z]{2,}-\d{2,}\b|\bE[A-Z]{3,}\b|\b0x[0-9a-f]{4,}\b|[\u0060][^\u0060]+[\u0060]|\b(?:error|traceback|stack trace)\b|报错[:：]|错误码)/iu;
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
/** Sentence terminators, used as a crude clause count. */
const CLAUSE_BREAK = /[。；;!！?？]+|\.\s/g;
/** Limits that separate "one shot" from "a plan". */
export const TRIAGE_LIMITS = {
    /** A message longer than this is treated as multi-part work. */
    teamChars: 200,
    /** A chat message is short: a greeting plus padding, never a request. */
    chatChars: 40,
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
    const hits = new Set();
    for (const match of body.matchAll(new RegExp(DELIVERABLE.source, 'giu')))
        hits.add(match[0].toLowerCase());
    return {
        deliverables: hits.size,
        multiStep: MULTI_STEP.test(body) || ENUMERATION.test(body) || COMMA_LIST.test(body),
        action: ACTION.test(body),
        long: body.length > TRIAGE_LIMITS.teamChars,
        clauses: clauseCount(body),
        // "这个报错" is not vague when the message also names a path, a code or a snippet:
        // there is something to look at, so the front desk answers instead of asking.
        vague: VAGUE.test(body) && hits.size === 0 && !CONCRETE.test(body),
        question: QUESTION.test(body) ||
            A_NOT_A.test(body) ||
            (CHOICE.test(body) && !STATEMENT_CHOICE.test(body)) ||
            (WHO.test(body) && !WHO_REPORTED.test(body)),
        concrete: CONCRETE.test(body),
    };
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
 * question, an explicit escalation, small talk, then the signal balance.
 *
 * @param input - message plus policy.
 * @returns the verdict, with a machine reason and a human sentence.
 */
export function classifyTriage(input) {
    const text = input.text.trim();
    const lang = detectLanguage(text);
    const verdict = (tier, reason, greeting = false) => ({
        tier,
        reason,
        detail: (DETAIL[reason] ?? AMBIGUOUS)[lang],
        lang,
        greeting,
    });
    if (input.mode === 'full')
        return verdict('team', 'mode-full');
    if (input.pending === true) {
        if (PENDING_FAST.test(text))
            return verdict('fast', 'pending-fast');
        if (PENDING_TEAM.test(text))
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
        return input.ask ? verdict('ask', 'ambiguous') : verdict('team', 'ambiguous-escalate', true);
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
    if (text.length <= TRIAGE_LIMITS.chatChars && !signals.deliverables && !signals.action && !signals.concrete && signals.clauses === 1) {
        return verdict('chat', 'small-talk');
    }
    if (teamPoints >= 1 && fastPoints >= 2) {
        // Both readings are defensible: this is exactly the case the question exists for.
        return input.ask ? verdict('ask', 'ambiguous') : verdict('team', 'ambiguous-escalate', true);
    }
    if (fastPoints >= 2)
        return verdict('fast', 'single-step');
    return input.ask ? verdict('ask', 'ambiguous') : verdict('team', 'ambiguous-escalate', true);
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
 * Opening line of a team answer.
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
 * @returns the child prompt.
 */
export function singleCallPrompt(verdict, request, wantJson = false) {
    if (verdict.tier === 'chat') {
        return [
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
        'You are the single worker of a coding assistant, answering one simple request in one pass.',
        'Do the request and give the result directly: state what you did or what the answer is, briefly.',
        'Do not plan, do not delegate, do not write a report.',
        verdict.lang === 'zh' ? '用中文回答。' : 'Answer in English.',
        ...wantJson ? [JSON_DEMAND] : [],
        '',
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
//# sourceMappingURL=triage.js.map