import { readFile } from "node:fs/promises";
import { defineCommand } from "citty";
import { consola } from "consola";
import {
    countValidationErrors,
    countValidationWarnings,
} from "../lib/validation-output.js";
import type { PolicyFormulator } from "../use-cases/formulate-policies.js";
import type { FormulationOutputInput } from "../use-cases/formulation-output.schema.js";
import type { ActionInventoryParser } from "../use-cases/parse-action-inventory.js";
import type { FormulationConfigParser } from "../use-cases/parse-formulation-config.js";
import type { FormulationOutputParser } from "../use-cases/parse-formulation-output.js";
import type { OutputVariableResolver } from "../use-cases/resolve-output-variables.js";
import type { ValidateAndFixOrchestrator } from "../use-cases/validate-and-fix.js";

export interface ConsoleOutput {
    log(message: string): void;
    warn(message: string): void;
}

export interface FormulateCommandDeps {
    readonly configParser: FormulationConfigParser;
    readonly inventoryParser: ActionInventoryParser;
    readonly formulator: PolicyFormulator;
    readonly parser: FormulationOutputParser;
    readonly orchestrator: ValidateAndFixOrchestrator;
    readonly outputResolver: OutputVariableResolver;
}

export interface FormulateCommand {
    execute(
        inputPath: string,
        configPath: string,
        console: ConsoleOutput,
    ): Promise<FormulationOutputInput>;
}

export function createFormulateCommand(
    deps: FormulateCommandDeps,
): FormulateCommand {
    return {
        async execute(
            inputPath: string,
            configPath: string,
            output: ConsoleOutput,
        ): Promise<FormulationOutputInput> {
            const inventoryContent = await readFile(inputPath, "utf-8");
            const configContent = await readFile(configPath, "utf-8");

            const inventory = deps.inventoryParser.parse(inventoryContent);
            const config = deps.configParser.parse(configContent);

            const result = deps.formulator.formulate(inventory, config);

            // Convert entity type to schema-validated input for the orchestrator
            const parsedResult = deps.parser.parse(JSON.stringify(result));
            const { validation, fixedOutput } =
                deps.orchestrator.executeWithFixed(parsedResult);

            const totalErrors = countValidationErrors(validation);
            const totalWarnings = countValidationWarnings(validation);

            if (totalErrors > 0 || totalWarnings > 0) {
                output.warn(
                    `Validation found ${totalErrors} unfixable error(s) and ${totalWarnings} warning(s)`,
                );
            }

            const resolution = deps.outputResolver.resolve(
                fixedOutput,
                fixedOutput.template_variables,
                config,
            );

            if (!resolution.resolved) {
                output.warn(
                    `Unresolved template variables: ${resolution.missingVariables.join(", ")}`,
                );
                output.log(JSON.stringify(fixedOutput, null, 2));
                return fixedOutput;
            }

            output.log(JSON.stringify(resolution.output, null, 2));
            return resolution.output;
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
