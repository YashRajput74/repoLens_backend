export type FindingCategory =
    | "secret"
    | "sast"
    | "dependency";

export type FindingSeverity =
    | "critical"
    | "high"
    | "medium"
    | "low"
    | "info";

export interface SecurityFinding {
    category: FindingCategory;
    severity: FindingSeverity;

    title: string;
    description: string;

    filePath?: string;
    lineNumber?: number;

    evidence?: string;
    remediation?: string;

    ruleId?: string;
    cwe?: string;
    cve?: string;

    confidence?: number;
}