import Chance from "chance";
import { describe, expect, it, vi } from "vitest";
import type { FormulationConfig } from "../entities/formulation-config.js";
import type {
    PermissionPolicy,
    PolicyDocument,
    TrustPolicyDocument,
} from "../entities/policy-document.js";
import type { ActionInventoryInput } from "./action-inventory.schema.js";
import { createPolicyFormulator } from "./formulate-policies.js";

const chance = new Chance();

function buildConfig(
    overrides?: Partial<FormulationConfig>,
): FormulationConfig {
    return {
        githubOrg: chance.word(),
        githubRepo: chance.word(),
        resourcePrefix: chance.word(),
        accountId: null,
        region: null,
        planApplySeparation: true,
        includeDeleteActions: true,
        useGithubEnvironments: false,
        githubEnvironmentNames: {},
        permissionBoundaryArn: null,
        rolePath: "/",
        maxSessionDuration: 3600,
        templateVariables: {},
        ...overrides,
    };
}

function buildInventory(): ActionInventoryInput {
    return {
        metadata: {
            iac_tool: "terraform",
            iac_version: chance.semver(),
            format_version: chance.semver(),
        },
        toolchain_actions: {
            plan_and_apply: [],
            apply_only: [],
        },
        infrastructure_actions: {
            plan_and_apply: [],
            apply_only: [],
        },
    };
}

function buildMockPolicyDocument(): PolicyDocument {
    return {
        Version: "2012-10-17",
        Statement: [],
    };
}

function buildMockTrustPolicy(): TrustPolicyDocument {
    return {
        Version: "2012-10-17",
        Statement: [
            {
                Sid: "AllowGitHubOIDC",
                Effect: "Allow",
                Principal: {
                    Federated:
                        "arn:aws:iam::123:oidc-provider/token.actions.githubusercontent.com",
                },
                Action: "sts:AssumeRoleWithWebIdentity",
                Condition: {
                    StringEquals: {
                        "token.actions.githubusercontent.com:aud":
                            "sts.amazonaws.com",
                        "token.actions.githubusercontent.com:sub":
                            "repo:org/repo:ref:refs/heads/main",
                    },
                },
            },
        ],
    };
}

function buildMockPermissionPolicy(): PermissionPolicy {
    return {
        policy_name: "test-policy",
        policy_document: buildMockPolicyDocument(),
        estimated_size_bytes: 100,
    };
}

describe("FormulatePolicies", () => {
    describe("given plan_apply_separation is true", () => {
        it("should produce two role definitions", () => {
            const mockPermissionBuilder = {
                buildPlanPolicy: vi
                    .fn()
                    .mockReturnValue(buildMockPermissionPolicy()),
                buildApplyPolicy: vi
                    .fn()
                    .mockReturnValue(buildMockPermissionPolicy()),
            };
            const mockTrustBuilder = {
                buildPlanTrust: vi.fn().mockReturnValue(buildMockTrustPolicy()),
                buildApplyTrust: vi
                    .fn()
                    .mockReturnValue(buildMockTrustPolicy()),
            };

            const formulator = createPolicyFormulator({
                permissionPolicyBuilder: mockPermissionBuilder,
                trustPolicyBuilder: mockTrustBuilder,
            });

            const config = buildConfig({ planApplySeparation: true });
            const result = formulator.formulate(buildInventory(), config);

            expect(result.roles).toHaveLength(2);
            expect(result.roles[0]?.role_name).toContain("plan");
            expect(result.roles[1]?.role_name).toContain("apply");
        });

        it("should call permission builder for both plan and apply", () => {
            const mockPermissionBuilder = {
                buildPlanPolicy: vi
                    .fn()
                    .mockReturnValue(buildMockPermissionPolicy()),
                buildApplyPolicy: vi
                    .fn()
                    .mockReturnValue(buildMockPermissionPolicy()),
            };
            const mockTrustBuilder = {
                buildPlanTrust: vi.fn().mockReturnValue(buildMockTrustPolicy()),
                buildApplyTrust: vi
                    .fn()
                    .mockReturnValue(buildMockTrustPolicy()),
            };

            const formulator = createPolicyFormulator({
                permissionPolicyBuilder: mockPermissionBuilder,
                trustPolicyBuilder: mockTrustBuilder,
            });

            formulator.formulate(buildInventory(), buildConfig());

            expect(
                mockPermissionBuilder.buildPlanPolicy,
            ).toHaveBeenCalledOnce();
            expect(
                mockPermissionBuilder.buildApplyPolicy,
            ).toHaveBeenCalledOnce();
            expect(mockTrustBuilder.buildPlanTrust).toHaveBeenCalledOnce();
            expect(mockTrustBuilder.buildApplyTrust).toHaveBeenCalledOnce();
        });
    });

    describe("given plan_apply_separation is false", () => {
        it("should produce a single apply role definition", () => {
            const mockPermissionBuilder = {
                buildPlanPolicy: vi
                    .fn()
                    .mockReturnValue(buildMockPermissionPolicy()),
                buildApplyPolicy: vi
                    .fn()
                    .mockReturnValue(buildMockPermissionPolicy()),
            };
            const mockTrustBuilder = {
                buildPlanTrust: vi.fn().mockReturnValue(buildMockTrustPolicy()),
                buildApplyTrust: vi
                    .fn()
                    .mockReturnValue(buildMockTrustPolicy()),
            };

            const formulator = createPolicyFormulator({
                permissionPolicyBuilder: mockPermissionBuilder,
                trustPolicyBuilder: mockTrustBuilder,
            });

            const config = buildConfig({ planApplySeparation: false });
            const result = formulator.formulate(buildInventory(), config);

            expect(result.roles).toHaveLength(1);
            expect(result.roles[0]?.role_name).toContain("apply");
        });

        it("should not call plan builders", () => {
            const mockPermissionBuilder = {
                buildPlanPolicy: vi
                    .fn()
                    .mockReturnValue(buildMockPermissionPolicy()),
                buildApplyPolicy: vi
                    .fn()
                    .mockReturnValue(buildMockPermissionPolicy()),
            };
            const mockTrustBuilder = {
                buildPlanTrust: vi.fn().mockReturnValue(buildMockTrustPolicy()),
                buildApplyTrust: vi
                    .fn()
                    .mockReturnValue(buildMockTrustPolicy()),
            };

            const formulator = createPolicyFormulator({
                permissionPolicyBuilder: mockPermissionBuilder,
                trustPolicyBuilder: mockTrustBuilder,
            });

            const config = buildConfig({ planApplySeparation: false });
            formulator.formulate(buildInventory(), config);

            expect(
                mockPermissionBuilder.buildPlanPolicy,
            ).not.toHaveBeenCalled();
            expect(mockTrustBuilder.buildPlanTrust).not.toHaveBeenCalled();
        });
    });

    describe("given any configuration", () => {
        it("should include template_variables in output", () => {
            const mockPermissionBuilder = {
                buildPlanPolicy: vi
                    .fn()
                    .mockReturnValue(buildMockPermissionPolicy()),
                buildApplyPolicy: vi
                    .fn()
                    .mockReturnValue(buildMockPermissionPolicy()),
            };
            const mockTrustBuilder = {
                buildPlanTrust: vi.fn().mockReturnValue(buildMockTrustPolicy()),
                buildApplyTrust: vi
                    .fn()
                    .mockReturnValue(buildMockTrustPolicy()),
            };

            const formulator = createPolicyFormulator({
                permissionPolicyBuilder: mockPermissionBuilder,
                trustPolicyBuilder: mockTrustBuilder,
            });

            const config = buildConfig();
            const result = formulator.formulate(buildInventory(), config);

            expect(result.template_variables).toHaveProperty("account_id");
            expect(result.template_variables).toHaveProperty("region");
            expect(result.template_variables).toHaveProperty("resource_prefix");
            expect(result.template_variables.org).toBe(config.githubOrg);
            expect(result.template_variables.repo).toBe(config.githubRepo);
        });

        it("should use actual account_id in template_variables when provided", () => {
            const mockPermissionBuilder = {
                buildPlanPolicy: vi
                    .fn()
                    .mockReturnValue(buildMockPermissionPolicy()),
                buildApplyPolicy: vi
                    .fn()
                    .mockReturnValue(buildMockPermissionPolicy()),
            };
            const mockTrustBuilder = {
                buildPlanTrust: vi.fn().mockReturnValue(buildMockTrustPolicy()),
                buildApplyTrust: vi
                    .fn()
                    .mockReturnValue(buildMockTrustPolicy()),
            };

            const formulator = createPolicyFormulator({
                permissionPolicyBuilder: mockPermissionBuilder,
                trustPolicyBuilder: mockTrustBuilder,
            });

            const accountId = String(
                chance.integer({ min: 100000000000, max: 999999999999 }),
            );
            const config = buildConfig({ accountId });
            const result = formulator.formulate(buildInventory(), config);

            expect(result.template_variables.account_id).toBe(accountId);
        });

        it("should use actual region in template_variables when provided", () => {
            const mockPermissionBuilder = {
                buildPlanPolicy: vi
                    .fn()
                    .mockReturnValue(buildMockPermissionPolicy()),
                buildApplyPolicy: vi
                    .fn()
                    .mockReturnValue(buildMockPermissionPolicy()),
            };
            const mockTrustBuilder = {
                buildPlanTrust: vi.fn().mockReturnValue(buildMockTrustPolicy()),
                buildApplyTrust: vi
                    .fn()
                    .mockReturnValue(buildMockTrustPolicy()),
            };

            const formulator = createPolicyFormulator({
                permissionPolicyBuilder: mockPermissionBuilder,
                trustPolicyBuilder: mockTrustBuilder,
            });

            const region = "us-west-2";
            const config = buildConfig({ region });
            const result = formulator.formulate(buildInventory(), config);

            expect(result.template_variables.region).toBe(region);
        });

        it("should use descriptive placeholder for account_id when not provided", () => {
            const mockPermissionBuilder = {
                buildPlanPolicy: vi
                    .fn()
                    .mockReturnValue(buildMockPermissionPolicy()),
                buildApplyPolicy: vi
                    .fn()
                    .mockReturnValue(buildMockPermissionPolicy()),
            };
            const mockTrustBuilder = {
                buildPlanTrust: vi.fn().mockReturnValue(buildMockTrustPolicy()),
                buildApplyTrust: vi
                    .fn()
                    .mockReturnValue(buildMockTrustPolicy()),
            };

            const formulator = createPolicyFormulator({
                permissionPolicyBuilder: mockPermissionBuilder,
                trustPolicyBuilder: mockTrustBuilder,
            });

            const config = buildConfig({ accountId: null });
            const result = formulator.formulate(buildInventory(), config);

            expect(result.template_variables.account_id).toBe(
                "Target AWS account ID",
            );
        });

        it("should use config values for role metadata", () => {
            const mockPermissionBuilder = {
                buildPlanPolicy: vi
                    .fn()
                    .mockReturnValue(buildMockPermissionPolicy()),
                buildApplyPolicy: vi
                    .fn()
                    .mockReturnValue(buildMockPermissionPolicy()),
            };
            const mockTrustBuilder = {
                buildPlanTrust: vi.fn().mockReturnValue(buildMockTrustPolicy()),
                buildApplyTrust: vi
                    .fn()
                    .mockReturnValue(buildMockTrustPolicy()),
            };

            const formulator = createPolicyFormulator({
                permissionPolicyBuilder: mockPermissionBuilder,
                trustPolicyBuilder: mockTrustBuilder,
            });

            const config = buildConfig({
                rolePath: "/deployment/",
                maxSessionDuration: 7200,
                permissionBoundaryArn:
                    "arn:aws:iam::123456789012:policy/boundary",
            });
            const result = formulator.formulate(buildInventory(), config);

            const applyRole = result.roles.find((r) =>
                r.role_name.includes("apply"),
            );
            expect(applyRole?.role_path).toBe("/deployment/");
            expect(applyRole?.max_session_duration).toBe(7200);
            expect(applyRole?.permission_boundary_arn).toBe(
                "arn:aws:iam::123456789012:policy/boundary",
            );
        });
    });
});
