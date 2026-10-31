/**
 * Defensive credential redaction for model-facing reports and diagnostics.
 * This is a safety net, not a license to place secrets in prompts or logs.
 */
/**
 * The single source of truth for credential shapes.
 *
 * The generated workflow script cannot import host code, so `src/script.ts`
 * renders its prompt-side redactor from this list (see `redactionRulesSource`).
 * Adding a rule here therefore protects both the report boundary and the
 * verifier/retry prompts; `test/redact.spec.ts` asserts the two implementations
 * agree over one corpus so they cannot drift apart.
 */
export const REDACTION_RULES = [
    {
        name: 'private-key',
        pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
        replacement: '[REDACTED PRIVATE KEY]',
    },
    {
        name: 'jwt',
        pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
        replacement: '[REDACTED JWT]',
    },
    {
        name: 'openai-style-key',
        pattern: /\b(?:sk|rk|pk)[-_](?:live|test)[-_][A-Za-z0-9_-]{10,}\b|\b(?:sk|rk|pk)-[A-Za-z0-9_-]{16,}\b/g,
        replacement: '[REDACTED API KEY]',
    },
    {
        name: 'github-token',
        // `ghp_…` classic and `github_pat_…` fine-grained tokens.
        pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
        replacement: '[REDACTED GITHUB TOKEN]',
    },
    {
        name: 'gitlab-token',
        pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/g,
        replacement: '[REDACTED GITLAB TOKEN]',
    },
    {
        name: 'npm-token',
        pattern: /\bnpm_[A-Za-z0-9_-]{20,}\b/g,
        replacement: '[REDACTED NPM TOKEN]',
    },
    {
        name: 'slack-token',
        pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
        replacement: '[REDACTED SLACK TOKEN]',
    },
    {
        name: 'aws-access-key',
        // AKIA = long-term access key, ASIA = temporary session key.
        pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
        replacement: '[REDACTED AWS ACCESS KEY]',
    },
    {
        name: 'google-api-key',
        pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/g,
        replacement: '[REDACTED GOOGLE API KEY]',
    },
    {
        name: 'google-oauth-token',
        pattern: /\bya29\.[0-9A-Za-z_-]{20,}\b/g,
        replacement: '[REDACTED GOOGLE OAUTH TOKEN]',
    },
    {
        // Cookie / Set-Cookie headers carry session identifiers; the whole value is
        // secret even when no `token=`-shaped key appears in it.
        name: 'cookie-header',
        pattern: /(^|\n)((?:set-)?cookie\s*:\s*)[^\n]*/gi,
        replacement: '$1$2[REDACTED]',
    },
    {
        name: 'slack-webhook',
        pattern: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+/g,
        replacement: '[REDACTED SLACK WEBHOOK]',
    },
    {
        name: 'telegram-bot-token',
        pattern: /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/g,
        replacement: '[REDACTED TELEGRAM TOKEN]',
    },
    {
        name: 'authorization-bearer',
        pattern: /\b(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi,
        replacement: '$1[REDACTED]',
    },
    {
        // `Authorization: Basic base64(user:password)` — header form and the JSON
        // form a tool result or transcript dump can carry.
        name: 'authorization-basic',
        pattern: /\b(Authorization"?\s*[:=]\s*"?Basic\s+)[A-Za-z0-9+/=._~-]{8,}/gi,
        replacement: '$1[REDACTED]',
    },
    {
        name: 'url-secret-query',
        pattern: /([?&](?:token|key|secret|password|passwd|api[_-]?key|apikey|access[_-]?token)=)[^&#\s]+/gi,
        replacement: '$1[REDACTED]',
    },
    {
        // Azure Blob/Queue/Table SAS tokens carry the signature in `sig` (the full
        // `sharedaccesssignature` spelling also appears in older clients).
        name: 'azure-sas-signature',
        pattern: /([?&](?:sig|signature|sharedaccesssignature)=)[^&#\s]+/gi,
        replacement: '$1[REDACTED]',
    },
    {
        name: 'url-userinfo',
        pattern: /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@]*:[^\s/@]+@/gi,
        replacement: '$1[REDACTED]@',
    },
    {
        // Quoted values (`{"token":"…"}`, `password = '…'`) keep their quote style so
        // the redacted text stays valid JSON / shell. Group 1 is the key's closing
        // quote (if the key itself was quoted), group 2 the separator, group 3 the
        // value quote. The repetition is bounded to 8 segments: unbounded
        // `(?:[A-Za-z0-9]+[_-])*` backtracking took ~19 s on a 100 KB `a_` input.
        name: 'key-value-quoted',
        pattern: /(?<![A-Za-z0-9])((?:[A-Za-z0-9]+[_-]){0,8}(?:api[_-]?key|access[_-]?key(?:[_-]?id)?|private[_-]?key|secret[_-]?access[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|token|secret|passphrase|password|passwd|pass|pwd))(["']?)(\s*[:=]\s*)(["'])(?:\\.|(?!\4)[^\\\n])*\4/gi,
        replacement: '$1$2$3$4[REDACTED]$4',
    },
    {
        // Bare values (`db_pass=hunter2`, `OPENAI_API_KEY=sk-…`). At least 6 chars so
        // ordinary prose like `the token: count is 3` is left alone; values that
        // start with a quote or a `[REDACTED` placeholder are handled by the rule
        // above and must not be matched again.
        name: 'key-value',
        pattern: /(?<![A-Za-z0-9])((?:[A-Za-z0-9]+[_-]){0,8}(?:api[_-]?key|access[_-]?key(?:[_-]?id)?|private[_-]?key|secret[_-]?access[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|token|secret|passphrase|password|passwd|pass|pwd))(["']?)(\s*[:=]\s*)(?!["'\[])([^\s,;]{6,})/gi,
        replacement: '$1$2$3[REDACTED]',
    },
];
/** Replace known credential shapes in arbitrary text. */
export function redactSecrets(input) {
    let value = input;
    for (const rule of REDACTION_RULES)
        value = value.replace(rule.pattern, rule.replacement);
    return value;
}
/** Redact a thrown value without ever throwing from the redactor. */
export function redactError(error) {
    try {
        if (error instanceof Error) {
            return redactSecrets(error.message);
        }
        return redactSecrets(String(error));
    }
    catch {
        return '[unrenderable error]';
    }
}
/**
 * Recursively copy a JSON-like value while redacting every string.
 * Cycles and non-JSON values are converted to a safe placeholder.
 */
export function redactDeep(value) {
    return walk(value, new WeakSet(), 0);
}
function walk(value, seen, depth) {
    if (depth > 40)
        return '[REDACTED: nesting too deep]';
    if (typeof value === 'string')
        return redactSecrets(value);
    if (value === null || typeof value !== 'object')
        return value;
    if (seen.has(value))
        return '[REDACTED: circular]';
    seen.add(value);
    if (Array.isArray(value)) {
        return value.map(item => walk(item, seen, depth + 1));
    }
    const out = {};
    for (const [key, child] of Object.entries(value)) {
        // A key named token/password/cookie is a strong signal that the *value* is a
        // secret even when it does not match any credential shape (e.g. a short
        // password or an opaque session id). Redact the value wholesale instead of
        // relying on the text patterns alone.
        const redactedKey = redactSecrets(key);
        out[redactedKey] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : walk(child, seen, depth + 1);
    }
    return out;
}
/** True when a JSON key names a credential field. Word-bounded, so `tokenCount` is not matched. */
const SENSITIVE_KEY = /(?:^|[_-])(?:token|secret|passphrase|password|passwd|pass|pwd|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|authorization|cookie|session|credentials?)($|[_-])/i;
//# sourceMappingURL=redact.js.map