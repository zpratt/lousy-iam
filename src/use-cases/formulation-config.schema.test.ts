import Chance from "chance";
import { describe, expect, it } from "vitest";
import { FormulationConfigSchema } from "./formulation-config.schema.js";

const chance = new Chance();

describe("FormulationConfigSchema", () => {
    describe("given a valid config with all required fields", () => {
        it("should parse successfully with defaults applied", () => {
            const input = {
                githubOrg: chance.word(),
                githubRepo: chance.word(),
                resourcePrefix: chance.word(),
            };

            const result = FormulationConfigSchema.parse(input);

            expect(result.githubOrg).toBe(input.githubOrg);
            expect(result.githubRepo).toBe(input.githubRepo);
            expect(result.resourcePrefix).toBe(input.resourcePrefix);
            expect(result.planApplySeparation).toBe(true);
            expect(result.includeDeleteActions).toBe(true);
            expect(result.useGithubEnvironments).toBe(false);
            expect(result.githubEnvironmentNames).toEqual({});
            expect(result.permissionBoundaryArn).toBeNull();
            expect(result.rolePath).toBe("/");
            expect(result.maxSessionDuration).toBe(3600);
        });
    });

    describe("given a config with all fields provided", () => {
        it("should parse with provided values", () => {
            const input = {
                githubOrg: chance.word(),
                githubRepo: chance.word(),
                resourcePrefix: chance.word(),
                planApplySeparation: false,
                includeDeleteActions: false,
                useGithubEnvironments: true,
                githubEnvironmentNames: { dev: "development" },
                permissionBoundaryArn:
                    "arn:aws:iam::123456789012:policy/boundary",
                rolePath: "/deployment/",
                maxSessionDuration: 7200,
            };

            const result = FormulationConfigSchema.parse(input);

            expect(result.planApplySeparation).toBe(false);
            expect(result.includeDeleteActions).toBe(false);
            expect(result.useGithubEnvironments).toBe(true);
            expect(result.githubEnvironmentNames).toEqual({
                dev: "development",
            });
            expect(result.permissionBoundaryArn).toBe(
                input.permissionBoundaryArn,
            );
            expect(result.rolePath).toBe("/deployment/");
            expect(result.maxSessionDuration).toBe(7200);
        });
    });

    describe("given a config missing github_org", () => {
        it("should reject with validation error", () => {
            const input = {
                githubRepo: chance.word(),
                resourcePrefix: chance.word(),
            };

            const result = FormulationConfigSchema.safeParse(input);

            expect(result.success).toBe(false);
        });
    });

    describe("given a config with empty github_org", () => {
        it("should reject with validation error", () => {
            const input = {
                githubOrg: "",
                githubRepo: chance.word(),
                resourcePrefix: chance.word(),
            };

            const result = FormulationConfigSchema.safeParse(input);

            expect(result.success).toBe(false);
        });
    });

    describe("given a config missing github_repo", () => {
        it("should reject with validation error", () => {
            const input = {
                githubOrg: chance.word(),
                resourcePrefix: chance.word(),
            };

            const result = FormulationConfigSchema.safeParse(input);

            expect(result.success).toBe(false);
        });
    });

    describe("given a config missing resource_prefix", () => {
        it("should reject with validation error", () => {
            const input = {
                githubOrg: chance.word(),
                githubRepo: chance.word(),
            };

            const result = FormulationConfigSchema.safeParse(input);

            expect(result.success).toBe(false);
        });
    });

    describe("given a config with invalid max_session_duration", () => {
        it("should reject when below minimum (900)", () => {
            const input = {
                githubOrg: chance.word(),
                githubRepo: chance.word(),
                resourcePrefix: chance.word(),
                maxSessionDuration: 100,
            };

            const result = FormulationConfigSchema.safeParse(input);

            expect(result.success).toBe(false);
        });

        it("should reject when above maximum (43200)", () => {
            const input = {
                githubOrg: chance.word(),
                githubRepo: chance.word(),
                resourcePrefix: chance.word(),
                maxSessionDuration: 50000,
            };

            const result = FormulationConfigSchema.safeParse(input);

            expect(result.success).toBe(false);
        });
    });
});
