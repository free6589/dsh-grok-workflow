/**
 * Defensive credential redaction for model-facing reports and diagnostics.
 * This is a safety net, not a license to place secrets in prompts or logs.
 */

const PRIVATE_KEY = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g
const OPENAI_STYLE = /\b(?:sk|rk|pk)[-_](?:live|test)[-_][A-Za-z0-9_-]{10,}\b|\b(?:sk|rk|pk)-[A-Za-z0-9_-]{16,}\b/g
const GITHUB_TOKEN = /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g
const GITLAB_TOKEN = /\bglpat-[A-Za-z0-9_-]{20,}\b/g
const NPM_TOKEN = /\bnpm_[A-Za-z0-9_-]{20,}\b/g
const SLACK_TOKEN = /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g
const AWS_ACCESS_KEY = /\bAKIA[0-9A-Z]{16}\b/g
const GOOGLE_API_KEY = /\bAIza[0-9A-Za-z_-]{30,}\b/g
const BEARER = /\b(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi
const URL_SECRET = /([?&](?:token|key|secret|password|passwd|api[_-]?key|apikey|access[_-]?token)=)[^&#\s]+/gi
const KEY_VALUE = /(?<![A-Za-z0-9])(?:[A-Za-z0-9]+[_-])*(?:api[_-]?key|access[_-]?key(?:[_-]?id)?|private[_-]?key|secret[_-]?access[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|token|secret|password|passwd)(\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;]+)/gi
const URL_USERINFO = /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@]*:[^\s/@]+@/gi

/** Replace known credential shapes in arbitrary text. */
export function redactSecrets(input: string): string {
  let value = input
  value = value.replace(PRIVATE_KEY, '[REDACTED PRIVATE KEY]')
  value = value.replace(JWT, '[REDACTED JWT]')
  value = value.replace(OPENAI_STYLE, '[REDACTED API KEY]')
  value = value.replace(GITHUB_TOKEN, '[REDACTED GITHUB TOKEN]')
  value = value.replace(GITLAB_TOKEN, '[REDACTED GITLAB TOKEN]')
  value = value.replace(NPM_TOKEN, '[REDACTED NPM TOKEN]')
  value = value.replace(SLACK_TOKEN, '[REDACTED SLACK TOKEN]')
  value = value.replace(AWS_ACCESS_KEY, '[REDACTED AWS ACCESS KEY]')
  value = value.replace(GOOGLE_API_KEY, '[REDACTED GOOGLE API KEY]')
  value = value.replace(BEARER, '$1[REDACTED]')
  value = value.replace(URL_SECRET, '$1[REDACTED]')
  value = value.replace(URL_USERINFO, '$1[REDACTED]@')
  value = value.replace(KEY_VALUE, '$1$2[REDACTED]')
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
