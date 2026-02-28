import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
    GenericContainer,
    Network,
    type StartedGenericContainer,
    type StartedNetwork,
    Wait,
} from "testcontainers";

interface TerraformPlanResult {
    planPath: string;
    stablePlanDir: string;
}

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

async function generateTerraformPlan(
    network: StartedNetwork,
): Promise<TerraformPlanResult> {
    const motoContainer = await startMotoContainer(network);

    try {
        const workDir = mkdtempSync(join(tmpdir(), "lousy-iam-e2e-"));
        cpSync(FIXTURES_DIR, workDir, { recursive: true });

        const terraformContainer = await new GenericContainer(
            "hashicorp/terraform:1.12.0",
        )
            .withNetwork(network)
            .withBindMounts([{ source: workDir, target: "/workspace" }])
            .withWorkingDir("/workspace")
            .withEntrypoint(["sh"])
            .withCommand(["-c", "tail -f /dev/null"])
            .start();

        try {
            await runTerraformCommands(terraformContainer);

            const rawPlanPath = join(workDir, "plan.json");
            const content = readFileSync(rawPlanPath, "utf-8");
            if (!content.trim()) {
                throw new Error("terraform show produced empty plan.json");
            }

            const stablePlanDir = mkdtempSync(
                join(tmpdir(), "lousy-iam-plan-"),
            );
            const planPath = join(stablePlanDir, "plan.json");
            cpSync(rawPlanPath, planPath);

            return { planPath, stablePlanDir };
        } finally {
            await terraformContainer.stop();
            rmSync(workDir, { recursive: true, force: true });
        }
    } finally {
        await motoContainer.stop();
    }
}

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createAnalyzeCommand } from "../../src/commands/analyze.js";
import { createActionMappingDb } from "../../src/gateways/action-mapping-db.js";
import { createActionInventoryBuilder } from "../../src/use-cases/build-action-inventory.js";
import { createResourceActionMapper } from "../../src/use-cases/map-resource-actions.js";
import { createTerraformPlanParser } from "../../src/use-cases/parse-terraform-plan.js";
import { createActionInventorySerializer } from "../../src/use-cases/serialize-action-inventory.js";

const FIXTURES_DIR = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "fixtures/terraform",
);

function buildAnalyzeCommand() {
    const db = createActionMappingDb();
    return createAnalyzeCommand({
        parser: createTerraformPlanParser(),
        mapper: createResourceActionMapper(db),
        builder: createActionInventoryBuilder(),
        serializer: createActionInventorySerializer(),
    });
}

describe("analyze command e2e", () => {
    let planPath: string;
    let stablePlanDir: string;

    beforeAll(async () => {
        const network = await new Network().start();

        try {
            const result = await generateTerraformPlan(network);
            planPath = result.planPath;
            stablePlanDir = result.stablePlanDir;
        } finally {
            await network.stop();
        }
    });

    afterAll(() => {
        if (stablePlanDir) {
            rmSync(stablePlanDir, { recursive: true, force: true });
        }
    });

    describe("given a real terraform plan from moto", () => {
        it("should produce an inventory with correct metadata", async () => {
            // Arrange
            const command = buildAnalyzeCommand();
            const mockConsole = { log: vi.fn(), warn: vi.fn() };

            // Act
            const inventory = await command.execute(planPath, mockConsole);

            // Assert
            expect(inventory.metadata.iacTool).toBe("terraform");
            expect(inventory.metadata.iacVersion).toMatch(/^\d+\.\d+\.\d+/);
            expect(inventory.metadata.formatVersion).toBeDefined();
        });

        it("should serialize output with snake_case keys", async () => {
            // Arrange
            const command = buildAnalyzeCommand();
            const output: string[] = [];
            const mockConsole = {
                log: (msg: string) => output.push(msg),
                warn: vi.fn(),
            };

            // Act
            await command.execute(planPath, mockConsole);

            // Assert
            const serialized = JSON.parse(output[0] ?? "{}") as Record<
                string,
                unknown
            >;
            expect(serialized).toHaveProperty("metadata.iac_tool", "terraform");
            expect(serialized).toHaveProperty("toolchain_actions");
            expect(serialized).toHaveProperty("infrastructure_actions");
        });

        it("should include S3 read actions in plan_and_apply", async () => {
            // Arrange
            const command = buildAnalyzeCommand();
            const mockConsole = { log: vi.fn(), warn: vi.fn() };

            // Act
            const inventory = await command.execute(planPath, mockConsole);

            // Assert
            const readActions =
                inventory.infrastructureActions.planAndApply.map(
                    (a) => a.action,
                );

            expect(readActions).toContain("s3:GetBucketLocation");
            expect(readActions).toContain("s3:ListBucket");
        });

        it("should include S3 create actions in apply_only", async () => {
            // Arrange
            const command = buildAnalyzeCommand();
            const mockConsole = { log: vi.fn(), warn: vi.fn() };

            // Act
            const inventory = await command.execute(planPath, mockConsole);

            // Assert
            const writeActions = inventory.infrastructureActions.applyOnly.map(
                (a) => a.action,
            );

            expect(writeActions).toContain("s3:CreateBucket");
        });

        it("should include toolchain actions for state management", async () => {
            // Arrange
            const command = buildAnalyzeCommand();
            const mockConsole = { log: vi.fn(), warn: vi.fn() };

            // Act
            const inventory = await command.execute(planPath, mockConsole);

            // Assert
            const toolchainActions =
                inventory.toolchainActions.planAndApply.map((a) => a.action);

            expect(toolchainActions).toContain("sts:GetCallerIdentity");
            expect(toolchainActions).toContain("s3:GetObject");
        });

        it("should reference the correct source resource address", async () => {
            // Arrange
            const command = buildAnalyzeCommand();
            const mockConsole = { log: vi.fn(), warn: vi.fn() };

            // Act
            const inventory = await command.execute(planPath, mockConsole);

            // Assert
            const allEntries = [
                ...inventory.infrastructureActions.planAndApply,
                ...inventory.infrastructureActions.applyOnly,
            ];

            const s3Entries = allEntries.filter((e) =>
                e.sourceResource.includes("aws_s3_bucket.test"),
            );

            expect(s3Entries.length).toBeGreaterThan(0);
        });
    });
});
