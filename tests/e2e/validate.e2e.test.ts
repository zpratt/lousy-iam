import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createValidateCommand } from "../../src/commands/validate.js";
import { createPolicyFixer } from "../../src/use-cases/fix-policy.js";
import { createFormulationOutputParser } from "../../src/use-cases/parse-formulation-output.js";
import { createValidateAndFixOrchestrator } from "../../src/use-cases/validate-and-fix.js";
import { createPermissionPolicyValidator } from "../../src/use-cases/validate-permission-policy.js";
import { createTrustPolicyValidator } from "../../src/use-cases/validate-trust-policy.js";

const FIXTURES_DIR = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "fixtures/formulation",
);

const UNSCOPED_ACTIONS = new Set([
    "sts:GetCallerIdentity",
    "ecs:DescribeClusters",
    "ecs:DescribeServices",
    "ecs:DescribeTaskDefinition",
    "s3:GetBucketLocation",
]);

function buildValidateCommand() {
    return createValidateCommand({
        parser: createFormulationOutputParser(),
        orchestrator: createValidateAndFixOrchestrator({
            permissionValidator: createPermissionPolicyValidator(),
            trustValidator: createTrustPolicyValidator(),
            fixer: createPolicyFixer(),
            unscopedActions: UNSCOPED_ACTIONS,
        }),
    });
}

describe("validate command e2e", () => {
    describe("given a well-formed formulation output", () => {
        it("should produce validation results for both plan and apply roles", async () => {
            // Arrange
            const command = buildValidateCommand();
            const inputPath = resolve(FIXTURES_DIR, "valid-output.json");
            const mockConsole = { log: vi.fn(), warn: vi.fn() };

            // Act
            const result = await command.execute(inputPath, mockConsole);

            // Assert
            expect(result.role_results).toHaveLength(2);
            expect(result.role_results[0]?.role_name).toBe(
                "my-app-github-plan",
            );
            expect(result.role_results[1]?.role_name).toBe(
                "my-app-github-apply",
            );
        });

        it("should include both permission and trust policy results per role", async () => {
            // Arrange
            const command = buildValidateCommand();
            const inputPath = resolve(FIXTURES_DIR, "valid-output.json");
            const mockConsole = { log: vi.fn(), warn: vi.fn() };

            // Act
            const result = await command.execute(inputPath, mockConsole);

            // Assert
            for (const roleResult of result.role_results) {
                const policyTypes = roleResult.policy_results.map(
                    (p) => p.policy_type,
                );
                expect(policyTypes).toContain("permission");
                expect(policyTypes).toContain("trust");
            }
        });

        it("should output valid JSON to console", async () => {
            // Arrange
            const command = buildValidateCommand();
            const inputPath = resolve(FIXTURES_DIR, "valid-output.json");
            const output: string[] = [];
            const mockConsole = {
                log: (msg: string) => output.push(msg),
                warn: vi.fn(),
            };

            // Act
            await command.execute(inputPath, mockConsole);

            // Assert
            const parsed = JSON.parse(output[0] ?? "{}") as Record<
                string,
                unknown
            >;
            expect(parsed).toHaveProperty("valid");
            expect(parsed).toHaveProperty("role_results");
            expect(parsed).toHaveProperty("fix_iterations");
        });

        it("should include stats for each policy result", async () => {
            // Arrange
            const command = buildValidateCommand();
            const inputPath = resolve(FIXTURES_DIR, "valid-output.json");
            const mockConsole = { log: vi.fn(), warn: vi.fn() };

            // Act
            const result = await command.execute(inputPath, mockConsole);

            // Assert
            for (const roleResult of result.role_results) {
                for (const policyResult of roleResult.policy_results) {
                    expect(policyResult.stats).toHaveProperty(
                        "total_statements",
                    );
                    expect(policyResult.stats).toHaveProperty("total_actions");
                    expect(policyResult.stats).toHaveProperty("errors");
                    expect(policyResult.stats).toHaveProperty("warnings");
                }
            }
        });
    });

    describe("given formulation output with auto-fixable violations", () => {
        it("should apply auto-fixes and report remaining violations", async () => {
            // Arrange
            const command = buildValidateCommand();
            const inputPath = resolve(FIXTURES_DIR, "fixable-output.json");
            const mockConsole = { log: vi.fn(), warn: vi.fn() };

            // Act
            const result = await command.execute(inputPath, mockConsole);

            // Assert
            expect(result.fix_iterations).toBeGreaterThan(0);
            expect(result.role_results).toHaveLength(1);
        });

        it("should resolve LP-034 StringLike to StringEquals in trust policy", async () => {
            // Arrange
            const command = buildValidateCommand();
            const inputPath = resolve(FIXTURES_DIR, "fixable-output.json");
            const mockConsole = { log: vi.fn(), warn: vi.fn() };

            // Act
            const result = await command.execute(inputPath, mockConsole);

            // Assert
            const trustResult = result.role_results[0]?.policy_results.find(
                (p) => p.policy_type === "trust",
            );
            const lp034 = trustResult?.violations.find(
                (v) => v.rule_id === "LP-034",
            );
            expect(lp034).toBeUndefined();
        });

        it("should resolve LP-045 duplicate actions in permission policy", async () => {
            // Arrange
            const command = buildValidateCommand();
            const inputPath = resolve(FIXTURES_DIR, "fixable-output.json");
            const mockConsole = { log: vi.fn(), warn: vi.fn() };

            // Act
            const result = await command.execute(inputPath, mockConsole);

            // Assert
            const permResult = result.role_results[0]?.policy_results.find(
                (p) => p.policy_type === "permission",
            );
            const lp045 = permResult?.violations.find(
                (v) => v.rule_id === "LP-045",
            );
            expect(lp045).toBeUndefined();
        });

        it("should resolve LP-040 missing Version in permission policy", async () => {
            // Arrange
            const command = buildValidateCommand();
            const inputPath = resolve(FIXTURES_DIR, "fixable-output.json");
            const mockConsole = { log: vi.fn(), warn: vi.fn() };

            // Act
            const result = await command.execute(inputPath, mockConsole);

            // Assert
            const permResult = result.role_results[0]?.policy_results.find(
                (p) => p.policy_type === "permission",
            );
            const lp040 = permResult?.violations.find(
                (v) => v.rule_id === "LP-040",
            );
            expect(lp040).toBeUndefined();
        });
    });
});
