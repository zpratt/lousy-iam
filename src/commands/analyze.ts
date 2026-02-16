import { readFileSync } from "node:fs";
import type {
    ActionInventory,
    InfrastructureActionEntry,
} from "../entities/action-inventory.js";
import type { ActionInventoryBuilder } from "../use-cases/build-action-inventory.js";
import type { ResourceActionMapper } from "../use-cases/map-resource-actions.js";
import type { TerraformPlanParser } from "../use-cases/parse-terraform-plan.js";
import type { ActionInventorySerializer } from "../use-cases/serialize-action-inventory.js";

export interface ConsoleOutput {
    log(message: string): void;
    warn(message: string): void;
}

export interface AnalyzeCommandDeps {
    readonly parser: TerraformPlanParser;
    readonly mapper: ResourceActionMapper;
    readonly builder: ActionInventoryBuilder;
    readonly serializer: ActionInventorySerializer;
}

export interface AnalyzeCommand {
    execute(
        inputPath: string,
        console: ConsoleOutput,
    ): Promise<ActionInventory>;
}

export function createAnalyzeCommand(deps: AnalyzeCommandDeps): AnalyzeCommand {
    return {
        async execute(
            inputPath: string,
            output: ConsoleOutput,
        ): Promise<ActionInventory> {
            const fileContent = readFileSync(inputPath, "utf-8");

            const parseResult = deps.parser.parse(fileContent);

            const allPlanAndApply: InfrastructureActionEntry[] = [];
            const allApplyOnly: InfrastructureActionEntry[] = [];

            for (const resourceChange of parseResult.resourceChanges) {
                const mapped = deps.mapper.mapActions(resourceChange);

                if (mapped.unknownType) {
                    output.warn(
                        `Unknown resource type: ${resourceChange.type} (${resourceChange.address}) — add to action mapping database`,
                    );
                }

                allPlanAndApply.push(...mapped.planAndApply);
                allApplyOnly.push(...mapped.applyOnly);
            }

            const inventory = deps.builder.build(parseResult.metadata, {
                planAndApply: allPlanAndApply,
                applyOnly: allApplyOnly,
            });

            output.log(deps.serializer.serialize(inventory));

            return inventory;
        },
    };
}
