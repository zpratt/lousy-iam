import type { FormulationConfig } from "../entities/formulation-config.js";

const AWS_ACCOUNT_ID_PATTERN = /^\d{12}$/;
const AWS_REGION_PATTERN = /^[a-z]{2}(-[a-z]+)+-\d+$/;

const VALUE_VALIDATORS: Record<string, RegExp> = {
    account_id: AWS_ACCOUNT_ID_PATTERN,
    region: AWS_REGION_PATTERN,
};

function isResolvedValue(key: string, value: string): boolean {
    if (key === "region" && value === "*") {
        return true;
    }
    const pattern = VALUE_VALIDATORS[key];
    if (pattern) {
        return pattern.test(value);
    }
    return false;
}

const CONFIG_KEY_MAP: Record<string, keyof FormulationConfig> = {
    account_id: "accountId",
    region: "region",
};

function getConfigValue(
    config: FormulationConfig,
    variableKey: string,
): string | null {
    const configKey = CONFIG_KEY_MAP[variableKey];
    if (!configKey) {
        return null;
    }
    const value = config[configKey];
    if (typeof value === "string") {
        return value;
    }
    return null;
}

export interface TemplateResolutionResult {
    readonly resolved: true;
    readonly output: string;
}

export interface TemplateResolutionError {
    readonly resolved: false;
    readonly missingVariables: readonly string[];
}

export type TemplateResolutionOutcome =
    | TemplateResolutionResult
    | TemplateResolutionError;

export interface TemplateVariableResolver {
    resolve(
        input: string,
        templateVariables: Readonly<Record<string, string>>,
        config: FormulationConfig,
    ): TemplateResolutionOutcome;
}

function buildResolutionMap(
    input: string,
    templateVariables: Readonly<Record<string, string>>,
    config: FormulationConfig,
): { map: Map<string, string>; missing: string[] } {
    const map = new Map<string, string>();
    const missing: string[] = [];

    for (const [key, templateValue] of Object.entries(templateVariables)) {
        const placeholder = `\${${key}}`;
        if (!input.includes(placeholder)) {
            continue;
        }

        const configValue = getConfigValue(config, key);

        if (configValue) {
            map.set(key, configValue);
        } else if (isResolvedValue(key, templateValue)) {
            map.set(key, templateValue);
        } else {
            missing.push(key);
        }
    }

    return { map, missing };
}

function applyReplacements(
    input: string,
    resolutionMap: Map<string, string>,
): string {
    let output = input;
    for (const [key, value] of resolutionMap) {
        const placeholder = `\${${key}}`;
        while (output.includes(placeholder)) {
            output = output.replace(placeholder, value);
        }
    }
    return output;
}

export function createTemplateVariableResolver(): TemplateVariableResolver {
    return {
        resolve(
            input: string,
            templateVariables: Readonly<Record<string, string>>,
            config: FormulationConfig,
        ): TemplateResolutionOutcome {
            const { map, missing } = buildResolutionMap(
                input,
                templateVariables,
                config,
            );

            if (missing.length > 0) {
                return { resolved: false, missingVariables: missing };
            }

            return { resolved: true, output: applyReplacements(input, map) };
        },
    };
}
