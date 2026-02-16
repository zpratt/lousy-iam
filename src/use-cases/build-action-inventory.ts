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

// Toolchain ARN resources use placeholder syntax (e.g., ${state_bucket}) that consumers
// must substitute with actual values for their environment. These are NOT JS template
// literals — they are output verbatim in the action inventory JSON for user substitution.
const TERRAFORM_TOOLCHAIN_PLAN_AND_APPLY: readonly ActionEntry[] = [
    {
        action: "sts:GetCallerIdentity",
        resource: "*",
        purpose: "Provider initialization",
        category: "toolchain",
    },
    {
        action: "s3:GetObject",
        // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM ARN placeholder for user substitution
        resource: "arn:aws:s3:::${state_bucket}/${state_key_prefix}*",
        purpose: "Read Terraform state",
        category: "toolchain",
    },
    {
        action: "s3:ListBucket",
        // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM ARN placeholder for user substitution
        resource: "arn:aws:s3:::${state_bucket}",
        purpose: "List state files",
        category: "toolchain",
    },
    {
        action: "dynamodb:GetItem",
        resource:
            // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM ARN placeholder for user substitution
            "arn:aws:dynamodb:${region}:${account_id}:table/${lock_table}",
        purpose: "Check lock",
        category: "toolchain",
    },
];

const TERRAFORM_TOOLCHAIN_APPLY_ONLY: readonly ActionEntry[] = [
    {
        action: "s3:PutObject",
        // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM ARN placeholder for user substitution
        resource: "arn:aws:s3:::${state_bucket}/${state_key_prefix}*",
        purpose: "Write Terraform state",
        category: "toolchain",
    },
    {
        action: "s3:DeleteObject",
        // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM ARN placeholder for user substitution
        resource: "arn:aws:s3:::${state_bucket}/${state_key_prefix}*",
        purpose: "Delete old state",
        category: "toolchain",
    },
    {
        action: "dynamodb:PutItem",
        resource:
            // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM ARN placeholder for user substitution
            "arn:aws:dynamodb:${region}:${account_id}:table/${lock_table}",
        purpose: "Acquire lock",
        category: "toolchain",
    },
    {
        action: "dynamodb:DeleteItem",
        resource:
            // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM ARN placeholder for user substitution
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
