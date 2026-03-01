import { ZodError } from "zod";
import type { ActionInventoryMetadata } from "../entities/action-inventory.js";
import { stripDangerousKeys } from "../entities/sanitize-json.js";
import type {
    ResourceChange,
    TerraformPlan,
} from "../entities/terraform-plan.js";
import { TerraformPlanSchema } from "./terraform-plan.schema.js";

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

function parseJson(jsonString: string): unknown {
    try {
        return JSON.parse(jsonString);
    } catch {
        throw new Error("Invalid JSON input");
    }
}

function sanitize(rawData: unknown): unknown {
    try {
        return stripDangerousKeys(rawData);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
            `Invalid Terraform plan: could not sanitize input (${message})`,
        );
    }
}

function validatePlan(data: unknown): TerraformPlan {
    try {
        return TerraformPlanSchema.parse(data);
    } catch (error) {
        if (error instanceof ZodError) {
            const details = error.issues
                .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
                .join("; ");
            throw new Error(`Invalid Terraform plan: ${details}`);
        }
        throw error;
    }
}

export function createTerraformPlanParser(): TerraformPlanParser {
    return {
        parse(jsonString: string): ParseResult {
            const rawData = parseJson(jsonString);
            const sanitized = sanitize(rawData);
            const plan = validatePlan(sanitized);

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
