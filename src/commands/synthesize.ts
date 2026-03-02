import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { defineCommand } from "citty";
import { consola } from "consola";
import type { FormulationConfig } from "../entities/formulation-config.js";
import { DANGEROUS_KEYS } from "../entities/sanitize-json.js";
import type { SynthesisOutput } from "../entities/synthesis-output.js";
import type { ValidationOutput } from "../entities/validation-result.js";
import type { FormulationOutputInput } from "../use-cases/formulation-output.schema.js";
import type { FormulationConfigParser } from "../use-cases/parse-formulation-config.js";
import type { FormulationOutputParser } from "../use-cases/parse-formulation-output.js";
import type { TemplateVariableResolver } from "../use-cases/resolve-template-variables.js";
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

function assertSafeObjectKey(key: string): void {
    if (DANGEROUS_KEYS.has(key)) {
        throw new Error(
            `Resolved template variable produced an unsafe object key: "${key}". ` +
                "Template variables must not resolve to special property names.",
        );
    }
}

function assertUniqueResolvedKey(
    keySources: Record<string, string>,
    resolvedKey: string,
    originalKey: string,
): void {
    if (
        Object.hasOwn(keySources, resolvedKey) &&
        keySources[resolvedKey] !== originalKey
    ) {
        throw new Error(
            `Template variable resolution produced duplicate object key "${resolvedKey}" ` +
                `from source keys "${keySources[resolvedKey]}" and "${originalKey}". ` +
                "Template variables in object property names must resolve to unique keys.",
        );
    }
}

function resolveTemplateVariables(
    deps: SynthesizeCommandDeps,
    fixedOutput: FormulationOutputInput,
    templateVariables: Readonly<Record<string, string>>,
    config: FormulationConfig,
): FormulationOutputInput {
    const missingVariables = new Set<string>();

    const resolveString = (value: string): string => {
        const resolution = deps.resolver.resolve(
            value,
            templateVariables,
            config,
        );

        if (!resolution.resolved) {
            for (const variable of resolution.missingVariables) {
                missingVariables.add(variable);
            }
            return value;
        }

        return resolution.output;
    };

    const resolveValue = (value: unknown): unknown => {
        if (typeof value === "string") {
            return resolveString(value);
        }

        if (Array.isArray(value)) {
            return value.map((item) => resolveValue(item));
        }

        if (value !== null && typeof value === "object") {
            const result: Record<string, unknown> = Object.create(null);
            const keySources: Record<string, string> = Object.create(null);

            for (const [key, val] of Object.entries(value)) {
                const resolvedKey = resolveString(key);
                assertSafeObjectKey(resolvedKey);
                assertUniqueResolvedKey(keySources, resolvedKey, key);
                keySources[resolvedKey] = key;
                result[resolvedKey] = resolveValue(val);
            }

            return result;
        }

        return value;
    };

    const resolvedOutput = resolveValue(fixedOutput) as FormulationOutputInput;

    if (missingVariables.size > 0) {
        throw new Error(
            `Missing required template variables: ${Array.from(missingVariables).join(", ")}. Provide values for these variables in your formulation config or in the 'template_variables' of your formulation output.`,
        );
    }

    const serialized = JSON.stringify(resolvedOutput);
    return deps.parser.parse(serialized);
}

async function writeOutput(
    synthesisResult: SynthesisOutput,
    options: SynthesizeCommandOptions,
    output: SynthesizeConsoleOutput,
): Promise<void> {
    if (options.outputDir) {
        const seen = new Set<string>();
        for (const role of synthesisResult.roles) {
            const name = role.create_role.RoleName;
            if (seen.has(name)) {
                throw new Error(
                    `Duplicate role name detected: "${name}". Role names must be unique.`,
                );
            }
            seen.add(name);
        }
        await mkdir(options.outputDir, { recursive: true });
        for (const role of synthesisResult.roles) {
            const fileName = `${basename(role.create_role.RoleName)}.json`;
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
