import Chance from "chance";
import { describe, expect, it } from "vitest";
import type { ActionInventoryInput } from "./action-inventory.schema.js";
import { createPermissionPolicyBuilder } from "./build-permission-policy.js";

const chance = new Chance();

function buildMinimalInventory(
    overrides?: Partial<ActionInventoryInput>,
): ActionInventoryInput {
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
                {
                    action: "s3:GetObject",
                    resource: "arn:aws:s3:::state-bucket/*",
                    purpose: "Read Terraform state",
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
                {
                    action: "ecs:DeleteCluster",
                    resource: "*",
                    purpose: "delete for aws_ecs_cluster",
                    category: "delete",
                    source_resource: ["aws_ecs_cluster.main"],
                    plan_action: ["create"],
                },
            ],
        },
        ...overrides,
    };
}

describe("BuildPermissionPolicy", () => {
    const builder = createPermissionPolicyBuilder();
    const resourcePrefix = chance.word();

    describe("buildPlanPolicy", () => {
        describe("given an action inventory with toolchain and infrastructure actions", () => {
            it("should include only plan_and_apply actions", () => {
                const inventory = buildMinimalInventory();

                const result = builder.buildPlanPolicy(
                    inventory,
                    resourcePrefix,
                );

                const allActions = result.policy_document.Statement.flatMap(
                    (s) => s.Action,
                );
                expect(allActions).toContain("sts:GetCallerIdentity");
                expect(allActions).toContain("s3:GetObject");
                expect(allActions).toContain("ecs:DescribeClusters");
                expect(allActions).not.toContain("s3:PutObject");
                expect(allActions).not.toContain("ecs:CreateCluster");
            });

            it("should set policy_name using resource prefix", () => {
                const inventory = buildMinimalInventory();

                const result = builder.buildPlanPolicy(
                    inventory,
                    resourcePrefix,
                );

                expect(result.policy_name).toBe(
                    `${resourcePrefix}-github-plan-permissions`,
                );
            });

            it("should include Version 2012-10-17", () => {
                const inventory = buildMinimalInventory();

                const result = builder.buildPlanPolicy(
                    inventory,
                    resourcePrefix,
                );

                expect(result.policy_document.Version).toBe("2012-10-17");
            });

            it("should generate unique Sids when same service has different resources", () => {
                const inventory = buildMinimalInventory({
                    toolchain_actions: {
                        plan_and_apply: [
                            {
                                action: "s3:GetObject",
                                resource: "arn:aws:s3:::bucket-a/*",
                                purpose: "Read state A",
                                category: "toolchain",
                            },
                            {
                                action: "s3:ListBucket",
                                resource: "arn:aws:s3:::bucket-b",
                                purpose: "List state B",
                                category: "toolchain",
                            },
                        ],
                        apply_only: [],
                    },
                });

                const result = builder.buildPlanPolicy(
                    inventory,
                    resourcePrefix,
                );

                const sids = result.policy_document.Statement.map((s) => s.Sid);
                const uniqueSids = new Set(sids);
                expect(uniqueSids.size).toBe(sids.length);
            });

            it("should generate descriptive Sid for each statement", () => {
                const inventory = buildMinimalInventory();

                const result = builder.buildPlanPolicy(
                    inventory,
                    resourcePrefix,
                );

                const sids = result.policy_document.Statement.map((s) => s.Sid);
                expect(sids.length).toBeGreaterThan(0);
                for (const sid of sids) {
                    expect(sid).toMatch(/^[A-Za-z]+/);
                }
            });

            it("should estimate policy size in bytes", () => {
                const inventory = buildMinimalInventory();

                const result = builder.buildPlanPolicy(
                    inventory,
                    resourcePrefix,
                );

                expect(result.estimated_size_bytes).toBeGreaterThan(0);
                const serialized = JSON.stringify(result.policy_document);
                expect(result.estimated_size_bytes).toBe(
                    new TextEncoder().encode(serialized).length,
                );
            });

            it("should set Effect to Allow on all statements", () => {
                const inventory = buildMinimalInventory();

                const result = builder.buildPlanPolicy(
                    inventory,
                    resourcePrefix,
                );

                for (const statement of result.policy_document.Statement) {
                    expect(statement.Effect).toBe("Allow");
                }
            });
        });
    });

    describe("buildApplyPolicy", () => {
        describe("given an action inventory with all action types", () => {
            it("should include both plan_and_apply and apply_only actions", () => {
                const inventory = buildMinimalInventory();

                const result = builder.buildApplyPolicy(
                    inventory,
                    resourcePrefix,
                    true,
                );

                const allActions = result.policy_document.Statement.flatMap(
                    (s) => s.Action,
                );
                expect(allActions).toContain("sts:GetCallerIdentity");
                expect(allActions).toContain("s3:GetObject");
                expect(allActions).toContain("s3:PutObject");
                expect(allActions).toContain("ecs:DescribeClusters");
                expect(allActions).toContain("ecs:CreateCluster");
            });

            it("should set policy_name using resource prefix", () => {
                const inventory = buildMinimalInventory();

                const result = builder.buildApplyPolicy(
                    inventory,
                    resourcePrefix,
                    true,
                );

                expect(result.policy_name).toBe(
                    `${resourcePrefix}-github-apply-permissions`,
                );
            });
        });

        describe("given include_delete_actions is true", () => {
            it("should include delete category actions", () => {
                const inventory = buildMinimalInventory();

                const result = builder.buildApplyPolicy(
                    inventory,
                    resourcePrefix,
                    true,
                );

                const allActions = result.policy_document.Statement.flatMap(
                    (s) => s.Action,
                );
                expect(allActions).toContain("ecs:DeleteCluster");
            });
        });

        describe("given include_delete_actions is false", () => {
            it("should exclude delete category actions", () => {
                const inventory = buildMinimalInventory();

                const result = builder.buildApplyPolicy(
                    inventory,
                    resourcePrefix,
                    false,
                );

                const allActions = result.policy_document.Statement.flatMap(
                    (s) => s.Action,
                );
                expect(allActions).not.toContain("ecs:DeleteCluster");
            });
        });
    });
});
