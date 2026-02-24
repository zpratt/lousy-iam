export type ViolationSeverity = "error" | "warning";

export interface ValidationViolation {
    readonly rule_id: string;
    readonly severity: ViolationSeverity;
    readonly message: string;
    readonly statement_sid?: string;
    readonly statement_index?: number;
    readonly field: string;
    readonly current_value: unknown;
    readonly auto_fixable: boolean;
    readonly fix_hint: string;
    readonly fix_data?: Readonly<Record<string, unknown>>;
}

export interface ValidationStats {
    readonly total_statements: number;
    readonly total_actions: number;
    readonly errors: number;
    readonly warnings: number;
    readonly auto_fixable_errors: number;
    readonly auto_fixable_warnings: number;
}

export interface PolicyValidationResult {
    readonly policy_name: string;
    readonly policy_type: "permission" | "trust";
    readonly valid: boolean;
    readonly violations: readonly ValidationViolation[];
    readonly stats: ValidationStats;
}

export interface RoleValidationResult {
    readonly role_name: string;
    readonly valid: boolean;
    readonly policy_results: readonly PolicyValidationResult[];
}

export interface ValidationOutput {
    readonly valid: boolean;
    readonly role_results: readonly RoleValidationResult[];
    readonly fix_iterations: number;
}
