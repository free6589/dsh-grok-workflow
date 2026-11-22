/**
 * Handoff contract (交接契约): fixed four-line handoff for the next agent.
 *
 * The contract is exactly four rows:
 *
 * 1. 结论 / Conclusion — what was decided or achieved.
 * 2. 证据指针 / Evidence — verifiable pointers (checkpoint / artifact paths
 *    plus a checksum and/or line number), never bare prose.
 * 3. 未决问题 / Open questions — what is still unknown or disputed.
 * 4. 下一步 / Next steps — what the next agent should do.
 *
 * A missing row fails closed: {@link assertHandoffContract} throws a
 * {@link HandoffContractError} that carries both the Chinese and the English
 * message, so the next agent can be rejected with a clear reason instead of
 * silently continuing with half a handoff.
 */
/** One verifiable evidence pointer. */
export interface HandoffEvidencePointer {
    /** Checkpoint file path or artifact file path (e.g. `checkpoints/run.json`, `src/report.ts`, `file:///tmp/out`). */
    path: string;
    /** Checksum of the referenced content (hex, e.g. sha-256). At least one of `checksum` / `line` is required. */
    checksum?: string;
    /** 1-based line number inside the referenced file. At least one of `checksum` / `line` is required. */
    line?: number;
}
/** The fixed four-line handoff contract. */
export interface HandoffContract {
    /** 结论 / Conclusion. */
    conclusion: string;
    /** 证据指针 / Evidence pointers (at least one, every one verifiable). */
    evidence: HandoffEvidencePointer[];
    /** 未决问题 / Open questions (at least one). */
    openQuestions: string[];
    /** 下一步 / Next steps (at least one). */
    nextSteps: string[];
}
/** Bilingual error text: Chinese first, English second. */
export interface HandoffErrorText {
    zh: string;
    en: string;
}
/** Bounds for handoff fields (same scale as the checkpoint text bounds). */
export declare const HANDOFF_LIMITS: {
    /** Maximum characters of the conclusion. */
    readonly conclusionChars: 4000;
    /** Maximum characters of one open question / next step. */
    readonly itemChars: 600;
    /** Maximum characters of one evidence path. */
    readonly pathChars: 400;
    /** Maximum evidence pointers in one contract. */
    readonly evidenceItems: 32;
    /** Maximum open questions in one contract. */
    readonly questionItems: 32;
    /** Maximum next steps in one contract. */
    readonly stepItems: 32;
};
/**
 * Bilingual error catalogue. Every validation failure maps to one entry here,
 * so the caller can show either language without re-deriving the message.
 */
export declare const HANDOFF_ERRORS: {
    readonly MISSING_CONCLUSION: {
        readonly zh: "交接契约缺少“结论”：结论不能为空，必须是一行非空文字。";
        readonly en: "Handoff contract is missing \"conclusion\": conclusion must be a non-empty string.";
    };
    readonly MISSING_EVIDENCE: {
        readonly zh: "交接契约缺少“证据指针”：至少需要一条可复验的证据指针。";
        readonly en: "Handoff contract is missing \"evidence\": at least one verifiable evidence pointer is required.";
    };
    readonly MISSING_OPEN_QUESTIONS: {
        readonly zh: "交接契约缺少“未决问题”：至少需要一条未决问题。";
        readonly en: "Handoff contract is missing \"open questions\": at least one open question is required.";
    };
    readonly MISSING_NEXT_STEPS: {
        readonly zh: "交接契约缺少“下一步”：至少需要一条下一步。";
        readonly en: "Handoff contract is missing \"next steps\": at least one next step is required.";
    };
    readonly EVIDENCE_NOT_VERIFIABLE: {
        readonly zh: "证据指针不可复验：必须引用 checkpoint 文件路径或产物文件路径，并附带校验位（checksum 和/或行号），不接受裸文字自述。";
        readonly en: "Evidence pointer is not verifiable: it must reference a checkpoint file path or artifact file path with a checksum and/or line number; bare prose is not accepted.";
    };
};
/** Why a handoff operation failed. `field` drives test and caller branching. */
export declare class HandoffContractError extends Error {
    readonly field: string;
    readonly zh: string;
    readonly en: string;
    constructor(field: string, text: HandoffErrorText, detail?: string);
}
/**
 * Validate an unknown value as a handoff contract.
 * Missing rows fail closed; evidence without a check bit fails as unverifiable.
 */
export declare function assertHandoffContract(value: unknown): HandoffContract;
/** True when the value already satisfies the contract; never throws. */
export declare function isHandoffContract(value: unknown): value is HandoffContract;
//# sourceMappingURL=contract.d.ts.map