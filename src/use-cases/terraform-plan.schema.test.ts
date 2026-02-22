import { describe, expect, it } from "vitest";
import { buildPlanObject } from "../lib/test-plan-builder.js";
import { TerraformPlanSchema } from "./terraform-plan.schema.js";

describe("TerraformPlanSchema", () => {
    describe("given a valid Terraform plan JSON", () => {
        it("should parse successfully with resource_changes", () => {
            // Arrange
            const resourceType = "aws_s3_bucket";
            const address = `module.storage.${resourceType}.main`;
            const input = buildPlanObject([
                {
                    address,
                    type: resourceType,
                    actions: ["create"],
                    after: {
                        bucket: "my-bucket",
                        tags: { Name: "my-bucket" },
                    },
                },
            ]);

            // Act
            const result = TerraformPlanSchema.parse(input);

            // Assert
            expect(result.format_version).toBe("1.2");
            expect(result.terraform_version).toBe("1.7.0");
            expect(result.resource_changes).toHaveLength(1);
            expect(result.resource_changes[0]?.type).toBe(resourceType);
            expect(result.resource_changes[0]?.address).toBe(address);
        });

        it("should parse a plan with multiple resource changes", () => {
            // Arrange
            const input = buildPlanObject(
                [
                    {
                        address: "aws_vpc.main",
                        type: "aws_vpc",
                        actions: ["create"],
                        after: { cidr_block: "10.0.0.0/16" },
                    },
                    {
                        address: "aws_subnet.public",
                        type: "aws_subnet",
                        actions: ["no-op"],
                        before: { cidr_block: "10.0.1.0/24" },
                        after: { cidr_block: "10.0.1.0/24" },
                    },
                ],
                { terraformVersion: "1.8.0" },
            );

            // Act
            const result = TerraformPlanSchema.parse(input);

            // Assert
            expect(result.resource_changes).toHaveLength(2);
        });

        it("should accept replacement actions (create and delete)", () => {
            // Arrange
            const input = buildPlanObject([
                {
                    address: "aws_instance.web",
                    type: "aws_instance",
                    actions: ["create", "delete"],
                    before: { instance_type: "t3.micro" },
                    after: { instance_type: "t3.small" },
                },
            ]);

            // Act
            const result = TerraformPlanSchema.parse(input);

            // Assert
            expect(result.resource_changes[0]?.change.actions).toEqual([
                "create",
                "delete",
            ]);
        });
    });

    describe("given invalid input", () => {
        it("should reject input missing resource_changes", () => {
            // Arrange
            const input = {
                format_version: "1.2",
                terraform_version: "1.7.0",
            };

            // Act & Assert
            expect(() => TerraformPlanSchema.parse(input)).toThrow();
        });

        it("should reject input with non-array resource_changes", () => {
            // Arrange
            const input = {
                format_version: "1.2",
                terraform_version: "1.7.0",
                resource_changes: "not-an-array",
            };

            // Act & Assert
            expect(() => TerraformPlanSchema.parse(input)).toThrow();
        });

        it("should reject resource changes missing required fields", () => {
            // Arrange
            const input = {
                format_version: "1.2",
                terraform_version: "1.7.0",
                resource_changes: [
                    {
                        address: "aws_vpc.main",
                    },
                ],
            };

            // Act & Assert
            expect(() => TerraformPlanSchema.parse(input)).toThrow();
        });
    });
});
