import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defineCommand } from "citty";
import { consola } from "consola";
import type { FormulationConfig } from "../entities/formulation-config.js";
import type { SynthesisOutput } from "../entities/synthesis-output.js";
import type { ValidationOutput } from "../entities/validation-result.js";
import type { FormulationOutputInput } from "../use-cases/formulation-output.schema.js";
import type { FormulationConfigParser } from "../use-cases/parse-formulation-config.js";
import type { FormulationOutputParser } from "../use-cases/parse-formulation-output.js";
import type { TemplateVariableResolver } from "../use-cases/resolve-template-variables.js";
import type { PayloadSynthesizer } from "../use-cases/synthesize-payloads.js";
import type { ValidateAndFixOrchestrator } from "../use-cases/validate-and-fix.js";

export interface SynthesizeConsoleOutput {
    log(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}

export interface SynthesizeCommandDeps {
    readonly parser: FormulationOutputParser;
    readonly configParser: FormulationConfigParser;
    readonly orchestrator: ValidateAndFixOrchestrator;
    readonly resolver: TemplateVariableResolver;
    readonly synthesizer: PayloadSynthesizer;
}

export interface SynthesizeCommandOptions {
    readonly inputPath: string;
    readonly configPath: string;
    readonly outputPath?: string | undefined;
    readonly outputDir?: string | undefined;
}

export interface SynthesizeCommand {
    execute(
        options: SynthesizeCommandOptions,
        console: SynthesizeConsoleOutput,
    ): Promise<SynthesisOutput>;
}

function countValidationErrors(validation: ValidationOutput): number {
    return validation.role_results.reduce(
        (sum, r) =>
            sum +
            r.policy_results.reduce((pSum, p) => pSum + p.stats.errors, 0),
        0,
    );
}

function hasValidationWarnings(validation: ValidationOutput): boolean {
    return validation.role_results.some((r) =>
        r.policy_results.some((p) => p.stats.warnings > 0),
    );
}

function resolveTemplateVariables(
    deps: SynthesizeCommandDeps,
    fixedOutput: FormulationOutputInput,
    templateVariables: Readonly<Record<string, string>>,
    config: FormulationConfig,
): FormulationOutputInput {
    const serialized = JSON.stringify(fixedOutput);
    const resolution = deps.resolver.resolve(
        serialized,
        templateVariables,
        config,
    );

    if (!resolution.resolved) {
        throw new Error(
            `Missing required template variables in config: ${resolution.missingVariables.join(", ")}. Add these values to your config file.`,
        );
    }

    return deps.parser.parse(resolution.output);
}

async function writeOutput(
    synthesisResult: SynthesisOutput,
    options: SynthesizeCommandOptions,
    output: SynthesizeConsoleOutput,
): Promise<void> {
    if (options.outputDir) {
        await mkdir(options.outputDir, { recursive: true });
        for (const role of synthesisResult.roles) {
            const fileName = `${role.create_role.RoleName}.json`;
            const filePath = join(options.outputDir, fileName);
            await writeFile(
                filePath,
                JSON.stringify({ roles: [role] }, null, 2),
                "utf-8",
            );
        }
    } else if (options.outputPath) {
        await writeFile(
            options.outputPath,
            JSON.stringify(synthesisResult, null, 2),
            "utf-8",
        );
    } else {
        output.log(JSON.stringify(synthesisResult, null, 2));
    }
}

export function createSynthesizeCommand(
    deps: SynthesizeCommandDeps,
): SynthesizeCommand {
    return {
        async execute(
            options: SynthesizeCommandOptions,
            output: SynthesizeConsoleOutput,
        ): Promise<SynthesisOutput> {
            if (options.outputPath && options.outputDir) {
                throw new Error(
                    "--output and --output-dir are mutually exclusive. Use only one.",
                );
            }

            const inputContent = await readFile(options.inputPath, "utf-8");
            const formulationOutput = deps.parser.parse(inputContent);

            const { validation, fixedOutput } =
                deps.orchestrator.executeWithFixed(formulationOutput);

            if (!validation.valid) {
                output.error(JSON.stringify(validation, null, 2));
                const totalErrors = countValidationErrors(validation);
                throw new Error(
                    `Validation failed with ${totalErrors} error(s). Cannot synthesize.`,
                );
            }

            if (hasValidationWarnings(validation)) {
                output.warn(JSON.stringify(validation, null, 2));
            }

            const configContent = await readFile(options.configPath, "utf-8");
            const config = deps.configParser.parse(configContent);

            const resolvedOutput = resolveTemplateVariables(
                deps,
                fixedOutput,
                formulationOutput.template_variables,
                config,
            );

            const synthesisResult = deps.synthesizer.synthesize(
                resolvedOutput,
                config,
            );

            await writeOutput(synthesisResult, options, output);

            return synthesisResult;
        },
    };
}

export function createSynthesizeCittyCommand(deps: SynthesizeCommandDeps) {
    const synthesizeCommand = createSynthesizeCommand(deps);

    return defineCommand({
        meta: {
            name: "synthesize",
            description:
                "Transform validated IAM policies into AWS SDK v3 payloads",
        },
        args: {
            input: {
                type: "string",
                description: "Path to Phase 2 formulation output JSON file",
                required: true,
            },
            config: {
                type: "string",
                description: "Path to formulation configuration JSON file",
                required: true,
            },
            output: {
                type: "string",
                description:
                    "Path to write the full synthesized JSON output file",
                required: false,
            },
            "output-dir": {
                type: "string",
                description: "Path to a directory to write per-role JSON files",
                required: false,
            },
        },
        async run({ args }) {
            await synthesizeCommand.execute(
                {
                    inputPath: args.input,
                    configPath: args.config,
                    outputPath: args.output,
                    outputDir: args["output-dir"],
                },
                {
                    log: (msg) => consola.log(msg),
                    warn: (msg) => consola.warn(msg),
                    error: (msg) => consola.error(msg),
                },
            );
        },
    });
}
