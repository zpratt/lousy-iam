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

// biome-ignore lint/suspicious/noTemplateCurlyInString: IAM placeholder
const REGION_PLACEHOLDER = "${region}";

function fixVersion(): string {
    return "2012-10-17";
}

function fixMissingSid(statements: PolicyStatement[], index: number): void {
    const stmt = statements[index];
    if (!stmt) {
        return;
    }
    const service = extractServicePrefix(stmt.Action[0] ?? "Unknown");
    statements[index] = {
        ...stmt,
        Sid: `${toSidSegment(service)}Statement${index}`,
    };
}

function fixDuplicateActions(
    statements: PolicyStatement[],
    index: number,
): void {
    const stmt = statements[index];
    if (!stmt) {
        return;
    }
    statements[index] = {
        ...stmt,
        Action: [...new Set(stmt.Action)],
    };
}

function fixCrossStatementDuplicates(
    statements: PolicyStatement[],
    violation: ValidationViolation,
): void {
    const fixData = violation.fix_data;
    if (!fixData) {
        return;
    }
    const action = fixData.action;
    const indices = fixData.statement_indices;
    if (
        typeof action !== "string" ||
        !Array.isArray(indices) ||
        indices.length <= 1
    ) {
        return;
    }

    const bestIndex = findBestStatementIndex(statements, indices);

    for (const idx of indices) {
        if (idx === bestIndex) {
            continue;
        }
        const stmt = statements[idx];
        if (stmt) {
            statements[idx] = {
                ...stmt,
                Action: stmt.Action.filter((a) => a !== action),
            };
        }
    }
}

function getStatementSpecificity(statement: PolicyStatement): number {
    const resource =
        typeof statement.Resource === "string"
            ? statement.Resource
            : (statement.Resource[0] ?? "*");
    return resource === "*" ? Infinity : resource.length;
}

function findBestStatementIndex(
    statements: readonly PolicyStatement[],
    indices: readonly number[],
): number {
    let bestIndex = indices[0] ?? 0;
    let bestSpecificity = Infinity;

    for (const idx of indices) {
        const stmt = statements[idx];
        if (!stmt) {
            continue;
        }
        const specificity = getStatementSpecificity(stmt);
        if (specificity < bestSpecificity) {
            bestSpecificity = specificity;
            bestIndex = idx;
        }
    }

    return bestIndex;
}

function fixConditionAtIndex(
    statements: PolicyStatement[],
    index: number | undefined,
    operator: string,
    key: string,
    value: string | readonly string[],
): void {
    if (index === undefined || !statements[index]) {
        return;
    }
    statements[index] = addConditionToStatement(
        statements[index],
        operator,
        key,
        value,
    );
}

function applyPermissionFix(
    violation: ValidationViolation,
    statements: PolicyStatement[],
): string | undefined {
    const index = violation.statement_index;

    switch (violation.rule_id) {
        case "LP-040":
            return fixVersion();
        case "LP-041":
            fixMissingSid(statements, index ?? -1);
            return undefined;
        case "LP-045":
            fixDuplicateActions(statements, index ?? -1);
            return undefined;
        case "LP-046":
            fixCrossStatementDuplicates(statements, violation);
            return undefined;
        case "LP-021":
            fixConditionAtIndex(
                statements,
                index,
                "StringEquals",
                "iam:PassedToService",
                "SERVICE_PRINCIPAL",
            );
            return undefined;
        case "LP-023":
            fixConditionAtIndex(
                statements,
                index,
                "StringEquals",
                "iam:AWSServiceName",
                "SERVICE_NAME",
            );
            return undefined;
        case "LP-024":
            fixConditionAtIndex(
                statements,
                index,
                "StringEquals",
                "aws:RequestedRegion",
                REGION_PLACEHOLDER,
            );
            return undefined;
        case "LP-025":
            fixConditionAtIndex(
                statements,
                index,
                "StringEquals",
                "aws:RequestTag",
                "REQUIRED_TAG_VALUE",
            );
            return undefined;
        default:
            return undefined;
    }
}

function fixAudienceCondition(
    statements: TrustPolicyStatement[],
    index: number,
): void {
    const stmt = statements[index];
    if (!stmt) {
        return;
    }
    const existingStringEquals = stmt.Condition.StringEquals ?? {};
    statements[index] = {
        ...stmt,
        Condition: {
            ...stmt.Condition,
            StringEquals: {
                ...existingStringEquals,
                "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
            },
        },
    };
}

function fixStringLikeToStringEquals(
    statements: TrustPolicyStatement[],
    violation: ValidationViolation,
): void {
    const index = violation.statement_index;
    if (index === undefined || !statements[index]) {
        return;
    }
    const stmt = statements[index];
    const fixData = violation.fix_data;
    if (!fixData) {
        return;
    }
    const key = fixData.condition_key;
    const value = fixData.condition_value;
    if (typeof key !== "string" || typeof value !== "string") {
        return;
    }
    const stringLike = stmt.Condition.StringLike;
    if (!stringLike) {
        return;
    }

    const newStringLike = { ...stringLike };
    delete (newStringLike as Record<string, unknown>)[key];

    const existingStringEquals = stmt.Condition.StringEquals ?? {};
    const newCondition: Record<
        string,
        Record<string, string | readonly string[]>
    > = {
        ...stmt.Condition,
        StringEquals: {
            ...existingStringEquals,
            [key]: value,
        },
    };

    if (Object.keys(newStringLike).length === 0) {
        delete newCondition.StringLike;
    } else {
        newCondition.StringLike = newStringLike;
    }

    statements[index] = {
        ...stmt,
        Condition: newCondition,
    };
}

function applyTrustFix(
    violation: ValidationViolation,
    statements: TrustPolicyStatement[],
): void {
    const index = violation.statement_index;
    switch (violation.rule_id) {
        case "LP-031":
            if (index !== undefined) {
                fixAudienceCondition(statements, index);
            }
            break;
        case "LP-034":
            fixStringLikeToStringEquals(statements, violation);
            break;
    }
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
                const versionOverride = applyPermissionFix(
                    violation,
                    fixedStatements,
                );
                if (versionOverride !== undefined) {
                    fixedVersion = versionOverride;
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
                applyTrustFix(violation, fixedStatements);
            }

            return {
                ...document,
                Statement: fixedStatements,
            };
        },
    };
}
