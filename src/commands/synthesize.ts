import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defineCommand } from "citty";
import { consola } from "consola";
import type { FormulationConfig } from "../entities/formulation-config.js";
import type { SynthesisOutput } from "../entities/synthesis-output.js";
import {
    countValidationErrors,
    hasValidationWarnings,
} from "../lib/validation-output.js";
import type { FormulationOutputInput } from "../use-cases/formulation-output.schema.js";
import type { FormulationConfigParser } from "../use-cases/parse-formulation-config.js";
import type { FormulationOutputParser } from "../use-cases/parse-formulation-output.js";
import type { OutputVariableResolver } from "../use-cases/resolve-output-variables.js";
import { SynthesisOutputSchema } from "../use-cases/synthesis-output.schema.js";
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
    readonly outputResolver: OutputVariableResolver;
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

function resolveTemplateVariables(
    deps: SynthesizeCommandDeps,
    fixedOutput: FormulationOutputInput,
    templateVariables: Readonly<Record<string, string>>,
    config: FormulationConfig,
): FormulationOutputInput {
    const resolution = deps.outputResolver.resolve(
        fixedOutput,
        templateVariables,
        config,
    );

    if (!resolution.resolved) {
        throw new Error(
            `Missing required template variables: ${resolution.missingVariables.join(", ")}. Provide values for these variables in your formulation config or in the 'template_variables' of your formulation output.`,
        );
    }

    const serialized = JSON.stringify(resolution.output);
    return deps.parser.parse(serialized);
}

function assertUniqueRoleNames(synthesisResult: SynthesisOutput): void {
    const seen = new Set<string>();
    for (const role of synthesisResult.roles) {
        const roleName = role.create_role.RoleName;
        if (seen.has(roleName)) {
            throw new Error(
                `Duplicate role name detected: "${roleName}". Role names must be unique.`,
            );
        }
        seen.add(roleName);
    }
}

async function writeOutput(
    synthesisResult: SynthesisOutput,
    options: SynthesizeCommandOptions,
    output: SynthesizeConsoleOutput,
): Promise<void> {
    if (options.outputDir) {
        assertUniqueRoleNames(synthesisResult);
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

            SynthesisOutputSchema.parse(synthesisResult);

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
