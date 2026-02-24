import { readFile } from "node:fs/promises";
import Chance from "chance";
import { describe, expect, it, vi } from "vitest";
import { createPermissionPolicyBuilder } from "../use-cases/build-permission-policy.js";
import { createTrustPolicyBuilder } from "../use-cases/build-trust-policy.js";
import { createPolicyFormulator } from "../use-cases/formulate-policies.js";
import { createActionInventoryParser } from "../use-cases/parse-action-inventory.js";
import { createFormulationConfigParser } from "../use-cases/parse-formulation-config.js";
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
});
