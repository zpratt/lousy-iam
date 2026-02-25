import type { ValidationViolation } from "../entities/validation-result.js";

interface PolicyStatement {
    readonly Sid: string;
    readonly Effect: "Allow";
    readonly Action: readonly string[];
    readonly Resource: string | readonly string[];
    readonly Condition?:
        | Readonly<
              Record<
                  string,
                  Readonly<Record<string, string | readonly string[]>>
              >
          >
        | undefined;
}

interface PolicyDocument {
    readonly Version?: string | undefined;
    readonly Statement: readonly PolicyStatement[];
}

interface TrustPolicyStatement {
    readonly Sid: string;
    readonly Effect: "Allow";
    readonly Principal: {
        readonly Federated: string;
    };
    readonly Action: string;
    readonly Condition: Readonly<
        Record<string, Readonly<Record<string, string | readonly string[]>>>
    >;
}

interface TrustPolicyDocument {
    readonly Version?: string | undefined;
    readonly Statement: readonly TrustPolicyStatement[];
}

const AUTO_FIXABLE_RULES = new Set([
    "LP-021",
    "LP-023",
    "LP-024",
    "LP-025",
    "LP-031",
    "LP-034",
    "LP-040",
    "LP-041",
    "LP-045",
    "LP-046",
]);

export interface PolicyFixer {
    fixPermissionPolicy(
        document: PolicyDocument,
        violations: readonly ValidationViolation[],
    ): PolicyDocument;
    fixTrustPolicy(
        document: TrustPolicyDocument,
        violations: readonly ValidationViolation[],
    ): TrustPolicyDocument;
}

function addConditionToStatement(
    statement: PolicyStatement,
    operator: string,
    key: string,
    value: string | readonly string[],
): PolicyStatement {
    const existingCondition = statement.Condition ?? {};
    const existingOperator = existingCondition[operator] ?? {};

    return {
        ...statement,
        Condition: {
            ...existingCondition,
            [operator]: {
                ...existingOperator,
                [key]: value,
            },
        },
    };
}

function extractServicePrefix(action: string): string {
    const colonIndex = action.indexOf(":");
    return colonIndex > 0 ? action.substring(0, colonIndex) : action;
}

function toSidSegment(service: string): string {
    return service
        .split(/[-_]/)
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join("");
}

export function createPolicyFixer(): PolicyFixer {
    return {
        fixPermissionPolicy(
            document: PolicyDocument,
            violations: readonly ValidationViolation[],
        ): PolicyDocument {
            const fixableViolations = violations.filter(
                (v) => v.auto_fixable && AUTO_FIXABLE_RULES.has(v.rule_id),
            );

            if (fixableViolations.length === 0) {
                return document;
            }

            let fixedStatements = [...document.Statement];
            let fixedVersion = document.Version;

            for (const violation of fixableViolations) {
                switch (violation.rule_id) {
                    case "LP-040": {
                        fixedVersion = "2012-10-17";
                        break;
                    }
                    case "LP-041": {
                        const index = violation.statement_index;
                        if (index !== undefined && fixedStatements[index]) {
                            const stmt = fixedStatements[index];
                            const service = extractServicePrefix(
                                stmt.Action[0] ?? "Unknown",
                            );
                            fixedStatements[index] = {
                                ...stmt,
                                Sid: `${toSidSegment(service)}Statement${index}`,
                            };
                        }
                        break;
                    }
                    case "LP-045": {
                        const index = violation.statement_index;
                        if (index !== undefined && fixedStatements[index]) {
                            const stmt = fixedStatements[index];
                            fixedStatements[index] = {
                                ...stmt,
                                Action: [...new Set(stmt.Action)],
                            };
                        }
                        break;
                    }
                    case "LP-046": {
                        const fixData = violation.fix_data;
                        if (fixData) {
                            const action = fixData.action;
                            const indices = fixData.statement_indices;
                            if (
                                typeof action === "string" &&
                                Array.isArray(indices) &&
                                indices.length > 1
                            ) {
                                let bestIndex = indices[0] ?? 0;
                                let bestSpecificity = Infinity;

                                for (const idx of indices) {
                                    const stmt = fixedStatements[idx];
                                    if (!stmt) {
                                        continue;
                                    }
                                    const resource =
                                        typeof stmt.Resource === "string"
                                            ? stmt.Resource
                                            : (stmt.Resource[0] ?? "*");
                                    const specificity =
                                        resource === "*"
                                            ? Infinity
                                            : resource.length;
                                    if (specificity < bestSpecificity) {
                                        bestSpecificity = specificity;
                                        bestIndex = idx;
                                    }
                                }

                                for (const idx of indices) {
                                    if (idx !== bestIndex) {
                                        const stmt = fixedStatements[idx];
                                        if (stmt) {
                                            fixedStatements[idx] = {
                                                ...stmt,
                                                Action: stmt.Action.filter(
                                                    (a) => a !== action,
                                                ),
                                            };
                                        }
                                    }
                                }
                            }
                        }
                        break;
                    }
                    case "LP-021": {
                        const index = violation.statement_index;
                        if (index !== undefined && fixedStatements[index]) {
                            fixedStatements[index] = addConditionToStatement(
                                fixedStatements[index],
                                "StringEquals",
                                "iam:PassedToService",
                                "SERVICE_PRINCIPAL",
                            );
                        }
                        break;
                    }
                    case "LP-023": {
                        const index = violation.statement_index;
                        if (index !== undefined && fixedStatements[index]) {
                            fixedStatements[index] = addConditionToStatement(
                                fixedStatements[index],
                                "StringEquals",
                                "iam:AWSServiceName",
                                "SERVICE_NAME",
                            );
                        }
                        break;
                    }
                    case "LP-024": {
                        const index = violation.statement_index;
                        if (index !== undefined && fixedStatements[index]) {
                            fixedStatements[index] = addConditionToStatement(
                                fixedStatements[index],
                                "StringEquals",
                                "aws:RequestedRegion",
                                // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM placeholder
                                "${region}",
                            );
                        }
                        break;
                    }
                    case "LP-025": {
                        const index = violation.statement_index;
                        if (index !== undefined && fixedStatements[index]) {
                            fixedStatements[index] = addConditionToStatement(
                                fixedStatements[index],
                                "StringEquals",
                                "aws:RequestTag",
                                "REQUIRED_TAG_VALUE",
                            );
                        }
                        break;
                    }
                }
            }

            fixedStatements = fixedStatements.filter(
                (s) => s.Action.length > 0,
            );

            return {
                Version: fixedVersion,
                Statement: fixedStatements,
            };
        },

        fixTrustPolicy(
            document: TrustPolicyDocument,
            violations: readonly ValidationViolation[],
        ): TrustPolicyDocument {
            const fixableViolations = violations.filter(
                (v) => v.auto_fixable && AUTO_FIXABLE_RULES.has(v.rule_id),
            );

            if (fixableViolations.length === 0) {
                return document;
            }

            const fixedStatements = [...document.Statement];

            for (const violation of fixableViolations) {
                switch (violation.rule_id) {
                    case "LP-031": {
                        const index = violation.statement_index;
                        if (index !== undefined && fixedStatements[index]) {
                            const stmt = fixedStatements[index];
                            const existingStringEquals =
                                stmt.Condition.StringEquals ?? {};
                            fixedStatements[index] = {
                                ...stmt,
                                Condition: {
                                    ...stmt.Condition,
                                    StringEquals: {
                                        ...existingStringEquals,
                                        "token.actions.githubusercontent.com:aud":
                                            "sts.amazonaws.com",
                                    },
                                },
                            };
                        }
                        break;
                    }
                    case "LP-034": {
                        const index = violation.statement_index;
                        if (index !== undefined && fixedStatements[index]) {
                            const stmt = fixedStatements[index];
                            const fixData = violation.fix_data;
                            if (fixData) {
                                const key = fixData.condition_key;
                                const value = fixData.condition_value;
                                if (
                                    typeof key !== "string" ||
                                    typeof value !== "string"
                                ) {
                                    break;
                                }
                                const stringLike = stmt.Condition.StringLike;
                                if (stringLike) {
                                    const newStringLike = {
                                        ...stringLike,
                                    };
                                    delete (
                                        newStringLike as Record<string, unknown>
                                    )[key];

                                    const existingStringEquals =
                                        stmt.Condition.StringEquals ?? {};

                                    const newCondition: Record<
                                        string,
                                        Record<
                                            string,
                                            string | readonly string[]
                                        >
                                    > = {
                                        ...stmt.Condition,
                                        StringEquals: {
                                            ...existingStringEquals,
                                            [key]: value,
                                        },
                                    };

                                    if (
                                        Object.keys(newStringLike).length === 0
                                    ) {
                                        delete newCondition.StringLike;
                                    } else {
                                        newCondition.StringLike = newStringLike;
                                    }

                                    fixedStatements[index] = {
                                        ...stmt,
                                        Condition: newCondition,
                                    };
                                }
                            }
                        }
                        break;
                    }
                }
            }

            return {
                ...document,
                Statement: fixedStatements,
            };
        },
    };
}
