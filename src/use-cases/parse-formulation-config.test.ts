import Chance from "chance";
import { describe, expect, it } from "vitest";
import { createFormulationConfigParser } from "./parse-formulation-config.js";

const chance = new Chance();

describe("ParseFormulationConfig", () => {
    const parser = createFormulationConfigParser();

    describe("given valid JSON with snake_case keys", () => {
        it("should parse and transform to camelCase", () => {
            const org = chance.word();
            const repo = chance.word();
            const prefix = chance.word();
            const input = JSON.stringify({
                github_org: org,
                github_repo: repo,
                resource_prefix: prefix,
            });

            const result = parser.parse(input);

            expect(result.githubOrg).toBe(org);
            expect(result.githubRepo).toBe(repo);
            expect(result.resourcePrefix).toBe(prefix);
            expect(result.planApplySeparation).toBe(true);
        });
    });

    describe("given valid JSON with camelCase keys", () => {
        it("should parse directly", () => {
            const org = chance.word();
            const repo = chance.word();
            const prefix = chance.word();
            const input = JSON.stringify({
                githubOrg: org,
                githubRepo: repo,
                resourcePrefix: prefix,
            });

            const result = parser.parse(input);

            expect(result.githubOrg).toBe(org);
            expect(result.githubRepo).toBe(repo);
            expect(result.resourcePrefix).toBe(prefix);
        });
    });

    describe("given valid JSON with all optional fields", () => {
        it("should parse with provided values", () => {
            const accountId = String(
                chance.integer({ min: 100000000000, max: 999999999999 }),
            );
            const input = JSON.stringify({
                github_org: chance.word(),
                github_repo: chance.word(),
                resource_prefix: chance.word(),
                account_id: accountId,
                region: "us-west-2",
                plan_apply_separation: false,
                include_delete_actions: false,
                use_github_environments: true,
                github_environment_names: { dev: "development" },
                permission_boundary_arn:
                    "arn:aws:iam::123456789012:policy/boundary",
                role_path: "/custom/",
                max_session_duration: 7200,
            });

            const result = parser.parse(input);

            expect(result.accountId).toBe(accountId);
            expect(result.region).toBe("us-west-2");
            expect(result.planApplySeparation).toBe(false);
            expect(result.includeDeleteActions).toBe(false);
            expect(result.useGithubEnvironments).toBe(true);
            expect(result.githubEnvironmentNames).toEqual({
                dev: "development",
            });
            expect(result.permissionBoundaryArn).toBe(
                "arn:aws:iam::123456789012:policy/boundary",
            );
            expect(result.rolePath).toBe("/custom/");
            expect(result.maxSessionDuration).toBe(7200);
        });
    });

    describe("given invalid JSON string", () => {
        it("should throw a descriptive parsing error", () => {
            expect(() => parser.parse("not json")).toThrow(
                /Invalid JSON: configuration file is not valid JSON/,
            );
        });
    });

    describe("given JSON missing required fields", () => {
        it("should throw a validation error", () => {
            const input = JSON.stringify({
                github_org: chance.word(),
            });

            expect(() => parser.parse(input)).toThrow();
        });
    });

    describe("given valid JSON with template_variables in snake_case", () => {
        it("should parse and transform template_variables to camelCase key", () => {
            const org = chance.word();
            const repo = chance.word();
            const prefix = chance.word();
            const bucketName = chance.word();
            const input = JSON.stringify({
                github_org: org,
                github_repo: repo,
                resource_prefix: prefix,
                template_variables: {
                    state_bucket: bucketName,
                },
            });

            const result = parser.parse(input);

            expect(result.templateVariables).toEqual({
                state_bucket: bucketName,
            });
        });
    });

    describe("given JSON with prototype pollution keys", () => {
        it("should ignore __proto__ key and parse safely", () => {
            const org = chance.word();
            const repo = chance.word();
            const prefix = chance.word();
            const input = `{"github_org":"${org}","github_repo":"${repo}","resource_prefix":"${prefix}","__proto__":{"isAdmin":true}}`;

            const result = parser.parse(input);

            expect(result.githubOrg).toBe(org);
            expect((result as Record<string, unknown>).isAdmin).toBeUndefined();
        });
    });
});
