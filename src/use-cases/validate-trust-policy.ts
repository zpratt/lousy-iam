import type { ValidationViolation } from "../entities/validation-result.js";

export type RoleType = "plan" | "apply";

interface TrustPolicyStatement {
    readonly Sid: string;
    readonly Effect: string;
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

const OIDC_AUD_KEY = "token.actions.githubusercontent.com:aud";
const OIDC_SUB_KEY = "token.actions.githubusercontent.com:sub";
const AUDIENCE_VALUE = "sts.amazonaws.com";

function hasConditionValue(
    condition: Readonly<
        Record<string, Readonly<Record<string, string | readonly string[]>>>
    >,
    operator: string,
    key: string,
): boolean {
    const operatorBlock = condition[operator];
    if (!operatorBlock) {
        return false;
    }
    return key in operatorBlock;
}

function getConditionValue(
    condition: Readonly<
        Record<string, Readonly<Record<string, string | readonly string[]>>>
    >,
    key: string,
): string | readonly string[] | undefined {
    for (const operatorBlock of Object.values(condition)) {
        if (key in operatorBlock) {
            return operatorBlock[key];
        }
    }
    return undefined;
}

function containsWildcard(value: string): boolean {
    return value.includes("*") || value.includes("?");
}

export interface TrustPolicyValidator {
    validate(
        document: TrustPolicyDocument,
        roleType: RoleType,
    ): readonly ValidationViolation[];
}

export function createTrustPolicyValidator(): TrustPolicyValidator {
    return {
        validate(
            document: TrustPolicyDocument,
            roleType: RoleType,
        ): readonly ValidationViolation[] {
            const violations: ValidationViolation[] = [];

            for (let i = 0; i < document.Statement.length; i++) {
                const statement = document.Statement[i];
                if (!statement) {
                    continue;
                }

                if (statement.Action !== "sts:AssumeRoleWithWebIdentity") {
                    violations.push({
                        rule_id: "LP-030",
                        severity: "error",
                        message:
                            "Trust policy must use sts:AssumeRoleWithWebIdentity",
                        statement_sid: statement.Sid,
                        statement_index: i,
                        field: "Action",
                        current_value: statement.Action,
                        auto_fixable: false,
                        fix_hint:
                            "Change Action to sts:AssumeRoleWithWebIdentity",
                    });
                }

                const hasAud =
                    hasConditionValue(
                        statement.Condition,
                        "StringEquals",
                        OIDC_AUD_KEY,
                    ) ||
                    hasConditionValue(
                        statement.Condition,
                        "StringLike",
                        OIDC_AUD_KEY,
                    );

                if (!hasAud) {
                    violations.push({
                        rule_id: "LP-031",
                        severity: "error",
                        message: `Trust policy must include aud condition with ${AUDIENCE_VALUE}`,
                        statement_sid: statement.Sid,
                        statement_index: i,
                        field: "Condition",
                        current_value: statement.Condition,
                        auto_fixable: true,
                        fix_hint: `Add Condition.StringEquals.${OIDC_AUD_KEY}: ${AUDIENCE_VALUE}`,
                        fix_data: {
                            condition_key: OIDC_AUD_KEY,
                            condition_value: AUDIENCE_VALUE,
                        },
                    });
                }

                const hasSub =
                    hasConditionValue(
                        statement.Condition,
                        "StringEquals",
                        OIDC_SUB_KEY,
                    ) ||
                    hasConditionValue(
                        statement.Condition,
                        "StringLike",
                        OIDC_SUB_KEY,
                    );

                if (!hasSub) {
                    violations.push({
                        rule_id: "LP-032",
                        severity: "error",
                        message: "Trust policy must include sub condition",
                        statement_sid: statement.Sid,
                        statement_index: i,
                        field: "Condition",
                        current_value: statement.Condition,
                        auto_fixable: false,
                        fix_hint: `Add Condition.StringEquals.${OIDC_SUB_KEY}`,
                    });
                } else {
                    const subValue = getConditionValue(
                        statement.Condition,
                        OIDC_SUB_KEY,
                    );
                    const subStr =
                        typeof subValue === "string"
                            ? subValue
                            : (subValue?.[0] ?? "");

                    if (
                        subStr.includes(":*") &&
                        !subStr.includes(":pull_request") &&
                        !subStr.includes(":ref:") &&
                        !subStr.includes(":environment:")
                    ) {
                        violations.push({
                            rule_id: "LP-033",
                            severity: "error",
                            message:
                                "Trust policy sub must not use org-wide wildcard",
                            statement_sid: statement.Sid,
                            statement_index: i,
                            field: "Condition",
                            current_value: subStr,
                            auto_fixable: false,
                            fix_hint:
                                "Scope sub condition to specific repo and event type",
                        });
                    }

                    if (roleType === "plan") {
                        if (!subStr.includes(":pull_request")) {
                            violations.push({
                                rule_id: "LP-035",
                                severity: "error",
                                message:
                                    "Plan role trust policy must use pull_request subject",
                                statement_sid: statement.Sid,
                                statement_index: i,
                                field: "Condition",
                                current_value: subStr,
                                auto_fixable: false,
                                fix_hint:
                                    "Set sub to repo:org/repo:pull_request",
                            });
                        }
                    }

                    if (roleType === "apply") {
                        const hasMainRef = subStr.includes(
                            "ref:refs/heads/main",
                        );
                        const hasEnvironment = subStr.includes("environment:");
                        if (!hasMainRef && !hasEnvironment) {
                            violations.push({
                                rule_id: "LP-036",
                                severity: "error",
                                message:
                                    "Apply role trust policy must use ref:refs/heads/main or environment:<name> subject",
                                statement_sid: statement.Sid,
                                statement_index: i,
                                field: "Condition",
                                current_value: subStr,
                                auto_fixable: false,
                                fix_hint:
                                    "Set sub to repo:org/repo:ref:refs/heads/main or repo:org/repo:environment:<name>",
                            });
                        }
                    }
                }

                for (const [operator, conditionBlock] of Object.entries(
                    statement.Condition,
                )) {
                    if (operator === "StringLike") {
                        for (const [key, value] of Object.entries(
                            conditionBlock,
                        )) {
                            const strValue =
                                typeof value === "string"
                                    ? value
                                    : (value[0] ?? "");
                            if (!containsWildcard(strValue)) {
                                violations.push({
                                    rule_id: "LP-034",
                                    severity: "warning",
                                    message: `Prefer StringEquals over StringLike when no wildcards needed for "${key}"`,
                                    statement_sid: statement.Sid,
                                    statement_index: i,
                                    field: "Condition",
                                    current_value: {
                                        operator,
                                        key,
                                        value: strValue,
                                    },
                                    auto_fixable: true,
                                    fix_hint: `Replace StringLike with StringEquals for "${key}"`,
                                    fix_data: {
                                        condition_key: key,
                                        condition_value: strValue,
                                    },
                                });
                            }
                        }
                    }
                }
            }

            return violations;
        },
    };
}
