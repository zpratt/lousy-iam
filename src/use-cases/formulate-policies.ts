import type { FormulationConfig } from "../entities/formulation-config.js";
import type {
    FormulationOutput,
    RoleDefinition,
} from "../entities/policy-document.js";
import type { ActionInventoryInput } from "./action-inventory.schema.js";
import type { PermissionPolicyBuilder } from "./build-permission-policy.js";
import type { TrustPolicyBuilder } from "./build-trust-policy.js";

export interface FormulatePoliciesDeps {
    readonly permissionPolicyBuilder: PermissionPolicyBuilder;
    readonly trustPolicyBuilder: TrustPolicyBuilder;
}

export interface PolicyFormulator {
    formulate(
        inventory: ActionInventoryInput,
        config: FormulationConfig,
    ): FormulationOutput;
}

export function createPolicyFormulator(
    deps: FormulatePoliciesDeps,
): PolicyFormulator {
    return {
        formulate(
            inventory: ActionInventoryInput,
            config: FormulationConfig,
        ): FormulationOutput {
            const roles: RoleDefinition[] = [];

            if (config.planApplySeparation) {
                const planPermission =
                    deps.permissionPolicyBuilder.buildPlanPolicy(
                        inventory,
                        config.resourcePrefix,
                    );
                const planTrust =
                    deps.trustPolicyBuilder.buildPlanTrust(config);

                roles.push({
                    role_name: `${config.resourcePrefix}-github-plan`,
                    role_path: config.rolePath,
                    description:
                        "Read-only role for terraform plan / cdk diff on pull requests",
                    max_session_duration: config.maxSessionDuration,
                    permission_boundary_arn: config.permissionBoundaryArn,
                    trust_policy: planTrust,
                    permission_policies: [planPermission],
                });
            }

            const applyPermission =
                deps.permissionPolicyBuilder.buildApplyPolicy(
                    inventory,
                    config.resourcePrefix,
                    config.includeDeleteActions,
                );
            const applyTrust = deps.trustPolicyBuilder.buildApplyTrust(config);

            roles.push({
                role_name: `${config.resourcePrefix}-github-apply`,
                role_path: config.rolePath,
                description:
                    "Full CRUD role for terraform apply / cdk deploy on merge to main",
                max_session_duration: config.maxSessionDuration,
                permission_boundary_arn: config.permissionBoundaryArn,
                trust_policy: applyTrust,
                permission_policies: [applyPermission],
            });

            const templateVariables: Record<string, string> = {
                account_id: config.accountId ?? "Target AWS account ID",
                region: config.region ?? "Target region or * for multi-region",
                resource_prefix: config.resourcePrefix,
                org: config.githubOrg,
                repo: config.githubRepo,
            };

            return { roles, template_variables: templateVariables };
        },
    };
}
