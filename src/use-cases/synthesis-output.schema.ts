import { z } from "zod";

const CreateRolePayloadSchema = z.object({
    RoleName: z.string().min(1),
    AssumeRolePolicyDocument: z.string().min(1),
    Path: z.string().startsWith("/").endsWith("/"),
    Description: z.string(),
    MaxSessionDuration: z.number().int().min(3600).max(43200),
    PermissionsBoundary: z.string().optional(),
});

const CreatePolicyPayloadSchema = z.object({
    PolicyName: z.string().min(1),
    PolicyDocument: z.string().min(1),
    Path: z.string().startsWith("/").endsWith("/"),
    Description: z.string(),
});

const AttachRolePolicyPayloadSchema = z.object({
    RoleName: z.string().min(1),
    PolicyArn: z.string().startsWith("arn:"),
});

const RoleSynthesisSchema = z.object({
    create_role: CreateRolePayloadSchema,
    create_policies: z.array(CreatePolicyPayloadSchema).readonly(),
    attach_role_policies: z.array(AttachRolePolicyPayloadSchema).readonly(),
});

export const SynthesisOutputSchema = z.object({
    roles: z.array(RoleSynthesisSchema).readonly(),
});

export type SynthesisOutputInput = z.infer<typeof SynthesisOutputSchema>;
