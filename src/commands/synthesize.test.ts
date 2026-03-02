import { mkdir, readFile, writeFile } from "node:fs/promises";
import Chance from "chance";
import { describe, expect, it, vi } from "vitest";
import { createFormulationConfigParser } from "../use-cases/parse-formulation-config.js";
import { createFormulationOutputParser } from "../use-cases/parse-formulation-output.js";
import { createTemplateVariableResolver } from "../use-cases/resolve-template-variables.js";
import { createPayloadSynthesizer } from "../use-cases/synthesize-payloads.js";
import { createValidateAndFixOrchestrator } from "../use-cases/validate-and-fix.js";
import { createSynthesizeCommand } from "./synthesize.js";

vi.mock("node:fs/promises");

const chance = new Chance();

function buildFormulationOutputJson(overrides?: Record<string, unknown>) {
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
        template_variables: {},
        ...overrides,
    });
}

function buildFormulationOutputWithPlaceholders() {
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
                                    "token.actions.githubusercontent.com:sub":
                                        "repo:org/repo:ref:refs/heads/main",
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
        template_variables: {
            account_id: "Target AWS account ID",
        },
    });
}

function buildConfigJson(overrides?: Record<string, unknown>) {
    return JSON.stringify({
        github_org: chance.word(),
        github_repo: chance.word(),
        resource_prefix: chance.word(),
        account_id: "123456789012",
        region: "us-east-1",
        ...overrides,
    });
}

function buildCommand() {
    return createSynthesizeCommand({
        parser: createFormulationOutputParser(),
        configParser: createFormulationConfigParser(),
        orchestrator: createValidateAndFixOrchestrator({
            permissionValidator: { validate: vi.fn().mockReturnValue([]) },
            trustValidator: { validate: vi.fn().mockReturnValue([]) },
            fixer: {
                fixPermissionPolicy: vi.fn().mockImplementation((doc) => doc),
                fixTrustPolicy: vi.fn().mockImplementation((doc) => doc),
            },
            unscopedActions: new Set(["sts:GetCallerIdentity"]),
        }),
        resolver: createTemplateVariableResolver(),
        synthesizer: createPayloadSynthesizer(),
    });
}

function buildMockConsole() {
    return {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    };
}

describe("SynthesizeCommand", () => {
    describe("given valid formulation output and config", () => {
        it("should produce synthesis output with role payloads", async () => {
            // Arrange
            const inputJson = buildFormulationOutputJson();
            const configJson = buildConfigJson();

            vi.mocked(readFile)
                .mockResolvedValueOnce(inputJson)
                .mockResolvedValueOnce(configJson);

            const command = buildCommand();
            const mockConsole = buildMockConsole();

            // Act
            const result = await command.execute(
                { inputPath: "input.json", configPath: "config.json" },
                mockConsole,
            );

            // Assert
            expect(result.roles).toHaveLength(1);
            expect(result.roles[0]?.create_role.RoleName).toContain(
                "github-apply",
            );
        });

        it("should output JSON to stdout by default", async () => {
            // Arrange
            const inputJson = buildFormulationOutputJson();
            const configJson = buildConfigJson();

            vi.mocked(readFile)
                .mockResolvedValueOnce(inputJson)
                .mockResolvedValueOnce(configJson);

            const command = buildCommand();
            const mockConsole = buildMockConsole();

            // Act
            await command.execute(
                { inputPath: "input.json", configPath: "config.json" },
                mockConsole,
            );

            // Assert
            expect(mockConsole.log).toHaveBeenCalled();
            const outputArg = mockConsole.log.mock.calls[0]?.[0] ?? "";
            const parsed = JSON.parse(outputArg);
            expect(parsed).toHaveProperty("roles");
        });
    });

    describe("given --output flag", () => {
        it("should write synthesis output to the specified file", async () => {
            // Arrange
            const inputJson = buildFormulationOutputJson();
            const configJson = buildConfigJson();

            vi.mocked(readFile)
                .mockResolvedValueOnce(inputJson)
                .mockResolvedValueOnce(configJson);
            vi.mocked(writeFile).mockResolvedValue();

            const command = buildCommand();
            const mockConsole = buildMockConsole();
            const outputPath = "output.json";

            // Act
            await command.execute(
                {
                    inputPath: "input.json",
                    configPath: "config.json",
                    outputPath,
                },
                mockConsole,
            );

            // Assert
            expect(writeFile).toHaveBeenCalledWith(
                outputPath,
                expect.any(String),
                "utf-8",
            );
            expect(mockConsole.log).not.toHaveBeenCalled();
        });
    });

    describe("given --output-dir flag", () => {
        it("should write per-role JSON files to the directory", async () => {
            // Arrange
            const inputJson = buildFormulationOutputJson();
            const configJson = buildConfigJson();

            vi.mocked(readFile)
                .mockResolvedValueOnce(inputJson)
                .mockResolvedValueOnce(configJson);
            vi.mocked(mkdir).mockResolvedValue(undefined);
            vi.mocked(writeFile).mockReset();
            vi.mocked(writeFile).mockResolvedValue();

            const command = buildCommand();
            const mockConsole = buildMockConsole();
            const outputDir = "output-dir";

            // Act
            const result = await command.execute(
                {
                    inputPath: "input.json",
                    configPath: "config.json",
                    outputDir,
                },
                mockConsole,
            );

            // Assert
            expect(mkdir).toHaveBeenCalledWith(outputDir, {
                recursive: true,
            });
            expect(writeFile).toHaveBeenCalledTimes(result.roles.length);
            expect(mockConsole.log).not.toHaveBeenCalled();
        });
    });

    describe("given --output-dir with role names that produce colliding filenames", () => {
        it("should throw an error about duplicate filenames", async () => {
            // Arrange
            const roleSuffix = chance.word();
            const roleTemplate = buildFormulationOutputJson();
            const parsed = JSON.parse(roleTemplate);
            const baseRole = parsed.roles[0];
            const inputJson = JSON.stringify({
                ...parsed,
                roles: [
                    { ...baseRole, role_name: `path/a/${roleSuffix}` },
                    { ...baseRole, role_name: `path/b/${roleSuffix}` },
                ],
            });
            const configJson = buildConfigJson();

            vi.mocked(readFile)
                .mockResolvedValueOnce(inputJson)
                .mockResolvedValueOnce(configJson);
            vi.mocked(mkdir).mockResolvedValue(undefined);
            vi.mocked(writeFile).mockReset();
            vi.mocked(writeFile).mockResolvedValue();

            const command = buildCommand();
            const mockConsole = buildMockConsole();

            // Act & Assert
            await expect(
                command.execute(
                    {
                        inputPath: "input.json",
                        configPath: "config.json",
                        outputDir: "output-dir",
                    },
                    mockConsole,
                ),
            ).rejects.toThrow("same output filename");
        });
    });

    describe("given both --output and --output-dir flags", () => {
        it("should throw a mutually exclusive error", async () => {
            // Arrange
            const command = buildCommand();
            const mockConsole = buildMockConsole();

            // Act & Assert
            await expect(
                command.execute(
                    {
                        inputPath: "input.json",
                        configPath: "config.json",
                        outputPath: "output.json",
                        outputDir: "output-dir",
                    },
                    mockConsole,
                ),
            ).rejects.toThrow("mutually exclusive");
        });
    });

    describe("given formulation output with template variables and config provides values", () => {
        it("should resolve template variables in output", async () => {
            // Arrange
            const inputJson = buildFormulationOutputWithPlaceholders();
            const accountId = "123456789012";
            const configJson = buildConfigJson({ account_id: accountId });

            vi.mocked(readFile)
                .mockResolvedValueOnce(inputJson)
                .mockResolvedValueOnce(configJson);

            const command = buildCommand();
            const mockConsole = buildMockConsole();

            // Act
            const result = await command.execute(
                { inputPath: "input.json", configPath: "config.json" },
                mockConsole,
            );

            // Assert
            const trustDoc =
                result.roles[0]?.create_role.AssumeRolePolicyDocument ?? "";
            expect(trustDoc).toContain(accountId);
            // biome-ignore lint/suspicious/noTemplateCurlyInString: testing IAM ARN placeholder
            expect(trustDoc).not.toContain("${account_id}");
        });
    });

    describe("given missing template variable config values", () => {
        it("should throw an error listing missing variables", async () => {
            // Arrange
            const inputJson = buildFormulationOutputWithPlaceholders();
            const configJson = buildConfigJson({ account_id: undefined });

            vi.mocked(readFile)
                .mockResolvedValueOnce(inputJson)
                .mockResolvedValueOnce(configJson);

            const command = buildCommand();
            const mockConsole = buildMockConsole();

            // Act & Assert
            await expect(
                command.execute(
                    { inputPath: "input.json", configPath: "config.json" },
                    mockConsole,
                ),
            ).rejects.toThrow("account_id");
        });
    });

    describe("given a template variable value containing JSON special characters", () => {
        it("should resolve without producing invalid JSON", async () => {
            // Arrange
            const prefix = chance.word();
            const inputJson = JSON.stringify({
                roles: [
                    {
                        role_name: `${prefix}-github-apply`,
                        role_path: "/",
                        // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM template placeholder under test
                        description: "role for ${custom_var}",
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
                template_variables: {
                    custom_var: "a]value",
                },
            });
            const dangerousValue = 'value"with\\quotes\nand\nnewlines';
            const configJson = buildConfigJson({
                template_variables: { custom_var: dangerousValue },
            });

            vi.mocked(readFile)
                .mockResolvedValueOnce(inputJson)
                .mockResolvedValueOnce(configJson);

            const command = buildCommand();
            const mockConsole = buildMockConsole();

            // Act
            const result = await command.execute(
                { inputPath: "input.json", configPath: "config.json" },
                mockConsole,
            );

            // Assert — description should contain the dangerous value, properly embedded
            expect(result.roles[0]?.create_role.Description).toBe(
                `role for ${dangerousValue}`,
            );
        });
    });

    describe("given a template variable that resolves to a dangerous object key", () => {
        it("should throw an error rejecting the unsafe key", async () => {
            // Arrange
            const prefix = chance.word();
            const inputJson = JSON.stringify({
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
                                            "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com",
                                    },
                                    Action: "sts:AssumeRoleWithWebIdentity",
                                    Condition: {
                                        StringEquals: {
                                            "token.actions.githubusercontent.com:aud":
                                                "sts.amazonaws.com",
                                            "${evil_key}": "evil-value",
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
                template_variables: {
                    evil_key: "descriptive placeholder",
                },
            });
            const configJson = buildConfigJson({
                template_variables: { evil_key: "__proto__" },
            });

            vi.mocked(readFile)
                .mockResolvedValueOnce(inputJson)
                .mockResolvedValueOnce(configJson);

            const command = buildCommand();
            const mockConsole = buildMockConsole();

            // Act & Assert
            await expect(
                command.execute(
                    { inputPath: "input.json", configPath: "config.json" },
                    mockConsole,
                ),
            ).rejects.toThrow("unsafe object key");
        });
    });

    describe("given template variables that resolve two different keys to the same value", () => {
        it("should throw an error about duplicate resolved keys", async () => {
            // Arrange
            const prefix = chance.word();
            const inputJson = JSON.stringify({
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
                                            "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com",
                                    },
                                    Action: "sts:AssumeRoleWithWebIdentity",
                                    Condition: {
                                        StringEquals: {
                                            "token.actions.githubusercontent.com:aud":
                                                "sts.amazonaws.com",
                                            "${key_a}": "value-a",
                                            "${key_b}": "value-b",
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
                template_variables: {
                    key_a: "descriptive placeholder",
                    key_b: "descriptive placeholder",
                },
            });
            const configJson = buildConfigJson({
                template_variables: { key_a: "same_key", key_b: "same_key" },
            });

            vi.mocked(readFile)
                .mockResolvedValueOnce(inputJson)
                .mockResolvedValueOnce(configJson);

            const command = buildCommand();
            const mockConsole = buildMockConsole();

            // Act & Assert
            await expect(
                command.execute(
                    { inputPath: "input.json", configPath: "config.json" },
                    mockConsole,
                ),
            ).rejects.toThrow("duplicate object key");
        });
    });

    describe("given synthesized output fails schema validation", () => {
        it("should throw a validation error", async () => {
            // Arrange
            const inputJson = buildFormulationOutputJson();
            const configJson = buildConfigJson();

            vi.mocked(readFile)
                .mockResolvedValueOnce(inputJson)
                .mockResolvedValueOnce(configJson);

            const brokenSynthesizer = {
                synthesize: vi.fn().mockReturnValue({
                    roles: [
                        {
                            create_role: {
                                RoleName: "",
                                AssumeRolePolicyDocument: "",
                                Path: "missing-leading-slash",
                                Description: "",
                                MaxSessionDuration: 100,
                            },
                            create_policies: [],
                            attach_role_policies: [],
                        },
                    ],
                }),
            };

            const command = createSynthesizeCommand({
                parser: createFormulationOutputParser(),
                configParser: createFormulationConfigParser(),
                orchestrator: createValidateAndFixOrchestrator({
                    permissionValidator: {
                        validate: vi.fn().mockReturnValue([]),
                    },
                    trustValidator: { validate: vi.fn().mockReturnValue([]) },
                    fixer: {
                        fixPermissionPolicy: vi
                            .fn()
                            .mockImplementation((doc) => doc),
                        fixTrustPolicy: vi
                            .fn()
                            .mockImplementation((doc) => doc),
                    },
                    unscopedActions: new Set(),
                }),
                resolver: createTemplateVariableResolver(),
                synthesizer: brokenSynthesizer,
            });
            const mockConsole = buildMockConsole();

            // Act & Assert
            await expect(
                command.execute(
                    { inputPath: "input.json", configPath: "config.json" },
                    mockConsole,
                ),
            ).rejects.toThrow();
        });
    });

    describe("given validation fails with errors", () => {
        it("should throw and output errors to stderr", async () => {
            // Arrange
            const inputJson = JSON.stringify({
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

            vi.mocked(readFile).mockResolvedValueOnce(inputJson);

            const command = createSynthesizeCommand({
                parser: createFormulationOutputParser(),
                configParser: createFormulationConfigParser(),
                orchestrator: createValidateAndFixOrchestrator({
                    permissionValidator: {
                        validate: vi.fn().mockReturnValue([
                            {
                                rule_id: "LP-001",
                                severity: "error",
                                message: "Wildcard action",
                                field: "Action",
                                current_value: "*",
                                auto_fixable: false,
                                fix_hint: "Remove wildcard",
                            },
                        ]),
                    },
                    trustValidator: {
                        validate: vi.fn().mockReturnValue([]),
                    },
                    fixer: {
                        fixPermissionPolicy: vi
                            .fn()
                            .mockImplementation((doc) => doc),
                        fixTrustPolicy: vi
                            .fn()
                            .mockImplementation((doc) => doc),
                    },
                    unscopedActions: new Set(),
                }),
                resolver: createTemplateVariableResolver(),
                synthesizer: createPayloadSynthesizer(),
            });
            const mockConsole = buildMockConsole();

            // Act & Assert
            await expect(
                command.execute(
                    { inputPath: "input.json", configPath: "config.json" },
                    mockConsole,
                ),
            ).rejects.toThrow("Validation failed");
            expect(mockConsole.error).toHaveBeenCalled();
        });
    });
});
