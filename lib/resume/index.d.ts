/**
 * Resume validator and safe restore policy.
 *
 * Public surface for the workflow resume path: validate a restore-candidate
 * checkpoint (`validateResumeCheckpoint`), turn a validated checkpoint into a
 * restore plan (`planRestore`), or do both in one fail-closed step
 * (`evaluateResumeCheckpoint`).
 */
export * from './validator.js';
export * from './policy.js';
//# sourceMappingURL=index.d.ts.map