import { readFile } from "node:fs/promises";
import { defineCommand } from "citty";
import { consola } from "consola";
import type { FormulationConfig } from "../entities/formulation-config.js";
import type { FormulationOutput } from "../entities/policy-document.js";
import { DANGEROUS_KEYS } from "../entities/sanitize-json.js";
import type { PolicyFormulator } from "../use-cases/formulate-policies.js";
import type { ActionInventoryParser } from "../use-cases/parse-action-inventory.js";
import type { FormulationConfigParser } from "../use-cases/parse-formulation-config.js";
import type { TemplateVariableResolver } from "../use-cases/resolve-template-variables.js";

export interface ConsoleOutput {
    log(message: string): void;
    warn(message: string): void;
}

export interface FormulateCommandDeps {
    readonly configParser: FormulationConfigParser;
    readonly inventoryParser: ActionInventoryParser;
    readonly formulator: PolicyFormulator;
    readonly resolver: TemplateVariableResolver;
}

export interface FormulateCommand {
    execute(
        inputPath: string,
        configPath: string,
        console: ConsoleOutput,
    ): Promise<FormulationOutput>;
}

function assertSafeObjectKey(key: string): void {
    if (DANGEROUS_KEYS.has(key)) {
        throw new Error(
            `Resolved template variable produced an unsafe object key: "${key}". ` +
                "Template variables must not resolve to special property names.",
        );
    }
}

function resolveFormulationOutput(
    resolver: TemplateVariableResolver,
    result: FormulationOutput,
    config: FormulationConfig,
):
    | { resolved: true; output: FormulationOutput }
    | { resolved: false; missingVariables: string[] } {
    const missingVariables = new Set<string>();

    const resolveString = (value: string): string => {
        const resolution = resolver.resolve(
            value,
            result.template_variables,
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
            const obj: Record<string, unknown> = Object.create(null);
            for (const [key, val] of Object.entries(value)) {
                const resolvedKey = resolveString(key);
                assertSafeObjectKey(resolvedKey);
                obj[resolvedKey] = resolveValue(val);
            }
            return obj;
        }
        return value;
    };

    const resolvedOutput = resolveValue(result) as FormulationOutput;

    if (missingVariables.size > 0) {
        return { resolved: false, missingVariables: [...missingVariables] };
    }

    return { resolved: true, output: resolvedOutput };
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

            const resolution = resolveFormulationOutput(
                deps.resolver,
                result,
                config,
            );

            if (!resolution.resolved) {
                output.warn(
                    `Unresolved template variables: ${resolution.missingVariables.join(", ")}`,
                );
                output.log(JSON.stringify(result, null, 2));
                return result;
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
