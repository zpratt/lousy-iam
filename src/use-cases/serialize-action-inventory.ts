import type {
    ActionEntry,
    ActionInventory,
    InfrastructureActionEntry,
} from "../entities/action-inventory.js";

export interface ActionInventorySerializer {
    serialize(inventory: ActionInventory): string;
}

function toSnakeCaseAction(entry: ActionEntry) {
    return {
        action: entry.action,
        resource: entry.resource,
        purpose: entry.purpose,
        category: entry.category,
    };
}

function toSnakeCaseInfraAction(entry: InfrastructureActionEntry) {
    return {
        action: entry.action,
        resource: entry.resource,
        purpose: entry.purpose,
        category: entry.category,
        source_resource: entry.sourceResource,
        plan_action: entry.planAction,
    };
}

export function createActionInventorySerializer(): ActionInventorySerializer {
    return {
        serialize(inventory: ActionInventory): string {
            const output = {
                metadata: {
                    iac_tool: inventory.metadata.iacTool,
                    iac_version: inventory.metadata.iacVersion,
                    format_version: inventory.metadata.formatVersion,
                },
                toolchain_actions: {
                    plan_and_apply:
                        inventory.toolchainActions.planAndApply.map(
                            toSnakeCaseAction,
                        ),
                    apply_only:
                        inventory.toolchainActions.applyOnly.map(
                            toSnakeCaseAction,
                        ),
                },
                infrastructure_actions: {
                    plan_and_apply:
                        inventory.infrastructureActions.planAndApply.map(
                            toSnakeCaseInfraAction,
                        ),
                    apply_only: inventory.infrastructureActions.applyOnly.map(
                        toSnakeCaseInfraAction,
                    ),
                },
            };

            return JSON.stringify(output, null, 2);
        },
    };
}
