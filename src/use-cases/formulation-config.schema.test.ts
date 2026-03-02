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
            expect(result.accountId).toBeNull();
            expect(result.region).toBeNull();
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

    describe("given a config with invalid github_org format", () => {
        it("should reject org names with consecutive hyphens", () => {
            const input = {
                githubOrg: "my--org",
                githubRepo: "repo",
                resourcePrefix: "prefix",
            };

            const result = FormulationConfigSchema.safeParse(input);

            expect(result.success).toBe(false);
        });

        it("should reject org names starting with a hyphen", () => {
            const input = {
                githubOrg: "-myorg",
                githubRepo: "repo",
                resourcePrefix: "prefix",
            };

            const result = FormulationConfigSchema.safeParse(input);

            expect(result.success).toBe(false);
        });

        it("should reject org names with special characters", () => {
            const input = {
                githubOrg: "my org!",
                githubRepo: "repo",
                resourcePrefix: "prefix",
            };

            const result = FormulationConfigSchema.safeParse(input);

            expect(result.success).toBe(false);
        });
    });

    describe("given a config with invalid github_repo format", () => {
        it("should reject repo names with spaces", () => {
            const input = {
                githubOrg: "myorg",
                githubRepo: "my repo",
                resourcePrefix: "prefix",
            };

            const result = FormulationConfigSchema.safeParse(input);

            expect(result.success).toBe(false);
        });
    });

    describe("given a config with invalid resource_prefix format", () => {
        it("should reject resource prefixes with spaces", () => {
            const input = {
                githubOrg: "myorg",
                githubRepo: "repo",
                resourcePrefix: "my prefix",
            };

            const result = FormulationConfigSchema.safeParse(input);

            expect(result.success).toBe(false);
        });

        it("should accept resource prefixes with template variables", () => {
            const input = {
                githubOrg: "myorg",
                githubRepo: "repo",
                // biome-ignore lint/suspicious/noTemplateCurlyInString: testing template variable pattern
                resourcePrefix: "myteam-${environment}",
            };

            const result = FormulationConfigSchema.safeParse(input);

            expect(result.success).toBe(true);
        });
    });

    describe("given a config with invalid max_session_duration", () => {
        it("should reject when below minimum (3600)", () => {
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

    describe("given a config with a valid account_id", () => {
        it("should accept a 12-digit AWS account ID", () => {
            const accountId = String(
                chance.integer({ min: 100000000000, max: 999999999999 }),
            );
            const input = {
                githubOrg: chance.word(),
                githubRepo: chance.word(),
                resourcePrefix: chance.word(),
                accountId,
            };

            const result = FormulationConfigSchema.parse(input);

            expect(result.accountId).toBe(accountId);
        });
    });

    describe("given a config with an invalid account_id", () => {
        it("should reject account IDs shorter than 12 digits", () => {
            const input = {
                githubOrg: chance.word(),
                githubRepo: chance.word(),
                resourcePrefix: chance.word(),
                accountId: "12345",
            };

            const result = FormulationConfigSchema.safeParse(input);

            expect(result.success).toBe(false);
        });

        it("should reject account IDs longer than 12 digits", () => {
            const input = {
                githubOrg: chance.word(),
                githubRepo: chance.word(),
                resourcePrefix: chance.word(),
                accountId: "1234567890123",
            };

            const result = FormulationConfigSchema.safeParse(input);

            expect(result.success).toBe(false);
        });

        it("should reject account IDs with non-digit characters", () => {
            const input = {
                githubOrg: chance.word(),
                githubRepo: chance.word(),
                resourcePrefix: chance.word(),
                accountId: "12345678901a",
            };

            const result = FormulationConfigSchema.safeParse(input);

            expect(result.success).toBe(false);
        });
    });

    describe("given a config with a valid region", () => {
        it("should accept a standard AWS region", () => {
            const input = {
                githubOrg: chance.word(),
                githubRepo: chance.word(),
                resourcePrefix: chance.word(),
                region: "us-east-1",
            };

            const result = FormulationConfigSchema.parse(input);

            expect(result.region).toBe("us-east-1");
        });

        it("should accept a GovCloud region", () => {
            const input = {
                githubOrg: chance.word(),
                githubRepo: chance.word(),
                resourcePrefix: chance.word(),
                region: "us-gov-west-1",
            };

            const result = FormulationConfigSchema.parse(input);

            expect(result.region).toBe("us-gov-west-1");
        });

        it("should accept a multi-character middle segment region", () => {
            const input = {
                githubOrg: chance.word(),
                githubRepo: chance.word(),
                resourcePrefix: chance.word(),
                region: "ap-southeast-1",
            };

            const result = FormulationConfigSchema.parse(input);

            expect(result.region).toBe("ap-southeast-1");
        });

        it("should accept wildcard * for multi-region", () => {
            const input = {
                githubOrg: chance.word(),
                githubRepo: chance.word(),
                resourcePrefix: chance.word(),
                region: "*",
            };

            const result = FormulationConfigSchema.parse(input);

            expect(result.region).toBe("*");
        });
    });

    describe("given a config with an invalid region", () => {
        it("should reject regions with invalid format", () => {
            const input = {
                githubOrg: chance.word(),
                githubRepo: chance.word(),
                resourcePrefix: chance.word(),
                region: "not a region!",
            };

            const result = FormulationConfigSchema.safeParse(input);

            expect(result.success).toBe(false);
        });
    });

    describe("given a config with templateVariables", () => {
        it("should accept a map of string key-value pairs", () => {
            const input = {
                githubOrg: chance.word(),
                githubRepo: chance.word(),
                resourcePrefix: chance.word(),
                templateVariables: {
                    state_bucket: "my-terraform-state",
                    lock_table: "my-locks",
                },
            };

            const result = FormulationConfigSchema.parse(input);

            expect(result.templateVariables).toEqual({
                state_bucket: "my-terraform-state",
                lock_table: "my-locks",
            });
        });

        it("should default to empty object when omitted", () => {
            const input = {
                githubOrg: chance.word(),
                githubRepo: chance.word(),
                resourcePrefix: chance.word(),
            };

            const result = FormulationConfigSchema.parse(input);

            expect(result.templateVariables).toEqual({});
        });
    });
});
