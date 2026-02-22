import type { ResourceActionEntry } from "../entities/resource-actions.js";

export interface ActionMappingDb {
    lookupByTerraformType(
        terraformType: string,
    ): ResourceActionEntry | undefined;
}
