import { z } from "zod";

const MAX_ACTIONS_PER_STATEMENT = 200;
const MAX_STATEMENTS = 100;
const MAX_ROLES = 10;
const MAX_POLICIES_PER_ROLE = 10;

const ConditionValueSchema = z.union([z.string(), z.array(z.string())]);

const ConditionBlockSchema = z.record(
    z.string(),
    z.record(z.string(), ConditionValueSchema),
);

const PolicyStatementSchema = z.object({
    Sid: z.string(),
    Effect: z.literal("Allow"),
    Action: z.array(z.string()).max(MAX_ACTIONS_PER_STATEMENT),
    Resource: z.union([z.string(), z.array(z.string())]),
    Condition: ConditionBlockSchema.optional(),
    NotAction: z.array(z.string()).optional(),
});

const PolicyDocumentSchema = z.object({
    Version: z.string().optional(),
    Statement: z.array(PolicyStatementSchema).max(MAX_STATEMENTS),
});

const TrustPolicyStatementSchema = z.object({
    Sid: z.string(),
    Effect: z.literal("Allow"),
    Principal: z.object({
        Federated: z.string(),
    }),
    Action: z.string(),
    Condition: ConditionBlockSchema,
});

const TrustPolicyDocumentSchema = z.object({
    Version: z.string().optional(),
    Statement: z.array(TrustPolicyStatementSchema).max(MAX_STATEMENTS),
});

const PermissionPolicySchema = z.object({
    policy_name: z.string(),
    policy_document: PolicyDocumentSchema,
    estimated_size_bytes: z.number(),
});

const RoleDefinitionSchema = z.object({
    role_name: z.string(),
    role_path: z.string(),
    description: z.string(),
    max_session_duration: z.number(),
    permission_boundary_arn: z.string().nullable(),
    trust_policy: TrustPolicyDocumentSchema,
    permission_policies: z
        .array(PermissionPolicySchema)
        .max(MAX_POLICIES_PER_ROLE),
});

export const FormulationOutputSchema = z.object({
    roles: z.array(RoleDefinitionSchema).max(MAX_ROLES),
    template_variables: z.record(z.string(), z.string()),
});

export type FormulationOutputInput = z.infer<typeof FormulationOutputSchema>;
