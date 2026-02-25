import {
    type FormulationOutputInput,
    FormulationOutputSchema,
} from "./formulation-output.schema.js";

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function stripDangerousKeys(value: unknown): unknown {
    if (value === null || typeof value !== "object") {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(stripDangerousKeys);
    }
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        if (DANGEROUS_KEYS.has(key)) {
            continue;
        }
        result[key] = stripDangerousKeys(val);
    }
    return result;
}

export interface FormulationOutputParser {
    parse(content: string): FormulationOutputInput;
}

export function createFormulationOutputParser(): FormulationOutputParser {
    return {
        parse(content: string): FormulationOutputInput {
            const raw: unknown = JSON.parse(content);
            const data = stripDangerousKeys(raw);
            return FormulationOutputSchema.parse(data);
        },
    };
}
