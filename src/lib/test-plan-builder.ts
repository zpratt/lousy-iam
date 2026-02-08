import type { PlanAction, TerraformPlan } from "../entities/terraform-plan.js";

const AWS_PROVIDER = "registry.terraform.io/hashicorp/aws";

interface ResourceChangeInput {
    readonly address: string;
    readonly type: string;
    readonly actions: readonly PlanAction[];
    readonly providerName?: string;
    readonly before?: Record<string, unknown> | null;
    readonly after?: Record<string, unknown> | null;
}

export function buildPlanJson(
    resources: readonly ResourceChangeInput[],
    options?: {
        readonly formatVersion?: string;
        readonly terraformVersion?: string;
    },
): string {
    const resourceChanges = resources.map((r) => {
        const change = {
            actions: r.actions,
            before: r.before ?? null,
            after: r.after ?? null,
        };
        return {
            address: r.address,
            type: r.type,
            provider_name: r.providerName ?? AWS_PROVIDER,
            change,
        };
    });

    const plan = {
        format_version: options?.formatVersion ?? "1.2",
        terraform_version: options?.terraformVersion ?? "1.7.0",
        resource_changes: resourceChanges,
    };

    // Return as JSON string - property names must be snake_case to match Terraform format
    return JSON.stringify(plan);
}

export function buildPlanObject(
    resources: readonly ResourceChangeInput[],
    options?: {
        readonly formatVersion?: string;
        readonly terraformVersion?: string;
    },
): TerraformPlan {
    return JSON.parse(buildPlanJson(resources, options)) as TerraformPlan;
}
