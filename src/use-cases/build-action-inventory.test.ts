import Chance from "chance";
import { describe, expect, it } from "vitest";
import type {
    ActionInventoryMetadata,
    InfrastructureActionEntry,
} from "../entities/action-inventory.js";
import { createActionInventoryBuilder } from "./build-action-inventory.js";

const chance = new Chance();

describe("BuildActionInventory", () => {
    describe("given mapped resource actions", () => {
        it("should produce an action inventory with metadata and infrastructure actions", () => {
            // Arrange
            const metadata: ActionInventoryMetadata = {
                iacTool: "terraform",
                iacVersion: chance.semver(),
                formatVersion: "1.2",
            };
            const planAndApply: InfrastructureActionEntry[] = [
                {
                    action: "s3:GetBucketLocation",
                    resource: "*",
                    purpose: "read for aws_s3_bucket",
                    sourceResource: "aws_s3_bucket.main",
                    planAction: "create",
                    category: "read",
                },
            ];
            const applyOnly: InfrastructureActionEntry[] = [
                {
                    action: "s3:CreateBucket",
                    resource: "*",
                    purpose: "create for aws_s3_bucket",
                    sourceResource: "aws_s3_bucket.main",
                    planAction: "create",
                    category: "create",
                },
            ];
            const builder = createActionInventoryBuilder();

            // Act
            const result = builder.build(metadata, {
                planAndApply,
                applyOnly,
            });

            // Assert
            expect(result.metadata).toEqual(metadata);
            expect(result.infrastructureActions.planAndApply).toEqual(
                planAndApply,
            );
            expect(result.infrastructureActions.applyOnly).toEqual(applyOnly);
        });

        it("should include Terraform toolchain actions", () => {
            // Arrange
            const metadata: ActionInventoryMetadata = {
                iacTool: "terraform",
                iacVersion: "1.7.0",
                formatVersion: "1.2",
            };
            const builder = createActionInventoryBuilder();

            // Act
            const result = builder.build(metadata, {
                planAndApply: [],
                applyOnly: [],
            });

            // Assert
            const toolchainPlanActions =
                result.toolchainActions.planAndApply.map((a) => a.action);
            expect(toolchainPlanActions).toContain("sts:GetCallerIdentity");
            expect(toolchainPlanActions).toContain("s3:GetObject");
            expect(toolchainPlanActions).toContain("s3:ListBucket");
            expect(toolchainPlanActions).toContain("dynamodb:GetItem");

            const toolchainApplyActions = result.toolchainActions.applyOnly.map(
                (a) => a.action,
            );
            expect(toolchainApplyActions).toContain("s3:PutObject");
            expect(toolchainApplyActions).toContain("s3:DeleteObject");
            expect(toolchainApplyActions).toContain("dynamodb:PutItem");
            expect(toolchainApplyActions).toContain("dynamodb:DeleteItem");
        });
    });

    describe("given empty mapped actions", () => {
        it("should produce an inventory with only toolchain actions", () => {
            // Arrange
            const metadata: ActionInventoryMetadata = {
                iacTool: "terraform",
                iacVersion: "1.7.0",
                formatVersion: "1.2",
            };
            const builder = createActionInventoryBuilder();

            // Act
            const result = builder.build(metadata, {
                planAndApply: [],
                applyOnly: [],
            });

            // Assert
            expect(result.infrastructureActions.planAndApply).toHaveLength(0);
            expect(result.infrastructureActions.applyOnly).toHaveLength(0);
            expect(result.toolchainActions.planAndApply.length).toBeGreaterThan(
                0,
            );
        });
    });
});
