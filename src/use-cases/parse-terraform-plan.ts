import type { ActionInventoryMetadata } from "../entities/action-inventory.js";
import type { ResourceChange } from "../entities/terraform-plan.js";
import { TerraformPlanSchema } from "../entities/terraform-plan.js";

export interface ParseResult {
    readonly metadata: ActionInventoryMetadata;
    readonly resourceChanges: readonly ResourceChange[];
}

export interface TerraformPlanParser {
    parse(jsonString: string): ParseResult;
}

function isAwsProvider(providerName: string): boolean {
    return providerName.includes("hashicorp/aws");
}

export function createTerraformPlanParser(): TerraformPlanParser {
    return {
        parse(jsonString: string): ParseResult {
            let rawData: unknown;
            try {
                rawData = JSON.parse(jsonString);
            } catch {
                throw new Error("Invalid JSON input");
            }

            const plan = TerraformPlanSchema.parse(rawData);

            const awsResourceChanges = plan.resource_changes.filter((rc) =>
                isAwsProvider(rc.provider_name),
            );

            return {
                metadata: {
                    iacTool: "terraform",
                    iacVersion: plan.terraform_version,
                    formatVersion: plan.format_version,
                },
                resourceChanges: awsResourceChanges,
            };
        },
    };
}
