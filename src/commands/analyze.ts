import { readFileSync } from "node:fs";
import type {
    ActionInventory,
    InfrastructureActionEntry,
} from "../entities/action-inventory.js";
import { createActionMappingDb } from "../gateways/action-mapping-db.js";
import { createActionInventoryBuilder } from "../use-cases/build-action-inventory.js";
import { createResourceActionMapper } from "../use-cases/map-resource-actions.js";
import { createTerraformPlanParser } from "../use-cases/parse-terraform-plan.js";

export interface ConsoleOutput {
    log(message: string): void;
    warn(message: string): void;
}

export interface AnalyzeCommand {
    execute(
        inputPath: string,
        console: ConsoleOutput,
    ): Promise<ActionInventory>;
}

export function createAnalyzeCommand(): AnalyzeCommand {
    return {
        async execute(
            inputPath: string,
            output: ConsoleOutput,
        ): Promise<ActionInventory> {
            const fileContent = readFileSync(inputPath, "utf-8");

            const parser = createTerraformPlanParser();
            const parseResult = parser.parse(fileContent);

            const db = createActionMappingDb();
            const mapper = createResourceActionMapper(db);

            const allPlanAndApply: InfrastructureActionEntry[] = [];
            const allApplyOnly: InfrastructureActionEntry[] = [];

            for (const resourceChange of parseResult.resourceChanges) {
                const mapped = mapper.mapActions(resourceChange);

                if (mapped.unknownType) {
                    output.warn(
                        `Unknown resource type: ${resourceChange.type} (${resourceChange.address}) — add to action mapping database`,
                    );
                }

                allPlanAndApply.push(...mapped.planAndApply);
                allApplyOnly.push(...mapped.applyOnly);
            }

            const builder = createActionInventoryBuilder();
            const inventory = builder.build(parseResult.metadata, {
                planAndApply: allPlanAndApply,
                applyOnly: allApplyOnly,
            });

            output.log(JSON.stringify(inventory, null, 2));

            return inventory;
        },
    };
}
