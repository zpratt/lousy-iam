import {
    type ActionInventoryInput,
    ActionInventoryInputSchema,
} from "./action-inventory.schema.js";

export interface ActionInventoryParser {
    parse(jsonString: string): ActionInventoryInput;
}

export function createActionInventoryParser(): ActionInventoryParser {
    return {
        parse(jsonString: string): ActionInventoryInput {
            let rawData: unknown;
            try {
                rawData = JSON.parse(jsonString);
            } catch {
                throw new Error(
                    "Invalid JSON: action inventory file is not valid JSON",
                );
            }

            return ActionInventoryInputSchema.parse(rawData);
        },
    };
}
