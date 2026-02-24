import Chance from "chance";
import { describe, expect, it, vi } from "vitest";
import type { ValidationViolation } from "../entities/validation-result.js";
import { createValidateAndFixOrchestrator } from "./validate-and-fix.js";

const chance = new Chance();

function buildFormulationOutput(roleName?: string) {
    const prefix = roleName ?? chance.word();
    return {
        roles: [
            {
                role_name: `${prefix}-github-apply`,
                role_path: "/",
                description: chance.sentence(),
                max_session_duration: 3600,
                permission_boundary_arn: null,
                trust_policy: {
                    Version: "2012-10-17" as const,
                    Statement: [
                        {
                            Sid: "AllowGitHubOIDC",
                            Effect: "Allow" as const,
                            Principal: {
                                Federated:
                                    // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM ARN placeholder
                                    "arn:aws:iam::${account_id}:oidc-provider/token.actions.githubusercontent.com",
                            },
                            Action: "sts:AssumeRoleWithWebIdentity" as const,
                            Condition: {
                                StringEquals: {
                                    "token.actions.githubusercontent.com:aud":
                                        "sts.amazonaws.com",
                                    "token.actions.githubusercontent.com:sub": `repo:org/repo:ref:refs/heads/main`,
                                },
                            },
                        },
                    ],
                },
                permission_policies: [
                    {
                        policy_name: `${prefix}-permissions`,
                        policy_document: {
                            Version: "2012-10-17" as const,
                            Statement: [
                                {
                                    Sid: "S3Read",
                                    Effect: "Allow" as const,
                                    Action: ["s3:GetBucketLocation"],
                                    Resource: `arn:aws:s3:::${prefix}-*`,
                                },
                            ],
                        },
                        estimated_size_bytes: 256,
                    },
                ],
            },
        ],
        template_variables: {
            account_id: "Target AWS account ID",
        },
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
        auto_fixable: false,
        fix_hint: "Fix it",
        ...overrides,
    };
}

describe("ValidateAndFixOrchestrator", () => {
    describe("given clean policies with no violations", () => {
        it("should return valid output with zero iterations", () => {
            // Arrange
            const permissionValidator = {
                validate: vi.fn().mockReturnValue([]),
            };
            const trustValidator = { validate: vi.fn().mockReturnValue([]) };
            const fixer = {
                fixPermissionPolicy: vi.fn(),
                fixTrustPolicy: vi.fn(),
            };
            const orchestrator = createValidateAndFixOrchestrator({
                permissionValidator,
                trustValidator,
                fixer,
                unscopedActions: new Set(),
            });

            // Act
            const result = orchestrator.execute(buildFormulationOutput());

            // Assert
            expect(result.valid).toBe(true);
            expect(result.fix_iterations).toBe(0);
            expect(fixer.fixPermissionPolicy).not.toHaveBeenCalled();
        });
    });

    describe("given non-fixable violations", () => {
        it("should return invalid output without calling fixer", () => {
            // Arrange
            const violation = buildViolation({
                rule_id: "LP-001",
                auto_fixable: false,
            });
            const permissionValidator = {
                validate: vi.fn().mockReturnValue([violation]),
            };
            const trustValidator = { validate: vi.fn().mockReturnValue([]) };
            const fixer = {
                fixPermissionPolicy: vi.fn(),
                fixTrustPolicy: vi.fn(),
            };
            const orchestrator = createValidateAndFixOrchestrator({
                permissionValidator,
                trustValidator,
                fixer,
                unscopedActions: new Set(),
            });

            // Act
            const result = orchestrator.execute(buildFormulationOutput());

            // Assert
            expect(result.valid).toBe(false);
            expect(fixer.fixPermissionPolicy).not.toHaveBeenCalled();
        });
    });

    describe("given auto-fixable violations resolved in one iteration", () => {
        it("should fix and re-validate to produce valid output", () => {
            // Arrange
            const violation = buildViolation({
                rule_id: "LP-045",
                auto_fixable: true,
                statement_index: 0,
            });
            const permissionValidator = {
                validate: vi
                    .fn()
                    .mockReturnValueOnce([violation])
                    .mockReturnValue([]),
            };
            const trustValidator = { validate: vi.fn().mockReturnValue([]) };
            const fixer = {
                fixPermissionPolicy: vi.fn().mockImplementation((doc) => doc),
                fixTrustPolicy: vi.fn(),
            };
            const orchestrator = createValidateAndFixOrchestrator({
                permissionValidator,
                trustValidator,
                fixer,
                unscopedActions: new Set(),
            });

            // Act
            const result = orchestrator.execute(buildFormulationOutput());

            // Assert
            expect(result.valid).toBe(true);
            expect(fixer.fixPermissionPolicy).toHaveBeenCalledOnce();
        });
    });

    describe("given oscillating violations", () => {
        it("should halt when same fingerprint detected", () => {
            // Arrange
            const violation = buildViolation({
                rule_id: "LP-045",
                auto_fixable: true,
                statement_index: 0,
            });
            const permissionValidator = {
                validate: vi.fn().mockReturnValue([violation]),
            };
            const trustValidator = { validate: vi.fn().mockReturnValue([]) };
            const fixer = {
                fixPermissionPolicy: vi.fn().mockImplementation((doc) => doc),
                fixTrustPolicy: vi.fn(),
            };
            const orchestrator = createValidateAndFixOrchestrator({
                permissionValidator,
                trustValidator,
                fixer,
                unscopedActions: new Set(),
            });

            // Act
            const result = orchestrator.execute(buildFormulationOutput());

            // Assert
            expect(result.valid).toBe(false);
            expect(fixer.fixPermissionPolicy).toHaveBeenCalledOnce();
        });
    });

    describe("given multiple roles", () => {
        it("should validate each role independently", () => {
            // Arrange
            const planRole = buildFormulationOutput("plan-role").roles[0];
            const applyRole = buildFormulationOutput("apply-role").roles[0];
            if (!planRole || !applyRole) {
                throw new Error("Expected roles to exist");
            }
            const input = {
                roles: [planRole, applyRole],
                template_variables: {},
            };
            const permissionValidator = {
                validate: vi.fn().mockReturnValue([]),
            };
            const trustValidator = { validate: vi.fn().mockReturnValue([]) };
            const fixer = {
                fixPermissionPolicy: vi.fn(),
                fixTrustPolicy: vi.fn(),
            };
            const orchestrator = createValidateAndFixOrchestrator({
                permissionValidator,
                trustValidator,
                fixer,
                unscopedActions: new Set(),
            });

            // Act
            const result = orchestrator.execute(input);

            // Assert
            expect(result.role_results).toHaveLength(2);
            expect(result.valid).toBe(true);
        });
    });

    describe("given trust policy violations", () => {
        it("should report trust policy results separately", () => {
            // Arrange
            const trustViolation = buildViolation({
                rule_id: "LP-030",
                severity: "error",
                auto_fixable: false,
            });
            const permissionValidator = {
                validate: vi.fn().mockReturnValue([]),
            };
            const trustValidator = {
                validate: vi.fn().mockReturnValue([trustViolation]),
            };
            const fixer = {
                fixPermissionPolicy: vi.fn(),
                fixTrustPolicy: vi.fn(),
            };
            const orchestrator = createValidateAndFixOrchestrator({
                permissionValidator,
                trustValidator,
                fixer,
                unscopedActions: new Set(),
            });

            // Act
            const result = orchestrator.execute(buildFormulationOutput());

            // Assert
            const trustResult = result.role_results[0]?.policy_results.find(
                (p) => p.policy_type === "trust",
            );
            expect(trustResult?.valid).toBe(false);
            expect(trustResult?.violations).toHaveLength(1);
        });
    });

    describe("given role name with plan", () => {
        it("should detect plan role type", () => {
            // Arrange
            const input = buildFormulationOutput();
            const firstRole = input.roles[0];
            if (!firstRole) {
                throw new Error("Expected role to exist");
            }
            firstRole.role_name = "my-plan-role";
            const permissionValidator = {
                validate: vi.fn().mockReturnValue([]),
            };
            const trustValidator = { validate: vi.fn().mockReturnValue([]) };
            const fixer = {
                fixPermissionPolicy: vi.fn(),
                fixTrustPolicy: vi.fn(),
            };
            const orchestrator = createValidateAndFixOrchestrator({
                permissionValidator,
                trustValidator,
                fixer,
                unscopedActions: new Set(),
            });

            // Act
            orchestrator.execute(input);

            // Assert
            expect(trustValidator.validate).toHaveBeenCalledWith(
                expect.anything(),
                "plan",
            );
        });
    });
});
