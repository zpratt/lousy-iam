import { readFile } from "node:fs/promises";
import { defineCommand } from "citty";
import { consola } from "consola";
import type { FormulationOutput } from "../entities/policy-document.js";
import type { PolicyFormulator } from "../use-cases/formulate-policies.js";
import type { ActionInventoryParser } from "../use-cases/parse-action-inventory.js";
import type { FormulationConfigParser } from "../use-cases/parse-formulation-config.js";

export interface ConsoleOutput {
    log(message: string): void;
    warn(message: string): void;
}

export interface FormulateCommandDeps {
    readonly configParser: FormulationConfigParser;
    readonly inventoryParser: ActionInventoryParser;
    readonly formulator: PolicyFormulator;
}

export interface FormulateCommand {
    execute(
        inputPath: string,
        configPath: string,
        console: ConsoleOutput,
    ): Promise<FormulationOutput>;
}

export function createFormulateCommand(
    deps: FormulateCommandDeps,
): FormulateCommand {
    return {
        async execute(
            inputPath: string,
            configPath: string,
            output: ConsoleOutput,
        ): Promise<FormulationOutput> {
            const inventoryContent = await readFile(inputPath, "utf-8");
            const configContent = await readFile(configPath, "utf-8");

            const inventory = deps.inventoryParser.parse(inventoryContent);
            const config = deps.configParser.parse(configContent);

            const result = deps.formulator.formulate(inventory, config);

            output.log(JSON.stringify(result, null, 2));

            return result;
        },
    };
}

export function createFormulateCittyCommand(deps: FormulateCommandDeps) {
    const formulateCommand = createFormulateCommand(deps);

    return defineCommand({
        meta: {
            name: "formulate",
            description:
                "Transform an action inventory into candidate IAM policy documents",
        },
        args: {
            input: {
                type: "string",
                description: "Path to Phase 1 action inventory JSON file",
                required: true,
            },
            config: {
                type: "string",
                description: "Path to formulation configuration JSON file",
                required: true,
            },
        },
        async run({ args }) {
            await formulateCommand.execute(args.input, args.config, {
                log: (msg) => consola.log(msg),
                warn: (msg) => consola.warn(msg),
            });
        },
    });
}
