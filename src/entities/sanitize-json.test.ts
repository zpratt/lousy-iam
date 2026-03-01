import { describe, expect, it } from "vitest";
import { stripDangerousKeys } from "./sanitize-json.js";

describe("stripDangerousKeys", () => {
    describe("given primitive values", () => {
        it("should return null as-is", () => {
            expect(stripDangerousKeys(null)).toBeNull();
        });

        it("should return strings as-is", () => {
            const input = "hello";

            expect(stripDangerousKeys(input)).toBe(input);
        });

        it("should return numbers as-is", () => {
            expect(stripDangerousKeys(42)).toBe(42);
        });

        it("should return booleans as-is", () => {
            expect(stripDangerousKeys(true)).toBe(true);
        });

        it("should return undefined as-is", () => {
            expect(stripDangerousKeys(undefined)).toBeUndefined();
        });
    });

    describe("given an object with safe keys", () => {
        it("should return the object unchanged", () => {
            const input = { name: "test", value: 123 };

            const result = stripDangerousKeys(input);

            expect(result).toEqual({ name: "test", value: 123 });
        });
    });

    describe("given an object with __proto__ key", () => {
        it("should strip the __proto__ key", () => {
            const input = JSON.parse(
                '{"name":"safe","__proto__":{"isAdmin":true}}',
            );

            const result = stripDangerousKeys(input);

            expect(result).toEqual({ name: "safe" });
            expect(
                Object.keys(result as Record<string, unknown>).includes(
                    "__proto__",
                ),
            ).toBe(false);
        });
    });

    describe("given an object with constructor key", () => {
        it("should strip the constructor key", () => {
            const input = { name: "safe", constructor: "polluted" };

            const result = stripDangerousKeys(input);

            expect(result).toEqual({ name: "safe" });
        });
    });

    describe("given an object with prototype key", () => {
        it("should strip the prototype key", () => {
            const input = { name: "safe", prototype: "polluted" };

            const result = stripDangerousKeys(input);

            expect(result).toEqual({ name: "safe" });
        });
    });

    describe("given nested objects with dangerous keys", () => {
        it("should recursively strip dangerous keys", () => {
            const input = JSON.parse(
                '{"outer":{"inner":"safe","__proto__":{"isAdmin":true}},"name":"test"}',
            );

            const result = stripDangerousKeys(input) as Record<string, unknown>;

            expect(result.name).toBe("test");
            expect(result.outer).toEqual({ inner: "safe" });
        });
    });

    describe("given arrays", () => {
        it("should recursively strip dangerous keys from array elements", () => {
            const input = [
                JSON.parse('{"name":"safe","__proto__":{"isAdmin":true}}'),
                { value: 42 },
            ];

            const result = stripDangerousKeys(input);

            expect(result).toEqual([{ name: "safe" }, { value: 42 }]);
        });
    });
});
