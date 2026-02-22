import { z } from "zod";

const ActionEntrySchema = z.object({
    action: z.string(),
    resource: z.string(),
    purpose: z.string(),
    category: z.string(),
});

const InfrastructureActionEntrySchema = ActionEntrySchema.extend({
    source_resource: z.array(z.string()),
    plan_action: z.array(z.string()),
});

const RoleActionsSchema = <T extends z.ZodTypeAny>(entrySchema: T) =>
    z.object({
        plan_and_apply: z.array(entrySchema),
        apply_only: z.array(entrySchema),
    });

export const ActionInventoryInputSchema = z.object({
    metadata: z.object({
        iac_tool: z.string(),
        iac_version: z.string(),
        format_version: z.string(),
    }),
    toolchain_actions: RoleActionsSchema(ActionEntrySchema),
    infrastructure_actions: RoleActionsSchema(InfrastructureActionEntrySchema),
});

export type ActionInventoryInput = z.infer<typeof ActionInventoryInputSchema>;
