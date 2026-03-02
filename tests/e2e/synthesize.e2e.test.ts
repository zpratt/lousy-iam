import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
import { createSynthesizeCommand } from "../../src/commands/synthesize.js";
import type { SynthesisOutput } from "../../src/entities/synthesis-output.js";
import { UNSCOPED_ACTIONS } from "../../src/lib/unscoped-actions.js";
import { createPolicyFixer } from "../../src/use-cases/fix-policy.js";
import { createFormulationConfigParser } from "../../src/use-cases/parse-formulation-config.js";
import { createFormulationOutputParser } from "../../src/use-cases/parse-formulation-output.js";
import { createTemplateVariableResolver } from "../../src/use-cases/resolve-template-variables.js";
import { createPayloadSynthesizer } from "../../src/use-cases/synthesize-payloads.js";
import { createValidateAndFixOrchestrator } from "../../src/use-cases/validate-and-fix.js";
import { createPermissionPolicyValidator } from "../../src/use-cases/validate-permission-policy.js";
import { createTrustPolicyValidator } from "../../src/use-cases/validate-trust-policy.js";

const FIXTURES_DIR = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "fixtures",
);
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
        template_variables: {
            state_bucket: "e2etest-terraform-state",
            state_key_prefix: "e2etest/",
            lock_table: "e2etest-terraform-locks",
        },
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

async function provisionRole(
    client: IAMClient,
    role: SynthesisOutput["roles"][number],
): Promise<void> {
    await client.send(new CreateRoleCommand(role.create_role));
    for (const policy of role.create_policies) {
        await client.send(new CreatePolicyCommand(policy));
    }
    for (const attach of role.attach_role_policies) {
        await client.send(new AttachRolePolicyCommand(attach));
    }
}

async function verifyRole(
    client: IAMClient,
    role: SynthesisOutput["roles"][number],
): Promise<{ roleName: string; attachedPolicyNames: string[] }> {
    const getResult = await client.send(
        new GetRoleCommand({ RoleName: role.create_role.RoleName }),
    );
    const listResult = await client.send(
        new ListAttachedRolePoliciesCommand({
            RoleName: role.create_role.RoleName,
        }),
    );
    return {
        roleName: getResult.Role?.RoleName ?? "",
        attachedPolicyNames:
            listResult.AttachedPolicies?.map((p) => p.PolicyName ?? "") ?? [],
    };
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

        tempDir = mkdtempSync(join(tmpdir(), "lousy-iam-synth-"));

        const synthesizeFixturePath = resolve(
            FORMULATION_FIXTURES_DIR,
            "synthesize-ready-output.json",
        );
        const configPath = join(tempDir, "config.json");
        writeFileSync(configPath, buildFormulationConfig(), "utf-8");

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

    describe("given synthesized payloads from a pre-validated fixture", () => {
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
        it("should create roles, policies, and attachments then verify via GetRole and ListAttachedRolePolicies", async () => {
            const iamClient = createIamClient(motoEndpoint);

            for (const role of synthesisOutput.roles) {
                await provisionRole(iamClient, role);
            }

            for (const role of synthesisOutput.roles) {
                const result = await verifyRole(iamClient, role);
                expect(result.roleName).toBe(role.create_role.RoleName);
                for (const expectedPolicy of role.create_policies) {
                    expect(result.attachedPolicyNames).toContain(
                        expectedPolicy.PolicyName,
                    );
                }
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
