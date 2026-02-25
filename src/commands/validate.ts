import { readFile } from "node:fs/promises";
import { defineCommand } from "citty";
import { consola } from "consola";
import type { ValidationOutput } from "../entities/validation-result.js";
import type { FormulationOutputParser } from "../use-cases/parse-formulation-output.js";
import type { ValidateAndFixOrchestrator } from "../use-cases/validate-and-fix.js";

export interface ValidateConsoleOutput {
    log(message: string): void;
    warn(message: string): void;
}

export interface ValidateCommandDeps {
    readonly parser: FormulationOutputParser;
    readonly orchestrator: ValidateAndFixOrchestrator;
}

export interface ValidateCommand {
    execute(
        inputPath: string,
        console: ValidateConsoleOutput,
    ): Promise<ValidationOutput>;
}

export function createValidateCommand(
    deps: ValidateCommandDeps,
): ValidateCommand {
    return {
        async execute(
            inputPath: string,
            output: ValidateConsoleOutput,
        ): Promise<ValidationOutput> {
            const content = await readFile(inputPath, "utf-8");
            const formulationOutput = deps.parser.parse(content);
            const result = deps.orchestrator.execute(formulationOutput);

            output.log(JSON.stringify(result, null, 2));

            if (!result.valid) {
                const totalErrors = result.role_results.reduce(
                    (sum, r) =>
                        sum +
                        r.policy_results.reduce(
                            (pSum, p) => pSum + p.stats.errors,
                            0,
                        ),
                    0,
                );
                const totalWarnings = result.role_results.reduce(
                    (sum, r) =>
                        sum +
                        r.policy_results.reduce(
                            (pSum, p) => pSum + p.stats.warnings,
                            0,
                        ),
                    0,
                );
                output.warn(
                    `Validation found ${totalErrors} error(s) and ${totalWarnings} warning(s)`,
                );
            }

            return result;
        },
    };
}

export function createValidateCittyCommand(deps: ValidateCommandDeps) {
    const validateCommand = createValidateCommand(deps);

    return defineCommand({
        meta: {
            name: "validate",
            description:
                "Validate candidate IAM policy documents against least-privilege rules",
        },
        args: {
            input: {
                type: "string",
                description: "Path to Phase 2 formulation output JSON file",
                required: true,
            },
        },
        async run({ args }) {
            await validateCommand.execute(args.input, {
                log: (msg) => consola.log(msg),
                warn: (msg) => consola.warn(msg),
            });
        },
    });
}
