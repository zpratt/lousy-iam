import type { InfrastructureActionEntry } from "../entities/action-inventory.js";
import {
    type ActionCategory,
    categorizeActions,
} from "../entities/resource-actions.js";
import type { ResourceChange } from "../entities/terraform-plan.js";
import type { ActionMappingDb } from "../gateways/action-mapping-db.js";

export interface MappedResourceActions {
    readonly planAndApply: readonly InfrastructureActionEntry[];
    readonly applyOnly: readonly InfrastructureActionEntry[];
    readonly unknownType: boolean;
}

export interface ResourceActionMapper {
    mapActions(resourceChange: ResourceChange): MappedResourceActions;
}

const READ_CATEGORIES: ReadonlySet<ActionCategory> = new Set(["read"]);
const WRITE_CATEGORIES: ReadonlySet<ActionCategory> = new Set([
    "create",
    "update",
    "delete",
    "tag",
]);

export function createResourceActionMapper(
    db: ActionMappingDb,
): ResourceActionMapper {
    return {
        mapActions(resourceChange: ResourceChange): MappedResourceActions {
            const entry = db.lookupByTerraformType(resourceChange.type);

            if (!entry) {
                return {
                    planAndApply: [],
                    applyOnly: [],
                    unknownType: true,
                };
            }

            const categories = categorizeActions(resourceChange.change.actions);

            const planAndApply: InfrastructureActionEntry[] = [];
            const applyOnly: InfrastructureActionEntry[] = [];

            for (const category of categories) {
                const actions = entry.actions[category];
                const planActionStr = resourceChange.change.actions.join(",");

                for (const action of actions) {
                    const actionEntry: InfrastructureActionEntry = {
                        action,
                        resource: "*",
                        purpose: `${category} for ${resourceChange.type}`,
                        sourceResource: resourceChange.address,
                        planAction: planActionStr,
                        category,
                    };

                    if (READ_CATEGORIES.has(category)) {
                        planAndApply.push(actionEntry);
                    } else if (WRITE_CATEGORIES.has(category)) {
                        applyOnly.push(actionEntry);
                    }
                }
            }

            return { planAndApply, applyOnly, unknownType: false };
        },
    };
}
