import { readFile } from "node:fs/promises";
import Chance from "chance";
import { describe, expect, it, vi } from "vitest";
import { createPolicyFixer } from "../use-cases/fix-policy.js";
import { createFormulationOutputParser } from "../use-cases/parse-formulation-output.js";
import { createValidateAndFixOrchestrator } from "../use-cases/validate-and-fix.js";
import { createPermissionPolicyValidator } from "../use-cases/validate-permission-policy.js";
import { createTrustPolicyValidator } from "../use-cases/validate-trust-policy.js";
import { createValidateCommand } from "./validate.js";

vi.mock("node:fs/promises");

const chance = new Chance();

function buildFormulationOutputJson() {
    const prefix = chance.word();
    return JSON.stringify({
        roles: [
            {
                role_name: `${prefix}-github-apply`,
                role_path: "/",
                description: chance.sentence(),
                max_session_duration: 3600,
                permission_boundary_arn: null,
                trust_policy: {
                    Version: "2012-10-17",
                    Statement: [
                        {
                            Sid: "AllowGitHubOIDC",
                            Effect: "Allow",
                            Principal: {
                                Federated:
                                    // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM ARN placeholder
                                    "arn:aws:iam::${account_id}:oidc-provider/token.actions.githubusercontent.com",
                            },
                            Action: "sts:AssumeRoleWithWebIdentity",
                            Condition: {
                                StringEquals: {
                                    "token.actions.githubusercontent.com:aud":
                                        "sts.amazonaws.com",
                                    "token.actions.githubusercontent.com:sub": `repo:org/repo:ref:refs/heads/main`,
                                },
                            },
                        },
                    ],
                },
                permission_policies: [
                    {
                        policy_name: `${prefix}-permissions`,
                        policy_document: {
                            Version: "2012-10-17",
                            Statement: [
                                {
                                    Sid: "S3Read",
                                    Effect: "Allow",
                                    Action: ["s3:GetBucketLocation"],
                                    Resource: `arn:aws:s3:::${prefix}-*`,
                                },
                            ],
                        },
                        estimated_size_bytes: 256,
                    },
                ],
            },
        ],
        template_variables: { account_id: "Target AWS account ID" },
    });
}

function buildCommand() {
    return createValidateCommand({
        parser: createFormulationOutputParser(),
        orchestrator: createValidateAndFixOrchestrator({
            permissionValidator: createPermissionPolicyValidator(),
            trustValidator: createTrustPolicyValidator(),
            fixer: createPolicyFixer(),
            unscopedActions: new Set(["sts:GetCallerIdentity"]),
        }),
    });
}

describe("ValidateCommand", () => {
    describe("given a valid formulation output file", () => {
        it("should output validation results to console", async () => {
            // Arrange
            vi.mocked(readFile).mockResolvedValue(buildFormulationOutputJson());
            const command = buildCommand();
            const output: string[] = [];
            const mockConsole = {
                log: (msg: string) => output.push(msg),
                warn: vi.fn(),
            };

            // Act
            await command.execute("input.json", mockConsole);

            // Assert
            const parsed = JSON.parse(output[0] ?? "{}");
            expect(parsed).toHaveProperty("valid");
            expect(parsed).toHaveProperty("role_results");
        });

        it("should return validation output with role results", async () => {
            // Arrange
            vi.mocked(readFile).mockResolvedValue(buildFormulationOutputJson());
            const command = buildCommand();
            const mockConsole = { log: vi.fn(), warn: vi.fn() };

            // Act
            const result = await command.execute("input.json", mockConsole);

            // Assert
            expect(result.role_results).toHaveLength(1);
            expect(result.role_results[0]?.role_name).toContain("github-apply");
        });
    });

    describe("given a policy with violations", () => {
        it("should warn about errors and warnings", async () => {
            // Arrange
            const json = JSON.stringify({
                roles: [
                    {
                        role_name: "test-apply",
                        role_path: "/",
                        description: "test",
                        max_session_duration: 3600,
                        permission_boundary_arn: null,
                        trust_policy: {
                            Version: "2012-10-17",
                            Statement: [
                                {
                                    Sid: "Test",
                                    Effect: "Allow",
                                    Principal: {
                                        Federated:
                                            "arn:aws:iam::123:oidc-provider/test",
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
                                policy_name: "test-permissions",
                                policy_document: {
                                    Version: "2012-10-17",
                                    Statement: [
                                        {
                                            Sid: "Bad",
                                            Effect: "Allow",
                                            Action: ["*"],
                                            Resource: "*",
                                        },
                                    ],
                                },
                                estimated_size_bytes: 128,
                            },
                        ],
                    },
                ],
                template_variables: {},
            });
            vi.mocked(readFile).mockResolvedValue(json);
            const command = buildCommand();
            const mockConsole = { log: vi.fn(), warn: vi.fn() };

            // Act
            const result = await command.execute("input.json", mockConsole);

            // Assert
            expect(result.valid).toBe(false);
            expect(mockConsole.warn).toHaveBeenCalled();
        });
    });

    describe("given a file that cannot be read", () => {
        it("should throw an error", async () => {
            // Arrange
            vi.mocked(readFile).mockRejectedValue(
                new Error("ENOENT: no such file or directory"),
            );
            const command = buildCommand();
            const mockConsole = { log: vi.fn(), warn: vi.fn() };

            // Act & Assert
            await expect(
                command.execute("nonexistent.json", mockConsole),
            ).rejects.toThrow();
        });
    });

    describe("given invalid JSON", () => {
        it("should throw a parse error", async () => {
            // Arrange
            vi.mocked(readFile).mockResolvedValue("{not valid json");
            const command = buildCommand();
            const mockConsole = { log: vi.fn(), warn: vi.fn() };

            // Act & Assert
            await expect(
                command.execute("bad.json", mockConsole),
            ).rejects.toThrow();
        });
    });
});
