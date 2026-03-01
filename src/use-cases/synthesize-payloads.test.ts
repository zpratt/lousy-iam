import Chance from "chance";
import { describe, expect, it } from "vitest";
import type { FormulationConfig } from "../entities/formulation-config.js";
import type { FormulationOutputInput } from "./formulation-output.schema.js";
import { createPayloadSynthesizer } from "./synthesize-payloads.js";

const chance = new Chance();

function buildConfig(
    overrides?: Partial<FormulationConfig>,
): FormulationConfig {
    return {
        githubOrg: chance.word(),
        githubRepo: chance.word(),
        resourcePrefix: chance.word(),
        accountId: "123456789012",
        region: "us-east-1",
        planApplySeparation: true,
        includeDeleteActions: true,
        useGithubEnvironments: false,
        githubEnvironmentNames: {},
        permissionBoundaryArn: null,
        rolePath: "/",
        maxSessionDuration: 3600,
        ...overrides,
    };
}

function buildFormulationOutput(
    overrides?: Partial<FormulationOutputInput["roles"][number]>,
): FormulationOutputInput {
    const roleName = `${chance.word()}-github-apply`;
    const policyName = `${roleName}-permissions`;
    return {
        roles: [
            {
                role_name: roleName,
                role_path: "/",
                description: chance.sentence(),
                max_session_duration: 3600,
                permission_boundary_arn: null,
                trust_policy: {
                    Version: "2012-10-17",
                    Statement: [
                        {
                            Sid: "AllowGitHubOIDC",
                            Effect: "Allow" as const,
                            Principal: {
                                Federated:
                                    "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com",
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
                },
                permission_policies: [
                    {
                        policy_name: policyName,
                        policy_document: {
                            Version: "2012-10-17",
                            Statement: [
                                {
                                    Sid: "S3Read",
                                    Effect: "Allow" as const,
                                    Action: ["s3:GetBucketLocation"],
                                    Resource: "arn:aws:s3:::bucket-*",
                                },
                            ],
                        },
                        estimated_size_bytes: 256,
                    },
                ],
                ...overrides,
            },
        ],
        template_variables: {},
    };
}

describe("SynthesizePayloads", () => {
    const synthesizer = createPayloadSynthesizer();

    describe("given valid formulation output with root path", () => {
        it("should produce CreateRoleCommandInput with correct fields", () => {
            // Arrange
            const input = buildFormulationOutput();
            const config = buildConfig();
            const role = input.roles[0];

            // Act
            const result = synthesizer.synthesize(input, config);

            // Assert
            const createRole = result.roles[0]?.create_role;
            expect(createRole?.RoleName).toBe(role?.role_name);
            expect(createRole?.Path).toBe("/");
            expect(createRole?.Description).toBe(role?.description);
            expect(createRole?.MaxSessionDuration).toBe(
                role?.max_session_duration,
            );
        });

        it("should JSON-stringify AssumeRolePolicyDocument", () => {
            // Arrange
            const input = buildFormulationOutput();
            const config = buildConfig();

            // Act
            const result = synthesizer.synthesize(input, config);

            // Assert
            const createRole = result.roles[0]?.create_role;
            const parsed = JSON.parse(
                createRole?.AssumeRolePolicyDocument ?? "{}",
            );
            expect(parsed).toHaveProperty("Version", "2012-10-17");
            expect(parsed).toHaveProperty("Statement");
        });

        it("should produce CreatePolicyCommandInput with correct fields", () => {
            // Arrange
            const input = buildFormulationOutput();
            const config = buildConfig();
            const role = input.roles[0];
            const policy = role?.permission_policies[0];

            // Act
            const result = synthesizer.synthesize(input, config);

            // Assert
            const createPolicy = result.roles[0]?.create_policies[0];
            expect(createPolicy?.PolicyName).toBe(policy?.policy_name);
            expect(createPolicy?.Path).toBe("/");
            expect(createPolicy?.Description).toBe(
                `Permission policy for role ${role?.role_name}`,
            );
        });

        it("should JSON-stringify PolicyDocument", () => {
            // Arrange
            const input = buildFormulationOutput();
            const config = buildConfig();

            // Act
            const result = synthesizer.synthesize(input, config);

            // Assert
            const createPolicy = result.roles[0]?.create_policies[0];
            const parsed = JSON.parse(createPolicy?.PolicyDocument ?? "{}");
            expect(parsed).toHaveProperty("Version", "2012-10-17");
        });

        it("should produce AttachRolePolicyCommandInput with correct PolicyArn", () => {
            // Arrange
            const input = buildFormulationOutput();
            const config = buildConfig({ accountId: "123456789012" });
            const role = input.roles[0];
            const policy = role?.permission_policies[0];

            // Act
            const result = synthesizer.synthesize(input, config);

            // Assert
            const attach = result.roles[0]?.attach_role_policies[0];
            expect(attach?.RoleName).toBe(role?.role_name);
            expect(attach?.PolicyArn).toBe(
                `arn:aws:iam::123456789012:policy/${policy?.policy_name}`,
            );
        });
    });

    describe("given a non-root role_path", () => {
        it("should normalize path to start and end with /", () => {
            // Arrange
            const input = buildFormulationOutput({ role_path: "deployment" });
            const config = buildConfig();

            // Act
            const result = synthesizer.synthesize(input, config);

            // Assert
            expect(result.roles[0]?.create_role.Path).toBe("/deployment/");
            expect(result.roles[0]?.create_policies[0]?.Path).toBe(
                "/deployment/",
            );
        });

        it("should use normalized path in PolicyArn", () => {
            // Arrange
            const input = buildFormulationOutput({ role_path: "deployment" });
            const config = buildConfig({ accountId: "123456789012" });
            const policyName =
                input.roles[0]?.permission_policies[0]?.policy_name;

            // Act
            const result = synthesizer.synthesize(input, config);

            // Assert
            expect(result.roles[0]?.attach_role_policies[0]?.PolicyArn).toBe(
                `arn:aws:iam::123456789012:policy/deployment/${policyName}`,
            );
        });
    });

    describe("given permission_boundary_arn is set", () => {
        it("should include PermissionsBoundary in CreateRoleCommandInput", () => {
            // Arrange
            const boundaryArn =
                "arn:aws:iam::123456789012:policy/boundary-policy";
            const input = buildFormulationOutput({
                permission_boundary_arn: boundaryArn,
            });
            const config = buildConfig();

            // Act
            const result = synthesizer.synthesize(input, config);

            // Assert
            expect(result.roles[0]?.create_role.PermissionsBoundary).toBe(
                boundaryArn,
            );
        });
    });

    describe("given permission_boundary_arn is null", () => {
        it("should omit PermissionsBoundary from CreateRoleCommandInput", () => {
            // Arrange
            const input = buildFormulationOutput({
                permission_boundary_arn: null,
            });
            const config = buildConfig();

            // Act
            const result = synthesizer.synthesize(input, config);

            // Assert
            expect(result.roles[0]?.create_role).not.toHaveProperty(
                "PermissionsBoundary",
            );
        });
    });

    describe("given a GovCloud region", () => {
        it("should use aws-us-gov partition in PolicyArn", () => {
            // Arrange
            const input = buildFormulationOutput();
            const config = buildConfig({ region: "us-gov-west-1" });

            // Act
            const result = synthesizer.synthesize(input, config);

            // Assert
            expect(result.roles[0]?.attach_role_policies[0]?.PolicyArn).toMatch(
                /^arn:aws-us-gov:iam::/,
            );
        });
    });

    describe("given a China region", () => {
        it("should use aws-cn partition in PolicyArn", () => {
            // Arrange
            const input = buildFormulationOutput();
            const config = buildConfig({ region: "cn-north-1" });

            // Act
            const result = synthesizer.synthesize(input, config);

            // Assert
            expect(result.roles[0]?.attach_role_policies[0]?.PolicyArn).toMatch(
                /^arn:aws-cn:iam::/,
            );
        });
    });

    describe("given config.accountId is null but template_variables.account_id is a resolved 12-digit value", () => {
        it("should fall back to template_variables.account_id for PolicyArn", () => {
            // Arrange
            const resolvedAccountId = "987654321012";
            const input = buildFormulationOutput();
            input.template_variables = { account_id: resolvedAccountId };
            const config = buildConfig({ accountId: null });

            // Act
            const result = synthesizer.synthesize(input, config);

            // Assert
            expect(
                result.roles[0]?.attach_role_policies[0]?.PolicyArn,
            ).toContain(`:${resolvedAccountId}:`);
        });
    });

    describe("given no valid account ID in config or template_variables", () => {
        it("should throw an error when accountId is null and template_variables has descriptive placeholder", () => {
            // Arrange
            const input = buildFormulationOutput();
            input.template_variables = { account_id: "Target AWS account ID" };
            const config = buildConfig({ accountId: null });

            // Act & Assert
            expect(() => synthesizer.synthesize(input, config)).toThrow(
                "AWS account ID is required and must be a 12-digit string",
            );
        });

        it("should throw an error when accountId is null and template_variables is empty", () => {
            // Arrange
            const input = buildFormulationOutput();
            input.template_variables = {};
            const config = buildConfig({ accountId: null });

            // Act & Assert
            expect(() => synthesizer.synthesize(input, config)).toThrow(
                "AWS account ID is required and must be a 12-digit string",
            );
        });
    });
});
