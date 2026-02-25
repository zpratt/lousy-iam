import type { ValidationViolation } from "../entities/validation-result.js";

export interface PermissionPolicyValidatorConfig {
    readonly unscopedActions: ReadonlySet<string>;
    readonly roleName: string;
}

interface PolicyStatement {
    readonly Sid: string;
    readonly Effect: string;
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
    readonly NotAction?: readonly string[] | undefined;
}

interface PolicyDocument {
    readonly Version?: string | undefined;
    readonly Statement: readonly PolicyStatement[];
}

const DENY_LISTED_ACTIONS = new Set([
    "organizations:*",
    "account:*",
    "iam:CreateUser",
    "iam:CreateAccessKey",
    "iam:CreateLoginProfile",
]);

const OVERLY_BROAD_ACTIONS = new Set(["ec2:*", "s3:*", "lambda:*"]);

const REGION_SCOPED_SERVICES = new Set([
    "ec2",
    "ecs",
    "lambda",
    "rds",
    "s3",
    "sqs",
    "sns",
    "logs",
    "elasticloadbalancing",
    "secretsmanager",
    "ssm",
    "codebuild",
    "codepipeline",
    "batch",
    "glue",
    "elasticache",
]);

function isWildcardResource(resource: string | readonly string[]): boolean {
    if (typeof resource === "string") {
        return resource === "*";
    }
    return resource.length === 1 && resource[0] === "*";
}

function getResourceString(resource: string | readonly string[]): string {
    if (typeof resource === "string") {
        return resource;
    }
    return resource[0] ?? "";
}

function extractServicePrefix(action: string): string {
    const colonIndex = action.indexOf(":");
    return colonIndex > 0 ? action.substring(0, colonIndex).toLowerCase() : "";
}

function hasCondition(
    statement: PolicyStatement,
    operator: string,
    conditionKey: string,
): boolean {
    if (!statement.Condition) {
        return false;
    }
    const operatorBlock = statement.Condition[operator];
    if (!operatorBlock) {
        return false;
    }
    return conditionKey in operatorBlock;
}

function isActionInStatement(
    statement: PolicyStatement,
    actionName: string,
): boolean {
    return statement.Action.some(
        (a) => a.toLowerCase() === actionName.toLowerCase(),
    );
}

function containsAccountId(resource: string): boolean {
    return /arn:aws:[^:]*:[^:]*:\d{12}:/.test(resource);
}

function hasWildcardResourceSegment(resource: string): boolean {
    if (!resource.startsWith("arn:")) {
        return false;
    }
    const parts = resource.split(":");
    const resourceSegment = parts.slice(5).join(":");
    return resourceSegment === "*";
}

function isUnscopedAction(
    action: string,
    unscopedActions: ReadonlySet<string>,
): boolean {
    if (unscopedActions.has(action)) {
        return true;
    }
    for (const pattern of unscopedActions) {
        if (pattern.endsWith("*")) {
            const prefix = pattern.slice(0, -1);
            if (action.startsWith(prefix)) {
                return true;
            }
        }
    }
    return false;
}

function isResourceCreationAction(action: string): boolean {
    const lower = action.toLowerCase();
    return (
        lower.includes("create") ||
        lower.includes("put") ||
        lower.includes("register")
    );
}

function matchesRoleSelfReference(
    resource: string | readonly string[],
    roleName: string,
): boolean {
    const resources = typeof resource === "string" ? [resource] : resource;
    return resources.some(
        (r) =>
            r.includes(roleName) ||
            // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM template variable
            r.includes("${role_name}") ||
            r === "*",
    );
}

export interface PermissionPolicyValidator {
    validate(
        document: PolicyDocument,
        config: PermissionPolicyValidatorConfig,
    ): readonly ValidationViolation[];
}

export function createPermissionPolicyValidator(): PermissionPolicyValidator {
    return {
        validate(
            document: PolicyDocument,
            config: PermissionPolicyValidatorConfig,
        ): readonly ValidationViolation[] {
            const violations: ValidationViolation[] = [];

            violations.push(...validatePolicyStructure(document));

            for (let i = 0; i < document.Statement.length; i++) {
                const statement = document.Statement[i];
                if (!statement) {
                    continue;
                }
                violations.push(
                    ...validateActionScoping(statement, i),
                    ...validateResourceScoping(
                        statement,
                        i,
                        config.unscopedActions,
                    ),
                    ...validateConditionRequirements(statement, i),
                    ...validateStatementStructure(statement, i, document),
                    ...validatePrivilegeEscalation(
                        statement,
                        i,
                        config.roleName,
                    ),
                );
            }

            return violations;
        },
    };
}

function validatePolicyStructure(
    document: PolicyDocument,
): ValidationViolation[] {
    const violations: ValidationViolation[] = [];

    if (document.Version !== "2012-10-17") {
        violations.push({
            rule_id: "LP-040",
            severity: "error",
            message: 'Policy document must include "Version": "2012-10-17"',
            field: "Version",
            current_value: document.Version ?? null,
            auto_fixable: true,
            fix_hint: 'Add "Version": "2012-10-17"',
        });
    }

    const policySize = new TextEncoder().encode(
        JSON.stringify(document),
    ).length;
    if (policySize > 6144) {
        violations.push({
            rule_id: "LP-042",
            severity: "error",
            message: `Policy size (${policySize} bytes) exceeds 6,144 byte limit`,
            field: "Policy",
            current_value: policySize,
            auto_fixable: false,
            fix_hint: "Split into multiple policies",
        });
    }

    const allActions = new Map<string, number[]>();
    for (let i = 0; i < document.Statement.length; i++) {
        const statement = document.Statement[i];
        if (!statement) {
            continue;
        }
        for (const action of statement.Action) {
            const existing = allActions.get(action);
            if (existing) {
                existing.push(i);
            } else {
                allActions.set(action, [i]);
            }
        }
    }

    for (const [action, indices] of allActions) {
        if (indices.length > 1) {
            violations.push({
                rule_id: "LP-046",
                severity: "warning",
                message: `Action "${action}" appears in multiple statements (indices: ${indices.join(", ")})`,
                field: "Action",
                current_value: action,
                auto_fixable: true,
                fix_hint:
                    "Move duplicate actions to statement with more specific resource scope",
                fix_data: { action, statement_indices: indices },
            });
        }
    }

    return violations;
}

function validateActionScoping(
    statement: PolicyStatement,
    statementIndex: number,
): ValidationViolation[] {
    const violations: ValidationViolation[] = [];

    if (statement.Effect !== "Allow") {
        return violations;
    }

    for (const action of statement.Action) {
        if (action === "*") {
            violations.push({
                rule_id: "LP-001",
                severity: "error",
                message: "Global wildcard action (*) is not permitted",
                statement_sid: statement.Sid,
                statement_index: statementIndex,
                field: "Action",
                current_value: "*",
                auto_fixable: false,
                fix_hint:
                    "Replace * with specific actions for resources in this statement",
            });
        }

        if (
            action !== "*" &&
            action.endsWith(":*") &&
            !action.startsWith("*")
        ) {
            violations.push({
                rule_id: "LP-002",
                severity: "error",
                message: `Service-level wildcard action "${action}" is not permitted`,
                statement_sid: statement.Sid,
                statement_index: statementIndex,
                field: "Action",
                current_value: action,
                auto_fixable: false,
                fix_hint: `Replace ${action} with specific actions`,
            });

            if (OVERLY_BROAD_ACTIONS.has(action)) {
                violations.push({
                    rule_id: "LP-005",
                    severity: "warning",
                    message: `Overly broad action "${action}" detected`,
                    statement_sid: statement.Sid,
                    statement_index: statementIndex,
                    field: "Action",
                    current_value: action,
                    auto_fixable: false,
                    fix_hint: `Replace ${action} with only the specific actions needed`,
                });
            }
        }

        if (DENY_LISTED_ACTIONS.has(action)) {
            violations.push({
                rule_id: "LP-004",
                severity: "error",
                message: `Deny-listed action "${action}" is not permitted`,
                statement_sid: statement.Sid,
                statement_index: statementIndex,
                field: "Action",
                current_value: action,
                auto_fixable: false,
                fix_hint: `Remove deny-listed action "${action}"`,
            });
        }

        if (
            action.toLowerCase() === "sts:assumerole" &&
            isWildcardResource(statement.Resource)
        ) {
            violations.push({
                rule_id: "LP-004",
                severity: "error",
                message: "Unscoped sts:AssumeRole is not permitted",
                statement_sid: statement.Sid,
                statement_index: statementIndex,
                field: "Action",
                current_value: action,
                auto_fixable: false,
                fix_hint: "Scope sts:AssumeRole to specific role ARNs",
            });
        }
    }

    if (
        "NotAction" in statement &&
        statement.NotAction &&
        statement.NotAction.length > 0
    ) {
        violations.push({
            rule_id: "LP-003",
            severity: "warning",
            message:
                "NotAction usage detected — review for overly broad permissions",
            statement_sid: statement.Sid,
            statement_index: statementIndex,
            field: "NotAction",
            current_value: statement.NotAction,
            auto_fixable: false,
            fix_hint: "Replace NotAction with explicit Action list",
        });
    }

    return violations;
}

function validateResourceScoping(
    statement: PolicyStatement,
    statementIndex: number,
    unscopedActions: ReadonlySet<string>,
): ValidationViolation[] {
    const violations: ValidationViolation[] = [];

    if (statement.Effect !== "Allow") {
        return violations;
    }

    if (isWildcardResource(statement.Resource)) {
        for (const action of statement.Action) {
            if (!isUnscopedAction(action, unscopedActions)) {
                violations.push({
                    rule_id: "LP-010",
                    severity: "error",
                    message: `Resource: "*" on action "${action}" that supports resource-level permissions`,
                    statement_sid: statement.Sid,
                    statement_index: statementIndex,
                    field: "Resource",
                    current_value: "*",
                    auto_fixable: false,
                    fix_hint: `Scope Resource to specific ARN pattern for "${action}"`,
                });
            } else {
                violations.push({
                    rule_id: "LP-011",
                    severity: "warning",
                    message: `Resource: "*" on unscoped action "${action}" — consider adding conditions`,
                    statement_sid: statement.Sid,
                    statement_index: statementIndex,
                    field: "Resource",
                    current_value: "*",
                    auto_fixable: false,
                    fix_hint: "Add conditions to further restrict scope",
                });
            }
        }
    }

    const resources =
        typeof statement.Resource === "string"
            ? [statement.Resource]
            : statement.Resource;

    for (const resource of resources) {
        if (containsAccountId(resource)) {
            violations.push({
                rule_id: "LP-012",
                severity: "error",
                message: `Resource ARN hardcodes account ID: "${resource}"`,
                statement_sid: statement.Sid,
                statement_index: statementIndex,
                field: "Resource",
                current_value: resource,
                auto_fixable: false,
                fix_hint:
                    // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM template variable reference
                    "Replace hardcoded account ID with ${account_id} template variable",
            });
        }

        if (hasWildcardResourceSegment(resource) && !statement.Condition) {
            violations.push({
                rule_id: "LP-013",
                severity: "warning",
                message: `Resource ARN with wildcard resource segment "${resource}" should have conditions`,
                statement_sid: statement.Sid,
                statement_index: statementIndex,
                field: "Resource",
                current_value: resource,
                auto_fixable: false,
                fix_hint: "Add conditions to narrow scope",
            });
        }
    }

    return violations;
}

function validateConditionRequirements(
    statement: PolicyStatement,
    statementIndex: number,
): ValidationViolation[] {
    const violations: ValidationViolation[] = [];

    if (statement.Effect !== "Allow") {
        return violations;
    }

    if (isActionInStatement(statement, "iam:PassRole")) {
        if (isWildcardResource(statement.Resource)) {
            violations.push({
                rule_id: "LP-020",
                severity: "error",
                message: "iam:PassRole Resource must not be *",
                statement_sid: statement.Sid,
                statement_index: statementIndex,
                field: "Resource",
                current_value: "*",
                auto_fixable: false,
                fix_hint:
                    "Scope iam:PassRole Resource to specific role ARN patterns",
            });
        }

        if (
            !hasCondition(statement, "StringEquals", "iam:PassedToService") &&
            !hasCondition(statement, "StringLike", "iam:PassedToService")
        ) {
            violations.push({
                rule_id: "LP-021",
                severity: "error",
                message:
                    "iam:PassRole must include iam:PassedToService condition",
                statement_sid: statement.Sid,
                statement_index: statementIndex,
                field: "Condition",
                current_value: statement.Condition ?? null,
                auto_fixable: true,
                fix_hint: "Add Condition.StringEquals.iam:PassedToService",
                fix_data: { condition_key: "iam:PassedToService" },
            });
        }
    }

    if (isActionInStatement(statement, "iam:CreateRole")) {
        if (
            !hasCondition(statement, "StringEquals", "iam:PermissionsBoundary")
        ) {
            violations.push({
                rule_id: "LP-022",
                severity: "error",
                message:
                    "iam:CreateRole should have iam:PermissionsBoundary condition",
                statement_sid: statement.Sid,
                statement_index: statementIndex,
                field: "Condition",
                current_value: statement.Condition ?? null,
                auto_fixable: false,
                fix_hint:
                    "Add Condition.StringEquals.iam:PermissionsBoundary with boundary ARN",
            });
        }
    }

    if (isActionInStatement(statement, "iam:CreateServiceLinkedRole")) {
        if (
            !hasCondition(statement, "StringEquals", "iam:AWSServiceName") &&
            !hasCondition(statement, "StringLike", "iam:AWSServiceName")
        ) {
            violations.push({
                rule_id: "LP-023",
                severity: "error",
                message:
                    "iam:CreateServiceLinkedRole must have iam:AWSServiceName condition",
                statement_sid: statement.Sid,
                statement_index: statementIndex,
                field: "Condition",
                current_value: statement.Condition ?? null,
                auto_fixable: true,
                fix_hint: "Add Condition.StringEquals.iam:AWSServiceName",
                fix_data: { condition_key: "iam:AWSServiceName" },
            });
        }
    }

    if (isWildcardResource(statement.Resource)) {
        const hasRegionScoped = statement.Action.some((a) =>
            REGION_SCOPED_SERVICES.has(extractServicePrefix(a)),
        );
        if (
            hasRegionScoped &&
            !hasCondition(statement, "StringEquals", "aws:RequestedRegion") &&
            !hasCondition(statement, "StringLike", "aws:RequestedRegion")
        ) {
            violations.push({
                rule_id: "LP-024",
                severity: "warning",
                message:
                    'Resource: "*" on region-scoped service should have aws:RequestedRegion condition',
                statement_sid: statement.Sid,
                statement_index: statementIndex,
                field: "Condition",
                current_value: statement.Condition ?? null,
                auto_fixable: true,
                fix_hint: "Add Condition.StringEquals.aws:RequestedRegion",
                fix_data: {
                    condition_key: "aws:RequestedRegion",
                },
            });
        }
    }

    const hasCreationActions = statement.Action.some(isResourceCreationAction);
    if (hasCreationActions) {
        if (
            !hasCondition(statement, "StringEquals", "aws:RequestTag") &&
            !hasCondition(statement, "StringLike", "aws:RequestTag") &&
            !hasCondition(
                statement,
                "ForAllValues:StringEquals",
                "aws:RequestTag",
            )
        ) {
            violations.push({
                rule_id: "LP-025",
                severity: "warning",
                message:
                    "Resource creation action should have aws:RequestTag conditions if mandatory tags are configured",
                statement_sid: statement.Sid,
                statement_index: statementIndex,
                field: "Condition",
                current_value: statement.Condition ?? null,
                auto_fixable: true,
                fix_hint: "Add aws:RequestTag conditions for mandatory tags",
                fix_data: {
                    condition_key: "aws:RequestTag",
                },
            });
        }
    }

    return violations;
}

function validateStatementStructure(
    statement: PolicyStatement,
    statementIndex: number,
    document: PolicyDocument,
): ValidationViolation[] {
    const violations: ValidationViolation[] = [];

    if (!statement.Sid || statement.Sid.trim() === "") {
        violations.push({
            rule_id: "LP-041",
            severity: "error",
            message: "Every statement must have an explicit Sid",
            statement_index: statementIndex,
            field: "Sid",
            current_value: statement.Sid ?? null,
            auto_fixable: true,
            fix_hint: "Generate Sid from action group",
        });
    }

    if (statement.Action.length > 20) {
        violations.push({
            rule_id: "LP-043",
            severity: "warning",
            message: `Statement has ${statement.Action.length} actions (recommended max: 20)`,
            statement_sid: statement.Sid,
            statement_index: statementIndex,
            field: "Action",
            current_value: statement.Action.length,
            auto_fixable: false,
            fix_hint: "Split into multiple statements",
        });
    }

    const uniqueActions = new Set(statement.Action);
    if (uniqueActions.size < statement.Action.length) {
        const duplicates = statement.Action.filter(
            (action, index) => statement.Action.indexOf(action) !== index,
        );
        violations.push({
            rule_id: "LP-045",
            severity: "error",
            message: `Duplicate actions within statement: ${[...new Set(duplicates)].join(", ")}`,
            statement_sid: statement.Sid,
            statement_index: statementIndex,
            field: "Action",
            current_value: duplicates,
            auto_fixable: true,
            fix_hint: "Deduplicate actions within statement",
        });
    }

    const rolePermPolicies = document.Statement;
    if (rolePermPolicies.length > 10) {
        if (statementIndex === 0) {
            violations.push({
                rule_id: "LP-044",
                severity: "warning",
                message: `Policy has ${rolePermPolicies.length} statements (max recommended: 10 managed policies per role)`,
                field: "Statement",
                current_value: rolePermPolicies.length,
                auto_fixable: false,
                fix_hint: "Consider consolidating or splitting policies",
            });
        }
    }

    return violations;
}

function validatePrivilegeEscalation(
    statement: PolicyStatement,
    statementIndex: number,
    roleName: string,
): ValidationViolation[] {
    const violations: ValidationViolation[] = [];

    if (statement.Effect !== "Allow") {
        return violations;
    }

    const hasSelfModifyActions = statement.Action.some(
        (a) => a === "iam:PutRolePolicy" || a === "iam:AttachRolePolicy",
    );
    if (
        hasSelfModifyActions &&
        matchesRoleSelfReference(statement.Resource, roleName)
    ) {
        violations.push({
            rule_id: "LP-050",
            severity: "error",
            message:
                "iam:PutRolePolicy/iam:AttachRolePolicy must not target deployment role's own ARN",
            statement_sid: statement.Sid,
            statement_index: statementIndex,
            field: "Resource",
            current_value: getResourceString(statement.Resource),
            auto_fixable: false,
            fix_hint: "Scope Resource to exclude the deployment role's own ARN",
        });
    }

    if (
        isActionInStatement(statement, "iam:CreatePolicyVersion") &&
        matchesRoleSelfReference(statement.Resource, roleName)
    ) {
        violations.push({
            rule_id: "LP-051",
            severity: "error",
            message:
                "iam:CreatePolicyVersion must not target deployment role's own policies",
            statement_sid: statement.Sid,
            statement_index: statementIndex,
            field: "Resource",
            current_value: getResourceString(statement.Resource),
            auto_fixable: false,
            fix_hint:
                "Scope Resource to exclude the deployment role's own policies",
        });
    }

    if (isActionInStatement(statement, "iam:CreateRole")) {
        const hasPassRole = statement.Action.some((a) => a === "iam:PassRole");
        if (hasPassRole && isWildcardResource(statement.Resource)) {
            violations.push({
                rule_id: "LP-052",
                severity: "error",
                message:
                    "When iam:CreateRole is present, iam:PassRole must be scoped to only created roles",
                statement_sid: statement.Sid,
                statement_index: statementIndex,
                field: "Resource",
                current_value: "*",
                auto_fixable: false,
                fix_hint:
                    "Scope iam:PassRole Resource to only the roles created by this deployment",
            });
        }
    }

    const policyModifyActions = statement.Action.filter(
        (a) =>
            (a.startsWith("iam:Put") && a.includes("Policy")) ||
            (a.startsWith("iam:Attach") && a.includes("Policy")),
    );
    if (
        policyModifyActions.length > 0 &&
        isWildcardResource(statement.Resource)
    ) {
        violations.push({
            rule_id: "LP-053",
            severity: "warning",
            message: `${policyModifyActions.join(", ")} without resource scoping`,
            statement_sid: statement.Sid,
            statement_index: statementIndex,
            field: "Resource",
            current_value: "*",
            auto_fixable: false,
            fix_hint: "Scope Resource to specific role/policy ARN patterns",
        });
    }

    return violations;
}
