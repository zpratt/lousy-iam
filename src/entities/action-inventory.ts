import type { PlanAction } from "./terraform-plan.js";

export interface ActionEntry {
    readonly action: string;
    readonly resource: string;
    readonly purpose: string;
    readonly category: string;
}

export interface InfrastructureActionEntry extends ActionEntry {
    readonly sourceResource: readonly string[];
    readonly planAction: readonly PlanAction[];
}

export interface ActionInventoryMetadata {
    readonly iacTool: string;
    readonly iacVersion: string;
    readonly formatVersion: string;
}

export interface RoleActions<T extends ActionEntry> {
    readonly planAndApply: readonly T[];
    readonly applyOnly: readonly T[];
}

export interface ActionInventory {
    readonly metadata: ActionInventoryMetadata;
    readonly toolchainActions: RoleActions<ActionEntry>;
    readonly infrastructureActions: RoleActions<InfrastructureActionEntry>;
}
