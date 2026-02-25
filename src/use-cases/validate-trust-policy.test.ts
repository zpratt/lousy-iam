import Chance from "chance";
import { describe, expect, it } from "vitest";
import { createTrustPolicyValidator } from "./validate-trust-policy.js";

const chance = new Chance();

function buildTrustStatement(overrides?: Record<string, unknown>) {
    const org = chance.word();
    const repo = chance.word();
    return {
        Sid: "AllowGitHubOIDC",
        Effect: "Allow" as const,
        Principal: {
            Federated:
                // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM ARN placeholder
                "arn:aws:iam::${account_id}:oidc-provider/token.actions.githubusercontent.com",
        },
        Action: "sts:AssumeRoleWithWebIdentity",
        Condition: {
            StringEquals: {
                "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
                "token.actions.githubusercontent.com:sub": `repo:${org}/${repo}:ref:refs/heads/main`,
            },
        },
        ...overrides,
    };
}

function buildTrustDocument(
    statements?: ReturnType<typeof buildTrustStatement>[],
) {
    return {
        Version: "2012-10-17" as const,
        Statement: statements ?? [buildTrustStatement()],
    };
}

describe("ValidateTrustPolicy", () => {
    const validator = createTrustPolicyValidator();

    describe("given a compliant apply trust policy", () => {
        it("should return no violations", () => {
            // Arrange
            const doc = buildTrustDocument();

            // Act
            const result = validator.validate(doc, "apply");

            // Assert
            expect(result).toHaveLength(0);
        });
    });

    describe("given a compliant plan trust policy", () => {
        it("should return no violations", () => {
            // Arrange
            const org = chance.word();
            const repo = chance.word();
            const doc = buildTrustDocument([
                buildTrustStatement({
                    Condition: {
                        StringEquals: {
                            "token.actions.githubusercontent.com:aud":
                                "sts.amazonaws.com",
                            "token.actions.githubusercontent.com:sub": `repo:${org}/${repo}:pull_request`,
                        },
                    },
                }),
            ]);

            // Act
            const result = validator.validate(doc, "plan");

            // Assert
            expect(result).toHaveLength(0);
        });
    });

    describe("LP-030: must use sts:AssumeRoleWithWebIdentity", () => {
        it("should report error for wrong action", () => {
            // Arrange
            const doc = buildTrustDocument([
                buildTrustStatement({ Action: "sts:AssumeRole" }),
            ]);

            // Act
            const result = validator.validate(doc, "apply");

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-030");
            expect(violation).toBeDefined();
            expect(violation?.severity).toBe("error");
        });
    });

    describe("LP-031: must include aud condition", () => {
        it("should report auto-fixable error when aud is missing", () => {
            // Arrange
            const org = chance.word();
            const repo = chance.word();
            const doc = buildTrustDocument([
                buildTrustStatement({
                    Condition: {
                        StringEquals: {
                            "token.actions.githubusercontent.com:sub": `repo:${org}/${repo}:ref:refs/heads/main`,
                        },
                    },
                }),
            ]);

            // Act
            const result = validator.validate(doc, "apply");

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-031");
            expect(violation).toBeDefined();
            expect(violation?.auto_fixable).toBe(true);
        });
    });

    describe("LP-032: must include sub condition", () => {
        it("should report error when sub is missing", () => {
            // Arrange
            const doc = buildTrustDocument([
                buildTrustStatement({
                    Condition: {
                        StringEquals: {
                            "token.actions.githubusercontent.com:aud":
                                "sts.amazonaws.com",
                        },
                    },
                }),
            ]);

            // Act
            const result = validator.validate(doc, "apply");

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-032");
            expect(violation).toBeDefined();
            expect(violation?.severity).toBe("error");
        });
    });

    describe("LP-033: org-wide wildcard sub", () => {
        it("should report error for org-wide wildcard", () => {
            // Arrange
            const doc = buildTrustDocument([
                buildTrustStatement({
                    Condition: {
                        StringEquals: {
                            "token.actions.githubusercontent.com:aud":
                                "sts.amazonaws.com",
                            "token.actions.githubusercontent.com:sub":
                                "repo:my-org/*:*",
                        },
                    },
                }),
            ]);

            // Act
            const result = validator.validate(doc, "apply");

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-033");
            expect(violation).toBeDefined();
            expect(violation?.severity).toBe("error");
        });
    });

    describe("LP-034: StringLike without wildcards", () => {
        it("should report auto-fixable warning when StringLike used without wildcards", () => {
            // Arrange
            const org = chance.word();
            const repo = chance.word();
            const doc = buildTrustDocument([
                buildTrustStatement({
                    Condition: {
                        StringLike: {
                            "token.actions.githubusercontent.com:aud":
                                "sts.amazonaws.com",
                            "token.actions.githubusercontent.com:sub": `repo:${org}/${repo}:ref:refs/heads/main`,
                        },
                    },
                }),
            ]);

            // Act
            const result = validator.validate(doc, "apply");

            // Assert
            const violations = result.filter((v) => v.rule_id === "LP-034");
            expect(violations.length).toBeGreaterThan(0);
            expect(violations[0]?.auto_fixable).toBe(true);
        });

        it("should not report when StringLike has wildcards", () => {
            // Arrange
            const org = chance.word();
            const repo = chance.word();
            const doc = buildTrustDocument([
                buildTrustStatement({
                    Condition: {
                        StringEquals: {
                            "token.actions.githubusercontent.com:aud":
                                "sts.amazonaws.com",
                        },
                        StringLike: {
                            "token.actions.githubusercontent.com:sub": `repo:${org}/${repo}:*`,
                        },
                    },
                }),
            ]);

            // Act
            const result = validator.validate(doc, "apply");

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-034");
            expect(violation).toBeUndefined();
        });
    });

    describe("LP-035: plan role must use pull_request subject", () => {
        it("should report error when plan role uses ref/main", () => {
            // Arrange
            const doc = buildTrustDocument();

            // Act
            const result = validator.validate(doc, "plan");

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-035");
            expect(violation).toBeDefined();
            expect(violation?.severity).toBe("error");
        });
    });

    describe("LP-036: apply role must use ref/main or environment", () => {
        it("should report error when apply role uses pull_request", () => {
            // Arrange
            const org = chance.word();
            const repo = chance.word();
            const doc = buildTrustDocument([
                buildTrustStatement({
                    Condition: {
                        StringEquals: {
                            "token.actions.githubusercontent.com:aud":
                                "sts.amazonaws.com",
                            "token.actions.githubusercontent.com:sub": `repo:${org}/${repo}:pull_request`,
                        },
                    },
                }),
            ]);

            // Act
            const result = validator.validate(doc, "apply");

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-036");
            expect(violation).toBeDefined();
            expect(violation?.severity).toBe("error");
        });

        it("should not report when apply role uses environment", () => {
            // Arrange
            const org = chance.word();
            const repo = chance.word();
            const envName = chance.word();
            const doc = buildTrustDocument([
                buildTrustStatement({
                    Condition: {
                        StringEquals: {
                            "token.actions.githubusercontent.com:aud":
                                "sts.amazonaws.com",
                            "token.actions.githubusercontent.com:sub": `repo:${org}/${repo}:environment:${envName}`,
                        },
                    },
                }),
            ]);

            // Act
            const result = validator.validate(doc, "apply");

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-036");
            expect(violation).toBeUndefined();
        });
    });
});
