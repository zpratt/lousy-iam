import { describe, expect, it } from "vitest";
import { normalizePath } from "./synthesis-output.js";

describe("normalizePath", () => {
    describe("given a root path", () => {
        it("should return / unchanged", () => {
            const result = normalizePath("/");

            expect(result).toBe("/");
        });
    });

    describe("given a path without leading or trailing slashes", () => {
        it("should add both slashes", () => {
            const result = normalizePath("deployment");

            expect(result).toBe("/deployment/");
        });
    });

    describe("given a path with leading slash only", () => {
        it("should add trailing slash", () => {
            const result = normalizePath("/deployment");

            expect(result).toBe("/deployment/");
        });
    });

    describe("given a path with trailing slash only", () => {
        it("should add leading slash", () => {
            const result = normalizePath("deployment/");

            expect(result).toBe("/deployment/");
        });
    });

    describe("given a path already normalized", () => {
        it("should return unchanged", () => {
            const result = normalizePath("/deployment/");

            expect(result).toBe("/deployment/");
        });
    });

    describe("given a path with traversal segments", () => {
        it("should throw an error for double-dot segments", () => {
            expect(() => normalizePath("../../etc")).toThrow(
                "path traversal not allowed",
            );
        });

        it("should throw an error for embedded traversal", () => {
            expect(() => normalizePath("/deployment/../etc")).toThrow(
                "path traversal not allowed",
            );
        });
    });
});
