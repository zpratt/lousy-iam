import Chance from "chance";
import { describe, expect, it } from "vitest";
import type { FormulationConfig } from "../entities/formulation-config.js";
import { createTrustPolicyBuilder } from "./build-trust-policy.js";

const chance = new Chance();

function buildConfig(
    overrides?: Partial<FormulationConfig>,
): FormulationConfig {
    return {
        githubOrg: chance.word(),
        githubRepo: chance.word(),
        resourcePrefix: chance.word(),
        accountId: null,
        region: null,
        planApplySeparation: true,
        includeDeleteActions: true,
        useGithubEnvironments: false,
        githubEnvironmentNames: {},
        permissionBoundaryArn: null,
        rolePath: "/",
        maxSessionDuration: 3600,
        ...overrides,
    };
}

describe("BuildTrustPolicy", () => {
    const builder = createTrustPolicyBuilder();

    describe("buildPlanTrust", () => {
        describe("given a standard configuration", () => {
            it("should use pull_request as subject", () => {
                const config = buildConfig();

                const result = builder.buildPlanTrust(config);

                const statement = result.Statement[0];
                expect(
                    statement?.Condition.StringEquals[
                        "token.actions.githubusercontent.com:sub"
                    ],
                ).toBe(
                    `repo:${config.githubOrg}/${config.githubRepo}:pull_request`,
                );
            });

            it("should include audience condition", () => {
                const config = buildConfig();

                const result = builder.buildPlanTrust(config);

                const statement = result.Statement[0];
                expect(
                    statement?.Condition.StringEquals[
                        "token.actions.githubusercontent.com:aud"
                    ],
                ).toBe("sts.amazonaws.com");
            });

            it("should use AssumeRoleWithWebIdentity action", () => {
                const config = buildConfig();

                const result = builder.buildPlanTrust(config);

                expect(result.Statement[0]?.Action).toBe(
                    "sts:AssumeRoleWithWebIdentity",
                );
            });

            it("should reference OIDC provider with account_id placeholder", () => {
                const config = buildConfig();

                const result = builder.buildPlanTrust(config);

                expect(result.Statement[0]?.Principal.Federated).toContain(
                    // biome-ignore lint/suspicious/noTemplateCurlyInString: testing IAM ARN placeholder
                    "${account_id}",
                );
                expect(result.Statement[0]?.Principal.Federated).toContain(
                    "token.actions.githubusercontent.com",
                );
            });

            it("should use actual account ID in OIDC ARN when accountId is provided", () => {
                const accountId = String(
                    chance.integer({ min: 100000000000, max: 999999999999 }),
                );
                const config = buildConfig({ accountId });

                const result = builder.buildPlanTrust(config);

                expect(result.Statement[0]?.Principal.Federated).toBe(
                    `arn:aws:iam::${accountId}:oidc-provider/token.actions.githubusercontent.com`,
                );
            });

            it("should use aws-us-gov partition for GovCloud regions", () => {
                const accountId = String(
                    chance.integer({ min: 100000000000, max: 999999999999 }),
                );
                const config = buildConfig({
                    accountId,
                    region: "us-gov-west-1",
                });

                const result = builder.buildPlanTrust(config);

                expect(result.Statement[0]?.Principal.Federated).toBe(
                    `arn:aws-us-gov:iam::${accountId}:oidc-provider/token.actions.githubusercontent.com`,
                );
            });

            it("should use aws-cn partition for China regions", () => {
                const accountId = String(
                    chance.integer({ min: 100000000000, max: 999999999999 }),
                );
                const config = buildConfig({
                    accountId,
                    region: "cn-north-1",
                });

                const result = builder.buildPlanTrust(config);

                expect(result.Statement[0]?.Principal.Federated).toBe(
                    `arn:aws-cn:iam::${accountId}:oidc-provider/token.actions.githubusercontent.com`,
                );
            });

            it("should use aws partition for standard regions", () => {
                const accountId = String(
                    chance.integer({ min: 100000000000, max: 999999999999 }),
                );
                const config = buildConfig({
                    accountId,
                    region: "us-east-1",
                });

                const result = builder.buildPlanTrust(config);

                expect(result.Statement[0]?.Principal.Federated).toBe(
                    `arn:aws:iam::${accountId}:oidc-provider/token.actions.githubusercontent.com`,
                );
            });

            it("should use aws partition when region is null", () => {
                const accountId = String(
                    chance.integer({ min: 100000000000, max: 999999999999 }),
                );
                const config = buildConfig({ accountId, region: null });

                const result = builder.buildPlanTrust(config);

                expect(result.Statement[0]?.Principal.Federated).toBe(
                    `arn:aws:iam::${accountId}:oidc-provider/token.actions.githubusercontent.com`,
                );
            });

            it("should use Version 2012-10-17", () => {
                const config = buildConfig();

                const result = builder.buildPlanTrust(config);

                expect(result.Version).toBe("2012-10-17");
            });

            it("should use StringEquals as condition operator", () => {
                const config = buildConfig();

                const result = builder.buildPlanTrust(config);

                expect(result.Statement[0]?.Condition).toHaveProperty(
                    "StringEquals",
                );
            });
        });
    });

    describe("buildApplyTrust", () => {
        describe("given use_github_environments is false", () => {
            it("should use ref:refs/heads/main as subject", () => {
                const config = buildConfig({
                    useGithubEnvironments: false,
                });

                const result = builder.buildApplyTrust(config);

                const statement = result.Statement[0];
                expect(
                    statement?.Condition.StringEquals[
                        "token.actions.githubusercontent.com:sub"
                    ],
                ).toBe(
                    `repo:${config.githubOrg}/${config.githubRepo}:ref:refs/heads/main`,
                );
            });
        });

        describe("given use_github_environments is true with environment names", () => {
            it("should use environment subject", () => {
                const envName = chance.word();
                const config = buildConfig({
                    useGithubEnvironments: true,
                    githubEnvironmentNames: { prod: envName },
                });

                const result = builder.buildApplyTrust(config);

                const statement = result.Statement[0];
                expect(
                    statement?.Condition.StringEquals[
                        "token.actions.githubusercontent.com:sub"
                    ],
                ).toBe(
                    `repo:${config.githubOrg}/${config.githubRepo}:environment:${envName}`,
                );
            });
        });

        describe("given use_github_environments is true without environment names", () => {
            it("should use placeholder environment subject", () => {
                const config = buildConfig({
                    useGithubEnvironments: true,
                    githubEnvironmentNames: {},
                });

                const result = builder.buildApplyTrust(config);

                const statement = result.Statement[0];
                expect(
                    statement?.Condition.StringEquals[
                        "token.actions.githubusercontent.com:sub"
                    ],
                ).toContain("environment:");
            });
        });

        describe("given a standard configuration", () => {
            it("should include audience condition", () => {
                const config = buildConfig();

                const result = builder.buildApplyTrust(config);

                const statement = result.Statement[0];
                expect(
                    statement?.Condition.StringEquals[
                        "token.actions.githubusercontent.com:aud"
                    ],
                ).toBe("sts.amazonaws.com");
            });

            it("should use AssumeRoleWithWebIdentity action", () => {
                const config = buildConfig();

                const result = builder.buildApplyTrust(config);

                expect(result.Statement[0]?.Action).toBe(
                    "sts:AssumeRoleWithWebIdentity",
                );
            });

            it("should use actual account ID in OIDC ARN when accountId is provided", () => {
                const accountId = String(
                    chance.integer({ min: 100000000000, max: 999999999999 }),
                );
                const config = buildConfig({ accountId });

                const result = builder.buildApplyTrust(config);

                expect(result.Statement[0]?.Principal.Federated).toBe(
                    `arn:aws:iam::${accountId}:oidc-provider/token.actions.githubusercontent.com`,
                );
            });

            it("should use aws-us-gov partition for GovCloud regions", () => {
                const accountId = String(
                    chance.integer({ min: 100000000000, max: 999999999999 }),
                );
                const config = buildConfig({
                    accountId,
                    region: "us-gov-west-1",
                });

                const result = builder.buildApplyTrust(config);

                expect(result.Statement[0]?.Principal.Federated).toBe(
                    `arn:aws-us-gov:iam::${accountId}:oidc-provider/token.actions.githubusercontent.com`,
                );
            });

            it("should use aws-cn partition for China regions", () => {
                const accountId = String(
                    chance.integer({ min: 100000000000, max: 999999999999 }),
                );
                const config = buildConfig({
                    accountId,
                    region: "cn-north-1",
                });

                const result = builder.buildApplyTrust(config);

                expect(result.Statement[0]?.Principal.Federated).toBe(
                    `arn:aws-cn:iam::${accountId}:oidc-provider/token.actions.githubusercontent.com`,
                );
            });

            it("should reference OIDC provider with account_id placeholder when accountId is null", () => {
                const config = buildConfig({ accountId: null });

                const result = builder.buildApplyTrust(config);

                expect(result.Statement[0]?.Principal.Federated).toContain(
                    // biome-ignore lint/suspicious/noTemplateCurlyInString: testing IAM ARN placeholder
                    "${account_id}",
                );
            });
        });
    });
});
