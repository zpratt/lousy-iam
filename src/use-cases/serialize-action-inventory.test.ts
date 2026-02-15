import Chance from "chance";
import { describe, expect, it } from "vitest";
import type { ActionInventory } from "../entities/action-inventory.js";
import { createActionInventorySerializer } from "./serialize-action-inventory.js";

const chance = new Chance();

describe("ActionInventorySerializer", () => {
    describe("given an action inventory with camelCase fields", () => {
        it("should serialize metadata to snake_case keys", () => {
            // Arrange
            const version = chance.semver();
            const inventory: ActionInventory = {
                metadata: {
                    iacTool: "terraform",
                    iacVersion: version,
                    formatVersion: "1.2",
                },
                toolchainActions: { planAndApply: [], applyOnly: [] },
                infrastructureActions: { planAndApply: [], applyOnly: [] },
            };
            const serializer = createActionInventorySerializer();

            // Act
            const result = JSON.parse(serializer.serialize(inventory));

            // Assert
            expect(result.metadata.iac_tool).toBe("terraform");
            expect(result.metadata.iac_version).toBe(version);
            expect(result.metadata.format_version).toBe("1.2");
        });

        it("should serialize role actions to snake_case keys", () => {
            // Arrange
            const inventory: ActionInventory = {
                metadata: {
                    iacTool: "terraform",
                    iacVersion: "1.7.0",
                    formatVersion: "1.2",
                },
                toolchainActions: {
                    planAndApply: [
                        {
                            action: "sts:GetCallerIdentity",
                            resource: "*",
                            purpose: "Provider initialization",
                            category: "toolchain",
                        },
                    ],
                    applyOnly: [
                        {
                            action: "s3:PutObject",
                            resource: "*",
                            purpose: "Write state",
                            category: "toolchain",
                        },
                    ],
                },
                infrastructureActions: { planAndApply: [], applyOnly: [] },
            };
            const serializer = createActionInventorySerializer();

            // Act
            const result = JSON.parse(serializer.serialize(inventory));

            // Assert
            expect(result.toolchain_actions.plan_and_apply).toHaveLength(1);
            expect(result.toolchain_actions.apply_only).toHaveLength(1);
        });

        it("should serialize infrastructure action entries to snake_case keys", () => {
            // Arrange
            const inventory: ActionInventory = {
                metadata: {
                    iacTool: "terraform",
                    iacVersion: "1.7.0",
                    formatVersion: "1.2",
                },
                toolchainActions: { planAndApply: [], applyOnly: [] },
                infrastructureActions: {
                    planAndApply: [
                        {
                            action: "s3:GetBucketLocation",
                            resource: "*",
                            purpose: "read for aws_s3_bucket",
                            sourceResource: "aws_s3_bucket.main",
                            planAction: "create",
                            category: "read",
                        },
                    ],
                    applyOnly: [
                        {
                            action: "s3:CreateBucket",
                            resource: "*",
                            purpose: "create for aws_s3_bucket",
                            sourceResource: "aws_s3_bucket.main",
                            planAction: "create",
                            category: "create",
                        },
                    ],
                },
            };
            const serializer = createActionInventorySerializer();

            // Act
            const result = JSON.parse(serializer.serialize(inventory));

            // Assert
            const infraPlanAction =
                result.infrastructure_actions.plan_and_apply[0];
            expect(infraPlanAction.source_resource).toBe("aws_s3_bucket.main");
            expect(infraPlanAction.plan_action).toBe("create");

            const infraApplyAction =
                result.infrastructure_actions.apply_only[0];
            expect(infraApplyAction.source_resource).toBe("aws_s3_bucket.main");
            expect(infraApplyAction.plan_action).toBe("create");
        });
    });
});
