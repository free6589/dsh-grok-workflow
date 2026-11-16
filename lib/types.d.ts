declare module '@deepseek-ai/dsh-llm' {
    interface MessageSourceMap {
        /** A validated workflow report relayed by the mandatory-entry gate. */
        'grok-workflow': {
            kind: 'grok-workflow';
        };
    }
}
/** Public and report types for dsh-grok-workflow. */
/** Final workflow status. These are the only values the plugin may report. */
export type FinalStatus = 'completed' | 'partial' | 'failed';
/** A plan task supplied by the caller (all work is independent). */
export interface TaskInput {
    /** Stable task id. Generated as `task-N` when omitted. */
    id?: string;
    title: string;
    objective: string;
    expectedOutput: string;
    acceptanceCriteria: string[];
    context?: string;
    constraints?: string[];
    /**
     * Paths this task writes (U-4), so overlapping tasks are serialized. Omit it
     * when unknown — the scheduler then treats the task as possibly writing
     * anything. `[]` declares a task that writes nothing.
     */
    writesPaths?: string[];
}
/** Fully normalized task used inside the generated workflow. */
export interface NormalizedTask {
    id: string;
    title: string;
    objective: string;
    expectedOutput: string;
    acceptanceCriteria: string[];
    context: string;
    constraints: string[];
    /**
     * Normalized write paths, or `null` when the plan did not say (U-4). `[]` means
     * the task declared that it writes nothing.
     */
    writesPaths: string[] | null;
    /**
     * Original goal id shared by every shard of a planner-failure fallback plan.
     * Absent for caller and planner plans, which have no synthetic shards.
     */
    originGoalId?: string;
}
/**
 * How the mandatory-entry gate delivers the validated report to the user.
 *
 * `relay` opens a new turn with the plugin's own message source (the verified
 * default). `append` writes the answer directly after the turn closed; it is a
 * degraded, experimental switch (no stream/usage, non-zero exit on a blocked
 * turn) kept because the answer route is not finally decided (U-1).
 */
/** Front-desk routing mode (t52). */
export type TriageMode = 'full' | 'triage';
/** Front-desk classifier: pure rules, or rules with one model fallback for unclear cases. */
export type TriageClassifier = 'rules' | 'hybrid';
export type AnswerStrategy = 'relay' | 'append' | 'in-turn';
/**
 * Which agents the gate polices.
 *
 * `process` covers every agent in the process (blast radius: everything).
 * `preset` restricts it to sessions composed from `gatePreset`, which is the
 * smallest scope an external plugin can express (U-7).
 */
export type GateScope = 'process' | 'preset';
/** The five roles a workflow run assigns model routes to. */
export type RoleName = 'planner' | 'worker' | 'verifier' | 'synthesizer' | 'supervisor';
/**
 * One entry of an ordered fallback chain.
 *
 * `provider` is a subagent/provider route id registered in the deployment;
 * `model` is the model id that adapter understands. Both cross the workflow
 * boundary as plain data (`agent({provider, model})`), which is why the guest
 * never needs to know how a provider is resolved.
 */
export interface ModelRoute {
    /** Provider route id; omitted means "inherit the run's provider". */
    provider?: string;
    /** Model id interpreted by that provider adapter. */
    model: string;
    /**
     * Maximum child calls simultaneously in flight on this route. When full,
     * the call overflows to the next route in the chain instead of waiting on
     * this one. Absent means unlimited. A full route is not a failure: it
     * never advances the failure fallback, counts no attempt, and is recorded
     * in the trail (`skippedBusy` / `queuedMs`) instead of the failure fields.
     */
    maxInFlight?: number;
}
/** Per-role ordered chains. An absent role inherits the run's route. */
export type RoleRouting = Partial<Record<RoleName, ModelRoute[]>>;
/**
 * Who writes the final answer narrative (U-3).
 *
 * Policy values (`GrokWorkflowConfig.synthesis`): `deterministic` keeps the
 * current behaviour (the host renders the aggregated report); `model` adds one
 * bounded synthesizer call that writes a narrative summary on top of the same
 * aggregations; `layered` keeps the verified report as the only source of fact
 * and answers from a deterministic natural-language summary built in the
 * script, with one constrained polish call only when a synthesizer chain is
 * configured. Report values (`WorkflowReport.synthesis.mode`): `deterministic`
 * or `model` only — they say whether a polish call was in play, never the
 * policy. A layered run that polishes reports `model`, otherwise
 * `deterministic`.
 */
export type SynthesisPolicy = 'deterministic' | 'model' | 'layered';
export type SynthesisMode = 'deterministic' | 'model';
/**
 * Plugin configuration (also the DSH Schemastery schema shape).
 *
 * T4 slim-down: the settings page exposes exactly 8 keys. Every other former
 * key is rejected as an unknown key (R-06) and takes effect as a fixed
 * internal value (see FIXED_* in `src/config.ts`).
 */
export interface GrokWorkflowConfig {
    /** Model-facing tool name. */
    toolName?: string;
    /** Front-desk routing mode (t52). The page shows `auto` for `triage`. */
    mode?: TriageMode;
    /** Config-level default for the per-session grok-mode toggle (`off` = normal chat). */
    grokDefault?: 'on' | 'off';
    /** Per-role ordered model chains (planner/worker/verifier/synthesizer/supervisor). */
    roles?: RoleRouting;
    /** Final-answer policy: `layered` (markdown direct output, default) or one model call. */
    synthesis?: SynthesisPolicy;
    /** Configuration surface version; unknown/newer versions are refused. */
    configVersion?: number;
    /** Maximum concurrent child agents per workflow run. Hard maximum 100. */
    maxConcurrency?: number;
    /** Maximum tasks accepted from a caller or planner. Hard maximum 100. */
    maxTasks?: number;
}
/** Fully resolved configuration. Everything not listed here is a fixed internal value. */
export interface ResolvedConfig {
    toolName: string;
    /**
     * Front-desk mode (t52): `full` keeps the pre-t52 rule that every message runs
     * the team; `triage` routes each message to chat / fast / team / ask.
     */
    mode: TriageMode;
    /** Config-level default for the per-session grok-mode toggle (`off` = normal chat). */
    grokDefault: 'on' | 'off';
    /** Effective per-role chains; an empty array means "inherit the run's route". */
    roles: Record<RoleName, ModelRoute[]>;
    synthesis: SynthesisPolicy;
    /**
     * True when the load-time repair (`repairSynthesisInconsistency`) rewrote
     * `synthesis` so a recoverable synthesis/synthesizer mismatch could still
     * activate. Set by the caller after repairing, never by `resolveConfig`
     * itself (which keeps failing hard on the mismatch, R-06). Surfaced by
     * `describeResolvedConfig` as `synthesis=<mode> (repaired)`.
     */
    synthesisRepaired?: boolean;
    maxConcurrency: number;
    maxRetries: number;
    maxTasks: number;
    configVersion: number;
}
/** One evidence item confirmed by a verifier. */
export interface ConfirmedEvidence {
    taskId: string;
    criterion: string;
    evidence: string;
}
/** One incomplete item in the final report. */
export interface IncompleteItem {
    taskId: string;
    reason: string;
    /** Failure kind of the task that produced this item (G-4). */
    category?: FailureCategory;
}
/** One workflow-level error. */
export interface ReportError {
    phase: string;
    message: string;
    /** Failure kind, so infrastructure faults are not read as quality failures. */
    category?: FailureCategory;
}
/** One unresolved uncertainty reported by a worker or verifier. */
export interface UncertaintyItem {
    taskId: string;
    text: string;
}
/** Structured execution result returned by a worker child. */
export interface ExecutionResult {
    summary: string;
    status: 'completed' | 'partial' | 'failed';
    deliverables: {
        description: string;
        locator: string;
    }[];
    evidence: {
        claim: string;
        source: string;
    }[];
    testsRun: {
        command: string;
        status: 'passed' | 'failed' | 'not_run';
        detail: string;
    }[];
    filesChanged: string[];
    uncertainties: string[];
}
/** Per-criterion verifier result. */
export interface CriterionVerification {
    criterion: string;
    met: boolean;
    evidence: string;
}
/** Structured verifier result returned by a verifier child. */
export interface VerificationResult {
    verdict: 'pass' | 'fail';
    criteria: CriterionVerification[];
    checkedEvidence: {
        kind: string;
        locator: string;
        finding: string;
    }[];
    commandsRun: {
        command: string;
        status: 'passed' | 'failed' | 'not_run';
        detail: string;
    }[];
    issues: string[];
    confidence: 'high' | 'medium' | 'low';
}
/**
 * Failure classes a single child call can be mapped to.
 *
 * The first six are *route* failures: another model may succeed, so the chain
 * advances. `task-failed` and `verification-failed` are content failures: a
 * different model would see the same evidence, so the same route is retried.
 * `budget-exhausted` and `unknown` are reported honestly and never silently
 * treated as success.
 */
export type FailureClass = 'rate-limit' | 'server-error' | 'connection' | 'timeout' | 'model-unavailable' | 'format-error' | 'task-failed' | 'verification-failed' | 'agent-start-failed' | 'budget-exhausted' | 'unknown';
/**
 * Who has to fix a failure (G-4). `infrastructure` = the model service, the
 * network or a deadline failed, so a retry, another route or a later run may
 * succeed; `quality` = the work or its verification fell short, so the same
 * route must retry with the same evidence; `configuration` = caps, options or
 * schemas are wrong, so no retry can help; `unknown` = unclassified.
 */
export type FailureCategory = 'infrastructure' | 'quality' | 'configuration'
/** Stopped on purpose: the caller cancelled, or the plugin was unloaded (t14). */
 | 'cancelled' | 'unknown';
/** One classified failure attached to an attempt or a route switch. */
export interface AttemptFailure {
    class: FailureClass;
    /** Redacted, bounded human-readable reason. */
    reason: string;
    /** Failure kind; absent only in reports produced before G-4. */
    category?: FailureCategory;
}
/** One recorded child call: the model, its chain position, and the outcome. */
export interface RouteTrailEntry {
    role: RoleName;
    /** 0-based position in the role's chain; 0 when the role inherits the route. */
    chainIndex: number;
    /** Route label (`provider/model`, or `inherit`). */
    route: string;
    /** 1-based task attempt this call belongs to (0 for run-level roles). */
    attempt: number;
    outcome: 'ok' | 'failed';
    failureClass?: FailureClass;
    reason?: string;
    /**
     * Routes skipped as full when this call was placed (overflow, not failure).
     * Absent when nothing was skipped.
     */
    skippedBusy?: string[];
    /** Milliseconds this call waited for a full route to drain. Absent when it did not wait. */
    queuedMs?: number;
}
/** One attempt's observed result. */
export interface AttemptReport {
    attempt: number;
    execution: ExecutionResult | null;
    verification: VerificationResult | null;
    passed: boolean;
    /** Route that produced the attempt, when routing is configured. */
    route?: string;
    /** True when this attempt's execution arrived via the same-attempt resubmit (A), not a fresh retry. */
    resubmitted?: boolean;
    /** Classified failure of this attempt, when it failed. */
    failure?: AttemptFailure;
    error?: string;
}
/** Per-task report. */
export interface TaskReport {
    id: string;
    title: string;
    objective: string;
    expectedOutput: string;
    acceptanceCriteria: string[];
    context: string;
    constraints: string[];
    /** Declared write paths echoed for audit (U-4); `null` = the plan did not say. */
    writesPaths: string[] | null;
    /** Shared original-goal id for planner-failure fallback shards. */
    originGoalId?: string;
    status: 'verified' | 'failed';
    attempts: AttemptReport[];
    error?: string;
}
/** Planning provenance. */
export interface PlanReport {
    source: 'caller' | 'planner' | 'fallback' | 'unavailable';
    tasks: NormalizedTask[];
    error?: string;
    /** Why the plan is not the planner's own (planner fault, with a category). */
    failure?: AttemptFailure | null;
}
/** Final canonical tool result. */
export interface WorkflowReport {
    schemaVersion: 'grok-workflow/v1';
    status: FinalStatus;
    objective: string;
    plan: PlanReport;
    tasks: TaskReport[];
    confirmed: ConfirmedEvidence[];
    incomplete: IncompleteItem[];
    errors: ReportError[];
    uncertainties: UncertaintyItem[];
    /** Every recorded child call, in call order (bounded, redacted). */
    routes: RouteTrailEntry[];
    /** Effective chains, for transparency about what was configured. */
    routing: Record<RoleName, string[]>;
    /** Final-answer strategy and its outcome. */
    synthesis: {
        mode: SynthesisMode;
        error?: string;
        summary?: string;
    };
    limits: {
        maxConcurrency: number;
        maxRetries: number;
        maxTasks: number;
        maxTotalAgents: number;
        /** The deadline the run actually ran under (t47: it used to live only in memory). */
        timeoutMs?: number;
    };
}
//# sourceMappingURL=types.d.ts.map