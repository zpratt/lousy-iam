import { stripDangerousKeys } from "../entities/sanitize-json.js";
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
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);
                throw new Error(
                    `Invalid JSON: action inventory file is not valid JSON (${message})`,
                );
            }

            return ActionInventoryInputSchema.parse(
                stripDangerousKeys(rawData),
            );
        },
    };
}
