import type {
    ActionEntry,
    ActionInventory,
    ActionInventoryMetadata,
    InfrastructureActionEntry,
    RoleActions,
} from "../entities/action-inventory.js";

export interface ActionInventoryBuilder {
    build(
        metadata: ActionInventoryMetadata,
        infrastructureActions: RoleActions<InfrastructureActionEntry>,
    ): ActionInventory;
}

const TERRAFORM_TOOLCHAIN_PLAN_AND_APPLY: readonly ActionEntry[] = [
    {
        action: "sts:GetCallerIdentity",
        resource: "*",
        purpose: "Provider initialization",
        category: "toolchain",
    },
    {
        action: "s3:GetObject",
        resource: "arn:aws:s3:::${state_bucket}/${state_key_prefix}*",
        purpose: "Read Terraform state",
        category: "toolchain",
    },
    {
        action: "s3:ListBucket",
        resource: "arn:aws:s3:::${state_bucket}",
        purpose: "List state files",
        category: "toolchain",
    },
    {
        action: "dynamodb:GetItem",
        resource:
            "arn:aws:dynamodb:${region}:${account_id}:table/${lock_table}",
        purpose: "Check lock",
        category: "toolchain",
    },
];

const TERRAFORM_TOOLCHAIN_APPLY_ONLY: readonly ActionEntry[] = [
    {
        action: "s3:PutObject",
        resource: "arn:aws:s3:::${state_bucket}/${state_key_prefix}*",
        purpose: "Write Terraform state",
        category: "toolchain",
    },
    {
        action: "s3:DeleteObject",
        resource: "arn:aws:s3:::${state_bucket}/${state_key_prefix}*",
        purpose: "Delete old state",
        category: "toolchain",
    },
    {
        action: "dynamodb:PutItem",
        resource:
            "arn:aws:dynamodb:${region}:${account_id}:table/${lock_table}",
        purpose: "Acquire lock",
        category: "toolchain",
    },
    {
        action: "dynamodb:DeleteItem",
        resource:
            "arn:aws:dynamodb:${region}:${account_id}:table/${lock_table}",
        purpose: "Release lock",
        category: "toolchain",
    },
];

export function createActionInventoryBuilder(): ActionInventoryBuilder {
    return {
        build(
            metadata: ActionInventoryMetadata,
            infrastructureActions: RoleActions<InfrastructureActionEntry>,
        ): ActionInventory {
            return {
                metadata,
                toolchainActions: {
                    planAndApply: TERRAFORM_TOOLCHAIN_PLAN_AND_APPLY,
                    applyOnly: TERRAFORM_TOOLCHAIN_APPLY_ONLY,
                },
                infrastructureActions,
            };
        },
    };
}
