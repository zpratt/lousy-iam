import { z } from "zod";
import type { TerraformPlan } from "../entities/terraform-plan.js";

const PlanActionSchema = z.enum([
    "no-op",
    "create",
    "read",
    "update",
    "delete",
]);

// Terraform plan JSON uses snake_case — these property names match the external format
const ResourceChangeSchema = z.object({
    address: z.string(),
    type: z.string(),
    provider_name: z.string(),
    change: z.object({
        actions: z.array(PlanActionSchema),
        before: z.record(z.unknown()).nullable(),
        after: z.record(z.unknown()).nullable(),
    }),
});

export const TerraformPlanSchema = z.object({
    format_version: z.string(),
    terraform_version: z.string(),
    resource_changes: z.array(ResourceChangeSchema),
}) satisfies z.ZodType<TerraformPlan>;
