import { z } from "zod";

const MAX_ACTIONS_PER_ROLE = 5000;
const MAX_SOURCE_RESOURCES = 1000;
const MAX_PLAN_ACTIONS = 10;

const ActionEntrySchema = z.object({
    action: z.string(),
    resource: z.string(),
    purpose: z.string(),
    category: z.string(),
});

const InfrastructureActionEntrySchema = ActionEntrySchema.extend({
    source_resource: z.array(z.string()).max(MAX_SOURCE_RESOURCES),
    plan_action: z.array(z.string()).max(MAX_PLAN_ACTIONS),
});

const RoleActionsSchema = <T extends z.ZodTypeAny>(entrySchema: T) =>
    z.object({
        plan_and_apply: z.array(entrySchema).max(MAX_ACTIONS_PER_ROLE),
        apply_only: z.array(entrySchema).max(MAX_ACTIONS_PER_ROLE),
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
