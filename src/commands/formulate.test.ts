import { readFile } from "node:fs/promises";
import Chance from "chance";
import { describe, expect, it, vi } from "vitest";
import { createPermissionPolicyBuilder } from "../use-cases/build-permission-policy.js";
import { createTrustPolicyBuilder } from "../use-cases/build-trust-policy.js";
import { createPolicyFixer } from "../use-cases/fix-policy.js";
import { createPolicyFormulator } from "../use-cases/formulate-policies.js";
import { createActionInventoryParser } from "../use-cases/parse-action-inventory.js";
import { createFormulationConfigParser } from "../use-cases/parse-formulation-config.js";
import { createFormulationOutputParser } from "../use-cases/parse-formulation-output.js";
import { createOutputVariableResolver } from "../use-cases/resolve-output-variables.js";
import { createTemplateVariableResolver } from "../use-cases/resolve-template-variables.js";
import { createValidateAndFixOrchestrator } from "../use-cases/validate-and-fix.js";
import { createPermissionPolicyValidator } from "../use-cases/validate-permission-policy.js";
import { createTrustPolicyValidator } from "../use-cases/validate-trust-policy.js";
import { createFormulateCommand } from "./formulate.js";

vi.mock("node:fs/promises");

const chance = new Chance();

function buildCommand() {
    return createFormulateCommand({
        configParser: createFormulationConfigParser(),
        inventoryParser: createActionInventoryParser(),
        formulator: createPolicyFormulator({
            permissionPolicyBuilder: createPermissionPolicyBuilder(),
            trustPolicyBuilder: createTrustPolicyBuilder(),
        }),
        parser: createFormulationOutputParser(),
        orchestrator: createValidateAndFixOrchestrator({
            permissionValidator: createPermissionPolicyValidator(),
            trustValidator: createTrustPolicyValidator(),
            fixer: createPolicyFixer(),
            unscopedActions: new Set(["sts:GetCallerIdentity"]),
        }),
        outputResolver: createOutputVariableResolver(
            createTemplateVariableResolver(),
        ),
    });
}

function buildInventoryJson() {
    return JSON.stringify({
        metadata: {
            iac_tool: "terraform",
            iac_version: "1.7.0",
            format_version: "1.2",
        },
        toolchain_actions: {
            plan_and_apply: [
                {
                    action: "sts:GetCallerIdentity",
                    resource: "*",
                    purpose: "Provider initialization",
                    category: "toolchain",
                },
            ],
            apply_only: [
                {
                    action: "s3:PutObject",
                    resource: "arn:aws:s3:::state-bucket/*",
                    purpose: "Write Terraform state",
                    category: "toolchain",
                },
            ],
        },
        infrastructure_actions: {
            plan_and_apply: [
                {
                    action: "ecs:DescribeClusters",
                    resource: "*",
                    purpose: "read for aws_ecs_cluster",
                    category: "read",
                    source_resource: ["aws_ecs_cluster.main"],
                    plan_action: ["create"],
                },
            ],
            apply_only: [
                {
                    action: "ecs:CreateCluster",
                    resource: "*",
                    purpose: "create for aws_ecs_cluster",
                    category: "create",
                    source_resource: ["aws_ecs_cluster.main"],
                    plan_action: ["create"],
                },
            ],
        },
    });
}

function buildConfigJson(overrides?: Record<string, unknown>) {
    return JSON.stringify({
        github_org: chance.word(),
        github_repo: chance.word(),
        resource_prefix: chance.word(),
        ...overrides,
    });
}

function buildInventoryJsonWithPlaceholders() {
    return JSON.stringify({
        metadata: {
            iac_tool: "terraform",
            iac_version: "1.7.0",
            format_version: "1.2",
        },
        toolchain_actions: {
            plan_and_apply: [
                {
                    action: "sts:GetCallerIdentity",
                    resource: "*",
                    purpose: "Provider initialization",
                    category: "toolchain",
                },
                {
                    action: "s3:GetObject",
                    resource:
                        // biome-ignore lint/suspicious/noTemplateCurlyInString: test fixture with IAM ARN placeholder
                        "arn:aws:s3:::${state_bucket}/${state_key_prefix}*",
                    purpose: "Read Terraform state",
                    category: "toolchain",
                },
                {
                    action: "dynamodb:GetItem",
                    resource:
                        // biome-ignore lint/suspicious/noTemplateCurlyInString: test fixture with IAM ARN placeholder
                        "arn:aws:dynamodb:${region}:${account_id}:table/${lock_table}",
                    purpose: "Check lock",
                    category: "toolchain",
                },
            ],
            apply_only: [
                {
                    action: "s3:PutObject",
                    resource:
                        // biome-ignore lint/suspicious/noTemplateCurlyInString: test fixture with IAM ARN placeholder
                        "arn:aws:s3:::${state_bucket}/${state_key_prefix}*",
                    purpose: "Write Terraform state",
                    category: "toolchain",
                },
            ],
        },
        infrastructure_actions: {
            plan_and_apply: [
                {
                    action: "ecs:DescribeClusters",
                    resource: "*",
                    purpose: "read for aws_ecs_cluster",
                    category: "read",
                    source_resource: ["aws_ecs_cluster.main"],
                    plan_action: ["create"],
                },
            ],
            apply_only: [
                {
                    action: "ecs:CreateCluster",
                    resource: "*",
                    purpose: "create for aws_ecs_cluster",
                    category: "create",
                    source_resource: ["aws_ecs_cluster.main"],
                    plan_action: ["create"],
                },
            ],
        },
    });
}

describe("FormulateCommand", () => {
    describe("given valid inventory and config files", () => {
        it("should produce role definitions with plan and apply roles", async () => {
            // Arrange
            const inventoryJson = buildInventoryJson();
            const configJson = buildConfigJson();

            vi.mocked(readFile)
                .mockResolvedValueOnce(inventoryJson)
                .mockResolvedValueOnce(configJson);

            const command = buildCommand();
            const output: string[] = [];
            const mockConsole = {
                log: (msg: string) => output.push(msg),
                warn: vi.fn(),
            };

            // Act
            const result = await command.execute(
                "inventory.json",
                "config.json",
                mockConsole,
            );

            // Assert
            expect(result.roles).toHaveLength(2);
            expect(result.roles[0]?.role_name).toContain("plan");
            expect(result.roles[1]?.role_name).toContain("apply");
        });

        it("should output formatted JSON to console", async () => {
            // Arrange
            const inventoryJson = buildInventoryJson();
            const configJson = buildConfigJson();

            vi.mocked(readFile)
                .mockResolvedValueOnce(inventoryJson)
                .mockResolvedValueOnce(configJson);

            const command = buildCommand();
            const output: string[] = [];
            const mockConsole = {
                log: (msg: string) => output.push(msg),
                warn: vi.fn(),
            };

            // Act
            await command.execute("inventory.json", "config.json", mockConsole);

            // Assert
            const parsed = JSON.parse(output[0] ?? "{}");
            expect(parsed.roles).toBeDefined();
            expect(parsed.template_variables).toBeDefined();
        });

        it("should include trust policies with OIDC configuration", async () => {
            // Arrange
            const inventoryJson = buildInventoryJson();
            const configJson = buildConfigJson();

            vi.mocked(readFile)
                .mockResolvedValueOnce(inventoryJson)
                .mockResolvedValueOnce(configJson);

            const command = buildCommand();
            const mockConsole = { log: vi.fn(), warn: vi.fn() };

            // Act
            const result = await command.execute(
                "inventory.json",
                "config.json",
                mockConsole,
            );

            // Assert
            const planRole = result.roles[0];
            expect(planRole?.trust_policy.Statement[0]?.Action).toBe(
                "sts:AssumeRoleWithWebIdentity",
            );
            expect(
                planRole?.trust_policy.Statement[0]?.Condition.StringEquals[
                    "token.actions.githubusercontent.com:aud"
                ],
            ).toBe("sts.amazonaws.com");
        });
    });

    describe("given plan_apply_separation is false", () => {
        it("should produce a single apply role", async () => {
            // Arrange
            const inventoryJson = buildInventoryJson();
            const configJson = buildConfigJson({
                plan_apply_separation: false,
            });

            vi.mocked(readFile)
                .mockResolvedValueOnce(inventoryJson)
                .mockResolvedValueOnce(configJson);

            const command = buildCommand();
            const mockConsole = { log: vi.fn(), warn: vi.fn() };

            // Act
            const result = await command.execute(
                "inventory.json",
                "config.json",
                mockConsole,
            );

            // Assert
            expect(result.roles).toHaveLength(1);
            expect(result.roles[0]?.role_name).toContain("apply");
        });
    });

    describe("given an invalid inventory file", () => {
        it("should throw when file cannot be read", async () => {
            // Arrange
            vi.mocked(readFile).mockRejectedValue(
                new Error("ENOENT: no such file or directory"),
            );

            const command = buildCommand();
            const mockConsole = { log: vi.fn(), warn: vi.fn() };

            // Act & Assert
            await expect(
                command.execute("bad.json", "config.json", mockConsole),
            ).rejects.toThrow();
        });
    });

    describe("given config with all template variables provided", () => {
        it("should resolve all placeholders in the returned output", async () => {
            // Arrange
            const accountId = "123456789012";
            const region = "us-west-2";
            const stateBucket = "my-state-bucket";
            const stateKeyPrefix = "my-org/my-repo";
            const lockTable = "my-lock-table";

            const inventoryJson = buildInventoryJsonWithPlaceholders();
            const configJson = buildConfigJson({
                account_id: accountId,
                region,
                template_variables: {
                    state_bucket: stateBucket,
                    state_key_prefix: stateKeyPrefix,
                    lock_table: lockTable,
                },
            });

            vi.mocked(readFile)
                .mockResolvedValueOnce(inventoryJson)
                .mockResolvedValueOnce(configJson);

            const command = buildCommand();
            const mockConsole = { log: vi.fn(), warn: vi.fn() };

            // Act
            const result = await command.execute(
                "inventory.json",
                "config.json",
                mockConsole,
            );

            // Assert
            const serialized = JSON.stringify(result);
            expect(serialized).not.toContain("${");
            expect(serialized).toContain(stateBucket);
            expect(serialized).toContain(stateKeyPrefix);
            expect(serialized).toContain(lockTable);
            expect(serialized).toContain(accountId);
            expect(serialized).toContain(region);
        });
    });

    describe("given config without account_id for unresolved placeholders", () => {
        it("should warn about missing variables and return unresolved output", async () => {
            // Arrange
            const inventoryJson = buildInventoryJsonWithPlaceholders();
            const configJson = buildConfigJson({
                template_variables: {
                    state_bucket: "my-bucket",
                    state_key_prefix: "my-prefix",
                    lock_table: "my-table",
                },
            });

            vi.mocked(readFile)
                .mockResolvedValueOnce(inventoryJson)
                .mockResolvedValueOnce(configJson);

            const command = buildCommand();
            const warnFn = vi.fn();
            const mockConsole = { log: vi.fn(), warn: warnFn };

            // Act
            const result = await command.execute(
                "inventory.json",
                "config.json",
                mockConsole,
            );

            // Assert
            expect(warnFn).toHaveBeenCalledWith(
                expect.stringContaining("account_id"),
            );
            const serialized = JSON.stringify(result);
            // biome-ignore lint/suspicious/noTemplateCurlyInString: verifying unresolved placeholder remains
            expect(serialized).toContain("${account_id}");
        });
    });

    describe("given formulated output with auto-fixable violations", () => {
        it("should produce output that passes validation with zero errors", async () => {
            // Arrange - use specific resource ARNs to avoid unfixable LP-010 violations
            const inventoryJson = JSON.stringify({
                metadata: {
                    iac_tool: "terraform",
                    iac_version: "1.7.0",
                    format_version: "1.2",
                },
                toolchain_actions: {
                    plan_and_apply: [
                        {
                            action: "sts:GetCallerIdentity",
                            resource: "*",
                            purpose: "Provider initialization",
                            category: "toolchain",
                        },
                    ],
                    apply_only: [
                        {
                            action: "s3:PutObject",
                            resource: "arn:aws:s3:::state-bucket/*",
                            purpose: "Write Terraform state",
                            category: "toolchain",
                        },
                    ],
                },
                infrastructure_actions: {
                    plan_and_apply: [
                        {
                            action: "s3:GetBucketLocation",
                            resource: "arn:aws:s3:::my-bucket",
                            purpose: "read for aws_s3_bucket",
                            category: "read",
                            source_resource: ["aws_s3_bucket.main"],
                            plan_action: ["create"],
                        },
                    ],
                    apply_only: [
                        {
                            action: "s3:CreateBucket",
                            resource: "arn:aws:s3:::my-bucket",
                            purpose: "create for aws_s3_bucket",
                            category: "create",
                            source_resource: ["aws_s3_bucket.main"],
                            plan_action: ["create"],
                        },
                    ],
                },
            });
            const configJson = buildConfigJson();

            vi.mocked(readFile)
                .mockResolvedValueOnce(inventoryJson)
                .mockResolvedValueOnce(configJson);

            const command = buildCommand();
            const warnFn = vi.fn();
            const mockConsole = { log: vi.fn(), warn: warnFn };

            // Act
            const result = await command.execute(
                "inventory.json",
                "config.json",
                mockConsole,
            );

            // Assert - validate the output passes validation with zero errors
            const orchestrator = createValidateAndFixOrchestrator({
                permissionValidator: createPermissionPolicyValidator(),
                trustValidator: createTrustPolicyValidator(),
                fixer: createPolicyFixer(),
                unscopedActions: new Set(["sts:GetCallerIdentity"]),
            });
            const parsedResult = createFormulationOutputParser().parse(
                JSON.stringify(result),
            );
            const validation = orchestrator.execute(parsedResult);

            expect(validation.valid).toBe(true);
            for (const roleResult of validation.role_results) {
                for (const policyResult of roleResult.policy_results) {
                    expect(policyResult.stats.errors).toBe(0);
                }
            }
            // sts:GetCallerIdentity with resource "*" leaves a non-fixable LP-011 warning;
            // formulate should surface it even when the output is otherwise valid
            expect(warnFn).toHaveBeenCalledWith(
                expect.stringContaining("warning(s)"),
            );
        });
    });

    describe("given inventory where only non-fixable warnings remain after auto-fix", () => {
        it("should warn about remaining warnings and still return valid output", async () => {
            // Arrange - sts:GetCallerIdentity with "*" triggers LP-011 (warning, non-fixable)
            // but no LP-010 errors, so output is valid with warnings only
            const inventoryJson = JSON.stringify({
                metadata: {
                    iac_tool: "terraform",
                    iac_version: "1.7.0",
                    format_version: "1.2",
                },
                toolchain_actions: {
                    plan_and_apply: [
                        {
                            action: "sts:GetCallerIdentity",
                            resource: "*",
                            purpose: "Provider initialization",
                            category: "toolchain",
                        },
                    ],
                    apply_only: [],
                },
                infrastructure_actions: {
                    plan_and_apply: [],
                    apply_only: [],
                },
            });
            const configJson = buildConfigJson();

            vi.mocked(readFile)
                .mockResolvedValueOnce(inventoryJson)
                .mockResolvedValueOnce(configJson);

            const command = buildCommand();
            const warnFn = vi.fn();
            const mockConsole = { log: vi.fn(), warn: warnFn };

            // Act
            const result = await command.execute(
                "inventory.json",
                "config.json",
                mockConsole,
            );

            // Assert - output is valid (no errors) but warnings were surfaced
            const orchestrator = createValidateAndFixOrchestrator({
                permissionValidator: createPermissionPolicyValidator(),
                trustValidator: createTrustPolicyValidator(),
                fixer: createPolicyFixer(),
                unscopedActions: new Set(["sts:GetCallerIdentity"]),
            });
            const parsedResult = createFormulationOutputParser().parse(
                JSON.stringify(result),
            );
            const validation = orchestrator.execute(parsedResult);

            expect(validation.valid).toBe(true);
            expect(warnFn).toHaveBeenCalledWith(
                expect.stringContaining("0 unfixable error(s)"),
            );
            expect(warnFn).toHaveBeenCalledWith(
                expect.stringContaining("warning(s)"),
            );
            expect(result.roles).toBeDefined();
        });
    });

    describe("given inventory with unfixable wildcard resource violations", () => {
        it("should warn about unfixable errors and still return fixed output", async () => {
            // Arrange - ecs:DescribeClusters with resource "*" triggers unfixable LP-010
            const inventoryJson = buildInventoryJson();
            const configJson = buildConfigJson();

            vi.mocked(readFile)
                .mockResolvedValueOnce(inventoryJson)
                .mockResolvedValueOnce(configJson);

            const command = buildCommand();
            const warnFn = vi.fn();
            const mockConsole = { log: vi.fn(), warn: warnFn };

            // Act
            const result = await command.execute(
                "inventory.json",
                "config.json",
                mockConsole,
            );

            // Assert
            expect(warnFn).toHaveBeenCalledWith(
                expect.stringMatching(/unfixable error/),
            );
            expect(result.roles).toBeDefined();
            expect(result.roles.length).toBeGreaterThan(0);
        });
    });
});
