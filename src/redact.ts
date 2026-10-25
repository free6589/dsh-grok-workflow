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
    pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
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
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    replacement: '[REDACTED AWS ACCESS KEY]',
  },
  {
    name: 'google-api-key',
    pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/g,
    replacement: '[REDACTED GOOGLE API KEY]',
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
    name: 'key-value',
    pattern: /(?<![A-Za-z0-9])(?:[A-Za-z0-9]+[_-])*(?:api[_-]?key|access[_-]?key(?:[_-]?id)?|private[_-]?key|secret[_-]?access[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|token|secret|password|passwd)(\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;]+)/gi,
    replacement: '$1$2[REDACTED]',
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
    out[redactSecrets(key)] = walk(child, seen, depth + 1)
  }
  return out
}
