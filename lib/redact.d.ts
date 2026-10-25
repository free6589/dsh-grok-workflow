/**
 * Defensive credential redaction for model-facing reports and diagnostics.
 * This is a safety net, not a license to place secrets in prompts or logs.
 */
/** Replace known credential shapes in arbitrary text. */
export declare function redactSecrets(input: string): string;
/** Redact a thrown value without ever throwing from the redactor. */
export declare function redactError(error: unknown): string;
/**
 * Recursively copy a JSON-like value while redacting every string.
 * Cycles and non-JSON values are converted to a safe placeholder.
 */
export declare function redactDeep<T>(value: T): T;
//# sourceMappingURL=redact.d.ts.map