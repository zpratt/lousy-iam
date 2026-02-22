import Chance from "chance";
import { describe, expect, it } from "vitest";
import { createActionInventoryParser } from "./parse-action-inventory.js";

const chance = new Chance();

describe("ParseActionInventory", () => {
    const parser = createActionInventoryParser();

    describe("given valid action inventory JSON", () => {
        it("should parse successfully", () => {
            const input = JSON.stringify({
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
                    ],
                    apply_only: [],
                },
                infrastructure_actions: {
                    plan_and_apply: [],
                    apply_only: [],
                },
            });

            const result = parser.parse(input);

            expect(result.metadata.iac_tool).toBe("terraform");
            expect(result.toolchain_actions.plan_and_apply).toHaveLength(1);
        });
    });

    describe("given invalid JSON string", () => {
        it("should throw a descriptive error", () => {
            expect(() => parser.parse("not json")).toThrow(
                /Invalid JSON: action inventory file is not valid JSON/,
            );
        });
    });

    describe("given JSON missing required sections", () => {
        it("should throw a validation error", () => {
            const input = JSON.stringify({ metadata: {} });

            expect(() => parser.parse(input)).toThrow();
        });
    });
});
