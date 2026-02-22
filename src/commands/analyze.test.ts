import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { buildPlanJson } from "../lib/test-plan-builder.js";
import { createActionInventoryBuilder } from "../use-cases/build-action-inventory.js";
import { createResourceActionMapper } from "../use-cases/map-resource-actions.js";
import { createTerraformPlanParser } from "../use-cases/parse-terraform-plan.js";
import { createActionInventorySerializer } from "../use-cases/serialize-action-inventory.js";
import { createAnalyzeCommand } from "./analyze.js";

vi.mock("node:fs/promises");

function buildCommand() {
    const mockDb = {
        lookupByTerraformType: vi.fn().mockImplementation((type: string) => {
            if (type === "aws_s3_bucket") {
                return {
                    terraformType: "aws_s3_bucket",
                    service: "s3",
                    actions: {
                        read: ["s3:GetBucketLocation"],
                        create: ["s3:CreateBucket"],
                        update: ["s3:PutBucketPolicy"],
                        delete: ["s3:DeleteBucket"],
                        tag: ["s3:PutBucketTagging"],
                    },
                };
            }
            return undefined;
        }),
    };

    return createAnalyzeCommand({
        parser: createTerraformPlanParser(),
        mapper: createResourceActionMapper(mockDb),
        builder: createActionInventoryBuilder(),
        serializer: createActionInventorySerializer(),
    });
}

describe("AnalyzeCommand", () => {
    describe("given a valid plan JSON file path", () => {
        it("should produce an action inventory from the plan", async () => {
            // Arrange
            const planJson = buildPlanJson([
                {
                    address: "aws_s3_bucket.main",
                    type: "aws_s3_bucket",
                    actions: ["create"],
                    after: { bucket: "test-bucket" },
                },
            ]);
            vi.mocked(readFile).mockResolvedValue(planJson);

            const command = buildCommand();
            const output: string[] = [];
            const mockConsole = {
                log: (msg: string) => output.push(msg),
                warn: vi.fn(),
            };

            // Act
            const inventory = await command.execute("plan.json", mockConsole);

            // Assert
            expect(inventory.metadata.iacTool).toBe("terraform");
            expect(inventory.metadata.iacVersion).toBe("1.7.0");
            expect(
                inventory.infrastructureActions.planAndApply.length,
            ).toBeGreaterThan(0);
            expect(
                inventory.infrastructureActions.applyOnly.length,
            ).toBeGreaterThan(0);
        });

        it("should serialize output using snake_case keys", async () => {
            // Arrange
            const planJson = buildPlanJson([
                {
                    address: "aws_s3_bucket.main",
                    type: "aws_s3_bucket",
                    actions: ["create"],
                    after: { bucket: "test-bucket" },
                },
            ]);
            vi.mocked(readFile).mockResolvedValue(planJson);

            const command = buildCommand();
            const output: string[] = [];
            const mockConsole = {
                log: (msg: string) => output.push(msg),
                warn: vi.fn(),
            };

            // Act
            await command.execute("plan.json", mockConsole);

            // Assert
            const serialized = JSON.parse(output[0] ?? "{}");
            expect(serialized.metadata.iac_tool).toBe("terraform");
            expect(serialized.toolchain_actions).toBeDefined();
            expect(serialized.infrastructure_actions).toBeDefined();
            expect(
                serialized.infrastructure_actions.plan_and_apply,
            ).toBeDefined();
            expect(serialized.infrastructure_actions.apply_only).toBeDefined();
        });
    });

    describe("given a plan with multiple resources of the same type", () => {
        it("should de-duplicate IAM actions across resources", async () => {
            // Arrange
            const planJson = buildPlanJson([
                {
                    address: "aws_s3_bucket.first",
                    type: "aws_s3_bucket",
                    actions: ["create"],
                    after: { bucket: "bucket-one" },
                },
                {
                    address: "aws_s3_bucket.second",
                    type: "aws_s3_bucket",
                    actions: ["create"],
                    after: { bucket: "bucket-two" },
                },
            ]);
            vi.mocked(readFile).mockResolvedValue(planJson);

            const command = buildCommand();
            const mockConsole = { log: vi.fn(), warn: vi.fn() };

            // Act
            const inventory = await command.execute("plan.json", mockConsole);

            // Assert — s3:CreateBucket should appear only once with both source resources aggregated
            const createActions =
                inventory.infrastructureActions.applyOnly.filter(
                    (entry) => entry.action === "s3:CreateBucket",
                );
            expect(createActions).toHaveLength(1);
            expect(createActions[0]?.sourceResource).toEqual([
                "aws_s3_bucket.first",
                "aws_s3_bucket.second",
            ]);
        });

        it("should merge planAction arrays when de-duplicating across different plan actions", async () => {
            // Arrange
            const planJson = buildPlanJson([
                {
                    address: "aws_s3_bucket.first",
                    type: "aws_s3_bucket",
                    actions: ["create"],
                    after: { bucket: "bucket-one" },
                },
                {
                    address: "aws_s3_bucket.second",
                    type: "aws_s3_bucket",
                    actions: ["update"],
                    after: { bucket: "bucket-two" },
                },
            ]);
            vi.mocked(readFile).mockResolvedValue(planJson);

            const command = buildCommand();
            const mockConsole = { log: vi.fn(), warn: vi.fn() };

            // Act
            const inventory = await command.execute("plan.json", mockConsole);

            // Assert — s3:GetBucketLocation appears in read for both create and update,
            // merged entry should contain both plan actions
            const readActions =
                inventory.infrastructureActions.planAndApply.filter(
                    (entry) => entry.action === "s3:GetBucketLocation",
                );
            expect(readActions).toHaveLength(1);
            expect(readActions[0]?.planAction).toContain("create");
            expect(readActions[0]?.planAction).toContain("update");
            expect(readActions[0]?.sourceResource).toEqual([
                "aws_s3_bucket.first",
                "aws_s3_bucket.second",
            ]);
        });
    });

    describe("given a plan with unknown resource types", () => {
        it("should warn about unmapped resource types", async () => {
            // Arrange
            const planJson = buildPlanJson([
                {
                    address: "aws_unknown_thing.main",
                    type: "aws_unknown_thing",
                    actions: ["create"],
                    after: {},
                },
            ]);
            vi.mocked(readFile).mockResolvedValue(planJson);

            const command = buildCommand();
            const mockConsole = {
                log: vi.fn(),
                warn: vi.fn(),
            };

            // Act
            await command.execute("plan.json", mockConsole);

            // Assert
            expect(mockConsole.warn).toHaveBeenCalledWith(
                expect.stringContaining("aws_unknown_thing"),
            );
        });
    });

    describe("given an invalid file path", () => {
        it("should throw when file cannot be read", async () => {
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
});
