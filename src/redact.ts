/**
 * Defensive credential redaction for model-facing reports and diagnostics.
 * This is a safety net, not a license to place secrets in prompts or logs.
 */

/** One credential shape, its replacement, and a stable name for diagnostics. */
export interface RedactionRule {
  /** Stable rule name; the generated workflow script mirrors these rules by name. */
  name: string
  /** The credential shape to replace. */
  pattern: RegExp
  /** Replacement text; `$1`-style backreferences keep the non-secret prefix. */
  replacement: string
}

/**
 * The single source of truth for credential shapes.
 *
 * The generated workflow script cannot import host code, so `src/script.ts`
 * renders its prompt-side redactor from this list (see `redactionRulesSource`).
 * Adding a rule here therefore protects both the report boundary and the
 * verifier/retry prompts; `test/redact.spec.ts` asserts the two implementations
 * agree over one corpus so they cannot drift apart.
 */
export const REDACTION_RULES: readonly RedactionRule[] = [
  {
    name: 'private-key',
    pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    replacement: '[REDACTED PRIVATE KEY]',
  },
  {
    // GnuPG armor carries the same material as a PEM block under a different
    // banner, so `[A-Z0-9 ]*PRIVATE KEY` cannot match "PRIVATE KEY BLOCK".
    name: 'pgp-private-key',
    pattern: /-----BEGIN PGP (?:PRIVATE|SECRET) KEY BLOCK-----[\s\S]*?-----END PGP (?:PRIVATE|SECRET) KEY BLOCK-----/g,
    replacement: '[REDACTED PRIVATE KEY]',
  },
  {
    // A key file that was `base64 -w0`'d, or that sits base64-encoded inside a
    // JSON field or a larger blob, carries no banner the rules above can see:
    // the armor only exists after decoding. Match the *encoded* banner instead.
    // Base64 emits independent 4-character groups of 3 source bytes, so a PEM
    // body embedded at an unknown byte offset starts its banner in a different
    // group: there are three possible starting offsets and each yields a
    // different 20-character literal. All three are spelled out below, taken
    // from bytes 3..17 of `-----BEGIN PRIVATE KEY` ("---BEGIN PRIVATE") so no
    // literal depends on the bytes that precede the block. No ordinary base64
    // text or prose contains one of them by chance.
    // GnuPG armor is encoded the same way, so the same three offsets are spelled
    // out for `-----BEGIN PGP PRIVATE KEY BLOCK` and its `SECRET` spelling. Each
    // PGP window reaches byte 17 of the banner, which is what keeps it apart from
    // `PGP PUBLIC KEY BLOCK` ("PRI"/"SEC" vs "PUB"); a window that stopped at the
    // shared `-----BEGIN PGP P` prefix would redact public keys as well.
    // Both the blob before the banner and the rest of it are replaced, so no
    // key material survives; continuation lines of a wrapped blob are consumed
    // while the first non-base64 line ends the match. A base64 `CERTIFICATE`
    // block is left alone on purpose: it is public material (`docs/ARCHITECTURE.md`).
    name: 'base64-private-key',
    pattern: /(?<![A-Za-z0-9+/])[A-Za-z0-9+/]*(?:LS1CRUdJTiBQUklWQVRF|LUJFR0lOIFBSSVZBVEUg|QkVHSU4gUFJJVkFURSBL|LS1CRUdJTiBQR1AgUFJJ|LUJFR0lOIFBHUCBQUklW|QkVHSU4gUEdQIFBSSVZB|LS1CRUdJTiBQR1AgU0VD|LUJFR0lOIFBHUCBTRUNS|QkVHSU4gUEdQIFNFQ1JF)[A-Za-z0-9+/=]*(?:\r?\n[A-Za-z0-9+/=]{16,})*/g,
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
    // secret even when no `token=`-shaped key appears in it. The header also
    // appears inside a quoted shell argument (`curl -H 'Cookie: …'`) or a JSON
    // string, where it is not at the start of a line — hence the quote
    // alternatives. The value stops at the closing quote so the rest of the
    // command survives.
    name: 'cookie-header',
    pattern: /(^|\n|['"`])([ \t]*(?:set-)?cookie\s*:\s*)[^\n'"`]*/gi,
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
    // Cloud object stores put the signature in a query parameter: Azure SAS
    // (`sig`, `signature`, the older `sharedaccesssignature`), S3 presigned URLs
    // (`X-Amz-Signature`) and GCS (`X-Goog-Signature`). `auth` is the generic
    // gateway spelling. The signature alone grants access, so it is a bearer
    // credential even though the URL carries no userinfo.
    name: 'url-signature-query',
    pattern: /([?&](?:sig|signature|sharedaccesssignature|x-amz-signature|x-goog-signature|auth)=)[^&#\s]+/gi,
    replacement: '$1[REDACTED]',
  },
  {
    name: 'url-userinfo',
    pattern: /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@]*:[^\s/@]+@/gi,
    replacement: '$1[REDACTED]@',
  },
  {
    // JSON numeric secrets (`{"token":1234567890}`): replace with a quoted
    // placeholder so the redacted document is still valid JSON.
    name: 'key-value-json-number',
    pattern: /(?<![A-Za-z0-9])((?:[A-Za-z0-9]+[_-]){0,8}(?:api[_-]?key|access[_-]?key(?:[_-]?id)?|private[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|auth[_-]?token|session[_-]?id|client[_-]?secret|token|secret|passphrase|password|passwd|pass|pwd|session|credentials?))("\s*:\s*)(-?\d+(?:\.\d+)?)(?=\s*[,}])/g,
    replacement: '$1$2"[REDACTED]"',
  },
  {
    // Environment-style assignments (`password=12345`, `api_key=short`) are
    // unambiguous even when the value is shorter than the 6-character prose
    // threshold used by the bare rule. Requires `=` with no whitespace, and the
    // value must be a whole token: it ends at whitespace, end of line, or one of
    // `,;}&|<>})]`, so `db_pass=hunter2;user=app` keeps `;user=app` instead of
    // swallowing it. Values that continue into a call (`refreshToken()`) are not
    // matched at all, and neither are comparison operators (`password == null`)
    // or code keywords — rewriting source is worse than missing a shape.
    name: 'key-value-env',
    pattern: /(?<![A-Za-z0-9])((?:[A-Za-z0-9]+[_-]){0,8}(?:api[_-]?key|access[_-]?key(?:[_-]?id)?|private[_-]?key|secret[_-]?key|private[_-]?token|access[_-]?token|refresh[_-]?token|id[_-]?token|auth[_-]?token|session[_-]?id|client[_-]?secret|token|secret|passphrase|password|passwd|pass|pwd|session|credentials?))(\s*=\s*)(?!=)(?!(?:await|new|typeof|return|import|require|process|function|false|true|null|undefined)\b)(?!["'[{])([^\s"'`();&|<>]{1,})(?=$|[\s,;}&|<>})\]])/gi,
    replacement: '$1$2[REDACTED]',
  },
  {
    // Quoted values (`{"token":"…"}`, `password = '…'`) keep their quote style so
    // the redacted text stays valid JSON / shell. Group 1 is the key's closing
    // quote (if the key itself was quoted), group 2 the separator, group 3 the
    // value quote. The repetition is bounded to 8 segments: unbounded
    // `(?:[A-Za-z0-9]+[_-])*` backtracking took ~19 s on a 100 KB `a_` input.
    name: 'key-value-quoted',
    pattern: /(?<![A-Za-z0-9])((?:[A-Za-z0-9]+[_-]){0,8}(?:api[_-]?key|access[_-]?key(?:[_-]?id)?|private[_-]?key|secret[_-]?access[_-]?key|secret[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|auth[_-]?token|session[_-]?id|client[_-]?secret|token|secret|passphrase|password|passwd|pass|pwd|session|credentials?))(["']?)(\s*[:=]\s*)(["'])(?:\\.|(?!\4)[^\\\n])*\4/gi,
    replacement: '$1$2$3$4[REDACTED]$4',
  },
  {
    // Bare values (`db_pass=hunter2`, `OPENAI_API_KEY=sk-…`). At least 6 chars so
    // ordinary prose like `the token: count is 3` is left alone; values that
    // start with a quote or a `[REDACTED` placeholder are handled by the rule
    // above and must not be matched again.
    name: 'key-value',
    pattern: /(?<![A-Za-z0-9])((?:[A-Za-z0-9]+[_-]){0,8}(?:api[_-]?key|access[_-]?key(?:[_-]?id)?|private[_-]?key|secret[_-]?access[_-]?key|secret[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|auth[_-]?token|session[_-]?id|client[_-]?secret|token|secret|passphrase|password|passwd|pass|pwd|session|credentials?))(["']?)(\s*[:=]\s*)(?!["'\[{]|required\b|optional\b|enabled\b|disabled\b|true\b|false\b|null\b|none\b)([^\s,;}\]]{6,})/gi,
    replacement: '$1$2$3[REDACTED]',
  },
]

/** Replace known credential shapes in arbitrary text. */
export function redactSecrets(input: string): string {
  let value = input
  for (const rule of REDACTION_RULES) value = value.replace(rule.pattern, rule.replacement)
  return value
}

/** Redact a thrown value without ever throwing from the redactor. */
export function redactError(error: unknown): string {
  try {
    if (error instanceof Error) {
      return redactSecrets(error.message)
    }
    return redactSecrets(String(error))
  } catch {
    return '[unrenderable error]'
  }
}


/**
 * Recursively copy a JSON-like value while redacting every string.
 * Cycles and non-JSON values are converted to a safe placeholder.
 */
export function redactDeep<T>(value: T): T {
  return walk(value, new WeakSet<object>(), 0) as T
}

function walk(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (depth > 40) return '[REDACTED: nesting too deep]'
  if (typeof value === 'string') return redactSecrets(value)
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return '[REDACTED: circular]'
  seen.add(value)
  if (Array.isArray(value)) {
    return value.map(item => walk(item, seen, depth + 1))
  }
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    // A key named token/password/cookie is a strong signal that the *value* is a
    // secret even when it does not match any credential shape (e.g. a short
    // password or an opaque session id). Redact the value wholesale instead of
    // relying on the text patterns alone.
    const redactedKey = redactSecrets(key)
    out[redactedKey] = isSensitiveKey(key) ? '[REDACTED]' : walk(child, seen, depth + 1)
  }
  return out
}

/**
 * True when a JSON key names a credential field. Handles snake_case and
 * camelCase (`accessToken`, `sessionId`) but not `tokenCount`/`secretary`:
 * the sensitive word must be the last segment or an exact known composite.
 */
function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
  const last = normalized.split(/[_-]/).pop() ?? ''
  if (['token', 'secret', 'passphrase', 'password', 'passwd', 'pass', 'pwd', 'authorization', 'cookie', 'session', 'credential', 'credentials'].includes(last)) return true
  // Hyphenated header names (`x-api-key`) reach the same composites as their
  // snake_case spellings, so one list covers both.
  const flat = normalized.replace(/-/g, '_')
  return ['api_key', 'x_api_key', 'secret_key', 'access_key', 'private_key', 'private_token', 'client_secret', 'session_id', 'access_token', 'refresh_token', 'id_token', 'auth_token'].includes(flat)
}
