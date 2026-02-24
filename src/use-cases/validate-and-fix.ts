import type {
    PolicyValidationResult,
    RoleValidationResult,
    ValidationOutput,
    ValidationStats,
    ValidationViolation,
} from "../entities/validation-result.js";
import type { PolicyFixer } from "./fix-policy.js";
import type { FormulationOutputInput } from "./formulation-output.schema.js";
import type { PermissionPolicyValidator } from "./validate-permission-policy.js";
import type {
    RoleType,
    TrustPolicyValidator,
} from "./validate-trust-policy.js";

const DEFAULT_MAX_ITERATIONS = 5;

export interface ValidateAndFixDeps {
    readonly permissionValidator: PermissionPolicyValidator;
    readonly trustValidator: TrustPolicyValidator;
    readonly fixer: PolicyFixer;
    readonly unscopedActions: ReadonlySet<string>;
}

export interface ValidateAndFixOrchestrator {
    execute(input: FormulationOutputInput): ValidationOutput;
}

function computeStats(
    violations: readonly ValidationViolation[],
    totalStatements: number,
    totalActions: number,
): ValidationStats {
    const errors = violations.filter((v) => v.severity === "error").length;
    const warnings = violations.filter((v) => v.severity === "warning").length;
    const autoFixableErrors = violations.filter(
        (v) => v.severity === "error" && v.auto_fixable,
    ).length;
    const autoFixableWarnings = violations.filter(
        (v) => v.severity === "warning" && v.auto_fixable,
    ).length;

    return {
        total_statements: totalStatements,
        total_actions: totalActions,
        errors,
        warnings,
        auto_fixable_errors: autoFixableErrors,
        auto_fixable_warnings: autoFixableWarnings,
    };
}

function violationsFingerprint(
    violations: readonly ValidationViolation[],
): string {
    return violations
        .map((v) => `${v.rule_id}:${v.statement_index ?? ""}:${v.field}`)
        .sort()
        .join("|");
}

function detectRoleType(roleName: string): RoleType {
    if (roleName.includes("plan")) {
        return "plan";
    }
    return "apply";
}

function deepCopy<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj)) as T;
}

export function createValidateAndFixOrchestrator(
    deps: ValidateAndFixDeps,
): ValidateAndFixOrchestrator {
    return {
        execute(input: FormulationOutputInput): ValidationOutput {
            const roleResults: RoleValidationResult[] = [];
            let totalIterations = 0;

            for (const role of input.roles) {
                const roleType = detectRoleType(role.role_name);
                const policyResults: PolicyValidationResult[] = [];

                for (const permPolicy of role.permission_policies) {
                    let currentDoc = deepCopy(permPolicy.policy_document) as {
                        Version?: string | undefined;
                        Statement: readonly {
                            Sid: string;
                            Effect: "Allow";
                            Action: readonly string[];
                            Resource: string | readonly string[];
                            Condition?:
                                | Record<
                                      string,
                                      Record<string, string | readonly string[]>
                                  >
                                | undefined;
                        }[];
                    };
                    let violations: readonly ValidationViolation[] = [];
                    let iterations = 0;
                    let previousFingerprint = "";

                    for (
                        iterations = 0;
                        iterations < DEFAULT_MAX_ITERATIONS;
                        iterations++
                    ) {
                        violations = deps.permissionValidator.validate(
                            currentDoc,
                            {
                                unscopedActions: deps.unscopedActions,
                                roleName: role.role_name,
                            },
                        );

                        const autoFixable = violations.filter(
                            (v) => v.auto_fixable,
                        );
                        if (autoFixable.length === 0) {
                            break;
                        }

                        const fingerprint = violationsFingerprint(violations);
                        if (fingerprint === previousFingerprint) {
                            break;
                        }
                        previousFingerprint = fingerprint;

                        currentDoc = deepCopy(
                            deps.fixer.fixPermissionPolicy(
                                currentDoc,
                                violations,
                            ),
                        );
                    }

                    totalIterations = Math.max(totalIterations, iterations);

                    const totalActions = currentDoc.Statement.reduce(
                        (sum, s) => sum + s.Action.length,
                        0,
                    );

                    policyResults.push({
                        policy_name: permPolicy.policy_name,
                        policy_type: "permission",
                        valid: violations.every((v) => v.severity !== "error"),
                        violations,
                        stats: computeStats(
                            violations,
                            currentDoc.Statement.length,
                            totalActions,
                        ),
                    });
                }

                let trustDoc = deepCopy(role.trust_policy) as {
                    Version?: string | undefined;
                    Statement: readonly {
                        Sid: string;
                        Effect: "Allow";
                        Principal: { Federated: string };
                        Action: string;
                        Condition: Record<
                            string,
                            Record<string, string | readonly string[]>
                        >;
                    }[];
                };
                let trustViolations: readonly ValidationViolation[] = [];
                let trustIterations = 0;
                let previousTrustFingerprint = "";

                for (
                    trustIterations = 0;
                    trustIterations < DEFAULT_MAX_ITERATIONS;
                    trustIterations++
                ) {
                    trustViolations = deps.trustValidator.validate(
                        trustDoc,
                        roleType,
                    );

                    const autoFixable = trustViolations.filter(
                        (v) => v.auto_fixable,
                    );
                    if (autoFixable.length === 0) {
                        break;
                    }

                    const fingerprint = violationsFingerprint(trustViolations);
                    if (fingerprint === previousTrustFingerprint) {
                        break;
                    }
                    previousTrustFingerprint = fingerprint;

                    trustDoc = deepCopy(
                        deps.fixer.fixTrustPolicy(trustDoc, trustViolations),
                    );
                }

                totalIterations = Math.max(totalIterations, trustIterations);

                const trustActions = trustDoc.Statement.length;

                policyResults.push({
                    policy_name: `${role.role_name}-trust`,
                    policy_type: "trust",
                    valid: trustViolations.every((v) => v.severity !== "error"),
                    violations: trustViolations,
                    stats: computeStats(
                        trustViolations,
                        trustDoc.Statement.length,
                        trustActions,
                    ),
                });

                const roleValid = policyResults.every((p) => p.valid);

                roleResults.push({
                    role_name: role.role_name,
                    valid: roleValid,
                    policy_results: policyResults,
                });
            }

            const allValid = roleResults.every((r) => r.valid);

            return {
                valid: allValid,
                role_results: roleResults,
                fix_iterations: totalIterations,
            };
        },
    };
}
