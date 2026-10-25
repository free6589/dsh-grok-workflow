/**
 * Defensive credential redaction for model-facing reports and diagnostics.
 * This is a safety net, not a license to place secrets in prompts or logs.
 */
/** One credential shape, its replacement, and a stable name for diagnostics. */
export interface RedactionRule {
    /** Stable rule name; the generated workflow script mirrors these rules by name. */
    name: string;
    /** The credential shape to replace. */
    pattern: RegExp;
    /** Replacement text; `$1`-style backreferences keep the non-secret prefix. */
    replacement: string;
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
export declare const REDACTION_RULES: readonly RedactionRule[];
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