import { ZodError } from "zod";
import type { ActionInventoryMetadata } from "../entities/action-inventory.js";
import type {
    ResourceChange,
    TerraformPlan,
} from "../entities/terraform-plan.js";
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

            let plan: TerraformPlan;
            try {
                plan = TerraformPlanSchema.parse(rawData);
            } catch (error) {
                if (error instanceof ZodError) {
                    const details = error.issues
                        .map(
                            (issue) =>
                                `${issue.path.join(".")}: ${issue.message}`,
                        )
                        .join("; ");
                    throw new Error(`Invalid Terraform plan: ${details}`);
                }
                throw error;
            }

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
