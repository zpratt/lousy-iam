import Chance from "chance";
import { describe, expect, it } from "vitest";
import { buildPlanJson } from "../lib/test-plan-builder.js";
import { createTerraformPlanParser } from "./parse-terraform-plan.js";

const chance = new Chance();

describe("ParseTerraformPlan", () => {
    describe("given valid Terraform plan JSON", () => {
        it("should extract AWS resource changes", () => {
            // Arrange
            const resourceType = "aws_s3_bucket";
            const address = `${resourceType}.${chance.word()}`;
            const planJson = buildPlanJson([
                {
                    address,
                    type: resourceType,
                    actions: ["create"],
                    after: { bucket: "test-bucket" },
                },
            ]);
            const parser = createTerraformPlanParser();

            // Act
            const result = parser.parse(planJson);

            // Assert
            expect(result.metadata.iacTool).toBe("terraform");
            expect(result.metadata.iacVersion).toBe("1.7.0");
            expect(result.metadata.formatVersion).toBe("1.2");
            expect(result.resourceChanges).toHaveLength(1);
            expect(result.resourceChanges[0]?.type).toBe(resourceType);
        });

        it("should filter out non-AWS resources", () => {
            // Arrange
            const planJson = buildPlanJson([
                {
                    address: "aws_s3_bucket.main",
                    type: "aws_s3_bucket",
                    actions: ["create"],
                    after: {},
                },
                {
                    address: "google_storage_bucket.main",
                    type: "google_storage_bucket",
                    actions: ["create"],
                    providerName: "registry.terraform.io/hashicorp/google",
                    after: {},
                },
            ]);
            const parser = createTerraformPlanParser();

            // Act
            const result = parser.parse(planJson);

            // Assert
            expect(result.resourceChanges).toHaveLength(1);
            expect(result.resourceChanges[0]?.type).toBe("aws_s3_bucket");
        });

        it("should handle an empty resource_changes array", () => {
            // Arrange
            const planJson = buildPlanJson([]);
            const parser = createTerraformPlanParser();

            // Act
            const result = parser.parse(planJson);

            // Assert
            expect(result.resourceChanges).toHaveLength(0);
        });
    });

    describe("given invalid input", () => {
        it("should throw an error for non-JSON input", () => {
            // Arrange
            const parser = createTerraformPlanParser();
            const invalidInput = "not valid json {{{";

            // Act & Assert
            expect(() => parser.parse(invalidInput)).toThrow(
                "Invalid JSON input",
            );
        });

        it("should throw an error for JSON without resource_changes", () => {
            // Arrange
            const parser = createTerraformPlanParser();
            const invalidPlan = JSON.stringify({
                formatVersion: "1.2",
                terraformVersion: "1.7.0",
            });

            // Act & Assert
            expect(() => parser.parse(invalidPlan)).toThrow();
        });
    });
});
