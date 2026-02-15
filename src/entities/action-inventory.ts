export interface ActionEntry {
    readonly action: string;
    readonly resource: string;
    readonly purpose: string;
    readonly category: string;
}

export interface InfrastructureActionEntry extends ActionEntry {
    readonly sourceResource: string;
    readonly planAction: string;
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
