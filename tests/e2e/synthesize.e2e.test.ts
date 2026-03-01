import {
    cpSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
    AttachRolePolicyCommand,
    CreatePolicyCommand,
    CreateRoleCommand,
    GetRoleCommand,
    IAMClient,
    ListAttachedRolePoliciesCommand,
} from "@aws-sdk/client-iam";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import {
    GenericContainer,
    Network,
    type StartedGenericContainer,
    type StartedNetwork,
    Wait,
} from "testcontainers";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createAnalyzeCommand } from "../../src/commands/analyze.js";
import { createFormulateCommand } from "../../src/commands/formulate.js";
import { createSynthesizeCommand } from "../../src/commands/synthesize.js";
import type { SynthesisOutput } from "../../src/entities/synthesis-output.js";
import { createActionMappingDb } from "../../src/gateways/action-mapping-db.js";
import { UNSCOPED_ACTIONS } from "../../src/lib/unscoped-actions.js";
import { createActionInventoryBuilder } from "../../src/use-cases/build-action-inventory.js";
import { createPermissionPolicyBuilder } from "../../src/use-cases/build-permission-policy.js";
import { createTrustPolicyBuilder } from "../../src/use-cases/build-trust-policy.js";
import { createPolicyFixer } from "../../src/use-cases/fix-policy.js";
import { createPolicyFormulator } from "../../src/use-cases/formulate-policies.js";
import { createResourceActionMapper } from "../../src/use-cases/map-resource-actions.js";
import { createActionInventoryParser } from "../../src/use-cases/parse-action-inventory.js";
import { createFormulationConfigParser } from "../../src/use-cases/parse-formulation-config.js";
import { createFormulationOutputParser } from "../../src/use-cases/parse-formulation-output.js";
import { createTerraformPlanParser } from "../../src/use-cases/parse-terraform-plan.js";
import { createTemplateVariableResolver } from "../../src/use-cases/resolve-template-variables.js";
import { createActionInventorySerializer } from "../../src/use-cases/serialize-action-inventory.js";
import { createPayloadSynthesizer } from "../../src/use-cases/synthesize-payloads.js";
import { createValidateAndFixOrchestrator } from "../../src/use-cases/validate-and-fix.js";
import { createPermissionPolicyValidator } from "../../src/use-cases/validate-permission-policy.js";
import { createTrustPolicyValidator } from "../../src/use-cases/validate-trust-policy.js";

const FIXTURES_DIR = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "fixtures",
);
const TERRAFORM_FIXTURES_DIR = resolve(FIXTURES_DIR, "terraform");
const FORMULATION_FIXTURES_DIR = resolve(FIXTURES_DIR, "formulation");

const MOTO_ACCOUNT_ID = "123456789012";
const MOTO_REGION = "us-east-1";

async function startMotoContainer(
    network: StartedNetwork,
): Promise<StartedGenericContainer> {
    return new GenericContainer("motoserver/moto:5.1.2")
        .withNetwork(network)
        .withNetworkAliases("moto")
        .withExposedPorts(5000)
        .withWaitStrategy(Wait.forHttp("/moto-api/", 5000).forStatusCode(200))
        .start();
}

async function runTerraformCommands(
    container: StartedGenericContainer,
): Promise<void> {
    const initResult = await container.exec([
        "terraform",
        "init",
        "-input=false",
    ]);
    if (initResult.exitCode !== 0) {
        throw new Error(
            `terraform init failed (exit ${initResult.exitCode}): ${initResult.output}`,
        );
    }

    const planResult = await container.exec([
        "terraform",
        "plan",
        "-input=false",
        "-out=tfplan",
    ]);
    if (planResult.exitCode !== 0) {
        throw new Error(
            `terraform plan failed (exit ${planResult.exitCode}): ${planResult.output}`,
        );
    }

    const showResult = await container.exec([
        "sh",
        "-c",
        "terraform show -json tfplan > /workspace/plan.json",
    ]);
    if (showResult.exitCode !== 0) {
        throw new Error(
            `terraform show failed (exit ${showResult.exitCode}): ${showResult.output}`,
        );
    }
}

function buildAnalyzeCommand() {
    const db = createActionMappingDb();
    return createAnalyzeCommand({
        parser: createTerraformPlanParser(),
        mapper: createResourceActionMapper(db),
        builder: createActionInventoryBuilder(),
        serializer: createActionInventorySerializer(),
    });
}

function buildFormulateCommand() {
    return createFormulateCommand({
        configParser: createFormulationConfigParser(),
        inventoryParser: createActionInventoryParser(),
        formulator: createPolicyFormulator({
            permissionPolicyBuilder: createPermissionPolicyBuilder(),
            trustPolicyBuilder: createTrustPolicyBuilder(),
        }),
    });
}

function buildSynthesizeCommand() {
    return createSynthesizeCommand({
        parser: createFormulationOutputParser(),
        configParser: createFormulationConfigParser(),
        orchestrator: createValidateAndFixOrchestrator({
            permissionValidator: createPermissionPolicyValidator(),
            trustValidator: createTrustPolicyValidator(),
            fixer: createPolicyFixer(),
            unscopedActions: UNSCOPED_ACTIONS,
        }),
        resolver: createTemplateVariableResolver(),
        synthesizer: createPayloadSynthesizer(),
    });
}

function buildFormulationConfig(): string {
    return JSON.stringify({
        github_org: "test-org",
        github_repo: "test-repo",
        resource_prefix: "e2etest",
        account_id: MOTO_ACCOUNT_ID,
        region: MOTO_REGION,
        plan_apply_separation: true,
        include_delete_actions: true,
    });
}

function createIamClient(endpoint: string): IAMClient {
    return new IAMClient({
        region: MOTO_REGION,
        endpoint,
        credentials: {
            accessKeyId: "testing",
            secretAccessKey: "testing",
        },
    });
}

describe("synthesize command e2e", () => {
    let motoContainer: StartedGenericContainer;
    let network: StartedNetwork;
    let motoEndpoint: string;
    let tempDir: string;
    let synthesisOutput: SynthesisOutput;

    beforeAll(async () => {
        network = await new Network().start();

        motoContainer = await startMotoContainer(network);
        motoEndpoint = `http://${motoContainer.getHost()}:${motoContainer.getMappedPort(5000)}`;

        // Generate terraform plan using moto as AWS backend
        const workDir = mkdtempSync(join(tmpdir(), "lousy-iam-synth-e2e-"));
        cpSync(TERRAFORM_FIXTURES_DIR, workDir, { recursive: true });

        const terraformContainer = await new GenericContainer(
            "hashicorp/terraform:1.12.0",
        )
            .withNetwork(network)
            .withBindMounts([{ source: workDir, target: "/workspace" }])
            .withWorkingDir("/workspace")
            .withEntrypoint(["sh"])
            .withCommand(["-c", "tail -f /dev/null"])
            .start();

        tempDir = mkdtempSync(join(tmpdir(), "lousy-iam-synth-"));

        try {
            await runTerraformCommands(terraformContainer);

            const rawPlanPath = join(workDir, "plan.json");
            const content = readFileSync(rawPlanPath, "utf-8");
            if (!content.trim()) {
                throw new Error("terraform show produced empty plan.json");
            }

            const planPath = join(tempDir, "plan.json");
            cpSync(rawPlanPath, planPath);

            // Phase 1: Analyze — produces action inventory from terraform plan
            const analyzeCommand = buildAnalyzeCommand();
            const analyzeOutput: string[] = [];
            await analyzeCommand.execute(planPath, {
                log: (msg) => analyzeOutput.push(msg),
                warn: vi.fn(),
            });

            const inventoryPath = join(tempDir, "action-inventory.json");
            writeFileSync(inventoryPath, analyzeOutput[0] ?? "", "utf-8");

            // Phase 2: Formulate — produces candidate IAM policies
            const formulateCommand = buildFormulateCommand();
            const configPath = join(tempDir, "config.json");
            writeFileSync(configPath, buildFormulationConfig(), "utf-8");

            const formulateOutput: string[] = [];
            await formulateCommand.execute(inventoryPath, configPath, {
                log: (msg) => formulateOutput.push(msg),
                warn: vi.fn(),
            });

            writeFileSync(
                join(tempDir, "formulation-output.json"),
                formulateOutput[0] ?? "",
                "utf-8",
            );
        } finally {
            await terraformContainer.stop();
            try {
                rmSync(workDir, { recursive: true, force: true });
            } catch {
                // Terraform container creates root-owned files in bind mount
            }
        }

        // Phase 4: Synthesize — uses pre-validated fixture with scoped resources
        // Real formulation output may contain validation errors (e.g. Resource: "*")
        // that require manual remediation before synthesis. This fixture represents
        // a formulation output that has been reviewed and scoped appropriately.
        const synthesizeFixturePath = resolve(
            FORMULATION_FIXTURES_DIR,
            "synthesize-ready-output.json",
        );
        const configPath = join(tempDir, "config.json");
        const synthesizeCommand = buildSynthesizeCommand();
        synthesisOutput = await synthesizeCommand.execute(
            {
                inputPath: synthesizeFixturePath,
                configPath,
            },
            {
                log: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
            },
        );
    });

    afterAll(async () => {
        if (tempDir) {
            rmSync(tempDir, { recursive: true, force: true });
        }
        if (motoContainer) {
            await motoContainer.stop();
        }
        if (network) {
            await network.stop();
        }
    });

    describe("given the full pipeline from analyze through synthesize", () => {
        it("should produce a plan and apply role", () => {
            expect(synthesisOutput.roles).toHaveLength(2);
            expect(synthesisOutput.roles[0]?.create_role.RoleName).toBe(
                "e2etest-github-plan",
            );
            expect(synthesisOutput.roles[1]?.create_role.RoleName).toBe(
                "e2etest-github-apply",
            );
        });

        it("should produce CreateRoleCommandInput with JSON-stringified trust policy", () => {
            const firstRole = synthesisOutput.roles[0];
            const trustDoc = JSON.parse(
                firstRole?.create_role.AssumeRolePolicyDocument ?? "{}",
            ) as Record<string, unknown>;
            expect(trustDoc).toHaveProperty("Version", "2012-10-17");
            expect(trustDoc).toHaveProperty("Statement");
        });

        it("should produce CreatePolicyCommandInput with JSON-stringified policy document", () => {
            const firstPolicy = synthesisOutput.roles[0]?.create_policies[0];
            const policyDoc = JSON.parse(
                firstPolicy?.PolicyDocument ?? "{}",
            ) as Record<string, unknown>;
            expect(policyDoc).toHaveProperty("Version", "2012-10-17");
        });

        it("should resolve account_id template variable in all payloads", () => {
            const trustDoc =
                synthesisOutput.roles[0]?.create_role
                    .AssumeRolePolicyDocument ?? "";
            expect(trustDoc).toContain(MOTO_ACCOUNT_ID);
            // biome-ignore lint/suspicious/noTemplateCurlyInString: verifying placeholder resolution
            expect(trustDoc).not.toContain("${account_id}");

            const policyArn =
                synthesisOutput.roles[0]?.attach_role_policies[0]?.PolicyArn ??
                "";
            expect(policyArn).toContain(MOTO_ACCOUNT_ID);
        });
    });

    describe("given synthesized payloads applied to moto via AWS SDK v3", () => {
        it("should create IAM roles via CreateRoleCommand", async () => {
            const iamClient = createIamClient(motoEndpoint);

            for (const role of synthesisOutput.roles) {
                const result = await iamClient.send(
                    new CreateRoleCommand(role.create_role),
                );
                expect(result.Role?.RoleName).toBe(role.create_role.RoleName);
            }
        });

        it("should create IAM policies via CreatePolicyCommand", async () => {
            const iamClient = createIamClient(motoEndpoint);

            for (const role of synthesisOutput.roles) {
                for (const policy of role.create_policies) {
                    const result = await iamClient.send(
                        new CreatePolicyCommand(policy),
                    );
                    expect(result.Policy?.PolicyName).toBe(policy.PolicyName);
                }
            }
        });

        it("should attach policies to roles via AttachRolePolicyCommand", async () => {
            const iamClient = createIamClient(motoEndpoint);

            for (const role of synthesisOutput.roles) {
                for (const attach of role.attach_role_policies) {
                    await iamClient.send(new AttachRolePolicyCommand(attach));
                }
            }
        });

        it("should list attached policies on each role", async () => {
            const iamClient = createIamClient(motoEndpoint);

            for (const role of synthesisOutput.roles) {
                const listResult = await iamClient.send(
                    new ListAttachedRolePoliciesCommand({
                        RoleName: role.create_role.RoleName,
                    }),
                );
                const attachedNames =
                    listResult.AttachedPolicies?.map((p) => p.PolicyName) ?? [];

                for (const expectedPolicy of role.create_policies) {
                    expect(attachedNames).toContain(expectedPolicy.PolicyName);
                }
            }
        });

        it("should retrieve created roles via GetRole", async () => {
            const iamClient = createIamClient(motoEndpoint);

            for (const role of synthesisOutput.roles) {
                const result = await iamClient.send(
                    new GetRoleCommand({ RoleName: role.create_role.RoleName }),
                );
                expect(result.Role?.RoleName).toBe(role.create_role.RoleName);
            }
        });

        it("should verify moto STS returns the expected account ID", async () => {
            const stsClient = new STSClient({
                region: MOTO_REGION,
                endpoint: motoEndpoint,
                credentials: {
                    accessKeyId: "testing",
                    secretAccessKey: "testing",
                },
            });

            const identity = await stsClient.send(
                new GetCallerIdentityCommand({}),
            );
            expect(identity.Account).toBe(MOTO_ACCOUNT_ID);
        });
    });
});
