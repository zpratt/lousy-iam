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
            const data: unknown = JSON.parse(content);
            return FormulationOutputSchema.parse(data);
        },
    };
}
