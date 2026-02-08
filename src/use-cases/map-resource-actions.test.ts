import Chance from "chance";
import { describe, expect, it, vi } from "vitest";
import type { ResourceChange } from "../entities/terraform-plan.js";
import { createResourceActionMapper } from "./map-resource-actions.js";

const chance = new Chance();

describe("MapResourceActions", () => {
    describe("given a resource with a known type and create action", () => {
        it("should return mapped actions with read in plan_and_apply and create/tag in apply_only", () => {
            // Arrange
            const resourceType = "aws_s3_bucket";
            const address = `${resourceType}.${chance.word()}`;
            const resourceChange: ResourceChange = {
                address,
                type: resourceType,
                provider_name: "registry.terraform.io/hashicorp/aws",
                change: {
                    actions: ["create"],
                    before: null,
                    after: { bucket: "test-bucket" },
                },
            };
            const mockDb = {
                lookupByTerraformType: vi.fn().mockReturnValue({
                    terraformType: resourceType,
                    service: "s3",
                    actions: {
                        read: ["s3:GetBucketLocation"],
                        create: ["s3:CreateBucket"],
                        update: ["s3:PutBucketPolicy"],
                        delete: ["s3:DeleteBucket"],
                        tag: ["s3:PutBucketTagging"],
                    },
                }),
            };
            const mapper = createResourceActionMapper(mockDb);

            // Act
            const result = mapper.mapActions(resourceChange);

            // Assert
            expect(result.planAndApply).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        action: "s3:GetBucketLocation",
                        category: "read",
                    }),
                ]),
            );
            expect(result.applyOnly).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        action: "s3:CreateBucket",
                        category: "create",
                    }),
                    expect.objectContaining({
                        action: "s3:PutBucketTagging",
                        category: "tag",
                    }),
                ]),
            );
        });
    });

    describe("given a resource with a delete action", () => {
        it("should return read in plan_and_apply and delete in apply_only", () => {
            // Arrange
            const resourceChange: ResourceChange = {
                address: "aws_s3_bucket.old",
                type: "aws_s3_bucket",
                provider_name: "registry.terraform.io/hashicorp/aws",
                change: {
                    actions: ["delete"],
                    before: { bucket: "old-bucket" },
                    after: null,
                },
            };
            const mockDb = {
                lookupByTerraformType: vi.fn().mockReturnValue({
                    terraformType: "aws_s3_bucket",
                    service: "s3",
                    actions: {
                        read: ["s3:GetBucketLocation"],
                        create: ["s3:CreateBucket"],
                        update: ["s3:PutBucketPolicy"],
                        delete: ["s3:DeleteBucket"],
                        tag: ["s3:PutBucketTagging"],
                    },
                }),
            };
            const mapper = createResourceActionMapper(mockDb);

            // Act
            const result = mapper.mapActions(resourceChange);

            // Assert
            expect(result.planAndApply).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        action: "s3:GetBucketLocation",
                        category: "read",
                    }),
                ]),
            );
            expect(result.applyOnly).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        action: "s3:DeleteBucket",
                        category: "delete",
                    }),
                ]),
            );
            expect(result.applyOnly.some((a) => a.category === "tag")).toBe(
                false,
            );
        });
    });

    describe("given a resource with a no-op action", () => {
        it("should return only read actions in plan_and_apply", () => {
            // Arrange
            const resourceChange: ResourceChange = {
                address: "aws_vpc.main",
                type: "aws_vpc",
                provider_name: "registry.terraform.io/hashicorp/aws",
                change: {
                    actions: ["no-op"],
                    before: { cidr_block: "10.0.0.0/16" },
                    after: { cidr_block: "10.0.0.0/16" },
                },
            };
            const mockDb = {
                lookupByTerraformType: vi.fn().mockReturnValue({
                    terraformType: "aws_vpc",
                    service: "ec2",
                    actions: {
                        read: ["ec2:DescribeVpcs"],
                        create: ["ec2:CreateVpc"],
                        update: ["ec2:ModifyVpcAttribute"],
                        delete: ["ec2:DeleteVpc"],
                        tag: ["ec2:CreateTags"],
                    },
                }),
            };
            const mapper = createResourceActionMapper(mockDb);

            // Act
            const result = mapper.mapActions(resourceChange);

            // Assert
            expect(result.planAndApply).toHaveLength(1);
            expect(result.planAndApply[0]?.action).toBe("ec2:DescribeVpcs");
            expect(result.applyOnly).toHaveLength(0);
        });
    });

    describe("given a resource with an unknown type", () => {
        it("should return empty actions", () => {
            // Arrange
            const unknownType = `aws_${chance.word()}_${chance.word()}`;
            const resourceChange: ResourceChange = {
                address: `${unknownType}.main`,
                type: unknownType,
                provider_name: "registry.terraform.io/hashicorp/aws",
                change: {
                    actions: ["create"],
                    before: null,
                    after: {},
                },
            };
            const mockDb = {
                lookupByTerraformType: vi.fn().mockReturnValue(undefined),
            };
            const mapper = createResourceActionMapper(mockDb);

            // Act
            const result = mapper.mapActions(resourceChange);

            // Assert
            expect(result.planAndApply).toHaveLength(0);
            expect(result.applyOnly).toHaveLength(0);
            expect(result.unknownType).toBe(true);
        });
    });
});
