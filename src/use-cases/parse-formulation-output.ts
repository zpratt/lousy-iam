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
            const raw: unknown = JSON.parse(content);
            const data = stripDangerousKeys(raw);
            return FormulationOutputSchema.parse(data);
        },
    };
}
