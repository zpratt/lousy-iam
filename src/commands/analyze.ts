import { readFile } from "node:fs/promises";
import { defineCommand } from "citty";
import { consola } from "consola";
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
            const planAndApplyIndex = new Map<string, number>();
            const applyOnlyIndex = new Map<string, number>();

            for (const resourceChange of parseResult.resourceChanges) {
                const mapped = deps.mapper.mapActions(resourceChange);

                if (mapped.unknownType) {
                    output.warn(
                        `Unknown resource type: ${resourceChange.type} (${resourceChange.address}) — add to action mapping database`,
                    );
                }

                for (const entry of mapped.planAndApply) {
                    const key = `${entry.action}|${entry.resource}`;
                    const existingIdx = planAndApplyIndex.get(key);
                    if (existingIdx !== undefined) {
                        const existing = allPlanAndApply[existingIdx];
                        if (existing) {
                            allPlanAndApply[existingIdx] = {
                                ...existing,
                                sourceResource: [
                                    ...existing.sourceResource,
                                    ...entry.sourceResource,
                                ],
                            };
                        }
                    } else {
                        planAndApplyIndex.set(key, allPlanAndApply.length);
                        allPlanAndApply.push(entry);
                    }
                }

                for (const entry of mapped.applyOnly) {
                    const key = `${entry.action}|${entry.resource}`;
                    const existingIdx = applyOnlyIndex.get(key);
                    if (existingIdx !== undefined) {
                        const existing = allApplyOnly[existingIdx];
                        if (existing) {
                            allApplyOnly[existingIdx] = {
                                ...existing,
                                sourceResource: [
                                    ...existing.sourceResource,
                                    ...entry.sourceResource,
                                ],
                            };
                        }
                    } else {
                        applyOnlyIndex.set(key, allApplyOnly.length);
                        allApplyOnly.push(entry);
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

export function createAnalyzeCittyCommand(deps: AnalyzeCommandDeps) {
    const analyzeCommand = createAnalyzeCommand(deps);

    return defineCommand({
        meta: {
            name: "analyze",
            description:
                "Analyze a Terraform plan JSON to produce an IAM action inventory",
        },
        args: {
            input: {
                type: "string",
                description: "Path to Terraform plan JSON file",
                required: true,
            },
        },
        async run({ args }) {
            await analyzeCommand.execute(args.input, {
                log: (msg) => consola.log(msg),
                warn: (msg) => consola.warn(msg),
            });
        },
    });
}
