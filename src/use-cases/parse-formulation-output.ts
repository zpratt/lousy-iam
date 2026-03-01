import { stripDangerousKeys } from "../entities/sanitize-json.js";
import {
    type FormulationOutputInput,
    FormulationOutputSchema,
} from "./formulation-output.schema.js";

export interface FormulationOutputParser {
    parse(content: string): FormulationOutputInput;
}

export function createFormulationOutputParser(): FormulationOutputParser {
    return {
        parse(content: string): FormulationOutputInput {
            let raw: unknown;
            try {
                raw = JSON.parse(content);
            } catch {
                throw new Error(
                    "Invalid JSON: formulation output is not valid JSON",
                );
            }

            let data: unknown;
            try {
                data = stripDangerousKeys(raw);
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);
                throw new Error(
                    `Invalid JSON: formulation output could not be sanitized (${message})`,
                );
            }

            return FormulationOutputSchema.parse(data);
        },
    };
}
