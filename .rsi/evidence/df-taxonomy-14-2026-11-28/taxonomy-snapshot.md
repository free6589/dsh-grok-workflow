# taxonomy 快照（逐字摘录，只摘录，不评论对错）

来源文件（worktree 内相对路径）：

- `src/child-outcomes.ts`（共 613 行）
- `src/types.ts`（共 623 行）

基线：`origin/main=1a3a477`；分支：`fix/df-taxonomy-14`。

## 1. `src/child-outcomes.ts` — CHILD_DEATH_FAMILIES（第 72 行）

```ts
export const CHILD_DEATH_FAMILIES: readonly FailureClass[] = ['timeout', 'connection', 'server-error', 'rate-limit', 'model-unavailable']
```

## 2. `src/child-outcomes.ts` — failureClassForCode 表（第 182–219 行）

```ts
export function failureClassForCode(code: string | undefined): FailureClass | undefined {
  if (code === undefined) return undefined
  const byCode: Record<string, FailureClass> = {
    // This route cannot answer: another model or another credential may.
    AUTH: 'model-unavailable',
    INVALID_CREDENTIAL: 'model-unavailable',
    MISSING_CREDENTIAL: 'model-unavailable',
    NO_CREDENTIAL_STORE: 'model-unavailable',
    ACCOUNT_SIGN_IN_REQUIRED: 'model-unavailable',
    ACCOUNT_TOKEN_INVALID: 'model-unavailable',
    MODEL_UNSUPPORTED: 'model-unavailable',
    UNKNOWN_MODEL: 'model-unavailable',
    NO_ADAPTER: 'model-unavailable',
    INVALID_MODEL_CONTEXT: 'model-unavailable',
    INVALID_MODEL_MAX_TOKENS: 'model-unavailable',
    INVALID_MODEL_REASONING: 'model-unavailable',
    DISCOVERY_UNSUPPORTED: 'model-unavailable',
    // The route is throttled or out of budget: the same route may work later.
    RATE_LIMIT: 'rate-limit',
    QUOTA: 'rate-limit',
    ACCOUNT_QUOTA: 'rate-limit',
    TIMEOUT: 'timeout',
    SERVER: 'server-error',
    TRANSPORT: 'connection',
    STREAM_CLOSED: 'connection',
    ABORTED: 'cancelled',
  }
  const exact = byCode[code]
  if (exact !== undefined) return exact
  const http = /^HTTP_(\d{3})$/.exec(code)
  if (http === null) return undefined
  const status = Number(http[1])
  if (status === 401 || status === 403 || status === 404) return 'model-unavailable'
  if (status === 408 || status === 504) return 'timeout'
  if (status === 429) return 'rate-limit'
  if (status >= 500) return 'server-error'
  return undefined
}
```

## 3. `src/child-outcomes.ts` — childFailureClass 逻辑（第 232–238 行）

```ts
export function childFailureClass(outcome: ChildTerminal): FailureClass {
  const stop = outcome.stopReason
  if (stop === 'completed') return 'format-error'
  if (stop === 'aborted' || stop === 'cancelled') return 'cancelled'
  if (stop === 'max-tokens' || stop === 'refusal') return 'unknown'
  return failureClassForCode(outcome.code) ?? classifyChildFailureText(outcome.diagnostic)
}
```

## 4. `src/child-outcomes.ts` — classifyChildFailureText 各分支正则（第 251–264 行）

```ts
export function classifyChildFailureText(value: unknown): FailureClass {
  const message = String(value ?? '')
  if (/rate.?limit|too many requests|\b429\b|quota exceeded|resource[_ ]exhausted/i.test(message)) return 'rate-limit'
  if (/\b5\d{2}\b|internal server error|bad gateway|service unavailable|gateway time|overloaded/i.test(message)) return 'server-error'
  if (/ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|network error|fetch failed|connection (reset|refused|closed|dropped)/i.test(message)) return 'connection'
  if (/timed? ?out|timeout|deadline exceeded|aborted/i.test(message)) return 'timeout'
  if (/model .*(not found|not available|does not exist|is unavailable)|unknown model|no adapter|NO_ADAPTER|unsupported model|model_not_found/i.test(message)) return 'model-unavailable'
  // Credential and permission refusals are the same conclusion for a reader: this
  // route cannot answer, so another model or route may. Without this arm a 403
  // lands in `unknown`, which reads as "we do not know what happened".
  if (/\b40[13]\b|unauthorized|forbidden|invalid api key|invalid_api_key|permission denied/i.test(message)) return 'model-unavailable'
  if (/structured[_ ]output|schema (violation|mismatch|mismatched)|invalid (json|output|response)|could not parse|format error|expected ','|expected '}'|expected ':'|expected double-quoted property name|unexpected (end of json|token)/i.test(message)) return 'format-error'
  return 'unknown'
}
```

## 5. `src/types.ts` — FailureClass 联合类型（第 383–400 行）

```ts
export type FailureClass =
  | 'rate-limit'
  | 'server-error'
  | 'connection'
  | 'timeout'
  | 'model-unavailable'
  | 'format-error'
  | 'task-failed'
  | 'verification-failed'
  | 'agent-start-failed'
  | 'budget-exhausted'
  /**
   * The child was stopped on purpose: the caller cancelled the run, or the plugin
   * was unloaded underneath it (t14). Not a form error and not a provider fault,
   * so a reader must not be told to resend or to switch models.
   */
  | 'cancelled'
  | 'unknown'
```
