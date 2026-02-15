import { describe, expect, it } from "vitest";
import {
    categorizeActions,
    type ResourceActionEntry,
} from "./resource-actions.js";

describe("categorizeActions", () => {
    describe("given a no-op plan action", () => {
        it("should return only read categories", () => {
            // Arrange
            const planActions = ["no-op"] as const;

            // Act
            const result = categorizeActions([...planActions]);

            // Assert
            expect(result).toEqual(["read"]);
        });
    });

    describe("given a read plan action", () => {
        it("should return only read categories", () => {
            // Arrange
            const planActions = ["read"] as const;

            // Act
            const result = categorizeActions([...planActions]);

            // Assert
            expect(result).toEqual(["read"]);
        });
    });

    describe("given a create plan action", () => {
        it("should return create, read, and tag categories", () => {
            // Arrange
            const planActions = ["create"] as const;

            // Act
            const result = categorizeActions([...planActions]);

            // Assert
            expect(result).toEqual(["create", "read", "tag"]);
        });
    });

    describe("given an update plan action", () => {
        it("should return update, read, and tag categories", () => {
            // Arrange
            const planActions = ["update"] as const;

            // Act
            const result = categorizeActions([...planActions]);

            // Assert
            expect(result).toEqual(["update", "read", "tag"]);
        });
    });

    describe("given a delete plan action", () => {
        it("should return delete and read categories", () => {
            // Arrange
            const planActions = ["delete"] as const;

            // Act
            const result = categorizeActions([...planActions]);

            // Assert
            expect(result).toEqual(["delete", "read"]);
        });
    });

    describe("given a replacement (create + delete) plan action", () => {
        it("should return create, delete, read, and tag categories", () => {
            // Arrange
            const planActions = ["create", "delete"] as const;

            // Act
            const result = categorizeActions([...planActions]);

            // Assert
            expect(result).toEqual(["create", "delete", "read", "tag"]);
        });
    });
});

describe("ResourceActionEntry", () => {
    it("should define the shape for resource action mappings", () => {
        // Arrange
        const entry: ResourceActionEntry = {
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

        // Assert
        expect(entry.terraformType).toBe("aws_s3_bucket");
        expect(entry.service).toBe("s3");
        expect(entry.actions.read).toContain("s3:GetBucketLocation");
    });
});
