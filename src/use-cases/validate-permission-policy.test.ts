import Chance from "chance";
import { describe, expect, it } from "vitest";
import { createPermissionPolicyValidator } from "./validate-permission-policy.js";

const chance = new Chance();

function buildStatement(overrides?: Record<string, unknown>) {
    return {
        Sid: chance.word(),
        Effect: "Allow" as const,
        Action: ["s3:GetObject"],
        Resource: `arn:aws:s3:::${chance.word()}/*`,
        ...overrides,
    };
}

function buildPolicyDocument(statements?: ReturnType<typeof buildStatement>[]) {
    return {
        Version: "2012-10-17" as const,
        Statement: statements ?? [buildStatement()],
    };
}

const EMPTY_UNSCOPED = new Set<string>();
const DEFAULT_ROLE = chance.word();

describe("ValidatePermissionPolicy", () => {
    const validator = createPermissionPolicyValidator();

    describe("given a compliant policy", () => {
        it("should return no violations", () => {
            // Arrange
            const doc = buildPolicyDocument();

            // Act
            const result = validator.validate(doc, {
                unscopedActions: EMPTY_UNSCOPED,
                roleName: DEFAULT_ROLE,
            });

            // Assert
            expect(result).toHaveLength(0);
        });
    });

    describe("LP-001: global wildcard action", () => {
        it("should report error when Action contains *", () => {
            // Arrange
            const doc = buildPolicyDocument([
                buildStatement({ Action: ["*"] }),
            ]);

            // Act
            const result = validator.validate(doc, {
                unscopedActions: EMPTY_UNSCOPED,
                roleName: DEFAULT_ROLE,
            });

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-001");
            expect(violation).toBeDefined();
            expect(violation?.severity).toBe("error");
        });
    });

    describe("LP-002: service-level wildcard", () => {
        it("should report error for s3:*", () => {
            // Arrange
            const doc = buildPolicyDocument([
                buildStatement({ Action: ["s3:*"] }),
            ]);

            // Act
            const result = validator.validate(doc, {
                unscopedActions: EMPTY_UNSCOPED,
                roleName: DEFAULT_ROLE,
            });

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-002");
            expect(violation).toBeDefined();
            expect(violation?.severity).toBe("error");
        });
    });

    describe("LP-003: NotAction usage", () => {
        it("should report warning when NotAction is present", () => {
            // Arrange
            const doc = buildPolicyDocument([
                buildStatement({ NotAction: ["s3:DeleteBucket"] }),
            ]);

            // Act
            const result = validator.validate(doc, {
                unscopedActions: EMPTY_UNSCOPED,
                roleName: DEFAULT_ROLE,
            });

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-003");
            expect(violation).toBeDefined();
            expect(violation?.severity).toBe("warning");
        });
    });

    describe("LP-004: deny-listed actions", () => {
        it("should report error for iam:CreateUser", () => {
            // Arrange
            const doc = buildPolicyDocument([
                buildStatement({ Action: ["iam:CreateUser"] }),
            ]);

            // Act
            const result = validator.validate(doc, {
                unscopedActions: EMPTY_UNSCOPED,
                roleName: DEFAULT_ROLE,
            });

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-004");
            expect(violation).toBeDefined();
            expect(violation?.severity).toBe("error");
        });

        it("should report error for unscoped sts:AssumeRole", () => {
            // Arrange
            const doc = buildPolicyDocument([
                buildStatement({
                    Action: ["sts:AssumeRole"],
                    Resource: "*",
                }),
            ]);

            // Act
            const result = validator.validate(doc, {
                unscopedActions: EMPTY_UNSCOPED,
                roleName: DEFAULT_ROLE,
            });

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-004");
            expect(violation).toBeDefined();
        });
    });

    describe("LP-005: overly broad actions", () => {
        it("should report warning for ec2:*", () => {
            // Arrange
            const doc = buildPolicyDocument([
                buildStatement({ Action: ["ec2:*"] }),
            ]);

            // Act
            const result = validator.validate(doc, {
                unscopedActions: EMPTY_UNSCOPED,
                roleName: DEFAULT_ROLE,
            });

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-005");
            expect(violation).toBeDefined();
            expect(violation?.severity).toBe("warning");
        });
    });

    describe("LP-010: Resource * on scoped actions", () => {
        it("should report error when Resource is * on non-unscoped action", () => {
            // Arrange
            const doc = buildPolicyDocument([
                buildStatement({
                    Action: ["s3:CreateBucket"],
                    Resource: "*",
                }),
            ]);

            // Act
            const result = validator.validate(doc, {
                unscopedActions: EMPTY_UNSCOPED,
                roleName: DEFAULT_ROLE,
            });

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-010");
            expect(violation).toBeDefined();
            expect(violation?.severity).toBe("error");
        });
    });

    describe("LP-011: Resource * on unscoped actions", () => {
        it("should report warning on unscoped action with Resource *", () => {
            // Arrange
            const unscopedActions = new Set(["sts:GetCallerIdentity"]);
            const doc = buildPolicyDocument([
                buildStatement({
                    Action: ["sts:GetCallerIdentity"],
                    Resource: "*",
                }),
            ]);

            // Act
            const result = validator.validate(doc, {
                unscopedActions,
                roleName: DEFAULT_ROLE,
            });

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-011");
            expect(violation).toBeDefined();
            expect(violation?.severity).toBe("warning");
        });
    });

    describe("LP-012: hardcoded account ID", () => {
        it("should report error when ARN contains account ID", () => {
            // Arrange
            const doc = buildPolicyDocument([
                buildStatement({
                    Resource: "arn:aws:s3:us-east-1:123456789012:bucket/test",
                }),
            ]);

            // Act
            const result = validator.validate(doc, {
                unscopedActions: EMPTY_UNSCOPED,
                roleName: DEFAULT_ROLE,
            });

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-012");
            expect(violation).toBeDefined();
            expect(violation?.severity).toBe("error");
        });
    });

    describe("LP-013: wildcard resource segment without conditions", () => {
        it("should report warning when resource segment is * and no conditions", () => {
            // Arrange
            const doc = buildPolicyDocument([
                buildStatement({
                    Resource: "arn:aws:s3:us-east-1::*",
                }),
            ]);

            // Act
            const result = validator.validate(doc, {
                unscopedActions: EMPTY_UNSCOPED,
                roleName: DEFAULT_ROLE,
            });

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-013");
            expect(violation).toBeDefined();
            expect(violation?.severity).toBe("warning");
        });

        it("should not report when conditions are present", () => {
            // Arrange
            const doc = buildPolicyDocument([
                buildStatement({
                    Resource: "arn:aws:s3:us-east-1::*",
                    Condition: {
                        StringEquals: { "aws:RequestedRegion": "us-east-1" },
                    },
                }),
            ]);

            // Act
            const result = validator.validate(doc, {
                unscopedActions: EMPTY_UNSCOPED,
                roleName: DEFAULT_ROLE,
            });

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-013");
            expect(violation).toBeUndefined();
        });
    });

    describe("LP-020: iam:PassRole with Resource *", () => {
        it("should report error when iam:PassRole has Resource *", () => {
            // Arrange
            const doc = buildPolicyDocument([
                buildStatement({
                    Action: ["iam:PassRole"],
                    Resource: "*",
                }),
            ]);

            // Act
            const result = validator.validate(doc, {
                unscopedActions: EMPTY_UNSCOPED,
                roleName: DEFAULT_ROLE,
            });

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-020");
            expect(violation).toBeDefined();
            expect(violation?.severity).toBe("error");
        });
    });

    describe("LP-021: iam:PassRole without PassedToService", () => {
        it("should report auto-fixable error when condition missing", () => {
            // Arrange
            const doc = buildPolicyDocument([
                buildStatement({
                    Action: ["iam:PassRole"],
                    Resource: "arn:aws:iam::*:role/my-role",
                }),
            ]);

            // Act
            const result = validator.validate(doc, {
                unscopedActions: EMPTY_UNSCOPED,
                roleName: DEFAULT_ROLE,
            });

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-021");
            expect(violation).toBeDefined();
            expect(violation?.auto_fixable).toBe(true);
        });

        it("should not report when PassedToService condition exists", () => {
            // Arrange
            const doc = buildPolicyDocument([
                buildStatement({
                    Action: ["iam:PassRole"],
                    Resource: "arn:aws:iam::*:role/my-role",
                    Condition: {
                        StringEquals: {
                            "iam:PassedToService": "ecs-tasks.amazonaws.com",
                        },
                    },
                }),
            ]);

            // Act
            const result = validator.validate(doc, {
                unscopedActions: EMPTY_UNSCOPED,
                roleName: DEFAULT_ROLE,
            });

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-021");
            expect(violation).toBeUndefined();
        });
    });

    describe("LP-022: iam:CreateRole without PermissionsBoundary", () => {
        it("should report error when condition missing", () => {
            // Arrange
            const doc = buildPolicyDocument([
                buildStatement({
                    Action: ["iam:CreateRole"],
                    Resource: "arn:aws:iam::*:role/my-*",
                }),
            ]);

            // Act
            const result = validator.validate(doc, {
                unscopedActions: EMPTY_UNSCOPED,
                roleName: DEFAULT_ROLE,
            });

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-022");
            expect(violation).toBeDefined();
            expect(violation?.severity).toBe("error");
        });
    });

    describe("LP-023: iam:CreateServiceLinkedRole without AWSServiceName", () => {
        it("should report auto-fixable error when condition missing", () => {
            // Arrange
            const doc = buildPolicyDocument([
                buildStatement({
                    Action: ["iam:CreateServiceLinkedRole"],
                    Resource: "arn:aws:iam::*:role/*",
                }),
            ]);

            // Act
            const result = validator.validate(doc, {
                unscopedActions: EMPTY_UNSCOPED,
                roleName: DEFAULT_ROLE,
            });

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-023");
            expect(violation).toBeDefined();
            expect(violation?.auto_fixable).toBe(true);
        });
    });

    describe("LP-024: region-scoped service with Resource * without RequestedRegion", () => {
        it("should report auto-fixable warning", () => {
            // Arrange
            const doc = buildPolicyDocument([
                buildStatement({
                    Action: ["ec2:DescribeInstances"],
                    Resource: "*",
                }),
            ]);

            // Act
            const result = validator.validate(doc, {
                unscopedActions: EMPTY_UNSCOPED,
                roleName: DEFAULT_ROLE,
            });

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-024");
            expect(violation).toBeDefined();
            expect(violation?.auto_fixable).toBe(true);
        });
    });

    describe("LP-025: creation action without RequestTag", () => {
        it("should report auto-fixable warning for create actions", () => {
            // Arrange
            const doc = buildPolicyDocument([
                buildStatement({
                    Action: ["s3:CreateBucket"],
                }),
            ]);

            // Act
            const result = validator.validate(doc, {
                unscopedActions: EMPTY_UNSCOPED,
                roleName: DEFAULT_ROLE,
            });

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-025");
            expect(violation).toBeDefined();
            expect(violation?.auto_fixable).toBe(true);
        });
    });

    describe("LP-040: missing Version", () => {
        it("should report auto-fixable error when Version is missing", () => {
            // Arrange
            const doc = {
                Statement: [buildStatement()],
            };

            // Act
            const result = validator.validate(doc, {
                unscopedActions: EMPTY_UNSCOPED,
                roleName: DEFAULT_ROLE,
            });

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-040");
            expect(violation).toBeDefined();
            expect(violation?.auto_fixable).toBe(true);
        });
    });

    describe("LP-041: missing Sid", () => {
        it("should report auto-fixable error when Sid is empty", () => {
            // Arrange
            const doc = buildPolicyDocument([buildStatement({ Sid: "" })]);

            // Act
            const result = validator.validate(doc, {
                unscopedActions: EMPTY_UNSCOPED,
                roleName: DEFAULT_ROLE,
            });

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-041");
            expect(violation).toBeDefined();
            expect(violation?.auto_fixable).toBe(true);
        });
    });

    describe("LP-043: statement with more than 20 actions", () => {
        it("should report warning when actions exceed 20", () => {
            // Arrange
            const actions = Array.from(
                { length: 21 },
                (_, i) => `s3:Action${i}`,
            );
            const doc = buildPolicyDocument([
                buildStatement({ Action: actions }),
            ]);

            // Act
            const result = validator.validate(doc, {
                unscopedActions: EMPTY_UNSCOPED,
                roleName: DEFAULT_ROLE,
            });

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-043");
            expect(violation).toBeDefined();
            expect(violation?.severity).toBe("warning");
        });
    });

    describe("LP-045: duplicate actions within statement", () => {
        it("should report auto-fixable error for duplicate actions", () => {
            // Arrange
            const doc = buildPolicyDocument([
                buildStatement({
                    Action: ["s3:GetObject", "s3:GetObject"],
                }),
            ]);

            // Act
            const result = validator.validate(doc, {
                unscopedActions: EMPTY_UNSCOPED,
                roleName: DEFAULT_ROLE,
            });

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-045");
            expect(violation).toBeDefined();
            expect(violation?.auto_fixable).toBe(true);
        });
    });

    describe("LP-046: duplicate actions across statements", () => {
        it("should report auto-fixable warning for cross-statement duplicates", () => {
            // Arrange
            const doc = buildPolicyDocument([
                buildStatement({ Action: ["s3:GetObject"] }),
                buildStatement({ Action: ["s3:GetObject"] }),
            ]);

            // Act
            const result = validator.validate(doc, {
                unscopedActions: EMPTY_UNSCOPED,
                roleName: DEFAULT_ROLE,
            });

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-046");
            expect(violation).toBeDefined();
            expect(violation?.auto_fixable).toBe(true);
        });
    });

    describe("LP-050: self-modifying PutRolePolicy/AttachRolePolicy", () => {
        it("should report error when targeting own role", () => {
            // Arrange
            const roleName = "my-deploy-role";
            const doc = buildPolicyDocument([
                buildStatement({
                    Action: ["iam:PutRolePolicy"],
                    Resource: `arn:aws:iam::123:role/${roleName}`,
                }),
            ]);

            // Act
            const result = validator.validate(doc, {
                unscopedActions: EMPTY_UNSCOPED,
                roleName,
            });

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-050");
            expect(violation).toBeDefined();
            expect(violation?.severity).toBe("error");
        });
    });

    describe("LP-051: CreatePolicyVersion on own policies", () => {
        it("should report error when targeting own policies", () => {
            // Arrange
            const roleName = "my-deploy-role";
            const doc = buildPolicyDocument([
                buildStatement({
                    Action: ["iam:CreatePolicyVersion"],
                    Resource: "*",
                }),
            ]);

            // Act
            const result = validator.validate(doc, {
                unscopedActions: EMPTY_UNSCOPED,
                roleName,
            });

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-051");
            expect(violation).toBeDefined();
            expect(violation?.severity).toBe("error");
        });
    });

    describe("LP-052: CreateRole + unscoped PassRole", () => {
        it("should report error when both exist with Resource *", () => {
            // Arrange
            const doc = buildPolicyDocument([
                buildStatement({
                    Action: ["iam:CreateRole", "iam:PassRole"],
                    Resource: "*",
                }),
            ]);

            // Act
            const result = validator.validate(doc, {
                unscopedActions: EMPTY_UNSCOPED,
                roleName: DEFAULT_ROLE,
            });

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-052");
            expect(violation).toBeDefined();
        });
    });

    describe("LP-053: Put*Policy/Attach*Policy without resource scoping", () => {
        it("should report warning for unscoped policy modification", () => {
            // Arrange
            const doc = buildPolicyDocument([
                buildStatement({
                    Action: ["iam:PutRolePolicy"],
                    Resource: "*",
                }),
            ]);

            // Act
            const result = validator.validate(doc, {
                unscopedActions: EMPTY_UNSCOPED,
                roleName: "different-role",
            });

            // Assert
            const violation = result.find((v) => v.rule_id === "LP-053");
            expect(violation).toBeDefined();
            expect(violation?.severity).toBe("warning");
        });
    });
});
