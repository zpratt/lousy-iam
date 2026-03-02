import Chance from "chance";
import { describe, expect, it } from "vitest";
import { stripDangerousKeys } from "./sanitize-json.js";

const chance = new Chance();

describe("stripDangerousKeys", () => {
    describe("given primitive values", () => {
        it("should return null as-is", () => {
            expect(stripDangerousKeys(null)).toBeNull();
        });

        it("should return strings as-is", () => {
            const input = chance.word();

            expect(stripDangerousKeys(input)).toBe(input);
        });

        it("should return numbers as-is", () => {
            const input = chance.integer();

            expect(stripDangerousKeys(input)).toBe(input);
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
            const name = chance.word();
            const value = chance.integer();
            const input = { name, value };

            const result = stripDangerousKeys(input);

            expect(result).toEqual({ name, value });
        });
    });

    describe("given an object with __proto__ key", () => {
        it("should strip the __proto__ key", () => {
            const safeValue = chance.word();
            const input = JSON.parse(
                `{"name":"${safeValue}","__proto__":{"isAdmin":true}}`,
            );

            const result = stripDangerousKeys(input);

            expect(result).toEqual({ name: safeValue });
            expect(
                Object.keys(result as Record<string, unknown>).includes(
                    "__proto__",
                ),
            ).toBe(false);
        });
    });

    describe("given an object with constructor key", () => {
        it("should strip the constructor key", () => {
            const safeValue = chance.word();
            const input = { name: safeValue, constructor: "polluted" };

            const result = stripDangerousKeys(input);

            expect(result).toEqual({ name: safeValue });
        });
    });

    describe("given an object with prototype key", () => {
        it("should strip the prototype key", () => {
            const safeValue = chance.word();
            const input = { name: safeValue, prototype: "polluted" };

            const result = stripDangerousKeys(input);

            expect(result).toEqual({ name: safeValue });
        });
    });

    describe("given nested objects with dangerous keys", () => {
        it("should recursively strip dangerous keys", () => {
            const innerValue = chance.word();
            const nameValue = chance.word();
            const input = JSON.parse(
                `{"outer":{"inner":"${innerValue}","__proto__":{"isAdmin":true}},"name":"${nameValue}"}`,
            );

            const result = stripDangerousKeys(input) as Record<string, unknown>;

            expect(result.name).toBe(nameValue);
            expect(result.outer).toEqual({ inner: innerValue });
        });
    });

    describe("given arrays", () => {
        it("should recursively strip dangerous keys from array elements", () => {
            const safeValue = chance.word();
            const numValue = chance.integer();
            const input = [
                JSON.parse(
                    `{"name":"${safeValue}","__proto__":{"isAdmin":true}}`,
                ),
                { value: numValue },
            ];

            const result = stripDangerousKeys(input);

            expect(result).toEqual([{ name: safeValue }, { value: numValue }]);
        });
    });

    describe("given deeply nested JSON exceeding max depth", () => {
        it("should throw an error for nesting beyond 64 levels", () => {
            let nested: unknown = { value: chance.word() };
            for (let i = 0; i < 65; i++) {
                nested = { child: nested };
            }

            expect(() => stripDangerousKeys(nested)).toThrow(
                "JSON nesting too deep",
            );
        });
    });
});
