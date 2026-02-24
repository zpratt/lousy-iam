import Chance from "chance";
import { describe, expect, it } from "vitest";
import { ActionInventoryInputSchema } from "./action-inventory.schema.js";

const chance = new Chance();

function buildValidInventory() {
    return {
        metadata: {
            iac_tool: "terraform",
            iac_version: chance.semver(),
            format_version: chance.semver(),
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
    };
}

describe("ActionInventoryInputSchema", () => {
    describe("given a valid action inventory", () => {
        it("should parse successfully", () => {
            const input = buildValidInventory();

            const result = ActionInventoryInputSchema.parse(input);

            expect(result.metadata.iac_tool).toBe("terraform");
            expect(result.toolchain_actions.plan_and_apply).toHaveLength(1);
            expect(result.toolchain_actions.apply_only).toHaveLength(1);
            expect(result.infrastructure_actions.plan_and_apply).toHaveLength(
                1,
            );
            expect(result.infrastructure_actions.apply_only).toHaveLength(1);
        });
    });

    describe("given an inventory missing metadata", () => {
        it("should reject with validation error", () => {
            const input = buildValidInventory();
            const { metadata: _, ...rest } = input;

            const result = ActionInventoryInputSchema.safeParse(rest);

            expect(result.success).toBe(false);
        });
    });

    describe("given an inventory missing toolchain_actions", () => {
        it("should reject with validation error", () => {
            const input = buildValidInventory();
            const { toolchain_actions: _, ...rest } = input;

            const result = ActionInventoryInputSchema.safeParse(rest);

            expect(result.success).toBe(false);
        });
    });

    describe("given an inventory missing infrastructure_actions", () => {
        it("should reject with validation error", () => {
            const input = buildValidInventory();
            const { infrastructure_actions: _, ...rest } = input;

            const result = ActionInventoryInputSchema.safeParse(rest);

            expect(result.success).toBe(false);
        });
    });

    describe("given an infrastructure action missing source_resource", () => {
        it("should reject with validation error", () => {
            const input = buildValidInventory();
            const badAction = {
                ...input.infrastructure_actions.plan_and_apply[0],
            };
            const { source_resource: _, ...withoutSourceResource } = badAction;
            input.infrastructure_actions.plan_and_apply[0] =
                withoutSourceResource as typeof badAction;

            const result = ActionInventoryInputSchema.safeParse(input);

            expect(result.success).toBe(false);
        });
    });
});
