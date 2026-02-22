import type {
    PermissionPolicy,
    PolicyDocument,
    PolicyStatement,
} from "../entities/policy-document.js";
import type { ActionInventoryInput } from "./action-inventory.schema.js";

export interface PermissionPolicyBuilder {
    buildPlanPolicy(
        inventory: ActionInventoryInput,
        resourcePrefix: string,
    ): PermissionPolicy;
    buildApplyPolicy(
        inventory: ActionInventoryInput,
        resourcePrefix: string,
        includeDeleteActions: boolean,
    ): PermissionPolicy;
}

interface ActionEntry {
    readonly action: string;
    readonly resource: string;
    readonly category: string;
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

function groupActionsByServiceAndResource(
    actions: readonly ActionEntry[],
): Map<
    string,
    { actions: string[]; actionSet: Set<string>; resource: string }
> {
    const groups = new Map<
        string,
        { actions: string[]; actionSet: Set<string>; resource: string }
    >();

    for (const entry of actions) {
        const service = extractServicePrefix(entry.action);
        const key = `${service}|${entry.resource}`;
        const existing = groups.get(key);

        if (existing) {
            if (!existing.actionSet.has(entry.action)) {
                existing.actionSet.add(entry.action);
                existing.actions.push(entry.action);
            }
        } else {
            groups.set(key, {
                actions: [entry.action],
                actionSet: new Set([entry.action]),
                resource: entry.resource,
            });
        }
    }

    return groups;
}

function buildStatements(
    actions: readonly ActionEntry[],
    sidSuffix: string,
): PolicyStatement[] {
    const groups = groupActionsByServiceAndResource(actions);
    const statements: PolicyStatement[] = [];
    const sidCounts = new Map<string, number>();

    for (const [key, group] of groups) {
        const service = key.split("|")[0] as string;
        const baseSid = `${toSidSegment(service)}${sidSuffix}`;
        const count = sidCounts.get(baseSid) ?? 0;
        sidCounts.set(baseSid, count + 1);
        const sid = count === 0 ? baseSid : `${baseSid}${count + 1}`;

        statements.push({
            Sid: sid,
            Effect: "Allow",
            Action: [...group.actions].sort(),
            Resource: group.resource,
        });
    }

    return statements;
}

function buildPolicyDocument(statements: PolicyStatement[]): PolicyDocument {
    return {
        Version: "2012-10-17",
        Statement: statements,
    };
}

function estimatePolicySize(document: PolicyDocument): number {
    return new TextEncoder().encode(JSON.stringify(document)).length;
}

export function createPermissionPolicyBuilder(): PermissionPolicyBuilder {
    return {
        buildPlanPolicy(
            inventory: ActionInventoryInput,
            resourcePrefix: string,
        ): PermissionPolicy {
            const toolchainStatements = buildStatements(
                inventory.toolchain_actions.plan_and_apply,
                "ToolchainRead",
            );

            const infraStatements = buildStatements(
                inventory.infrastructure_actions.plan_and_apply,
                "InfraRead",
            );

            const allStatements = [...toolchainStatements, ...infraStatements];
            const document = buildPolicyDocument(allStatements);

            return {
                policy_name: `${resourcePrefix}-github-plan-permissions`,
                policy_document: document,
                estimated_size_bytes: estimatePolicySize(document),
            };
        },

        buildApplyPolicy(
            inventory: ActionInventoryInput,
            resourcePrefix: string,
            includeDeleteActions: boolean,
        ): PermissionPolicy {
            const toolchainReadStatements = buildStatements(
                inventory.toolchain_actions.plan_and_apply,
                "ToolchainRead",
            );
            const toolchainWriteStatements = buildStatements(
                inventory.toolchain_actions.apply_only,
                "ToolchainWrite",
            );

            const infraReadStatements = buildStatements(
                inventory.infrastructure_actions.plan_and_apply,
                "InfraRead",
            );

            const applyOnlyActions = includeDeleteActions
                ? inventory.infrastructure_actions.apply_only
                : inventory.infrastructure_actions.apply_only.filter(
                      (a) => a.category !== "delete",
                  );

            const infraWriteStatements = buildStatements(
                applyOnlyActions,
                "InfraWrite",
            );

            const allStatements = [
                ...toolchainReadStatements,
                ...toolchainWriteStatements,
                ...infraReadStatements,
                ...infraWriteStatements,
            ];
            const document = buildPolicyDocument(allStatements);

            return {
                policy_name: `${resourcePrefix}-github-apply-permissions`,
                policy_document: document,
                estimated_size_bytes: estimatePolicySize(document),
            };
        },
    };
}
