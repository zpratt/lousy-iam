import type { FormulationConfig } from "../entities/formulation-config.js";
import type {
    AttachRolePolicyPayload,
    CreatePolicyPayload,
    CreateRolePayload,
    RoleSynthesis,
    SynthesisOutput,
} from "../entities/synthesis-output.js";
import { normalizePath } from "../entities/synthesis-output.js";
import { resolvePartition } from "../lib/resolve-partition.js";
import type { FormulationOutputInput } from "./formulation-output.schema.js";

export interface PayloadSynthesizer {
    synthesize(
        input: FormulationOutputInput,
        config: FormulationConfig,
    ): SynthesisOutput;
}

export function createPayloadSynthesizer(): PayloadSynthesizer {
    return {
        synthesize(
            input: FormulationOutputInput,
            config: FormulationConfig,
        ): SynthesisOutput {
            const partition = resolvePartition(config.region);
            const accountId = config.accountId ?? "";

            const roles: RoleSynthesis[] = input.roles.map((role) => {
                const normalizedPath = normalizePath(role.role_path);

                const createRole: CreateRolePayload = {
                    RoleName: role.role_name,
                    AssumeRolePolicyDocument: JSON.stringify(role.trust_policy),
                    Path: normalizedPath,
                    Description: role.description,
                    MaxSessionDuration: role.max_session_duration,
                    ...(role.permission_boundary_arn != null && {
                        PermissionsBoundary: role.permission_boundary_arn,
                    }),
                };

                const createPolicies: CreatePolicyPayload[] =
                    role.permission_policies.map((policy) => ({
                        PolicyName: policy.policy_name,
                        PolicyDocument: JSON.stringify(
                            policy.policy_document,
                        ),
                        Path: normalizedPath,
                        Description: `Permission policy for role ${role.role_name}`,
                    }));

                const attachRolePolicies: AttachRolePolicyPayload[] =
                    role.permission_policies.map((policy) => ({
                        RoleName: role.role_name,
                        PolicyArn: `arn:${partition}:iam::${accountId}:policy${normalizedPath}${policy.policy_name}`,
                    }));

                return {
                    create_role: createRole,
                    create_policies: createPolicies,
                    attach_role_policies: attachRolePolicies,
                };
            });

            return { roles };
        },
    };
}
