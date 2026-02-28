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

function buildActionEntry(
    action: string,
    resourceArn: string,
    category: ActionCategory,
    resourceChange: ResourceChange,
): InfrastructureActionEntry {
    return {
        action,
        resource: resourceArn,
        purpose: `${category} for ${resourceChange.type}`,
        sourceResource: [resourceChange.address],
        planAction: resourceChange.change.actions,
        category,
    };
}

interface ClassificationContext {
    readonly planAndApply: InfrastructureActionEntry[];
    readonly applyOnly: InfrastructureActionEntry[];
    readonly seenPlanAndApply: Set<string>;
    readonly seenApplyOnly: Set<string>;
}

function classifyAction(
    action: string,
    resourceArn: string,
    category: ActionCategory,
    resourceChange: ResourceChange,
    ctx: ClassificationContext,
): void {
    const dedupeKey = `${action}|${resourceArn}`;

    if (READ_CATEGORIES.has(category) && !ctx.seenPlanAndApply.has(dedupeKey)) {
        ctx.planAndApply.push(
            buildActionEntry(action, resourceArn, category, resourceChange),
        );
        ctx.seenPlanAndApply.add(dedupeKey);
    } else if (
        WRITE_CATEGORIES.has(category) &&
        !ctx.seenApplyOnly.has(dedupeKey)
    ) {
        ctx.applyOnly.push(
            buildActionEntry(action, resourceArn, category, resourceChange),
        );
        ctx.seenApplyOnly.add(dedupeKey);
    }
}

function classifyActions(
    entry: { readonly actions: Record<ActionCategory, readonly string[]> },
    categories: readonly ActionCategory[],
    resourceChange: ResourceChange,
): MappedResourceActions {
    const ctx: ClassificationContext = {
        planAndApply: [],
        applyOnly: [],
        seenPlanAndApply: new Set<string>(),
        seenApplyOnly: new Set<string>(),
    };

    for (const category of categories) {
        const actions = entry.actions[category];
        for (const action of actions) {
            classifyAction(action, "*", category, resourceChange, ctx);
        }
    }

    return {
        planAndApply: ctx.planAndApply,
        applyOnly: ctx.applyOnly,
        unknownType: false,
    };
}

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
            return classifyActions(entry, categories, resourceChange);
        },
    };
}
