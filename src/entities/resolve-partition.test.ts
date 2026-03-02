import { describe, expect, it } from "vitest";
import { resolvePartition } from "./resolve-partition.js";

describe("resolvePartition", () => {
    describe("given a standard region", () => {
        it("should return aws partition", () => {
            const result = resolvePartition("us-east-1");

            expect(result).toBe("aws");
        });
    });

    describe("given a GovCloud region", () => {
        it("should return aws-us-gov partition", () => {
            const result = resolvePartition("us-gov-west-1");

            expect(result).toBe("aws-us-gov");
        });
    });

    describe("given a China region", () => {
        it("should return aws-cn partition", () => {
            const result = resolvePartition("cn-north-1");

            expect(result).toBe("aws-cn");
        });
    });

    describe("given null region", () => {
        it("should return aws partition", () => {
            const result = resolvePartition(null);

            expect(result).toBe("aws");
        });
    });

    describe("given wildcard region", () => {
        it("should return aws partition", () => {
            const result = resolvePartition("*");

            expect(result).toBe("aws");
        });
    });
});
