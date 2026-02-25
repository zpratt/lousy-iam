import { describe, expect, it } from "vitest";
import type { ValidationViolation } from "../entities/validation-result.js";
import { createPolicyFixer } from "./fix-policy.js";

function buildPermissionDoc(overrides?: Record<string, unknown>) {
    return {
        Version: "2012-10-17" as const,
        Statement: [
            {
                Sid: "S3Read",
                Effect: "Allow" as const,
                Action: ["s3:GetObject"],
                Resource: "arn:aws:s3:::my-bucket/*",
            },
        ],
        ...overrides,
    };
}

function buildViolation(
    overrides: Partial<ValidationViolation>,
): ValidationViolation {
    return {
        rule_id: "LP-000",
        severity: "error",
        message: "Test violation",
        field: "Action",
        current_value: null,
        auto_fixable: true,
        fix_hint: "Fix it",
        ...overrides,
    };
}

describe("PolicyFixer", () => {
    const fixer = createPolicyFixer();

    describe("fixPermissionPolicy", () => {
        describe("given no auto-fixable violations", () => {
            it("should return the document unchanged", () => {
                // Arrange
                const doc = buildPermissionDoc();
                const violations: ValidationViolation[] = [];

                // Act
                const result = fixer.fixPermissionPolicy(doc, violations);

                // Assert
                expect(result).toBe(doc);
            });
        });

        describe("LP-040: missing Version", () => {
            it("should add Version 2012-10-17", () => {
                // Arrange
                const doc = {
                    Statement: [
                        {
                            Sid: "Test",
                            Effect: "Allow" as const,
                            Action: ["s3:GetObject"],
                            Resource: "*",
                        },
                    ],
                };
                const violations = [buildViolation({ rule_id: "LP-040" })];

                // Act
                const result = fixer.fixPermissionPolicy(doc, violations);

                // Assert
                expect(result.Version).toBe("2012-10-17");
            });
        });

        describe("LP-041: missing Sid", () => {
            it("should generate a Sid from the action service prefix", () => {
                // Arrange
                const doc = buildPermissionDoc({
                    Statement: [
                        {
                            Sid: "",
                            Effect: "Allow" as const,
                            Action: ["s3:GetObject"],
                            Resource: "*",
                        },
                    ],
                });
                const violations = [
                    buildViolation({
                        rule_id: "LP-041",
                        statement_index: 0,
                    }),
                ];

                // Act
                const result = fixer.fixPermissionPolicy(doc, violations);

                // Assert
                expect(result.Statement[0]?.Sid).toBe("S3Statement0");
            });
        });

        describe("LP-045: duplicate actions within statement", () => {
            it("should deduplicate actions", () => {
                // Arrange
                const doc = buildPermissionDoc({
                    Statement: [
                        {
                            Sid: "Test",
                            Effect: "Allow" as const,
                            Action: [
                                "s3:GetObject",
                                "s3:GetObject",
                                "s3:PutObject",
                            ],
                            Resource: "*",
                        },
                    ],
                });
                const violations = [
                    buildViolation({
                        rule_id: "LP-045",
                        statement_index: 0,
                    }),
                ];

                // Act
                const result = fixer.fixPermissionPolicy(doc, violations);

                // Assert
                expect(result.Statement[0]?.Action).toEqual([
                    "s3:GetObject",
                    "s3:PutObject",
                ]);
            });
        });

        describe("LP-046: duplicate actions across statements", () => {
            it("should remove action from less specific statement", () => {
                // Arrange
                const doc = buildPermissionDoc({
                    Statement: [
                        {
                            Sid: "Specific",
                            Effect: "Allow" as const,
                            Action: ["s3:GetObject"],
                            Resource: "arn:aws:s3:::bucket/*",
                        },
                        {
                            Sid: "Broad",
                            Effect: "Allow" as const,
                            Action: ["s3:GetObject"],
                            Resource: "*",
                        },
                    ],
                });
                const violations = [
                    buildViolation({
                        rule_id: "LP-046",
                        fix_data: {
                            action: "s3:GetObject",
                            statement_indices: [0, 1],
                        },
                    }),
                ];

                // Act
                const result = fixer.fixPermissionPolicy(doc, violations);

                // Assert
                expect(result.Statement[0]?.Action).toContain("s3:GetObject");
            });
        });

        describe("LP-021: iam:PassRole without PassedToService", () => {
            it("should add PassedToService condition", () => {
                // Arrange
                const doc = buildPermissionDoc({
                    Statement: [
                        {
                            Sid: "PassRole",
                            Effect: "Allow" as const,
                            Action: ["iam:PassRole"],
                            Resource: "arn:aws:iam::*:role/*",
                        },
                    ],
                });
                const violations = [
                    buildViolation({
                        rule_id: "LP-021",
                        statement_index: 0,
                    }),
                ];

                // Act
                const result = fixer.fixPermissionPolicy(doc, violations);

                // Assert
                const condition = result.Statement[0]?.Condition;
                expect(condition).toBeDefined();
                const stringEquals = (
                    condition as Record<string, Record<string, unknown>>
                )?.StringEquals;
                expect(stringEquals?.["iam:PassedToService"]).toBeDefined();
            });
        });

        describe("LP-024: region-scoped without RequestedRegion", () => {
            it("should add RequestedRegion condition", () => {
                // Arrange
                const doc = buildPermissionDoc({
                    Statement: [
                        {
                            Sid: "Ec2",
                            Effect: "Allow" as const,
                            Action: ["ec2:DescribeInstances"],
                            Resource: "*",
                        },
                    ],
                });
                const violations = [
                    buildViolation({
                        rule_id: "LP-024",
                        statement_index: 0,
                    }),
                ];

                // Act
                const result = fixer.fixPermissionPolicy(doc, violations);

                // Assert
                const condition = result.Statement[0]?.Condition;
                const stringEquals = (
                    condition as Record<string, Record<string, unknown>>
                )?.StringEquals;
                expect(stringEquals?.["aws:RequestedRegion"]).toBeDefined();
            });
        });

        describe("given idempotent application", () => {
            it("should produce same result when applied twice", () => {
                // Arrange
                const doc = buildPermissionDoc({
                    Statement: [
                        {
                            Sid: "",
                            Effect: "Allow" as const,
                            Action: ["s3:GetObject", "s3:GetObject"],
                            Resource: "*",
                        },
                    ],
                });
                const violations = [
                    buildViolation({ rule_id: "LP-041", statement_index: 0 }),
                    buildViolation({ rule_id: "LP-045", statement_index: 0 }),
                ];

                // Act
                const first = fixer.fixPermissionPolicy(doc, violations);
                const second = fixer.fixPermissionPolicy(first, violations);

                // Assert
                expect(second.Statement[0]?.Sid).toBe(first.Statement[0]?.Sid);
                expect(second.Statement[0]?.Action).toEqual(
                    first.Statement[0]?.Action,
                );
            });
        });
    });

    describe("fixTrustPolicy", () => {
        describe("LP-031: missing aud condition", () => {
            it("should add aud condition", () => {
                // Arrange
                const doc = {
                    Version: "2012-10-17" as const,
                    Statement: [
                        {
                            Sid: "Test",
                            Effect: "Allow" as const,
                            Principal: {
                                Federated:
                                    "arn:aws:iam::123:oidc-provider/test",
                            },
                            Action: "sts:AssumeRoleWithWebIdentity" as const,
                            Condition: {
                                StringEquals: {
                                    "token.actions.githubusercontent.com:sub":
                                        "repo:org/repo:ref:refs/heads/main",
                                },
                            },
                        },
                    ],
                };
                const violations = [
                    buildViolation({
                        rule_id: "LP-031",
                        statement_index: 0,
                    }),
                ];

                // Act
                const result = fixer.fixTrustPolicy(doc, violations);

                // Assert
                const cond = result.Statement[0]?.Condition;
                expect(
                    (cond as Record<string, Record<string, unknown>>)
                        ?.StringEquals?.[
                        "token.actions.githubusercontent.com:aud"
                    ],
                ).toBe("sts.amazonaws.com");
            });
        });

        describe("LP-034: StringLike without wildcards", () => {
            it("should move value to StringEquals", () => {
                // Arrange
                const doc = {
                    Version: "2012-10-17" as const,
                    Statement: [
                        {
                            Sid: "Test",
                            Effect: "Allow" as const,
                            Principal: {
                                Federated:
                                    "arn:aws:iam::123:oidc-provider/test",
                            },
                            Action: "sts:AssumeRoleWithWebIdentity" as const,
                            Condition: {
                                StringLike: {
                                    "token.actions.githubusercontent.com:aud":
                                        "sts.amazonaws.com",
                                },
                                StringEquals: {
                                    "token.actions.githubusercontent.com:sub":
                                        "repo:org/repo:ref:refs/heads/main",
                                },
                            },
                        },
                    ],
                };
                const violations = [
                    buildViolation({
                        rule_id: "LP-034",
                        statement_index: 0,
                        fix_data: {
                            condition_key:
                                "token.actions.githubusercontent.com:aud",
                            condition_value: "sts.amazonaws.com",
                        },
                    }),
                ];

                // Act
                const result = fixer.fixTrustPolicy(doc, violations);

                // Assert
                const cond = result.Statement[0]?.Condition as Record<
                    string,
                    Record<string, unknown>
                >;
                expect(
                    cond?.StringEquals?.[
                        "token.actions.githubusercontent.com:aud"
                    ],
                ).toBe("sts.amazonaws.com");
                expect(cond?.StringLike).toBeUndefined();
            });
        });

        describe("given no auto-fixable violations", () => {
            it("should return document unchanged", () => {
                // Arrange
                const doc = {
                    Version: "2012-10-17" as const,
                    Statement: [
                        {
                            Sid: "Test",
                            Effect: "Allow" as const,
                            Principal: {
                                Federated:
                                    "arn:aws:iam::123:oidc-provider/test",
                            },
                            Action: "sts:AssumeRoleWithWebIdentity" as const,
                            Condition: {
                                StringEquals: {
                                    "token.actions.githubusercontent.com:aud":
                                        "sts.amazonaws.com",
                                    "token.actions.githubusercontent.com:sub":
                                        "repo:org/repo:ref:refs/heads/main",
                                },
                            },
                        },
                    ],
                };

                // Act
                const result = fixer.fixTrustPolicy(doc, []);

                // Assert
                expect(result).toBe(doc);
            });
        });
    });
});
