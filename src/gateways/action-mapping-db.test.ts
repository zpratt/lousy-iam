import { describe, expect, it } from "vitest";
import { createActionMappingDb } from "./action-mapping-db.js";

describe("ActionMappingDb", () => {
    describe("when looking up a known Terraform resource type", () => {
        it("should return the action mapping for aws_s3_bucket", () => {
            // Arrange
            const db = createActionMappingDb();

            // Act
            const result = db.lookupByTerraformType("aws_s3_bucket");

            // Assert
            expect(result).toBeDefined();
            expect(result?.service).toBe("s3");
            expect(result?.actions.read.length).toBeGreaterThan(0);
            expect(result?.actions.create.length).toBeGreaterThan(0);
            expect(result?.actions.delete.length).toBeGreaterThan(0);
        });

        it("should return the action mapping for aws_ecs_cluster", () => {
            // Arrange
            const db = createActionMappingDb();

            // Act
            const result = db.lookupByTerraformType("aws_ecs_cluster");

            // Assert
            expect(result).toBeDefined();
            expect(result?.service).toBe("ecs");
            expect(result?.actions.create).toContain("ecs:CreateCluster");
        });

        it("should return the action mapping for aws_lambda_function", () => {
            // Arrange
            const db = createActionMappingDb();

            // Act
            const result = db.lookupByTerraformType("aws_lambda_function");

            // Assert
            expect(result).toBeDefined();
            expect(result?.service).toBe("lambda");
            expect(result?.actions.create).toContain("lambda:CreateFunction");
        });

        it("should return the action mapping for aws_iam_role", () => {
            // Arrange
            const db = createActionMappingDb();

            // Act
            const result = db.lookupByTerraformType("aws_iam_role");

            // Assert
            expect(result).toBeDefined();
            expect(result?.service).toBe("iam");
            expect(result?.actions.create).toContain("iam:CreateRole");
        });

        it("should return the action mapping for aws_vpc", () => {
            // Arrange
            const db = createActionMappingDb();

            // Act
            const result = db.lookupByTerraformType("aws_vpc");

            // Assert
            expect(result).toBeDefined();
            expect(result?.service).toBe("ec2");
        });

        it("should return the action mapping for aws_security_group", () => {
            // Arrange
            const db = createActionMappingDb();

            // Act
            const result = db.lookupByTerraformType("aws_security_group");

            // Assert
            expect(result).toBeDefined();
            expect(result?.service).toBe("ec2");
        });
    });

    describe("when looking up an unknown resource type", () => {
        it("should return undefined", () => {
            // Arrange
            const db = createActionMappingDb();

            // Act
            const result = db.lookupByTerraformType("aws_nonexistent_resource");

            // Assert
            expect(result).toBeUndefined();
        });
    });
});
