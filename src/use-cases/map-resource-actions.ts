import type { InfrastructureActionEntry } from "../entities/action-inventory.js";
import {
    type ActionCategory,
    categorizeActions,
} from "../entities/resource-actions.js";
import type { ResourceChange } from "../entities/terraform-plan.js";
import type { ActionMappingDb } from "./action-mapping-db.port.js";

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
            const seenPlanAndApply = new Set<string>();
            const seenApplyOnly = new Set<string>();

            const planActions = resourceChange.change.actions;

            for (const category of categories) {
                const actions = entry.actions[category];

                for (const action of actions) {
                    // Phase 1: resource ARN is always "*" (wildcard). Resource-level
                    // ARN scoping is deferred to a future phase.
                    const resourceArn = "*";
                    const dedupeKey = `${action}|${resourceArn}`;

                    if (READ_CATEGORIES.has(category)) {
                        if (!seenPlanAndApply.has(dedupeKey)) {
                            planAndApply.push({
                                action,
                                resource: resourceArn,
                                purpose: `${category} for ${resourceChange.type}`,
                                sourceResource: resourceChange.address,
                                planAction: planActions,
                                category,
                            });
                            seenPlanAndApply.add(dedupeKey);
                        }
                    } else if (WRITE_CATEGORIES.has(category)) {
                        if (!seenApplyOnly.has(dedupeKey)) {
                            applyOnly.push({
                                action,
                                resource: resourceArn,
                                purpose: `${category} for ${resourceChange.type}`,
                                sourceResource: resourceChange.address,
                                planAction: planActions,
                                category,
                            });
                            seenApplyOnly.add(dedupeKey);
                        }
                    }
                }
            }

            return { planAndApply, applyOnly, unknownType: false };
        },
    };
}
