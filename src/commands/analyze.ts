import { readFile } from "node:fs/promises";
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
            const fileContent = await readFile(inputPath, "utf-8");

            const parseResult = deps.parser.parse(fileContent);

            const allPlanAndApply: InfrastructureActionEntry[] = [];
            const allApplyOnly: InfrastructureActionEntry[] = [];
            const seenPlanAndApply = new Set<string>();
            const seenApplyOnly = new Set<string>();

            for (const resourceChange of parseResult.resourceChanges) {
                const mapped = deps.mapper.mapActions(resourceChange);

                if (mapped.unknownType) {
                    output.warn(
                        `Unknown resource type: ${resourceChange.type} (${resourceChange.address}) — add to action mapping database`,
                    );
                }

                for (const entry of mapped.planAndApply) {
                    const key = `${entry.action}|${entry.resource}`;
                    if (!seenPlanAndApply.has(key)) {
                        allPlanAndApply.push(entry);
                        seenPlanAndApply.add(key);
                    }
                }

                for (const entry of mapped.applyOnly) {
                    const key = `${entry.action}|${entry.resource}`;
                    if (!seenApplyOnly.has(key)) {
                        allApplyOnly.push(entry);
                        seenApplyOnly.add(key);
                    }
                }
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
