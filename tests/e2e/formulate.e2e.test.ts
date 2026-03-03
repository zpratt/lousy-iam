import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createFormulateCommand } from "../../src/commands/formulate.js";
import type { FormulationOutput } from "../../src/entities/policy-document.js";
import { createPermissionPolicyBuilder } from "../../src/use-cases/build-permission-policy.js";
import { createTrustPolicyBuilder } from "../../src/use-cases/build-trust-policy.js";
import { createPolicyFormulator } from "../../src/use-cases/formulate-policies.js";
import { createActionInventoryParser } from "../../src/use-cases/parse-action-inventory.js";
import { createFormulationConfigParser } from "../../src/use-cases/parse-formulation-config.js";
import { createTemplateVariableResolver } from "../../src/use-cases/resolve-template-variables.js";

const FIXTURES_DIR = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "fixtures",
);
const FORMULATION_FIXTURES_DIR = resolve(FIXTURES_DIR, "formulation");

const E2E_ACCOUNT_ID = "123456789012";
const E2E_REGION = "us-east-1";
const E2E_STATE_BUCKET = "e2etest-terraform-state";
const E2E_STATE_KEY_PREFIX = "test-org/test-repo";
const E2E_LOCK_TABLE = "e2etest-terraform-locks";

function buildFormulateCommand() {
    return createFormulateCommand({
        configParser: createFormulationConfigParser(),
        inventoryParser: createActionInventoryParser(),
        formulator: createPolicyFormulator({
            permissionPolicyBuilder: createPermissionPolicyBuilder(),
            trustPolicyBuilder: createTrustPolicyBuilder(),
        }),
        resolver: createTemplateVariableResolver(),
    });
}

function buildFormulationConfig(): string {
    return JSON.stringify({
        github_org: "test-org",
        github_repo: "test-repo",
        resource_prefix: "e2etest",
        account_id: E2E_ACCOUNT_ID,
        region: E2E_REGION,
        plan_apply_separation: true,
        include_delete_actions: true,
        template_variables: {
            state_bucket: E2E_STATE_BUCKET,
            state_key_prefix: E2E_STATE_KEY_PREFIX,
            lock_table: E2E_LOCK_TABLE,
        },
    });
}

describe("formulate command e2e", () => {
    let tempDir: string;
    let formulationOutput: FormulationOutput;

    beforeAll(async () => {
        tempDir = mkdtempSync(join(tmpdir(), "lousy-iam-formulate-"));

        const inventoryPath = resolve(
            FORMULATION_FIXTURES_DIR,
            "action-inventory.json",
        );
        const configPath = join(tempDir, "config.json");
        writeFileSync(configPath, buildFormulationConfig(), "utf-8");

        const command = buildFormulateCommand();
        formulationOutput = await command.execute(inventoryPath, configPath, {
            log: vi.fn(),
            warn: vi.fn(),
        });
    });

    afterAll(() => {
        if (tempDir) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    describe("given a valid inventory and config with all template variables", () => {
        it("should contain no unresolved template variable placeholders in the output", () => {
            const serialized = JSON.stringify(formulationOutput);
            expect(serialized).not.toMatch(/\$\{[a-z_]+\}/);
        });

        it("should resolve state_bucket in S3 toolchain ARNs", () => {
            const serialized = JSON.stringify(formulationOutput);
            expect(serialized).toContain(
                `arn:aws:s3:::${E2E_STATE_BUCKET}/${E2E_STATE_KEY_PREFIX}`,
            );
            expect(serialized).toContain(`arn:aws:s3:::${E2E_STATE_BUCKET}`);
        });

        it("should resolve lock_table in DynamoDB toolchain ARNs", () => {
            const serialized = JSON.stringify(formulationOutput);
            expect(serialized).toContain(
                `arn:aws:dynamodb:${E2E_REGION}:${E2E_ACCOUNT_ID}:table/${E2E_LOCK_TABLE}`,
            );
        });

        it("should resolve account_id in trust policy OIDC provider ARNs", () => {
            const planTrust = formulationOutput.roles[0]?.trust_policy;
            const providerArn =
                planTrust?.Statement[0]?.Principal?.Federated ?? "";
            expect(providerArn).toContain(E2E_ACCOUNT_ID);
            // biome-ignore lint/suspicious/noTemplateCurlyInString: verifying placeholder resolution
            expect(providerArn).not.toContain("${account_id}");
        });

        it("should include all template variables in the output metadata", () => {
            const vars = formulationOutput.template_variables;
            expect(vars.account_id).toBe(E2E_ACCOUNT_ID);
            expect(vars.region).toBe(E2E_REGION);
            expect(vars.resource_prefix).toBe("e2etest");
            expect(vars.org).toBe("test-org");
            expect(vars.repo).toBe("test-repo");
            expect(vars.state_bucket).toBe(E2E_STATE_BUCKET);
            expect(vars.state_key_prefix).toBe(E2E_STATE_KEY_PREFIX);
            expect(vars.lock_table).toBe(E2E_LOCK_TABLE);
        });

        it("should produce plan and apply roles", () => {
            expect(formulationOutput.roles).toHaveLength(2);
            expect(formulationOutput.roles[0]?.role_name).toBe(
                "e2etest-github-plan",
            );
            expect(formulationOutput.roles[1]?.role_name).toBe(
                "e2etest-github-apply",
            );
        });
    });
});
