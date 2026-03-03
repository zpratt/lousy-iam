import type { FormulationConfig } from "../entities/formulation-config.js";
import { DANGEROUS_KEYS } from "../entities/sanitize-json.js";
import type { TemplateVariableResolver } from "./resolve-template-variables.js";

export interface OutputResolutionSuccess<T> {
    readonly resolved: true;
    readonly output: T;
}

export interface OutputResolutionFailure {
    readonly resolved: false;
    readonly missingVariables: readonly string[];
}

export type OutputResolutionOutcome<T> =
    | OutputResolutionSuccess<T>
    | OutputResolutionFailure;

export interface OutputVariableResolver {
    resolve<T>(
        input: T,
        templateVariables: Readonly<Record<string, string>>,
        config: FormulationConfig,
    ): OutputResolutionOutcome<T>;
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

function resolveObject(
    value: Record<string, unknown>,
    resolveString: (value: string) => string,
    resolveValue: (value: unknown) => unknown,
): Record<string, unknown> {
    // Object.create(null) prevents prototype pollution via resolved keys
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

export function createOutputVariableResolver(
    resolver: TemplateVariableResolver,
): OutputVariableResolver {
    return {
        resolve<T>(
            input: T,
            templateVariables: Readonly<Record<string, string>>,
            config: FormulationConfig,
        ): OutputResolutionOutcome<T> {
            const missingVariables = new Set<string>();

            const resolveString = (value: string): string => {
                const resolution = resolver.resolve(
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
                    return resolveObject(
                        value as Record<string, unknown>,
                        resolveString,
                        resolveValue,
                    );
                }
                return value;
            };

            const resolvedOutput = resolveValue(input) as T;

            if (missingVariables.size > 0) {
                return {
                    resolved: false,
                    missingVariables: [...missingVariables],
                };
            }

            return { resolved: true, output: resolvedOutput };
        },
    };
}
